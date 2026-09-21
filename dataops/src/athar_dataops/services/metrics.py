"""Cheap, nonblocking samples of this application process, not the whole host."""

from dataclasses import dataclass
from time import monotonic

import psutil


@dataclass(frozen=True)
class ProcessSample:
    elapsed_at: float
    cpu_seconds: float
    rss_bytes: int


class ProcessSampler:
    def __init__(self) -> None:
        self._process = psutil.Process()

    def sample(self) -> ProcessSample | None:
        try:
            with self._process.oneshot():
                cpu = self._process.cpu_times()
                return ProcessSample(
                    monotonic(), cpu.user + cpu.system, self._process.memory_info().rss
                )
        except (psutil.Error, OSError):
            return None


@dataclass
class StepMetrics:
    """CPU deltas give a time-weighted average, even for sub-second steps."""

    first: ProcessSample | None
    last: ProcessSample | None = None
    peak_rss: int | None = None

    def observe(self, sample: ProcessSample | None) -> None:
        if sample is not None:
            self.last = sample
            self.peak_rss = max(self.peak_rss or 0, sample.rss_bytes)

    def label(self) -> str:
        cpu = "—"
        if self.first is not None and self.last is not None:
            duration = self.last.elapsed_at - self.first.elapsed_at
            if duration > 0:
                cpu = f"{max(0, self.last.cpu_seconds - self.first.cpu_seconds) / duration * 100:.1f}%"
        memory = "—" if self.peak_rss is None else f"{self.peak_rss / 1024**2:.1f} MiB"
        return f"CPU avg {cpu} · peak RSS {memory}"
