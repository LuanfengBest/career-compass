"use client";
import Link from "next/link";
import { useState } from "react";
import { useWorkspace } from "../lib/store";
import { draftOwner, type PortalDraft } from "../lib/portal";
import { safeLinkedInUrl } from "../lib/logic";
import { usePortal, portalAction } from "./portal-data";
import { taskAction } from "./task-center";
import {BulkOutreach} from "./bulk-outreach";
import { Badge, Heading } from "./ui";
import { DraftProgress } from "./draft-progress";
import { ContactSearch, searchContacts } from "./contact-search";
export function OutreachCenter({
  initialContact,
}: {
  initialContact?: string;
}) {
  const state = useWorkspace();
  const { data, error } = usePortal();
  const [selected, setSelected] = useState(initialContact || "");
  const [query, setQuery] = useState("");
  const matches = searchContacts(state.contacts, query);
  const contact =
    state.contacts.find((c) => c.id === selected) || state.contacts[0];
  const relevant = data.drafts.filter((d) => d.contactId === contact?.id);
  const legacy = state.outreach.find((o) => o.contactId === contact?.id);
  return (
    <>
      <Heading
        eyebrow="AGENTS DRAFT. YOU CAN TAKE OVER."
        title="Your outreach desk"
        description="Review agent-written drafts, edit the final text and send. No website model or template generation."
        action={
          <Link href="/agents" className="button secondary">
            Agent connections ↗
          </Link>
        }
      />
      <BulkOutreach drafts={data.drafts} contacts={state.contacts} sendEnabled={data.sendEnabled} />
      <div className="outreach-grid">
        <section className="panel contact-list">
          <h2>Contact queue</h2>
          <ContactSearch query={query} onChange={setQuery} count={matches.length} total={state.contacts.length} />
          {query && <p className="muted">Select a result to open it. Searching keeps your current draft open.</p>}
          {!!state.contacts.length && !matches.length && <p>No matching contacts. Try another name, company or email.</p>}
          {matches.map((c) => (
            <button
              key={c.id}
              className={`contact-option ${contact?.id === c.id ? "selected" : ""}`}
              onClick={() => setSelected(c.id)}
            >
              <span>
                <strong>{c.name}</strong>
                <small>
                  {c.company} · Draft owner: {draftOwner(c) || "Unassigned"}
                </small>
              </span>
            </button>
          ))}
          {!state.contacts.length && (
            <p>Connect an agent to receive real contacts.</p>
          )}
        </section>
        <section className="stack">
          {contact && (
            <div className="panel">
              <h2>{contact.name}</h2>
              <p>
                {contact.title} · {contact.company}
              </p>
              <p>{contact.evidence}</p>
              <p>Email: {contact.email || "Not found"}</p>
            </div>
          )}
          {relevant.map((d) => (
            <DraftEditor
              key={`${d.id}:${d.version}:${d.status}`}
              draft={d}
              sendEnabled={data.sendEnabled}
              owner={contact ? draftOwner(contact) : null}
              linkedin={safeLinkedInUrl(contact?.linkedin || "")}
            />
          ))}
          {!relevant.length && contact && <DraftProgress contactId={contact.id} />}
          {legacy?.draft && (
            <details className="panel">
              <summary>Previous local draft (retained)</summary>
              <p className="message-preview">{legacy.draft}</p>
              <p className="muted">
                Historical template/manual record; not an agent draft or proof
                of sending.
              </p>
            </details>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
      </div>
    </>
  );
}
function DraftEditor({
  draft,
  sendEnabled,
  owner,
  linkedin,
}: {
  draft: PortalDraft;
  sendEnabled: boolean;
  owner: string | null;
  linkedin: string;
}) {
  const [subject, setSubject] = useState(draft.subject),
    [text, setText] = useState(draft.text),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const dirty = subject !== draft.subject || text !== draft.text;
  const stale = owner !== draft.author;
  async function act(action: "edit" | "send" | "queue_linkedin") {
    setBusy(true);
    try {
      if (action === "queue_linkedin") {
        await taskAction({ action, draftId: draft.id, version: draft.version });
        window.dispatchEvent(new Event("portal-refresh"));
      } else
        await portalAction({
          action,
          id: draft.id,
          version: draft.version,
          subject,
          text,
        });
      setNotice(
        action === "queue_linkedin"
          ? "Queued for the assigned agent. Track the actual outcome in Tasks."
          : action === "send"
            ? "Gmail accepted the message. This is not delivery confirmation."
            : "Draft saved.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="section-title">
        <h2>{draft.channel === "email" ? "Email" : "LinkedIn"} draft</h2>
        <Badge>
          {draft.author} · {draft.status}
        </Badge>
      </div>
      <p className="muted">
        Updated {new Date(draft.updatedAt).toLocaleString()}
        {draft.edited ? " · Edited by you" : ""}. New drafting tasks create
        separate proposals; saved edits are retained.
      </p>
      {stale && (
        <p className="warning">
          Discovery ownership changed. Request a draft from {owner}; sending
          this draft is blocked.
        </p>
      )}
      <label>
        Recipient
        <input
          readOnly
          value={
            draft.channel === "linkedin"
              ? linkedin || "No LinkedIn profile"
              : draft.recipient || "No email address"
          }
        />
      </label>
      {draft.channel === "email" && (
        <label>
          Subject
          <input
            value={subject}
            maxLength={200}
            disabled={draft.status !== "draft"}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
      )}
      <label>
        Message
        <textarea
          className="draft-editor"
          value={text}
          maxLength={20000}
          disabled={draft.status !== "draft"}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="button-row">
        <button
          className="button secondary"
          disabled={busy || !dirty || draft.status !== "draft"}
          onClick={() => act("edit")}
        >
          Save edits
        </button>
        {draft.channel === "email" ? (
          <button
            className="button primary"
            disabled={
              busy ||
              dirty ||
              stale ||
              !sendEnabled ||
              draft.status !== "draft" ||
              !draft.recipient
            }
            onClick={() => act("send")}
          >
            {busy ? "Working…" : "Send this draft"}
          </button>
        ) : (
          <>
            <button
              className="button primary"
              disabled={
                busy || dirty || stale || !linkedin || draft.status !== "draft"
              }
              onClick={() => act("queue_linkedin")}
            >
              Send via agent
            </button>
            <button
              className="button secondary"
              onClick={() =>
                navigator.clipboard
                  .writeText(text)
                  .then(() =>
                    setNotice(
                      "Copied; send in LinkedIn and have your agent report the outcome.",
                    ),
                  )
                  .catch(() => setNotice("Copy manually from the editor."))
              }
            >
              Copy message
            </button>
            {linkedin && (
              <a
                className="button primary"
                href={linkedin}
                target="_blank"
                rel="noreferrer"
              >
                Open LinkedIn ↗
              </a>
            )}
          </>
        )}
        {draft.messageUrl && (
          <a
            className="text-link"
            href={draft.messageUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open sent message ↗
          </a>
        )}
      </div>
      {draft.channel === "email" && !sendEnabled && (
        <p className="info-note">
          <Link href="/settings">Enable Gmail sending in Settings</Link>. Your
          existing read-only connection cannot send.
        </p>
      )}
      {draft.status === "queued" && (
        <p className="info-note">
          Waiting for the assigned agent.{" "}
          <Link href="/tasks">Track or cancel in Tasks →</Link>
        </p>
      )}
      {draft.status === "unknown" && (
        <p className="warning">
          Sending outcome is uncertain. Check Gmail; automatic retry is
          disabled.
        </p>
      )}
      {notice && (
        <p role="status" className="info-note">
          {notice}
        </p>
      )}
    </section>
  );
}
