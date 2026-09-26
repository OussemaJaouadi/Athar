"""Company details first; original evidence and identifiers expand on demand."""

import asyncio
from contextlib import suppress
from typing import ClassVar

import turso
from rich import box
from rich.markup import escape
from rich.table import Table
from rich.text import Text
from textual import on
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.css.query import NoMatches
from textual.widgets import (
    Button,
    Collapsible,
    Input,
    Label,
    ListItem,
    ListView,
    Static,
)

from athar_dataops.schemas.registry import RecordDetail
from athar_dataops.services.database import DatabaseService
from athar_dataops.themes import DARK, LIGHT, themed_json
from athar_dataops.ui.arabic import format_arabic, format_arabic_obj
from athar_dataops.ui.widgets.badges import review_badge, review_chip


class InspectPane(Vertical):
    BINDINGS: ClassVar[list[Binding]] = [
        Binding("slash", "focus_search", "Search", show=False),
        Binding("s", "toggle_source", "Source", show=False),
        Binding("e", "toggle_source", "Evidence", show=False),
        Binding("p", "prev_page", "Prev Page", show=False, priority=False),
        Binding("n", "next_page", "Next Page", show=False, priority=False),
        Binding("ctrl+left", "prev_page", "Prev Page", show=False, priority=True),
        Binding("ctrl+right", "next_page", "Next Page", show=False, priority=True),
        Binding("ctrl+p", "prev_page", "Prev Page", show=False, priority=True),
        Binding("ctrl+n", "next_page", "Next Page", show=False, priority=True),
        Binding("pageup", "prev_page", "Prev Page", show=False, priority=False),
        Binding("pagedown", "next_page", "Next Page", show=False, priority=False),
    ]

    def __init__(self, database: DatabaseService, **kwargs):
        super().__init__(**kwargs)
        self._db = database
        self._records: list[RecordDetail] = []
        self._search_query = ""
        self._search_generation = 0
        self._review_only = False
        self._render_lock = asyncio.Lock()
        self._offset = 0

    def action_focus_search(self) -> None:
        with suppress(NoMatches):
            self.query_one("#records-search", Input).focus()

    def action_toggle_source(self) -> None:
        if isinstance(self.app.focused, Input):
            return
        with suppress(NoMatches):
            col = self.query_one("#source-disclosure", Collapsible)
            col.collapsed = not col.collapsed
            if not col.collapsed:
                col.scroll_visible()

    def action_prev_page(self) -> None:
        if isinstance(self.app.focused, Input):
            return
        btn = self.query_one("#records-prev", Button)
        if not btn.disabled and btn.display:
            btn.press()

    def action_next_page(self) -> None:
        if isinstance(self.app.focused, Input):
            return
        btn = self.query_one("#records-next", Button)
        if not btn.disabled and btn.display:
            btn.press()

    def compose(self) -> ComposeResult:
        with Vertical(id="records-empty"):
            yield Label("No records yet", classes="heading")
            yield Static(
                "Collect the registry to get started.",
                id="records-empty-message",
                markup=False,
                classes="muted",
            )
            yield Button(
                "Go to collect", id="go-collect", variant="primary", classes="note"
            )
            yield Button("Try again", id="retry-records", classes="note")

        with Horizontal(classes="split", id="records-content"):
            with Vertical(classes="rail", id="records-rail"):
                yield Input(placeholder="Search all records…", id="records-search")
                with Horizontal(classes="count-row", id="records-count-row"):
                    yield Button("In review", id="records-review-filter")
                    yield Static("", id="records-count", classes="muted")
                yield ListView(id="records-list")
                with Horizontal(classes="pager", id="records-pager"):
                    yield Button("Previous (p)", id="records-prev", disabled=True)
                    yield Button("Next (n)", id="records-next", disabled=True)

            with Vertical(id="records-no-match"):
                yield Label("No matches", classes="heading")
                yield Static(
                    "Try a different name, sector, or description.", classes="muted"
                )
                yield Button("Clear search", id="clear-record-search")
            with VerticalScroll(classes="detail", id="records-detail"):
                with Horizontal(id="detail-title-row"):
                    yield Label("", id="detail-title", classes="heading", markup=False)
                    yield Static("", id="detail-badge")
                yield Static("", id="detail-summary", classes="muted", markup=False)
                yield Static(
                    "", id="detail-description", classes="description", markup=False
                )
                yield Static("", id="detail-normalized", markup=False)
                with Vertical(id="review-section"):
                    yield Label("Data notes", classes="section-label")
                    yield Static("", id="detail-review", markup=False)
                with Collapsible(title="Prepared retrieval text", collapsed=True, id="prepared-disclosure"):
                    yield Static("", id="detail-prepared", markup=False)
                with Collapsible(
                    title="Source evidence & snapshot",
                    collapsed=True,
                    id="source-disclosure",
                ):
                    yield Static("", id="detail-fields", classes="muted", markup=False)
                    yield Label("Original source row", classes="section-label")
                    yield Static("", id="detail-original", classes="note", markup=False)

    async def on_mount(self) -> None:
        await self.refresh_records()

    @on(Button.Pressed, "#go-collect")
    def go_collect(self) -> None:
        self.app.action_navigate("run")

    @on(Button.Pressed, "#retry-records")
    async def retry(self) -> None:
        await self.refresh_records()

    async def refresh_records(self, reset: bool = True) -> None:
        if reset:
            self._offset = 0
        self._search_generation += 1
        await self._load_records(self._search_generation)

    async def _load_records(self, generation: int) -> None:
        page = None
        error = None
        try:
            page = await self._db.record_page(
                self._search_query, self._offset, review_only=self._review_only
            )
        except (turso.Error, RuntimeError, ValueError, LookupError) as exc:
            error = exc
        # An earlier search may finish later. Only the newest request may change the view.
        async with self._render_lock:
            if generation != self._search_generation:
                return
            listing = self.query_one("#records-list", ListView)
            await listing.clear()
            self._records = page.records if page else []
            self.query_one("#retry-records").display = error is not None
            self.query_one("#go-collect").display = error is None
            has_corpus = page is not None and page.unfiltered_total > 0
            self.query_one("#records-empty").display = not has_corpus
            self.query_one("#records-content").display = has_corpus
            self.query_one("#records-detail").display = bool(self._records)
            no_match = has_corpus and not self._records
            self.query_one("#records-no-match").display = no_match
            if no_match:
                if self._review_only and not self._search_query.strip():
                    heading = "No records need review"
                    hint = "Toggle the filter off to browse every row."
                elif self._review_only:
                    heading = "No matches in review"
                    hint = "Try a different name, sector, or description."
                else:
                    heading = "No matches"
                    hint = "Try a different name, sector, or description."
                self.query_one("#records-no-match Label", Label).update(heading)
                self.query_one("#records-no-match Static", Static).update(hint)
                self.query_one("#clear-record-search").display = bool(
                    self._search_query.strip()
                )
            if error is not None:
                self.query_one("#records-empty Label", Label).update(
                    "Could not load records"
                )
                self.query_one("#records-empty-message", Static).update(str(error))
                return
            self.query_one("#records-empty Label", Label).update("No records yet")
            self.query_one("#records-empty-message", Static).update(
                "Collect the registry to get started."
            )
            await listing.extend(
                [self._record_item(detail) for detail in self._records]
            )
            if self._records:
                listing.index = 0
                self._show_detail(self._records[0])
            else:
                # Hidden stale evidence must not reappear when the user opens Source.
                for selector in (
                    "#detail-title",
                    "#detail-summary",
                    "#detail-description",
                    "#detail-normalized",
                    "#detail-review",
                    "#detail-fields",
                    "#detail-original",
                ):
                    self.query_one(selector).update("")
            count = (
                f"{self._offset + 1}–{self._offset + len(self._records)} of {page.total}"
                if self._records
                else "0 matches"
            )
            self.query_one("#records-count", Static).update(count)
            has_more = self._offset + len(self._records) < page.total
            self.query_one("#records-prev", Button).disabled = self._offset == 0
            self.query_one("#records-next", Button).disabled = not has_more
            self.query_one("#records-pager").display = self._offset > 0 or has_more

    def _record_item(self, detail: RecordDetail) -> ListItem:
        label = escape(format_arabic(detail.normalized.name or "Unnamed row"))
        if detail.normalized.needs_review:
            label += f"  {review_chip(dark=self._is_dark())}"
        return ListItem(Label(label, markup=True))

    @on(Input.Submitted, "#records-search")
    def on_search_submitted(self) -> None:
        if self._records:
            self.query_one("#records-list", ListView).focus()

    @on(Input.Changed, "#records-search")
    def filter_records(self, event: Input.Changed) -> None:
        query = event.value.strip()
        if query == self._search_query:
            return
        self._search_query = query
        self._offset = 0
        self._search_generation += 1
        self.run_worker(
            self._search_after_pause(self._search_generation),
            group="record-search",
            exclusive=True,
        )

    async def _search_after_pause(self, generation: int) -> None:
        await asyncio.sleep(0.15)
        await self._load_records(generation)

    @on(Button.Pressed, "#clear-record-search")
    def clear_search(self) -> None:
        self.query_one("#records-search", Input).value = ""
        self.query_one("#records-search", Input).focus()

    @on(Button.Pressed, "#records-prev")
    @on(Button.Pressed, "#records-next")
    async def change_page(self, event: Button.Pressed) -> None:
        self._offset = max(
            0, self._offset + (100 if event.button.id == "records-next" else -100)
        )
        await self.refresh_records(reset=False)
        self.query_one("#records-list", ListView).focus()

    @on(Button.Pressed, "#records-review-filter")
    async def toggle_review_filter(self, event: Button.Pressed) -> None:
        self._review_only = not self._review_only
        event.button.set_class(self._review_only, "in-review")
        await self.refresh_records()

    @on(ListView.Highlighted, "#records-list")
    def highlight_record(self, event: ListView.Highlighted) -> None:
        index = event.list_view.index
        if index is not None and 0 <= index < len(self._records):
            self._show_detail(self._records[index])

    def _is_dark(self) -> bool:
        return self.app.theme != "athar-light"

    def on_theme_changed(self) -> None:
        listing = self.query_one("#records-list", ListView)
        for item, detail in zip(listing.children, self._records):
            text = escape(format_arabic(detail.normalized.name or "Unnamed row"))
            if detail.normalized.needs_review:
                text += f"  {review_chip(dark=self._is_dark())}"
            item.query_one(Label).update(text)
        index = listing.index
        if index is not None and index < len(self._records):
            disclosure = self.query_one("#source-disclosure", Collapsible)
            collapsed = disclosure.collapsed
            detail_view = self.query_one("#records-detail", VerticalScroll)
            scroll = detail_view.scroll_offset
            self._show_detail(self._records[index])
            disclosure.collapsed = collapsed
            detail_view.call_after_refresh(
                detail_view.scroll_to, scroll.x, scroll.y, animate=False
            )

    def _show_detail(self, detail: RecordDetail) -> None:
        record = detail.normalized
        is_dark = self._is_dark()
        pri = (DARK if is_dark else LIGHT).primary

        self.query_one("#detail-title", Label).update(
            format_arabic(record.name or "Unnamed source row")
        )
        badge = self.query_one("#detail-badge", Static)
        if record.needs_review:
            badge.update(review_badge(dark=is_dark))
            badge.display = True
        else:
            badge.update("")
            badge.display = False
        self.query_one("#detail-summary", Static).update(
            format_arabic(f"Sector: {record.sector or 'Not listed'}")
        )
        self.query_one("#detail-description", Static).update(
            format_arabic(record.description or "No description provided.")
        )
        # Structured registry property table with real borders
        norm_table = Table(
            box=box.ROUNDED, expand=True, show_header=True, header_style=f"bold {pri}"
        )
        norm_table.add_column("Registry Property", style=f"bold {pri}", width=18)
        norm_table.add_column("Value")
        norm_table.add_row("Website", record.website or "Not listed")
        norm_table.add_row(
            "Founded",
            str(record.creation_year) if record.creation_year else "Not listed",
        )
        norm_table.add_row("Cohort", record.cohort_label or "Not listed")
        norm_table.add_row(
            "Founders", format_arabic(", ".join(record.founders) or "Not listed")
        )
        self.query_one("#detail-normalized", Static).update(norm_table)

        self.query_one("#review-section").display = bool(record.review_reasons)
        self.query_one("#detail-review", Static).update(
            format_arabic("\n".join(
                f"• { {'human': 'Needs review', 'incomplete': 'Incomplete', 'automatic': 'Handled'}[issue.category]}: {issue.message}"
                for issue in record.issues
            ))
        )
        output = detail.prepared
        self.query_one("#prepared-disclosure").display = output is not None
        prepared_view = self.query_one("#detail-prepared", Static)
        prepared_view.update(self._prepared_card(output, is_dark, pri) if output else "")

    # Source values keep full contrast; the container's muted style is for labels.
        palette = DARK if is_dark else LIGHT
        fields_table = Table(
            box=box.ROUNDED,
            expand=True,
            show_header=True,
            header_style=f"bold {pri}",
            style=palette.foreground,
            border_style=palette.variables["control-line"],
        )
        fields_table.add_column(
            "Provenance Field", style=f"bold {palette.variables['muted']}", max_width=16
        )
        fields_table.add_column("Value", style=palette.foreground, overflow="fold")
        fields_table.add_row("Source URL", detail.source_url)
        fields_table.add_row("Row Number", str(record.row_number))
        fields_table.add_row("Snapshot ID", detail.snapshot_id)
        fields_table.add_row("SHA-256", detail.content_hash)
        fields_table.add_row("Entity ID", record.entity_id or "Unresolved")
        self.query_one("#detail-fields", Static).update(fields_table)
        self.query_one("#detail-original", Static).update(
            themed_json(format_arabic_obj(detail.original), dark=is_dark)
        )
        self.query_one("#source-disclosure", Collapsible).collapsed = True
        self.query_one(".detail", VerticalScroll).scroll_home(animate=False)

    def _prepared_card(self, output: dict, is_dark: bool, pri: str) -> Text:
        """Structured view of one prepared description: meta strip, blocks, flags."""
        pal = DARK if is_dark else LIGHT
        muted = pal.variables["muted"]
        lang = str(output.get("detected_language") or "—")
        profile = output.get("profile")
        model = output.get("model")
        cleaned = output.get("cleaned_text") or ""
        translation = output.get("english_translation")
        fluff = output.get("fluff_excerpts") or []

        text = Text()
        text.append("LANGUAGE  ", style=f"bold {muted}")
        text.append(lang.upper(), style=f"bold {pri}")
        producers = " · ".join(str(value) for value in (profile, model) if value)
        if producers:
            text.append("   PRODUCED BY  ", style=f"bold {muted}")
            text.append(producers, style=pal.foreground)
        text.append("\n\n")

        def block(title: str, body: str, accent: bool) -> None:
            text.append(title, style=f"bold {pri}")
            text.append("\n")
            text.append(
                format_arabic(body), style=pal.foreground if accent else muted
            )
            text.append("\n\n")

        block("Cleaned original", cleaned, True)
        block(
            "English translation",
            translation or "Already English",
            translation is not None,
        )
        text.append("Flagged fluff  ", style=f"bold {pri}")
        text.append(
            " · ".join(format_arabic(f) for f in fluff) if fluff else "None",
            style=muted,
        )
        text.append("\n")
        return text
