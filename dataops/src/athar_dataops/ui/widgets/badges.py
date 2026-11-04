"""Theme-aware review badges using DESIGN.md semantic colors."""


def review_badge(dark: bool = True, *, decision: bool = True) -> str:
    """Distinguish decisions from source gaps that never block a run."""
    if decision:
        bg, fg = ("#302414", "#F1C276") if dark else ("#FFF1D6", "#7A4B08")
        label = "⚠ Needs a decision"
    else:
        bg, fg = ("#182D3A", "#9ACBEA") if dark else ("#EAF4FA", "#245B7A")
        label = "Source gap"
    return f"[bold {fg} on {bg}] {label} [/]"


def review_chip(dark: bool = True, *, decision: bool = True) -> str:
    """Format a compact review chip for list items."""
    if decision:
        bg, fg = ("#302414", "#F1C276") if dark else ("#FFF1D6", "#7A4B08")
        label = "Decision"
    else:
        bg, fg = ("#182D3A", "#9ACBEA") if dark else ("#EAF4FA", "#245B7A")
        label = "Gap"
    return f"[bold {fg} on {bg}] {label} [/]"
