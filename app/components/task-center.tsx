"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { draftOwner } from "../lib/portal";
import { useWorkspace } from "../lib/store";
import { type TaskSnapshot, type Task, taskLabels, taskStatusLabel, type TaskCategory, taskCategories, taskCategory, matchesTaskStatus, taskCompletionMeaning, blockedNextStep } from "../lib/tasks";
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
  const [category, setCategory] = useState<TaskCategory>("all");
  const queueRef = useRef<HTMLElement>(null);
  const requestId = useRef("");
  useEffect(() => {
    function revealLinkedTask() {
      if (!window.location.hash.startsWith("#task-")) return;
      setFilter("all");
      setCategory("all");
    }
    revealLinkedTask();
    window.addEventListener("hashchange", revealLinkedTask);
    return () => window.removeEventListener("hashchange", revealLinkedTask);
  }, []);
  const linkedTaskRevealed = useRef("");
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id.startsWith("task-") || linkedTaskRevealed.current === id) return;
    const element = document.getElementById(id);
    if (element) { element.scrollIntoView({ block: "start" }); linkedTaskRevealed.current = id; }
  }, [data, filter, category]);
  function showStatus(status: string) {
    setFilter(status);
    setCategory("all");
    queueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    queueRef.current?.focus({ preventScroll: true });
  }
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
  const visible = data.tasks.filter(t => matchesTaskStatus(t, filter) &&
    (category === "all" || taskCategory(t.kind) === category));
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
          { label: "Queued", status: "queued" },
          { label: "Working", status: "claimed" },
          { label: "To review", status: "review" },
          { label: "Needs attention", status: "attention" },
        ].map(({ label, status }) => (
          <button type="button" className="panel task-metric" key={status}
            aria-controls="execution-queue" aria-pressed={filter === status && category === "all"}
            onClick={() => showStatus(status)}>
            <strong>{data.tasks.filter(t => matchesTaskStatus(t, status)).length}</strong>
            <span>{label}<small>View tasks →</small></span>
          </button>
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
          A queue check confirms access, not execution. Look for a claimed task
          and a saved result. Cloud API access does not require your Mac;
          local connections require the local server to stay online.
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
      <section className="panel task-execution" id="execution-queue" ref={queueRef} tabIndex={-1}>
        <div className="section-title">
          <h2>Execution queue</h2>
          <label>
            Status
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {[
                "active",
                "attention",
                "all",
                "queued",
                "claimed",
                "review",
                "blocked",
                "needs_login",
                "needs_input",
                "uncertain",
                "completed",
                "cancelled",
              ].map((s) => (
                <option key={s} value={s}>{s === "attention" ? "Needs attention" : s === "claimed" ? "Working" : s === "needs_login" ? "Sign up / Sign in" : s === "needs_input" ? "Needs your answers" : s}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="task-categories" role="group" aria-label="Task category">
          {taskCategories.map(c => <button key={c.value} type="button"
            className={`button ${category === c.value ? "primary" : "secondary"}`}
            aria-pressed={category === c.value} onClick={() => setCategory(c.value)}>
            {c.label} · {data.tasks.filter(t => matchesTaskStatus(t, filter) && (c.value === "all" || taskCategory(t.kind) === c.value)).length}
          </button>)}
        </div>
        <p className="muted" aria-live="polite">{visible.length} tasks in this view. Counts above cover all categories.</p>
        <details className="task-status-help">
          <summary>What happens next? Status and recovery guide</summary>
          <ul>
            <li><strong>Queued:</strong> assigned and waiting for the owner agent to claim it. A saved polling schedule alone does not prove pickup.</li>
            <li><strong>Claimed:</strong> the agent holds the task. Check its result and updates for actual progress.</li>
            <li><strong>Sign up / Sign in:</strong> sign in inside the assigned agent’s employer-site browser, then use “I’ve signed in — continue filling” on that task.</li>
            <li><strong>Needs your answers:</strong> supply the missing facts, then use “Information ready — continue filling”. The same agent resumes preparation.</li>
            <li><strong>Review:</strong> application preparation has reported a filled form, answers, evidence and no unresolved questions. Check these before approving submission. Email drafts are reviewed in <Link href="/outreach">Outreach</Link>.</li>
            <li><strong>Blocked:</strong> read the reason and expand “Task input and result”. Resolve that specific issue before retrying. A possible duplicate needs identity/JD comparison and record reconciliation; retrying alone will not resolve it.</li>
            <li><strong>Uncertain:</strong> the action’s outcome could not be confirmed, for example after a timeout. Check the external site for an actual send or submission before any retry.</li>
            <li><strong>Completed:</strong> this task is finished. Discovery means records were reported; draft means text was saved. Only a submission or sending task reports that final action, with its receipt.</li>
            <li><strong>Cancelled:</strong> this queued workflow was stopped. It does not withdraw an application, unsend a message or delete saved records.</li>
          </ul>
        </details>
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
    <article className="integration-row task-card" id={`task-${t.id}`}>
      <div className="section-title">
        <div>
          <strong>{t.title}</strong>
          <p className="muted">
            {taskLabels[t.kind]} · {t.owner} · Updated{" "}
            {new Date(t.updatedAt).toLocaleString()}
          </p>
        </div>
        <Badge>{taskStatusLabel(t.status)}</Badge>
      </div>
      {t.status === "blocked" ? <div className="task-blocker">
        <h3>Why this task is blocked</h3>
        <p>{t.result?.summary || "No specific reason was reported. Ask the assigned agent for the failed step."}</p>
        <strong>How to continue</strong><p>{blockedNextStep(t)}</p>
        <p className="muted">Owner: {t.owner}. Expand “Task input and result” for record IDs and the full report.</p>
      </div> : t.result && <p className="message-preview">{t.result.summary}</p>}
      {t.status === "completed" && <p className="task-outcome">{taskCompletionMeaning(t.kind)}</p>}
      {t.status === "cancelled" && <p className="muted">Task stopped. Existing applications, messages and saved records remain unchanged.</p>}
      {t.kind === "application_prepare" && <div className="task-form-progress">
        <strong>Form progress · {t.result?.formState ? String(t.result.formState).replaceAll("_", " ") : "Not reported"}</strong>
        <p>Agent-reported progress, not a live view of its cloud browser. An employer JD link does not open the agent’s saved form or share its login session. For the actual form, ask {t.owner} for a cloud-browser handoff or saved-form evidence.</p>
        {t.result?.formState === "not_opened" && <p>The agent reports that the application form has not been opened. No entered answers are confirmed by this report.</p>}
        {Array.isArray(t.result?.unansweredFields) && t.result.unansweredFields.length > 0 && <><strong>Missing answers</strong><ul>{(t.result.unansweredFields as string[]).map((q, i) => <li key={i}>{q}</li>)}</ul></>}
      </div>}
      {t.result?.evidenceUrl && (
        <a
          href={t.result.evidenceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-link"
        >
          {t.kind === "application_prepare" ? "Open reported source / evidence (may be JD) ↗" : "View reported evidence ↗"}
        </a>
      )}
      {t.kind === "application_prepare" && ["needs_login", "needs_input"].includes(t.status) && (
        <div className="stack">
          <h3>{t.status === "needs_login" ? "Sign up / Sign in, then continue filling" : "Resolve missing answers, then continue filling"}</h3>
          <p>{t.status === "needs_login"
            ? `Complete sign-in inside ${t.owner}'s employer-site cloud browser. Signing in on your own computer does not sign in that browser. Then queue the same task below; ${t.owner} will verify access and continue the saved form on its next queue check.`
            : "Update your profile in Settings or describe the missing facts below. The assigned agent will continue the actual application before requesting final review."}</p>

          <label>Note for the agent (no passwords)<textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={4000} /></label>
          <button className="button primary" disabled={busy} onClick={() => act({action: "resume_preparation", taskId: t.id, version: t.version, note: reason || undefined})}>
            {t.status === "needs_login" ? "I've signed in — continue filling" : "Information ready — continue filling"}
          </button>
          <p className="muted">This resumes preparation with the same owner. It does not approve or submit the application.</p>
        </div>
      )}
      {t.kind === "application_prepare" && t.status === "queued" && Boolean(t.input.resume) && <p>Continuation queued for {t.owner}. The agent must claim it on its next queue check and verify the existing form before continuing.</p>}
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
        {["queued", "blocked", "review", "needs_login", "needs_input"].includes(t.status) && (
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
