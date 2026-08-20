import pytest

from app.vault import list_vault_notes, read_vault_note


def _write_note(vault_root, folder, filename, title, captured="2026-08-11T13:30:10-04:00"):
    directory = vault_root / folder
    directory.mkdir(parents=True, exist_ok=True)
    content = f'---\ntitle: "{title}"\ncategory: recipe\ncaptured: {captured}\n---\n\nBody text.\n'
    (directory / filename).write_text(content, encoding="utf-8")


def test_list_vault_notes_empty_when_no_folders(tmp_path):
    assert list_vault_notes(tmp_path) == {}


def test_list_vault_notes_groups_by_folder_with_parsed_titles(tmp_path):
    _write_note(tmp_path, "Recipes", "arroz.md", "Arroz con Gandules")
    _write_note(tmp_path, "Projects", "homelab.md", "Homelab notes")

    result = list_vault_notes(tmp_path)

    assert set(result.keys()) == {"Recipes", "Projects"}
    assert result["Recipes"] == [
        {"filename": "arroz.md", "title": "Arroz con Gandules", "captured": "2026-08-11T13:30:10-04:00"}
    ]


def test_list_vault_notes_ignores_folders_outside_the_known_category_set(tmp_path):
    # VAULT_DIR is the user's whole real vault - a folder that isn't one
    # of Recipes/Projects/Ideas/Unclassified must never be surfaced here.
    (tmp_path / "Personal Journal").mkdir()
    (tmp_path / "Personal Journal" / "private.md").write_text("secret", encoding="utf-8")

    assert list_vault_notes(tmp_path) == {}


def test_list_vault_notes_falls_back_to_filename_when_title_missing(tmp_path):
    directory = tmp_path / "Ideas"
    directory.mkdir()
    (directory / "no-frontmatter.md").write_text("Just a body, no frontmatter.", encoding="utf-8")

    result = list_vault_notes(tmp_path)
    assert result["Ideas"][0]["title"] == "no-frontmatter"


def test_read_vault_note_returns_content(tmp_path):
    _write_note(tmp_path, "Recipes", "arroz.md", "Arroz con Gandules")
    content = read_vault_note(tmp_path, "Recipes", "arroz.md")
    assert "Arroz con Gandules" in content
    assert "Body text." in content


def test_read_vault_note_rejects_unknown_folder(tmp_path):
    with pytest.raises(FileNotFoundError):
        read_vault_note(tmp_path, "Personal Journal", "private.md")


def test_read_vault_note_rejects_path_traversal(tmp_path):
    (tmp_path / "secret.txt").write_text("top secret", encoding="utf-8")
    (tmp_path / "Recipes").mkdir()

    with pytest.raises(FileNotFoundError):
        read_vault_note(tmp_path, "Recipes", "../secret.txt")


def test_read_vault_note_rejects_missing_file(tmp_path):
    (tmp_path / "Recipes").mkdir()
    with pytest.raises(FileNotFoundError):
        read_vault_note(tmp_path, "Recipes", "does-not-exist.md")


def test_read_vault_note_rejects_non_markdown_file(tmp_path):
    directory = tmp_path / "Recipes"
    directory.mkdir()
    (directory / "notes.txt").write_text("not markdown", encoding="utf-8")

    with pytest.raises(FileNotFoundError):
        read_vault_note(tmp_path, "Recipes", "notes.txt")
