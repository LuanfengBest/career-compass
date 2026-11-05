import { browserSessionActor } from "./agent-connection";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  db,
  readSetting,
  setSetting,
  readWorkspace,
  writeWorkspace,
} from "./database";
import { guard, HttpError } from "./http";
import {
  draftOwner,
  normalizeLinkedIn,
  safePhoto,
  validEmail,
  type Agent,
  type PortalDraft,
  type PortalEvent,
} from "../portal";
import type { Contact, Job } from "../model";
import { isJob } from "../logic";
import { canonicalJobUrl as canonicalUrl } from "../job-identity";
import { companyBucket } from "../companies";
import {
  taskDb,
  checkDiscoveryClaim,
  recordDiscovery,
  allTasks,
  allDiscoveries,
  allBatches,
  requireClaim,
} from "./task-store";
export function portalDb() {
  const d = db();
  d.exec(`CREATE TABLE IF NOT EXISTS portal_events(id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS portal_drafts(id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agent_receipts(id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agent_contacts(id TEXT PRIMARY KEY, contact_id TEXT NOT NULL);`);
  return d;
}
export function events(): PortalEvent[] {
  return portalDb()
    .prepare(
      "SELECT body FROM portal_events ORDER BY json_extract(body,'$.at') DESC",
    )
    .all()
    .map((r) => JSON.parse(String(r.body)));
}
export function drafts(): PortalDraft[] {
  return portalDb()
    .prepare("SELECT body FROM portal_drafts")
    .all()
    .map((r) => JSON.parse(String(r.body)));
}
export function saveDraft(d: PortalDraft) {
  portalDb()
    .prepare(
      "INSERT INTO portal_drafts VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
    )
    .run(d.id, JSON.stringify(d));
}
export function addEvent(e: PortalEvent) {
  portalDb()
    .prepare("INSERT OR IGNORE INTO portal_events VALUES (?,?)")
    .run(e.id, JSON.stringify(e));
}
export function issueToken(actor: Agent) {
  const token = randomBytes(32).toString("hex");
  setSetting(
    `agent_token:${actor}`,
    createHash("sha256").update(token).digest("hex"),
  );
  setSetting(`agent_seen:${actor}`, null);
  return token;
}
export function agentAuth(req: Request): Agent {
  guard(req);
  if (!req.headers.has("authorization")) {
    const browserActor=browserSessionActor(req);
    if(browserActor)return browserActor;
  }
  const raw = req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const hash = createHash("sha256").update(raw).digest();
  for (const actor of ["dot", "muse"] as const) {
    const stored = readSetting<string>(`agent_token:${actor}`);
    if (stored && timingSafeEqual(hash, Buffer.from(stored, "hex")))
      return actor;
  }
  throw new HttpError(
    401,
    "Agent token missing or revoked. Use the local agent-client helper or pair a browser at /agent-workbench.",
  );
}
export function textField(
  v: unknown,
  name: string,
  max = 2000,
  required = true,
): string {
  if (v === undefined && !required) return "";
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    throw new HttpError(400, `Invalid ${name}.`);
  return v.trim();
}
export function submitAgent(actor: Agent, input: Record<string, unknown>) {
  const eventId = textField(input.eventId, "eventId", 200);
  const receiptId = `${actor}:${eventId}`;
  const d = portalDb();
  taskDb();
  d.exec("BEGIN IMMEDIATE");
  try {
    const prior = d
      .prepare("SELECT body FROM agent_receipts WHERE id=?")
      .get(receiptId);
    if (prior) {
      d.exec("COMMIT");
      return JSON.parse(String(prior.body));
    }
    const now = new Date().toISOString();
    if (input.type === "opportunity" || input.type === "contact") {
      if (
        !input.batchId &&
        allTasks().some(
          (t) =>
            t.kind === "discover" &&
            t.owner === actor &&
            t.status === "claimed",
        )
      )
        throw new HttpError(
          409,
          "Include batchId, taskId and claimToken for the discovery task you are executing.",
        );
      checkDiscoveryClaim(actor, input);
    }
    let result: Record<string, unknown> = { ok: true };
    let contactId = "";
    let note = "";
    if (input.type === "opportunity") {
      const value = input.job as Record<string, unknown>;
      if (!value || typeof value !== "object")
        throw new HttpError(400, "job is required.");
      const jdUrl = canonicalUrl(textField(value.jdUrl, "jdUrl", 2000));
      if (!jdUrl)
        throw new HttpError(400, "A valid HTTPS job URL is required.");
      const company = textField(value.company, "company", 200),
        role = textField(value.role, "role", 300);
      const { workspace, revision } = readWorkspace();
      const existing = workspace.jobs.find(
        (j) => canonicalUrl(j.jdUrl) === jdUrl,
      );
      const bucket = companyBucket(company);
      const unknown = { status: "Unknown" as const, quote: "" };
      const job = {
        id: existing?.id || randomUUID(),
        company,
        role,
        family: value.family,
        region: value.region || "Unknown",
        location: textField(value.location, "location", 300, false),
        category: bucket.category,
        categoryReason: bucket.reason,
        color: "blue",
        published: textField(value.published, "published", 100, false),
        discovered: now,
        verified: null,
        source: actor,
        opt: unknown,
        stem: unknown,
        sponsorship: value.sponsorship || unknown,
        fit: textField(value.fit, "fit", 3000),
        gap: textField(value.gap, "gap", 3000, false),
        deadline: textField(value.deadline, "deadline", 30, false),
        jdUrl,
        summary: textField(value.summary, "summary", 15000),
        demo: false,
        collectedAt: now,
      } as Job;
      if (!isJob(job))
        throw new HttpError(
          400,
          "Invalid job fields. Use PM/DS/DA, valid region and YYYY-MM-DD deadline or empty.",
        );
      const saved = existing || job;
      saved.discoveredBy = [...new Set([...(saved.discoveredBy || []), actor])];
      if (!existing) workspace.jobs.push(saved);
      if (!writeWorkspace(workspace, revision))
        throw new HttpError(409, "Workspace changed; retry.");
      recordDiscovery(
        actor,
        input.batchId,
        "job",
        job.id,
        `${job.fit}\n${jdUrl}`,
      );
      result = { ok: true, jobId: job.id, merged: !!existing };
      note = `${company} · ${role}: ${existing ? "existing opportunity, additional source retained" : "new opportunity"}. ${job.fit} Source: ${jdUrl}`;
    } else if (input.type === "contact") {
      const value = input.contact as Record<string, unknown>;
      if (!value || typeof value !== "object")
        throw new HttpError(400, "contact is required.");
      const externalId = textField(value.externalId, "externalId", 200);
      const linked = textField(value.linkedin, "linkedin", 1000, false);
      const linkedin = normalizeLinkedIn(linked);
      if (linked && !linkedin)
        throw new HttpError(400, "Invalid LinkedIn profile URL.");
      const email = textField(value.email, "email", 254, false).toLowerCase();
      if (email && !validEmail(email))
        throw new HttpError(400, "Invalid email address.");
      const name = textField(value.name, "name", 100),
        company = textField(value.company, "company", 150);
      const title = textField(value.title, "title", 200),
        evidence = textField(value.evidence, "evidence");
      const source = textField(value.source, "source", 1000);
      const relationship = textField(value.relationship, "relationship", 200);
      const { workspace, revision } = readWorkspace();
      const alias = d
        .prepare("SELECT contact_id FROM agent_contacts WHERE id=?")
        .get(`${actor}:${externalId}`);
      const existing = workspace.contacts.find(
        (c) =>
          alias?.contact_id === c.id ||
          (linkedin && normalizeLinkedIn(c.linkedin) === linkedin),
      );
      if (alias && linkedin) {
        const aliased = workspace.contacts.find(
          (c) => c.id === alias.contact_id,
        );
        if (
          aliased?.linkedin &&
          normalizeLinkedIn(aliased.linkedin) !== linkedin
        )
          throw new HttpError(
            409,
            "externalId identity conflicts with the LinkedIn profile.",
          );
      }
      const requestedId = textField(value.contactId, "contactId", 200, false);
      if (requestedId && existing?.id !== requestedId)
        throw new HttpError(
          409,
          "Canonical contact identity must match an existing LinkedIn URL or your previous externalId.",
        );
      const ids = value.jobIds ?? [];
      if (
        !Array.isArray(ids) ||
        !ids.every(
          (id) =>
            typeof id === "string" && workspace.jobs.some((j) => j.id === id),
        )
      )
        throw new HttpError(
          400,
          "jobIds must reference existing opportunities.",
        );
      const photoUrl = safePhoto(
        textField(value.photoUrl, "photoUrl", 2000, false),
      );
      const contact: Contact = existing
        ? {
            ...existing,
            discoveredBy: [
              ...new Set([...(existing.discoveredBy || []), actor]),
            ],
            jobIds: [...new Set([...existing.jobIds, ...ids])],
            ...(!existing.email && email
              ? {
                  email,
                  emailSource:
                    value.emailSource === "Public"
                      ? ("Public" as const)
                      : ("Inferred" as const),
                }
              : {}),
            ...(!existing.photoUrl && photoUrl ? { photoUrl } : {}),
          }
        : {
            id: randomUUID(),
            name,
            company,
            title,
            relationship,
            evidence,
            source,
            linkedin,
            jobIds: ids,
            demo: false,
            emailStatus: "Not contacted",
            connectionStatus: "To Be Connect",
            email,
            emailSource: value.emailSource === "Public" ? "Public" : "Inferred",
            photoUrl,
            discoveredBy: [actor],
          };
      const oldOwner = existing ? draftOwner(existing) : null;
      workspace.contacts = existing
        ? workspace.contacts.map((c) => (c.id === existing.id ? contact : c))
        : [...workspace.contacts, contact];
      if (!writeWorkspace(workspace, revision))
        throw new HttpError(409, "Workspace changed; retry.");
      d.prepare(
        "INSERT INTO agent_contacts VALUES (?,?) ON CONFLICT(id) DO UPDATE SET contact_id=excluded.contact_id",
      ).run(`${actor}:${externalId}`, contact.id);
      contactId = contact.id;
      recordDiscovery(
        actor,
        input.batchId,
        "contact",
        contact.id,
        `${source}\n${evidence}`,
      );
      const possibleDuplicates = workspace.contacts
        .filter(
          (c) =>
            c.id !== contact.id &&
            c.name.toLowerCase() === name.toLowerCase() &&
            c.company.toLowerCase() === company.toLowerCase(),
        )
        .map((c) => c.id);
      result = {
        ok: true,
        contactId,
        draftOwner: draftOwner(contact),
        possibleDuplicates,
      };
      note = `${name}: ${existing ? "merged discovery" : "contact discovered"}; draft owner ${draftOwner(contact)}${oldOwner && oldOwner !== draftOwner(contact) ? "; previous draft requires review" : ""}. ${evidence}`;
    } else if (input.type === "draft") {
      contactId = textField(input.contactId, "contactId", 200);
      const task = input.taskId
        ? requireClaim(actor, input.taskId, input.claimToken, "draft")
        : allTasks().find(
            (t) =>
              t.kind === "draft" &&
              t.entityId === contactId &&
              t.status !== "cancelled",
          );
      if (task) {
        const claimed = requireClaim(
          actor,
          input.taskId,
          input.claimToken,
          "draft",
        );
        if (
          claimed.id !== task.id ||
          claimed.entityId !== contactId ||
          claimed.input.channel !== input.channel
        )
          throw new HttpError(
            409,
            "Draft must match the claimed task and channel.",
          );
      } else if (
        allDiscoveries().some(
          (x) =>
            x.kind === "contact" &&
            x.entityId === contactId &&
            allBatches().some(
              (b) =>
                b.id === x.batchId &&
                ["discovering", "ready"].includes(b.status),
            ),
        )
      )
        throw new HttpError(
          409,
          "Wait for discovery reconciliation and task release before drafting.",
        );
      const contact = readWorkspace().workspace.contacts.find(
        (c) => c.id === contactId,
      );
      if (!contact || draftOwner(contact) !== actor)
        throw new HttpError(
          409,
          "Only this contact's draft owner can submit a draft. Dot owns shared discoveries.",
        );
      if (input.channel !== "email" && input.channel !== "linkedin")
        throw new HttpError(400, "Invalid channel.");
      const id = task
        ? `${contactId}:${input.channel}:task:${task.id}`
        : `${contactId}:${input.channel}`;
      const old = drafts().find((d) => d.id === id);
      if (old && (old.status !== "draft" || old.edited))
        throw new HttpError(
          409,
          "Existing draft was edited or sending started; it cannot be overwritten by an agent.",
        );
      const draft: PortalDraft = {
        id,
        contactId,
        channel: input.channel,
        author: actor,
        subject: textField(
          input.subject,
          "subject",
          200,
          input.channel === "email",
        ),
        text: textField(input.text, "text", 20000),
        version: (old?.version || 0) + 1,
        edited: false,
        status: "draft",
        updatedAt: now,
        recipient: contact.email,
      };
      if (/[\r\n]/.test(draft.subject))
        throw new HttpError(400, "Subject must be one line.");
      saveDraft(draft);
      result = { ok: true, draftId: id, version: draft.version };
      note = "Draft submitted.";
    } else if (input.type === "progress") {
      note = textField(input.text, "text", 4000);
    } else if (input.type === "outreach_report") {
      contactId = textField(input.contactId, "contactId", 200);
      if (!readWorkspace().workspace.contacts.some((c) => c.id === contactId))
        throw new HttpError(404, "Unknown contact.");
      if (input.channel !== "email" && input.channel !== "linkedin")
        throw new HttpError(400, "Invalid channel.");
      const occurredAt = textField(input.occurredAt, "occurredAt", 100);
      if (
        !Number.isFinite(Date.parse(occurredAt)) ||
        Date.parse(occurredAt) > Date.now() + 60000
      )
        throw new HttpError(400, "Invalid event time.");
      note = textField(input.text, "text", 4000);
      addEvent({
        id: receiptId,
        actor,
        kind:
          input.channel === "email"
            ? "sent_reported"
            : "linkedin_sent_reported",
        contactId,
        at: new Date(occurredAt).toISOString(),
        text: `Agent-reported send, not yet verified: ${note}`,
      });
    } else if (input.type === "interpretation") {
      const messageId = textField(input.messageId, "messageId", 500);
      const event = events().find(
        (e) => e.id === messageId && e.actor === "gmail",
      );
      if (!event)
        throw new HttpError(
          404,
          "Read an existing synced Gmail event before interpreting it.",
        );
      if (
        !["reply_confirmed", "automatic_reply", "delivery_review"].includes(
          String(input.kind),
        )
      )
        throw new HttpError(400, "Invalid interpretation kind.");
      contactId = event.contactId || "";
      const quote = textField(input.quote, "quote", 2000);
      if (!event.text.includes(quote))
        throw new HttpError(
          400,
          "Evidence quote must appear in the synced message.",
        );
      note = textField(input.text, "text", 2000) + ` Evidence: ${quote}`;
      addEvent({
        id: receiptId,
        actor,
        kind: String(input.kind),
        contactId,
        at: now,
        text: note,
        url: event.url,
        messageId: event.id,
      });
    } else
      throw new HttpError(
        400,
        "Supported types: opportunity, contact, draft, progress, outreach_report, interpretation.",
      );
    if (input.type !== "interpretation" && input.type !== "outreach_report")
      addEvent({
        id: receiptId,
        actor,
        kind: String(input.type),
        contactId: contactId || undefined,
        at: now,
        text: note,
      });
    setSetting(`agent_seen:${actor}`, now);
    d.prepare("INSERT INTO agent_receipts VALUES (?,?)").run(
      receiptId,
      JSON.stringify(result),
    );
    d.exec("COMMIT");
    return result;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
