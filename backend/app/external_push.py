"""Shared shape for a best-effort push to a self-hosted external service
(tandoor.py, seerr.py).

Both modules push a kept item to a service that may not be configured, over
a network call that may fail - and in either case the push must never block
filing the note itself, so nothing in main.py branches on the result; it
exists only for logging and tests (see each module's own docstring). What
they share is exactly two things: read-two-env-vars-or-skip, and
log-and-swallow around a step that might throw. Each adapter keeps its own
call sequence, auth scheme, and matching logic - those aren't shared because
they're genuinely different, not just differently spelled.
"""

import logging
import os
from contextlib import contextmanager


def read_config(
    url_env: str, token_env: str, service: str, queue_id: str, logger: logging.Logger
) -> tuple[str, str] | None:
    url = os.environ.get(url_env, "").rstrip("/")
    token = os.environ.get(token_env, "")
    if not url or not token:
        logger.info(
            "%s not configured (%s/%s unset) - skipping push for %s",
            service, url_env, token_env, queue_id,
        )
        return None
    return url, token


@contextmanager
def best_effort(logger: logging.Logger, message: str, *args):
    # Swallows any exception raised in the `with` block and logs it with
    # `message`/`args` - the caller's own code after the block still runs,
    # so a caller that didn't `return` from inside the block falls through
    # to its own failure-path return exactly as if the block had completed
    # with nothing to report.
    try:
        yield
    except Exception:
        logger.exception(message, *args)
