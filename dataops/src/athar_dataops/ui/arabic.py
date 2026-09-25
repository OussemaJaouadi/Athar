"""Arabic text shaping and bidirectional display helpers for terminal rendering."""

from __future__ import annotations

import re
from typing import Any

import arabic_reshaper
from bidi.algorithm import get_display

_ARABIC_CHAR_PATTERN = re.compile(
    r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]"
)
_UNICODE_ESCAPE_PATTERN = re.compile(r"\\u([0-9a-fA-F]{4})")

_reshaper = arabic_reshaper.ArabicReshaper(
    {
        "delete_harakat": False,
        "support_ligatures": True,
    }
)


def has_arabic(text: str) -> bool:
    """Return True if string contains any Arabic code points."""
    return bool(_ARABIC_CHAR_PATTERN.search(text))


def decode_unicode_escapes(text: str) -> str:
    """Decode literal \\u06xx or other unicode escapes if present in string."""
    if r"\u" not in text:
        return text

    def _replace(match: re.Match) -> str:
        try:
            return chr(int(match.group(1), 16))
        except (ValueError, OverflowError):
            return match.group(0)

    return _UNICODE_ESCAPE_PATTERN.sub(_replace, text)


def repair_mojibake(text: str) -> str:
    """Repair common UTF-8 byte sequences erroneously decoded as Latin-1/CP1252."""
    if "Ø" in text or "Ù" in text:
        try:
            reencoded = text.encode("latin1").decode("utf-8")
            if has_arabic(reencoded):
                return reencoded
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return text


def format_arabic(text: str | None) -> str:
    """Format Arabic text for correct terminal display.

    Performs:
    1. Unicode escape decoding (e.g. \\u0627 -> ا)
    2. Mojibake repair (e.g. Ø§Ù„ -> ال)
    3. Arabic glyph reshaping (joining cursive letter forms)
    4. Bidirectional (BiDi) reordering for LTR terminal rendering
    """
    if not text or not isinstance(text, str):
        return "" if text is None else str(text)

    cleaned = decode_unicode_escapes(text)
    cleaned = repair_mojibake(cleaned)

    if not has_arabic(cleaned):
        return cleaned

    lines = cleaned.split("\n")
    formatted_lines: list[str] = []
    for line in lines:
        if has_arabic(line):
            try:
                reshaped = _reshaper.reshape(line)
                formatted_lines.append(get_display(reshaped))
            except (KeyError, IndexError, TypeError, ValueError):
                formatted_lines.append(line)
        else:
            formatted_lines.append(line)

    return "\n".join(formatted_lines)


def format_arabic_obj(obj: Any) -> Any:
    """Recursively formats string values within dicts/lists for display."""
    if isinstance(obj, str):
        return format_arabic(obj)
    if isinstance(obj, dict):
        return {
            format_arabic(k) if isinstance(k, str) and has_arabic(k) else k: format_arabic_obj(v)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [format_arabic_obj(item) for item in obj]
    return obj
