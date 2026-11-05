"use client";
import { useEffect, useRef, useState } from "react";
import { syncPages } from "../lib/sync-pages";

import { updateWorkspace, useWorkspace } from "../lib/store";
import { Badge } from "./ui";
type Status = {
  worker?: {
    state: string;
    checkedAt: string;
    nextCheck: string;
    lastSuccess?: string;
    message: string;
  };
  database: {
    path: string;
    connected: boolean;
    provider: string;
    records: {
      jobs: number;
      applications: number;
      contacts: number;
      leads: number;
      emails: { total: number; pending: number };
    };
  };
  gmail: {
    configured: boolean;
    connected: boolean;
    sendEnabled?: boolean;
    email: string;
    message: string;
    lastSync: string | null;
    more: boolean;
    syncError?: { message: string; at: string } | null;
  };
  linkedin: { message: string };
};
export function Integrations() {
  const state = useWorkspace();
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const stopSync = useRef(false);
  const active = useRef(false);
  useEffect(() => {
    stopSync.current = false;
    return () => {
      stopSync.current = true;
    };
  }, []);
  async function load() {
    const response = await fetch("/api/integrations", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setStatus(data);
  }
  useEffect(() => {
    fetch("/api/integrations", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setStatus(data);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  async function action(name: "sync" | "disconnect" | "sync-all") {
    if (active.current) return;
    active.current = true;
    stopSync.current = false;
    setBusy(true);
    try {
      if (name === "sync-all") {
        setMessage(
          "Syncing remaining pages. Keep this page open; each completed page is saved.",
        );
        const result = await syncPages(
          async () => {
            const response = await fetch("/api/gmail/sync", { method: "POST" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data;
          },
          () => stopSync.current,
          (pages, imported, more) => {
            setMessage(
              `${pages} pages completed · ${imported} new events. ${more ? "Continuing…" : "Caught up. Review suggestions in Applications."}`,
            );
          },
        );
        if (result.more)
          setMessage(
            `Stopped after ${result.pages} pages. ${result.imported} new events saved; remaining pages can resume later.`,
          );
        await load();
        return;
      }
      const response = await fetch(`/api/gmail/${name}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(
        data.message ||
          `${data.imported} new email events imported. ${data.more ? "More pages remain; click Sync Gmail again." : "Caught up to this checkpoint."} Review suggestions in Applications.`,
      );
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Operation failed.");
      await load().catch(() => {});
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="section-title">
        <h2>Accounts & permissions</h2>
        <Badge tone="blue">Local mode</Badge>
      </div>
      <div className="integration-row">
        <strong>Gmail background sync</strong>
        <p>
          {status?.worker
            ? `${status.worker.state} · Last check ${new Date(status.worker.checkedAt).toLocaleString()}`
            : "Worker not started. Run npm run worker in the project terminal."}
        </p>
        {status?.worker && <p>{status.worker.message}</p>}
        <p className="muted">
          Checks application mail and known contacts about every minute while
          the local worker runs; failures back off automatically. Closing a
          browser tab does not stop the worker. Computer sleep or stopping the
          process does. Refresh this page to update its status.
        </p>
      </div>
      <div className="integration-row">
        <strong>Database</strong>
        <p>
          {status?.database.connected
            ? `${status.database.provider} · connected. Records persist across browser and server restarts.`
            : "Checking database…"}
        </p>
        <small>
          SQLite is the selected database. No Supabase account is needed. This
          version runs on this computer only.
        </small>
        {status?.database.path && (
          <p className="database-path">
            <code>{status.database.path}</code>
          </p>
        )}
        {status?.database.records && (
          <p>
            {status.database.records.jobs} workspace jobs ·{" "}
            {status.database.records.applications} applications ·{" "}
            {status.database.records.contacts} contacts ·{" "}
            {status.database.records.emails.total} email events (
            {status.database.records.emails.pending} awaiting review)
          </p>
        )}
        <a href="/data" target="_blank" rel="noreferrer" className="text-link">
          Browse saved jobs & people ↗
        </a>
      </div>
      <div className="integration-row">
        <div className="section-title">
          <strong>Gmail</strong>
          <Badge tone={status?.gmail.connected ? "green" : "amber"}>
            {status?.gmail.connected
              ? status.gmail.sendEnabled
                ? "Read + send connected"
                : "Read-only connected"
              : "Not connected"}
          </Badge>
        </div>
        <p>{status?.gmail.message || "Checking configuration…"}</p>
        {status?.gmail.syncError && (
          <p className="info-note">
            Last sync issue: {status.gmail.syncError.message}
          </p>
        )}
        {status?.gmail.email && <p>{status.gmail.email}</p>}
        <p>
          First import: 30 days of recruiting-related messages. Later imports
          use Gmail history. Sync one page, or continue through the remaining
          pages while this screen stays open.
        </p>
        <small>
          Last completed page:{" "}
          {status?.gmail.lastSync
            ? new Date(status.gmail.lastSync).toLocaleString()
            : "Never"}
        </small>
        <div className="button-row">
          {!status?.gmail.sendEnabled && (
            <form action="/api/gmail/connect" method="post">
              <input type="hidden" name="send" value="true" />
              <button
                className="button primary"
                disabled={!status?.gmail.configured || busy}
              >
                Enable Gmail sending
              </button>
            </form>
          )}
          <form action="/api/gmail/connect" method="post">
            <button
              className="button secondary"
              disabled={!status?.gmail.configured || busy}
            >
              {status?.gmail.connected ? "Reconnect Gmail" : "Connect Gmail"}
            </button>
          </form>
          <button
            className="button primary"
            disabled={!status?.gmail.connected || state.emailPaused || busy}
            onClick={() => action("sync")}
          >
            {busy
              ? "Working…"
              : status?.gmail.more
                ? "Sync next page"
                : "Sync Gmail"}
          </button>
          <button
            className="button secondary"
            disabled={!status?.gmail.connected || state.emailPaused || busy}
            onClick={() => action("sync-all")}
          >
            Sync all remaining pages
          </button>
          {busy && (
            <button
              className="button secondary"
              onClick={() => {
                stopSync.current = true;
                setMessage(
                  "Stopping after the current page. Saved checkpoints will be kept.",
                );
              }}
            >
              Stop after this page
            </button>
          )}
          {status?.gmail.connected && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => action("disconnect")}
            >
              Disconnect
            </button>
          )}
        </div>
        <label className="toggle-row">
          <span>
            <strong>Allow Gmail sync</strong>
            <p>
              Controls reading only. Turn off to stop subsequent message reads.
              Sending requires a separate permission and an explicit Send
              action.
            </p>
          </span>
          <input
            type="checkbox"
            checked={!state.emailPaused}
            onChange={(e) =>
              updateWorkspace((s) => ({ ...s, emailPaused: !e.target.checked }))
            }
          />
        </label>
        <details>
          <summary>Google Cloud setup</summary>
          <ol>
            <li>Enable Gmail API in your Google Cloud project.</li>
            <li>
              Configure the OAuth consent screen. Add your Gmail account as a
              test user while in Testing.
            </li>
            <li>
              Create a Web application OAuth client. Redirect URI:{" "}
              <code>http://127.0.0.1:3000/api/gmail/callback</code>.
            </li>
            <li>
              Fill GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and
              GMAIL_ACCOUNT_EMAIL in .env.local. Restart the local server, then
              Connect Gmail.
            </li>
          </ol>
          <p>
            Secrets stay on this server. Tokens are encrypted in SQLite.
            Test-mode refresh tokens may expire; reconnect when required.
          </p>
        </details>
      </div>
      <div className="integration-row">
        <strong>Personal agents</strong>
        <p>
          Direct reporting from Muse and ChatGPT Dot. Dot owns shared
          discoveries; Muse writes only for Muse-only contacts.
        </p>
        <a className="text-link" href="/agents">
          Connect agents and view activity →
        </a>
      </div>
      <div className="integration-row">
        <strong>LinkedIn</strong>
        <p>
          {status?.linkedin.message ||
            "Manual profiles, drafts and tracking are available."}
        </p>
        <p>
          You do not need to provide a LinkedIn password, session cookie or
          client secret for the manual outreach workflow.
        </p>
        <a href="/people" className="text-link">
          Add a real LinkedIn contact →
        </a>
      </div>
      <div className="integration-row">
        <strong>Job discovery</strong>
        <p>Agent-only discovery. Website scrapers and automatic feed refresh have been removed. Dot and Muse report verified source evidence through their assigned tasks.</p>
        <a href="/tasks" className="text-link">Create an agent search →</a>
      </div>
      {message && (
        <p role="status" className="info-note">
          {message}
        </p>
      )}
    </section>
  );
}
