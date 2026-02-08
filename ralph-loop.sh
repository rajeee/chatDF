#!/bin/bash
# ralph-loop.sh — Autonomous continuous improvement loop for ChatDF
# Calls Claude CLI in print mode (no human input) each iteration.
# Each cycle: check work.md → pick idea → implement → test → commit → push → prune knowledge
#
# Usage:
#   ./ralph-loop.sh              # run loop (default: unlimited iterations)
#   ./ralph-loop.sh --max 10     # run 10 iterations then stop
#   ./ralph-loop.sh --dry-run    # print what would happen without executing
#
# Stop: Ctrl+C (or kill the PID)

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
LOOP_DIR="$PROJECT_DIR/ralph-loop"
LOG_DIR="$LOOP_DIR/logs"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
MODEL="${RALPH_MODEL:-opus}"
PRUNE_MODEL="${RALPH_PRUNE_MODEL:-opus}"
MAX_BUDGET="${RALPH_BUDGET:-5.00}"
COOLDOWN="${RALPH_COOLDOWN:-30}"
MAX_ITERATIONS="${RALPH_MAX_ITER:-0}"  # 0 = unlimited
STALL_TIMEOUT="${RALPH_STALL_TIMEOUT:-300}"  # 5 min of zero activity = stall
DRY_RUN=false

# ─── Cleanup on Ctrl+C / kill ───
WATCHDOG_PID=""
TAIL_PID=""
CLAUDE_PID=""

cleanup() {
  echo ""
  echo -e "\033[1;33m[ralph] Caught signal — shutting down...\033[0m"
  # Kill Claude if running
  [[ -n "$CLAUDE_PID" ]] && kill "$CLAUDE_PID" 2>/dev/null
  # Kill tail follower if running
  [[ -n "$TAIL_PID" ]] && kill "$TAIL_PID" 2>/dev/null
  # Kill watchdog if running
  [[ -n "$WATCHDOG_PID" ]] && kill "$WATCHDOG_PID" 2>/dev/null
  # Kill any remaining children
  pkill -P $$ 2>/dev/null || true
  sleep 1
  echo -e "\033[0;32m[ralph] Stopped.\033[0m"
  exit 0
}
trap cleanup SIGINT SIGTERM

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
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

log()  { echo -e "${CYAN}[ralph $(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}[ralph $(date +%H:%M:%S)] ✓${NC} $*"; }
err()  { echo -e "${RED}[ralph $(date +%H:%M:%S)] ✗${NC} $*"; }
warn() { echo -e "${YELLOW}[ralph $(date +%H:%M:%S)] !${NC} $*"; }

# Count completed iterations from log
get_iteration_number() {
  local count=0
  if [[ -f "$LOOP_DIR/iteration-log.md" ]]; then
    count=$(grep -c '^| [0-9]' "$LOOP_DIR/iteration-log.md" 2>/dev/null || true)
    count=${count:-0}
  fi
  echo $((count + 1))
}

# ─── Watchdog ───
# Runs in background. Kills Claude if no file activity for STALL_TIMEOUT seconds.
# Does NOT cap runtime — if Claude is actively working, it runs forever.
start_watchdog() {
  local logfile="$1"
  (
    while true; do
      sleep 30
      # If the main script died, exit
      kill -0 $$ 2>/dev/null || break

      last_log_mod=$(stat -c %Y "$logfile" 2>/dev/null || echo 0)
      now=$(date +%s)
      idle_secs=$((now - last_log_mod))

      # Check if source files or knowledge files changed more recently
      src_activity=$(find "$PROJECT_DIR/implementation" -type f -newer "$logfile" 2>/dev/null | head -1)
      kb_activity=$(find "$LOOP_DIR" -name "*.md" -newer "$logfile" 2>/dev/null | head -1)

      if [[ -n "$src_activity" ]] || [[ -n "$kb_activity" ]]; then
        continue  # Claude is actively working
      fi

      if [[ $idle_secs -gt $STALL_TIMEOUT ]]; then
        echo ""
        echo -e "${RED}[watchdog] No activity for ${idle_secs}s — API stall detected, killing Claude${NC}"
        # Kill all claude --print processes that are our children
        pkill -P $$ -f "claude.*--print" 2>/dev/null || true
        sleep 2
        pkill -9 -P $$ -f "claude.*--print" 2>/dev/null || true
        break
      fi
    done
  ) &
  WATCHDOG_PID=$!
}

stop_watchdog() {
  if [[ -n "$WATCHDOG_PID" ]]; then
    kill "$WATCHDOG_PID" 2>/dev/null
    wait "$WATCHDOG_PID" 2>/dev/null || true
    WATCHDOG_PID=""
  fi
}

# ─── Build the main iteration prompt ───
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
- Make the implementation change — plan and then implement
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

# ─── Build the pruning prompt ───
build_prune_prompt() {
  cat <<'PRUNE_EOF'
You are a knowledge file maintainer. Your job is to keep the ralph-loop knowledge files compact and useful. Ruthlessly prune fluff.

Read these 4 files and rewrite each one in place:

1. /home/ubuntu/chatDF/ralph-loop/potential-ideas.md
2. /home/ubuntu/chatDF/ralph-loop/potential-pitfalls.md
3. /home/ubuntu/chatDF/ralph-loop/lessons-learned.md
4. /home/ubuntu/chatDF/ralph-loop/work.md

## Rules for each file:

### potential-ideas.md
- DELETE all rows with status "done" or "blocked" — they are finished
- Keep all "pending" ideas
- If there are more than 30 pending ideas, remove the lowest-priority ones (priority < 1.0)
- Keep the table format intact

### potential-pitfalls.md
- REMOVE one-off issues that only applied to a single iteration and wouldn't recur
- REMOVE obvious things (e.g. "run tests before committing", "read files before editing")
- KEEP only pitfalls that are non-obvious, structural, or would waste >30 minutes if hit again
- Aim for under 20 bullet points total. Be ruthless about removing noise.

### lessons-learned.md
- DELETE individual iteration entries (### Iteration N sections) — these are ephemeral
- KEEP only genuinely reusable, non-obvious lessons under "## General Principles" or similar headers
- A good lesson saves future time. A bad lesson is just "I learned X" — obvious in hindsight.
- If a lesson is really a pitfall, move it to pitfalls.md instead of keeping it here
- Aim for under 15 bullet points total. Quality over quantity.

### work.md
- DELETE all completed `[x]` tasks — they are done, no history needed
- Keep all unchecked `[ ]` tasks exactly as they are
- Keep the file structure/headers intact

## Process
1. Read all 4 files
2. Rewrite each one in place according to rules above
3. Stage and commit: git add ralph-loop/potential-ideas.md ralph-loop/potential-pitfalls.md ralph-loop/lessons-learned.md ralph-loop/work.md && git commit -m "Prune knowledge files" && git push origin main

Do NOT modify vision.md or iteration-log.md.
PRUNE_EOF
}

# ─── Main Loop ───

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║          Ralph-Loop for ChatDF           ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""
log "Model: ${BOLD}$MODEL${NC} | Prune: $PRUNE_MODEL | Budget: \$$MAX_BUDGET/iter"
log "Cooldown: ${COOLDOWN}s | Stall detect: ${STALL_TIMEOUT}s"
[[ $MAX_ITERATIONS -gt 0 ]] && log "Max iterations: $MAX_ITERATIONS" || log "Iterations: unlimited"
log "Stop: ${BOLD}Ctrl+C${NC}"
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

  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${CYAN}  ITERATION #$iter_num${NC}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  # Show pending human tasks
  if [[ -f "$LOOP_DIR/work.md" ]]; then
    pending=$(grep -c '^\- \[ \]' "$LOOP_DIR/work.md" 2>/dev/null || true)
    pending=${pending:-0}
    if [[ $pending -gt 0 ]]; then
      warn "Human work queue: ${BOLD}$pending task(s)${NC}"
      grep '^\- \[ \]' "$LOOP_DIR/work.md" 2>/dev/null | head -3 | while IFS= read -r line; do
        echo -e "  ${YELLOW}$line${NC}"
      done
      echo ""
    fi
  fi

  # Build prompt
  prompt=$(build_prompt "$iter_num")
  log_file="$LOG_DIR/iteration-${iter_num}-$(date +%Y%m%d-%H%M%S).log"

  if $DRY_RUN; then
    warn "[DRY RUN] Prompt (${#prompt} chars):"
    echo -e "${DIM}"
    echo "$prompt" | head -20
    echo "... (truncated)"
    echo -e "${NC}"
    break
  fi

  # ═══════════════════════════════════════════
  #  PHASE 1: Main improvement iteration
  # ═══════════════════════════════════════════
  log "${BOLD}PHASE 1: Improve${NC} (model=$MODEL, budget=\$$MAX_BUDGET)"
  echo ""

  # Start watchdog in background
  touch "$log_file"
  start_watchdog "$log_file"

  # Stream log to terminal via background tail
  tail -f "$log_file" &
  TAIL_PID=$!

  # Run Claude in BACKGROUND + wait (wait is interruptible by SIGINT, unlike foreground)
  cd "$PROJECT_DIR"
  $CLAUDE_BIN \
    --print \
    --model "$MODEL" \
    --dangerously-skip-permissions \
    --max-budget-usd "$MAX_BUDGET" \
    --verbose \
    "$prompt" \
    >> "$log_file" 2>&1 &
  CLAUDE_PID=$!
  wait "$CLAUDE_PID" 2>/dev/null
  exit_code=$?
  CLAUDE_PID=""

  # Stop tail follower
  kill "$TAIL_PID" 2>/dev/null; wait "$TAIL_PID" 2>/dev/null || true
  TAIL_PID=""

  # Stop watchdog
  stop_watchdog

  echo ""
  if [[ $exit_code -eq 0 ]]; then
    ok "Iteration #$iter_num completed"
  elif [[ $exit_code -eq 143 ]] || [[ $exit_code -eq 137 ]]; then
    err "Iteration #$iter_num killed (API stall)"
    warn "Reverting uncommitted changes..."
    git checkout -- . 2>/dev/null || true
    git clean -fd 2>/dev/null || true
  else
    err "Iteration #$iter_num exited with code $exit_code"
  fi

  # ═══════════════════════════════════════════
  #  PHASE 2: Prune knowledge files
  # ═══════════════════════════════════════════
  echo ""
  log "${BOLD}PHASE 2: Prune knowledge files${NC} (model=$PRUNE_MODEL)"
  echo ""

  prune_prompt=$(build_prune_prompt)
  prune_log="$LOG_DIR/prune-${iter_num}-$(date +%Y%m%d-%H%M%S).log"

  touch "$prune_log"
  tail -f "$prune_log" &
  TAIL_PID=$!

  $CLAUDE_BIN \
    --print \
    --model "$PRUNE_MODEL" \
    --dangerously-skip-permissions \
    --max-budget-usd 0.50 \
    --verbose \
    "$prune_prompt" \
    >> "$prune_log" 2>&1 &
  CLAUDE_PID=$!
  wait "$CLAUDE_PID" 2>/dev/null
  prune_exit=$?
  CLAUDE_PID=""

  kill "$TAIL_PID" 2>/dev/null; wait "$TAIL_PID" 2>/dev/null || true
  TAIL_PID=""

  echo ""
  if [[ $prune_exit -eq 0 ]]; then
    ok "Knowledge files pruned"
  else
    warn "Prune step exited with code $prune_exit (non-critical)"
  fi

  # ═══════════════════════════════════════════
  #  Cooldown
  # ═══════════════════════════════════════════
  echo ""
  log "Cooling down ${COOLDOWN}s..."
  sleep "$COOLDOWN"
done

ok "Ralph-Loop finished after $iteration iteration(s)"
