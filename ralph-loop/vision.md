# ChatDF Vision

## The Big Picture
ChatDF is the **#1 place people come to ask questions about public data**. Any publicly available dataset — government statistics, scientific research, financial filings, climate data, census records — you just point ChatDF at it and start asking questions in plain English. No SQL knowledge needed. No data engineering. No setup. Just answers.

Think of it as **Google for structured data**: you don't need to know how to query it, you just ask.

## Why This Wins
Today, public data is abundant but inaccessible. There are terabytes of incredible datasets on data.gov, AWS Open Data, Hugging Face, NREL, Census Bureau, WHO, World Bank — but using them requires downloading files, setting up databases, writing SQL, and understanding schemas. 99% of people give up before they get their first answer.

ChatDF eliminates all of that. You paste a URL, and you're talking to your data in seconds.

## Current Scope (v1)
We're laser-focused on **Parquet and Iceberg datasets** — the formats that dominate modern public data lakes. These are the right starting point because:
- They're columnar and compressed — efficient to query without loading everything into memory
- They support predicate pushdown — we can answer questions about billion-row datasets by only reading relevant chunks
- Most major open data providers (AWS Open Data, Hugging Face Datasets, government data portals) publish in Parquet
- Iceberg tables are becoming the standard for large-scale open datasets

We are NOT building a general-purpose BI tool, a dashboard builder, or a data pipeline. We are building the fastest path from "I have a URL" to "I have an answer."

## Core Values

### 1. Speed Is the Feature
The UI should feel instant. Every interaction — loading a dataset, sending a question, browsing results — should feel faster than the user expects. This means:
- Streaming responses token-by-token (no waiting for complete answers)
- Immediate visual feedback on every click (loading states, animations, optimistic UI)
- Sub-second page loads, tiny bundle, fast cold start
- Smart query execution: predicate pushdown, column pruning, result pagination
- The "wow" moment: paste a URL, get your first insight in under 15 seconds

### 2. Radical Simplicity
Every pixel earns its place. The interface should feel obvious to a first-time user and powerful to an expert. This means:
- Three-panel layout: conversations (left), chat (center), datasets (right). That's it.
- No configuration screens, no settings menus, no onboarding wizards
- Keyboard-first for power users, mouse-friendly for everyone else
- Dark/light mode that both look intentionally designed
- The codebase stays small, readable, one-person-maintainable

### 3. Resource Efficiency
This runs great on a $5/mo VPS. No Kubernetes, no Redis, no Elasticsearch. One FastAPI process, one SQLite file, one frontend bundle. This means:
- Small memory footprint (Polars for data, not Pandas)
- SQLite for everything (sessions, conversations, metadata)
- Worker pool for heavy queries (non-blocking, bounded concurrency)
- No heavy JS dependencies — CSS solutions over JS libraries
- Production bundle under 500KB gzipped

### 4. Delight in Details
The difference between "fine" and "wow" is in the micro-interactions:
- Smooth animations on message appear, panel transitions, modal open/close
- Thoughtful empty states that guide rather than confuse
- Graceful error recovery — the app never shows a white screen or a stack trace
- Copy buttons on code blocks, SQL queries, data cells
- Toast notifications that inform without interrupting

## What Success Looks Like (v1)
- A user pastes a Parquet URL and gets their first insight in **under 15 seconds**
- Querying a 100M-row dataset feels as fast as querying 1,000 rows
- The interface feels like a native app, not a web app
- Works beautifully on desktop and mobile
- Power users never touch the mouse — full keyboard navigation
- When something goes wrong, the user knows exactly what happened and what to do
- Someone technical looks at the code and thinks "this is clean"

## What Success Looks Like (Future)
- People share ChatDF links the way they share Google Sheets links
- Data journalists use it to explore public records in real time
- Researchers paste DOI dataset links and start exploring immediately
- Government agencies embed ChatDF as the "explore this data" button on their data portals
- "Just chatdf it" becomes a verb in data communities

## What We DON'T Want
- **Feature creep**: No dashboards, no chart builders, no collaboration features, no user management beyond basic auth
- **Heavy infrastructure**: No Docker, no Kubernetes, no message queues, no caching layers
- **Slow iteration**: No complex build systems, no monorepo tools, no CI/CD pipelines (yet)
- **Format sprawl**: No CSV parsing, no Excel support, no JSON APIs (yet). Parquet/Iceberg first, do it perfectly, then expand.
- **Complexity debt**: Every line of code we add is a line we have to maintain. When in doubt, leave it out.

## Near-Term Focus Areas
1. **Streaming UX polish** — Make streaming feel buttery smooth. Every token should flow naturally.
2. **Large dataset performance** — Virtualized tables, pagination, predicate pushdown. 100M rows should feel effortless.
3. **Error recovery** — Network drops, API timeouts, malformed data. Handle it all gracefully.
4. **Mobile experience** — Touch-friendly, responsive layout that actually works on phones.
5. **Accessibility** — Keyboard navigation, screen reader support, ARIA labels everywhere.
6. **Smart suggestions** — After loading a dataset, suggest interesting questions based on the schema.
7. **Query explanation** — Show what SQL was generated and why, so users learn as they explore.
