import pytest

from app.capture import read_capture


def test_read_capture_returns_content(tmp_path):
    (tmp_path / "2026-08-11-13-30-10-pm.md").write_text(
        "---\nid: 2026-08-11-13-30-10-pm\n---\n\nPack for Florida tonight.\n",
        encoding="utf-8",
    )
    content = read_capture(tmp_path, "2026-08-11-13-30-10-pm")
    assert "Pack for Florida tonight." in content


def test_read_capture_rejects_missing_file(tmp_path):
    with pytest.raises(FileNotFoundError):
        read_capture(tmp_path, "does-not-exist")


def test_read_capture_rejects_path_traversal(tmp_path):
    (tmp_path.parent / "secret.md").write_text("top secret", encoding="utf-8")
    with pytest.raises(FileNotFoundError):
        read_capture(tmp_path, "../secret")
