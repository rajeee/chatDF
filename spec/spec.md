# ChatDF - Product Specification

## Vision

A web application that lets users chat with their data using natural language. Users load datasets via URL, ask questions in plain English, and receive answers derived from SQL queries executed against their data.

## Core User Flow

1. User signs in (Google OAuth, requires referral key for first sign-up)
2. User provides one or more parquet file URLs
3. System loads dataset(s) with lazy evaluation (handles large files)
4. User asks natural language questions
5. System generates SQL, executes it, returns human-readable answers
6. User can ask follow-up questions (multi-turn conversation)

## User Types

### Registered Users (Google OAuth)
- Sign-in required to use the app (no anonymous/guest access)
- Sign-up requires a valid referral key (to control early access)
- Daily token limit: 5,000,000 tokens (rolling 24-hour window)
- Conversations and loaded datasets persist across sessions
- Can return and continue previous work

## Data Handling

### Input
- **Format**: Parquet files only (V1)
- **Source**: Any public URL (no domain restrictions)
- **Multiple datasets**: Supported - users can load several tables
- **Table naming**: Auto-generated simple names (e.g., `table1`, `table2`) with ability to edit
- **Relationships**: LLM infers join relationships from user queries and column names/types

### Processing
- **Engine**: Polars with lazy evaluation (handles datasets larger than memory)
- **Storage**: SQLite for app metadata, user sessions, conversation history
- **Query results**: Limited to 1000 rows maximum

### Output
- **Format**: Text and tables only (no charts in V1)
- **Large results**: Paginated display
- **SQL transparency**: Collapsible - hidden by default, expandable on demand

## LLM Integration

- **Provider**: Google Gemini (single provider, not configurable)
- **API key**: Server-side (users don't provide keys)
- **Cost control**: Per-user daily limits (5M tokens/day)
- **Conversation style**: Multi-turn with context retention

## Error Handling

- User-friendly error messages by default
- Expandable technical details for debugging (SQL errors, LLM issues)

## Session Model

- Single active session per user (no parallel sessions/tabs)
- All sessions persisted server-side, resumable
- Session duration: 7 days, refreshed on activity

## Out of Scope (V1)

- File upload (URL only)
- Non-parquet formats (CSV, JSON, Excel)
- Database connections (Postgres, MySQL)
- Data visualization / charts
- Multiple concurrent sessions
- Sharing/collaboration features
- Self-hosted LLM / BYOK (bring your own key)

---

## Design Decisions

Clarifications resolved during spec refinement:

- **No guest mode**: All users must sign in; referral key gates new sign-ups
- **Streaming**: Token-by-token streaming from Gemini to frontend via WebSocket
- **REST + WebSocket split**: REST for all actions (send message, add dataset), WebSocket only for server-push events (streaming tokens, progress updates)
- **Chat always enabled**: Input works even without datasets — LLM handles gracefully
- **Auto-load URLs**: Parquet URLs detected in chat messages are automatically loaded as datasets
- **Worker pool**: 4 worker processes for parallel query execution
- **Onboarding**: Includes a sample dataset URL for "Try with sample data"

---

## Subsystem Specs

- [Frontend Specification](./frontend/spec.md)
- [Backend Specification](./backend/spec.md)
- [Database Schema](./backend/database/spec.md)
