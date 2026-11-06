import type { Contact, Workspace } from "./model";
export type Agent = "dot" | "muse";
export type PortalDraft = {
  id: string;
  contactId: string;
  channel: "email" | "linkedin";
  author: Agent;
  subject: string;
  text: string;
  version: number;
  edited: boolean;
  status: "draft" | "queued" | "sending" | "sent" | "unknown";
  updatedAt: string;
  messageUrl?: string;
  recipient?: string;
};
export type PortalEvent = {
  id: string;
  actor: Agent | "gmail" | "user";
  kind: string;
  contactId?: string;
  at: string;
  text: string;
  url?: string;
  email?: string;
  threadId?: string;
  messageId?: string;
};
export type PortalSnapshot = {
  drafts: PortalDraft[];
  events: PortalEvent[];
  agents: { actor: Agent; configured: boolean; lastSeen: string | null; localCredential?: boolean; cloudCredential?: boolean; cloudCheck?: string | null }[];
  sendEnabled: boolean;
  syncAt: string | null;
};
export function draftOwner(c: Contact): Agent | null {
  if (c.draftAssignment) return c.draftAssignment;
  return c.discoveredBy?.includes("dot")
    ? "dot"
    : c.discoveredBy?.includes("muse")
      ? "muse"
      : null;
}
export function normalizeLinkedIn(value: string) {
  try {
    const u = new URL(value);
    if (
      !/^(www\.)?linkedin\.com$/.test(u.hostname) ||
      !/^\/in\/[^/]+\/?$/.test(u.pathname)
    )
      return "";
    return `https://www.linkedin.com${u.pathname.replace(/\/$/, "").toLowerCase()}`;
  } catch {
    return "";
  }
}
export function validEmail(v: string) {
  return (
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v) &&
    v.length <= 254
  );
}
export function safePhoto(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "https:" &&
      /(^|\.)licdn\.com$/.test(u.hostname) &&
      !u.username &&
      !u.password
      ? u.href
      : "";
  } catch {
    return "";
  }
}
export function contactSummary(c: Contact, data: PortalSnapshot) {
  const events = data.events
    .filter((e) => e.contactId === c.id)
    .sort((a, b) => b.at.localeCompare(a.at));
  const factual = events.filter((e) => e.actor === "gmail");
  const invalid = factual.some(
    (e) => e.kind === "invalid_address" && e.email === c.email,
  );
  const incoming = factual.some((e) => e.kind === "incoming");
  const replied = events.some((e) => e.kind === "reply_confirmed");
  const sent =
    events.some(
      (e) =>
        e.kind === "sent" ||
        e.kind === "sent_reported" ||
        e.kind === "linkedin_sent_reported",
    ) ||
    c.emailStatus === "Sent" ||
    c.emailStatus === "Replied";
  const emailUrl =
    factual.find((e) => e.url)?.url ||
    events.find((e) => e.url?.startsWith("https://mail.google.com/"))?.url;
  return {
    events,
    invalid,
    incoming,
    replied,
    sent,
    emailUrl,
    emailLabel: !c.email
      ? "Email not found"
      : invalid
        ? "Invalid address · bounced"
        : `${c.emailSource || "Inferred"} address`,
    stage: replied
      ? "Replied"
      : incoming
        ? "Incoming · review needed"
        : invalid
          ? "Bounced"
          : sent
            ? "Contacted"
            : data.drafts.some((d) => d.contactId === c.id)
              ? "Draft ready"
              : "Target contact",
  };
}
export function outreachCounts(state: Workspace, data: PortalSnapshot) {
  const summaries = state.contacts.map((c) => contactSummary(c, data));
  return [
    ["Target contacts", summaries.length],
    ["Not contacted", summaries.filter((s) => !s.sent).length],
    ["Contacted", summaries.filter((s) => s.sent).length],
    [
      "Incoming · to review",
      summaries.filter((s) => s.incoming && !s.replied).length,
    ],
    ["Replied", summaries.filter((s) => s.replied).length],
    ["Invalid addresses", summaries.filter((s) => s.invalid).length],
  ] as const;
}
