"""Authentication and roles for PURVA-NETRA.

Users come from a YAML file (PN_USERS, default configs/users.yaml) with bcrypt hashes — no
self-signup. A login sets a short-lived HS256 JWT in an httpOnly, SameSite=Strict cookie
(Secure unless PN_COOKIE_SECURE=false; browsers accept Secure cookies on http://localhost).

Roles: viewer (default, also anonymous) < operator < admin. The server enforces roles on every
/ops route via `require(role)`; the frontend only hides navigation.

SSO hook: set PN_AUTH_PROVIDER=oidc and implement `oidc_identity(request)` (e.g. verify an ID
token from a reverse proxy header) — `current_user` consults it before the cookie.
"""
import os, secrets, time
from collections import defaultdict, deque
from pathlib import Path

import bcrypt, jwt, yaml
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
ROLES = {"viewer": 0, "operator": 1, "admin": 2}
COOKIE = "pn_session"
TTL_S = int(os.environ.get("PN_SESSION_TTL_S", 8 * 3600))
MAX_FAILS, WINDOW_S = 5, 300

router = APIRouter(prefix="/auth", tags=["auth"])


def users_file() -> Path:
    p = Path(os.environ.get("PN_USERS", ROOT / "configs" / "users.yaml"))
    if not p.exists() and (ROOT / "configs" / "users.example.yaml").exists():
        return ROOT / "configs" / "users.example.yaml"
    return p


def load_users() -> dict:
    p = users_file()
    if not p.exists():
        return {}
    data = yaml.safe_load(p.read_text()) or {}
    return {u["username"]: u for u in data.get("users", []) if u.get("role") in ROLES}


def _secret() -> str:
    s = os.environ.get("PN_SECRET")
    if s:
        return s
    p = Path(os.environ.get("PN_OPS_DB", ROOT / "data" / "ops" / "ops.db")).parent / "session.key"
    p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists():
        p.write_text(secrets.token_hex(32)); p.chmod(0o600)
    return p.read_text().strip()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=12)).decode()


def make_token(username: str, role: str) -> str:
    now = int(time.time())
    return jwt.encode(dict(sub=username, role=role, iat=now, exp=now + TTL_S), _secret(), algorithm="HS256")


def oidc_identity(request: Request):          # SSO hook — not implemented (returns None)
    return None


def current_user(request: Request) -> dict:
    if os.environ.get("PN_AUTH_PROVIDER") == "oidc":
        ident = oidc_identity(request)
        if ident:
            return ident
    tok = request.cookies.get(COOKIE)
    if tok:
        try:
            c = jwt.decode(tok, _secret(), algorithms=["HS256"])
            u = load_users().get(c["sub"])
            if u:                                # role is re-read from users.yaml (revocation works)
                return dict(username=u["username"], role=u["role"], anonymous=False)
        except jwt.PyJWTError:
            pass
    return dict(username=None, role="viewer", anonymous=True)


def require(role: str):
    def dep(user=Depends(current_user)):
        if ROLES[user["role"]] < ROLES[role]:
            raise HTTPException(403 if not user["anonymous"] else 401 if role != "viewer" else 403,
                                f"requires role {role}")
        return user
    return dep


# ---- login rate limit (in memory: per username+IP and per IP) -------------------------------
_fails: dict[tuple, deque] = defaultdict(deque)


def _limited(key) -> bool:
    q = _fails[key]
    t = time.time()
    while q and t - q[0] > WINDOW_S:
        q.popleft()
    return len(q) >= MAX_FAILS


def reset_rate_limit():
    _fails.clear()


class Login(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: Login, request: Request, response: Response):
    from purva_netra.ops import db
    ip = request.client.host if request.client else "?"
    keys = [(body.username, ip), ("ip", ip)]
    if any(_limited(k) for k in keys):
        db.audit(body.username, "login", dict(ip=ip), "rate_limited")
        raise HTTPException(429, "Too many failed attempts. Try again in a few minutes.")
    u = load_users().get(body.username)
    ok = bool(u) and bcrypt.checkpw(body.password.encode(), u["password_hash"].encode())
    if not ok:
        for k in keys:
            _fails[k].append(time.time())
        db.audit(body.username, "login", dict(ip=ip), "failed")
        raise HTTPException(401, "Invalid username or password")
    response.set_cookie(COOKIE, make_token(u["username"], u["role"]), max_age=TTL_S, httponly=True,
                        secure=os.environ.get("PN_COOKIE_SECURE", "true").lower() != "false", samesite="strict", path="/")
    db.audit(u["username"], "login", dict(ip=ip), "ok")
    return dict(username=u["username"], role=u["role"])


@router.post("/logout")
def logout(response: Response, user=Depends(current_user)):
    from purva_netra.ops import db
    response.delete_cookie(COOKIE, path="/")
    if not user["anonymous"]:
        db.audit(user["username"], "logout", {}, "ok")
    return dict(ok=True)


@router.get("/me")
def me(user=Depends(current_user)):
    return user


if __name__ == "__main__":                    # python api/auth.py <password>  → bcrypt hash for users.yaml
    import sys
    print(hash_password(sys.argv[1]))
