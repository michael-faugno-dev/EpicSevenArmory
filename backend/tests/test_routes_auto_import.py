"""
test_routes_auto_import.py — Tests for routes_auto_import.py endpoints.

Endpoints:
  GET  /monitor_status          — returns hero_scanner_running flag
  POST /auto_import/set_status  — sets the flag (localhost-only)
  GET  /scan_events             — returns recent import log for a user
"""

import json
import pytest

from conftest import make_token


def auth(username="testuser"):
    token = make_token(username)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# GET /monitor_status
# ---------------------------------------------------------------------------
class TestMonitorStatus:
    def test_returns_running_flag(self, client):
        resp = client.get("/monitor_status")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "hero_scanner_running" in data
        assert isinstance(data["hero_scanner_running"], bool)

    def test_default_is_false(self, client):
        # Reset the flag first via set_status
        client.post("/auto_import/set_status",
                    data=json.dumps({"running": False}),
                    content_type="application/json",
                    environ_base={"REMOTE_ADDR": "127.0.0.1"})
        resp = client.get("/monitor_status")
        assert resp.get_json()["hero_scanner_running"] is False


# ---------------------------------------------------------------------------
# POST /auto_import/set_status
# ---------------------------------------------------------------------------
class TestSetStatus:
    def test_localhost_can_set_true(self, client):
        resp = client.post("/auto_import/set_status",
                           data=json.dumps({"running": True}),
                           content_type="application/json",
                           environ_base={"REMOTE_ADDR": "127.0.0.1"})
        assert resp.status_code == 200
        assert resp.get_json()["running"] is True

    def test_localhost_can_set_false(self, client):
        client.post("/auto_import/set_status",
                    data=json.dumps({"running": True}),
                    content_type="application/json",
                    environ_base={"REMOTE_ADDR": "127.0.0.1"})
        resp = client.post("/auto_import/set_status",
                           data=json.dumps({"running": False}),
                           content_type="application/json",
                           environ_base={"REMOTE_ADDR": "127.0.0.1"})
        assert resp.get_json()["running"] is False

    def test_external_ip_forbidden(self, client):
        resp = client.post("/auto_import/set_status",
                           data=json.dumps({"running": True}),
                           content_type="application/json",
                           environ_base={"REMOTE_ADDR": "8.8.8.8"})
        assert resp.status_code == 403

    def test_status_reflected_in_monitor_status(self, client):
        client.post("/auto_import/set_status",
                    data=json.dumps({"running": True}),
                    content_type="application/json",
                    environ_base={"REMOTE_ADDR": "127.0.0.1"})
        resp = client.get("/monitor_status")
        assert resp.get_json()["hero_scanner_running"] is True
        # Clean up
        client.post("/auto_import/set_status",
                    data=json.dumps({"running": False}),
                    content_type="application/json",
                    environ_base={"REMOTE_ADDR": "127.0.0.1"})


# ---------------------------------------------------------------------------
# GET /scan_events
# ---------------------------------------------------------------------------
class TestScanEvents:
    def test_missing_username_returns_empty(self, client):
        resp = client.get("/scan_events")
        assert resp.status_code == 200
        data = resp.get_json()
        # Route returns ok=False (not a hard error) when no username is given
        assert data["ok"] is False
        assert data["events"] == []

    def test_returns_users_events(self, client, mock_db):
        import time
        mock_db["scan_events"].insert_many([
            {"username": "alice", "event_type": "added", "hero_name": "Arby",
             "ts": time.time() * 1000, "cp": "50000", "message": "", "resolution": "", "raw_ocr": ""},
            {"username": "alice", "event_type": "updated", "hero_name": "Krau",
             "ts": time.time() * 1000, "cp": "60000", "message": "", "resolution": "", "raw_ocr": ""},
            {"username": "bob", "event_type": "added", "hero_name": "Flan",
             "ts": time.time() * 1000, "cp": "30000", "message": "", "resolution": "", "raw_ocr": ""},
        ])
        resp = client.get("/scan_events?username=alice")
        data = resp.get_json()
        assert data["ok"] is True
        assert len(data["events"]) == 2
        hero_names = {e["hero_name"] for e in data["events"]}
        assert "Arby" in hero_names
        assert "Krau" in hero_names
        assert "Flan" not in hero_names

    def test_capped_at_50_events(self, client, mock_db):
        import time
        docs = [
            {"username": "alice", "event_type": "added", "hero_name": f"Hero{i}",
             "ts": time.time() * 1000 + i, "cp": "", "message": "", "resolution": "", "raw_ocr": ""}
            for i in range(60)
        ]
        mock_db["scan_events"].insert_many(docs)
        resp = client.get("/scan_events?username=alice")
        data = resp.get_json()
        assert len(data["events"]) == 50

    def test_unknown_user_returns_empty_list(self, client):
        resp = client.get("/scan_events?username=nobody")
        data = resp.get_json()
        assert data["ok"] is True
        assert data["events"] == []
