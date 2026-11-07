"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { draftOwner } from "../lib/portal";
import { useWorkspace } from "../lib/store";
import { type TaskSnapshot, type Task, taskLabels } from "../lib/tasks";
import { Badge, Heading } from "./ui";
const empty: TaskSnapshot = {
  tasks: [],
  batches: [],
  discoveries: [],
  workers: [],
};
export async function taskAction(payload: Record<string, unknown>) {
  const r = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    v = await r.json();
  if (!r.ok) throw new Error(v.error || "Task request failed");
  window.dispatchEvent(new Event("tasks-refresh"));
  window.dispatchEvent(new Event("portal-refresh"));
  return v;
}
export function TaskCenter() {
  const workspace = useWorkspace();
  const [data, setData] = useState<TaskSnapshot>(empty),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(""),
    [brief, setBrief] = useState(""),
    [mode, setMode] = useState("discover"),
    [owner, setOwner] = useState("dot"),
    [channel, setChannel] = useState("email"),
    [prepare, setPrepare] = useState(true),
    [contactId, setContactId] = useState("");
  const [filter, setFilter] = useState("active");
  const requestId = useRef("");
  useEffect(() => {
    let alive = true,
      loading = false;
    async function refresh() {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const r = await fetch("/api/tasks", { cache: "no-store" }),
          v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (alive) setData(v);
      } catch (e) {
        if (alive)
          setNotice(e instanceof Error ? e.message : "Queue unavailable");
      } finally {
        loading = false;
      }
    }
    void refresh();
    const timer = setInterval(refresh, 5000);
    window.addEventListener("tasks-refresh", refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("tasks-refresh", refresh);
    };
  }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      requestId.current ||= crypto.randomUUID();
      const r = await taskAction({
        action: "create",
        requestId: requestId.current,
        title,
        brief,
        mode,
        owner,
        channel,
        prepareApplications: prepare,
        contactId,
      });
      setNotice(
        `Task saved. ${r.batchId ? "Dot and Muse each have a discovery task." : "Assigned agent can now claim it."} It starts when the agent checks the queue.`,
      );
      requestId.current = "";
      setTitle("");
      setBrief("");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not create task");
    } finally {
      setBusy(false);
    }
  }
  async function act(v: Record<string, unknown>) {
    setBusy(true);
    try {
      await taskAction(v);
      setNotice("Queue updated.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }
  const visible = data.tasks.filter(
    (t) =>
      filter === "all" ||
      (filter === "active"
        ? !["completed", "cancelled"].includes(t.status)
        : t.status === filter),
  );
  return (
    <>
      <Heading
        eyebrow="ONE REQUEST. SHARED EXECUTION."
        title="Your task desk"
        description="Add temporary requests for your agents. Their own schedules run daily work independently."
        action={
          <Link href="/agents" className="button secondary">
            Connect agents ↗
          </Link>
        }
      />
      <section className="panel task-explainer">
        <h2>A shared task queue, not an agent chat</h2>
        <p>
          Daily searches and outreach targets are configured directly in Dot and Muse, not here. An empty queue does not stop those routines. Creating a task below adds temporary instructions. Dot and Muse must check this
          queue with their existing connection, claim work, execute it in their
          own product and report the result. This website cannot wake either
          agent.
        </p>
        <ol>
          <li>
            <strong>Find jobs & people:</strong> both agents search. New rounds automatically assign application preparation and drafts after both report completion. You review the finished answers and messages before final submission or sending. Older manual rounds still need the release button.
          </li>
          <li>
            <strong>Draft for a contact:</strong> choose someone already in
            People and request an email or LinkedIn draft. Nothing is sent.
          </li>
          <li>
            <strong>Review Gmail:</strong> ask one agent to interpret imported
            messages, such as rejection vs newsletter, or a reply needing
            follow-up. Gmail fetching itself runs separately.
          </li>
          <li>
            <strong>Read LinkedIn:</strong> ask one agent to read a specific
            conversation in its browser and report messages. There is no direct
            LinkedIn inbox connection.
          </li>
        </ol>
        <p>
          To send: review the exact message in{" "}
          <Link className="text-link" href="/outreach">
            Outreach
          </Link>
          , then click Send this draft (Gmail) or Send via agent (LinkedIn). A
          free-text task does not authorize sending.
        </p>
      </section>
      <div className="task-summary">
        {[
          ["Queued", data.tasks.filter((t) => t.status === "queued").length],
          ["Working", data.tasks.filter((t) => t.status === "claimed").length],
          ["To review", data.tasks.filter((t) => t.status === "review").length],
          [
            "Needs attention",
            data.tasks.filter((t) =>
              ["blocked", "uncertain"].includes(t.status),
            ).length,
          ],
        ].map(([label, n]) => (
          <article className="panel" key={label}>
            <strong>{n}</strong>
            <span>{label}</span>
          </article>
        ))}
      </div>
      <section className="panel">
        <div className="section-title">
          <h2>Add a one-off task</h2>
          <Badge>Saved to SQLite</Badge>
        </div>
        <form onSubmit={create} className="task-form">
          <label>
            Task type
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                requestId.current = "";
              }}
            >
              <option value="discover">Find jobs & people · both agents</option>
              <option value="draft">
                Draft for an existing contact · one agent
              </option>
              <option value="mail_review">
                Review recent Gmail evidence · one agent
              </option>
              <option value="linkedin_sync">
                Read a LinkedIn conversation · one agent
              </option>
            </select>
          </label>
          <label>
            Title
            <input
              required
              maxLength={160}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                requestId.current = "";
              }}
              placeholder="Find 2027 product and analytics opportunities"
            />
          </label>
          <label className="task-full">
            What should the agents do?
            <textarea
              required
              maxLength={12000}
              rows={5}
              value={brief}
              onChange={(e) => {
                setBrief(e.target.value);
                requestId.current = "";
              }}
              placeholder="Search US 2027 new grad / entry-level full-time PM, DS and DA roles. Include original links, sponsorship evidence and fit. Specify any temporary scope or limits here. Both agents search the full scope. English or Chinese instructions are welcome."
            />
          </label>
          {mode === "discover" || mode === "draft" ? (
            <>
              <label>
                Channel for the draft (does not send)
                <select
                  value={channel}
                  onChange={(e) => {
                    setChannel(e.target.value);
                    requestId.current = "";
                  }}
                >
                  <option value="email">Email</option>
                  <option value="linkedin">LinkedIn</option>
                </select>
              </label>
              {mode === "discover" && (
                <label className="task-check">
                  <input
                    type="checkbox"
                    checked={prepare}
                    onChange={(e) => {
                      setPrepare(e.target.checked);
                      requestId.current = "";
                    }}
                  />
                  Prepare applications after reconciliation (review before
                  submitting)
                </label>
              )}
            </>
          ) : (
            <label>
              Owner
              <select
                value={owner}
                onChange={(e) => {
                  setOwner(e.target.value);
                  requestId.current = "";
                }}
              >
                <option value="dot">Dot</option>
                <option value="muse">Muse</option>
              </select>
            </label>
          )}
          {mode === "draft" && (
            <label>
              Draft owner
              <select
                value={owner}
                onChange={(e) => {
                  setOwner(e.target.value);
                  requestId.current = "";
                }}
              >
                <option value="dot">Dot</option>
                <option value="muse">Muse</option>
              </select>
              <small>
                Existing assignment takes priority; shared contacts belong to
                Dot.
              </small>
            </label>
          )}
          {mode === "discover" && (
            <p className="task-full muted">
              Draft channel chooses the format to prepare for newly discovered
              contacts after reconciliation. It does not choose a search source
              or grant sending permission.
            </p>
          )}
          {(mode === "linkedin_sync" || mode === "draft") && (
            <label>
              Contact
              <select
                required
                value={contactId}
                onChange={(e) => {
                  setContactId(e.target.value);
                  const selected = workspace.contacts.find(
                    (c) => c.id === e.target.value,
                  );
                  if (mode === "draft" && selected && draftOwner(selected))
                    setOwner(draftOwner(selected)!);
                  requestId.current = "";
                }}
              >
                <option value="">Choose a contact</option>
                {workspace.contacts
                  .filter((c) => mode === "draft" || c.linkedin)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.company}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <div className="task-full button-row">
            <button className="button primary" disabled={busy}>
              Create task
            </button>
            <span className="muted">
              Creating a task does not send a message or submit an application.
            </span>
          </div>
        </form>
      </section>
      <section className="panel">
        <h2>Agent pickup</h2>
        <div className="agent-grid">
          {data.workers.map((w) => (
            <div key={w.actor}>
              <strong>{w.actor === "dot" ? "ChatGPT Dot" : "Muse"}</strong>
              <p>
                Last queue check:{" "}
                {w.lastPoll
                  ? new Date(w.lastPoll).toLocaleString()
                  : "Not checked yet"}
              </p>
              <p className="muted">
                {w.schedule
                  ? `Reported schedule: ${w.schedule}`
                  : "No schedule reported. Configure queue checking in this agent."}
              </p>
            </div>
          ))}
        </div>
        <Link href="/agents" className="text-link">
          Copy queue-check instructions in Agents ↗
        </Link>
        <p className="muted">
          A reported schedule is not proof of a running session. This local
          server and computer must stay online.
        </p>
      </section>
      {notice && (
        <p className="info-note" role="status">
          {notice}
        </p>
      )}
      <section className="panel">
        <h2>Discovery batches</h2>
        {!data.batches.length && (
          <p>No batches yet. Create your first task above.</p>
        )}
        {data.batches.map((b) => {
          const found = data.discoveries.filter((d) => d.batchId === b.id),
            entities = [
              ...new Map(
                found.map((d) => [`${d.kind}:${d.entityId}`, d]),
              ).values(),
            ];
          return (
            <article className="integration-row" key={b.id}>
              <div className="section-title">
                <strong>{b.title}</strong>
                <span className="muted">{b.origin === "agent" ? "Agent-initiated round · coordination record" : "User request"}</span>
                <Badge>{b.status}</Badge>
              </div>
              <p>{b.brief}</p>
              {b.status === "discovering" && <details><summary>Edit shared instructions before pickup</summary><form onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void act({action:"edit_batch",batchId:b.id,version:b.version,brief:form.get("brief")});}}><textarea key={b.version} name="brief" rows={4} defaultValue={b.brief} required/><button className="button secondary" disabled={busy}>Update both queued discovery tasks</button><p>Available only before either agent starts. Claimed work is never silently changed.</p></form></details>}
              <p>
                {(["dot", "muse"] as const)
                  .map(
                    (a) =>
                      `${a}: ${data.tasks.find((t) => t.batchId === b.id && t.kind === "discover" && t.owner === a)?.status || "waiting"}`,
                  )
                  .join(" · ")}{" "}
                · {entities.length} unique records in this batch {b.autoRelease ? "· Automatic assignment" : "· Manual assignment"}
              </p>
              {b.autoRelease && b.status === "discovering" && <p className="muted">Automatic preparation assignment is waiting for completion reports from {(["dot", "muse"] as const).filter(a => data.tasks.find(t => t.batchId === b.id && t.kind === "discover" && t.owner === a)?.status !== "completed").join(" and ")}. Saved records alone do not close a search. No manual release is needed.</p>}
              {b.status === "ready" && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => act({ action: "release", batchId: b.id })}
                >
                  Reconcile & assign execution
                </button>
              )}
              {!!entities.length && (
                <details>
                  <summary>Discoveries and sources</summary>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Record</th>
                          <th>Found by</th>
                          <th>Assignment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entities.map((d) => {
                          const c = workspace.contacts.find(
                              (c) => c.id === d.entityId,
                            ),
                            j = workspace.jobs.find((j) => j.id === d.entityId),
                            actors = [
                              ...new Set(
                                found
                                  .filter(
                                    (x) =>
                                      x.kind === d.kind &&
                                      x.entityId === d.entityId,
                                  )
                                  .map((x) => x.actor),
                              ),
                            ],
                            task = data.tasks.find(
                              (t) =>
                                t.entityId === d.entityId &&
                                t.kind !== "discover",
                            );
                          return (
                            <tr key={`${d.kind}:${d.entityId}`}>
                              <td>
                                <Link
                                  href={d.kind === "job" ? "/jobs" : `/people`}
                                >
                                  {c?.name ||
                                    `${j?.company || "Job"} · ${j?.role || d.entityId}`}
                                </Link>
                              </td>
                              <td>
                                {actors.length === 2 ? "Both" : actors[0]}
                              </td>
                              <td>
                                {task
                                  ? `${task.owner} · ${task.status}`
                                  : "Not released / already handled"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </article>
          );
        })}
      </section>
      <section className="panel">
        <div className="section-title">
          <h2>Execution queue</h2>
          <label>
            Status
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {[
                "active",
                "all",
                "queued",
                "claimed",
                "review",
                "blocked",
                "uncertain",
                "completed",
                "cancelled",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        {!visible.length && <p>No tasks in this view.</p>}
        {visible.map((t) => (
          <TaskCard
            key={`${t.id}:${t.version}`}
            task={t}
            busy={busy}
            act={act}
          />
        ))}
      </section>
    </>
  );
}
function TaskCard({
  task: t,
  busy,
  act,
}: {
  task: Task;
  busy: boolean;
  act: (v: Record<string, unknown>) => Promise<void>;
}) {
  const [answers, setAnswers] = useState(String(t.result?.answers || "")),
    [outcome, setOutcome] = useState("not_performed"),
    [evidence, setEvidence] = useState(""),
    [reason, setReason] = useState(""),
    [verified, setVerified] = useState(false);
  return (
    <article className="integration-row task-card">
      <div className="section-title">
        <div>
          <strong>{t.title}</strong>
          <p className="muted">
            {taskLabels[t.kind]} · {t.owner} · Updated{" "}
            {new Date(t.updatedAt).toLocaleString()}
          </p>
        </div>
        <Badge>{t.status}</Badge>
      </div>
      {t.result && <p className="message-preview">{t.result.summary}</p>}
      {t.result?.evidenceUrl && (
        <a
          href={t.result.evidenceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-link"
        >
          View reported evidence ↗
        </a>
      )}
      {t.status === "review" && t.kind === "application_prepare" && (
        <>
          <p>Form state (Agent reported): {String(t.result?.formState || "not_opened").replaceAll("_", " ")}. This is not a submission receipt.</p>
          {t.result?.formState !== "filled" && <p className="muted">Preparation is incomplete. The assigned agent must finish the actual form and update this report before submission approval.</p>}
          <label>
            Review and edit the proposed application answers
            <textarea
              className="draft-editor"
              value={answers}
              onChange={(e) => setAnswers(e.target.value)}
              maxLength={20000}
            />
          </label>
          <button
            className="button primary"
            disabled={busy || !answers.trim() || t.result?.formState !== "filled"}
            onClick={() =>
              act({
                action: "approve_application",
                taskId: t.id,
                version: t.version,
                answers,
              })
            }
          >
            Approve these answers & queue submission
          </button>
        </>
      )}
      <div className="button-row">
        {t.status === "blocked" &&
          !["application_submit", "linkedin_send"].includes(t.kind) && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                act({ action: "retry", taskId: t.id, version: t.version })
              }
            >
              Retry after resolving issue
            </button>
          )}
        {["queued", "blocked", "review"].includes(t.status) && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              act({ action: "cancel", taskId: t.id, version: t.version })
            }
          >
            Cancel task
          </button>
        )}
        {t.kind === "draft" && (
          <Link className="text-link" href={`/outreach?contact=${t.entityId}`}>
            Open draft ↗
          </Link>
        )}
      </div>
      {t.status === "uncertain" && (
        <p className="warning">
          Outcome uncertain. Verify the original site before retrying or
          reassigning; automatic retries are blocked.
        </p>
      )}
      {t.status === "uncertain" &&
        ["application_submit", "linkedin_send"].includes(t.kind) && (
          <details>
            <summary>Reconcile a verified external outcome</summary>
            <p>
              Check the original conversation or application first. This records
              your finding and releases the browser; it never repeats the
              action.
            </p>
            <label>
              Actual outcome
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                <option value="not_performed">
                  Verified not sent / not submitted
                </option>
                <option value="completed">Verified sent / submitted</option>
              </select>
            </label>
            <label>
              Evidence URL
              <input
                type="url"
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
              />
            </label>
            <label>
              What did you verify? Include confirmation reference if completed.
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <label className="task-check">
              <input
                type="checkbox"
                checked={verified}
                onChange={(e) => setVerified(e.target.checked)}
              />
              I checked the external site and verified this outcome.
            </label>
            <button
              className="button secondary"
              disabled={busy || !verified || !reason.trim() || !evidence.trim()}
              onClick={() =>
                act({
                  action: "reconcile",
                  taskId: t.id,
                  version: t.version,
                  verified,
                  outcome,
                  evidenceUrl: evidence,
                  summary: reason,
                  receipt: reason,
                })
              }
            >
              Save verified outcome
            </button>
          </details>
        )}
      <details>
        <summary>Task input and result</summary>
        <pre className="task-json">
          {JSON.stringify(
            { id: t.id, input: t.input, result: t.result },
            null,
            2,
          )}
        </pre>
      </details>
    </article>
  );
}
