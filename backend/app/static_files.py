"""Resolves a request path against the built frontend's static directory
(PROJECT.md 10.8).

Before this existed, `main.py`'s SPA catch-all served `index.html` for
*every* unmatched path - including root-level build output that isn't a
client-side route at all (`favicon.svg`, the PWA manifest, the service
worker, `icons/*.png`). A browser asking for `/favicon.svg` got HTML back
with a 200, silently. Harmless for a favicon; fatal for a service worker,
which the browser refuses to register if the response isn't valid
JavaScript. This resolves a path to a real file when one exists at that
path inside the static directory, so `main.py` can serve it as itself
instead of falling back to the shell - the same resolve()+containment
guard capture.py, vault.py, and logs.py use for their own path parameters.
"""

from pathlib import Path


def resolve_static_file(static_dir: Path, full_path: str) -> Path | None:
    target = (static_dir / full_path).resolve()
    allowed_root = static_dir.resolve()
    if allowed_root not in target.parents and target != allowed_root:
        return None
    if not target.is_file():
        return None
    return target
