"""Executive metric cards for high-level statistics."""

from textual.app import ComposeResult
from textual.containers import Vertical
from textual.widgets import Label, Static


class MetricCard(Vertical):
    """A bordered metric box displaying a prominent KPI number and label."""

    DEFAULT_CSS = """
    MetricCard {
        height: 5;
        width: 1fr;
        border: round $control-line;
        background: $surface;
        padding: 0 1;
        margin-right: 1;
    }
    MetricCard:last-of-type {
        margin-right: 0;
    }
    MetricCard .card-label {
        height: 1;
        color: $muted;
        text-style: bold;
    }
    MetricCard .card-value {
        height: 1;
        color: $link-ink;
        text-style: bold;
    }
    MetricCard .card-subtext {
        height: 1;
        color: $muted;
    }
    """

    def __init__(
        self,
        label: str,
        value: str = "—",
        subtext: str = "",
        card_id: str | None = None,
        **kwargs,
    ):
        super().__init__(id=card_id, **kwargs)
        self._label_text = label
        self._value_text = value
        self._subtext = subtext

    def compose(self) -> ComposeResult:
        yield Label(self._label_text.upper(), classes="card-label")
        yield Label(
            self._value_text,
            classes="card-value",
            id=f"{self.id}-val" if self.id else None,
        )
        yield Static(
            self._subtext,
            classes="card-subtext",
            id=f"{self.id}-sub" if self.id else None,
        )

    def set_value(self, value: str, subtext: str | None = None) -> None:
        self._value_text = value
        val_widget = self.query_one(
            f"#{self.id}-val" if self.id else ".card-value", Label
        )
        val_widget.update(value)
        if subtext is not None:
            self._subtext = subtext
            sub_widget = self.query_one(
                f"#{self.id}-sub" if self.id else ".card-subtext", Static
            )
            sub_widget.update(subtext)
