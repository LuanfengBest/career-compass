import { screenJob } from "../eligibility";
import { randomUUID } from "node:crypto";
import { readWorkspace, writeWorkspace, setSetting } from "./database";
import { HttpError } from "./http";
import { addEvent, drafts, events, saveDraft, textField } from "./portal";
import { normalizeLinkedIn, draftOwner, type Agent } from "../portal";
import { irreversibleTask, type Task, type Batch } from "../tasks";
import {
  allTasks,
  allBatches,
  allDiscoveries,
  taskDb,
  saveTask,
  saveBatch,
  newTask,
  taskTransaction,
  requireClaim,
  publicTask,
  expireClaims,
} from "./task-store";

function log(actor: Agent | "user", kind: string, text: string) {
  addEvent({
    id: randomUUID(),
    actor,
    kind,
    text,
    at: new Date().toISOString(),
  });
}
function safeUrl(v: unknown, linkedin = false) {
  const value = textField(v, "evidenceUrl", 2000);
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new HttpError(400, "A real evidence URL is required.");
  }
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    (linkedin && !/^(www\.)?linkedin\.com$/.test(u.hostname))
  )
    throw new HttpError(400, "Invalid evidence URL.");
  return u.href;
}
function checkedTask(v: Record<string, unknown>) {
  const t = allTasks().find((x) => x.id === v.taskId);
  if (!t || t.version !== v.version)
    throw new HttpError(409, "Task changed; refresh before acting.");
  return t;
}
function mailActivity(id: string) {
  return events().some(
    (e) =>
      e.contactId === id &&
      [
        "sent",
        "sent_reported",
        "incoming",
        "reply_confirmed",
        "invalid_address",
        "linkedin_sent_reported",
      ].includes(e.kind),
  );
}
function finish(t: Task) {
  t.updatedAt = new Date().toISOString();
  t.version++;
  delete t.claimToken;
  delete t.leaseUntil;
  saveTask(t);
  taskDb().prepare("DELETE FROM browser_claims WHERE task_id=?").run(t.id);
}
function possibleDuplicate(entityId: string) {
  const { workspace } = readWorkspace(),
    c = workspace.contacts.find((x) => x.id === entityId),
    j = workspace.jobs.find((x) => x.id === entityId);
  if (c)
    return workspace.contacts.some(
      (x) =>
        x.id !== c.id &&
        ((x.name.trim().toLowerCase() === c.name.trim().toLowerCase() &&
          x.company.trim().toLowerCase() === c.company.trim().toLowerCase()) ||
          (c.email && x.email?.toLowerCase() === c.email.toLowerCase())),
    );
  return (
    !!j &&
    workspace.jobs.some(
      (x) =>
        x.id !== j.id &&
        x.company.trim().toLowerCase() === j.company.trim().toLowerCase() &&
        x.role.trim().toLowerCase() === j.role.trim().toLowerCase(),
    )
  );
}
function recordExternalSuccess(
  t: Task,
  v: Record<string, unknown>,
  actor: Agent | "user",
) {
  t.result = {
    summary: textField(v.summary, "summary", 5000),
    evidenceUrl: safeUrl(v.evidenceUrl, t.kind === "linkedin_send"),
    receipt: textField(v.receipt, "receipt", 4000),
  };
  if (t.kind === "application_submit") {
    const { workspace, revision } = readWorkspace();
    const a = workspace.applications.find((x) => x.jobId === t.entityId);
    if (!a || ["Saved", "To apply"].includes(a.stage)) {
      const record = {
        jobId: t.entityId!,
        stage: "Applied" as const,
        origin: "Agent" as const,
        appliedAt: new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString(),
        notes: `${actor}-reported submission, task ${t.id}: ${t.result.receipt}\n${t.result.evidenceUrl}`,
      };
      workspace.applications = a
        ? workspace.applications.map((x) => (x.jobId === a.jobId ? record : x))
        : [...workspace.applications, record];
      if (!writeWorkspace(workspace, revision))
        throw new HttpError(409, "Workspace changed.");
    }
  } else {
    const d = drafts().find((x) => x.id === t.input.draftId);
    if (!d) throw new HttpError(409, "Original draft missing.");
    saveDraft({ ...d, status: "sent", messageUrl: t.result.evidenceUrl });
    addEvent({
      id: `task:${t.id}:sent`,
      actor,
      kind: "linkedin_sent_reported",
      contactId: t.entityId,
      at: new Date().toISOString(),
      text: `${actor}-reported send: ${t.result.receipt}\n${t.input.text}`,
      url: t.result.evidenceUrl,
    });
  }
}
function releaseBatch(id: string, releasedBy: Agent | "user" = "user") {
  const b = allBatches().find((x) => x.id === id);
  if (!b || b.status !== "ready")
    throw new HttpError(
      409,
      "Both agents must finish discovery before releasing this batch.",
    );
  const { workspace, revision } = readWorkspace(),
    discovered = allDiscoveries(),
    tasks = allTasks();
  const items = [
    ...new Map(
      discovered
        .filter((x) => x.batchId === id)
        .map((x) => [`${x.kind}:${x.entityId}`, x]),
    ).values(),
  ];
  let created = 0;
  for (const item of items) {
    if (item.kind === "job" && !b.prepareApplications) continue;
    const kind = item.kind === "job" ? "application_prepare" : "draft";
    if (
      tasks.some(
        (t) =>
          t.entityId === item.entityId &&
          t.kind === kind &&
          t.status !== "cancelled",
      )
    )
      continue;
    const c = workspace.contacts.find((x) => x.id === item.entityId),
      j = workspace.jobs.find((x) => x.id === item.entityId);
    if ((item.kind === "contact" && !c) || (item.kind === "job" && !j))
      continue;
    const sourceActors = discovered
      .filter((x) => x.entityId === item.entityId && x.kind === item.kind)
      .map((x) => x.actor);
    const owner: Agent =
      sourceActors.includes("dot") ||
      c?.discoveredBy?.includes("dot") ||
      j?.discoveredBy?.includes("dot")
        ? "dot"
        : "muse";
    // Existing real submissions/contact activity are retained, not repeated.
    if (
      item.kind === "job" &&
      workspace.applications.some(
        (a) =>
          a.jobId === item.entityId && !["Saved", "To apply"].includes(a.stage),
      )
    )
      continue;
    if (
      c &&
      (mailActivity(c.id) ||
        c.emailStatus !== "Not contacted" ||
        drafts().some((d) => d.contactId === c.id))
    )
      continue;
    const duplicate = possibleDuplicate(item.entityId);
    const ineligible = j && screenJob(j).status === "Not a match";
    const t = newTask(
      kind,
      owner,
      c ? `Draft for ${c.name}` : `Prepare ${j!.company} · ${j!.role}`,
      {
        brief: b.brief,
        channel: b.channel === "auto" ? (c?.email && !events().some(e => e.contactId === c.id && e.kind === "invalid_address") ? "email" : "linkedin") : b.channel,
        profile: workspace.profile,
        sourceActors,
        ...(c ? { contact: c } : { job: j }),
        authorization:
          "Prepare and, where supported, fill the employer form using verified profile facts. Return answers and actual form state; do not submit. Stop before any step that submits automatically or needs unsupported personal facts. For contact drafts use sourced email evidence or the confirmed LinkedIn profile.",
      },
      {
        batchId: id,
        entityId: item.entityId,
        ...(duplicate || ineligible
          ? {
              status: "blocked" as const,
              result: {
                summary: ineligible
                  ? "Role does not match the 2027 full-time target. Correct the evidence or cancel."
                  : "Possible duplicate identity/role. Resolve records and explicitly retry before execution.",
              },
            }
          : {}),
      },
    );
    saveTask(t);
    tasks.push(t);
    created++;
    if (c) c.draftAssignment = owner;
    if (j) j.applicationOwner = owner;
  }
  if (!writeWorkspace(workspace, revision))
    throw new HttpError(409, "Workspace changed.");
  b.status = "released";
  b.version++;
  saveBatch(b);
  log(
    releasedBy,
    "batch_released",
    `${b.title}: ${created} execution tasks released after both discovery reports.`,
  );
  return { created };
}
export function userTaskAction(v: Record<string, unknown>) {
  return taskTransaction(() => {
    expireClaims();
    if (v.action === "create") {
      const key = `user:${textField(v.requestId, "requestId", 200)}`;
      const old = taskDb()
        .prepare("SELECT body FROM task_requests WHERE id=?")
        .get(key);
      if (old) return JSON.parse(String(old.body));
      const title = textField(v.title, "title", 160),
        brief = textField(v.brief, "brief", 12000),
        mode = v.mode || "discover";
      let result: Record<string, unknown>;
      if (mode === "discover") {
        if (v.channel !== "email" && v.channel !== "linkedin")
          throw new HttpError(400, "Choose a draft channel.");
        const b: Batch = {
          id: randomUUID(),
          title,
          brief,
          createdAt: new Date().toISOString(),
          version: 1,
          status: "discovering",
          channel: v.channel,
          prepareApplications: v.prepareApplications === true,
        };
        saveBatch(b);
        for (const actor of ["dot", "muse"] as const)
          saveTask(
            newTask(
              "discover",
              actor,
              `${title} · ${actor}`,
              {
                brief,
                scope:
                  "Both agents search the entire scope. Report every discovery with batchId, taskId and claimToken. Finish discovery before drafting/applying.",
                profile: readWorkspace().workspace.profile,
              },
              { batchId: b.id },
            ),
          );
        result = { ok: true, batchId: b.id };
      } else if (mode === "draft") {
        const { workspace, revision } = readWorkspace();
        const c = workspace.contacts.find((x) => x.id === v.contactId);
        if (!c) throw new HttpError(400, "Choose an existing contact.");
        if (v.channel !== "email" && v.channel !== "linkedin")
          throw new HttpError(400, "Choose email or LinkedIn.");
        if (v.owner !== "dot" && v.owner !== "muse")
          throw new HttpError(400, "Choose an owner.");
        const owner = draftOwner(c) || v.owner;
        if (v.owner !== owner)
          throw new HttpError(
            409,
            `This contact is assigned to ${owner}. Select that owner to preserve shared-discovery ownership.`,
          );
        if (
          allTasks().some(
            (t) =>
              t.kind === "draft" &&
              t.entityId === c.id &&
              ["queued", "claimed", "blocked", "review"].includes(t.status),
          )
        )
          throw new HttpError(
            409,
            "This contact already has an unfinished drafting task.",
          );
        if (
          allDiscoveries().some(
            (x) =>
              x.entityId === c.id &&
              allBatches().some(
                (b) =>
                  b.id === x.batchId &&
                  ["discovering", "ready"].includes(b.status),
              ),
          )
        )
          throw new HttpError(
            409,
            "Finish discovery and release the batch before drafting.",
          );
        if (possibleDuplicate(c.id))
          throw new HttpError(
            409,
            "Resolve this contact's possible duplicate identity before drafting.",
          );
        c.draftAssignment = owner;
        if (!writeWorkspace(workspace, revision))
          throw new HttpError(409, "Workspace changed.");
        const t = newTask(
          "draft",
          owner,
          title,
          {
            brief,
            channel: v.channel,
            contact: c,
            profile: workspace.profile,
            previousDrafts: drafts().filter((d) => d.contactId === c.id),
            authorization:
              "Prepare a NEW draft variant. Never overwrite existing user edits or send messages. Returning a draft is not permission to send.",
          },
          { entityId: c.id },
        );
        saveTask(t);
        result = { ok: true, taskId: t.id };
      } else if (mode === "mail_review" || mode === "linkedin_sync") {
        if (v.owner !== "dot" && v.owner !== "muse")
          throw new HttpError(400, "Choose an owner.");
        const contactId =
          mode === "linkedin_sync"
            ? textField(v.contactId, "contactId", 200)
            : undefined;
        const c = readWorkspace().workspace.contacts.find(
          (x) => x.id === contactId,
        );
        if (contactId && (!c || !normalizeLinkedIn(c.linkedin)))
          throw new HttpError(
            400,
            "Select a contact with a confirmed LinkedIn profile.",
          );
        const t = newTask(
          mode,
          v.owner,
          title,
          {
            brief,
            contact: c,
            windowDays: 30,
            authorization:
              "Read and report only. Do not send messages or change mailbox contents.",
          },
          { entityId: contactId },
        );
        saveTask(t);
        result = { ok: true, taskId: t.id };
      } else throw new HttpError(400, "Unknown task mode.");
      taskDb()
        .prepare("INSERT INTO task_requests VALUES (?,?)")
        .run(key, JSON.stringify(result));
      log("user", "task_created", title);
      return result;
    }
    if (v.action === "edit_batch") {
      const b=allBatches().find(b=>b.id===v.batchId);
      const linked=allTasks().filter(t=>t.batchId===v.batchId);
      if(!b||b.version!==v.version||b.status!=="discovering"||linked.some(t=>t.status!=="queued")||allDiscoveries().some(d=>d.batchId===b.id))throw new HttpError(409,"Research already started or changed. Create a new temporary request, or coordinate stopping the active batch first.");
      b.brief=textField(v.brief,"brief",12000);b.version++;saveBatch(b);
      for(const t of linked){t.input={...t.input,brief:b.brief};t.version++;t.updatedAt=new Date().toISOString();saveTask(t);}
      return {ok:true};
    }
    if (v.action === "release")
      return releaseBatch(textField(v.batchId, "batchId", 200));
    if (v.action === "queue_linkedin") {
      const draft = drafts().find((x) => x.id === v.draftId);
      if (
        !draft ||
        draft.version !== v.version ||
        draft.channel !== "linkedin" ||
        draft.status !== "draft"
      )
        throw new HttpError(409, "Review the latest unsent LinkedIn draft.");
      const c = readWorkspace().workspace.contacts.find(
        (x) => x.id === draft.contactId,
      );
      if (!c || !normalizeLinkedIn(c.linkedin) || c.emailStatus === "Stopped")
        throw new HttpError(
          400,
          "A valid contact profile is required; stopped contacts cannot be messaged.",
        );
      if (
        events().some(
          (e) => e.contactId === c.id && e.kind === "linkedin_sent_reported",
        )
      )
        throw new HttpError(
          409,
          "A LinkedIn message is already recorded. Review it before another send.",
        );
      if (
        allTasks().some(
          (t) =>
            t.entityId === c.id &&
            t.kind === "linkedin_send" &&
            t.status !== "cancelled",
        )
      )
        throw new HttpError(
          409,
          "A send task already exists for this contact.",
        );
      const t = newTask(
        "linkedin_send",
        draft.author,
        `Send LinkedIn message to ${c.name}`,
        {
          draftId: draft.id,
          draftVersion: draft.version,
          text: draft.text,
          linkedin: c.linkedin,
          contactName: c.name,
          authorization:
            "User clicked Send via agent for this exact draft version. Check recipient and text; never send twice.",
        },
        { entityId: c.id },
      );
      saveTask(t);
      saveDraft({ ...draft, status: "queued" });
      return { ok: true, taskId: t.id };
    }
    const t = checkedTask(v);
    if (v.action === "reconcile") {
      if (
        t.status !== "uncertain" ||
        !irreversibleTask(t) ||
        v.verified !== true
      )
        throw new HttpError(
          409,
          "Verify the actual external outcome before reconciliation.",
        );
      if (v.outcome === "completed") {
        recordExternalSuccess(t, v, "user");
        t.status = "completed";
      } else if (v.outcome === "not_performed") {
        t.result = {
          summary: textField(v.summary, "summary", 5000),
          evidenceUrl: safeUrl(v.evidenceUrl),
          receipt:
            "User verified no external action occurred; cancelled, not automatically retried.",
        };
        t.status = "cancelled";
        const d = drafts().find((x) => x.id === t.input.draftId);
        if (d?.status === "queued") saveDraft({ ...d, status: "draft" });
      } else throw new HttpError(400, "Choose the verified outcome.");
      finish(t);
      log(
        "user",
        "task_reconciled",
        `${t.title}: ${t.status}. ${t.result?.summary}`,
      );
      return { ok: true };
    }
    if (v.action === "cancel") {
      if (
        t.status === "claimed" ||
        t.status === "uncertain" ||
        t.status === "completed"
      )
        throw new HttpError(
          409,
          "Active or uncertain external work must be reconciled; it cannot be silently cancelled.",
        );
      t.status = "cancelled";
      finish(t);
      if (t.kind === "linkedin_send") {
        const draft = drafts().find((x) => x.id === t.input.draftId);
        if (draft?.status === "queued")
          saveDraft({ ...draft, status: "draft" });
      }
      if (t.kind === "discover" && t.batchId) {
        const b = allBatches().find((x) => x.id === t.batchId)!;
        b.status = "cancelled";
        b.version++;
        saveBatch(b);
        for (const other of allTasks().filter(
          (x) => x.batchId === b.id && x.status === "queued",
        )) {
          other.status = "cancelled";
          finish(other);
        }
      }
      return { ok: true };
    }
    if (v.action === "retry") {
      if (t.status !== "blocked" || irreversibleTask(t))
        throw new HttpError(
          409,
          "Only blocked read/prepare tasks can be retried. Reconcile uncertain sends manually.",
        );
      if (
        t.batchId &&
        allBatches().find((x) => x.id === t.batchId)?.status === "cancelled"
      )
        throw new HttpError(409, "Batch cancelled.");
      if (t.kind === "application_prepare") {
        const j = readWorkspace().workspace.jobs.find(
          (x) => x.id === t.entityId,
        );
        if (j && screenJob(j).status === "Not a match")
          throw new HttpError(
            409,
            "Role is not a match; correct evidence or cancel.",
          );
      }
      if (
        t.entityId &&
        ["draft", "application_prepare"].includes(t.kind) &&
        possibleDuplicate(t.entityId)
      )
        throw new HttpError(
          409,
          "Possible duplicate records remain. Resolve their identity before retrying.",
        );
      t.status = "queued";
      delete t.result;
      finish(t);
      return { ok: true };
    }
    if (v.action === "approve_application") {
      if (
        t.kind !== "application_prepare" ||
        t.status !== "review" ||
        !t.result
      )
        throw new HttpError(409, "Review a prepared application first.");
      const answers = textField(v.answers, "answers", 20000);
      const { workspace } = readWorkspace();
      const job = workspace.jobs.find((j) => j.id === t.entityId);
      if (!job?.jdUrl)
        throw new HttpError(400, "Original application URL required.");
      if (
        workspace.applications.some(
          (a) => a.jobId === job.id && !["Saved", "To apply"].includes(a.stage),
        ) ||
        allTasks().some(
          (x) =>
            x.entityId === job.id &&
            x.kind === "application_submit" &&
            x.status !== "cancelled",
        )
      )
        throw new HttpError(
          409,
          "An application or submission task already exists.",
        );
      const next = newTask(
        "application_submit",
        t.owner,
        `Submit ${job.company} · ${job.role}`,
        {
          job,
          answers,
          preparedTaskId: t.id,
          authorization:
            "User reviewed and approved this exact answer set for this specific application. Stop for missing facts or site-required user approvals.",
        },
        { batchId: t.batchId, entityId: job.id },
      );
      saveTask(next);
      t.result = { ...t.result, answers };
      t.status = "completed";
      finish(t);
      return { ok: true, taskId: next.id };
    }
    throw new HttpError(400, "Unknown task action.");
  });
}

export function agentTaskAction(actor: Agent, v: Record<string, unknown>) {
  return taskTransaction(() => {
    expireClaims();
    if (v.action === "daily_tick")
      throw new HttpError(410, "Website daily plans were removed. Run your user-authorized native routine; use begin_discovery_round to coordinate its findings.");
    if (v.action === "begin_discovery_round") {
      // A record of agent-initiated work, not a timer, recurring registration or sending authorization.
      const roundKey = textField(v.roundKey, "roundKey", 200);
      const existing = allBatches().find(b => b.externalRoundKey === roundKey);
      if (existing) return {ok: true, created: false, batch: existing};
      const title = textField(v.title, "title", 160);
      const brief = textField(v.brief, "brief", 12000);
      if (!["email", "linkedin", "auto"].includes(String(v.channel)) || typeof v.prepareApplications !== "boolean")
        throw new HttpError(400, "Explicit channel and prepareApplications are required; there are no daily defaults.");
      const b: Batch = {
        id: randomUUID(), title, brief, createdAt: new Date().toISOString(), version: 1,
        status: "discovering", channel: v.channel as Batch["channel"],
        prepareApplications: v.prepareApplications, autoRelease: true,
        origin: "agent", externalRoundKey: roundKey, initiatedBy: actor,
      };
      saveBatch(b);
      for (const owner of ["dot", "muse"] as const) saveTask(newTask("discover", owner, `${title} · ${owner}`, {
        brief, profile: readWorkspace().workspace.profile,
        scope: "Coordination record for an independently authorized native routine. Search the full scope. Report with batchId/taskId/claimToken. Complete discovery before drafting/applying. This record neither starts another agent nor grants sending/submission permission.",
      }, {batchId: b.id}));
      log(actor, "discovery_round_started", `${title}: agent-initiated coordination round; no schedule created.`);
      return {ok: true, created: true, batch: b};
    }
    setSetting(`worker_poll:${actor}`, new Date().toISOString());
    if (v.action === "register_worker") {
      setSetting(`worker_schedule:${actor}`, {
        schedule: textField(v.schedule, "schedule", 1000),
        registeredAt: new Date().toISOString(),
      });
      return {
        ok: true,
        message:
          "Schedule is agent-reported, not independently verified. Task polling times are recorded separately.",
      };
    }
    if (v.action === "claim") {
      const t = allTasks().find((x) => x.id === v.taskId);
      if (!t || t.owner !== actor || t.status !== "queued")
        throw new HttpError(409, "Task is not queued for you.");
      if (
        t.batchId &&
        allBatches().find((b) => b.id === t.batchId)?.status === "cancelled"
      )
        throw new HttpError(409, "Batch cancelled.");
      if (typeof v.usesLocalBrowser !== "boolean")
        throw new HttpError(
          400,
          "Declare usesLocalBrowser true/false. Local Chrome work requires a shared browser claim.",
        );
      if (t.kind === "application_submit") {
        const { workspace } = readWorkspace(),
          j = workspace.jobs.find((x) => x.id === t.entityId),
          frozen = t.input.job as { jdUrl?: string };
        if (
          !j ||
          j.jdUrl !== frozen.jdUrl ||
          workspace.applications.some(
            (a) =>
              a.jobId === t.entityId &&
              !["Saved", "To apply"].includes(a.stage),
          )
        )
          throw new HttpError(
            409,
            "Application already recorded or approved job changed. Stop for reconciliation.",
          );
      }
      const leaseUntil = new Date(Date.now() + 10 * 60000).toISOString();
      if (v.usesLocalBrowser) {
        const lock = taskDb()
          .prepare(
            "SELECT task_id FROM browser_claims WHERE resource='local-chrome'",
          )
          .get();
        if (lock) {
          const locked = allTasks().find((x) => x.id === lock.task_id);
          if (locked?.status === "claimed" || locked?.status === "uncertain")
            throw new HttpError(
              409,
              "Local Chrome is in use or its last action is uncertain. Wait for reconciliation.",
            );
        }
        taskDb()
          .prepare(
            "INSERT INTO browser_claims VALUES ('local-chrome',?,?) ON CONFLICT(resource) DO UPDATE SET task_id=excluded.task_id,lease_until=excluded.lease_until",
          )
          .run(t.id, leaseUntil);
      }
      if (t.kind === "linkedin_send") {
        const d = drafts().find((x) => x.id === t.input.draftId),
          c = readWorkspace().workspace.contacts.find(
            (x) => x.id === t.entityId,
          );
        if (
          !d ||
          d.version !== t.input.draftVersion ||
          d.text !== t.input.text ||
          d.status !== "queued" ||
          c?.linkedin !== t.input.linkedin
        )
          throw new HttpError(
            409,
            "Approved message or recipient changed. Return to the user.",
          );
      }
      t.status = "claimed";
      t.claimToken = randomUUID();
      t.leaseUntil = leaseUntil;
      t.browser = v.usesLocalBrowser;
      t.version++;
      t.updatedAt = new Date().toISOString();
      saveTask(t);
      return { ok: true, task: t };
    }
    const receiptId = `${actor}:${textField(v.eventId, "eventId", 200)}`;
    const prior = taskDb()
      .prepare("SELECT body FROM task_requests WHERE id=?")
      .get(receiptId);
    if (prior) return JSON.parse(String(prior.body));
    const t = requireClaim(actor, v.taskId, v.claimToken);
    if (v.action === "heartbeat") {
      t.leaseUntil = new Date(Date.now() + 10 * 60000).toISOString();
      saveTask(t);
      const result = { ok: true, leaseUntil: t.leaseUntil };
      taskDb()
        .prepare("INSERT INTO task_requests VALUES (?,?)")
        .run(receiptId, JSON.stringify(result));
      return result;
    }
    if (v.action !== "report")
      throw new HttpError(400, "Unknown agent task action.");
    const summary = textField(v.summary, "summary", 5000);
    if (
      !["completed", "blocked", "uncertain", "review"].includes(
        String(v.status),
      )
    )
      throw new HttpError(400, "Invalid result status.");
    if (irreversibleTask(t) && v.status === "review")
      throw new HttpError(
        400,
        "An execution task must report its actual outcome.",
      );
    if (t.kind === "application_prepare" && v.status === "completed")
      throw new HttpError(
        400,
        "Prepared applications must use review status, not completed/submitted.",
      );
    t.result = { summary };
    if (v.status === "review") {
      if (t.kind !== "application_prepare")
        throw new HttpError(
          400,
          "Only application preparation uses review status.",
        );
      if (v.formState !== undefined && !["not_opened", "partially_filled", "filled"].includes(String(v.formState))) throw new HttpError(400, "Invalid form state.");
      t.result.formState = v.formState || "not_opened";
      t.result.answers = textField(v.answers, "answers", 20000);
      t.result.evidenceUrl = safeUrl(v.evidenceUrl);
    }
    if (v.status === "completed") {
      if (t.kind === "discover") {
        if (typeof v.coverage !== "string" || !v.coverage.trim())
          throw new HttpError(
            400,
            "Describe search coverage and gaps before completing discovery.",
          );
        t.result.coverage = textField(v.coverage, "coverage", 4000);
      } else if (t.kind === "draft") {
        const d = drafts().find(
          (x) =>
            x.id === `${t.entityId}:${t.input.channel}:task:${t.id}` &&
            x.author === actor &&
            x.channel === t.input.channel,
        );
        if (!d)
          throw new HttpError(
            409,
            "Submit the claimed contact's draft before completing the task.",
          );
        t.result.draftId = d.id;
      } else if (
        t.kind === "application_submit" ||
        t.kind === "linkedin_send"
      ) {
        recordExternalSuccess(t, v, actor);
      } else if (t.kind === "linkedin_sync") {
        if (!Array.isArray(v.messages) || v.messages.length > 100)
          throw new HttpError(
            400,
            "Provide up to 100 observed messages, or an empty array with coverage.",
          );
        for (const item of v.messages as Record<string, unknown>[]) {
          const externalId = textField(item.externalId, "externalId", 300),
            at = textField(item.at, "at", 100),
            text = textField(item.text, "text", 15000),
            url = safeUrl(item.url, true);
          if (
            !Number.isFinite(Date.parse(at)) ||
            Date.parse(at) > Date.now() + 60000 ||
            !["incoming", "outgoing"].includes(String(item.direction))
          )
            throw new HttpError(400, "Invalid message direction or timestamp.");
          addEvent({
            id: `linkedin:${t.entityId}:${externalId}`,
            actor,
            kind:
              item.direction === "incoming"
                ? "linkedin_incoming_reported"
                : "linkedin_sent_reported",
            contactId: t.entityId,
            at,
            text,
            url,
            messageId: externalId,
          });
        }
        t.result.coverage = textField(v.coverage, "coverage", 4000);
      }
    }
    t.status = v.status as Task["status"];
    if (
      irreversibleTask(t) &&
      t.status === "blocked" &&
      v.noActionTaken !== true
    )
      t.status = "uncertain";
    if (t.status === "uncertain") {
      t.version++;
      t.updatedAt = new Date().toISOString();
      delete t.claimToken;
      delete t.leaseUntil;
      saveTask(t);
    } else finish(t);
    if (t.kind === "discover" && t.status === "completed") {
      const b = allBatches().find((x) => x.id === t.batchId)!;
      if (
        b.status === "discovering" &&
        allTasks()
          .filter((x) => x.batchId === b.id && x.kind === "discover")
          .every((x) => x.status === "completed")
      ) {
        b.status = "ready";
        b.version++;
        saveBatch(b);
        if (b.autoRelease) releaseBatch(b.id, actor);
      }
    }
    const result = { ok: true, task: publicTask(t) };
    taskDb()
      .prepare("INSERT INTO task_requests VALUES (?,?)")
      .run(receiptId, JSON.stringify(result));
    log(actor, "task_result", `${t.title}: ${t.status}. ${summary}`);
    return result;
  });
}
