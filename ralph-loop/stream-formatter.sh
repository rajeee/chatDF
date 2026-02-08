#!/bin/bash
# Reads stream-json from stdin, prints human-readable live updates to stdout,
# and saves raw JSON to the log file passed as $1.
#
# Event types we care about:
#   init          → show model, tools
#   assistant     → show text content, tool_use calls
#   tool          → show tool results (truncated)
#   result        → show summary (cost, duration, turns)

LOG_FILE="${1:-/dev/null}"
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

while IFS= read -r line; do
  # Save raw JSON to log
  echo "$line" >> "$LOG_FILE"

  # Parse with lightweight field extraction (no jq dependency)
  type=$(echo "$line" | grep -o '"type":"[^"]*"' | head -1 | cut -d'"' -f4)
  subtype=$(echo "$line" | grep -o '"subtype":"[^"]*"' | head -1 | cut -d'"' -f4)

  case "$type" in
    system)
      if [[ "$subtype" == "init" ]]; then
        model=$(echo "$line" | grep -o '"model":"[^"]*"' | head -1 | cut -d'"' -f4)
        echo -e "${CYAN}[stream] Model: ${BOLD}$model${NC}"
      fi
      ;;

    assistant)
      # Extract tool_use blocks
      if echo "$line" | grep -q '"type":"tool_use"'; then
        # Extract tool name(s)
        tool_names=$(echo "$line" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | tr '\n' ', ' | sed 's/,$//')
        echo -e "${YELLOW}[tool] ${BOLD}$tool_names${NC}"

        # If it's a Task tool (subagent), show the description
        if echo "$line" | grep -q '"name":"Task"'; then
          desc=$(echo "$line" | grep -o '"description":"[^"]*"' | head -1 | cut -d'"' -f4)
          prompt_preview=$(echo "$line" | grep -o '"prompt":"[^"]*"' | head -1 | cut -d'"' -f4 | head -c 120)
          [[ -n "$desc" ]] && echo -e "  ${DIM}subagent: $desc${NC}"
          [[ -n "$prompt_preview" ]] && echo -e "  ${DIM}prompt: ${prompt_preview}...${NC}"
        fi

        # If it's Bash, show the command
        if echo "$line" | grep -q '"name":"Bash"'; then
          cmd=$(echo "$line" | grep -o '"command":"[^"]*"' | head -1 | cut -d'"' -f4 | head -c 150)
          [[ -n "$cmd" ]] && echo -e "  ${DIM}$ $cmd${NC}"
        fi

        # If it's Edit/Write, show the file
        if echo "$line" | grep -qE '"name":"(Edit|Write)"'; then
          fpath=$(echo "$line" | grep -o '"file_path":"[^"]*"' | head -1 | cut -d'"' -f4)
          [[ -n "$fpath" ]] && echo -e "  ${DIM}file: $fpath${NC}"
        fi

        # If it's Read, show the file
        if echo "$line" | grep -q '"name":"Read"'; then
          fpath=$(echo "$line" | grep -o '"file_path":"[^"]*"' | head -1 | cut -d'"' -f4)
          [[ -n "$fpath" ]] && echo -e "  ${DIM}reading: $fpath${NC}"
        fi

        # If it's Glob/Grep, show pattern
        if echo "$line" | grep -qE '"name":"(Glob|Grep)"'; then
          pattern=$(echo "$line" | grep -o '"pattern":"[^"]*"' | head -1 | cut -d'"' -f4)
          [[ -n "$pattern" ]] && echo -e "  ${DIM}pattern: $pattern${NC}"
        fi
      fi

      # Show text content (the actual response)
      if echo "$line" | grep -q '"type":"text"'; then
        text=$(echo "$line" | grep -o '"text":"[^"]*"' | tail -1 | cut -d'"' -f4 | head -c 200)
        if [[ -n "$text" ]] && ! echo "$text" | grep -qE '^\s*$'; then
          echo -e "${GREEN}[claude] ${text}${NC}"
        fi
      fi
      ;;

    result)
      cost=$(echo "$line" | grep -o '"total_cost_usd":[0-9.]*' | cut -d':' -f2)
      duration=$(echo "$line" | grep -o '"duration_ms":[0-9]*' | cut -d':' -f2)
      turns=$(echo "$line" | grep -o '"num_turns":[0-9]*' | cut -d':' -f2)
      dur_sec=$(( ${duration:-0} / 1000 ))
      echo -e "${CYAN}[done] ${turns:-?} turns, ${dur_sec}s, \$${cost:-?}${NC}"
      ;;
  esac
done
