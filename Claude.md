# Agent-Driven Development

This project uses a six-phase development approach with explicit human checkpoints between each phase. Specifications define *what* to build, plans define *how* to build it, and test documents ensure quality—all before and during implementation.

## Philosophy

Traditional software development often conflates requirements, design, and implementation. This creates:

- Premature technical decisions baked into requirements
- Specs that drift from implementation
- Untested assumptions about what "done" means
- Difficulty onboarding new contributors (human or AI)

Instead, we separate concerns into **six distinct phases**, each with clear ownership and explicit approval gates:

```
┌─────────┐    ┌─────────┐    ┌───────────┐    ┌───────────┐    ┌──────┐    ┌───────────┐
│  SPEC   │───►│  PLAN   │───►│ TEST SPEC │───►│ TEST PLAN │    │ TEST │    │  Main App │
│ (what)  │ G1 │ (how)   │ G2 │  (what)   │ G3 │  (how)    │    │(code)│    │   (code)  │
└─────────┘    └────┬────┘    └───────────┘    └─────┬─────┘    └──────┘    └───────────┘
     ▲              │              ▲                 │              ▲            ▲
  Human+AI         G5          Human+AI              G4          Subagents    Subagents
                    │                                │              ▲            ▲
                    └──────────► BEADS ◄─────────────┘              │            │
                             (task queue)───────Beads Monitor──-────┴────────────┘
```

**G1–G5** = Human approval gates. No phase begins until the previous phase is approved.

**TDD Flow**: Tests are written before implementation code. Implementation makes tests pass.

---

## Document Types

| Document | Purpose | Author | Approval |
|----------|---------|--------|----------|
| `*_spec.md` | Define *what* to build | Human + AI | Human approves |
| `*_plan.md` | Define *how* to build it | AI generates | Human approves |
| `*_test_spec.md` | Define *what* to test | Human + AI | Human approves |
| `*_test_plan.md` | Define *how* to test it | AI generates | Human approves |

---

## Project Structure

```
spec/                                # All specs, plans, and tests together
├── spec.md                          # Product vision, user types, core flows
├── plan.md                          # Overall technical approach, stack decisions
├── test.md                          # Overall test specification
├── test_plan.md                     # Overall test architecture
├── frontend/
│   ├── spec.md                      # UI layout, components, interactions
│   ├── plan.md                      # Component hierarchy, state management
│   ├── test.md                      # Frontend test specification
│   ├── test_plan.md                 # Frontend test architecture
│   └── sidebar/
│       ├── spec.md                  # Sidebar behavior, states
│       ├── plan.md                  # Sidebar implementation details
│       ├── test.md                  # Sidebar test scenarios
│       └── test_plan.md             # Sidebar test approach
└── backend/
    ├── spec.md                      # API behaviors, integrations
    ├── plan.md                      # API structure, patterns
    ├── test.md                      # API test specification
    ├── test_plan.md                 # API test architecture
    └── database/
        ├── spec.md                  # Data model, relationships
        ├── plan.md                  # ORM setup, migrations
        ├── test.md                  # Data integrity test spec
        └── test_plan.md             # Database test approach

    STATUS.md                            # Phase tracking for all documents
    README.md                            # repo map (entry points, commands, module boundaries)
    INVARIANTS.md                        # non-negotiables (security, data integrity, perf budgets, rules)
    GLOSSARY.md                          # domain terms to prevent naming drift
    Pitfalls.md                          # common pitfalls to avoid (learned from experience - update when encountered)
implementation/                      # The actual web app
```

Related documents (spec, plan, test, test_plan) live together at each level. Nest as deep as needed.

---

## Phase Details

### Phase 1: Specification (Human + AI Collaborative)

**Goal**: Define *what* the product should do from a user/product perspective.

**Process**:
1. Human provides initial vision, prototype, or requirements
2. AI asks clarifying questions, identifies gaps and edge cases
3. Human answers, Agent drafts specs. 
4. The sepc should be fully detailed and the Agent will use best judgement as much as possible without asking human for trivial and common sense spec details. For example for the chat df, the AI should write the spec.md in the main spec/ folder, inside spec/frontend/spec.md, inside spec/frontend/left_sidebar/spec.md spec/frontend/left_sidebar/chat_history/spec.md - etc - that is we should flood the spec folder with specs in all the nooks and crannies of the app - after all - any app will have some stated/unstated spec - and we will likely want to update them later as the app is refined.
5. Iterate as necessary (you might have more questions / need to fill more nooks and crannies based on previous answers)


**Spec Principles**:
- **What, not how**: Describe desired behavior and outcome, not implementation
- **Modular**: Mirror eventual code structure for easy navigation
- **Context-controlled**: Keep files small enough for AI context windows (~500 lines max)
- **Iterative**: Specs evolve as we learn more about the product.

**What belongs in specs**:
- User flows and interactions
- Data requirements and relationships
- Business rules and constraints
- Error handling expectations
- Integration points
- Success criteria

**What does NOT belong in specs**:
- Code snippets or pseudocode
- Library/framework choices (unless critical to product)
- File/folder structure of implementation
- API response formats (unless user-facing)

**Gate G1**: Human reviews and approves all spec files before planning begins.

---

### Phase 2: Planning (AI Generates → Human Reviews)

**Goal**: Define *how* to build what the specs describe. Bridge requirements to code.

**Process**:
1. AI reads approved spec files
2. AI generates implementation plan with technical decisions
3. Human reviews plan, asks questions, requests changes
4. Iterate until plan is approved
5. Human marks plan as `approved`

**Plan Principles**:
- **Technical decisions**: Framework choices, library selections, architectural patterns
- **Concrete structure**: File/folder organization, naming conventions
- **Justified choices**: Non-obvious decisions include brief rationale
- **Spec references**: Each plan section links to the spec it implements

**What belongs in plans**:
- Technology stack decisions (frameworks, libraries, tools)
- File, folder and class structure
- Component/module hierarchy
- API endpoint structure and contracts
- State management approach
- Third-party service integration details
- Performance considerations
- Security implementation approach

**What does NOT belong in plans**:
- Actual code (that's implementation)
- User-facing behavior changes (that's spec)
- Test details 

**Gate G2**: Human reviews and approves plan files. Move to the Next Phase

---

### Phase 3: Test Specification (Human + AI Collaborative)

**Goal**: Define *what* needs to be tested to verify the specs are met.

**Process**:
1. Human + AI review specs and plan
2. Identify critical paths, edge cases, error scenarios
3. Draft test specifications with acceptance criteria
4. Human marks test specs as `approved`

**Test Spec Principles**:
- **Behavior-focused**: Describe what to verify, not how to test it
- **Traceable**: Each test scenario links to the spec requirement it validates
- **Complete**: Cover happy paths, edge cases, error handling, integration points
- **Prioritized**: Critical paths clearly identified

**What belongs in test specs**:
- User scenarios to verify
- Edge cases and boundary conditions
- Error scenarios and expected handling
- Integration points to test
- Performance expectations
- Security requirements to verify
- Acceptance criteria (when is it "done"?)

**What does NOT belong in test specs**:
- Test framework choices
- Test file organization
- Mock strategies
- Test code

**Gate G3**: Human reviews and approves test specs before test planning. Move to next phase

---

### Phase 4: Test Planning (AI Generates → Human Reviews)

**Goal**: Define *how* to test what the test specs describe.

**Process**:
1. AI reads approved test specs
2. AI generates test implementation plan
3. Human reviews, approves or requests changes
4. Human marks test plan as `approved`
5. AI creates test tasks in beads, each referencing
   - Test spec section: `test_spec/backend/main_test_spec.md#auth-tests`
   - Plan section: `plan/backend/main_plan.md#auth-flow`

**Test Plan Principles**:
- **Framework decisions**: Testing libraries, assertion styles, runners
- **Organization**: Test file structure, naming conventions
- **Strategy**: Unit vs integration vs E2E distribution
- **Infrastructure**: Test databases, mocking approach, fixtures

**What belongs in test plans**:
- Testing framework choices (pytest, vitest, playwright, etc.)
- Test file organization and naming conventions
- Mock/stub/fake strategies
- Test data management (fixtures, factories, seeding)
- CI/CD integration approach
- Coverage targets and measurement
- Performance testing approach

**Gate G4**: Human reviews and approves test plans. 



### Phase 5: Beads Creation

Agent then creates the tasks in beads. The Agent will first need to review not only the test plan but all plan, the main spec, and start from environment setup and other boiler plate code as some of the first task in beads. Then, the agent will add a series of tasks to beads.
Each task will involve writing test first in test/ folder, followed by writing the implementation code in implementation/ folder and running the test to verify things working properly. Some task can also be higher level such as "Implement the side bar" and handed off to the subagent, which in turn can create it's own set of beads to add to the main beads system - but any atomic bead will involve test + code. 

---
Phase 5 and Phase 6 are then basically pulling taks from the beads in order and executing them and going in a loop.

### Phase 6: Beads Execution (Subagents Execute)

**Goal**: Write code that makes the tests pass (TDD: code after tests). The main web app code goes to implementation/

**Process**:
1. Subagents claim implementation tasks from beads
2. Subagents read referenced plan sections and specs
3. Subagents state scope: "I will implement X. I will NOT implement Y."
4. Subagents implement according to plan - writing test first followed by code
5. When a gap is discovered in the plan or spec:
   - STOP implementation immediately
   - Document the gap with specific location
   - Propose 2-3 resolution options
   - Wait for human decision
   - Update spec/plan BEFORE resuming
6. Run tests—implementation should make tests pass
7. Human reviews implementation

**Implementation Principles**:
- **Follow the plan**: Plans are requirements, not suggestions
- **Flag ambiguities**: Don't guess — surface unclear requirements
- **No spec modifications**: Implementation doesn't change specs without human approval
- **Incremental delivery**: Implement in reviewable chunks
- **Tests must pass**: Implementation is complete when tests pass

**Post-Implementation**:
- All tests passing → Ready for release
- Tests failing → Debug implementation (not tests)
- Coverage gaps → Return to Test Spec phase

---

## AI Behavior Rules

Hard constraints to prevent AI from going off-track. These are requirements, not suggestions.

### Phase-Specific Rules

**Spec Phase (AI MUST/MUST NOT)**:
- MUST ask clarifying questions before drafting but only ask non-obvious questions
- MUST surface all assumptions into the spec
- MUST NOT write pseudocode or technical solutions

**Plan Phase (AI MUST/MUST NOT)**:
- MUST reference specific spec sections for every decision
- MUST flag ambiguous spec items (don't fill gaps with assumptions)
- MUST list alternatives considered for non-obvious choices
- MUST NOT add features, behaviors, or requirements not in spec. Should instead update the spec as per user approval

**Implement Phase (AI MUST/MUST NOT)**:
- MUST implement ONLY what's in the approved plan
- MUST claim the bead before starting to implement
- MUST stop and ask when encountering serious gaps or ambiguities - but make good faith choices when choices are common sense / resonable
- MUST NOT refactor code outside the current scope
- MUST NOT add error handling, edge cases, or "nice to haves" not in spec
- MUST NOT add comments, docs, or type annotations beyond what's specified
- MUST test the code


---

## Deviation Protocol

When AI encounters something not explicitly covered in specs/plans:

```
1. STOP   — Do not proceed with assumptions
2. DOCUMENT — Note the specific gap discovered
3. ASK    — Request human guidance with 2-3 options
4. WAIT   — Do not continue until resolved
```

**Red Flags** (signs AI is going off-track):
- Adding features not in spec
- Making tech choices not in plan
- Implementing defensive code for unstated scenarios
- Refactoring "nearby" code for consistency
- Adding documentation beyond what's specified

---

## Scope Anchoring Template

Every spec and plan document should include explicit scope boundaries:

```markdown
## Scope

### In Scope
- [Explicit list of what this document covers]

### Out of Scope
- [What this does NOT cover]
- [Things AI might be tempted to add but shouldn't]

### Assumptions
- [Assumptions agent felt comfortable making]

### Open Questions
- [Unresolved items — AI MUST NOT guess answers]
```

---

## Context Loading Protocol

For multi-AI workflows or long sessions:

**Before starting any phase**:
1. AI reads the relevant spec/plan document in full
2. AI states back: "My scope is: [summary]. I will NOT: [anti-scope]."
3. Human confirms before AI proceeds

**Within a session**:
- Reference documents by section header, not memory
- When in doubt, re-read the source document
- Do not rely on conversation history for requirements

**Across AI tools**:
- Each AI receives the same approved source documents
- Handoffs include: approved docs + completion status
- New AI re-reads docs—does not trust summaries from previous AI

---

## Traceability Requirements

**Plan → Spec**: Every plan item MUST reference the spec section it implements. Items without spec references are out of scope.

**Code → Plan**: Every significant code change should reference its plan section:
```
// Implements: plan/backend/main_plan.md#auth-flow
```

**Test → Spec**: Every test scenario MUST trace to the spec requirement it validates.

---

## Beads Task System

Tasks are tracked in [beads](https://github.com/steveyegge/beads) — a git-backed task tracker for AI agents.

### When Tasks Are Created

| Phase | Creates Tasks For |
|-------|-------------------|
| Plan (approved) | Implementation work |
| Test Plan (approved) | Test writing work |

### Task Structure

Each bead task MUST include:
- **References**: Links to spec/plan sections it implements
- **Acceptance criteria**: What "done" looks like
- **Dependencies**: Other tasks that must complete first (blockedBy)

Example task hierarchy:
```
bd-a3f8       # Epic: User Authentication
bd-a3f8.1     # Task: Implement login endpoint
bd-a3f8.1.1   # Subtask: Add password validation
```

### Task Lifecycle

```
Plan approved → Tasks created in beads → Tasks marked "ready"
                                              ↓
                              Subagent claims task (atomic)
                                              ↓
                              Subagent executes, references plan
                                              ↓
                              Task marked complete with deliverable
```

---

## Subagent Monitor Process

A background process monitors beads and dispatches subagents to execute tasks.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MONITOR DAEMON                        │
│  - Polls beads for "ready" tasks (no open blockers)     │
│  - Launches subagent for each claimable task            │
│  - Tracks active subagents and their tasks              │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
    ┌────▼────┐          ┌────▼────┐          ┌────▼────┐
    │SUBAGENT │          │SUBAGENT │          │SUBAGENT │
    │  bd-a1  │          │  bd-b2  │          │  bd-c3  │
    └─────────┘          └─────────┘          └─────────┘
```

### Subagent Behavior

Each subagent:
1. **Claims** task atomically in beads
2. **Loads context**: Reads referenced spec/plan sections
3. **States scope**: "I will implement X. I will NOT implement Y."
4. **Executes**: Writes code/tests per the task requirements
5. **Reports**: Updates task with deliverable (file paths, summary)
6. **Completes**: Marks task done in beads

### Subagent Constraints

Subagents follow all AI Behavior Rules, plus:
- MUST NOT modify files outside task scope
- MUST NOT create tasks (only the planning phases create tasks)
- MUST stop and flag if task is blocked or unclear
- MUST reference task ID in all commits: `[bd-a3f8.1] Add login endpoint`

---

## Status Tracking

Each document should include a YAML frontmatter block tracking its status:

```yaml
---
status: draft | review | approved | implementing | complete
last_updated: 2026-02-05
approved_by: human
implements: ../spec/backend/main_spec.md  # for plans
tests: ../spec/backend/main_spec.md       # for test docs
---
```

**Status Definitions**:
- `draft`: Work in progress, not ready for review
- `review`: Ready for human review
- `approved`: Human has approved, ready for next phase
- `implementing`: Currently being implemented
- `complete`: Fully implemented and verified

A project-level `STATUS.md` file tracks overall phase progress:

```markdown
# Project Status

## Current Phase: Planning

| Area | Spec | Plan | Test Spec | Test Plan | Tests | Implement |
|------|------|------|-----------|-----------|-------|-----------|
| Frontend | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |
| Backend | ✅ | 🔄 | ⬜ | ⬜ | ⬜ | ⬜ |
| Database | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

Legend: ✅ Approved | 🔄 In Progress | ⬜ Not Started | ❌ Blocked
```

---

## Cross-References

Documents should reference their dependencies:

**Plans reference specs**:
```markdown
## Authentication Implementation
Implements: [Backend Auth Spec](../spec/backend/main_spec.md#authentication)
```

**Test specs reference implementation specs**:
```markdown
## OAuth Flow Tests
Tests: [Backend Auth Spec](../spec/backend/main_spec.md#authentication)
Verifies: [Auth Plan](../plan/backend/main_plan.md#oauth-implementation)
```

This creates full traceability: Requirement → Design → Implementation → Verification

---

## Why This Approach

### For Humans
- Clear checkpoints to review and course-correct
- Focus on product thinking during specs, defer technical decisions to plans
- Explicit test coverage before code ships
- Audit trail of all decisions

### For AI Agents
- Smaller, focused context (one document at a time)
- Clear success criteria at each phase
- Freedom to make technical decisions within approved constraints
- Reduced ambiguity and back-and-forth

### For the Project
- Living documentation that stays in sync with code
- Easy onboarding for new contributors
- Clear separation of concerns
- Traceable path from requirement to verified feature

---

## Updating Documents

Documents are living artifacts. Update them when:

- Requirements change (update specs first)
- Technical approach changes (update plans)
- New test scenarios identified (update test specs)
- Implementation reveals gaps (update specs → plans → code)

**Golden Rule**: Always update documents *before* changing code, maintaining document-first discipline.

**Exception**: Bug fixes for incorrectly implemented specs don't require spec changes—the spec was already correct.

---

## Quick Reference: Who Does What

| Phase | AI Role | Human Role |
|-------|---------|------------|
| 1. Spec | Draft, ask questions, identify gaps | Provide vision, answer questions, approve |
| 2. Plan | Generate technical approach, create impl tasks in beads | Review, question decisions, approve |
| 3. Test Spec | Draft test scenarios | Ensure critical paths covered, approve |
| 4. Test Plan | Generate test architecture, create test tasks in beads | Review, approve |
| 5. Test | Subagents write tests (TDD: tests first) | Review coverage |
| 6. Implement | Subagents write code to pass tests | Review code, verify against spec |

<!-- bv-agent-instructions-v1 -->

---

## Beads Workflow Integration

This project uses [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) for issue tracking. Issues are stored in `.beads/` and tracked in git.

### Essential Commands

```bash
# View issues (launches TUI - avoid in automated sessions)
bv

# CLI commands for agents (use these instead)
bd ready              # Show issues ready to work (no blockers)
bd list --status=open # All open issues
bd show <id>          # Full issue details with dependencies
bd create --title="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id> --reason="Completed"
bd close <id1> <id2>  # Close multiple issues at once
bd sync               # Commit and push changes
```

### Workflow Pattern

1. **Start**: Run `bd ready` to find actionable work
2. **Claim**: Use `bd update <id> --status=in_progress`
3. **Work**: Implement the task
4. **Complete**: Use `bd close <id>`
5. **Sync**: Always run `bd sync` at session end

### Key Concepts

- **Dependencies**: Issues can block other issues. `bd ready` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers, not words)
- **Types**: task, bug, feature, epic, question, docs
- **Blocking**: `bd dep add <issue> <depends-on>` to add dependencies

### Session Protocol

**Before ending any session, run this checklist:**

```bash
git status              # Check what changed
git add <files>         # Stage code changes
bd sync                 # Commit beads changes
git commit -m "..."     # Commit code
bd sync                 # Commit any new beads changes
git push                # Push to remote
```

### Best Practices

- Check `bd ready` at session start to find available work
- Update status as you work (in_progress → closed)
- Create new issues with `bd create` when you discover tasks
- Use descriptive titles and set appropriate priority/type
- Always `bd sync` before ending session

<!-- end-bv-agent-instructions -->
