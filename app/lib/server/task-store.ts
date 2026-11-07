import { randomUUID } from "node:crypto";
import { db, readSetting } from "./database";
import { HttpError } from "./http";
import type { Agent } from "../portal";
import {
  irreversibleTask,
  recoverableClaimKind,
  type Task,
  type Batch,
  type Discovery,
  type TaskSnapshot,
} from "../tasks";
export function taskDb() {
  const d = db();
  d.exec(`CREATE TABLE IF NOT EXISTS task_batches(id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS execution_tasks(id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS discoveries(batch_id TEXT NOT NULL, kind TEXT NOT NULL, entity_id TEXT NOT NULL, actor TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(batch_id,kind,entity_id,actor));
    CREATE TABLE IF NOT EXISTS task_requests(id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS browser_claims(resource TEXT PRIMARY KEY, task_id TEXT NOT NULL, lease_until TEXT NOT NULL);`);
  return d;
}
export function allTasks(): Task[] {
  return taskDb()
    .prepare(
      "SELECT body FROM execution_tasks ORDER BY json_extract(body,'$.createdAt') DESC",
    )
    .all()
    .map((r) => JSON.parse(String(r.body)));
}
export function allBatches(): Batch[] {
  return taskDb()
    .prepare(
      "SELECT body FROM task_batches ORDER BY json_extract(body,'$.createdAt') DESC",
    )
    .all()
    .map((r) => JSON.parse(String(r.body)));
}
export function allDiscoveries(): Discovery[] {
  return taskDb()
    .prepare("SELECT body FROM discoveries")
    .all()
    .map((r) => JSON.parse(String(r.body)));
}
export function saveTask(t: Task) {
  taskDb()
    .prepare(
      "INSERT INTO execution_tasks VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
    )
    .run(t.id, JSON.stringify(t));
}
export function saveBatch(b: Batch) {
  taskDb()
    .prepare(
      "INSERT INTO task_batches VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
    )
    .run(b.id, JSON.stringify(b));
}
export function newTask(
  kind: Task["kind"],
  owner: Agent,
  title: string,
  input: Task["input"],
  extra: Partial<Task> = {},
): Task {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    kind,
    owner,
    title,
    input,
    status: "queued",
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}
export function taskTransaction<T>(fn: () => T): T {
  const d = taskDb();
  d.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
export function requireClaim(
  actor: Agent,
  taskId: unknown,
  token: unknown,
  kind?: Task["kind"],
): Task {
  const t = allTasks().find((x) => x.id === taskId);
  const reject = (reason: string): never => {
    throw new HttpError(409, `A live claim is required. ${reason} Refresh tasks before proceeding.`);
  };
  if (typeof taskId !== "string" || !taskId.trim()) return reject("CLAIM_TASK_ID_MISSING: Supply taskId from the current claim; this request did not identify a task.");
  if (!t) return reject("CLAIM_TASK_NOT_FOUND: No task matches this taskId.");
  if (t.owner !== actor) return reject("CLAIM_WRONG_ACTOR: The authenticated agent does not own this task.");
  if (t.status !== "claimed") return reject(`CLAIM_NOT_ACTIVE: Task status is ${t.status}, not claimed.`);
  if (!t.leaseUntil || !Number.isFinite(Date.parse(t.leaseUntil)) || Date.parse(t.leaseUntil) <= Date.now())
    return reject("CLAIM_EXPIRED: The server-side lease has expired. Refresh the queue; safe read/draft tasks requeue automatically. Heartbeat cannot revive an expired token.");
  if (typeof token !== "string" || !token) return reject("CLAIM_TOKEN_MISSING: Supply the private claimToken returned by the latest successful claim.");
  if (t.claimToken !== token) return reject("CLAIM_TOKEN_MISMATCH: This token does not match the current claim. Use the exact token from the latest successful claim; do not reuse an earlier one.");
  if (kind && t.kind !== kind) return reject("CLAIM_WRONG_KIND: This task does not permit the requested operation.");
  return t;
}
export function checkDiscoveryClaim(
  actor: Agent,
  input: Record<string, unknown>,
) {
  if (!input.batchId) return;
  const b = allBatches().find((x) => x.id === input.batchId);
  const t = requireClaim(actor, input.taskId, input.claimToken, "discover");
  if (!b || b.status !== "discovering" || t.batchId !== b.id)
    throw new HttpError(409, "Discovery batch is not accepting results.");
}
export function recordDiscovery(
  actor: Agent,
  batchId: unknown,
  kind: Discovery["kind"],
  entityId: string,
  evidence: string,
) {
  if (typeof batchId !== "string") return;
  const entry: Discovery = {
    batchId,
    kind,
    entityId,
    actor,
    evidence,
    at: new Date().toISOString(),
  };
  taskDb()
    .prepare(
      "INSERT INTO discoveries VALUES (?,?,?,?,?) ON CONFLICT(batch_id,kind,entity_id,actor) DO UPDATE SET body=excluded.body",
    )
    .run(batchId, kind, entityId, actor, JSON.stringify(entry));
}
export function expireClaims() {
  const batches = allBatches();
  const legacyExpiry = "Claim expired. Check the external page before retrying; no automatic retry.";
  for (const t of allTasks()) {
    const resumable = recoverableClaimKind(t.kind) && (!t.batchId || batches.some(b =>
      b.id === t.batchId && b.status !== "cancelled" && (t.kind !== "discover" || b.status === "discovering")));
    const expired = t.status === "claimed" && (!t.leaseUntil || Date.parse(t.leaseUntil) <= Date.now());
    // Only migrate our own historical expiry blocks, never explicit agent failures.
    const legacy = t.status === "blocked" && t.result?.summary === legacyExpiry && resumable;
    if (expired || legacy) {
      t.status = resumable ? "queued" : irreversibleTask(t) ? "uncertain" : "blocked";
      t.version++;
      t.updatedAt = new Date().toISOString();
      t.result = {
        ...t.result,
        summary: resumable ? "Claim expired; automatically queued for the same agent. Saved records are preserved. Claim again, read back existing results and continue without repeating external actions." : legacyExpiry,
        recoveryReason: "claim_expired",
      };
      delete t.claimToken;
      delete t.leaseUntil;
      saveTask(t);
      if (resumable) taskDb().prepare("DELETE FROM browser_claims WHERE task_id=?").run(t.id);
    }
  }
}
export function publicTask(t: Task): Task {
  const clean = { ...t };
  delete clean.claimToken;
  return clean;
}
export function taskSnapshot(actor?: Agent): TaskSnapshot {
  return taskTransaction(() => {
    expireClaims();
    return {
      batches: allBatches(),
      tasks: allTasks()
        .filter((t) => !actor || t.owner === actor)
        .map(publicTask),
      discoveries: allDiscoveries(),
      workers: (["dot", "muse"] as const).map((a) => ({
        actor: a,
        lastPoll: readSetting<string>(`worker_poll:${a}`),
        ...readSetting<{ schedule: string; registeredAt: string }>(
          `worker_schedule:${a}`,
        ),
      })),
    };
  });
}
export function frozenDraftOwner(contactId: string): Agent | null {
  const tasks = allTasks().filter(
    (t) =>
      t.kind === "draft" &&
      t.entityId === contactId &&
      t.status !== "cancelled",
  );
  return tasks[tasks.length - 1]?.owner || null;
}
