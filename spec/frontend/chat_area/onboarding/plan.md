---
status: review
last_updated: 2026-02-05
implements: ./spec.md
---

# Onboarding — Implementation Plan

## Component: `OnboardingGuide.tsx`

Implements: [spec.md#display-condition](./spec.md#display-condition), [spec.md#content-layout](./spec.md#content-layout)

### File Location

`frontend/src/components/chat-area/OnboardingGuide.tsx`

### Props

| Prop | Type | Description |
|------|------|-------------|
| `onSendPrompt` | `(text: string) => void` | Callback when user clicks an example prompt chip |

### State Dependencies

- `datasetStore.datasets` — determines if sample data has loaded (transitions to prompt chips)
- Internal `useState` for `sampleLoading` — tracks "Try with sample data" button state

### Empty State Detection

Implements: [spec.md#display-condition](./spec.md#display-condition)

- Parent `ChatArea` renders OnboardingGuide when `datasetStore.datasets.length === 0 && chatStore.messages.length === 0`.
- OnboardingGuide itself does not check these conditions; it is mounted/unmounted by the parent.

### Sample Dataset URL

- A constant `SAMPLE_DATASET_URL` defined in `frontend/src/lib/constants.ts`.
- Value: `"https://huggingface.co/datasets/scikit-learn/iris/resolve/main/iris.parquet"` (Iris dataset — 150 rows, 5 columns, ~7KB).
- "Try with sample data" button calls `datasetStore.addDataset(SAMPLE_DATASET_URL)`.

### Layout

- Centered vertically and horizontally using flex centering (`items-center justify-center`).
- Content stack: logo/title, description, step-by-step guide, CTA button, example chips.
- Generous whitespace via Tailwind spacing utilities (`space-y-6`, `py-12`).

### Transitions

Implements: [spec.md#transitions](./spec.md#transitions)

- **Before sample data loaded**: Shows step-by-step guide and "Try with sample data" button.
- **Button click**: Sets `sampleLoading = true`, disables button, shows spinner icon inside button.
- **After sample data loaded** (`datasetStore.datasets.length > 0`): Step-by-step section hidden, example prompt chips shown. Transition uses conditional rendering (no CSS animation needed for V1).
- **After first message sent**: Parent unmounts OnboardingGuide entirely.

### Example Prompt Chips

- Rendered as a horizontal flex-wrap list of `<button>` elements.
- Each chip has muted background, rounded corners, hover effect.
- On click: calls `onSendPrompt(chipText)`.
- Chip text content hardcoded (tailored to the sample dataset).

## Scope

### In Scope
- Empty state UI, sample data trigger, prompt chips

### Out of Scope
- Dataset loading mechanics (datasetStore handles this)
- Message sending (parent provides callback)
