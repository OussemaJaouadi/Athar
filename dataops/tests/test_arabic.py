"""Tests for Arabic shaping, BiDi, and encoding display helpers."""

import unittest

from athar_dataops.ui.arabic import (
    decode_unicode_escapes,
    format_arabic,
    format_arabic_obj,
    has_arabic,
    repair_mojibake,
)


class ArabicDisplayTests(unittest.TestCase):
    def test_has_arabic(self):
        self.assertTrue(has_arabic("أثر"))
        self.assertTrue(has_arabic("شركة تقنية"))
        self.assertFalse(has_arabic("Athar DataOps"))
        self.assertFalse(has_arabic("12345!@#$"))

    def test_decode_unicode_escapes(self):
        escaped = r"\u0634\u0631\u0643\u0629"
        self.assertEqual(decode_unicode_escapes(escaped), "شركة")

    def test_repair_mojibake(self):
        # UTF-8 for "أثر" decoded as Latin-1
        mojibake = "أثر".encode("utf-8").decode("latin1")
        self.assertEqual(repair_mojibake(mojibake), "أثر")

    def test_format_arabic_reshapes_and_reorders(self):
        original = "شركة"
        formatted = format_arabic(original)
        # Formatted string should be cursive presentation forms, not raw isolated characters
        self.assertNotEqual(formatted, original)
        self.assertTrue(has_arabic(formatted))

    def test_format_arabic_handles_multiline_and_mixed(self):
        text = "Athar\nشركة التقنية\nVersion 1.0"
        formatted = format_arabic(text)
        lines = formatted.split("\n")
        self.assertEqual(lines[0], "Athar")
        self.assertEqual(lines[2], "Version 1.0")
        self.assertNotEqual(lines[1], "شركة التقنية")

    def test_format_arabic_obj(self):
        data = {
            "name": "شركة",
            "count": 10,
            "tags": ["تقنية", "برمجة"],
        }
        res = format_arabic_obj(data)
        self.assertIsInstance(res, dict)
        self.assertEqual(res["count"], 10)
        self.assertNotEqual(res["name"], "شركة")
        self.assertNotEqual(res["tags"][0], "تقنية")


if __name__ == "__main__":
    unittest.main()
