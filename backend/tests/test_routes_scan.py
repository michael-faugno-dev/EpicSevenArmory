"""
test_routes_scan.py — Tests for routes_scan.py endpoints.

Endpoints:
  POST /scan/result  — receive detected slugs, resolve to unit IDs, upsert selected_units
  GET  /scan/debug   — return current selected_units for the authenticated user
"""

import json
import pytest
from bson import ObjectId

from conftest import make_token, TEST_SECRET


def auth(username="testuser"):
    token = make_token(username)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def insert_unit(mock_db, username, unit_name):
    doc = {"unit": unit_name, "uploaded_by": username, "attack": "1000"}
    result = mock_db["ImageStats"].insert_one(doc)
    return str(result.inserted_id)


# ---------------------------------------------------------------------------
# POST /scan/result
# ---------------------------------------------------------------------------
class TestScanResult:
    def test_requires_auth(self, client):
        resp = client.post("/scan/result",
                           data=json.dumps({"slugs": ["arby"]}),
                           content_type="application/json")
        assert resp.status_code == 401

    def test_invalid_token_rejected(self, client):
        resp = client.post("/scan/result",
                           headers={"Authorization": "Bearer garbage"},
                           data=json.dumps({"slugs": ["arby"]}),
                           content_type="application/json")
        assert resp.status_code == 401

    def test_slugs_must_be_array(self, client):
        resp = client.post("/scan/result", headers=auth("alice"),
                           data=json.dumps({"slugs": "arby"}))
        assert resp.status_code == 400

    def test_resolves_slug_to_unit_id(self, client, mock_db):
        uid = insert_unit(mock_db, "alice", "Arby")
        resp = client.post("/scan/result", headers=auth("alice"),
                           data=json.dumps({"slugs": ["arby"]}))
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["saved"][0] == uid
        assert data["saved_names"] == ["Arby"]

    def test_unmatched_slug_reported(self, client, mock_db):
        resp = client.post("/scan/result", headers=auth("alice"),
                           data=json.dumps({"slugs": ["totally-unknown-hero"]}))
        assert resp.status_code == 200
        data = resp.get_json()
        assert "totally-unknown-hero" in data["unmatched"]
        assert data["saved"][0] is None

    def test_upserts_selected_units_document(self, client, mock_db):
        uid = insert_unit(mock_db, "alice", "Krau")
        client.post("/scan/result", headers=auth("alice"),
                    data=json.dumps({"slugs": ["krau"]}))
        doc = mock_db["selected_units"].find_one({"username": "alice"})
        assert doc is not None
        assert doc["unit_id1"] == uid

    def test_caps_at_4_slugs(self, client, mock_db):
        for name in ["Arby", "Krau", "Flan", "Ran", "Straze"]:
            insert_unit(mock_db, "alice", name)
        slugs = ["arby", "krau", "flan", "ran", "straze"]
        resp = client.post("/scan/result", headers=auth("alice"),
                           data=json.dumps({"slugs": slugs}))
        data = resp.get_json()
        # Only 4 slots in saved
        assert len(data["saved"]) == 4
        assert len(data["detected_slugs"]) == 4

    def test_multi_word_slug_resolves(self, client, mock_db):
        uid = insert_unit(mock_db, "alice", "New Moon Luna")
        resp = client.post("/scan/result", headers=auth("alice"),
                           data=json.dumps({"slugs": ["new-moon-luna"]}))
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["saved"][0] == uid

    def test_empty_slugs_clears_selection(self, client, mock_db):
        # Pre-existing selection
        mock_db["selected_units"].insert_one({
            "username": "alice",
            "unit_id1": "abc", "unit_id2": "def",
            "unit_id3": None, "unit_id4": None
        })
        resp = client.post("/scan/result", headers=auth("alice"),
                           data=json.dumps({"slugs": []}))
        assert resp.status_code == 200
        doc = mock_db["selected_units"].find_one({"username": "alice"})
        assert doc["unit_id1"] is None

    def test_cannot_resolve_other_users_units(self, client, mock_db):
        insert_unit(mock_db, "bob", "Arby")   # bob's unit, not alice's
        resp = client.post("/scan/result", headers=auth("alice"),
                           data=json.dumps({"slugs": ["arby"]}))
        data = resp.get_json()
        assert data["saved"][0] is None
        assert "arby" in data["unmatched"]


# ---------------------------------------------------------------------------
# GET /scan/debug
# ---------------------------------------------------------------------------
class TestScanDebug:
    def test_requires_auth(self, client):
        resp = client.get("/scan/debug")
        assert resp.status_code == 401

    def test_returns_none_when_no_selection(self, client):
        resp = client.get("/scan/debug", headers=auth("alice"))
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["username"] == "alice"
        assert data["selected_units"] is None

    def test_returns_current_selection(self, client, mock_db):
        uid = insert_unit(mock_db, "alice", "Arby")
        mock_db["selected_units"].insert_one({
            "username": "alice",
            "unit_id1": uid, "unit_id2": None,
            "unit_id3": None, "unit_id4": None,
        })
        resp = client.get("/scan/debug", headers=auth("alice"))
        data = resp.get_json()
        assert data["selected_units"]["unit_id1"] == uid

    def test_resolved_names_returned(self, client, mock_db):
        uid = insert_unit(mock_db, "alice", "Arby")
        mock_db["selected_units"].insert_one({
            "username": "alice",
            "unit_id1": uid, "unit_id2": None,
            "unit_id3": None, "unit_id4": None,
        })
        resp = client.get("/scan/debug", headers=auth("alice"))
        data = resp.get_json()
        assert data["resolved_names"][0] == "Arby"
        assert data["resolved_names"][1] is None
