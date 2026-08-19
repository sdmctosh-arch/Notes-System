import importlib
import json

import bcrypt
import pytest
from fastapi.testclient import TestClient

TEST_PASSWORD = "test-password"
TEST_PASSWORD_HASH = bcrypt.hashpw(TEST_PASSWORD.encode(), bcrypt.gensalt()).decode()


@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    """A throwaway queue/vault tree, isolated per test. Reloads app.config
    and everything that imported its constants, since those are read once
    at module-import time - real code stays simple, the reload cost is
    only paid in tests."""
    queue_dir = tmp_path / "queue"
    vault_dir = tmp_path / "vault"
    (queue_dir / "pending").mkdir(parents=True)
    (queue_dir / "archived").mkdir(parents=True)
    vault_dir.mkdir()

    monkeypatch.setenv("QUEUE_DIR", str(queue_dir))
    monkeypatch.setenv("VAULT_DIR", str(vault_dir))
    monkeypatch.setenv("PASSWORD_HASH", TEST_PASSWORD_HASH)
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")

    from app import auth, config, main, storage

    importlib.reload(config)
    importlib.reload(auth)
    importlib.reload(storage)
    importlib.reload(main)

    def seed(**overrides) -> dict:
        item = {
            "queue_id": "2026-08-11-13-30-10-pm-02",
            "capture_id": "2026-08-11-13-30-10-pm",
            "category": "lookup",
            "title": "Pier 66 laundry",
            "body": "Lookup if Pier 66 has laundry.",
            "url": None,
            "url_rejected": None,
            "media_type": None,
            "timing": None,
            "proposed_automation": None,
            "approved_automation": None,
            "ambiguity_note": None,
            "captured": "2026-08-11T13:30:10-04:00",
            "created": "2026-08-18T16:08:22-04:00",
            "status": "enriched",
            "enrichment": {
                "kind": "answer",
                "summary": "Pier 66 has laundry.",
                "detail": "Pier 66 in Fort Lauderdale offers guest laundry.",
                "citations": [{"title": "Pier 66 site", "url": "https://example.org/a"}],
                "embed": None,
                "structured": None,
                "model": "gemini-3.5-flash",
                "enriched_at": "2026-08-18T17:02:11-04:00",
            },
            "processor_version": "0.2",
        }
        item.update(overrides)
        path = queue_dir / "pending" / f"{item['queue_id']}.json"
        path.write_text(json.dumps(item), encoding="utf-8")
        return item

    raw_client = TestClient(main.app)
    # Pre-authenticated by default - most tests care about queue behavior,
    # not the auth flow itself. auth_test.py exercises the raw, logged-out
    # client and the login/logout endpoints directly.
    client = TestClient(main.app)
    login_resp = client.post("/api/login", json={"password": TEST_PASSWORD})
    assert login_resp.status_code == 200

    yield type(
        "Sandbox",
        (),
        {
            "client": client,
            "raw_client": raw_client,
            "queue_dir": queue_dir,
            "vault_dir": vault_dir,
            "seed": staticmethod(seed),
            "password": TEST_PASSWORD,
        },
    )
