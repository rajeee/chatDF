# Lessons Learned

## General Principles

- **Zustand selective subscriptions beat React.memo**: Fine-grained state subscriptions prevent re-renders more effectively than memoization.
- **WS events during streaming need pending queues**: Chart specs arrive via WS before `chat_complete` finalizes the message. Store them as pending and merge when `chat_complete` arrives.
- **LLM tool results can be frontend-passthrough**: `create_chart` doesn't need backend execution — just forward the spec to frontend via WS and return success to the LLM.
- **Use refs for state in stable callbacks**: When a `useCallback` depends on frequently-changing state (causing listener re-registration), use a ref to hold the state and keep the callback deps empty.
- **File export via backend keeps frontend lean**: For binary format exports (XLSX), POST data to a backend endpoint that returns `StreamingResponse`, rather than adding heavy JS libraries to the frontend bundle.
- **Gemini SDK ClientError**: Use `.code == 429` to detect rate limits. Implement your own retry loop — the SDK's built-in retry isn't surfaced through exceptions.
- **CodeMirror in tests**: Mock `useEditableCodeMirror` hook in jsdom tests — CodeMirror needs real DOM.
- **Lazy-load named exports**: `lazy(() => import("./Foo").then(m => ({ default: m.Foo })))` when the component is a named export.
