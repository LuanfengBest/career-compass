import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  dir = mkdtempSync(path.join(tmpdir(), "career-tasks-"));
process.env.CAREER_DB_PATH = path.join(dir, "test.sqlite");
process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("hex");
const a = require("../.test-build/server/task-actions.js"),
  s = require("../.test-build/server/task-store.js"),
  p = require("../.test-build/server/portal.js"),
  db = require("../.test-build/server/database.js");
let n = 0;
const eid = () => `e-${++n}`;
const create = () =>
  a.userTaskAction({
    action: "create",
    requestId: eid(),
    title: "Test batch",
    brief: "Full scope test only",
    mode: "discover",
    channel: "email",
    prepareApplications: true,
  });
const claim = (t, browser = false) =>
  a.agentTaskAction(t.owner, {
    action: "claim",
    taskId: t.id,
    usesLocalBrowser: browser,
  }).task;
const report = (t, extra = {}) =>
  a.agentTaskAction(t.owner, {
    action: "report",
    taskId: t.id,
    claimToken: t.claimToken,
    eventId: eid(),
    status: "completed",
    summary: "Observed test result",
    coverage: "Fixture scope",
    ...extra,
  });
const c = (name) => ({
  externalId: name,
  name,
  company: "Example",
  title: "Analyst",
  relationship: "Fixture",
  evidence: "Observed fixture",
  source: "https://example.com",
  linkedin: `https://www.linkedin.com/in/${name}`,
  email: `${name}@example.com`,
});
const contact = (t, name) =>
  p.submitAgent(t.owner, {
    type: "contact",
    eventId: eid(),
    batchId: t.batchId,
    taskId: t.id,
    claimToken: t.claimToken,
    contact: c(name),
  });
const job = (t) =>
  p.submitAgent(t.owner, {
    type: "opportunity",
    eventId: eid(),
    batchId: t.batchId,
    taskId: t.id,
    claimToken: t.claimToken,
    job: {
      company: "Example",
      role: "Product Analyst New Grad",
      family: "DA",
      region: "United States",
      location: "NY",
      jdUrl: "https://example.com/jobs/1",
      fit: "Evidence fixture",
      summary: "2027 full time",
    },
  });
let batch, dot, muse, shared, unique, jobId;
test("one user request is idempotent and creates two full-scope discovery tasks", () => {
  const v = {
    action: "create",
    requestId: "idempotent",
    title: "Test",
    brief: "Full scope",
    mode: "discover",
    channel: "email",
    prepareApplications: true,
  };
  batch = a.userTaskAction(v).batchId;
  assert.equal(a.userTaskAction(v).batchId, batch);
  assert.equal(s.allTasks().length, 2);
  const ts = s.allTasks();
  dot = claim(
    ts.find((t) => t.owner === "dot"),
    true,
  );
  assert.throws(
    () =>
      claim(
        ts.find((t) => t.owner === "muse"),
        true,
      ),
    /Chrome/,
  );
  muse = claim(ts.find((t) => t.owner === "muse"));
  assert.throws(() => claim(ts[0]), /queued/);
  assert.throws(
    () =>
      a.agentTaskAction("muse", {
        action: "heartbeat",
        eventId: eid(),
        taskId: dot.id,
        claimToken: dot.claimToken,
      }),
    /live claim/,
  );
});
test("discovery writes require claims; canonical IDs preserve both agents; release waits for both", () => {
  assert.throws(
    () =>
      p.submitAgent("dot", {
        eventId: eid(),
        type: "contact",
        contact: c("missingbatch"),
      }),
    /batchId/,
  );
  shared = contact(muse, "shared").contactId;
  assert.equal(contact(dot, "shared").contactId, shared);
  unique = contact(muse, "muse-only").contactId;
  jobId = job(dot).jobId;
  assert.equal(job(muse).jobId, jobId);
  assert.equal(db.readWorkspace().workspace.jobs.length, 1);
  assert.throws(
    () => a.userTaskAction({ action: "release", batchId: batch }),
    /Both/,
  );
  assert.throws(
    () =>
      p.submitAgent("dot", {
        eventId: eid(),
        type: "draft",
        contactId: shared,
        channel: "email",
        subject: "Hi",
        text: "Hello",
      }),
    /reconciliation/,
  );
  report(dot);
  assert.throws(
    () => a.userTaskAction({ action: "release", batchId: batch }),
    /Both/,
  );
  report(muse);
  assert.equal(s.allBatches()[0].status, "ready");
  const result = a.userTaskAction({ action: "release", batchId: batch });
  assert.equal(result.created, 3);
  assert.equal(s.allTasks().find((t) => t.entityId === shared).owner, "dot");
  assert.equal(s.allTasks().find((t) => t.entityId === unique).owner, "muse");
  assert.equal(s.allTasks().find((t) => t.entityId === jobId).owner, "dot");
  assert.equal(db.readWorkspace().workspace.applications.length, 0);
  assert.throws(
    () => a.userTaskAction({ action: "release", batchId: batch }),
    /Both/,
  );
});
test("late discovery does not steal a frozen owner; drafts require the assigned live claim", () => {
  p.submitAgent("dot", {
    eventId: eid(),
    type: "contact",
    contact: c("muse-only"),
  });
  assert.equal(
    require("../.test-build/portal.js").draftOwner(
      db.readWorkspace().workspace.contacts.find((c) => c.id === unique),
    ),
    "muse",
  );
  assert.throws(
    () =>
      p.submitAgent("muse", {
        eventId: eid(),
        type: "draft",
        contactId: unique,
        channel: "email",
        subject: "Hello",
        text: "Fixture draft",
      }),
    /live claim/,
  );
  const t = claim(s.allTasks().find((t) => t.entityId === unique));
  const v = {
    eventId: eid(),
    type: "draft",
    taskId: t.id,
    claimToken: t.claimToken,
    contactId: unique,
    channel: "email",
    subject: "Hello",
    text: "Fixture draft",
  };
  p.submitAgent("muse", v);
  report(t);
  assert.equal(p.drafts().filter((d) => d.contactId === unique).length, 1);
});
test("application preparation requires review; approved submit is claimed once and receipt updates tracker", () => {
  const prep = claim(s.allTasks().find((t) => t.entityId === jobId));
  assert.throws(() => report(prep), /review/);
  report(prep, {
    status: "review",
    answers: "Fixture answers",
    evidenceUrl: "https://example.com/jobs/1",
  });
  const reviewed = s.allTasks().find((t) => t.id === prep.id);
  const next = a.userTaskAction({
    action: "approve_application",
    taskId: prep.id,
    version: reviewed.version,
    answers: "User edited answers",
  });
  assert.equal(db.readWorkspace().workspace.applications.length, 0);
  const t = claim(s.allTasks().find((t) => t.id === next.taskId));
  assert.equal(t.input.answers, "User edited answers");
  assert.throws(() => report(t), /evidenceUrl/);
  const v = {
    action: "report",
    eventId: eid(),
    taskId: t.id,
    claimToken: t.claimToken,
    status: "completed",
    summary: "Submitted",
    receipt: "Fixture confirmation",
    evidenceUrl: "https://example.com/confirmation",
  };
  a.agentTaskAction("dot", v);
  a.agentTaskAction("dot", v);
  assert.equal(db.readWorkspace().workspace.applications.length, 1);
  assert.equal(db.readWorkspace().workspace.applications[0].stage, "Applied");
});
test("expired send is uncertain, not retried; user reconciliation releases shared browser without sending", () => {
  const t = s.newTask(
    "linkedin_send",
    "dot",
    "Fixture send",
    { draftId: "missing" },
    {},
  );
  t.status = "claimed";
  t.claimToken = "secret";
  t.leaseUntil = new Date(Date.now() - 1).toISOString();
  t.browser = true;
  s.saveTask(t);
  s.taskDb()
    .prepare(
      "INSERT INTO browser_claims VALUES ('local-chrome',?,?) ON CONFLICT(resource) DO UPDATE SET task_id=excluded.task_id",
    )
    .run(t.id, t.leaseUntil);
  const snapshot = s.taskSnapshot();
  const expired = snapshot.tasks.find((x) => x.id === t.id);
  assert.equal(expired.status, "uncertain");
  assert.equal(expired.claimToken, undefined);
  assert.throws(
    () =>
      a.userTaskAction({
        action: "retry",
        taskId: t.id,
        version: expired.version,
      }),
    /Only blocked/,
  );
  const other = s.newTask("mail_review", "muse", "Read fixture", {});
  s.saveTask(other);
  assert.throws(() => claim(other, true), /uncertain/);
  a.userTaskAction({
    action: "reconcile",
    taskId: t.id,
    version: expired.version,
    verified: true,
    outcome: "not_performed",
    summary: "Checked no message was sent",
    evidenceUrl: "https://www.linkedin.com/messaging/",
  });
  assert.equal(claim(other, true).status, "claimed");
});
test("ambiguous identities remain blocked on retry; no guessed-email merge", () => {
  const b = create();
  const ts = s.allTasks().filter((t) => t.batchId === b.batchId);
  let target;
  for (const t of ts) {
    const cl = claim(t);
    const value = c(`ambiguous-${t.owner}`);
    value.name = "Same Name";
    value.company = "Same Company";
    const r = p.submitAgent(t.owner, {
      eventId: eid(),
      type: "contact",
      batchId: b.batchId,
      taskId: t.id,
      claimToken: cl.claimToken,
      contact: value,
    });
    target = r.contactId;
    report(cl);
  }
  a.userTaskAction({ action: "release", batchId: b.batchId });
  const blocked = s.allTasks().find((t) => t.entityId === target);
  assert.equal(blocked.status, "blocked");
  assert.throws(
    () =>
      a.userTaskAction({
        action: "retry",
        taskId: blocked.id,
        version: blocked.version,
      }),
    /duplicate/,
  );
});
test("LinkedIn send queues exact reviewed version, never sends immediately, and requires receipt", () => {
  const r = p.submitAgent("muse", {
    eventId: eid(),
    type: "contact",
    contact: c("li-send"),
  });
  p.submitAgent("muse", {
    eventId: eid(),
    type: "draft",
    contactId: r.contactId,
    channel: "linkedin",
    text: "Reviewed fixture message",
  });
  const d = p.drafts().find((d) => d.contactId === r.contactId);
  const queued = a.userTaskAction({
    action: "queue_linkedin",
    draftId: d.id,
    version: d.version,
  });
  assert.equal(p.drafts().find((x) => x.id === d.id).status, "queued");
  assert.equal(
    p
      .events()
      .some(
        (e) =>
          e.contactId === r.contactId && e.kind === "linkedin_sent_reported",
      ),
    false,
  );
  const t = claim(s.allTasks().find((t) => t.id === queued.taskId));
  assert.throws(() => report(t), /evidenceUrl/);
  report(t, {
    evidenceUrl: "https://www.linkedin.com/messaging/thread/fixture/",
    receipt: "Observed fixture sent bubble",
  });
  assert.equal(p.drafts().find((x) => x.id === d.id).status, "sent");
  assert.equal(
    p
      .events()
      .filter(
        (e) =>
          e.contactId === r.contactId && e.kind === "linkedin_sent_reported",
      ).length,
    1,
  );
});
test("explicit drafting tasks preserve edited drafts and cannot complete using an old draft", () => {
  const r = p.submitAgent("muse", {
    eventId: eid(),
    type: "contact",
    contact: c("draft-request"),
  });
  p.submitAgent("muse", {
    eventId: eid(),
    type: "draft",
    contactId: r.contactId,
    channel: "email",
    subject: "Original",
    text: "User final text",
  });
  const old = p.drafts().find((d) => d.contactId === r.contactId);
  p.saveDraft({ ...old, edited: true });
  const input = {
    action: "create",
    requestId: eid(),
    title: "Rewrite for this person",
    brief: "Shorten the introduction",
    mode: "draft",
    channel: "email",
    owner: "muse",
    contactId: r.contactId,
  };
  assert.throws(
    () => a.userTaskAction({ ...input, owner: "dot" }),
    /assigned to muse/,
  );
  const created = a.userTaskAction(input);
  const t = claim(s.allTasks().find((t) => t.id === created.taskId));
  assert.throws(() => report(t), /Submit/);
  p.submitAgent("muse", {
    eventId: eid(),
    type: "draft",
    taskId: t.id,
    claimToken: t.claimToken,
    contactId: r.contactId,
    channel: "email",
    subject: "Proposed rewrite",
    text: "New variant, not sent",
  });
  report(t);
  assert.equal(p.drafts().find((d) => d.id === old.id).text, "User final text");
  assert.equal(p.drafts().filter((d) => d.contactId === r.contactId).length, 2);
  assert.equal(
    p.events().some((e) => e.contactId === r.contactId && e.kind === "sent"),
    false,
  );
});
test.after(() => {
  db.db().close();
  rmSync(dir, { recursive: true, force: true });
});
