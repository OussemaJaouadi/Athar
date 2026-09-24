"""One classification for stored findings and record badges; unknowns stay visible."""

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class RecordIssue:
    code: str
    category: Literal["human", "incomplete", "automatic"]
    message: str


def classify_issue(reason: str) -> RecordIssue:
    if reason.startswith("Duplicate of row "):
        return RecordIssue("exact_duplicate", "automatic", reason)
    known = {
        "Conflicting name/domain match; identity needs review": ("identity_conflict", "human"),
        "Cohort predates creation year": ("date_conflict", "human"),
        "Identity needs a valid name and website": ("identity_incomplete", "incomplete"),
        "Source row is not an object": ("invalid_row", "incomplete"),
        "Invalid website; original retained": ("invalid_website", "incomplete"),
        "Invalid cohort date": ("invalid_cohort", "incomplete"),
        "Invalid creation year": ("invalid_year", "incomplete"),
        "Invalid founders list": ("invalid_founders", "incomplete"),
    }
    if reason in known:
        code, category = known[reason]
        return RecordIssue(code, category, reason)
    if reason.startswith("Missing or invalid "):
        return RecordIssue("incomplete_" + reason.removeprefix("Missing or invalid "), "incomplete", reason)
    return RecordIssue("unclassified", "human", reason)
