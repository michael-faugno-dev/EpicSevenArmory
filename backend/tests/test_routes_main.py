"""
test_routes_main.py — Integration tests for the core routes in app.py.

Routes tested:
  GET  /get_unit_names
  GET  /profile
  POST /profile
  GET  /your_units
  POST /your_units
  POST /delete_unit
  POST /update_unit_stats
  POST /update_selected_units
  GET  /get_selected_units_data
  POST /bug_report
  POST /auth/twitch/unlink
"""

import json
import pytest
from bson import ObjectId

from conftest import make_token, TEST_SECRET


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def auth(username="testuser"):
    token = make_token(username)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def insert_unit(mock_db, username="testuser", unit_name="Arby", **extra):
    doc = {"unit": unit_name, "uploaded_by": username,
           "attack": "3500", "defense": "1000", "health": "15000",
           "speed": "230", "critical_hit_chance": "85%",
           "critical_hit_damage": "250%", "effectiveness": "0%",
           "effect_resistance": "0%", "cp": "50000",
           "set1": "Speed", "set2": "Speed", "set3": "Speed",
           "imprint": "Locked", "user_rank": "Champion", **extra}
    result = mock_db["ImageStats"].insert_one(doc)
    return str(result.inserted_id)


# ---------------------------------------------------------------------------
# GET /get_unit_names
# ---------------------------------------------------------------------------
class TestGetUnitNames:
    def test_returns_list(self, client):
        resp = client.get("/get_unit_names")
        assert resp.status_code == 200
        data = resp.get_json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_list_is_sorted(self, client):
        data = client.get("/get_unit_names").get_json()
        assert data == sorted(data)


# ---------------------------------------------------------------------------
# GET /profile
# ---------------------------------------------------------------------------
class TestProfileGet:
    def test_missing_username_returns_400(self, client):
        resp = client.get("/profile")
        assert resp.status_code == 400

    def test_unknown_user_returns_404(self, client):
        resp = client.get("/profile?username=nobody")
        assert resp.status_code == 404

    def test_known_user_returns_profile(self, client, mock_db):
        mock_db["Users"].insert_one({
            "username": "alice", "rta_rank": "Champion",
            "epic_seven_account": "AliceGG"
        })
        resp = client.get("/profile?username=alice")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["profile"]["username"] == "alice"

    def test_sensitive_fields_excluded(self, client, mock_db):
        mock_db["Users"].insert_one({
            "username": "bob", "email": "bob@example.com",
            "google_id": "g123", "access_token": "tok"
        })
        resp = client.get("/profile?username=bob")
        profile = resp.get_json()["profile"]
        assert "email" not in profile
        assert "google_id" not in profile
        assert "access_token" not in profile


# ---------------------------------------------------------------------------
# POST /profile
# ---------------------------------------------------------------------------
class TestProfilePost:
    def test_update_own_profile(self, client, mock_db):
        mock_db["Users"].insert_one({"username": "alice", "rta_rank": "Master"})
        resp = client.post("/profile", headers=auth("alice"),
                           data=json.dumps({"username": "alice", "rta_rank": "Champion"}))
        assert resp.status_code == 200

    def test_missing_body_returns_400(self, client):
        resp = client.post("/profile", headers=auth("alice"))
        assert resp.status_code == 400

    def test_nonexistent_user_returns_404(self, client):
        resp = client.post("/profile", headers=auth("ghost"),
                           data=json.dumps({"username": "ghost", "rta_rank": "X"}))
        assert resp.status_code == 404

    def test_requires_auth(self, client):
        resp = client.post("/profile", data=json.dumps({"username": "x"}),
                           content_type="application/json")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /your_units
# ---------------------------------------------------------------------------
class TestYourUnitsGet:
    def test_empty_returns_empty_list(self, client):
        resp = client.get("/your_units", headers=auth("nobody"))
        assert resp.status_code == 200
        assert resp.get_json() == []

    def test_returns_users_units(self, client, mock_db):
        insert_unit(mock_db, "alice", "Arby")
        insert_unit(mock_db, "alice", "Krau")
        insert_unit(mock_db, "bob", "Flan")  # different user
        resp = client.get("/your_units", headers=auth("alice"))
        data = resp.get_json()
        names = [u["unit"] for u in data]
        assert "Arby" in names
        assert "Krau" in names
        assert "Flan" not in names

    def test_list_sorted_alphabetically(self, client, mock_db):
        insert_unit(mock_db, "alice", "Straze")
        insert_unit(mock_db, "alice", "Arby")
        data = client.get("/your_units", headers=auth("alice")).get_json()
        names = [u["unit"] for u in data]
        assert names == sorted(names)

    def test_ids_serialized_as_strings(self, client, mock_db):
        insert_unit(mock_db, "alice", "Arby")
        data = client.get("/your_units", headers=auth("alice")).get_json()
        assert isinstance(data[0]["_id"], str)


# ---------------------------------------------------------------------------
# POST /your_units  (single unit lookup)
# ---------------------------------------------------------------------------
class TestYourUnitsPost:
    def test_returns_unit(self, client, mock_db):
        insert_unit(mock_db, "alice", "Arby")
        resp = client.post("/your_units", headers=auth("alice"),
                           data=json.dumps({"unit": "Arby"}))
        assert resp.status_code == 200
        assert resp.get_json()["unit"] == "Arby"

    def test_missing_unit_returns_404(self, client):
        resp = client.post("/your_units", headers=auth("alice"),
                           data=json.dumps({"unit": "NonExistent"}))
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /delete_unit
# ---------------------------------------------------------------------------
class TestDeleteUnit:
    def test_delete_own_unit(self, client, mock_db):
        uid = insert_unit(mock_db, "alice", "Arby")
        resp = client.post("/delete_unit", headers=auth("alice"),
                           data=json.dumps({"unit_to_delete": uid}))
        assert resp.status_code == 200
        assert mock_db["ImageStats"].find_one({"_id": ObjectId(uid)}) is None

    def test_cannot_delete_other_users_unit(self, client, mock_db):
        uid = insert_unit(mock_db, "bob", "Krau")
        resp = client.post("/delete_unit", headers=auth("alice"),
                           data=json.dumps({"unit_to_delete": uid}))
        assert resp.status_code == 404
        assert mock_db["ImageStats"].find_one({"_id": ObjectId(uid)}) is not None

    def test_missing_unit_id_returns_400(self, client):
        resp = client.post("/delete_unit", headers=auth("alice"),
                           data=json.dumps({}))
        assert resp.status_code == 400

    def test_requires_auth(self, client, mock_db):
        uid = insert_unit(mock_db, "alice", "Arby")
        resp = client.post("/delete_unit", data=json.dumps({"unit_to_delete": uid}),
                           content_type="application/json")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /update_unit_stats
# ---------------------------------------------------------------------------
class TestUpdateUnitStats:
    def test_update_allowed_field(self, client, mock_db):
        uid = insert_unit(mock_db, "alice", "Arby")
        resp = client.post("/update_unit_stats", headers=auth("alice"),
                           data=json.dumps({"unit_id": uid, "updates": {"speed": 250}}))
        assert resp.status_code == 200
        doc = mock_db["ImageStats"].find_one({"_id": ObjectId(uid)})
        assert doc["speed"] == 250

    def test_disallowed_field_not_written(self, client, mock_db):
        uid = insert_unit(mock_db, "alice", "Arby")
        resp = client.post("/update_unit_stats", headers=auth("alice"),
                           data=json.dumps({"unit_id": uid,
                                            "updates": {"uploaded_by": "hacker"}}))
        assert resp.status_code == 400
        doc = mock_db["ImageStats"].find_one({"_id": ObjectId(uid)})
        assert doc["uploaded_by"] == "alice"

    def test_cannot_update_other_users_unit(self, client, mock_db):
        uid = insert_unit(mock_db, "bob", "Krau")
        resp = client.post("/update_unit_stats", headers=auth("alice"),
                           data=json.dumps({"unit_id": uid,
                                            "updates": {"speed": 999}}))
        assert resp.status_code == 404

    def test_invalid_numeric_returns_400(self, client, mock_db):
        uid = insert_unit(mock_db, "alice", "Arby")
        resp = client.post("/update_unit_stats", headers=auth("alice"),
                           data=json.dumps({"unit_id": uid,
                                            "updates": {"speed": "not_a_number"}}))
        assert resp.status_code == 400

    def test_missing_unit_id_returns_400(self, client):
        resp = client.post("/update_unit_stats", headers=auth("alice"),
                           data=json.dumps({"updates": {"speed": 200}}))
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# POST /update_selected_units
# ---------------------------------------------------------------------------
class TestUpdateSelectedUnits:
    def test_upserts_selected_units(self, client, mock_db):
        uid1 = insert_unit(mock_db, "alice", "Arby")
        uid2 = insert_unit(mock_db, "alice", "Krau")
        resp = client.post("/update_selected_units", headers=auth("alice"),
                           data=json.dumps({"units": [{"id": uid1}, {"id": uid2}]}))
        assert resp.status_code == 200
        doc = mock_db["selected_units"].find_one({"username": "alice"})
        assert doc["unit_id1"] == uid1
        assert doc["unit_id2"] == uid2
        assert doc["unit_id3"] is None
        assert doc["unit_id4"] is None

    def test_caps_at_4_units(self, client, mock_db):
        uids = [insert_unit(mock_db, "alice", f"Unit{i}") for i in range(6)]
        units = [{"id": uid} for uid in uids]
        resp = client.post("/update_selected_units", headers=auth("alice"),
                           data=json.dumps({"units": units}))
        assert resp.status_code == 200
        doc = mock_db["selected_units"].find_one({"username": "alice"})
        # Only 4 slots exist
        assert "unit_id5" not in doc


# ---------------------------------------------------------------------------
# GET /get_selected_units_data
# ---------------------------------------------------------------------------
class TestGetSelectedUnitsData:
    def test_empty_when_no_selection(self, client):
        resp = client.get("/get_selected_units_data", headers=auth("alice"))
        assert resp.status_code == 200
        assert resp.get_json() == []

    def test_returns_unit_documents(self, client, mock_db):
        uid = insert_unit(mock_db, "alice", "Arby")
        mock_db["selected_units"].insert_one(
            {"username": "alice", "unit_id1": uid,
             "unit_id2": None, "unit_id3": None, "unit_id4": None}
        )
        resp = client.get("/get_selected_units_data", headers=auth("alice"))
        data = resp.get_json()
        assert len(data) == 1
        assert data[0]["unit"] == "Arby"


# ---------------------------------------------------------------------------
# POST /bug_report
# ---------------------------------------------------------------------------
class TestBugReport:
    def test_submit_valid_report(self, client, mock_db):
        resp = client.post("/bug_report", headers=auth("alice"),
                           data=json.dumps({
                               "category": "OCR",
                               "description": "Unit name is wrong after scan",
                               "steps": "1. Scan 2. Check name"
                           }))
        assert resp.status_code == 201
        assert resp.get_json()["ok"] is True
        stored = mock_db["bug_reports"].find_one({"username": "alice"})
        assert stored["description"] == "Unit name is wrong after scan"
        assert stored["status"] == "open"

    def test_missing_description_returns_400(self, client):
        resp = client.post("/bug_report", headers=auth("alice"),
                           data=json.dumps({"category": "OCR"}))
        assert resp.status_code == 400

    def test_description_truncated_at_2000_chars(self, client, mock_db):
        long = "x" * 5000
        resp = client.post("/bug_report", headers=auth("alice"),
                           data=json.dumps({"description": long}))
        assert resp.status_code == 201
        stored = mock_db["bug_reports"].find_one({"username": "alice"})
        assert len(stored["description"]) == 2000

    def test_requires_auth(self, client):
        resp = client.post("/bug_report",
                           data=json.dumps({"description": "test"}),
                           content_type="application/json")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /auth/twitch/unlink
# ---------------------------------------------------------------------------
class TestTwitchUnlink:
    def test_unlinks_twitch(self, client, mock_db):
        mock_db["Users"].insert_one({
            "username": "alice",
            "links": {"twitch": {"user_id": "12345", "display_name": "AliceTV"}}
        })
        resp = client.post("/auth/twitch/unlink", headers=auth("alice"))
        assert resp.status_code == 200
        doc = mock_db["Users"].find_one({"username": "alice"})
        assert "twitch" not in doc.get("links", {})

    def test_user_not_found_returns_404(self, client):
        resp = client.post("/auth/twitch/unlink", headers=auth("ghost"))
        assert resp.status_code == 404

    def test_requires_auth(self, client):
        resp = client.post("/auth/twitch/unlink")
        assert resp.status_code == 401
