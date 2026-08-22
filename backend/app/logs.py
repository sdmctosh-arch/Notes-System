"""Read-only access to the PowerShell processor's daily log files.

LOG_DIR is a read-only bind mount -> E:\\notes-system\\logs on the host
(PROJECT.md 10.2). Invoke-NoteProcessor-v2.ps1 is the only writer; this
module only ever reads.
"""

import re
from pathlib import Path

_FILENAME_RE = re.compile(r"^processor-(\d{4}-\d{2}-\d{2})\.log$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def list_log_dates(log_dir: Path) -> list[str]:
    if not log_dir.is_dir():
        return []
    dates = [m.group(1) for f in log_dir.iterdir() if (m := _FILENAME_RE.match(f.name))]
    return sorted(dates, reverse=True)


def read_log(log_dir: Path, date: str) -> str:
    # date drives the filename directly, so reject anything that isn't
    # exactly YYYY-MM-DD before it ever touches the filesystem - stricter
    # than the resolve()+containment check other modules use (capture.py,
    # vault.py), and simpler, since a log date has no legitimate reason to
    # contain a path separator at all.
    if not _DATE_RE.match(date):
        raise FileNotFoundError(date)

    target = log_dir / f"processor-{date}.log"
    if not target.is_file():
        raise FileNotFoundError(date)

    return target.read_text(encoding="utf-8")
