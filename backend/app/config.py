import os
from pathlib import Path

# Matches the bind-mount table in PROJECT.md 10.2. The container paths are
# the real target; env vars let this run outside Docker too (local dev, the
# sandbox test suite) without touching the actual mount points.
QUEUE_DIR = Path(os.environ.get("QUEUE_DIR", "/data/queue"))
VAULT_DIR = Path(os.environ.get("VAULT_DIR", "/data/vault"))

QUEUE_PENDING_DIR = QUEUE_DIR / "pending"
QUEUE_ARCHIVED_DIR = QUEUE_DIR / "archived"
