import os

import bcrypt
from fastapi import HTTPException, Request, Response
from itsdangerous import BadSignature, SignatureExpired, TimestampSigner

COOKIE_NAME = "notes_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 days - a personal, single-password tool

_PASSWORD_HASH = os.environ.get("PASSWORD_HASH")
_SECRET_KEY = os.environ.get("SECRET_KEY")

if not _PASSWORD_HASH:
    raise RuntimeError("PASSWORD_HASH environment variable is not set.")
if not _SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is not set.")

_signer = TimestampSigner(_SECRET_KEY)


def check_password(password: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), _PASSWORD_HASH.encode("utf-8"))


def set_session_cookie(response: Response) -> None:
    token = _signer.sign(b"ok").decode("ascii")
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        # No TLS in this deployment (LAN-only per PROJECT.md 10.3, no
        # certificate setup anywhere in the spec) - secure=True would make
        # the browser silently drop the cookie over plain http.
        secure=False,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME)


def _valid_session(request: Request) -> bool:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return False
    try:
        _signer.unsign(token, max_age=SESSION_MAX_AGE)
        return True
    except (BadSignature, SignatureExpired):
        return False


def require_auth(request: Request) -> None:
    if not _valid_session(request):
        raise HTTPException(status_code=401, detail="Not authenticated")
