import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Workspace } from "../model";
import { isWorkspace } from "../logic";

import { emptyWorkspace } from "../empty";
let connection: DatabaseSync | undefined;
export function db() {
  if (connection) return connection;
  const file = resolve(
    /* turbopackIgnore: true */ process.env.CAREER_DB_PATH ||
      ".data/career-compass.sqlite",
  );
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  connection = new DatabaseSync(file);
  chmodSync(file, 0o600);
  connection.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS archived_jobs (id TEXT PRIMARY KEY, body TEXT NOT NULL, archived_at TEXT NOT NULL, reason TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS source_runs (id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS email_events (id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS leases (name TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE VIEW IF NOT EXISTS jobs AS
      SELECT json_extract(j.value, '$.id') AS id,
        json_extract(j.value, '$.company') AS company,
        json_extract(j.value, '$.role') AS role,
        json_extract(j.value, '$.family') AS family,
        json_extract(j.value, '$.location') AS location,
        json_extract(j.value, '$.category') AS company_bucket,
        json_extract(j.value, '$.published') AS posted_at,
        json_extract(j.value, '$.collectedAt') AS collected_at,
        json_extract(j.value, '$.source') AS source,
        json_extract(j.value, '$.sponsorship.status') AS sponsorship,
        json_extract(j.value, '$.sourceEvidence') AS evidence,
        json_extract(j.value, '$.jdUrl') AS jd_url
      FROM workspace w, json_each(w.body, '$.jobs') j WHERE w.id=1;
    CREATE VIEW IF NOT EXISTS people AS
      SELECT json_extract(p.value, '$.id') AS id,
        json_extract(p.value, '$.name') AS name,
        json_extract(p.value, '$.company') AS company,
        json_extract(p.value, '$.title') AS title,
        json_extract(p.value, '$.linkedin') AS linkedin,
        COALESCE(json_extract(p.value, '$.connectionStatus'), 'To Be Connect') AS connection_status,
        json_extract(p.value, '$.emailStatus') AS email_status,
        json_extract(p.value, '$.evidence') AS evidence
      FROM workspace w, json_each(w.body, '$.contacts') p WHERE w.id=1;
  `);
  connection
    .prepare("INSERT OR IGNORE INTO workspace VALUES (1, 0, ?)")
    .run(JSON.stringify(emptyWorkspace));
  return connection;
}
export function readWorkspace(): { workspace: Workspace; revision: number } {
  const row = db()
    .prepare("SELECT body, revision FROM workspace WHERE id=1")
    .get()!;
  const workspace = JSON.parse(String(row.body));
  if (!isWorkspace(workspace))
    throw new Error("Stored workspace failed validation; restore a backup.");
  return { workspace, revision: Number(row.revision) };
}
export function writeWorkspace(workspace: Workspace, revision: number) {
  if (!isWorkspace(workspace)) throw new Error("Invalid workspace");
  return (
    db()
      .prepare(
        "UPDATE workspace SET body=?, revision=revision+1 WHERE id=1 AND revision=?",
      )
      .run(JSON.stringify(workspace), revision).changes === 1
  );
}
export function readSetting<T>(key: string): T | null {
  const row = db().prepare("SELECT body FROM settings WHERE key=?").get(key);
  return row ? (JSON.parse(String(row.body)) as T) : null;
}
export function setSetting(key: string, value: unknown) {
  db()
    .prepare(
      "INSERT INTO settings VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET body=excluded.body",
    )
    .run(key, JSON.stringify(value));
}
export function removeSetting(key: string) {
  db().prepare("DELETE FROM settings WHERE key=?").run(key);
}
export function acquireLease(name: string, seconds = 120) {
  return (
    db()
      .prepare(
        "INSERT INTO leases VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET expires=excluded.expires WHERE leases.expires < ?",
      )
      .run(name, Date.now() + seconds * 1000, Date.now()).changes === 1
  );
}
export function releaseLease(name: string) {
  db().prepare("DELETE FROM leases WHERE name=?").run(name);
}
