import pytest

from app.logs import list_log_dates, read_log


def test_list_log_dates_sorted_newest_first(tmp_path):
    (tmp_path / "processor-2026-08-11.log").write_text("a", encoding="utf-8")
    (tmp_path / "processor-2026-08-20.log").write_text("b", encoding="utf-8")
    (tmp_path / "processor-2026-08-15.log").write_text("c", encoding="utf-8")

    assert list_log_dates(tmp_path) == ["2026-08-20", "2026-08-15", "2026-08-11"]


def test_list_log_dates_ignores_unrelated_files(tmp_path):
    (tmp_path / "processor-2026-08-11.log").write_text("a", encoding="utf-8")
    (tmp_path / "ledger.jsonl").write_text("{}", encoding="utf-8")
    (tmp_path / "notes.txt").write_text("x", encoding="utf-8")

    assert list_log_dates(tmp_path) == ["2026-08-11"]


def test_list_log_dates_missing_dir_returns_empty(tmp_path):
    assert list_log_dates(tmp_path / "does-not-exist") == []


def test_read_log_returns_content(tmp_path):
    (tmp_path / "processor-2026-08-11.log").write_text("started\ndone\n", encoding="utf-8")
    assert read_log(tmp_path, "2026-08-11") == "started\ndone\n"


def test_read_log_rejects_missing_date(tmp_path):
    with pytest.raises(FileNotFoundError):
        read_log(tmp_path, "2026-08-11")


def test_read_log_rejects_malformed_date(tmp_path):
    (tmp_path.parent / "secret.log").write_text("top secret", encoding="utf-8")
    with pytest.raises(FileNotFoundError):
        read_log(tmp_path, "../secret")


def test_read_log_rejects_non_date_strings(tmp_path):
    (tmp_path / "processor-2026-08-11.log").write_text("x", encoding="utf-8")
    with pytest.raises(FileNotFoundError):
        read_log(tmp_path, "not-a-date")
