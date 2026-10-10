"""Private, single-user voice selection. Never read by a public demo.

The approved voice is shared by every local session. A voice that is still being enrolled is kept per
browser session (keyed by a hash of its cookie), so a server restart never orphans a Gradium clone.
"""
import hashlib
import json
import os
import tempfile
from pathlib import Path
from . import public


def path():
    return Path(os.getenv('PAWSE_VOICE_PROFILE_PATH') or Path(__file__).resolve().parent.parent / '.pawse-private' / 'voice.json')


def pending_path():
    return path().with_name('pending-voices.json')


def key(owner):
    return hashlib.sha256(owner.encode()).hexdigest()


def load(target):
    try:
        value = json.loads(target.read_text())
        return value if isinstance(value, dict) else {}
    except (FileNotFoundError, ValueError):
        return {}


def dump(target, value):
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temp = tempfile.mkstemp(dir=target.parent, prefix='.voice-')
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(value, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, target)  # Atomic replacement; mkstemp creates mode 0600.
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def read():
    if public.enabled():
        return {}
    value = load(path())
    return value if value.get('approved') is True else {}


def read_pending(owner):
    if public.enabled():
        return {}
    value = load(pending_path()).get(key(owner))
    return value if isinstance(value, dict) else {}


def pending_ids():
    """Every Gradium ID held by a pending enrollment, so it is never handed to another session."""
    if public.enabled():
        return set()
    return {v for state in load(pending_path()).values() if isinstance(state, dict)
            for k, v in state.items() if k.endswith('_id') and isinstance(v, str)}


def write(state, owner=None):
    if public.enabled():
        return
    if state.get('approved'):
        dump(path(), state)
        state = {}  # Approved: the shared record now holds these IDs.
    if owner is None:
        return
    pending = load(pending_path())
    if any(k.endswith('_id') and v for k, v in state.items()):
        pending[key(owner)] = state
    elif pending.pop(key(owner), None) is None:
        return
    dump(pending_path(), pending)


def clear(owner=None):
    if public.enabled():
        return
    path().unlink(missing_ok=True)
    if owner is not None:
        write({}, owner)
