"""ASCII mark widget for the Athar logo."""

from importlib.resources import files

from rich.text import Text
from textual import on
from textual.events import Resize
from textual.widgets import Static

from athar_dataops.themes import DARK, LIGHT


class AsciiMark(Static):
    """Renders the Athar ASCII mark with DESIGN.md semantic colors."""

    DEFAULT_CSS = """
    AsciiMark {
        width: auto;
        height: auto;
        color: $muted;
    }
    """

    def __init__(self, **kwargs):
        super().__init__("", **kwargs)

    def on_mount(self) -> None:
        self.refresh_artwork()

    @on(Resize)
    def on_resize(self, event: Resize) -> None:
        self.refresh_artwork()

    def refresh_artwork(self) -> None:
        """Load artwork and apply theme-aware coloring."""
        artwork = files("athar_dataops").joinpath("assets/mark.txt").read_text()

        # Check if we have enough space - use app size for consistency
        app_size = self.app.size
        fits = app_size.width >= 110 and app_size.height >= 64

        if not fits:
            self.styles.display = "none"
            return

        self.styles.display = "block"

        # Determine colors based on theme
        is_dark = self.app.theme == "athar-dark"
        accent = (DARK if is_dark else LIGHT).primary
        muted = (DARK if is_dark else LIGHT).variables["muted"]

        # Color the artwork: @ in muted, traces (-=+#%*) in accent
        colored = Text(artwork, style=muted)
        colored.highlight_regex(r"[-=+#%*]+", style=accent)

        self.update(colored)
