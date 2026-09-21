"""Visual step-by-step pipeline stages with semantic status badges."""

from rich.markup import escape
from textual.app import ComposeResult
from textual.containers import Vertical
from textual.widgets import Static

from athar_dataops.schemas.pipeline import StageProgress
from athar_dataops.themes import DARK, LIGHT


class PipelineProgress(Vertical):
    """Render pipeline stages as modern status items."""

    DEFAULT_CSS = """
    PipelineProgress {
        height: auto;
        padding: 0 1;
        margin-bottom: 1;
    }
    PipelineProgress Static {
        height: auto;
        padding: 0;
        margin-bottom: 0;
    }
    """

    STAGE_TITLES = {
        "collect": "1. Acquire Registry Snapshot",
        "normalize": "2. Clean & Validate Records",
        "save": "3. Resolve Entities & Commit",
    }

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._stages: dict[str, StageProgress] = {}

    def on_theme_changed(self) -> None:
        palette = DARK if self._is_dark() else LIGHT
        for name, title in self.STAGE_TITLES.items():
            if name in self._stages:
                self.update_stage(self._stages[name])
            else:
                self.query_one(f"#stage-{name}", Static).update(
                    f"[{palette.variables['muted']}]○  {title} · pending[/]"
                )

    def on_mount(self) -> None:
        self.on_theme_changed()

    def compose(self) -> ComposeResult:
        for name, title in self.STAGE_TITLES.items():
            yield Static(
                f"[dim]○  {title} · pending[/]", id=f"stage-{name}", markup=True
            )

    def _is_dark(self) -> bool:
        try:
            return getattr(self.app, "theme", "athar-dark") != "athar-light"
        except Exception:
            return True

    def update_stage(self, progress: StageProgress) -> None:
        self._stages[progress.stage_name] = progress
        palette = DARK if self._is_dark() else LIGHT
        muted = palette.variables["muted"]
        title = self.STAGE_TITLES.get(progress.stage_name, progress.stage_name)
        status = progress.status
        msg = f" · [{muted}]{escape(progress.message)}[/]" if progress.message else ""

        if status == "running":
            c = palette.primary
            content = f"[bold {c}]⠋  {title}[/] [{c}]running[/]{msg}"
        elif status == "completed":
            c = palette.success
            content = f"[bold {c}]✔  {title}[/] [{c}]completed[/]{msg}"
        elif status == "failed":
            c = palette.error
            content = f"[bold {c}]✖  {title}[/] [{c}]failed[/]{msg}"
        elif status == "cancelled":
            c = palette.warning
            content = f"[bold {c}]⊘  {title}[/] [{c}]cancelled[/]"
        else:
            content = f"[{muted}]○  {title} · {status}[/]"

        self.query_one(f"#stage-{progress.stage_name}", Static).update(content)

    def reset(self) -> None:
        self._stages.clear()
        self.on_theme_changed()
