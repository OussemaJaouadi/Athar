"""Run one test layer.

    uv run --project dataops dataops/tests/run.py unit   # services and data rules, well under a minute
    uv run --project dataops dataops/tests/run.py ui     # headless Textual app, a few minutes
    uv run --project dataops dataops/tests/run.py all

Pass -k <substring> after the layer to select tests by name.
"""

import sys
import unittest
from pathlib import Path

LAYERS = {"unit": ["unit"], "ui": ["ui"], "all": ["unit", "ui"]}


def main() -> int:
    args = sys.argv[1:]
    layer = args[0] if args and args[0] in LAYERS else "unit"
    patterns = [args[i + 1] for i, arg in enumerate(args) if arg == "-k" and i + 1 < len(args)]
    root = Path(__file__).resolve().parent
    loader = unittest.defaultTestLoader
    if patterns:
        loader.testNamePatterns = [f"*{pattern}*" for pattern in patterns]
    suite = unittest.TestSuite()
    for directory in LAYERS[layer]:
        suite.addTests(loader.discover(str(root / directory), top_level_dir=str(root)))
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
