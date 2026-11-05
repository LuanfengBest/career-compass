import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  dir = mkdtempSync(path.join(tmpdir(), "career-worker-"));
process.env.CAREER_DB_PATH = path.join(dir, "test.sqlite");
const db = require("../.test-build/server/database.js"),
  gmail = require("../.test-build/server/gmail.js"),
  mail = require("../.test-build/server/portal-mail.js"),
  { syncWorkerTick } = require("../.test-build/server/sync-worker.js");
let calls = 0,
  paused = true,
  fail = false;
gmail.gmailStatus = () => ({ connected: true, paused });
gmail.syncGmail = async () => {
  calls++;
  if (fail) throw new Error("Rate limit");
  return { imported: 2 };
};
mail.syncContactMail = async () => {
  calls++;
  return { message: "Known contacts checked" };
};
const due = () =>
  db.setSetting("sync_worker", {
    ...db.readSetting("sync_worker"),
    nextCheck: new Date(0).toISOString(),
  });
test("background worker respects pause, advances both mail feeds, and does not repeat before next check", async () => {
  const p = await syncWorkerTick();
  assert.equal(p.state, "paused");
  assert.equal(calls, 0);
  paused = false;
  due();
  const done = await syncWorkerTick();
  assert.equal(done.state, "idle");
  assert.equal(calls, 2);
  assert.ok(done.lastSuccess);
  assert.equal(await syncWorkerTick(), undefined);
  assert.equal(calls, 2);
});
test("worker backs off failures and a concurrent worker cannot acquire the lease", async () => {
  due();
  db.acquireLease("sync_worker", 600);
  assert.equal(await syncWorkerTick(), undefined);
  db.releaseLease("sync_worker");
  fail = true;
  const first = await syncWorkerTick();
  assert.equal(first.state, "backoff");
  assert.equal(first.failures, 1);
  assert.ok(Date.parse(first.nextCheck) > Date.now());
  due();
  const second = await syncWorkerTick();
  assert.equal(second.failures, 2);
  assert.ok(Date.parse(second.nextCheck) - Date.now() > 110000);
  fail = false;
  due();
  const success = await syncWorkerTick();
  assert.equal(success.failures, 0);
  assert.equal(success.state, "idle");
});
test.after(() => {
  db.db().close();
  rmSync(dir, { recursive: true, force: true });
});
