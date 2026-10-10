"""Accounts and history in SQLite (Python stdlib, no extra service).

One file at PAWSE_DB_PATH (default .pawse-private/pawse.db, or the temp dir if that is not writable).
The deployed demo is one always-on Cloud Run instance, so the file lasts until the next deploy; moving
to a managed database (e.g. Firestore) later only touches this module.
"""
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import tempfile
import threading
import time
from pathlib import Path

lock = threading.Lock()
conn: sqlite3.Connection | None = None
conn_path = None
SCHEMA = """
create table if not exists users (id text primary key, username text unique, password text, created real not null);
create table if not exists tokens (token text primary key, user_id text not null, created real not null);
create table if not exists history (id integer primary key autoincrement, user_id text not null, kind text not null,
                                    title text not null, detail text not null, created real not null);
create index if not exists history_user on history (user_id, created);
"""


def path():
    configured = os.getenv("PAWSE_DB_PATH")
    if configured:
        return Path(configured)
    default = Path(__file__).resolve().parent.parent / ".pawse-private" / "pawse.db"
    try:
        default.parent.mkdir(parents=True, exist_ok=True)
        if os.access(default.parent, os.W_OK):
            return default
    except OSError:
        pass
    return Path(tempfile.gettempdir()) / "pawse.db"


def db():
    global conn, conn_path
    target = path()
    if conn is None or conn_path != target:
        target.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(target, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.executescript(SCHEMA)
        conn_path = target
    return conn


def run(sql, args=()):
    with lock:
        c = db()
        rows = c.execute(sql, args).fetchall()
        c.commit()
        return rows


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1).hex()
    return f"scrypt${salt}${digest}"


def password_ok(password, stored):
    try:
        _, salt, _ = stored.split("$")
    except (AttributeError, ValueError):
        return False
    return hmac.compare_digest(hash_password(password, salt), stored)


def user_for(token):
    if not token:
        return None
    rows = run("select user_id from tokens where token = ?", (token,))
    return rows[0]["user_id"] if rows else None


def new_token(user_id):
    token = secrets.token_urlsafe(32)
    run("insert into tokens values (?, ?, ?)", (token, user_id, time.time()))
    return token


def new_guest():
    user_id = secrets.token_urlsafe(16)
    run("insert into users values (?, null, null, ?)", (user_id, time.time()))
    return user_id, new_token(user_id)


def username(user_id):
    rows = run("select username from users where id = ?", (user_id,))
    return rows[0]["username"] if rows else None


def register(user_id, name, password):
    """Turn the current guest into an account, keeping its history. Returns False if the name is taken."""
    if username(user_id):
        return False
    try:
        run("update users set username = ?, password = ? where id = ?", (name, hash_password(password), user_id))
    except sqlite3.IntegrityError:
        return False
    return True


def login(name, password, guest_id=None):
    """The account id for valid credentials (merging the guest's history into it), else None."""
    rows = run("select id, password from users where username = ?", (name,))
    if not rows or not password_ok(password, rows[0]["password"]):
        return None
    account = rows[0]["id"]
    if guest_id and guest_id != account and not username(guest_id):
        run("update history set user_id = ? where user_id = ?", (account, guest_id))
    return account


def logout(token):
    run("delete from tokens where token = ?", (token,))


def add(user_id, kind, title, detail):
    if user_id:
        run("insert into history (user_id, kind, title, detail, created) values (?, ?, ?, ?, ?)",
            (user_id, kind, title[:200], json.dumps(detail, ensure_ascii=False)[:20000], time.time()))


def history(user_id, limit=50):
    rows = run("select id, kind, title, detail, created from history where user_id = ? order by created desc limit ?", (user_id, limit))
    return [{"id": r["id"], "kind": r["kind"], "title": r["title"], "detail": json.loads(r["detail"]), "created": r["created"]} for r in rows]
