"""Run one test layer, in parallel processes.

    uv run --project dataops dataops/tests/run.py unit        # services and data rules
    uv run --project dataops dataops/tests/run.py ui          # headless Textual app
    uv run --project dataops dataops/tests/run.py all
    uv run --project dataops dataops/tests/run.py ui -k smoke # select tests by name substring
    uv run --project dataops dataops/tests/run.py ui -j 1     # one process, plain unittest output

Every test owns a temporary database, so tests are independent and the layer is
split across processes: each worker loads its share of test ids and reports back.
"""

import io
import os
import sys
import time
import unittest
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

LAYERS = {"unit": ["unit"], "ui": ["ui"], "all": ["unit", "ui"]}
ROOT = Path(__file__).resolve().parent
DEFAULT_JOBS = max(1, min(8, (os.cpu_count() or 2) - 1))


def _collect(layer: str, patterns: list[str]) -> list[str]:
    loader = unittest.TestLoader()
    if patterns:
        loader.testNamePatterns = [f"*{pattern}*" for pattern in patterns]
    ids: list[str] = []
    for directory in LAYERS[layer]:
        suite = loader.discover(str(ROOT / directory), top_level_dir=str(ROOT))
        ids.extend(test.id() for test in _flatten(suite))
    return ids


def _flatten(suite):
    for item in suite:
        if isinstance(item, unittest.TestSuite):
            yield from _flatten(item)
        else:
            yield item


def run_ids(ids: list[str]) -> dict:
    """One worker: run these test ids and return counts, failures, and timings."""
    sys.path.insert(0, str(ROOT))
    suite = unittest.TestLoader().loadTestsFromNames(ids)
    stream = io.StringIO()
    started = time.perf_counter()
    result = unittest.TextTestRunner(stream=stream, verbosity=0).run(suite)
    return {
        "ran": result.testsRun,
        "failed": [(str(test), trace) for test, trace in result.failures],
        "errored": [(str(test), trace) for test, trace in result.errors],
        "skipped": len(result.skipped),
        "seconds": time.perf_counter() - started,
    }


def main() -> int:
    args = sys.argv[1:]
    layer = args[0] if args and args[0] in LAYERS else "unit"
    patterns = [args[i + 1] for i, arg in enumerate(args) if arg == "-k" and i + 1 < len(args)]
    jobs = next((int(args[i + 1]) for i, arg in enumerate(args) if arg == "-j" and i + 1 < len(args)), DEFAULT_JOBS)
    ids = _collect(layer, patterns)
    if not ids:
        print("no tests matched")
        return 1
    started = time.perf_counter()
    if jobs <= 1 or len(ids) == 1:
        sys.path.insert(0, str(ROOT))
        suite = unittest.TestLoader().loadTestsFromNames(ids)
        return 0 if unittest.TextTestRunner(verbosity=1).run(suite).wasSuccessful() else 1
    # One test per task so a slow test never holds a worker's whole share; tests do not share state.
    jobs = min(jobs, len(ids))
    with ProcessPoolExecutor(max_workers=jobs) as pool:
        reports = list(pool.map(run_ids, [[test_id] for test_id in ids]))
    elapsed = time.perf_counter() - started
    ran = sum(report["ran"] for report in reports)
    problems = [(kind, name, trace) for report in reports
                for kind, entries in (("FAIL", report["failed"]), ("ERROR", report["errored"]))
                for name, trace in entries]
    for kind, name, trace in problems:
        print(f"{'=' * 70}\n{kind}: {name}\n{'-' * 70}\n{trace}")
    skipped = sum(report["skipped"] for report in reports)
    slowest = max(report["seconds"] for report in reports)
    print(f"{'-' * 70}\nRan {ran} tests in {elapsed:.1f}s ({jobs} workers, slowest test {slowest:.1f}s)"
          + (f", {skipped} skipped" if skipped else ""))
    print("OK" if not problems else f"FAILED ({len(problems)} problems)")
    return 0 if not problems else 1


if __name__ == "__main__":
    sys.exit(main())
