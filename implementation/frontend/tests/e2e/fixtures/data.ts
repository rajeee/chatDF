// Implements: spec/test_plan.md#e2e-test-data
//
// Local seeding server: serves test parquet files and provides a DB seeding
// endpoint for E2E tests. Runs on port 8001 alongside the backend.
//
// Endpoints:
//   GET  /parquet/:filename  -> serves parquet file from test-data/
//   POST /seed/auth          -> seeds user + session into the E2E test DB
//   POST /seed/reset         -> resets the E2E test DB (truncates all tables)

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFileSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";

const TEST_DATA_DIR = join(__dirname, "test-data");
const DB_PATH = join(
  __dirname,
  "../../../../backend/chatdf-e2e-test.db",
);

/** In-process SQLite handle (better-sqlite3 for sync seeding). */
let db: ReturnType<typeof Database> | null = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

function handleSeedAuth(body: any, res: ServerResponse) {
  const conn = getDb();
  const user = body.user;
  const now = new Date().toISOString();
  const sessionToken = `e2e-session-${Date.now()}`;
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Upsert user
  conn
    .prepare(
      `INSERT OR REPLACE INTO users (id, google_id, email, name, avatar_url, created_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      user.id,
      user.google_id,
      user.email,
      user.name,
      user.avatar_url,
      now,
      now,
    );

  // Create session
  conn
    .prepare(
      `INSERT INTO sessions (id, user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?)`,
    )
    .run(sessionToken, user.id, now, expiresAt);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ session_token: sessionToken }));
}

function handleSeedReset(_body: any, res: ServerResponse) {
  const conn = getDb();
  // Delete in FK-safe order
  conn.exec("DELETE FROM token_usage");
  conn.exec("DELETE FROM messages");
  conn.exec("DELETE FROM datasets");
  conn.exec("DELETE FROM conversations");
  conn.exec("DELETE FROM sessions");
  conn.exec("DELETE FROM referral_keys");
  conn.exec("DELETE FROM users");

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
}

function handleParquet(filename: string, res: ServerResponse) {
  try {
    const data = readFileSync(join(TEST_DATA_DIR, filename));
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("File not found");
  }
}

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost:8001");

  if (req.method === "GET" && url.pathname.startsWith("/parquet/")) {
    const filename = url.pathname.replace("/parquet/", "");
    handleParquet(filename, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/seed/auth") {
    const body = await parseBody(req);
    handleSeedAuth(body, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/seed/reset") {
    const body = await parseBody(req);
    handleSeedReset(body, res);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

/** Start the seeding server. Call from globalSetup. */
export function startSeedingServer(): Promise<void> {
  return new Promise((resolve) => {
    server.listen(8001, () => {
      console.log("E2E seeding server listening on :8001");
      resolve();
    });
  });
}

/** Stop the seeding server. Call from globalTeardown. */
export function stopSeedingServer(): Promise<void> {
  return new Promise((resolve) => {
    if (db) {
      db.close();
      db = null;
    }
    server.close(() => resolve());
  });
}
