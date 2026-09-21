"""Theme-aware badge renderers using DESIGN.md semantic colors."""

from athar_dataops.themes import DARK, LIGHT


def status_badge(status: str, dark: bool = True) -> str:
    """Format an operational status badge."""
    norm = status.lower()
    if norm in ("running", "collecting"):
        bg, fg = (
            (DARK if dark else LIGHT).variables["selection"],
            (DARK if dark else LIGHT).primary,
        )
        return f"[bold {fg} on {bg}]  ● RUNNING  [/]"
    elif norm in ("completed", "ready", "success"):
        bg, fg = ("#102A20", "#80CFA6") if dark else ("#E7F4EC", "#176344")
        return f"[bold {fg} on {bg}]  ● READY  [/]"
    elif norm in ("failed", "error"):
        bg, fg = ("#311D1D", "#F2A09A") if dark else ("#FCEDEC", "#A13635")
        return f"[bold {fg} on {bg}]  ✖ ERROR  [/]"
    elif norm in ("cancelled", "canceled"):
        bg, fg = ("#302414", "#F1C276") if dark else ("#FFF1D6", "#7A4B08")
        return f"[bold {fg} on {bg}]  ⊘ CANCELLED  [/]"
    bg, fg = ("#182226", "#A7B9BE") if dark else ("#EEEEEE", "#5A5D61")
    return f"[{fg} on {bg}]  {status.upper()}  [/]"


def sector_badge(sector: str | None, dark: bool = True) -> str:
    """Format a sector chip."""
    if not sector:
        return f"[{(DARK if dark else LIGHT).variables['muted']}]Unspecified sector[/]"
    bg, fg = (
        (DARK if dark else LIGHT).variables["selection"],
        (DARK if dark else LIGHT).primary,
    )
    return f"[bold {fg} on {bg}] {sector.upper()} [/]"


def review_badge(dark: bool = True) -> str:
    """Format a warning review badge."""
    bg, fg = ("#302414", "#F1C276") if dark else ("#FFF1D6", "#7A4B08")
    return f"[bold {fg} on {bg}] ⚠ REVIEW NEEDED [/]"


def review_chip(dark: bool = True) -> str:
    """Format a compact warning chip for list items."""
    bg, fg = ("#302414", "#F1C276") if dark else ("#FFF1D6", "#7A4B08")
    return f"[bold {fg} on {bg}] REVIEW [/]"


def cohort_badge(cohort: str | None, dark: bool = True) -> str:
    """Format an official label cohort badge."""
    if not cohort:
        return ""
    bg, fg = ("#182226", "#A7B9BE") if dark else ("#EEEEEE", "#5A5D61")
    return f"[{fg} on {bg}] Cohort: {cohort} [/]"
