"""Read-only stage probes: one stage, one element, zero database writes."""

import json
from typing import Any

from rich import box
from rich.console import Group
from rich.rule import Rule
from rich.table import Table
from rich.text import Text
from textual import on
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.widgets import Button, Input, Label, Select, Static, TextArea
from textual.worker import Worker, WorkerCancelled

from athar_dataops.config import Settings
from athar_dataops.schemas.preparation import PreparationReply
from athar_dataops.services.artifacts import ArtifactService
from athar_dataops.services.groq import GroqPreparationClient
from athar_dataops.services.registry import RegistryService
from athar_dataops.themes import DARK, LIGHT, themed_json
from athar_dataops.ui.arabic import format_arabic, format_arabic_obj


class CheckpointsPane(VerticalScroll):
    """Small checkpoints for testing each stage on a single element."""

    can_focus = True

    def __init__(
        self,
        config: Settings,
        artifact: ArtifactService | None = None,
        registry: RegistryService | None = None,
        groq: GroqPreparationClient | None = None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self._config = config
        self._artifact = artifact
        self._registry = registry or RegistryService()
        self._groq = groq
        self._profile_names = [profile.name for profile in config.groq_profiles]
        self._worker: Worker | None = None
        self.busy = False
        self._registry_result: dict[str, Any] | None = None
        self._prepare_reply: PreparationReply | None = None

    def compose(self) -> ComposeResult:
        with Horizontal(id="checkpoint-header"):
            with Vertical(id="checkpoint-header-title"):
                yield Label("Stage checkpoints", classes="heading")
                yield Static(
                    "Probe one stage on one element — nothing is written to the database.",
                    id="checkpoint-subtitle",
                    classes="muted",
                )
            status = Static("Ready", id="checkpoint-status", markup=False)
            status.set_classes("chip")
            yield status
            cancel = Button("Cancel", id="checkpoint-cancel", disabled=True)
            cancel.display = False
            yield cancel

        with Vertical(classes="probe-card", id="checkpoint-registry"):
            with Horizontal(classes="card-head"):
                yield Label("Record probe", classes="section-label")
                chip = Static("", id="checkpoint-registry-chip", markup=False)
                chip.set_classes("chip")
                chip.display = False
                yield chip
            yield Static(
                "Fetch, hash, parse and normalize a single row, exactly as Collect would.",
                classes="muted",
            )
            with Horizontal(classes="probe-actions"):
                yield Input("1", id="checkpoint-row", placeholder="row number")
                yield Button(
                    "Fetch & normalize 1 record",
                    id="checkpoint-fetch",
                    variant="primary",
                    disabled=self._artifact is None,
                )
            yield Static("", id="checkpoint-registry-output", markup=False)

        with Vertical(classes="probe-card", id="checkpoint-prepare-card"):
            with Horizontal(classes="card-head"):
                yield Label("Prepare probe", classes="section-label")
                chip = Static("", id="checkpoint-prepare-chip", markup=False)
                chip.set_classes("chip")
                chip.display = False
                yield chip
            yield Static(
                "Send exactly one prompt for one description; no cache, quota, or writes.",
                classes="muted",
            )
            with Vertical(id="checkpoint-profile-pick"):
                if len(self._profile_names) > 8:
                    yield Input(
                        placeholder="Filter profiles…",
                        id="checkpoint-profile-filter",
                    )
                select_kwargs: dict[str, Any] = {
                    "id": "checkpoint-profile",
                    "prompt": "No profiles configured",
                    "disabled": not self._profile_names,
                }
                if self._profile_names:
                    select_kwargs["value"] = self._profile_names[0]
                yield Select(
                    [(name, name) for name in self._profile_names],
                    **select_kwargs,
                )
            yield TextArea(
                placeholder="Paste one description…",
                id="checkpoint-desc",
                soft_wrap=True,
            )
            with Horizontal(classes="probe-actions"):
                yield Button(
                    "Prepare once",
                    id="checkpoint-prepare",
                    variant="primary",
                    disabled=self._groq is None or not self._profile_names,
                )
            yield Static("", id="checkpoint-prepare-output", markup=False)

    @on(Input.Changed, "#checkpoint-profile-filter")
    def filter_profiles(self, event: Input.Changed) -> None:
        query = event.value.strip().lower()
        matches = [name for name in self._profile_names if query in name.lower()]
        select = self.query_one("#checkpoint-profile", Select)
        select.set_options([(name, name) for name in matches])
        if matches:
            select.value = matches[0]

    @on(Button.Pressed, "#checkpoint-fetch")
    def start_fetch(self) -> None:
        self._launch(self._run_fetch())

    @on(Button.Pressed, "#checkpoint-prepare")
    def start_prepare(self) -> None:
        self._launch(self._run_prepare())

    @on(Button.Pressed, "#checkpoint-cancel")
    def cancel(self) -> None:
        if self._worker is not None and not self._worker.is_cancelled:
            self._worker.cancel()

    def _launch(self, coroutine) -> None:
        if self.busy:
            return
        self.query_one("#checkpoint-registry-output", Static).update("")
        self.query_one("#checkpoint-prepare-output", Static).update("")
        self._card_chip("registry", "")
        self._card_chip("prepare", "")
        self._set_busy(True)
        self._set_status("Connecting…")
        self._worker = self.run_worker(
            coroutine, group="checkpoint", exit_on_error=False
        )

    def _set_busy(self, busy: bool) -> None:
        self.busy = busy
        self.query_one("#checkpoint-fetch", Button).disabled = (
            busy or self._artifact is None
        )
        self.query_one("#checkpoint-prepare", Button).disabled = (
            busy or self._groq is None or not self._profile_names
        )
        cancel = self.query_one("#checkpoint-cancel", Button)
        cancel.disabled = not busy
        cancel.display = busy
        for card_id in ("#checkpoint-registry", "#checkpoint-prepare-card"):
            card = self.query_one(card_id)
            if busy:
                card.add_class("-busy")
            else:
                card.remove_class("-busy")

    def _card_chip(self, card: str, text: str, state: str = "") -> None:
        chip = self.query_one(f"#checkpoint-{card}-chip", Static)
        chip.update(text)
        chip.set_classes(f"chip {state}" if state else "chip")
        chip.display = bool(text)

    async def _run_fetch(self) -> None:
        try:
            await self._fetch()
        except WorkerCancelled:
            self._set_status("Checkpoint cancelled.", "warning")
        finally:
            self._clear_busy()

    async def _fetch(self) -> None:
        try:
            snapshot = await self._artifact.fetch()
            rows = json.loads(snapshot.raw_content)
            if not isinstance(rows, list):
                raise ValueError("Registry response must be a JSON array")
            raw_index = (self.query_one("#checkpoint-row", Input).value or "1").strip()
            try:
                requested = int(raw_index)
            except ValueError:
                raise ValueError("Row number must be an integer") from None
            if not 1 <= requested <= len(rows):
                raise ValueError(f"Row {requested} out of range (1–{len(rows)})")
            record = self._registry.normalize_row(requested, rows[requested - 1])
        except Exception as exc:
            self._set_status(f"Registry checkpoint failed: {exc}", "error")
            self._card_chip("registry", "failed", "error")
            return
        self._registry_result = {
            "url": snapshot.source_url,
            "content_hash": snapshot.content_hash,
            "total_rows": len(rows),
            "requested": requested,
            "record": record,
            "raw": rows[requested - 1],
        }
        self._render_fetch(self._registry_result)
        self._set_status(
            f"Fetched + normalized row {requested} of {len(rows)} · no database writes",
            "success",
        )
        self._card_chip("registry", f"row {requested} of {len(rows)}", "success")

    def _render_fetch(self, result: dict[str, Any]) -> None:
        is_dark = self._is_dark()
        pal = DARK if is_dark else LIGHT
        pri = pal.primary
        record = result["record"]

        summary = Table(box=box.ROUNDED, expand=True, show_header=False)
        summary.add_column("Property", style=f"bold {pri}", width=18)
        summary.add_column("Value", overflow="fold")
        summary.add_row("Source", result["url"])
        summary.add_row("Content hash", result["content_hash"])
        summary.add_row("Total rows", str(result["total_rows"]))
        summary.add_row("Requested row", str(result["requested"]))

        fields = Table(
            box=box.ROUNDED,
            expand=True,
            show_header=True,
            header_style=f"bold {pri}",
        )
        fields.add_column("Field", style=f"bold {pri}", width=18)
        fields.add_column("Value", overflow="fold")
        fields.add_row("Name", format_arabic(record.name or "Unnamed"))
        fields.add_row("Website", record.website or "Not listed")
        fields.add_row("Domain", record.domain or "Not listed")
        fields.add_row(
            "Founded",
            str(record.creation_year) if record.creation_year else "Not listed",
        )
        fields.add_row("Cohort", record.cohort_label or "Not listed")
        fields.add_row(
            "Founders", format_arabic(", ".join(record.founders) or "Not listed")
        )
        fields.add_row(
            "Description", format_arabic(record.description or "Not provided")
        )

        findings = Table(
            box=box.ROUNDED,
            expand=True,
            show_header=True,
            header_style=f"bold {pri}",
        )
        findings.add_column("Category", style=f"bold {pri}", width=14)
        findings.add_column("Code")
        findings.add_column("Message", overflow="fold")
        if record.review_reasons:
            for issue in record.issues:
                findings.add_row(issue.category, issue.code, issue.message)
        else:
            findings.add_row("clean", "—", "No findings")

        rule = Rule(style=pal.variables["control-line"])
        self.query_one("#checkpoint-registry-output", Static).update(
            Group(
                summary,
                rule,
                Text("Normalized record", style=f"bold {pri}"),
                fields,
                rule,
                Text("Review findings", style=f"bold {pri}"),
                findings,
                rule,
                Text("Raw source row", style=f"bold {pri}"),
                themed_json(format_arabic_obj(result["raw"]), dark=is_dark),
            )
        )

    async def _run_prepare(self) -> None:
        try:
            await self._prepare()
        except WorkerCancelled:
            self._set_status("Checkpoint cancelled.", "warning")
        finally:
            self._clear_busy()

    async def _prepare(self) -> None:
        profile = str(self.query_one("#checkpoint-profile", Select).value or "")
        description = (
            self.query_one("#checkpoint-desc", TextArea).text or ""
        ).strip()
        if not profile:
            self._set_status("Choose a Groq profile first.", "warning")
            return
        if not description:
            self._set_status("Paste a description first.", "warning")
            return
        self._set_status("Sending exactly one prompt…")
        try:
            reply = await self._groq.prepare(profile, description)
        except Exception as exc:
            self._set_status(f"Preparation checkpoint failed: {exc}", "error")
            self._card_chip("prepare", "failed", "error")
            return
        self._prepare_reply = reply
        self._render_prepare(reply)
        if reply.error:
            self._set_status(
                f"{reply.error} · stop={reply.stop}",
                "error" if reply.stop else "warning",
            )
            self._card_chip(
                "prepare", "rejected", "error" if reply.stop else "warning"
            )
        else:
            self._set_status(
                "Reply validated · one prompt only · no cache, quota, or DB writes",
                "success",
            )
            self._card_chip("prepare", "validated", "success")

    def _render_prepare(self, reply: PreparationReply) -> None:
        is_dark = self._is_dark()
        pal = DARK if is_dark else LIGHT
        pri = pal.primary
        status = self._groq.status_for(reply.profile or "") if self._groq else None

        meta = Table(box=box.ROUNDED, expand=True, show_header=False)
        meta.add_column("Property", style=f"bold {pri}", width=18)
        meta.add_column("Value", overflow="fold")
        meta.add_row("Profile", reply.profile or "—")
        meta.add_row("Model", status.model if status else "—")
        meta.add_row("Key fingerprint", status.fingerprint if status else "—")
        meta.add_row("Input tokens", str(reply.input_tokens))
        meta.add_row("Output tokens", str(reply.output_tokens))
        meta.add_row("Request id", reply.request_id or "—")

        rule = Rule(style=pal.variables["control-line"])
        if reply.error:
            detail = Table(box=box.ROUNDED, expand=True, show_header=False)
            detail.add_column("Property", style=f"bold {pri}", width=18)
            detail.add_column("Value", overflow="fold")
            detail.add_row("Error", reply.error)
            detail.add_row("Stop flag", str(reply.stop))
            detail.add_row("Limit hint", reply.limit_hint or "—")
            self.query_one("#checkpoint-prepare-output", Static).update(
                Group(
                    Text("Provider reply", style=f"bold {pri}"),
                    meta,
                    rule,
                    Text("Result", style=f"bold {pri}"),
                    detail,
                )
            )
            return

        output = reply.output
        result = Table(
            box=box.ROUNDED,
            expand=True,
            show_header=True,
            header_style=f"bold {pri}",
        )
        result.add_column("Field", style=f"bold {pri}", width=18)
        result.add_column("Value", overflow="fold")
        result.add_row("Detected language", output.detected_language)
        result.add_row("Cleaned text", format_arabic(output.cleaned_text))
        result.add_row(
            "English translation",
            format_arabic(output.english_translation or "Already English"),
        )
        result.add_row(
            "Flagged fluff",
            format_arabic("\n".join(output.fluff_excerpts) or "None"),
        )
        self.query_one("#checkpoint-prepare-output", Static).update(
            Group(
                Text("Strict JSON reply", style=f"bold {pri}"),
                result,
                rule,
                Text("Provider meta", style=f"bold {pri}"),
                meta,
                rule,
                Text("Validated output", style=f"bold {pri}"),
                themed_json(format_arabic_obj(output.model_dump()), dark=is_dark),
            )
        )

    def _clear_busy(self) -> None:
        try:
            self._set_busy(False)
        except Exception:
            self.busy = False

    def on_theme_changed(self) -> None:
        if self._registry_result is not None:
            self._render_fetch(self._registry_result)
        if self._prepare_reply is not None:
            self._render_prepare(self._prepare_reply)

    def _is_dark(self) -> bool:
        try:
            return getattr(self.app, "theme", "athar-dark") != "athar-light"
        except Exception:
            return True

    def _set_status(self, text: str, state: str = "") -> None:
        status = self.query_one("#checkpoint-status", Static)
        status.update(text)
        status.set_classes(f"chip {state}" if state else "chip")