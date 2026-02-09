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
CLAUDE_PID=""

cleanup() {
  echo ""
  echo -e "\033[1;33m[ralph] Caught signal — shutting down...\033[0m"
  # Kill Claude/script if running
  [[ -n "$CLAUDE_PID" ]] && kill "$CLAUDE_PID" 2>/dev/null
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

# ─── Run Claude with live streaming visibility ───
# Uses --output-format stream-json for real-time events (tool calls,
# subagent dispatches, text output). Piped through stream-formatter.sh
# for human-readable terminal output. Raw JSON saved to log file.
# Wrapped in backgrounded subshell so `wait` is interruptible by SIGINT.
STREAM_FORMATTER="$LOOP_DIR/stream-formatter.sh"

run_claude() {
  local log_file="$1"
  local budget="$2"
  local model="$3"
  local prompt="$4"

  # Subshell in background: stream-json → formatter → terminal + log
  ($CLAUDE_BIN --print --model "$model" --dangerously-skip-permissions \
    --output-format stream-json --verbose \
    --max-budget-usd "$budget" "$prompt" 2>&1 \
    | bash "$STREAM_FORMATTER" "$log_file") &
  CLAUDE_PID=$!
  wait "$CLAUDE_PID" 2>/dev/null
  local rc=$?
  CLAUDE_PID=""
  return $rc
}

# ─── Build prompts from external files ───
# Edit ralph-loop/prompt.md and ralph-loop/prune-prompt.md to change prompts
# without restarting the loop.
PROMPT_FILE="$LOOP_DIR/prompt.md"
PRUNE_PROMPT_FILE="$LOOP_DIR/prune-prompt.md"

build_prompt() {
  local iter_num="$1"
  if [[ ! -f "$PROMPT_FILE" ]]; then
    err "Prompt file not found: $PROMPT_FILE"
    exit 1
  fi
  cat "$PROMPT_FILE"
  echo ""
  echo "This is iteration #${iter_num}. Begin now."
}

build_prune_prompt() {
  if [[ ! -f "$PRUNE_PROMPT_FILE" ]]; then
    warn "Prune prompt file not found: $PRUNE_PROMPT_FILE — skipping prune"
    return 1
  fi
  cat "$PRUNE_PROMPT_FILE"
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

STOP_FILE="$LOOP_DIR/stop_condition.md"

while true; do
  iter_num=$(get_iteration_number)
  iteration=$((iteration + 1))

  # Check stop condition file
  if [[ -f "$STOP_FILE" ]] && [[ -s "$STOP_FILE" ]]; then
    reason=$(cat "$STOP_FILE")
    > "$STOP_FILE"  # Clear immediately so next start isn't blocked
    echo ""
    ok "Stop condition found: ${BOLD}$reason${NC}"
    ok "Stopped gracefully. File cleared — next start will run normally."
    break
  fi

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

  # Run Claude with PTY streaming (output goes to terminal + log file)
  cd "$PROJECT_DIR"
  run_claude "$log_file" "$MAX_BUDGET" "$MODEL" "$prompt"
  exit_code=$?

  # Stop watchdog
  stop_watchdog

  # Kill orphaned tinypool workers from vitest runs
  orphaned=$(pgrep -f "tinypool.*process\.js" 2>/dev/null | wc -l)
  if [[ $orphaned -gt 0 ]]; then
    pkill -f "tinypool.*process\.js" 2>/dev/null || true
    warn "Killed $orphaned orphaned tinypool worker(s)"
  fi

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

  run_claude "$prune_log" "0.50" "$PRUNE_MODEL" "$prune_prompt"
  prune_exit=$?

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
