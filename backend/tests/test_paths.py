from app.paths import resolve_within


def test_resolve_within_returns_target_for_contained_path(tmp_path):
    assert resolve_within(tmp_path, "sub", "file.txt") == tmp_path / "sub" / "file.txt"


def test_resolve_within_returns_the_root_itself_when_no_parts_given(tmp_path):
    assert resolve_within(tmp_path) == tmp_path.resolve()


def test_resolve_within_returns_none_for_traversal_outside_root(tmp_path):
    assert resolve_within(tmp_path, "..", "secret.txt") is None


def test_resolve_within_returns_none_for_a_traversal_hidden_in_one_part(tmp_path):
    assert resolve_within(tmp_path, "../secret.txt") is None
