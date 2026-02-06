// Factory functions for test data
// Each returns valid response shapes with sensible defaults.
// Pass partial overrides to customize for specific test scenarios.

export interface UserResponse {
  user_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

export interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  dataset_count: number;
}

export interface MessageResponse {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  sql_query: string | null;
  sql_result: Record<string, unknown>[] | null;
  error: string | null;
}

export interface DatasetResponse {
  id: string;
  conversation_id: string;
  name: string;
  source_url: string;
  row_count: number;
  column_count: number;
  columns: { name: string; type: string }[];
  status: "loading" | "ready" | "error";
  error: string | null;
  created_at: string;
}

export interface UsageResponse {
  tokens_used: number;
  token_limit: number;
  window_reset_at: string;
  warning_threshold_pct: number;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/** Reset the ID counter between tests if deterministic IDs are needed */
export function resetIdCounter(): void {
  idCounter = 0;
}

export function createUser(overrides?: Partial<UserResponse>): UserResponse {
  return {
    user_id: "user-1",
    email: "test@example.com",
    name: "Test User",
    avatar_url: null,
    ...overrides,
  };
}

export function createConversation(
  overrides?: Partial<ConversationSummary>
): ConversationSummary {
  const now = new Date().toISOString();
  return {
    id: nextId("conv"),
    title: "Test Conversation",
    created_at: now,
    updated_at: now,
    dataset_count: 0,
    ...overrides,
  };
}

export function createConversationList(
  count: number,
  overrides?: Partial<ConversationSummary>
): ConversationSummary[] {
  return Array.from({ length: count }, (_, i) =>
    createConversation({
      title: `Conversation ${i + 1}`,
      ...overrides,
    })
  );
}

export function createMessage(
  overrides?: Partial<MessageResponse>
): MessageResponse {
  return {
    id: nextId("msg"),
    conversation_id: "conv-1",
    role: "user",
    content: "Hello, world!",
    created_at: new Date().toISOString(),
    sql_query: null,
    sql_result: null,
    error: null,
    ...overrides,
  };
}

export function createDataset(
  overrides?: Partial<DatasetResponse>
): DatasetResponse {
  return {
    id: nextId("ds"),
    conversation_id: "conv-1",
    name: "test_dataset",
    source_url: "https://example.com/data.parquet",
    row_count: 100,
    column_count: 3,
    columns: [
      { name: "id", type: "integer" },
      { name: "name", type: "string" },
      { name: "value", type: "float" },
    ],
    status: "ready",
    error: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createUsageStats(
  overrides?: Partial<UsageResponse>
): UsageResponse {
  const now = new Date();
  const resetAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h from now
  return {
    tokens_used: 1500,
    token_limit: 100000,
    window_reset_at: resetAt.toISOString(),
    warning_threshold_pct: 80,
    ...overrides,
  };
}
