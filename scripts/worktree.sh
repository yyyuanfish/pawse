#!/usr/bin/env bash
# Start branch work in a new linked worktree, never in the shared root checkout.
#
#   bash scripts/worktree.sh <type>/<slug>      e.g. bash scripts/worktree.sh fix/clinic-hours
#
# type: feat | fix | chore | docs | test | research (AGENTS.md rule 7)
# Creates <parent-of-root>/pawse-wt/<slug> on a new branch <type>/<slug> off a freshly
# fetched origin/main, copies .env if the root checkout has one, and prints next steps.
# Works from the root checkout or from inside any worktree. PAWSE_WORKTREE_BASE_DIR
# overrides the base directory (tests use it).
set -euo pipefail

die() { printf 'worktree.sh: %s\n' "$1" >&2; exit 1; }

branch="${1:-}"
[ -n "$branch" ] || die "usage: bash scripts/worktree.sh <feat|fix|chore|docs|test|research>/<slug>"
case "$branch" in
  feat/* | fix/* | chore/* | docs/* | test/* | research/*) ;;
  *) die "branch '$branch' must start with feat/, fix/, chore/, docs/, test/ or research/" ;;
esac
slug="${branch#*/}"
printf '%s' "$slug" | grep -Eq '^[a-z0-9][a-z0-9._-]*$' \
  || die "slug '$slug' must be lowercase letters, digits, '.', '_' or '-' (no slashes)"
case "$slug" in *..*) die "slug '$slug' must not contain '..'" ;; esac

# The root checkout, asked of git: from inside a worktree the common dir is still root's .git.
common_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
  || die "run this inside the pawse repo"
root="$(dirname "$common_dir")"
base="${PAWSE_WORKTREE_BASE_DIR:-$(dirname "$root")/$(basename "$root")-wt}"
dir="$base/$slug"

[ -e "$dir" ] && die "$dir already exists. Reuse it (cd $dir) or pick another slug."

git -C "$root" fetch --quiet origin || die "git fetch origin failed"
if git -C "$root" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  die "branch $branch already exists on origin. Pick another slug, or attach to it: git -C $root worktree add $dir $branch"
fi
git -C "$root" show-ref --verify --quiet "refs/heads/$branch" \
  && die "local branch $branch already exists. Attach to it: git -C $root worktree add $dir $branch"

mkdir -p "$base"
git -C "$root" worktree add --quiet --no-track -b "$branch" "$dir" origin/main

# Keys live only in the git-ignored .env; carry it over without ever printing it.
env_note="no .env in $root (copy .env.example to .env if you need keys)"
if [ -f "$root/.env" ]; then
  cp -p "$root/.env" "$dir/.env"
  env_note="copied .env from the root checkout"
fi

cat <<NEXT
Worktree ready: $dir
Branch:         $branch (from origin/main, $(git -C "$dir" rev-parse --short HEAD))
Env:            $env_note

Next steps:
  cd $dir
  python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
  bash scripts/check.sh          # before you push (no npm install needed)
  (cd web && npm install)        # only to run or build the React app; never symlink node_modules
  git push -u origin HEAD        # then gh pr create --base main, or push straight to main (gp skill)
After merge: git -C $root worktree remove $dir && git -C $root branch -D $branch
NEXT
