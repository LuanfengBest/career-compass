"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Linkedin, Plus } from "lucide-react";
import { contactSummary, draftOwner, safePhoto } from "../lib/portal";
import { usePortal, portalAction } from "./portal-data";
import { safeLinkedInUrl } from "../lib/logic";
import { updateWorkspace, useWorkspace } from "../lib/store";
import { Avatar, Badge, Heading } from "./ui";
import { Pagination, usePagination } from "./pagination";
import { DetailDialog } from "./detail-dialog";
export function People() {
  const state = useWorkspace();
  const { data: portal, error: portalError } = usePortal();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const pagination = usePagination(state.contacts, 30);
  const [selected, setSelected] = useState<string | null>(null);
  const person = state.contacts.find((c) => c.id === selected);
  function addContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const get = (key: string) => String(data.get(key) ?? "").trim();
    const linkedin = safeLinkedInUrl(get("linkedin"));
    if (!linkedin) {
      setError("Enter a valid https://www.linkedin.com/in/… profile URL.");
      return;
    }
    if (
      state.contacts.some(
        (c) =>
          c.linkedin.replace(/\/$/, "").split("?")[0] ===
          linkedin.replace(/\/$/, "").split("?")[0],
      )
    ) {
      setError(
        "This LinkedIn profile already exists. Use the existing contact.",
      );
      return;
    }
    if (!["name", "company", "title", "evidence"].every((k) => get(k))) {
      setError("Add a name, employment details, and factual context.");
      return;
    }
    updateWorkspace((s) => ({
      ...s,
      contacts: [
        ...s.contacts,
        {
          id: crypto.randomUUID(),
          name: get("name"),
          company: get("company"),
          title: get("title"),
          relationship: "User provided",
          evidence: get("evidence"),
          source: linkedin,
          linkedin,
          jobIds: [get("jobId")],
          demo: false,
          emailStatus: "Not contacted",
          connectionStatus: "To Be Connect",
        },
      ],
    }));
    setAdding(false);
    setError("");
  }
  return (
    <div className="people-page compact-collection">
      <Heading
        eyebrow="BUILD MEANINGFUL CONNECTIONS"
        title="Find your people. Start a conversation."
        description="Your contacts, connection status and next conversation."
        action={
          <button className="button primary" onClick={() => setAdding(!adding)}>
            <Plus size={16} />
            Add contact
          </button>
        }
      />
      <p className="collection-note">
        {state.contacts.length} saved contacts. People appear after an agent
        reports an actual discovery; importing job feeds does not find people.{" "}
        <Link href="/tasks" className="text-link">
          Request a people search →
        </Link>
      </p>
      {adding && (
        <form className="panel contact-form" onSubmit={addContact}>
          <div className="section-title">
            <h2>Add a LinkedIn contact</h2>
            <button
              className="text-link"
              type="button"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
          <div className="form-grid">
            <label>
              Name
              <input name="name" required maxLength={100} />
            </label>
            <label>
              Company
              <input name="company" required maxLength={100} />
            </label>
            <label>
              Role
              <input name="title" required maxLength={150} />
            </label>
            <label>
              LinkedIn profile URL
              <input
                name="linkedin"
                type="url"
                required
                placeholder="https://www.linkedin.com/in/…"
              />
            </label>
            <label className="full">
              Linked opportunity
              <select name="jobId" defaultValue={state.jobs[0]?.id}>
                {state.jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.company} · {j.role}
                  </option>
                ))}
              </select>
            </label>
            <label className="full">
              Evidence / reason to connect
              <textarea
                name="evidence"
                required
                maxLength={1000}
                placeholder="Record explicit employment, education, or relevant experience. Do not infer nationality or alumni relationships."
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="warning">
              {error}
            </p>
          )}
          <button className="button primary">Save contact</button>
        </form>
      )}
      <div className="button-row">
        <Link className="button secondary" href="/agents">
          Agent connections
        </Link>
        <button
          className="button secondary"
          disabled={syncing}
          onClick={async () => {
            setSyncing(true);
            try {
              const r = await portalAction({ action: "sync" });
              setSyncMessage(r.message);
            } catch (e) {
              setSyncMessage(e instanceof Error ? e.message : "Sync failed");
            } finally {
              setSyncing(false);
            }
          }}
        >
          {syncing ? "Checking Gmail…" : "Sync contact mail"}
        </button>
        <span className="muted">
          {portal.syncAt
            ? `Last contact check: ${new Date(portal.syncAt).toLocaleString()}`
            : "Contact mail not checked yet"}
        </span>
      </div>
      {(syncMessage || portalError) && (
        <p className="info-note" role="status">
          {syncMessage || portalError}
        </p>
      )}
      <Pagination {...pagination} label="people" />
      <div className="people-grid compact-grid">
        {pagination.items.map((c) => {
          const summary = contactSummary(c, portal);
          const photo = safePhoto(c.photoUrl || "");
          return (
            <article
              className="panel person-card compact-card identity-card"
              key={c.id}
            >
              <div className="compact-card-heading">
                {photo ? (
                  <ProfilePhoto url={photo} name={c.name} />
                ) : (
                  <Avatar name={c.name} color="purple" />
                )}
                <div>
                  <h2 className="one-line" title={c.name}>
                    {c.name}
                  </h2>
                  <span className="one-line muted">
                    {c.title} · {c.company}
                  </span>
                </div>
              </div>
              <div className="identity-badges">
                <Badge tone="blue">{c.relationship}</Badge>
                <Badge>{summary.stage}</Badge>
              </div>
              <p className="two-lines contact-context" title={c.evidence}>
                {c.evidence}
              </p>
              <div className="contact-channel">
                <strong>Email</strong>
                <span className="one-line" title={c.email}>
                  {c.email || "Not found"}
                </span>
                <small>
                  {summary.emailLabel}
                  {summary.invalid ? " · Use LinkedIn" : ""}
                </small>
              </div>
              <div className="contact-channel">
                <strong>LinkedIn</strong>
                <span>
                  {safeLinkedInUrl(c.linkedin)
                    ? c.connectionStatus || "To Be Connect"
                    : "Profile not confirmed"}
                </span>
                <small>
                  {summary.events.some((e) => e.kind === "linkedin_reply_reported")
                    ? "Reply · reported in imported history"
                    : summary.events.some(
                    (e) => e.kind === "linkedin_incoming_reported",
                  )
                    ? "Incoming message · agent reported"
                    : summary.events.some(
                          (e) => e.kind === "linkedin_sent_reported",
                        )
                      ? "Message sent · agent reported"
                      : "No message activity reported"}
                </small>
                <small>
                  {c.discoveredBy?.length === 2
                    ? "Both agents found"
                    : c.discoveredBy?.[0]
                      ? `${c.discoveredBy[0]} found`
                      : "Manually saved"}{" "}
                  · Draft owner: {draftOwner(c) || "Not assigned"}
                </small>
              </div>
              <div className="compact-card-actions identity-actions">
                <button
                  className="button secondary"
                  onClick={() => setSelected(c.id)}
                >
                  Details
                </button>
                {safeLinkedInUrl(c.linkedin) && (
                  <a
                    className="text-link"
                    href={safeLinkedInUrl(c.linkedin)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Linkedin size={15} /> Profile ↗
                  </a>
                )}
                {summary.emailUrl && (
                  <a
                    className="text-link"
                    href={summary.emailUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Email ↗
                  </a>
                )}
                <Link className="text-link" href={`/outreach?contact=${c.id}`}>
                  Drafts ↗
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      {person && (
        <DetailDialog title={person.name} onClose={() => setSelected(null)}>
          <p>
            {person.title} · {person.company}
          </p>
          <Badge>{person.relationship}</Badge>
          <h3>Why connect</h3>
          <p>{person.evidence}</p>
          <h3>Contact channels</h3>
          <p>
            Email: {person.email || "Not found"} ·{" "}
            {contactSummary(person, portal).emailLabel}
          </p>
          <p>Source: {person.source}</p>
          <label>
            LinkedIn connection
            <select
              value={person.connectionStatus || "To Be Connect"}
              onChange={(e) =>
                updateWorkspace((s) => ({
                  ...s,
                  contacts: s.contacts.map((c) =>
                    c.id === person.id
                      ? {
                          ...c,
                          connectionStatus: e.target.value as
                            | "To Be Connect"
                            | "Connected",
                        }
                      : c,
                  ),
                }))
              }
            >
              <option>To Be Connect</option>
              <option>Connected</option>
            </select>
          </label>
          <h3>Communication history</h3>
          {contactSummary(person, portal).events.map((e) => (
            <article className="activity-row" key={e.id}>
              <Badge>
                {e.actor} · {e.kind}
              </Badge>
              <time>{new Date(e.at).toLocaleString()}</time>
              <p className="message-preview">{e.text}</p>
              {e.url && (
                <a
                  className="text-link"
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open corresponding email ↗
                </a>
              )}
            </article>
          ))}
          {!contactSummary(person, portal).events.length && (
            <p>No synchronized communication events yet.</p>
          )}
          <h3>Linked opportunities</h3>
          {person.jobIds.map((id) => (
            <p key={id}>
              {state.jobs.find((j) => j.id === id)?.role || "Role not provided"}
            </p>
          ))}
          <p>
            Email: {person.emailStatus} · LinkedIn:{" "}
            {state.outreach.find((o) => o.contactId === person.id)?.status ||
              "Not sent"}
          </p>
          {safeLinkedInUrl(person.linkedin) && (
            <a
              className="button secondary"
              href={safeLinkedInUrl(person.linkedin)}
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn profile <ArrowUpRight size={15} />
            </a>
          )}
        </DetailDialog>
      )}
      <Pagination {...pagination} label="people" />
    </div>
  );
}

function ProfilePhoto({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <Avatar name={name} color="purple" />
  ) : (
    // Remote profile images are provided by the agent; never inferred from a name.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="profile-photo"
      src={url}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
