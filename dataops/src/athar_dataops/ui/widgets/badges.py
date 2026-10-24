"""Theme-aware review badges using DESIGN.md semantic colors."""


def review_badge(dark: bool = True, *, decision: bool = True) -> str:
    """Distinguish decisions from nonblocking source gaps."""
    if decision:
        bg, fg = ("#302414", "#F1C276") if dark else ("#FFF1D6", "#7A4B08")
        label = "⚠ DECISION NEEDED"
    else:
        bg, fg = ("#182D3A", "#9ACBEA") if dark else ("#EAF4FA", "#245B7A")
        label = "SOURCE GAP"
    return f"[bold {fg} on {bg}] {label} [/]"


def review_chip(dark: bool = True, *, decision: bool = True) -> str:
    """Format a compact review chip for list items."""
    if decision:
        bg, fg = ("#302414", "#F1C276") if dark else ("#FFF1D6", "#7A4B08")
        label = "DECISION"
    else:
        bg, fg = ("#182D3A", "#9ACBEA") if dark else ("#EAF4FA", "#245B7A")
        label = "GAP"
    return f"[bold {fg} on {bg}] {label} [/]"
