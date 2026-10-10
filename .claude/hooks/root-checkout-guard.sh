#!/usr/bin/env bash
# root-checkout-guard.sh: Claude Code PreToolUse (Bash) guard.
#
# Enforces "the root checkout stays on main" (AGENTS.md, Branching and worktrees).
# Several agents share the root checkout /home/azureuser/pawse and branch off it,
# so switching its branch silently moves every other session onto the wrong base.
#
# Denies `git checkout` / `git switch` to anything but `main` when the command
# would run in the ROOT checkout of a pawse clone. Linked worktrees are untouched:
# that is where branch work belongs.
#
# Root detection is git-native, not a path compare:
#   `git rev-parse --git-dir` == `--git-common-dir`  -> root checkout
#   in a linked worktree --git-dir is <common>/worktrees/<name>, so they differ.
#
# Allowed on purpose:
#   * `git checkout main` / `git switch main` (the documented recovery)
#   * pathspec restores (`git checkout -- <path>`, `git checkout <existing-file>`)
#   * PAWSE_ALLOW_ROOT_CHECKOUT=1 in the environment Claude Code was launched with
#
# BACKSTOP, NOT A GUARANTEE: it matches command text, so an aliased git, a wrapper
# script or odd quoting evades it. Cursor and other tools ignore Claude Code hooks;
# the AGENTS.md rule is the source of truth. Ported from inc-b2c-mvp's
# scripts/automation/hooks/root-checkout-guard.sh. Matrix: tests/test_worktree_guard.py.
#
# Fails open (exit 0, no output = allow) when it cannot parse its input or jq is missing.
# `set -f`: untrusted command text is word-split below; no globbing against the cwd.
set -euo pipefail
set -f

[ "${PAWSE_ALLOW_ROOT_CHECKOUT:-}" = "1" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
[ -z "$cmd" ] && exit 0

# Cheap pre-filter. Here-strings, never `printf | grep -q`: an early-exiting grep
# would SIGPIPE the writer, pipefail would turn that into a failure, and the
# `|| exit 0` would ALLOW the very command that matched.
grep -Eq '(^|[^[:alnum:]_])(checkout|switch)([^[:alnum:]_]|$)' <<<"$cmd" || exit 0

# --- sanitise ---------------------------------------------------------------
# Drop heredoc bodies and quoted spans so a command whose payload merely mentions
# a checkout (a commit message, a PR body) cannot false-positive. Quote stripping
# is a state machine across newlines; an unterminated span is re-emitted at END so
# a stray quote cannot swallow the rest of the command (fail closed).
scan=$(printf '%s' "$cmd" | awk '
  function strip_quotes(line,   out, i, c, n) {
    out = ""; n = length(line)
    for (i = 1; i <= n; i++) {
      c = substr(line, i, 1)
      if (qs == "") {
        if (c == "\\") { out = out c; if (i < n) { i++; out = out substr(line, i, 1) } }
        else if (c == SQ || c == DQ) { qs = c; pending = c }
        else out = out c
      } else if (qs == DQ && c == "\\") {
        pending = pending c
        if (i < n) { i++; pending = pending substr(line, i, 1) }
      } else if (c == qs) {
        qs = ""; pending = ""
      } else {
        pending = pending c
      }
    }
    if (qs != "") pending = pending "\n"
    return out
  }
  BEGIN { inhere = 0; q = "[\047\042]?"; SQ = "\047"; DQ = "\042"; qs = ""; pending = "" }
  {
    if (inhere == 1) { t = $0; sub(/^[ \t]+/, "", t); if (t == delim) inhere = 0; next }
    re = "<<-?[ \t]*" q "[A-Za-z_][A-Za-z0-9_]*" q
    if (match($0, re)) {
      seg = substr($0, RSTART, RLENGTH); sub(/^<<-?[ \t]*/, "", seg); gsub(/[\047\042]/, "", seg)
      delim = seg; inhere = 1
    }
    print strip_quotes($0)
  }
  END { if (qs != "") print pending }')

# `git` at a statement boundary, skipping a leading `NAME=VALUE ` run.
ASSIGN_RUN='([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*'
grep -Eq "(^|[;&|(])[[:space:]]*${ASSIGN_RUN}git([^[:alnum:]_]|$)" <<<"$scan" || exit 0

# Isolate the `git ... checkout|switch ...` statement. `sed -n 1p`, never `head -1`
# (head would SIGPIPE grep and a match would read as "no match").
SEG_RE='git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?(-[^[:space:]]+[[:space:]]+)*(checkout|switch)($|[^&|;[:alnum:]_][^&|;]*)'
seg=$(printf '%s' "$scan" | grep -Eo "$SEG_RE" | sed -n '1p' || true)
[ -z "$seg" ] && exit 0

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# --- which directories could this run in? -----------------------------------
# Fail-closed union of every plausible candidate: a decoy `cd` can only add
# scrutiny, never remove it.
base_dir=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null || true)
[ -z "$base_dir" ] && base_dir="${CLAUDE_PROJECT_DIR:-$PWD}"
[ -z "$base_dir" ] && deny "Blocked: could not tell which checkout this git checkout/switch runs in. Do branch work in a worktree: bash scripts/worktree.sh <type>/<slug>."

dirs="$base_dir"

# Only a `cd` BEFORE the checkout statement can change where it runs.
seg_at=$(printf '%s' "$scan" | grep -boE "$SEG_RE" | sed -n '1p' | cut -d: -f1 || true)
cd_scope="$scan"
if [ -n "$seg_at" ]; then
  # Offset 0 is the common case; never ask head for zero bytes (BSD head errors).
  if [ "$seg_at" -gt 0 ]; then cd_scope=$(head -c "$seg_at" <<<"$scan"); else cd_scope=""; fi
fi
CD_RE='(^|[;&|(])[[:space:]]*cd[[:space:]]+[^[:space:];&|]+'
cd_targets=$(printf '%s' "$cd_scope" | grep -Eo "$CD_RE" | sed -E 's/^[^c]*cd[[:space:]]+//' || true)

if [ -n "$cd_targets" ]; then
  # `cd X && git checkout ...` with nothing in between: the checkout runs only if
  # the cd succeeded, so base_dir is provably not where it runs. Any other join
  # (`;`, an intervening command) keeps base_dir as a candidate.
  last_cd=$(printf '%s' "$cd_scope" | grep -boE "$CD_RE" | tail -n1 || true)
  if [ -n "$last_cd" ]; then
    last_cd_off=${last_cd%%:*}
    last_cd_text=${last_cd#*:}
    last_cd_bytes=$(printf '%s' "$last_cd_text" | wc -c)
    gap=$(printf '%s' "$cd_scope" | tail -c "+$((last_cd_off + last_cd_bytes + 1))")
    grep -Eq '^[[:space:]]*&&[[:space:]]*$' <<<"$gap" && dirs=""
  fi
  while IFS= read -r ct; do
    [ -z "$ct" ] && continue
    case "$ct" in /*) dirs="$dirs
$ct" ;; *) dirs="$dirs
$base_dir/$ct" ;; esac
  done <<<"$cd_targets"
fi

# `git -C <path> checkout ...`
c_target=$(printf '%s' "$seg" | grep -Eo -- '-C[[:space:]]+[^[:space:]]+' | sed -n '1p' | sed -E 's/^-C[[:space:]]+//' || true)
if [ -n "$c_target" ]; then
  case "$c_target" in /*) dirs="$dirs
$c_target" ;; *) dirs="$dirs
$base_dir/$c_target" ;; esac
fi

# --- in scope only if some candidate is the ROOT checkout of a pawse clone --
is_target_root=0
dir=""
while IFS= read -r d; do
  [ -z "$d" ] && continue
  [ -d "$d" ] || continue
  remote=$(git -C "$d" remote get-url origin 2>/dev/null || true)
  case "$remote" in */pawse | */pawse.git | */pawse/ | *:pawse | *:pawse.git) ;; *) continue ;; esac
  gitdir=$(git -C "$d" rev-parse --absolute-git-dir 2>/dev/null || true)
  common=$(git -C "$d" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)
  if [ -z "$common" ]; then
    common=$(git -C "$d" rev-parse --git-common-dir 2>/dev/null || true)
    [ -n "$common" ] && case "$common" in /*) ;; *) common="$(cd -P "$d" && pwd)/$common" ;; esac
  fi
  [ -n "$gitdir" ] && [ -n "$common" ] || continue
  gitdir=$(cd -P "$gitdir" 2>/dev/null && pwd) || continue
  common=$(cd -P "$common" 2>/dev/null && pwd) || continue
  if [ "$gitdir" = "$common" ]; then
    is_target_root=1
    dir="$d"
    break
  fi
done <<<"$dirs"
[ "$is_target_root" -eq 1 ] || exit 0

# --- branch switch or pathspec restore? -------------------------------------
# `--` means everything after it is a pathspec: HEAD does not move.
grep -Eq -- '(^|[[:space:]])--([[:space:]]|$)' <<<"$seg" && exit 0

rest=${seg#*checkout}
case "$seg" in *switch*) [ "$rest" = "$seg" ] && rest=${seg#*switch} ;; esac

creates=""
grep -Eq -- '(^|[[:space:]])(-b|-B|-c|-C|--orphan)([[:space:]]|$)' <<<"$rest" && creates=1

target=""
for tok in $rest; do
  case "$tok" in -*) continue ;; esac
  target="$tok"
  break
done

# Returning to main is the documented recovery.
if [ -z "$creates" ] && { [ "$target" = "main" ] || [ "$target" = "origin/main" ]; }; then
  exit 0
fi
# The token names something on disk: a file restore, not a branch.
if [ -z "$creates" ] && [ -n "$target" ] && [ -e "$dir/$target" ]; then
  exit 0
fi
# Bare `git checkout` / flags only: nothing moves.
[ -z "$creates" ] && [ -z "$target" ] && exit 0

deny "Blocked: this moves the ROOT pawse checkout off main. Several agents share it and branch from it, so switching it puts every other session on the wrong base. Do branch work in a worktree instead: bash scripts/worktree.sh <type>/<slug> (AGENTS.md, Branching and worktrees). 'git checkout main' stays allowed; PAWSE_ALLOW_ROOT_CHECKOUT=1 disables this guard."
