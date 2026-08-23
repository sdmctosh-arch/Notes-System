"""Shared path-traversal guard for every module that resolves a request-
supplied name against a fixed root directory (capture.py, vault.py, logs.py,
static_files.py).

Each caller previously copy-pasted the same three-line resolve()+containment
check, then wrapped its own extra rule around it (an extension check, a
folder allowlist, a date regex). This extracts only the shared core; each
caller still owns its own extra validation and its own not-found error.
"""

from pathlib import Path


def resolve_within(root: Path, *parts: str) -> Path | None:
    target = root.joinpath(*parts).resolve()
    allowed_root = root.resolve()
    if allowed_root not in target.parents and target != allowed_root:
        return None
    return target
