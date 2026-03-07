"""
test_helpers.py — Unit tests for pure helper functions that have no external dependencies.

These run with no Flask app, no DB, no network:
  - correct_name()        (OCR name matching)
  - clean_stat()          (stat string sanitisation)
  - clean_unit_name()     (trailing level number stripping)
  - _slugify()            (unicode slug generation)
  - allowed_file()        (upload extension whitelist)
  - process_json()        (Fribbels JSON import parsing)
"""

import sys
import os
import json
import tempfile
import pytest

# Add backend directory to path so we can import modules directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# correct_name
# ---------------------------------------------------------------------------
class TestCorrectName:
    """Tests for the OCR name-correction logic (prefix + fuzzy fallback)."""

    @pytest.fixture(autouse=True)
    def _import(self):
        from app import correct_name
        self.correct_name = correct_name

    CHOICES = [
        "Arby", "Frieren", "Krau", "Celine", "Spirit Eye Celine",
        "New Moon Luna", "Straze", "Flan", "Ran", "Ainos 2.0",
    ]

    def test_exact_match(self):
        assert self.correct_name("Arby", self.CHOICES) == "Arby"

    def test_prefix_match_strips_ocr_garbage(self):
        # "frieren ooitcxr" — the real name starts the string
        result = self.correct_name("frieren ooitcxr", self.CHOICES)
        assert result == "Frieren"

    def test_prefix_match_prefers_longer_name(self):
        # "spirit eye celine" should beat plain "Celine"
        result = self.correct_name("spirit eye celine extra_garbage", self.CHOICES)
        assert result == "Spirit Eye Celine"

    def test_fuzzy_match_handles_typos(self):
        # Double-i OCR misread: "Friiren" should fuzzy-match to "Frieren" (score ~86)
        result = self.correct_name("Friiren", self.CHOICES)
        assert result == "Frieren"

    def test_returns_none_for_garbage(self):
        result = self.correct_name("xxxxxxxxxxx", self.CHOICES)
        assert result is None

    def test_case_insensitive_prefix(self):
        result = self.correct_name("NEW MOON LUNA extra", self.CHOICES)
        assert result == "New Moon Luna"

    def test_empty_string_returns_none(self):
        result = self.correct_name("", self.CHOICES)
        assert result is None

    def test_ainos_special_name(self):
        # "Ainos 2.0" contains a period — prefix matching should still work
        result = self.correct_name("ainos 2.0 trailing", self.CHOICES)
        assert result == "Ainos 2.0"


# ---------------------------------------------------------------------------
# clean_stat
# ---------------------------------------------------------------------------
class TestCleanStat:
    """Tests for stat string sanitisation."""

    @pytest.fixture(autouse=True)
    def _import(self):
        from app import clean_stat
        self.clean_stat = clean_stat

    def test_strips_asterisk(self):
        assert self.clean_stat("*1234") == "1234"

    def test_strips_colon(self):
        assert self.clean_stat(":1234") == "1234"

    def test_strips_copyright_glyph(self):
        assert self.clean_stat("Â©1234") == "1234"

    def test_truncates_at_period(self):
        assert self.clean_stat("1234.5678") == "1234"

    def test_truncates_at_pipe(self):
        assert self.clean_stat("1234|extra") == "1234"

    def test_percentage_appended_when_missing(self):
        assert self.clean_stat("75", keep_percentage=True) == "75%"

    def test_percentage_kept_when_present(self):
        assert self.clean_stat("75%", keep_percentage=True) == "75%"

    def test_percentage_stripped_by_default(self):
        assert self.clean_stat("75%") == "75"

    def test_none_input_returns_empty(self):
        assert self.clean_stat(None) == ""

    def test_empty_string(self):
        assert self.clean_stat("") == ""


# ---------------------------------------------------------------------------
# clean_unit_name
# ---------------------------------------------------------------------------
class TestCleanUnitName:
    """Tests for stripping trailing level numbers from OCR-read hero names."""

    @pytest.fixture(autouse=True)
    def _import(self):
        from app import clean_unit_name
        self.clean_unit_name = clean_unit_name

    def test_strips_trailing_level(self):
        assert self.clean_unit_name("Arby 60") == "Arby"

    def test_strips_trailing_two_digit_level(self):
        assert self.clean_unit_name("Frieren 50") == "Frieren"

    def test_no_number_unchanged(self):
        assert self.clean_unit_name("Krau") == "Krau"

    def test_name_with_version_number(self):
        # The regex strips trailing digits, so "2.0" → "2." (the trailing 0 is removed).
        # This is the actual function behaviour for names like "Ainos 2.0".
        assert self.clean_unit_name("Ainos 2.0") == "Ainos 2."

    def test_none_returns_empty(self):
        assert self.clean_unit_name(None) == ""

    def test_multiword_with_level(self):
        assert self.clean_unit_name("Spirit Eye Celine 60") == "Spirit Eye Celine"


# ---------------------------------------------------------------------------
# _slugify (imported from routes_draft / routes_scan — identical logic)
# ---------------------------------------------------------------------------
class TestSlugify:
    """Tests for the Unicode-aware slug helper."""

    @pytest.fixture(autouse=True)
    def _import(self):
        from routes_draft import _slugify
        self.slugify = _slugify

    def test_basic_slug(self):
        assert self.slugify("Krau") == "krau"

    def test_spaces_become_hyphens(self):
        assert self.slugify("New Moon Luna") == "new-moon-luna"

    def test_accents_stripped(self):
        # é → e after NFKD decomposition
        assert self.slugify("Lulù") == "lulu"

    def test_special_chars_stripped(self):
        assert self.slugify("Ainos 2.0") == "ainos-20"

    def test_empty_returns_empty(self):
        assert self.slugify("") == ""

    def test_none_returns_empty(self):
        assert self.slugify(None) == ""

    def test_leading_trailing_hyphens_stripped(self):
        assert self.slugify("-hero-") == "hero"


# ---------------------------------------------------------------------------
# allowed_file
# ---------------------------------------------------------------------------
class TestAllowedFile:
    """Tests for the upload extension whitelist."""

    @pytest.fixture(autouse=True)
    def _import(self):
        from app import allowed_file
        self.allowed_file = allowed_file

    def test_png_allowed(self):
        assert self.allowed_file("screenshot.png") is True

    def test_jpg_allowed(self):
        assert self.allowed_file("unit.jpg") is True

    def test_jpeg_allowed(self):
        assert self.allowed_file("unit.jpeg") is True

    def test_json_allowed(self):
        assert self.allowed_file("export.json") is True

    def test_webp_allowed(self):
        assert self.allowed_file("img.webp") is True

    def test_exe_denied(self):
        assert self.allowed_file("virus.exe") is False

    def test_no_extension_denied(self):
        assert self.allowed_file("noext") is False

    def test_uppercase_extension_allowed(self):
        assert self.allowed_file("SCREENSHOT.PNG") is True

    def test_double_extension_uses_last(self):
        # secure filename would still end in .png
        assert self.allowed_file("evil.exe.png") is True


# ---------------------------------------------------------------------------
# process_json  (Fribbels optimizer import)
# ---------------------------------------------------------------------------
class TestProcessJson:
    """
    Tests for the Fribbels JSON import parser.
    We write a temp JSON file and call process_json() with a mocked DB collection.
    """

    @pytest.fixture(autouse=True)
    def _patch_db(self, monkeypatch):
        """Replace image_stats_collection.insert_one so no DB is needed."""
        import unittest.mock as mock
        import app as app_module

        self._inserted = []
        fake_result = mock.MagicMock()
        fake_result.inserted_id = "507f1f77bcf86cd799439011"

        def fake_insert(doc):
            self._inserted.append(doc)
            return fake_result

        monkeypatch.setattr(app_module.image_stats_collection, "insert_one", fake_insert)

    def _write_json(self, heroes):
        f = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        json.dump({"heroes": heroes}, f)
        f.close()
        return f.name

    def test_basic_hero_imported(self):
        from app import process_json
        path = self._write_json([{
            "name": "Arby", "cp": 50000, "atk": 3500, "def": 1000,
            "hp": 15000, "spd": 230, "cr": 85.0, "cd": 250.0,
            "eff": 0.0, "res": 0.0, "imprint": "Locked",
            "equipment": {}
        }])
        results = process_json(path, "testuser", "Champion")
        assert len(results) == 1
        assert results[0]["unit"] == "Arby"
        assert results[0]["uploaded_by"] == "testuser"
        assert results[0]["user_rank"] == "Champion"

    def test_zero_stat_hero_skipped(self):
        from app import process_json
        path = self._write_json([
            {"name": "Placeholder", "cp": 0, "atk": 0, "def": 0, "hp": 0,
             "spd": 0, "cr": 0, "cd": 0, "eff": 0, "res": 0, "equipment": {}},
            {"name": "Arby", "cp": 50000, "atk": 3500, "def": 1000,
             "hp": 15000, "spd": 230, "cr": 85.0, "cd": 250.0,
             "eff": 0.0, "res": 0.0, "imprint": "Locked", "equipment": {}},
        ])
        results = process_json(path, "testuser", "Master")
        assert len(results) == 1
        assert results[0]["unit"] == "Arby"

    def test_stat_formatting(self):
        from app import process_json
        path = self._write_json([{
            "name": "Krau", "cp": 1000000, "atk": 3500, "def": 1200,
            "hp": 20000, "spd": 180, "cr": 65.5, "cd": 185.0,
            "eff": 0.0, "res": 0.0, "imprint": "Locked", "equipment": {}
        }])
        results = process_json(path, "u", "")
        r = results[0]
        # Numbers should be comma-formatted strings
        assert r["cp"] == "1,000,000"
        assert r["attack"] == "3,500"
        # Percentages should have one decimal place and % suffix
        assert r["critical_hit_chance"] == "65.5%"
        assert r["critical_hit_damage"] == "185.0%"

    def test_equipment_sets_extracted(self):
        from app import process_json
        path = self._write_json([{
            "name": "Flan", "cp": 20000, "atk": 2000, "def": 900,
            "hp": 12000, "spd": 210, "cr": 70.0, "cd": 200.0,
            "eff": 0.0, "res": 0.0, "imprint": "Locked",
            "equipment": {
                "weapon":    {"set": "speed"},
                "helmet":    {"set": "immunity"},
                "armor":     {"set": "speed"},
                "necklace":  {"set": "speed"},
                "ring":      {"set": "speed"},
                "boots":     {"set": "speed"},
            }
        }])
        results = process_json(path, "u", "")
        r = results[0]
        assert r["set1"] == "Speed"
        assert r["set2"] == "Immunity"
        assert r["set3"] == "Speed"

    def test_missing_equipment_defaults_to_no_set_effect(self):
        from app import process_json
        path = self._write_json([{
            "name": "Ran", "cp": 15000, "atk": 2500, "def": 800,
            "hp": 10000, "spd": 240, "cr": 90.0, "cd": 220.0,
            "eff": 0.0, "res": 0.0, "imprint": "Locked",
            "equipment": {}
        }])
        results = process_json(path, "u", "")
        r = results[0]
        assert r["set1"] == "No set effect"
        assert r["set2"] == "No set effect"
        assert r["set3"] == "No set effect"

    def test_empty_heroes_list(self):
        from app import process_json
        path = self._write_json([])
        results = process_json(path, "u", "")
        assert results == []

    def test_multiple_heroes(self):
        from app import process_json
        path = self._write_json([
            {"name": "Arby", "cp": 50000, "atk": 3500, "def": 1000,
             "hp": 15000, "spd": 230, "cr": 85.0, "cd": 250.0,
             "eff": 0.0, "res": 0.0, "imprint": "Locked", "equipment": {}},
            {"name": "Krau", "cp": 60000, "atk": 2800, "def": 1500,
             "hp": 25000, "spd": 175, "cr": 55.0, "cd": 165.0,
             "eff": 0.0, "res": 65.0, "imprint": "Locked", "equipment": {}},
        ])
        results = process_json(path, "u", "")
        assert len(results) == 2
        names = {r["unit"] for r in results}
        assert names == {"Arby", "Krau"}
