"""Root checkout stays on main: the guard hook, the WorktreeCreate hook and scripts/worktree.sh.

Builds a real root checkout plus a linked worktree in tmp_path, so the guard's root-vs-worktree
test (`--git-dir` == `--git-common-dir`) runs against git itself, not a mock. No network: origin
is a local bare repo whose path ends in `pawse.git`.
"""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
GUARD = REPO / '.claude' / 'hooks' / 'root-checkout-guard.sh'
CREATE = REPO / '.claude' / 'hooks' / 'worktree-create.sh'
WORKTREE_SH = REPO / 'scripts' / 'worktree.sh'

pytestmark = pytest.mark.skipif(not shutil.which('git') or not shutil.which('bash'),
                                reason='needs git and bash')
needs_jq = pytest.mark.skipif(not shutil.which('jq'), reason='the guard needs jq (it fails open without it)')


def _env(**extra):
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(('GIT_', 'PAWSE_ALLOW', 'PAWSE_WORKTREE'))}
    env.update(GIT_AUTHOR_NAME='t', GIT_AUTHOR_EMAIL='t@t', GIT_COMMITTER_NAME='t',
               GIT_COMMITTER_EMAIL='t@t', GIT_CONFIG_NOSYSTEM='1')
    env.update(extra)
    return env


def git(*args, cwd):
    return subprocess.run(['git', *args], cwd=cwd, env=_env(), check=True,
                          capture_output=True, text=True).stdout.strip()


@pytest.fixture(scope='module')
def repos(tmp_path_factory):
    tmp = tmp_path_factory.mktemp('wt')
    origin = tmp / 'remote' / 'pawse.git'
    root = tmp / 'pawse'
    git('init', '-q', '--bare', '-b', 'main', str(origin), cwd=tmp)
    git('init', '-q', '-b', 'main', str(root), cwd=tmp)
    git('remote', 'add', 'origin', str(origin), cwd=root)
    (root / 'README.md').write_text('hi\n')
    (root / '.gitignore').write_text('.env\n')
    git('add', 'README.md', '.gitignore', cwd=root)
    git('commit', '-q', '-m', 'init', cwd=root)
    git('push', '-q', 'origin', 'main', cwd=root)
    git('push', '-q', 'origin', 'main:fix/taken', cwd=root)
    git('fetch', '-q', 'origin', cwd=root)
    wt = tmp / 'pawse-wt' / 'feature'
    git('worktree', 'add', '-q', '-b', 'feat/wt', str(wt), 'main', cwd=root)
    other = tmp / 'other'
    git('init', '-q', '-b', 'main', str(other), cwd=tmp)
    git('remote', 'add', 'origin', 'https://example.invalid/acme/unrelated.git', cwd=other)
    git('commit', '-q', '--allow-empty', '-m', 'init', cwd=other)
    return {'root': root, 'wt': wt, 'other': other, 'tmp': tmp}


def run_guard(command, cwd, **env):
    payload = json.dumps({'tool_name': 'Bash', 'cwd': str(cwd), 'tool_input': {'command': command}})
    out = subprocess.run(['bash', str(GUARD)], input=payload, env=_env(**env),
                         capture_output=True, text=True, check=True).stdout
    return 'deny' if '"permissionDecision": "deny"' in out else 'allow'


DENY_IN_ROOT = [
    'git checkout feat/x',
    'git switch feat/x',
    'git checkout -b feat/x origin/main',
    'git switch -c feat/x',
    'git checkout --orphan clean',
    'git checkout 1a2b3c4',
    'FOO=bar git checkout feat/x',
    'git fetch origin && git checkout feat/x',
    'git checkout feat/evil && cd /tmp',
    '{wt_cd} ; git checkout -b feat/new',
    "git commit -m 'note' && git switch feat/x",
    'node -e "\nx\n" && git checkout feat/evil "z"',
]
ALLOW_IN_ROOT = [
    'git checkout main',
    'git switch main',
    'git checkout main && git pull --ff-only',
    'git checkout origin/main',
    'git checkout -- README.md',
    'git checkout -- .',
    'git checkout README.md',
    'git checkout HEAD -- README.md',
    'git status',
    'git worktree add -b feat/x ../pawse-wt/x origin/main',
    'bash scripts/worktree.sh feat/x',
    "git commit -m 'never git checkout feat/x in the root'",
    'gh pr create --body "\nrun git switch feat/x in your worktree\n"',
    "git commit -F - <<'EOF'\ngit checkout feat/x\nEOF",
    '{wt_cd} && git checkout -b feat/new',
]


@needs_jq
@pytest.mark.parametrize('command', DENY_IN_ROOT)
def test_guard_denies_branch_switch_in_root(repos, command):
    command = command.format(wt_cd=f"cd {repos['wt']}")
    assert run_guard(command, repos['root']) == 'deny'


@needs_jq
@pytest.mark.parametrize('command', ALLOW_IN_ROOT)
def test_guard_allows_main_restores_and_mentions_in_root(repos, command):
    command = command.format(wt_cd=f"cd {repos['wt']}")
    assert run_guard(command, repos['root']) == 'allow'


@needs_jq
@pytest.mark.parametrize('command', ['git checkout feat/x', 'git switch -c feat/y', 'git checkout -b feat/z origin/main'])
def test_guard_allows_branch_work_in_linked_worktree(repos, command):
    assert run_guard(command, repos['wt']) == 'allow'


@needs_jq
def test_guard_denies_retargeting_into_root_from_worktree(repos):
    assert run_guard(f"cd {repos['root']} && git checkout feat/x", repos['wt']) == 'deny'
    assert run_guard(f"git -C {repos['root']} checkout feat/x", repos['wt']) == 'deny'


@needs_jq
def test_guard_ignores_other_repos(repos):
    assert run_guard('git checkout feat/x', repos['other']) == 'allow'


@needs_jq
def test_guard_escape_hatch(repos):
    assert run_guard('git checkout feat/x', repos['root'], PAWSE_ALLOW_ROOT_CHECKOUT='1') == 'allow'


def run_create(name, cwd, base):
    payload = json.dumps({'hook_event_name': 'WorktreeCreate', 'name': name, 'cwd': str(cwd)})
    return subprocess.run(['bash', str(CREATE)], input=payload, capture_output=True, text=True,
                          env=_env(PAWSE_WORKTREE_BASE_DIR=str(base)))


def test_worktree_create_hook_lands_beside_root_off_origin_main(repos, tmp_path):
    (repos['root'] / '.env').write_text('SECRET=do-not-print\n')
    try:
        res = run_create('fix/hook-made', repos['wt'], tmp_path)  # from inside a worktree: no nesting
        assert res.returncode == 0, res.stderr
        made = Path(res.stdout.strip())
        assert made == tmp_path / 'hook-made'
        assert git('rev-parse', '--abbrev-ref', 'HEAD', cwd=made) == 'fix/hook-made'
        assert git('rev-parse', 'HEAD', cwd=made) == git('rev-parse', 'origin/main', cwd=repos['root'])
        assert (made / '.env').read_text() == 'SECRET=do-not-print\n'
        assert 'do-not-print' not in res.stdout + res.stderr
        again = run_create('fix/hook-made', repos['root'], tmp_path)  # existing name: reuse it
        assert again.returncode == 0 and Path(again.stdout.strip()) == made
        plain = run_create('agent-1234', repos['root'], tmp_path)
        assert plain.returncode == 0, plain.stderr
        assert git('rev-parse', '--abbrev-ref', 'HEAD', cwd=Path(plain.stdout.strip())) == 'worktree-agent-1234'
    finally:
        (repos['root'] / '.env').unlink()


@pytest.mark.parametrize('name', ['../escape', '/abs', 'a/./b', ''])
def test_worktree_create_hook_refuses_unsafe_names(repos, tmp_path, name):
    res = run_create(name, repos['root'], tmp_path)
    assert res.returncode != 0 and res.stdout == ''


def run_worktree_sh(branch, cwd, base):
    return subprocess.run(['bash', str(WORKTREE_SH), branch], cwd=cwd, capture_output=True, text=True,
                          env=_env(PAWSE_WORKTREE_BASE_DIR=str(base)))


def test_worktree_sh_creates_branch_off_origin_main(repos, tmp_path):
    res = run_worktree_sh('docs/new-thing', repos['wt'], tmp_path)
    assert res.returncode == 0, res.stderr
    made = tmp_path / 'new-thing'
    assert git('rev-parse', '--abbrev-ref', 'HEAD', cwd=made) == 'docs/new-thing'
    assert git('rev-parse', 'HEAD', cwd=made) == git('rev-parse', 'origin/main', cwd=repos['root'])
    assert 'never symlink node_modules' in res.stdout


@pytest.mark.parametrize('branch', ['fix/taken', 'wip/x', 'feat/Bad Slug', 'feat/a/b', ''])
def test_worktree_sh_refuses(repos, tmp_path, branch):
    res = run_worktree_sh(branch, repos['root'], tmp_path)
    assert res.returncode != 0
    assert not any(tmp_path.iterdir())
