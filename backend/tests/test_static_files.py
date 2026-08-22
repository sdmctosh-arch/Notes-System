from app.static_files import resolve_static_file


def test_resolve_static_file_returns_existing_file(tmp_path):
    (tmp_path / "favicon.svg").write_text("<svg></svg>", encoding="utf-8")
    result = resolve_static_file(tmp_path, "favicon.svg")
    assert result == tmp_path / "favicon.svg"


def test_resolve_static_file_returns_nested_file(tmp_path):
    icons = tmp_path / "icons"
    icons.mkdir()
    (icons / "icon-192.png").write_bytes(b"\x89PNG")
    result = resolve_static_file(tmp_path, "icons/icon-192.png")
    assert result == icons / "icon-192.png"


def test_resolve_static_file_returns_none_for_missing_file(tmp_path):
    assert resolve_static_file(tmp_path, "manifest.webmanifest") is None


def test_resolve_static_file_returns_none_for_a_directory(tmp_path):
    (tmp_path / "icons").mkdir()
    assert resolve_static_file(tmp_path, "icons") is None


def test_resolve_static_file_rejects_path_traversal(tmp_path):
    outside = tmp_path.parent / "secret.txt"
    outside.write_text("top secret", encoding="utf-8")
    assert resolve_static_file(tmp_path, "../secret.txt") is None
