import logging

import pytest

from app.external_push import best_effort, read_config


def test_read_config_returns_url_and_token_when_both_set(monkeypatch):
    monkeypatch.setenv("FOO_URL", "http://foo.local/")
    monkeypatch.setenv("FOO_TOKEN", "secret")
    logger = logging.getLogger("test")

    assert read_config("FOO_URL", "FOO_TOKEN", "Foo", "a", logger) == ("http://foo.local", "secret")


@pytest.mark.parametrize("unset", ["FOO_URL", "FOO_TOKEN"])
def test_read_config_returns_none_when_either_var_is_unset(monkeypatch, unset):
    monkeypatch.setenv("FOO_URL", "http://foo.local")
    monkeypatch.setenv("FOO_TOKEN", "secret")
    monkeypatch.delenv(unset, raising=False)
    logger = logging.getLogger("test")

    assert read_config("FOO_URL", "FOO_TOKEN", "Foo", "a", logger) is None


def test_best_effort_swallows_exceptions_and_falls_through():
    ran_after = False
    with best_effort(logging.getLogger("test"), "boom for %s", "a"):
        raise ValueError("network is down")
    ran_after = True

    assert ran_after


def test_best_effort_does_not_swallow_a_return_inside_the_block():
    def inner():
        with best_effort(logging.getLogger("test"), "boom for %s", "a"):
            return "success"
        return "fallback"  # noqa: unreachable when no exception is raised

    assert inner() == "success"
