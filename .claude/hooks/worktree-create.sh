#!/usr/bin/env bash
# worktree-create.sh: Claude Code WorktreeCreate hook.
#
# Puts Claude Code's managed worktrees (`claude --worktree <name>`, the EnterWorktree
# tool, subagents with isolation: "worktree") at <parent-of-root>/pawse-wt/<name>,
# the same place scripts/worktree.sh uses, on a branch off origin/main, instead of
# inside .claude/worktrees/ (an in-repo second checkout that grep and the safety
# scan would walk). A WorktreeCreate hook replaces Claude Code's own git logic.
#
# stdin : JSON with .name and .cwd
# stdout: the worktree directory and nothing else (Claude Code cd's into it)
# exit  : non-zero aborts worktree creation; every failure says why on stderr.
#
# Branch: a name that already starts with feat/ fix/ chore/ docs/ test/ research/ is
# used verbatim (dir = the part after the type), anything else gets worktree-<name>.
# PAWSE_WORKTREE_BASE_DIR relocates the base. Ported from inc-b2c-mvp's
# scripts/automation/hooks/worktree-create.sh. Tests: tests/test_worktree_guard.py.
set -euo pipefail

fail() { printf 'worktree-create: %s\n' "$1" >&2; exit 1; }

input="$(cat)"
if command -v jq >/dev/null 2>&1; then
  parsed="$(printf '%s' "$input" | jq -r '[.name // "", .cwd // ""] | @tsv')" \
    || fail "payload is not valid JSON"
else
  parsed="$(printf '%s' "$input" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(f"{d.get(\"name\") or \"\"}\t{d.get(\"cwd\") or \"\"}")')" \
    || fail "payload is not valid JSON"
fi
name="${parsed%%$'\t'*}"
cwd="${parsed#*$'\t'}"
[ -n "$name" ] || fail "payload carries no .name"

case "$name" in
  /*) fail "refusing worktree name '$name': absolute path" ;;
  *..*) fail "refusing worktree name '$name': parent-relative segment" ;;
esac
case "/$name/" in */./*) fail "refusing worktree name '$name': '.' segment" ;; esac

[ -n "$cwd" ] && [ -d "$cwd" ] || cwd="$PWD"
# The root checkout, never cwd itself: cwd may already be a linked worktree.
common_dir="$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>&1)" \
  || fail "not a git repository at $cwd: $common_dir"
root="$(dirname "$common_dir")"
base="${PAWSE_WORKTREE_BASE_DIR:-$(dirname "$root")/$(basename "$root")-wt}"

case "$name" in
  feat/* | fix/* | chore/* | docs/* | test/* | research/*)
    branch="$name"; slug="$(printf '%s' "${name#*/}" | tr '/' '-')" ;;
  *)
    slug="$(printf '%s' "$name" | tr '/' '-')"; branch="worktree-$slug" ;;
esac
dir="$base/$slug"

# Reuse: Claude Code's semantics for an existing name is "open that one".
worktrees="$(git -C "$root" worktree list --porcelain)"
if grep -qx "worktree $dir" <<<"$worktrees"; then
  have="$(git -C "$dir" rev-parse --abbrev-ref HEAD)"
  [ "$have" = "$branch" ] || fail "$dir already exists on branch $have, not $branch"
  printf '%s\n' "$dir"
  exit 0
fi
[ -e "$dir" ] && fail "$dir exists but is not a worktree of $root"

# Fresh base, best effort: offline still works from the last fetched origin/main.
git -C "$root" fetch --quiet origin >/dev/null 2>&1 || printf 'worktree-create: git fetch origin failed, using the last fetched origin/main\n' >&2
if git -C "$root" rev-parse --verify --quiet origin/main >/dev/null; then base_ref="origin/main"; else base_ref="HEAD"; fi

mkdir -p "$base" || fail "could not create $base"
if git -C "$root" show-ref --verify --quiet "refs/heads/$branch"; then
  out="$(git -C "$root" worktree add "$dir" "$branch" 2>&1)" || fail "git worktree add $dir $branch failed: $out"
else
  out="$(git -C "$root" worktree add --no-track -b "$branch" "$dir" "$base_ref" 2>&1)" \
    || fail "git worktree add -b $branch $dir $base_ref failed: $out"
fi

# Carry the git-ignored .env (never printed).
if [ -f "$root/.env" ]; then cp -p "$root/.env" "$dir/.env" || fail "could not copy .env"; fi

printf 'worktree-create: %s on branch %s (from %s). Make a venv there; npm install in web/ only to run or build the React app.\n' \
  "$dir" "$branch" "$base_ref" >&2
printf '%s\n' "$dir"
