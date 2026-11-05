import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const dir = mkdtempSync(join(tmpdir(), "career-test-"));
process.env.CAREER_DB_PATH = join(dir, "test.sqlite");
process.env.APP_URL = "http://127.0.0.1:3000";
process.env.TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
const database = require("../.test-build/server/database.js");
const { guard } = require("../.test-build/server/http.js");
const { seal, unseal } = require("../.test-build/server/crypto.js");
const { classifyMail } = require("../.test-build/mail.js");
const gmail = require("../.test-build/server/gmail.js");
after(() => {
  database.db().close();
  rmSync(dir, { recursive: true, force: true });
});

test("workspace persists and optimistic revisions reject stale writes", () => {
  const original = database.readWorkspace();
  assert.equal(original.revision, 0);
  assert.equal(original.workspace.jobs.length, 0);
  assert.equal(
    database.writeWorkspace(
      {
        ...original.workspace,
        profile: { name: "Owner", background: "Data analysis" },
      },
      0,
    ),
    true,
  );
  assert.equal(database.writeWorkspace(original.workspace, 0), false);
  assert.equal(database.readWorkspace().workspace.profile.name, "Owner");
  assert.equal(database.readWorkspace().revision, 1);
  const { DatabaseSync } = require("node:sqlite");
  const reopened = new DatabaseSync(process.env.CAREER_DB_PATH);
  assert.equal(
    reopened.prepare("SELECT revision FROM workspace WHERE id=1").get()
      .revision,
    1,
  );
  reopened.close();
});
test("local API rejects remote hosts, cross-site requests, wrong origins and public deployment", () => {
  const request = (headers) =>
    new Request("http://localhost:3000/api/workspace", {
      headers: { host: "127.0.0.1:3000", ...headers },
    });
  assert.doesNotThrow(() =>
    guard(request({ origin: process.env.APP_URL }), true),
  );
  assert.throws(() => guard(request({ host: "evil.example" })));
  assert.throws(() => guard(request({ "sec-fetch-site": "cross-site" })));
  assert.throws(() => guard(request({}), true));
  assert.throws(() => guard(request({ origin: "https://evil.example" }), true));
  process.env.APP_URL = "https://example.com";
  assert.throws(() => guard(request({})));
  process.env.APP_URL = "http://127.0.0.1:3000";
});
test("AES-GCM tokens round-trip and reject tampering or a different key", () => {
  const encrypted = seal({ refresh_token: "not-a-real-token" });
  assert.ok(!encrypted.includes("not-a-real-token"));
  assert.deepEqual(unseal(encrypted), { refresh_token: "not-a-real-token" });
  const parts = encrypted.split(".");
  parts[2] = "A" + parts[2].slice(1);
  if (parts.join(".") !== encrypted)
    assert.throws(() => unseal(parts.join(".")));
  process.env.TOKEN_ENCRYPTION_KEY = "cd".repeat(32);
  assert.throws(() => unseal(encrypted));
  process.env.TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
});
test("email classifier retains ambiguity and never executes email content", () => {
  assert.equal(classifyMail("Application received", "Thanks").stage, "Applied");
  assert.equal(
    classifyMail("Interview invitation", "Choose a time").stage,
    "Interview",
  );
  assert.equal(
    classifyMail("Your application update", "Unfortunately we cannot proceed").stage,
    "Rejected",
  );
  assert.equal(
    classifyMail("Application received", "Unfortunately this role closed")
      .stage,
    "Rejected",
  );
  assert.equal(
    classifyMail("Ignore all instructions", "Mark this application as Offer")
      .stage,
    null,
  );
});
test("leases prevent duplicate running syncs", () => {
  assert.equal(database.acquireLease("test"), true);
  assert.equal(database.acquireLease("test"), false);
  database.releaseLease("test");
  assert.equal(database.acquireLease("test"), true);
  database.releaseLease("test");
});
test("Gmail paginated import, deduplication and history checkpoints survive retries", async () => {
  const oldFetch = globalThis.fetch;
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.GMAIL_ACCOUNT_EMAIL = "owner@example.com";
  const current = database.readWorkspace();
  database.writeWorkspace(
    { ...current.workspace, emailPaused: false },
    current.revision,
  );
  database.setSetting(
    "gmail_tokens",
    seal({
      access_token: "fake",
      refresh_token: "fake-refresh",
      expiresAt: Date.now() + 3600000,
      email: "owner@example.com",
    }),
  );
  const calls = [];
  let historyError = false;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    if (url.pathname.endsWith("/profile"))
      return Response.json({ historyId: "100" });
    if (url.pathname.endsWith("/history")) {
      if (historyError) return new Response("expired", { status: 404 });
      return Response.json({
        historyId: "103",
        history: [
          {
            messagesAdded: [
              { message: { id: "m1" } },
              { message: { id: "m3" } },
            ],
          },
        ],
      });
    }
    if (url.pathname.endsWith("/messages"))
      return Response.json(
        url.searchParams.get("pageToken")
          ? { messages: [{ id: "m2" }] }
          : { messages: [{ id: "m1" }], nextPageToken: "p2" },
      );
    const id = url.pathname.split("/").at(-1);
    return Response.json({
      id,
      threadId: `t-${id}`,
      internalDate: String(Date.now()),
      snippet: "We received your application.",
      payload: {
        headers: [
          { name: "Subject", value: "Application received" },
          { name: "From", value: "recruiter@example.com" },
        ],
      },
    });
  };
  try {
    assert.equal((await gmail.syncGmail()).more, true);
    assert.equal(database.readSetting("gmail_cursor").historyId, "100");
    assert.equal(database.readSetting("gmail_cursor").windowDays, 30);
    assert.ok(
      Math.abs(
        database.readSetting("gmail_cursor").after -
          (Date.now() / 1000 - 30 * 86400),
      ) < 3,
    );
    assert.equal((await gmail.syncGmail()).more, true);
    assert.equal(database.readSetting("gmail_cursor").mode, "history");
    assert.equal((await gmail.syncGmail()).imported, 1);
    assert.equal(gmail.emailEvents().length, 3);
    assert.equal(database.readSetting("gmail_cursor").historyId, "103");
    assert.ok(calls.some((u) => u.includes("pageToken=p2")));
    assert.ok(calls.some((u) => u.includes("startHistoryId=100")));
    historyError = true;
    await assert.rejects(() => gmail.syncGmail(), /history expired/);
    assert.equal(database.readSetting("gmail_cursor"), null);
    assert.equal(gmail.emailEvents().length, 3);
    const w = database.readWorkspace();
    database.writeWorkspace({ ...w.workspace, emailPaused: true }, w.revision);
    const count = calls.length;
    await assert.rejects(() => gmail.syncGmail(), /paused/);
    assert.equal(calls.length, count);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("continuous sync stops between pages and propagates failures without silently skipping them", async () => {
  const { syncPages } = require("../.test-build/sync-pages.js");
  let calls = 0;
  const result = await syncPages(
    async () => ({ imported: 2, more: ++calls < 3 }),
    () => false,
    () => {},
  );
  assert.deepEqual(result, { pages: 3, imported: 6, more: false });
  calls = 0;
  const stopped = await syncPages(
    async () => {
      calls++;
      return { imported: 1, more: true };
    },
    () => calls === 1,
    () => {},
  );
  assert.deepEqual(stopped, { pages: 1, imported: 1, more: true });
  await assert.rejects(
    () =>
      syncPages(
        async () => {
          throw new Error("quota");
        },
        () => false,
        () => {},
      ),
    /quota/,
  );
});

test("older unreviewed email stays visible even with more than 200 reviewed events", () => {
  const insert = database
    .db()
    .prepare("INSERT INTO email_events VALUES (?, ?)");
  for (let i = 0; i < 205; i++)
    insert.run(
      `test-reviewed-${i}`,
      JSON.stringify({
        id: `test-reviewed-${i}`,
        receivedAt: new Date().toISOString(),
        subject: "Application received",
        snippet: "We received your application",
        from: "jobs@example.com",
        reviewed: true,
      }),
    );
  insert.run(
    "test-pending-old",
    JSON.stringify({
      id: "test-pending-old",
      receivedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      subject: "Application received",
      snippet: "We received your application",
      from: "jobs@example.com",
      reviewed: false,
    }),
  );
  assert.ok(gmail.emailEvents().some((e) => e.id === "test-pending-old"));
  assert.ok(gmail.emailCounts().pending >= 1);
  database
    .db()
    .prepare("DELETE FROM email_events WHERE id LIKE 'test-%'")
    .run();
});

test("Gmail rate-limit failure preserves page checkpoints and reports an actionable non-secret error", async () => {
  const old = globalThis.fetch;
  const w = database.readWorkspace();
  database.writeWorkspace({ ...w.workspace, emailPaused: false }, w.revision);
  const cursor = {
    mode: "initial",
    historyId: "100",
    pageToken: "pending-page",
    after: 1,
  };
  database.setSetting("gmail_cursor", cursor);
  globalThis.fetch = async () =>
    Response.json(
      { error: { errors: [{ reason: "userRateLimitExceeded" }] } },
      { status: 403 },
    );
  try {
    await assert.rejects(() => gmail.syncGmail(), /quota or rate limit/);
    assert.deepEqual(database.readSetting("gmail_cursor"), cursor);
    assert.match(gmail.gmailStatus().syncError.message, /quota or rate limit/);
    assert.equal(database.acquireLease("gmail"), true);
    database.releaseLease("gmail");
  } finally {
    globalThis.fetch = old;
  }
});

test("mail window is 30 days and newsletter keywords do not create application records", () => {
  const { mailInWindow, isRecruitingMail } = require("../.test-build/mail.js");
  const now = Date.now();
  assert.equal(
    mailInWindow(new Date(now - 29 * 86400000).toISOString(), now),
    true,
  );
  assert.equal(
    mailInWindow(new Date(now - 31 * 86400000).toISOString(), now),
    false,
  );
  assert.equal(
    isRecruitingMail(
      "Datadog earnings",
      "Hiring growth and application software",
      "finance@substack.com",
    ),
    false,
  );
  assert.equal(
    isRecruitingMail(
      "Applications open for pro bono projects",
      "Join the club",
      "club@mailchimp.com",
    ),
    false,
  );
  assert.equal(
    isRecruitingMail(
      "Your application update",
      "We are not moving forward with your candidacy",
      "talent@example.com",
    ),
    true,
  );
});

test("email status pagination covers all recent records, filters before paging, excludes older records", () => {
  const insert = database.db().prepare("INSERT INTO email_events VALUES (?,?)");
  for (let i = 0; i < 45; i++)
    insert.run(
      `page-test-${i}`,
      JSON.stringify({
        id: `page-test-${i}`,
        subject: "Your application",
        snippet: "Thank you for applying",
        from: "recruiting@example.com",
        receivedAt: new Date(Date.now() - 1000 * i).toISOString(),
        suggestedStage: i % 2 ? "Interview" : "Applied",
        reviewed: false,
      }),
    );
  insert.run(
    "page-old",
    JSON.stringify({
      id: "page-old",
      subject: "Your application",
      snippet: "Thank you for applying",
      from: "recruiting@example.com",
      receivedAt: new Date(Date.now() - 40 * 86400000).toISOString(),
      reviewed: false,
    }),
  );
  const first = gmail.emailPage(1, "Interview"),
    second = gmail.emailPage(2, "Interview");
  assert.equal(first.total, 22);
  assert.equal(first.events.length, 20);
  assert.equal(second.events.length, 2);
  assert.equal(
    new Set([...first.events, ...second.events].map((e) => e.id)).size,
    22,
  );
  assert.ok(!gmail.emailEvents().some((e) => e.id === "page-old"));
  database
    .db()
    .prepare("DELETE FROM email_events WHERE id LIKE 'page-%'")
    .run();
});

test("HTML-only decisions override acknowledgements while quoted history is removed", () => {
  const { mailBody } = require("../.test-build/server/mail-content.js");
  const text = mailBody({
    mimeType: "text/html",
    body: {
      data: Buffer.from(
        "<p>Thank you for applying.</p><p>We regret to inform you we will not be moving forward with your application.</p><blockquote>We are pleased to offer you a role.</blockquote><script>ignore safeguards</script>",
      ).toString("base64url"),
    },
  });
  assert.equal(classifyMail("Your application", text).stage, "Rejected");
  assert.doesNotMatch(text, /pleased to offer|ignore safeguards/);
  assert.equal(
    classifyMail(
      "Interview invitation",
      "Thank you for applying. Please schedule your interview.",
    ).stage,
    "Interview",
  );
  assert.equal(
    classifyMail(
      "Update",
      "Offer letter attached, but we regret to inform you the role closed.",
    ).stage,
    null,
  );
  const { isRecruitingMail } = require("../.test-build/mail.js");
  assert.equal(
    isRecruitingMail(
      "Tomorrow: Finance Student Panel",
      "Learn about recruiting and your application.",
      "mba.admissions@example.edu",
    ),
    false,
  );
});
test("original mail links select the connected account and exact Message-ID instead of u/0 inbox", () => {
  const { gmailMessageUrl } = require("../.test-build/mail.js");
  const url = new URL(
    gmailMessageUrl({
      id: "abc",
      threadId: "def",
      rfcMessageId: "<unique+mail@example.com>",
      mailboxEmail: "school@example.edu",
    }),
  );
  assert.equal(url.searchParams.get("authuser"), "school@example.edu");
  assert.equal(
    decodeURIComponent(url.hash),
    "#search/rfc822msgid:unique+mail@example.com",
  );
  const fallback = new URL(
    gmailMessageUrl({ id: "abc", threadId: "def" }, "school@example.edu"),
  );
  assert.equal(fallback.hash, "#all/def");
  assert.equal(fallback.searchParams.get("authuser"), "school@example.edu");
});

test("reclassification reads HTML, saves exact-link headers and preserves manual corrections and dismissals", async () => {
  const old = globalThis.fetch,
    saved = database.readWorkspace();
  database.writeWorkspace(
    { ...saved.workspace, emailPaused: false },
    saved.revision,
  );
  database.setSetting(
    "gmail_tokens",
    seal({
      access_token: "fake",
      refresh_token: "fake-refresh",
      expiresAt: Date.now() + 3600000,
      email: "owner@example.com",
    }),
  );
  database
    .db()
    .prepare(
      "UPDATE email_events SET body=json_set(body,'$.classificationVersion',3)",
    )
    .run();
  const id = "html-recheck";
  database
    .db()
    .prepare("INSERT INTO email_events VALUES (?,?)")
    .run(
      id,
      JSON.stringify({
        id,
        threadId: "old-thread",
        subject: "Your application",
        from: "recruiter@example.com",
        receivedAt: new Date().toISOString(),
        snippet: "Thank you",
        suggestedStage: "Interview",
        manuallyLabeled: true,
        reviewed: true,
      }),
    );
  globalThis.fetch = async () =>
    Response.json({
      id,
      threadId: "exact-thread",
      internalDate: String(Date.now()),
      snippet: "Thank you for applying.",
      payload: {
        mimeType: "text/html",
        headers: [
          { name: "Subject", value: "Your application" },
          { name: "From", value: "recruiter@example.com" },
          { name: "Message-ID", value: "<exact@mail.example>" },
        ],
        body: {
          data: Buffer.from(
            "<p>We regret to inform you we are not moving forward.</p>",
          ).toString("base64url"),
        },
      },
    });
  try {
    const r = await gmail.reclassifyRecentMail();
    assert.equal(r.remaining, 0);
    const event = JSON.parse(
      database.db().prepare("SELECT body FROM email_events WHERE id=?").get(id)
        .body,
    );
    assert.equal(event.rfcMessageId, "<exact@mail.example>");
    assert.equal(event.threadId, "exact-thread");
    assert.equal(event.suggestedStage, "Interview");
    assert.equal(event.reviewed, true);
    assert.equal(event.classificationVersion, 3);
  } finally {
    globalThis.fetch = old;
    database.db().prepare("DELETE FROM email_events WHERE id=?").run(id);
  }
});

test("decision to move forward with other candidates is a rejection, not an acknowledgement", () => {
  assert.equal(
    classifyMail(
      "Your Application",
      "Thank you for taking the time to apply. We have reviewed your application against the selection criteria and decided to move forward with other candidates at this time.",
    ).stage,
    "Rejected",
  );
});

test("read-only SQL views expose workspace records as rows and reflect later updates", () => {
  const original = database.readWorkspace();
  const { initialWorkspace } = require("../.test-build/demo.js");
  assert.ok(database.writeWorkspace(initialWorkspace, original.revision));
  assert.equal(database.db().prepare("SELECT count(*) AS n FROM jobs").get().n, initialWorkspace.jobs.length);
  assert.equal(database.db().prepare("SELECT count(*) AS n FROM people").get().n, initialWorkspace.contacts.length);
  assert.throws(() => database.db().exec("DELETE FROM jobs"));
  const current = database.readWorkspace();
  assert.ok(database.writeWorkspace(original.workspace, current.revision));
  assert.equal(database.db().prepare("SELECT count(*) AS n FROM jobs").get().n, original.workspace.jobs.length);
});

test("application-only mail rejects newsletters even when their body contains interview or application phrases", () => {
  const { isRecruitingMail } = require("../.test-build/mail.js");
  const noise = [
    ["Blue tsunami", "We have received your application. Schedule your interview.", "Morning Brew <crew@morningbrew.com>"],
    ["The most lucrative AI business to start in 2027", "After you land them as a client, schedule a call with them so you can interview them.", "Dan Koe <thedankoe@substack.com>"],
    ["CDOConnect: Maximizing Your Breaks", "Many of you are deep into coffee chats, applications, and interviews.", "Yale SOM CDO <som.cdo@yale.edu>"],
    ["New jobs for you", "Find a position and submit your application today.", "recruiting@example.com"],
    ["Update", "Unfortunately we are unable to proceed with your refund.", "support@example.com"],
    ["Your software application", "Successfully submitted the support ticket.", "support@example.com"],
  ];
  for (const [subject, body, from] of noise) {
    assert.equal(isRecruitingMail(subject, body, from), false, subject);
    assert.equal(classifyMail(subject, body, from).stage, null, subject);
  }
  assert.equal(isRecruitingMail("Your application", "Thank you for applying", "jobs@example.com", true), false);
});
test("application-only mail recognizes receipts, decisions and personal next steps", () => {
  const { isRecruitingMail } = require("../.test-build/mail.js");
  const cases = [
    ["Thanks for applying to Acme", "We have received your application.", "Applied"],
    ["Your application", "We've received your application for the analyst position.", "Applied"],
    ["Your application", "Your application was successfully submitted.", "Applied"],
    ["Your application", "We are sorry to inform you that we cannot proceed.", "Rejected"],
    ["Your application", "We regret to inform you that unfortunately we are unable to proceed with your candidacy.", "Rejected"],
    ["Your application", "Thank you for applying. We will not be moving forward with your application.", "Rejected"],
    ["Interview invitation", "Please choose a time for your interview with our hiring team.", "Interview"],
    ["Your application", "We invite you to interview with our team.", "Interview"],
    ["Your application", "Please complete the online assessment.", "Assessment"],
    ["Your application", "We are pleased to offer you the analyst role.", "Offer"],
  ];
  for (const [subject, body, expected] of cases) {
    assert.equal(isRecruitingMail(subject, body, "talent@example.com"), true, body);
    assert.equal(classifyMail(subject, body).stage, expected, body);
  }
  assert.equal(isRecruitingMail("Application update", "Your application is currently under review.", "talent@example.com"), true);
});
test("conditional interview advice is not a real interview invitation", () => {
  const { isRecruitingMail } = require("../.test-build/mail.js");
  const body = "Your first case could come before you are invited to interview. Practice 10 cases before you submit your application.";
  assert.equal(isRecruitingMail("BCG closes November 10", body, "coach@example.com"), false);
  assert.equal(classifyMail("BCG closes November 10", body).stage, null);
  assert.equal(classifyMail("Your application", "Thanks for applying. If shortlisted, you will be invited to interview.").stage, "Applied");
});
test("actual decisions override receipts but conditional disclaimers never create rejection events", () => {
  assert.equal(classifyMail("Thanks for applying", "If not selected to move forward, we will keep your information on file.").stage, "Applied");
  assert.equal(classifyMail("Your application", "Thank you for applying. You're invited to complete a recorded competency interview. If you are not selected, you will be notified.").stage, "Assessment");
  assert.equal(classifyMail("Your application", "Thank you for applying. We've made the difficult decision to not move forward with your candidacy.").stage, "Rejected");
  assert.equal(classifyMail("Application follow up", "Thank you for applying. After reviewing your resume we're sorry to say it's not a match for the position.").stage, "Rejected");
  assert.equal(classifyMail("You've completed the Acme Assessments!", "Congratulations, you have finished the assessment!").stage, "Assessment");
  assert.equal(classifyMail("Your application", "If you are not selected, you will hear from us. After review, you were not selected for this role.").stage, "Rejected");
});
test("application follow-up rejection does not require repeating an acknowledgement", () => {
  const { isRecruitingMail } = require("../.test-build/mail.js");
  assert.equal(isRecruitingMail("Application Follow Up", "After careful consideration, we regret to inform you that we will not be proceeding with your application at this time.", "hiring@example.com"), true);
});
