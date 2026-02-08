#!/bin/bash
# ralph-loop.sh — Autonomous continuous improvement loop for ChatDF
# Calls Claude CLI in print mode (no human input) each iteration.
# Each cycle: check work.md → pick idea → implement → test → commit → push
#
# Usage:
#   ./ralph-loop.sh              # run loop (default: unlimited iterations)
#   ./ralph-loop.sh --max 10     # run 10 iterations then stop
#   ./ralph-loop.sh --dry-run    # print what would happen without executing

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
LOOP_DIR="$PROJECT_DIR/ralph-loop"
LOG_DIR="$LOOP_DIR/logs"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
MODEL="${RALPH_MODEL:-opus}"
MAX_BUDGET="${RALPH_BUDGET:-5.00}"
COOLDOWN="${RALPH_COOLDOWN:-30}"
MAX_ITERATIONS="${RALPH_MAX_ITER:-0}"  # 0 = unlimited
DRY_RUN=false

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --max) MAX_ITERATIONS="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --model) MODEL="$2"; shift 2 ;;
    --budget) MAX_BUDGET="$2"; shift 2 ;;
    --cooldown) COOLDOWN="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Ensure dirs exist
mkdir -p "$LOG_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[ralph $(date +%H:%M:%S)]${NC} $*"; }
ok()  { echo -e "${GREEN}[ralph $(date +%H:%M:%S)] ✓${NC} $*"; }
err() { echo -e "${RED}[ralph $(date +%H:%M:%S)] ✗${NC} $*"; }
warn(){ echo -e "${YELLOW}[ralph $(date +%H:%M:%S)] !${NC} $*"; }

# Count completed iterations from log
get_iteration_number() {
  local count=0
  if [[ -f "$LOOP_DIR/iteration-log.md" ]]; then
    count=$(grep -c '^| [0-9]' "$LOOP_DIR/iteration-log.md" 2>/dev/null || true)
    count=${count:-0}
  fi
  echo $((count + 1))
}

# Build the prompt for Claude
build_prompt() {
  local iter_num="$1"
  cat <<'PROMPT_EOF'
You are the Ralph-Loop autonomous improvement agent for the ChatDF project.

## Your Mission
Make ONE focused improvement to the ChatDF codebase per iteration. The goal is to make the app feel faster, sleeker, and more polished — while using minimal resources. Think "wow factor" — speed, smoothness, visual delight.

## Project Context
- Project root: /home/ubuntu/chatDF
- Frontend: React + Vite + Tailwind at implementation/frontend/
- Backend: FastAPI + Python at implementation/backend/
- Tests: Vitest (frontend), Pytest (backend) — 319+ tests currently passing
- Bun runtime (no node/npm) — use ~/.bun/bin/bun
- Backend venv: implementation/backend/.venv/

## Knowledge Files (READ THESE FIRST — in this order)
1. /home/ubuntu/chatDF/ralph-loop/work.md — **PRIORITY QUEUE from the human**. Check this FIRST every iteration. If there are pending tasks here, do the top one BEFORE anything from ideas.md. When done, mark the task `[x]` completed.
2. /home/ubuntu/chatDF/ralph-loop/vision.md — **North star**. Read this to understand where the product is heading. Use it to generate new ideas and prioritize existing ones. All improvements should move toward this vision.
3. /home/ubuntu/chatDF/ralph-loop/potential-ideas.md — ranked ideas with priority scores
4. /home/ubuntu/chatDF/ralph-loop/potential-pitfalls.md — traps to avoid
5. /home/ubuntu/chatDF/ralph-loop/lessons-learned.md — accumulated wisdom
6. /home/ubuntu/chatDF/ralph-loop/iteration-log.md — history of past iterations

## Your Process (follow exactly)

### Step 1: Read Knowledge Files
Read ALL 6 knowledge files above. Start with work.md and vision.md.

### Step 2: Pick What to Work On
**Priority order:**
1. **work.md first**: If there are unchecked `[ ]` tasks in work.md, do the FIRST one. These are human-injected and always take priority.
2. **vision-aligned ideas**: If work.md is empty/all done, pick the highest-priority PENDING idea from potential-ideas.md. Prefer ideas that align with vision.md.
3. **New ideas**: If you spot a new high-impact idea inspired by vision.md, add it to potential-ideas.md and pick it if it's highest priority.

Do NOT add features that increase scope beyond what vision.md describes.

### Step 3: Implement
- Read the relevant source files first
- Make the implementation change
- Keep changes minimal and focused — one task per iteration
- Follow existing code patterns and style
- Do NOT over-engineer

### Step 4: Write or Update Tests
- Add unit tests for any new logic
- For frontend: add to existing test files or create new ones under implementation/frontend/tests/
- For backend: add to existing test files under implementation/backend/tests/
- Tests should be meaningful, not just coverage padding

### Step 5: Run ALL Tests
- Frontend: cd /home/ubuntu/chatDF/implementation/frontend && ~/.bun/bin/bun run test -- --run 2>&1
- Backend: cd /home/ubuntu/chatDF/implementation/backend && .venv/bin/python3 -m pytest tests/ -x -q --ignore=tests/worker/test_timeout.py 2>&1
  - Note: tests/worker/test_timeout.py has a pre-existing import error — ignore it
  - Note: test_messages_table_structure has a pre-existing failure — ignore it
  - If you need to install backend test deps: uv pip install pytest pytest-asyncio --python .venv/bin/python3
- If ANY NEW test fails (caused by your changes): fix the issue and re-run. Do NOT proceed with failing tests.
- If you cannot fix a test after 2 attempts: revert your changes and skip this idea (mark it "blocked" in ideas file)

### Step 6: Commit and Push
- Stage only your changed files (git add specific files, not git add -A)
- Write a clear commit message describing the improvement
- Push to origin main
- Format:
  git commit -m "$(cat <<'EOF'
  <commit message>

  Ralph-Loop iteration <N>
  Co-Authored-By: Claude <noreply@anthropic.com>
  EOF
  )"
  git push origin main

### Step 7: Update Knowledge Files
- **work.md**: If you completed a work.md task, mark it `[x]` with a brief note of what was done
- **potential-ideas.md**: Mark completed ideas as "done". Add any new ideas inspired by vision.md.
- **lessons-learned.md**: Add what you learned during this iteration
- **potential-pitfalls.md**: Add any new pitfalls discovered
- **iteration-log.md**: Add a row with iteration number, date, focus, ideas completed, test status, commit hash

## Rules
- NEVER skip tests. All existing tests must pass before committing.
- NEVER use git add -A or git add . (could include secrets/db files)
- NEVER modify .env files or credentials
- NEVER install new heavyweight dependencies (>50KB gzipped) without justification
- ONE improvement per iteration, keep it focused
- If something breaks, revert and try a different idea
- Always read files before editing them

PROMPT_EOF
  echo ""
  echo "This is iteration #${iter_num}. Begin now."
}

# ─── Main Loop ───

log "Starting Ralph-Loop for ChatDF"
log "Model: $MODEL | Budget/iter: \$$MAX_BUDGET | Cooldown: ${COOLDOWN}s"
[[ $MAX_ITERATIONS -gt 0 ]] && log "Max iterations: $MAX_ITERATIONS" || log "Iterations: unlimited"
echo ""

iteration=0

while true; do
  iter_num=$(get_iteration_number)
  iteration=$((iteration + 1))

  # Check max iterations
  if [[ $MAX_ITERATIONS -gt 0 && $iteration -gt $MAX_ITERATIONS ]]; then
    ok "Reached max iterations ($MAX_ITERATIONS). Stopping."
    break
  fi

  log "━━━ Iteration #$iter_num ━━━"

  # Build prompt
  prompt=$(build_prompt "$iter_num")
  log_file="$LOG_DIR/iteration-${iter_num}-$(date +%Y%m%d-%H%M%S).log"

  if $DRY_RUN; then
    warn "[DRY RUN] Would execute Claude with prompt (${#prompt} chars)"
    warn "[DRY RUN] Log would be at: $log_file"
    break
  fi

  # Run Claude in print mode (non-interactive, no permission prompts)
  # A watchdog monitors for API stalls (0 activity for STALL_TIMEOUT seconds).
  # This does NOT cap total runtime — if Claude is actively working, it runs forever.
  STALL_TIMEOUT="${RALPH_STALL_TIMEOUT:-300}"  # 5 min of zero activity = stall
  log "Running Claude (model=$MODEL, budget=\$$MAX_BUDGET, stall_detect=${STALL_TIMEOUT}s)..."
  set +e
  cd "$PROJECT_DIR"

  # Launch Claude in background, piping through tee
  $CLAUDE_BIN \
    --print \
    --model "$MODEL" \
    --dangerously-skip-permissions \
    --max-budget-usd "$MAX_BUDGET" \
    --verbose \
    "$prompt" \
    2>&1 | tee "$log_file" &
  tee_pid=$!
  # The actual claude process is the parent of tee in the pipeline
  claude_pid=$(jobs -p | head -1)

  # Watchdog: kill only if no file activity (git changes OR log output) for STALL_TIMEOUT
  (
    while kill -0 "$tee_pid" 2>/dev/null; do
      sleep 30
      # Check if claude is still alive
      if ! kill -0 "$tee_pid" 2>/dev/null; then
        break
      fi
      # Measure seconds since last activity:
      #   1) log file growing = Claude producing output
      #   2) any file in implementation/ modified = Claude working via tools
      last_log_mod=$(stat -c %Y "$log_file" 2>/dev/null || echo 0)
      last_src_mod=$(find "$PROJECT_DIR/implementation" -type f -newer "$log_file" 2>/dev/null | head -1)
      now=$(date +%s)
      idle_secs=$((now - last_log_mod))

      if [[ -n "$last_src_mod" ]]; then
        # Source files changed more recently than log — Claude is working
        continue
      fi

      if [[ $idle_secs -gt $STALL_TIMEOUT ]]; then
        echo "[watchdog] No activity for ${idle_secs}s — killing stalled Claude process" >&2
        kill "$tee_pid" 2>/dev/null
        # Also kill any child claude processes
        pkill -P "$tee_pid" 2>/dev/null || true
        break
      fi
    done
  ) &
  watchdog_pid=$!

  # Wait for Claude to finish (or be killed by watchdog)
  wait "$tee_pid" 2>/dev/null
  exit_code=$?

  # Clean up watchdog
  kill "$watchdog_pid" 2>/dev/null
  wait "$watchdog_pid" 2>/dev/null

  set -e

  if [[ $exit_code -eq 0 ]]; then
    ok "Iteration #$iter_num completed successfully"
  elif [[ $exit_code -eq 143 ]] || [[ $exit_code -eq 137 ]]; then
    err "Iteration #$iter_num killed by watchdog (API stall detected)"
    warn "Reverting any uncommitted changes..."
    git checkout -- . 2>/dev/null || true
    git clean -fd 2>/dev/null || true
  else
    err "Iteration #$iter_num failed (exit code: $exit_code)"
    warn "Check log: $log_file"
  fi

  # Cooldown between iterations
  log "Cooling down for ${COOLDOWN}s..."
  sleep "$COOLDOWN"
  echo ""
done

ok "Ralph-Loop finished after $iteration iteration(s)"
