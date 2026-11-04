"""One source for the name, tagline, and version every pane and dialog shows."""

from importlib.metadata import PackageNotFoundError, version

APP_NAME = "Athar DataOps"
TAGLINE = "An evidence-backed memory of Tunisian startups."


def app_version() -> str:
    try:
        return version("athar-dataops")
    except PackageNotFoundError:
        return "unknown"
