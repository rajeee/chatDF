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
