# ChatDF Vision

## What ChatDF Is
ChatDF is an AI-powered data exploration tool. You give it a dataset (parquet/CSV), and you chat with it in natural language. It writes SQL, runs queries, and explains results — all in a sleek, fast, real-time interface.

## Core Values
1. **Speed over everything** — The UI should feel instant. Streaming responses, no loading spinners, immediate feedback on every click. The user should never wait and wonder "did it work?"
2. **Minimalism** — Clean, uncluttered interface. Every pixel earns its place. No feature bloat.
3. **Resource efficiency** — Light on memory, CPU, bandwidth. Works great on a $5/mo VPS. Small bundle, fast cold start.
4. **Delight in details** — Subtle animations, smooth transitions, thoughtful micro-interactions. The kind of polish that makes people say "this feels nice."

## What Success Looks Like
- A user loads a dataset and gets their first insight in under 30 seconds
- The interface feels as fast as a native app, not a web app
- Works beautifully on both desktop and mobile
- Dark mode and light mode both look intentionally designed, not afterthoughts
- Power users can be productive with keyboard shortcuts alone
- Error states are graceful, never jarring — the app recovers smoothly
- The codebase is small, readable, and easy to maintain

## What We DON'T Want
- Feature creep: No dashboards, no chart builders, no collaboration features (yet)
- Heavy dependencies: No massive UI libraries, no state management frameworks beyond Zustand
- Complexity: No microservices, no Docker, no Kubernetes. One backend, one frontend, SQLite.
- Slow startup: No 10-second webpack builds. Vite + Bun keeps it fast.

## Near-Term Focus Areas
- **Streaming UX polish**: Make streaming feel buttery smooth
- **Data table experience**: Large results should be fast to browse, sort, filter
- **Error recovery**: Graceful handling of network issues, API errors, bad queries
- **Accessibility**: Keyboard navigation, screen reader support, ARIA labels
- **Mobile experience**: Touch-friendly, responsive layout that actually works on phones
