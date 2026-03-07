"""
test_cors.py — Tests for the CORS header strategy in app.py.

Three origin categories:
  1. Known web origins (localhost:3000, Render URL, etc.) → specific origin + Allow-Credentials
  2. Electron (null / empty origin) → wildcard *
  3. Unknown origin → no ACAO header set
"""

import pytest
from conftest import make_token, TEST_SECRET

KNOWN_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "https://epicsevenarmoryserver-1.onrender.com",
]

UNKNOWN_ORIGINS = [
    "http://evil.com",
    "http://localhost:9999",
    "https://notallowed.io",
]


class TestCORSActualRequest:
    """CORS headers on real (non-preflight) responses."""

    def test_known_origin_gets_specific_acao(self, client):
        for origin in KNOWN_ORIGINS:
            resp = client.get("/get_unit_names", headers={"Origin": origin})
            assert resp.headers.get("Access-Control-Allow-Origin") == origin, (
                f"Expected specific origin for {origin}"
            )

    def test_known_origin_allows_credentials(self, client):
        resp = client.get("/get_unit_names", headers={"Origin": "http://localhost:3000"})
        assert resp.headers.get("Access-Control-Allow-Credentials") == "true"

    def test_electron_null_origin_gets_wildcard(self, client):
        resp = client.get("/get_unit_names", headers={"Origin": "null"})
        assert resp.headers.get("Access-Control-Allow-Origin") == "*"

    def test_electron_empty_origin_gets_wildcard(self, client):
        # Some Electron builds omit the Origin header entirely
        resp = client.get("/get_unit_names")
        assert resp.headers.get("Access-Control-Allow-Origin") == "*"

    def test_unknown_origin_gets_no_acao(self, client):
        for origin in UNKNOWN_ORIGINS:
            resp = client.get("/get_unit_names", headers={"Origin": origin})
            acao = resp.headers.get("Access-Control-Allow-Origin")
            assert acao != origin, f"Unknown origin {origin} should not be echoed back"
            assert acao != "*", f"Unknown origin {origin} should not get wildcard"


class TestCORSPreflightRequest:
    """OPTIONS preflight responses."""

    def test_known_origin_preflight_204(self, client):
        resp = client.options(
            "/your_units",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert resp.status_code == 204

    def test_known_origin_preflight_echoes_origin(self, client):
        resp = client.options(
            "/your_units",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert resp.headers.get("Access-Control-Allow-Origin") == "http://localhost:3000"

    def test_electron_preflight_gets_wildcard(self, client):
        resp = client.options(
            "/your_units",
            headers={
                "Origin": "null",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert resp.headers.get("Access-Control-Allow-Origin") == "*"

    def test_preflight_includes_allowed_methods(self, client):
        resp = client.options(
            "/your_units",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
            },
        )
        methods = resp.headers.get("Access-Control-Allow-Methods", "")
        for method in ("GET", "POST", "PUT", "DELETE"):
            assert method in methods

    def test_preflight_includes_allowed_headers(self, client):
        resp = client.options(
            "/your_units",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Headers": "Authorization",
            },
        )
        allowed = resp.headers.get("Access-Control-Allow-Headers", "")
        assert "Authorization" in allowed

    def test_vary_header_set_for_known_origins(self, client):
        resp = client.get("/get_unit_names", headers={"Origin": "http://localhost:3000"})
        assert "Origin" in resp.headers.get("Vary", "")
