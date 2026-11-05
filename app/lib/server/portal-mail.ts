import { randomUUID } from "node:crypto";
import { accessToken, gmailApi, gmailCanSend } from "./gmail";
import { addEvent, drafts, events, portalDb, saveDraft } from "./portal";
import {
  acquireLease,
  readWorkspace,
  readSetting,
  setSetting,
  releaseLease,
} from "./database";
import { HttpError } from "./http";
import { draftOwner, validEmail, type PortalDraft } from "../portal";
import { gmailMessageUrl } from "../mail";
import { mailBody } from "./mail-content";
type Message = {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate: string;
  snippet?: string;
  payload?: {
    headers?: { name: string; value: string }[];
    mimeType?: string;
    body?: { data?: string };
    parts?: NonNullable<Message["payload"]>[];
  };
};
function header(m: Message, name: string) {
  return (
    m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
      ?.value || ""
  );
}
function addresses(s: string): string[] {
  return (
    s
      .toLowerCase()
      .match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || []
  );
}
export function messageEvidence(m: Message, email: string, own: string) {
  const body = mailBody(m.payload) || m.snippet || "";
  const sent =
    m.labelIds?.includes("SENT") && addresses(header(m, "To")).includes(email);
  const incoming =
    addresses(header(m, "From")).includes(email) &&
    !m.labelIds?.includes("SENT");
  const dsn = /mailer-daemon|postmaster/i.test(header(m, "From"));
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const recipient = new RegExp(
    `(?:Final-Recipient|Original-Recipient):[^\\n]*${escaped}(?:\\s|$)`,
    "i",
  ).test(body);
  const invalid = dsn && recipient && /Status:\s*5\.1\.1\b/i.test(body);
  const issue = dsn && addresses(body).includes(email);
  if (!sent && !incoming && !issue) return null;
  return {
    kind: sent
      ? "sent"
      : invalid
        ? "invalid_address"
        : issue
          ? "delivery_issue"
          : "incoming",
    text: `${header(m, "Subject")}\n${body}`.slice(0, 15000),
    url: gmailMessageUrl({
      id: m.id,
      threadId: m.threadId,
      mailboxEmail: own,
      rfcMessageId: header(m, "Message-ID"),
    }),
  };
}
// Scan one contact/page per call; persist the cursor only after the whole page succeeds.
export async function syncContactMail() {
  if (readWorkspace().workspace.emailPaused)
    throw new HttpError(409, "Gmail sync is paused in Settings.");
  if (!acquireLease("portal_mail", 600))
    throw new HttpError(409, "Contact mail sync is already running.");
  try {
    const contacts = readWorkspace().workspace.contacts.filter(
      (c) => c.email && validEmail(c.email),
    );
    if (!contacts.length)
      return {
        imported: 0,
        message: "No contact email addresses to sync yet.",
      };
    const cursor = readSetting<{
      contactId?: string;
      index: number;
      pageToken?: string;
    }>("portal_mail_cursor") || { index: 0 };
    const contact =
      contacts.find((c) => c.id === cursor.contactId) ||
      contacts[cursor.index % contacts.length];
    const email = contact.email!.toLowerCase();
    const token = await accessToken();
    const q = new URLSearchParams({
      q: `newer_than:30d {from:${email} to:${email} "${email}"}`,
      maxResults: "25",
    });
    if (cursor.contactId === contact.id && cursor.pageToken)
      q.set("pageToken", cursor.pageToken);
    let page: { messages?: { id: string }[]; nextPageToken?: string };
    try {
      page = await gmailApi(`messages?${q}`, token);
    } catch (e) {
      if (cursor.pageToken)
        setSetting("portal_mail_cursor", {
          index: cursor.index,
          contactId: contact.id,
        });
      throw e;
    }
    let imported = 0;
    for (const item of page.messages || []) {
      if (readWorkspace().workspace.emailPaused)
        throw new HttpError(409, "Gmail sync paused.");
      const id = `gmail:${contact.id}:${item.id}`;
      if (portalDb().prepare("SELECT id FROM portal_events WHERE id=?").get(id))
        continue;
      const m = await gmailApi<Message>(
        `messages/${encodeURIComponent(item.id)}?format=full`,
        token,
      );
      const evidence = messageEvidence(
        m,
        email,
        process.env.GMAIL_ACCOUNT_EMAIL || "",
      );
      if (!evidence) continue;
      addEvent({
        id,
        actor: "gmail",
        contactId: contact.id,
        at: new Date(Number(m.internalDate)).toISOString(),
        email,
        threadId: m.threadId,
        messageId: m.id,
        ...evidence,
      });
      imported++;
    }
    setSetting(
      "portal_mail_cursor",
      page.nextPageToken
        ? {
            index: cursor.index,
            contactId: contact.id,
            pageToken: page.nextPageToken,
          }
        : {
            index:
              (contacts.findIndex((c) => c.id === contact.id) + 1) %
              contacts.length,
          },
    );
    const now = new Date().toISOString();
    setSetting("portal_sync_at", now);
    return {
      imported,
      contactId: contact.id,
      more: !!page.nextPageToken,
      message: `Checked ${contact.name}; ${page.nextPageToken ? "more pages remain" : "latest 30 days checked"}.`,
    };
  } finally {
    releaseLease("portal_mail");
  }
}
export async function sendPortalDraft(id: string, version: number) {
  if (!gmailCanSend())
    throw new HttpError(
      403,
      "Enable Gmail sending in Settings first. Existing authorization is read-only.",
    );
  // Resolve credentials before reserving. Once an HTTP send starts, uncertain outcomes never auto-retry.
  const token = await accessToken();
  const d = portalDb();
  d.exec("BEGIN IMMEDIATE");
  let draft: PortalDraft | undefined;
  try {
    draft = drafts().find((x) => x.id === id);
    if (!draft || draft.version !== version)
      throw new HttpError(
        409,
        "Draft changed. Reload and review the current version.",
      );
    if (draft.status !== "draft")
      throw new HttpError(
        409,
        "This draft already started sending. Check the mailbox; do not resend automatically.",
      );
    if (
      drafts().some(
        (other) =>
          other.id !== draft!.id &&
          other.channel === "email" &&
          (other.contactId === draft!.contactId ||
            other.recipient?.toLowerCase() ===
              draft!.recipient?.toLowerCase()) &&
          ["sending", "unknown"].includes(other.status),
      )
    )
      throw new HttpError(
        409,
        "Another draft for this recipient is sending or has an uncertain outcome. Check Gmail before sending a variant.",
      );
    const contactId = draft.contactId;
    const contact = readWorkspace().workspace.contacts.find(
      (c) => c.id === contactId,
    );
    if (!contact || draftOwner(contact) !== draft.author)
      throw new HttpError(
        409,
        "Draft ownership changed; request the current owner's draft first.",
      );
    if (
      draft.channel !== "email" ||
      !contact.email ||
      !validEmail(contact.email) ||
      draft.recipient !== contact.email
    )
      throw new HttpError(400, "Review the current recipient before sending.");
    if (["Sent", "Replied"].includes(contact.emailStatus))
      throw new HttpError(
        409,
        "This contact already has a recorded email conversation. Review Gmail before another send.",
      );
    if (contact.emailStatus === "Stopped")
      throw new HttpError(409, "Contact is stopped.");
    if (
      events().some(
        (e) =>
          (e.contactId === contact.id || e.email === contact.email) &&
          [
            "sent",
            "sent_reported",
            "invalid_address",
            "incoming",
            "reply_confirmed",
          ].includes(e.kind),
      )
    )
      throw new HttpError(
        409,
        "Contact already has mail activity or a delivery issue. Review the conversation before a new send.",
      );
    if (
      /[\r\n]/.test(draft.subject) ||
      !draft.subject.trim() ||
      !draft.text.trim()
    )
      throw new HttpError(
        400,
        "A single-line subject and message are required.",
      );
    draft = {
      ...draft,
      status: "sending" as const,
      updatedAt: new Date().toISOString(),
    };
    saveDraft(draft);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  const own = process.env.GMAIL_ACCOUNT_EMAIL || "";
  const rfc = `<${randomUUID()}@career-compass.local>`;
  const raw = Buffer.from(
    [
      `From: ${own}`,
      `To: ${draft.recipient}`,
      `Subject: =?UTF-8?B?${Buffer.from(draft.subject).toString("base64")}?=`,
      `Message-ID: ${rfc}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(draft.text)
        .toString("base64")
        .match(/.{1,76}/g)!
        .join("\r\n"),
    ].join("\r\n"),
  ).toString("base64url");
  try {
    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok) {
      saveDraft({
        ...draft,
        status: response.status >= 500 ? "unknown" : "draft",
      });
      throw new HttpError(
        502,
        `Gmail send returned ${response.status}. Check the mailbox before retrying.`,
      );
    }
    const m = (await response.json()) as { id: string; threadId: string };
    if (!m.id || !m.threadId) throw new Error("Missing Gmail receipt");
    const url = gmailMessageUrl({
      id: m.id,
      threadId: m.threadId,
      mailboxEmail: own,
      rfcMessageId: rfc,
    });
    saveDraft({ ...draft, status: "sent", messageUrl: url });
    addEvent({
      id: `gmail:${draft.contactId}:${m.id}`,
      actor: "gmail",
      kind: "sent",
      contactId: draft.contactId,
      at: new Date().toISOString(),
      text: `${draft.subject}\n${draft.text}`,
      url,
      email: draft.recipient,
      messageId: m.id,
      threadId: m.threadId,
    });
    return { ok: true, url };
  } catch (e) {
    const current = drafts().find((x) => x.id === id);
    if (current?.status === "sending")
      saveDraft({ ...current, status: "unknown" });
    throw e;
  }
}
