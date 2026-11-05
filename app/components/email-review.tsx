"use client";
import { useEffect, useState } from "react";
import type { EmailEvent } from "../lib/mail";
import { stages } from "../lib/model";
import { Badge } from "./ui";
import { Pagination } from "./pagination";
type Page = {
  events: EmailEvent[];
  total: number;
  page: number;
  pages: number;
  size: number;
  counts: { total: number; pending: number };
  stages: Record<string, number>;
};
export function EmailReview() {
  const [page, setPage] = useState(1),
    [version, setVersion] = useState(0);
  const [data, setData] = useState<Page | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetch(`/api/gmail/events?${new URLSearchParams({ page: String(page) })}`)
      .then(async (r) => {
        const value = await r.json();
        if (!r.ok) throw new Error(value.error);
        if (active) {
          setData(value);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setMessage(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [page, version]);
  useEffect(() => {
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") setVersion((v) => v + 1);
    }, 10000);
    return () => clearInterval(poll);
  }, []);
  async function update(
    id: string,
    change: { stage?: string; dismiss?: boolean },
  ) {
    setBusy(true);
    try {
      const r = await fetch("/api/gmail/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...change }),
      });
      const value = await r.json();
      if (!r.ok) throw new Error(value.error);
      setVersion((v) => v + 1);
      setMessage("Email record saved. Tracker records are unchanged.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: number) {
    setLoading(true);
    setPage(next);
  }
  return (
    <section className="panel">
      <div className="section-title">
        <h2>Application emails</h2>
        <Badge tone="blue">Last 30 days</Badge>
      </div>
      <div className="outreach-summary">
        {[
          "Total",
          "Applied",
          "Assessment",
          "Interview",
          "Offer",
          "Rejected",
        ].map((key) => (
          <div key={key}>
            <strong>
              {key === "Total"
                ? data?.counts.pending || 0
                : data?.stages[key] || 0}
            </strong>
            <span>{key === "Total" ? "Active emails" : key}</span>
          </div>
        ))}
      </div>
      <p className="muted">
        Only application receipts and personal application-status updates.
        Newsletters, job alerts and career events are excluded. Correct a label
        only if needed. These are email events, not unique applications.
      </p>
      {loading ? (
        <p role="status">Loading emails…</p>
      ) : (
        <>
          {data?.events.map((event) => (
            <article className="integration-row" key={event.id}>
              <div className="section-title">
                <strong>{event.subject}</strong>
                <Badge>{event.suggestedStage || "Manual review"}</Badge>
              </div>
              <p>
                {event.from} · {new Date(event.receivedAt).toLocaleString()}
              </p>
              <p>{event.snippet}</p>
              <small>
                {event.manuallyLabeled
                  ? "Status corrected manually."
                  : `Rule evidence: ${event.reason}`}
              </small>
              <div className="email-actions">
                <label className="filter-label">
                  Detected status
                  <select
                    aria-label={`Status for ${event.subject}`}
                    disabled={busy}
                    value={event.suggestedStage || "Manual review"}
                    onChange={(e) =>
                      update(event.id, { stage: e.target.value })
                    }
                  >
                    {["Manual review", ...stages].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => update(event.id, { dismiss: true })}
                >
                  Dismiss
                </button>
                <a
                  className="text-link"
                  href={event.originalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View original email ↗
                </a>
              </div>
            </article>
          ))}
          {!data?.events.length && (
            <p>No matching recruiting emails. Sync Gmail in Settings.</p>
          )}
        </>
      )}
      {data && <Pagination {...data} label="emails" onPage={navigate} />}
      {message && (
        <p className="info-note" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
