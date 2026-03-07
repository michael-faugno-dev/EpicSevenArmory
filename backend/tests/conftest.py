"""
conftest.py — shared pytest fixtures for the Epic Seven Armory backend test suite.

All tests use mongomock so no real MongoDB connection is needed.
The Flask app is patched before import so it never dials Atlas.
"""

import os
import time
import pytest
import mongomock
import jwt as pyjwt

# ---------------------------------------------------------------------------
# Patch env vars before the app module is ever imported.
# This keeps Tesseract, Mongo, and external HTTP calls out of tests.
# ---------------------------------------------------------------------------
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/test_e7_armory")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("E7_DB_KEY", "test-api-key")

TEST_SECRET = "test-secret-key"


# ---------------------------------------------------------------------------
# mongomock client fixture
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def mock_mongo_client():
    return mongomock.MongoClient()


@pytest.fixture()
def mock_db(mock_mongo_client):
    """Fresh test database for each test — collections are cleared between tests."""
    db = mock_mongo_client["test_e7_armory"]
    yield db
    # Teardown: wipe all collections so tests are isolated
    for name in db.list_collection_names():
        db[name].drop()


# ---------------------------------------------------------------------------
# Flask app + test client
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def app(mock_mongo_client):
    """
    Create the Flask app once per session with mongomock injected.
    We monkeypatch MongoClient before importing app so the module-level
    client = MongoClient(...) call gets the mock instead of Atlas.
    """
    import unittest.mock as mock

    # Patch the smilegate API call so startup doesn't need internet
    with mock.patch("requests.get") as mock_get:
        mock_get.return_value = mock.MagicMock(
            status_code=200,
            json=lambda: {"en": [{"name": "Arby"}, {"name": "Frieren"}, {"name": "Krau"},
                                   {"name": "Celine"}, {"name": "Spirit Eye Celine"},
                                   {"name": "New Moon Luna"}, {"name": "Straze"},
                                   {"name": "Flan"}, {"name": "Ran"}, {"name": "Ainos 2.0"}]},
        )
        with mock.patch("pymongo.mongo_client.MongoClient", return_value=mock_mongo_client):
            # Also patch atexit.register so client.close() doesn't blow up
            with mock.patch("atexit.register"):
                # Patch sync_hero_assets so it doesn't start a background thread
                with mock.patch("scripts.sync_hero_assets.start_sync"):
                    import sys
                    # Remove cached app module so patching takes effect cleanly
                    for mod in list(sys.modules.keys()):
                        if mod in ("app", "routes_draft", "routes_scan",
                                   "routes_detect", "routes_auto_import"):
                            del sys.modules[mod]

                    import app as flask_app_module
                    flask_app = flask_app_module.app
                    flask_app.config["TESTING"] = True
                    flask_app.config["SECRET_KEY"] = TEST_SECRET
                    # Point the module-level db variable to our mock db
                    flask_app_module.db = mock_mongo_client["test_e7_armory"]
                    flask_app_module.users_collection = mock_mongo_client["test_e7_armory"]["Users"]
                    flask_app_module.image_stats_collection = mock_mongo_client["test_e7_armory"]["ImageStats"]

    return flask_app


@pytest.fixture()
def client(app, mock_db):
    """Test client with a fresh mock DB for every test."""
    import app as flask_app_module
    # Wire the app-level collections to the fresh mock_db
    flask_app_module.db = mock_db
    flask_app_module.users_collection = mock_db["Users"]
    flask_app_module.image_stats_collection = mock_db["ImageStats"]

    with app.test_client() as c:
        yield c


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------
def make_token(username: str, secret: str = TEST_SECRET, expired: bool = False) -> str:
    """Generate a valid (or intentionally expired) HS256 JWT."""
    now = int(time.time())
    payload = {
        "username": username,
        "iat": now - 7200 if expired else now,
        "exp": now - 3600 if expired else now + 3600,
    }
    return pyjwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture()
def auth_headers():
    """Return Authorization headers for a test user."""
    def _headers(username="testuser"):
        token = make_token(username)
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    return _headers
