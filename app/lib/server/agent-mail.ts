import { accessToken, gmailApi } from "./gmail";
import { db, readWorkspace, writeWorkspace, setSetting } from "./database";
import { addEvent, portalDb, textField } from "./portal";
import { HttpError } from "./http";
import { mailBody } from "./mail-content";
import {
  mailInWindow,
  mailClassificationVersion,
  type EmailEvent,
} from "../mail";
import type { Agent } from "../portal";
import type { Stage } from "../model";
export function pendingMail() {
  return db()
    .prepare(
      "SELECT body FROM email_events WHERE json_extract(body,'$.receivedAt') >= ? ORDER BY json_extract(body,'$.receivedAt') DESC",
    )
    .all(new Date(Date.now() - 30 * 86400000).toISOString())
    .map((r) => JSON.parse(String(r.body)) as EmailEvent);
}
export async function readAgentMail(id: string) {
  if (readWorkspace().workspace.emailPaused)
    throw new HttpError(409, "Gmail reading is paused in Settings.");
  const event = pendingMail().find((e) => e.id === id);
  if (!event || !mailInWindow(event.receivedAt))
    throw new HttpError(404, "Recent cached email not found.");
  const token = await accessToken();
  const message = await gmailApi<{
    payload?: Parameters<typeof mailBody>[0];
    snippet?: string;
  }>(`messages/${encodeURIComponent(id)}?format=full`, token);
  return { event, text: mailBody(message.payload) || message.snippet || "" };
}
export async function analyzeApplication(
  actor: Agent,
  v: Record<string, unknown>,
) {
  const receiptId = `${actor}:${textField(v.eventId, "eventId", 200)}`;
  const d = portalDb();
  const previous = d
    .prepare("SELECT body FROM agent_receipts WHERE id=?")
    .get(receiptId);
  if (previous) return JSON.parse(String(previous.body));
  const id = textField(v.messageId, "messageId", 500);
  const mail = await readAgentMail(id);
  const quote = textField(v.quote, "quote", 3000);
  if (!mail.text.includes(quote))
    throw new HttpError(400, "Quote must match the original email body.");
  if (typeof v.relevant !== "boolean")
    throw new HttpError(400, "relevant must be a boolean.");
  const allowed = ["Applied", "Assessment", "Interview", "Offer", "Rejected"];
  if (v.stage !== null && !allowed.includes(String(v.stage)))
    throw new HttpError(
      400,
      "Invalid application stage; use null for uncertain / irrelevant.",
    );
  if (!v.relevant && v.stage !== null)
    throw new HttpError(400, "Irrelevant messages must have stage null.");
  const reason = textField(v.reason, "reason", 2000);
  const jobId = textField(v.jobId, "jobId", 200, false);
  d.exec("BEGIN IMMEDIATE");
  try {
    const existingReceipt = d
      .prepare("SELECT body FROM agent_receipts WHERE id=?")
      .get(receiptId);
    if (existingReceipt) {
      d.exec("COMMIT");
      return JSON.parse(String(existingReceipt.body));
    }
    const row = d.prepare("SELECT body FROM email_events WHERE id=?").get(id);
    const current = JSON.parse(String(row!.body)) as EmailEvent;
    if (
      current.manuallyLabeled ||
      (current.agentReviewedBy && current.agentReviewedBy !== actor)
    )
      throw new HttpError(
        409,
        "Manual classification is protected; ask the user to review.",
      );
    const now = new Date().toISOString();
    let linked = false;
    if (jobId && v.relevant && v.stage) {
      const { workspace, revision } = readWorkspace();
      if (!workspace.jobs.some((j) => j.id === jobId))
        throw new HttpError(
          400,
          "jobId must reference an existing opportunity; do not guess a match.",
        );
      const application = workspace.applications.find((a) => a.jobId === jobId);
      // Existing tracker edits are never silently overwritten by an agent.
      if (!application) {
        workspace.applications.push({
          jobId,
          stage: v.stage as Stage,
          origin: "Agent",
          evidenceAt: current.receivedAt,
          sourceMessageId: id,
          appliedAt:
            v.stage === "Applied" ? current.receivedAt.slice(0, 10) : "",
          updatedAt: current.receivedAt,
          notes: `Agent ${actor} linked Gmail ${id}. Evidence: ${quote}`,
        });
        if (!writeWorkspace(workspace, revision))
          throw new HttpError(409, "Workspace changed; retry.");
        linked = true;
      } else if (
        application.origin === "Agent" &&
        current.receivedAt >= (application.evidenceAt || application.updatedAt)
      ) {
        application.stage = v.stage as Stage;
        application.updatedAt = current.receivedAt;
        application.evidenceAt = current.receivedAt;
        application.sourceMessageId = id;
        if (!application.appliedAt && v.stage === "Applied")
          application.appliedAt = current.receivedAt.slice(0, 10);
        if (!writeWorkspace(workspace, revision))
          throw new HttpError(409, "Workspace changed; retry.");
        linked = true;
      }
    }
    d.prepare("UPDATE email_events SET body=? WHERE id=?").run(
      JSON.stringify({
        ...current,
        suggestedStage: v.stage,
        reason: `${actor}: ${reason} Evidence: ${quote}`,
        recruitingEvidence: v.relevant,
        classificationVersion: mailClassificationVersion,
        agentReviewedBy: actor,
        ...(jobId && v.relevant ? { jobId } : {}),
      }),
      id,
    );
    addEvent({
      id: receiptId,
      actor,
      kind: "application_analysis",
      at: now,
      text: `${current.subject}: ${v.relevant ? v.stage || "needs review" : "not an application"}. ${reason}`,
      messageId: id,
    });
    const result = {
      ok: true,
      linkedApplication: linked,
      message:
        jobId && !linked
          ? "Existing tracker record retained; review any suggested change in Applications."
          : "Email analysis saved.",
    };
    d.prepare("INSERT INTO agent_receipts VALUES (?,?)").run(
      receiptId,
      JSON.stringify(result),
    );
    setSetting(`agent_seen:${actor}`, now);
    d.exec("COMMIT");
    return result;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
