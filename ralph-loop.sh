#!/bin/bash
# ralph-loop.sh — Autonomous continuous improvement loop for ChatDF
# Calls Claude CLI in print mode (no human input) each iteration.
# Each cycle: pick idea → implement → write tests → run tests → commit → push → update knowledge
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
MODEL="${RALPH_MODEL:-sonnet}"
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
    # grep -c may return empty string on no match
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
- Tests: Vitest (frontend), Pytest (backend) — 319 tests currently passing
- Bun runtime (no node/npm) — use ~/.bun/bin/bun
- Backend venv: implementation/backend/.venv/

## Knowledge Files (READ THESE FIRST)
1. /home/ubuntu/chatDF/ralph-loop/potential-ideas.md — ranked ideas with priority scores
2. /home/ubuntu/chatDF/ralph-loop/potential-pitfalls.md — traps to avoid
3. /home/ubuntu/chatDF/ralph-loop/lessons-learned.md — accumulated wisdom
4. /home/ubuntu/chatDF/ralph-loop/iteration-log.md — history of past iterations

## Your Process (follow exactly)

### Step 1: Read Knowledge Files
Read all 4 knowledge files above to understand what's been done and what to do next.

### Step 2: Pick ONE Idea
- Pick the highest-priority PENDING idea from potential-ideas.md
- If you see a new idea that's even better (higher priority), add it first then pick it
- Focus on: UI polish, speed feel, resource efficiency, completeness
- Do NOT add features that increase scope (no new auth providers, no new data sources, etc.)
- Prefer changes the user will immediately notice and appreciate

### Step 3: Implement
- Read the relevant source files first
- Make the implementation change
- Keep changes minimal and focused — one idea per iteration
- Follow existing code patterns and style
- Do NOT over-engineer

### Step 4: Write or Update Tests
- Add unit tests for any new logic
- For frontend: add to existing test files or create new ones under implementation/frontend/src/__tests__/
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
- In potential-ideas.md: mark the completed idea as "done" and add any new ideas you discovered
- In lessons-learned.md: add what you learned during this iteration
- In potential-pitfalls.md: add any new pitfalls discovered
- In iteration-log.md: add a row with iteration number, date, focus, ideas completed, test status, commit hash

## Rules
- NEVER skip tests. All 319+ tests must pass before committing.
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
  log "Running Claude (model=$MODEL, budget=\$$MAX_BUDGET)..."
  set +e
  cd "$PROJECT_DIR"
  $CLAUDE_BIN \
    --print \
    --model "$MODEL" \
    --dangerously-skip-permissions \
    --max-budget-usd "$MAX_BUDGET" \
    --verbose \
    "$prompt" \
    2>&1 | tee "$log_file"

  exit_code=${PIPESTATUS[0]}
  set -e

  if [[ $exit_code -eq 0 ]]; then
    ok "Iteration #$iter_num completed successfully"
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
