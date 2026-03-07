"""
test_auth.py — Tests for the require_auth JWT decorator and token validation.

Covers:
  - No Authorization header → 401
  - Malformed Bearer token → 401
  - Expired token → 401
  - Wrong secret → 401
  - Valid token → route proceeds, jwt_username is set
"""

import time
import pytest
import jwt as pyjwt

from conftest import make_token, TEST_SECRET


class TestRequireAuth:
    """
    We test the decorator via /your_units (GET), which is a simple
    @require_auth route that doesn't need a DB document to return 200.
    Any 401 means the decorator rejected the request before the handler ran.
    """

    def test_no_auth_header_returns_401(self, client):
        resp = client.get("/your_units")
        assert resp.status_code == 401
        assert "error" in resp.get_json()

    def test_bearer_prefix_missing_returns_401(self, client):
        resp = client.get("/your_units", headers={"Authorization": make_token("user")})
        assert resp.status_code == 401

    def test_empty_token_returns_401(self, client):
        resp = client.get("/your_units", headers={"Authorization": "Bearer "})
        assert resp.status_code == 401

    def test_expired_token_returns_401(self, client):
        token = make_token("user", expired=True)
        resp = client.get("/your_units", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401
        data = resp.get_json()
        assert "expired" in data["error"].lower() or "token" in data["error"].lower()

    def test_wrong_secret_returns_401(self, client):
        token = make_token("user", secret="wrong-secret")
        resp = client.get("/your_units", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401

    def test_garbage_token_returns_401(self, client):
        resp = client.get("/your_units", headers={"Authorization": "Bearer notajwtatall"})
        assert resp.status_code == 401

    def test_valid_token_passes_through(self, client):
        token = make_token("testuser")
        resp = client.get("/your_units", headers={"Authorization": f"Bearer {token}"})
        # The handler returns 200 with an empty list when user has no units
        assert resp.status_code == 200

    def test_valid_token_sets_correct_username(self, client, mock_db):
        """Confirm jwt_username is taken from the token, not from a header."""
        token = make_token("alice")
        # Add a unit for alice so we can confirm the username was used in the DB query
        mock_db["ImageStats"].insert_one({"unit": "Arby", "uploaded_by": "alice"})
        resp = client.get("/your_units", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.get_json()
        assert any(u["unit"] == "Arby" for u in data)

    def test_different_users_see_only_their_units(self, client, mock_db):
        mock_db["ImageStats"].insert_one({"unit": "Arby", "uploaded_by": "alice"})
        mock_db["ImageStats"].insert_one({"unit": "Krau", "uploaded_by": "bob"})

        alice_token = make_token("alice")
        resp = client.get("/your_units", headers={"Authorization": f"Bearer {alice_token}"})
        data = resp.get_json()
        units = [u["unit"] for u in data]
        assert "Arby" in units
        assert "Krau" not in units


class TestPublicRoutes:
    """Public routes should NOT require auth."""

    def test_get_unit_names_no_auth_needed(self, client):
        resp = client.get("/get_unit_names")
        assert resp.status_code == 200

    def test_profile_get_no_auth_needed(self, client, mock_db):
        mock_db["Users"].insert_one({"username": "alice", "rta_rank": "Champion"})
        resp = client.get("/profile?username=alice")
        assert resp.status_code == 200
