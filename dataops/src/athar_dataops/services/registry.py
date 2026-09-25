"""Conservative normalization: uncertainty becomes a review reason, never a guess."""

import re
from datetime import UTC, date, datetime
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from athar_dataops.schemas.registry import NormalizedRecord

# Per-field guard: no legitimate description approaches this size. Rejected
# values stay reviewable in the byte-preserved raw snapshot.
_MAX_FIELD_CHARS = 65_536


class RegistryService:
    def normalize(self, rows: list[Any]) -> list[NormalizedRecord]:
        return [
            self.normalize_row(number, row) for number, row in enumerate(rows, start=1)
        ]

    def normalize_row(self, number: int, raw: Any) -> NormalizedRecord:
        record = NormalizedRecord(row_number=number)
        if not isinstance(raw, dict):
            record.review_reasons.append("Source row is not an object")
            return record

        def text(key: str, required: bool = False) -> str | None:
            value = raw.get(key)
            if isinstance(value, str) and value.strip():
                if len(value) > _MAX_FIELD_CHARS:
                    record.review_reasons.append(
                        f"Field {key} exceeds {_MAX_FIELD_CHARS} characters; value rejected"
                    )
                    return None
                return value.strip()
            if required or value not in (None, ""):
                record.review_reasons.append(f"Missing or invalid {key}")
            return None

        record.name = text("name", required=True)
        # The registry calls this field `desc`; the original remains byte-preserved.
        record.description = text("desc", required=True)
        record.sector = text("sector") or text("industry")
        if not record.sector:
            record.review_reasons.append("Missing or invalid sector")
        record.cohort_label = text("label", required=True)
        if record.cohort_label:
            try:
                if not re.fullmatch(r"\d{2}/\d{4}", record.cohort_label):
                    raise ValueError
                month, year = map(int, record.cohort_label.split("/"))
                cohort = date(year, month, 1)
                if cohort > datetime.now(UTC).date():
                    raise ValueError
                record.cohort_date = cohort.isoformat()
            except ValueError:
                record.review_reasons.append("Invalid cohort date")
        year_text = text("creation_year", required=True)
        if year_text:
            if (
                re.fullmatch(r"\d{4}", year_text)
                and 1 <= int(year_text) <= datetime.now(UTC).year
            ):
                record.creation_year = int(year_text)
            else:
                record.review_reasons.append("Invalid creation year")
        if (
            record.creation_year
            and record.cohort_date
            and record.creation_year > int(record.cohort_date[:4])
        ):
            record.review_reasons.append("Cohort predates creation year")
        founders = raw.get("founders")
        if isinstance(founders, list) and all(
            isinstance(name, str) for name in founders
        ):
            record.founders = [name.strip() for name in founders if name.strip()]
        else:
            record.review_reasons.append("Invalid founders list")
        website = text("website")
        if website:
            try:
                record.website, record.domain = self.normalize_website(website)
            except ValueError:
                record.review_reasons.append("Invalid website; original retained")
        return record

    @staticmethod
    def normalize_website(value: str) -> tuple[str, str]:
        if any(character.isspace() for character in value):
            raise ValueError("Whitespace within website")
        parts = urlsplit(value if "://" in value else "https://" + value)
        host = (
            (parts.hostname or "")
            .encode("idna")
            .decode("ascii")
            .lower()
            .removeprefix("www.")
        )
        # A URL is evidence, not merely a hostname: keep its scheme, path and query.
        if parts.scheme not in ("http", "https") or parts.username or parts.password:
            raise ValueError("Unsupported website")
        if "." not in host or not all(
            re.fullmatch(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", label)
            for label in host.split(".")
        ):
            raise ValueError("Invalid domain")
        port = parts.port
        netloc = host + (f":{port}" if port else "")
        return urlunsplit(
            (parts.scheme, netloc, parts.path, parts.query, parts.fragment)
        ), host
