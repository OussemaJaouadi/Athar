"""Process deltas, sampled peaks, and literal, themed log output."""

from unittest import TestCase
from unittest.mock import Mock

import psutil

from athar_dataops.schemas.logs import LogEntry
from athar_dataops.services.metrics import ProcessSample, ProcessSampler, StepMetrics
from athar_dataops.themes import DARK, LIGHT
from athar_dataops.ui.log_format import render_entry


class MetricsTests(TestCase):
    def test_cpu_average_uses_elapsed_time_and_peak_is_retained(self):
        metrics = StepMetrics(ProcessSample(10, 2, 2 * 1024**2))
        metrics.observe(metrics.first)
        metrics.observe(ProcessSample(11, 2.5, 5 * 1024**2))
        metrics.observe(ProcessSample(14, 3, 3 * 1024**2))
        self.assertEqual(metrics.label(), "CPU avg 25.0% · peak RSS 5.0 MiB")

    def test_unavailable_and_zero_duration_are_not_invented_zeroes(self):
        metrics = StepMetrics(None)
        metrics.observe(None)
        self.assertEqual(metrics.label(), "CPU avg — · peak RSS —")
        metrics = StepMetrics(ProcessSample(1, 2, 0))
        metrics.observe(metrics.first)
        self.assertIn("CPU avg —", metrics.label())

    def test_sampler_handles_denied_access(self):
        sampler = ProcessSampler()
        sampler._process = Mock()
        sampler._process.oneshot.side_effect = psutil.AccessDenied()
        self.assertIsNone(sampler.sample())

    def test_status_color_uses_each_theme_and_messages_are_literal(self):
        for dark, palette in ((True, DARK), (False, LIGHT)):
            for status, color, severity in (
                ("running", palette.primary, "stage"),
                ("completed", palette.success, "stage"),
                ("failed", palette.error, "error"),
                ("cancelled", palette.warning, "warning"),
            ):
                entry = LogEntry.create(
                    "[red]literal[/]", status, run_id="123456789", step="normalize"
                )
                rendered = render_entry(entry, dark)
                self.assertEqual(entry.level, severity)
                self.assertIn("[red]literal[/]", rendered.plain)
                self.assertIn("12345678 normalize", rendered.plain)
                self.assertIn(f"bold {color}", [span.style for span in rendered.spans])
