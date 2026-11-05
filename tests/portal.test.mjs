import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const dir = mkdtempSync(path.join(tmpdir(), "career-portal-"));
process.env.CAREER_DB_PATH = path.join(dir, "test.sqlite");
process.env.APP_URL = "http://127.0.0.1:3000";
process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("hex");
process.env.GMAIL_ACCOUNT_EMAIL = "owner@example.com";
const p = require("../.test-build/server/portal.js");
const db = require("../.test-build/server/database.js");
const { seal } = require("../.test-build/server/crypto.js");
const {
  sendPortalDraft,
  messageEvidence,
} = require("../.test-build/server/portal-mail.js");
const { draftOwner, outreachCounts } = require("../.test-build/portal.js");
const contact = {
  externalId: "m-1",
  name: "Test Person",
  company: "Example",
  title: "Analyst",
  relationship: "Explicit test fixture",
  evidence: "Test data only",
  source: "https://example.com/profile",
  linkedin: "https://www.linkedin.com/in/test-person?trk=search",
  email: "person@example.com",
};
let id;
test("agent authentication binds actor, rejects missing token and wrong host", () => {
  const token = p.issueToken("muse");
  const req = new Request("http://127.0.0.1:3000/api/agents", {
    headers: { host: "127.0.0.1:3000", authorization: `Bearer ${token}` },
  });
  assert.equal(p.agentAuth(req), "muse");
  assert.throws(
    () =>
      p.agentAuth(
        new Request(req.url, { headers: { host: "127.0.0.1:3000" } }),
      ),
    /token/,
  );
  assert.throws(
    () =>
      p.agentAuth(
        new Request(req.url, {
          headers: { host: "evil.example", authorization: `Bearer ${token}` },
        }),
      ),
    /APP_URL/,
  );
});
test("idempotent discovery normalizes LinkedIn, assigns Muse and treats email as inferred", () => {
  const result = p.submitAgent("muse", {
    eventId: "discover-1",
    type: "contact",
    contact,
  });
  id = result.contactId;
  assert.equal(result.draftOwner, "muse");
  assert.deepEqual(
    p.submitAgent("muse", { eventId: "discover-1", type: "contact", contact }),
    result,
  );
  assert.equal(db.readWorkspace().workspace.contacts.length, 1);
  assert.equal(
    db.readWorkspace().workspace.contacts[0].emailSource,
    "Inferred",
  );
});
test("shared discoveries prefer Dot and reject drafts from non-owner", () => {
  const result = p.submitAgent("dot", {
    eventId: "discover-dot",
    type: "contact",
    contact: {
      ...contact,
      externalId: "d-1",
      linkedin: "https://www.linkedin.com/in/test-person/",
    },
  });
  assert.equal(result.contactId, id);
  assert.equal(result.draftOwner, "dot");
  assert.throws(
    () =>
      p.submitAgent("muse", {
        eventId: "wrong-draft",
        type: "draft",
        contactId: id,
        channel: "email",
        subject: "Hello",
        text: "body",
      }),
    /owner/,
  );
  assert.equal(draftOwner(db.readWorkspace().workspace.contacts[0]), "dot");
  p.submitAgent("dot", {
    eventId: "draft-1",
    type: "draft",
    contactId: id,
    channel: "email",
    subject: "Hello",
    text: "A factual message.",
  });
});
test("agent cannot overwrite user-edited drafts; headers reject injection", () => {
  const draft = p.drafts()[0];
  p.saveDraft({ ...draft, edited: true });
  assert.throws(
    () =>
      p.submitAgent("dot", {
        eventId: "draft-2",
        type: "draft",
        contactId: id,
        channel: "email",
        subject: "Hello",
        text: "Overwrite",
      }),
    /overwritten/,
  );
  p.saveDraft({ ...draft, edited: false });
  assert.throws(
    () =>
      p.submitAgent("dot", {
        eventId: "draft-3",
        type: "draft",
        contactId: id,
        channel: "email",
        subject: "Hi\r\nBcc: victim@example.com",
        text: "Body",
      }),
    /one line/,
  );
});
test("same name without strong identity is a candidate, not a forced merge", () => {
  const result = p.submitAgent("muse", {
    eventId: "ambiguous",
    type: "contact",
    contact: { ...contact, externalId: "m-2", linkedin: "" },
  });
  assert.notEqual(result.contactId, id);
  assert.deepEqual(result.possibleDuplicates, [id]);
});
test("delivery evidence distinguishes exact DSN invalid recipient, temporary failure and incoming", () => {
  function msg(from, body, labels = []) {
    return {
      id: "g1",
      threadId: "t1",
      internalDate: String(Date.now()),
      labelIds: labels,
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: from },
          { name: "To", value: "person@example.com" },
          { name: "Message-ID", value: "<id@example.com>" },
        ],
        body: { data: Buffer.from(body).toString("base64url") },
      },
    };
  }
  assert.equal(
    messageEvidence(
      msg(
        "mailer-daemon@example.com",
        "Final-Recipient: rfc822; person@example.com\nStatus: 5.1.1",
      ),
      "person@example.com",
      "owner@example.com",
    ).kind,
    "invalid_address",
  );
  assert.equal(
    messageEvidence(
      msg(
        "mailer-daemon@example.com",
        "person@example.com temporarily unavailable",
      ),
      "person@example.com",
      "owner@example.com",
    ).kind,
    "delivery_issue",
  );
  assert.equal(
    messageEvidence(
      msg("person@example.com", "I am away"),
      "person@example.com",
      "owner@example.com",
    ).kind,
    "incoming",
  );
  assert.equal(
    messageEvidence(
      msg("stranger@example.com", "hello"),
      "person@example.com",
      "owner@example.com",
    ),
    null,
  );
});
test("sending requires explicit Gmail send scope, reserves draft, never duplicates a completed send", async () => {
  await assert.rejects(() => sendPortalDraft(`${id}:email`, 1), /read-only/);
  db.setSetting(
    "gmail_tokens",
    seal({
      email: "owner@example.com",
      access_token: "fake",
      expiresAt: Date.now() + 3600000,
      scope:
        "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
    }),
  );
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.match(url, /messages\/send$/);
    const raw = Buffer.from(
      JSON.parse(options.body).raw,
      "base64url",
    ).toString();
    assert.match(raw, /To: person@example.com/);
    return Response.json({ id: "sent1", threadId: "thread1" });
  };
  try {
    const result = await sendPortalDraft(`${id}:email`, 1);
    assert.match(result.url, /rfc822msgid/);
    await assert.rejects(
      () => sendPortalDraft(`${id}:email`, 1),
      /already started/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("uncertain sending outcomes cannot be retried automatically", async () => {
  const c = p.submitAgent("dot", {
    eventId: "timeout-contact",
    type: "contact",
    contact: {
      ...contact,
      name: "Another",
      externalId: "d-timeout",
      linkedin: "https://www.linkedin.com/in/another-test",
      email: "another@example.com",
    },
  });
  p.submitAgent("dot", {
    eventId: "timeout-draft",
    type: "draft",
    contactId: c.contactId,
    channel: "email",
    subject: "Hello",
    text: "Body",
  });
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("timeout");
  };
  try {
    await assert.rejects(
      () => sendPortalDraft(`${c.contactId}:email`, 1),
      /timeout/,
    );
    assert.equal(
      p.drafts().find((d) => d.contactId === c.contactId).status,
      "unknown",
    );
    await assert.rejects(
      () => sendPortalDraft(`${c.contactId}:email`, 1),
      /already started/,
    );
    const pending = p.drafts().find((d) => d.contactId === c.contactId);
    p.saveDraft({ ...pending, id: pending.id + ":variant", status: "draft" });
    await assert.rejects(
      () => sendPortalDraft(pending.id + ":variant", 1),
      /uncertain outcome/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("overview counts contacts rather than messages and does not equate incoming with reply", () => {
  p.addEvent({
    id: "incoming-test",
    actor: "gmail",
    kind: "incoming",
    contactId: id,
    at: new Date().toISOString(),
    text: "Automatic reply",
  });
  const counts = Object.fromEntries(
    outreachCounts(db.readWorkspace().workspace, {
      events: p.events(),
      drafts: p.drafts(),
    }),
  );
  assert.equal(counts.Contacted, 1);
  assert.equal(counts.Replied, 0);
  assert.equal(counts["Incoming · to review"], 1);
});
test.after(() => {
  db.db().close();
  rmSync(dir, { recursive: true, force: true });
});

test("opportunity import deduplicates URLs without creating an application", () => {
  const job = {
    company: "Example",
    role: "Product Analyst",
    family: "DA",
    region: "United States",
    location: "New York",
    jdUrl: "https://example.com/jobs/42?utm_source=muse",
    fit: "Specific evidence",
    summary: "Entry level full time, 2027 graduates",
    deadline: "",
  };
  const first = p.submitAgent("muse", {
    eventId: "job-1",
    type: "opportunity",
    job,
  });
  const second = p.submitAgent("dot", {
    eventId: "job-2",
    type: "opportunity",
    job: { ...job, jdUrl: "https://example.com/jobs/42" },
  });
  assert.equal(first.jobId, second.jobId);
  assert.equal(db.readWorkspace().workspace.applications.length, 0);
  assert.equal(
    db.readWorkspace().workspace.jobs[0].sponsorship.status,
    "Unknown",
  );
});
test("agent application analysis requires original evidence and preserves manual labels", async () => {
  const { analyzeApplication } = require("../.test-build/server/agent-mail.js");
  const { workspace, revision } = db.readWorkspace();
  workspace.emailPaused = false;
  db.writeWorkspace(workspace, revision);
  const email = {
    id: "apply-test",
    threadId: "apply-thread",
    subject: "Application received",
    from: "recruiting@example.com",
    receivedAt: new Date().toISOString(),
    snippet: "Thanks for applying",
    suggestedStage: null,
    reason: "",
    reviewed: false,
  };
  db.db()
    .prepare("INSERT INTO email_events VALUES (?,?)")
    .run(email.id, JSON.stringify(email));
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      payload: {
        mimeType: "text/plain",
        body: {
          data: Buffer.from(
            "Thanks for applying. We received your application for Product Analyst.",
          ).toString("base64url"),
        },
      },
    });
  try {
    const v = {
      eventId: "analyze-1",
      messageId: email.id,
      relevant: true,
      stage: "Applied",
      quote: "Thanks for applying.",
      reason: "Explicit receipt",
      jobId: db.readWorkspace().workspace.jobs[0].id,
    };
    await assert.rejects(
      () => analyzeApplication("dot", { ...v, quote: "Invented evidence" }),
      /Quote/,
    );
    const r = await analyzeApplication("dot", v);
    assert.equal(r.linkedApplication, true);
    assert.equal(db.readWorkspace().workspace.applications.length, 1);
    await analyzeApplication("dot", v);
    assert.equal(db.readWorkspace().workspace.applications.length, 1);
    const current = JSON.parse(
      db.db().prepare("SELECT body FROM email_events WHERE id=?").get(email.id)
        .body,
    );
    db.db()
      .prepare("UPDATE email_events SET body=? WHERE id=?")
      .run(JSON.stringify({ ...current, manuallyLabeled: true }), email.id);
    await assert.rejects(
      () => analyzeApplication("muse", { ...v, eventId: "analyze-manual" }),
      /Manual/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("agent-managed applications follow newer evidence without regressing to older receipts", async () => {
  const { analyzeApplication } = require("../.test-build/server/agent-mail.js");
  const jobId = db.readWorkspace().workspace.jobs[0].id;
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      payload: {
        mimeType: "text/plain",
        body: {
          data: Buffer.from(
            "We are unable to proceed. Thanks for applying.",
          ).toString("base64url"),
        },
      },
    });
  async function apply(id, when, stage, quote) {
    db.db()
      .prepare("INSERT INTO email_events VALUES (?,?)")
      .run(
        id,
        JSON.stringify({
          id,
          threadId: id,
          subject: "Your application",
          from: "recruiting@example.com",
          receivedAt: when,
          snippet: quote,
          suggestedStage: null,
          reason: "",
          reviewed: false,
        }),
      );
    return analyzeApplication("dot", {
      eventId: id,
      messageId: id,
      relevant: true,
      stage,
      quote,
      reason: "Direct evidence",
      jobId,
    });
  }
  try {
    await apply(
      "new-rejection",
      new Date(Date.now() + 1000).toISOString(),
      "Rejected",
      "We are unable to proceed.",
    );
    assert.equal(
      db.readWorkspace().workspace.applications[0].stage,
      "Rejected",
    );
    await apply(
      "old-receipt",
      new Date(Date.now() - 1000).toISOString(),
      "Applied",
      "Thanks for applying.",
    );
    assert.equal(
      db.readWorkspace().workspace.applications[0].stage,
      "Rejected",
    );
  } finally {
    globalThis.fetch = original;
  }
});
