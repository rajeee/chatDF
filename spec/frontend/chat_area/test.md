---
status: draft
last_updated: 2026-02-05
tests:
  - ./spec.md
  - ./onboarding/spec.md
  - ./message_list/spec.md
  - ./chat_input/spec.md
  - ./sql_panel/spec.md
  - ./data_grid/spec.md
  - ./loading_states/spec.md
---

# Chat Area Test Specification

## Scope

### In Scope
- Chat area container states and layout
- Onboarding guide (display, sample data, prompt chips)
- Message list (layout, streaming, auto-scroll, per-message actions)
- Chat input (send, stop, disabled states, character limit)
- SQL panel (open/close, content replacement, copy)
- Data grid (sort, resize, pagination, cell handling, copy, empty state)
- Loading states (three phases, timeout, error, interruption)

### Out of Scope
- WebSocket protocol details (see backend tests)
- SQL execution and generation (see backend tests)
- Dataset loading mechanics (see right panel tests)

---

## 1. Chat Area Container

Tests: [spec.md#states](./spec.md#states)

### 1.1 State: No Datasets Loaded

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| CA-01 | Onboarding shown | Message list area replaced by onboarding guide |
| CA-02 | Chat input enabled | User can type even without datasets loaded |
| CA-03 | SQL panel not available | No "Show SQL" buttons present (no queries yet) |

### 1.2 State: Datasets Loaded, No Messages

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| CA-04 | Suggested prompts shown | 3-4 clickable prompt chips displayed based on dataset schema |
| CA-05 | Chat input enabled | Standard placeholder: "Ask a question about your data..." |
| CA-06 | Clicking chip sends message | Clicking a suggested prompt chip sends it as a user message |

### 1.3 State: Active Conversation

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| CA-07 | Message list shows history | All conversation messages rendered in chronological order |
| CA-08 | Chat input enabled | User can type new messages |
| CA-09 | SQL panel available | "Show SQL" buttons visible on messages that contain SQL |

### 1.4 State: Streaming Response

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| CA-10 | New bubble appears | New assistant message bubble appears immediately when streaming starts |
| CA-11 | Stop button shown | Send button replaced with stop button during streaming |
| CA-12 | Auto-scroll follows | Message list auto-scrolls to follow streaming content |

### 1.5 Conversation Loading

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| CA-13 | Messages populated | Selecting a conversation populates message list with stored messages |
| CA-14 | Datasets loaded | Associated datasets load in right panel |
| CA-15 | Scrolls to bottom | Message list scrolls to bottom after loading |
| CA-16 | Chat input active | Input becomes active after conversation loads |

---

## 2. Onboarding

Tests: [onboarding/spec.md](./onboarding/spec.md)

### 2.1 Display Condition

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| OB-01 | Shown when no datasets | Onboarding displayed when no datasets loaded in current conversation |
| OB-02 | Replaces message list | Onboarding occupies the message list area |
| OB-03 | Centered layout | Content centered vertically and horizontally |

### 2.2 Content and Sample Data

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| OB-04 | Branding and description | App logo, "ChatDF" title, and description text visible |
| OB-05 | Step-by-step guide | Three steps displayed: add URL, ask question, get answers |
| OB-06 | Try with sample data button | Prominent CTA button: "Try with sample data" |
| OB-07 | Button loads demo dataset | Clicking loads preconfigured demo parquet URL into right panel |
| OB-08 | Button disables on click | Button disables and shows loading spinner while dataset loads |
| OB-09 | Dataset card appears | New dataset card appears in right panel in loading state |

### 2.4 Example Prompt Chips

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| OB-10 | Chips appear after sample load | 3-4 clickable example prompt chips appear after sample data loads |
| OB-11 | Clicking chip sends message | Clicking a chip sends its text as a user message |
| OB-12 | Step guide fades | Step-by-step guide transitions out when chips appear |

### 2.5 Disappearance

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| OB-13 | Disappears on first message | Entire onboarding disappears; message list renders in its place |

---

## 3. Message List

Tests: [message_list/spec.md](./message_list/spec.md)

### 3.1 Message Layout

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| ML-01 | User messages right-aligned | User messages positioned on the right side |
| ML-02 | Assistant messages left-aligned | Assistant messages positioned on the left side |
| ML-03 | Distinct background colors | User and assistant messages have different background colors |
| ML-04 | Chronological order | Messages rendered oldest first, newest at bottom |
| ML-05 | Consistent spacing | Uniform vertical spacing between messages |

### 3.2 Message Content

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| ML-06 | User messages plain text | User messages rendered as plain text (no markdown) |
| ML-07 | Assistant messages render markdown | Headings, bold, italic, lists, code blocks rendered correctly |
| ML-08 | Data tables inline | Query results rendered as inline DataGrid within assistant messages |
| ML-09 | Show SQL button | "Show SQL" button appears on messages where SQL was executed |
| ML-10 | Error messages styled | Error messages use error color with expandable "Details" section |
| ML-11 | Timestamps on hover | Hovering a message reveals its timestamp |

### 3.3 Streaming

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| ML-12 | Tokens appended in real-time | Text tokens appear as they arrive via WebSocket |
| ML-13 | Typing indicator shown | Animated dots shown at cursor position during active streaming |
| ML-14 | Markdown rendered progressively | Partial markdown rendered as tokens stream in |
| ML-15 | Indicator removed on complete | Typing indicator removed when streaming completes |
| ML-16 | Final message fully rendered | After streaming, all content types visible (text, tables, SQL button) |

### 3.4 Auto-Scroll

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| ML-17 | Auto-scroll on new messages | List scrolls to bottom when new messages arrive |
| ML-18 | Auto-scroll pauses on manual scroll | If user scrolls up, auto-scroll pauses |
| ML-19 | Scroll-to-bottom button appears | Button appears when user is scrolled up and new content arrives |
| ML-20 | Clicking button resumes auto-scroll | Clicking "scroll to bottom" scrolls down and resumes auto-scroll |

### 3.5 Per-Message Actions

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| ML-21 | Copy button on hover | Copy button appears on hover for each message |
| ML-22 | Copy assistant markdown source | Copy on assistant messages copies markdown source, not rendered HTML |
| ML-23 | Show SQL opens panel | Clicking "Show SQL" on a message opens the SQL panel with that query |

---

## 4. Chat Input

Tests: [chat_input/spec.md](./chat_input/spec.md)

### 4.1 Sending Messages

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| CI-01 | Enter sends message | Pressing Enter (non-empty input) sends the message |
| CI-02 | Shift+Enter inserts newline | Pressing Shift+Enter adds a newline, does not send |
| CI-03 | Send button sends | Clicking the send button arrow icon sends the message |
| CI-04 | Input clears on send | After sending, input text clears immediately |
| CI-05 | Message appears in list | Sent message appears in message list immediately |
| CI-06 | Whitespace trimmed | Leading and trailing whitespace trimmed before sending |

### 4.2 Empty Message Prevention

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| CI-07 | Empty input prevents send | Enter does nothing when input is empty |
| CI-08 | Send button disabled when empty | Send button visually disabled when input is empty |
| CI-09 | Whitespace-only prevents send | Input containing only whitespace cannot be sent |

### 4.3 Auto-Resize

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| CI-10 | Starts at 1 line | Textarea initially renders at single-line height |
| CI-11 | Grows up to 5 lines | Textarea height increases as user types, up to ~5 lines |
| CI-12 | Scrolls beyond 5 lines | Beyond 5 lines, height stays fixed and content scrolls internally |
| CI-13 | Shrinks on content removal | Textarea shrinks back when text is deleted |

### 4.4 Stop Button

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| CI-14 | Stop button during streaming | Send button replaced with stop button (square icon) while assistant responds |
| CI-15 | Click stop cancels stream | Clicking stop cancels in-progress streaming |
| CI-16 | Partial response preserved | After stopping, whatever content was received so far remains visible |
| CI-17 | Input returns to normal | After stopping, send button reappears |

### 4.5 Disabled States

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| CI-18 | Enabled without datasets | Input enabled even when no datasets are loaded |
| CI-19 | Enabled during streaming | User can type ahead while assistant is responding (send disabled) |
| CI-20 | Disabled at daily limit | Input disabled when daily limit reached |
| CI-21 | Limit placeholder | When limit reached, placeholder reads "Daily limit reached" |

### 4.6 Character Limit

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| CI-22 | Soft limit 2000 characters | Character counter appears when input exceeds 1800 characters |
| CI-23 | Counter format | Counter displays "1,847 / 2,000" format |
| CI-24 | Warning color at limit | Counter turns warning color at 2000 characters |
| CI-25 | Typing prevented at limit | Additional typing prevented beyond 2000 characters |
| CI-26 | Paste truncation | Pasting text that exceeds limit truncates at 2000 characters |

---

## 5. SQL Panel

Tests: [sql_panel/spec.md](./sql_panel/spec.md)

### 5.1 Opening

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| SP-01 | Opens from Show SQL button | Clicking "Show SQL" on an assistant message opens the SQL panel |
| SP-02 | Slides up from bottom | Panel slides up from bottom of chat area (~200ms animation) |
| SP-03 | Height ~40% of chat area | Panel occupies approximately 40% of chat area height |
| SP-04 | Message list shrinks | Message list area reduces to accommodate the panel |

### 5.2 Toggle Behavior

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| SP-05 | Same button closes panel | Clicking the same "Show SQL" button again closes the panel |
| SP-06 | Different SQL replaces | Clicking "Show SQL" on a different message replaces panel content |
| SP-07 | No animation on replace | Content replacement happens without animation |

### 5.3 Content

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| SP-08 | SQL syntax highlighted | SQL query displayed with syntax highlighting (read-only) |
| SP-09 | Copy SQL button | Copy button copies SQL text to clipboard |

### 5.4 Closing

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| SP-10 | Close via X button | X icon in top-right corner closes the panel |
| SP-11 | Close via Escape | Pressing Escape when panel is focused closes it |
| SP-12 | Close via same Show SQL | Clicking the same "Show SQL" button toggles panel closed |
| SP-13 | Slide-down animation | Panel slides down on close (~200ms) |
| SP-14 | Only one panel at a time | Opening a new SQL panel closes any existing one |

---

## 6. Data Grid

Tests: [data_grid/spec.md](./data_grid/spec.md)

### 6.1 Display

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DG-01 | Inline in assistant message | Data grid rendered inline within assistant message bubble |
| DG-02 | Bordered container | Grid visually distinct from message text with border |
| DG-03 | Max height with scroll | Grid limited to ~400px height, then vertical scroll |
| DG-04 | Horizontal scroll for wide tables | Tables wider than message area trigger horizontal scroll |

### 6.2 Headers and Sorting

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DG-05 | Sticky headers | Header row stays visible while scrolling vertically |
| DG-06 | Column names as-is | Headers display column names from query results unchanged |
| DG-07 | First click: ascending | Clicking a header sorts ascending with up arrow indicator |
| DG-08 | Second click: descending | Second click on same header sorts descending with down arrow |
| DG-09 | Third click: remove sort | Third click removes sort, returns to original order |
| DG-10 | Single-column sort only | Sorting one column removes sort from any previously sorted column |

### 6.3 Column Resizing

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DG-11 | Drag to resize | Dragging right edge of header cell resizes column |
| DG-12 | Minimum width enforced | Columns cannot be resized below ~50px |
| DG-13 | No maximum width | Columns can stretch beyond container, triggering horizontal scroll |
| DG-14 | Double-click auto-fits | Double-clicking column border auto-fits to content width |

### 6.4 Pagination

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DG-15 | 50 rows per page | Grid displays 50 rows per page |
| DG-16 | Previous and Next buttons | Navigation buttons displayed below the grid |
| DG-17 | Page indicator | Shows "Page 1 of 17" format |
| DG-18 | Row count shown | Shows "Showing 1-50 of 847 rows" format |
| DG-19 | First page disables Previous | Previous button disabled on first page |
| DG-20 | Last page disables Next | Next button disabled on last page |

### 6.5 Cell Content

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DG-21 | Text truncation with ellipsis | Long cell text truncated with ellipsis |
| DG-22 | Tooltip on hover | Full cell content shown in tooltip on hover |
| DG-23 | Null values styled | Null values displayed as italic "null" in muted color |
| DG-24 | Numbers right-aligned | Numeric values right-aligned in cells |
| DG-25 | Text left-aligned | Text values left-aligned in cells |
| DG-26 | Read-only cells | No cell editing supported (grid is read-only) |

### 6.6 Copy Table

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DG-27 | Copy table button | "Copy table" button visible above or below the grid |
| DG-28 | Copies as TSV | Copies current page rows as tab-separated values to clipboard |
| DG-29 | Includes headers | Copied content includes the header row |
| DG-30 | Confirmation tooltip | "Copied!" tooltip briefly appears on the button after click |

### 6.7 Empty Results

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DG-31 | No results message | When query returns 0 rows, grid shows "No results" |
| DG-32 | Headers still visible | Column names header row still rendered even with 0 rows |

---

## 7. Loading States

Tests: [loading_states/spec.md](./loading_states/spec.md)

### 7.1 Three-Phase Progress

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| LS-01 | Phase 1: Thinking | "Thinking..." with animated dots shown when user sends message |
| LS-02 | Phase 2: Running query | "Running query..." with spinner shown on `query_status: "executing"` |
| LS-03 | Phase 3: Preparing response | "Preparing response..." with spinner on `query_status: "formatting"` |
| LS-04 | Indicator within message bubble | Progress indicator rendered inside the assistant message bubble |

### 7.2 Phase Transitions

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| LS-05 | Forward-only progression | Phases only progress forward (1 to 2 to 3), never backward |
| LS-06 | Phases may be skipped | Text-only responses may skip phases 2 and 3 |
| LS-07 | Streaming replaces indicator | When streaming begins, loading indicator replaced by text content |
| LS-08 | One phase at a time | Only one phase indicator shown at a time (replaced, not appended) |

### 7.3 Timeout

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| LS-09 | 30s timeout message | After 30s in any phase: label changes to "Taking longer than expected..." |
| LS-10 | No auto-cancel on 30s | User must manually use stop button (no automatic cancellation) |
| LS-11 | 60s total timeout | After 60 seconds total, shows error state |

### 7.4 Error State

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| LS-12 | Error replaces loading | Loading indicator replaced by error message in same bubble |
| LS-13 | User-friendly message | Shows: "Something went wrong. Please try again." |
| LS-14 | Expandable details | "Details" section expands to show technical error information |
| LS-15 | Try again button | "Try again" button re-sends the same user message |
| LS-16 | Error styling | Error displayed with muted red/warning coloring |

### 7.5 Interruption (Stop Button)

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| LS-17 | Stop removes indicator | Clicking stop during any loading phase removes the loading indicator |
| LS-18 | Partial content preserved | If partial content received before stop, it is shown as-is |
| LS-19 | No content removes bubble | If no content received before stop, message bubble removed entirely |
