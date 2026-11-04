"""Every token pair the interface relies on, checked for contrast in both themes."""

from unittest import TestCase

from athar_dataops.themes import DARK, LIGHT


def _lin(channel: int) -> float:
    c = channel / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _luminance(hex_color: str) -> float:
    r, g, b = (int(hex_color.lstrip("#")[i : i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast(a: str, b: str) -> float:
    la, lb = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


class ThemeContrastTests(TestCase):
    def check(self, theme, pairs, floor):
        for name, fg, bg in pairs:
            with self.subTest(theme=theme.name, pair=name):
                self.assertGreaterEqual(contrast(fg, bg), floor, f"{name}: {fg} on {bg}")

    def test_text_pairs_meet_4_5(self):
        for theme in (DARK, LIGHT):
            v = theme.variables
            self.check(theme, [
                ("text on surface", theme.foreground, theme.surface),
                ("text on panel", theme.foreground, theme.panel),
                ("muted on surface", v["muted"], theme.surface),
                ("muted on panel", v["muted"], theme.panel),
                ("muted on selection", v["muted"], v["selection"]),
                ("link on surface", v["link-ink"], theme.surface),
                ("link on selection", v["link-ink"], v["selection"]),
                ("action text on action fill", v["action-fg"], v["action-bg"]),
                ("action text on action hover", v["action-fg"], v["action-hover"]),
                ("destructive text on fill", v["destructive-fg"], v["destructive-bg"]),
                ("information on its tint", v["info-ink"], v["info-bg"]),
                ("success on its tint", theme.success, v["success-bg"]),
                ("warning on its tint", theme.warning, v["warning-bg"]),
                ("error on its tint", theme.error, v["error-bg"]),
                ("violet on surface", v["violet"], theme.surface),
                ("violet on panel", v["violet"], theme.panel),
                ("success on surface", theme.success, theme.surface),
                ("warning on surface", theme.warning, theme.surface),
                ("error on surface", theme.error, theme.surface),
            ], 4.5)

    def test_borders_and_indicators_meet_3(self):
        for theme in (DARK, LIGHT):
            v = theme.variables
            self.check(theme, [
                ("control border on surface", v["control-line"], theme.surface),
                ("control border on panel", v["control-line"], theme.panel),
                ("scrollbar on its track", v["scrollbar"], v["scrollbar-background"]),
                ("action fill on surface", v["action-bg"], theme.surface),
                ("destructive fill on surface", v["destructive-bg"], theme.surface),
            ], 3.0)

    def test_states_are_distinct_colors(self):
        for theme in (DARK, LIGHT):
            v = theme.variables
            with self.subTest(theme=theme.name):
                # Hover is a neutral lift and selection a teal tint: different hues at
                # similar luminance, so distinctness is the test, not a ratio.
                self.assertNotEqual(v["block-hover-background"], v["selection"], "hover must not equal selection")
                self.assertGreaterEqual(contrast(theme.panel, theme.surface), 1.1, "panel must separate from surface")
                self.assertGreaterEqual(contrast(theme.surface, theme.background), 1.1, "surface must separate from canvas")
                self.assertNotEqual(v["action-bg"], v["info-ink"], "primary and information must differ")
