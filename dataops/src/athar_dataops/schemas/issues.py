"""One classification for stored findings and record badges; unknowns stay visible."""

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class RecordIssue:
    code: str
    category: Literal["human", "incomplete", "automatic"]
    message: str


# Stored reasons are the classification key and never change; these are the
# words a reviewer reads for each code.
_FRIENDLY = {
    "website_extracted": "Website taken from a field that also held other text",
    "identity_conflict": "Name matches one startup, website matches another",
    "date_conflict": "Cohort label is earlier than the founding year",
    "identity_incomplete": "No valid name and website to match a startup",
    "invalid_row": "Row is not a JSON object",
    "invalid_website": "Website is not a valid URL; kept as written",
    "invalid_cohort": "Cohort label is not a month/year",
    "invalid_year": "Founding year is not valid",
    "invalid_founders": "Founders list is not valid",
    "incomplete_desc": "Missing description",
    "incomplete_name": "Missing name",
    "incomplete_label": "Missing cohort label",
    "incomplete_creation_year": "Missing founding year",
    "incomplete_sector": "Missing sector",
}


def describe_finding(code: str, reason: str) -> str:
    """The reviewer's wording for a stored finding; the stored reason stays as is."""
    if code == "exact_duplicate" and reason.startswith("Duplicate of row "):
        number = reason.removeprefix("Duplicate of row ").split(";", 1)[0]
        return f"Same content as row {number}"
    return _FRIENDLY.get(code, reason)


def classify_issue(reason: str) -> RecordIssue:
    if reason.startswith("Duplicate of row "):
        return RecordIssue("exact_duplicate", "automatic", describe_finding("exact_duplicate", reason))
    known = {
        "Website extracted from mixed source field": ("website_extracted", "automatic"),
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
        return RecordIssue(code, category, describe_finding(code, reason))
    if reason.startswith("Missing or invalid "):
        code = "incomplete_" + reason.removeprefix("Missing or invalid ")
        return RecordIssue(code, "incomplete", describe_finding(code, reason))
    return RecordIssue("unclassified", "human", reason)
