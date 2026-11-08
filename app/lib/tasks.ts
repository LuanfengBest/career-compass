import type { Agent } from "./portal";
export type TaskKind =
  | "discover"
  | "draft"
  | "application_prepare"
  | "application_submit"
  | "linkedin_send"
  | "linkedin_sync"
  | "mail_review";
export type TaskStatus =
  | "queued"
  | "claimed"
  | "review"
  | "needs_login"
  | "needs_input"
  | "completed"
  | "blocked"
  | "uncertain"
  | "cancelled";
export type Task = {
  id: string;
  batchId?: string;
  kind: TaskKind;
  owner: Agent;
  title: string;
  status: TaskStatus;
  entityId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  claimToken?: string;
  leaseUntil?: string;
  browser?: boolean;
  input: Record<string, unknown>;
  result?: {
    summary: string;
    evidenceUrl?: string;
    receipt?: string;
    [key: string]: unknown;
  };
};
export type Batch = {
  id: string;
  title: string;
  brief: string;
  createdAt: string;
  version: number;
  status: "discovering" | "ready" | "released" | "cancelled";
  channel: "email" | "linkedin" | "auto";
  autoRelease?: boolean;
  origin?: "agent" | "user";
  externalRoundKey?: string;
  initiatedBy?: Agent;
  prepareApplications: boolean;
};
export type Discovery = {
  batchId: string;
  kind: "job" | "contact";
  entityId: string;
  actor: Agent;
  evidence: string;
  at: string;
};
export type WorkerStatus = {
  actor: Agent;
  lastPoll: string | null;
  schedule?: string;
  registeredAt?: string;
};
export type TaskSnapshot = {
  nextActions?: { taskId: string; kind: TaskKind; owner: Agent; instruction: string }[];
  batches: Batch[];
  tasks: Task[];
  discoveries: Discovery[];
  workers: WorkerStatus[];
};
export const taskLabels: Record<TaskKind, string> = {
  discover: "Discover jobs & people",
  draft: "Prepare draft",
  application_prepare: "Prepare application",
  application_submit: "Submit approved application",
  linkedin_send: "Send approved LinkedIn message",
  linkedin_sync: "Read LinkedIn conversation",
  mail_review: "Review recent mail",
};
export const irreversibleTask = (t: Task) =>
  t.kind === "application_submit" || t.kind === "linkedin_send";

export const taskStatusLabel = (status: TaskStatus) =>
  status === "needs_login" ? "Sign up / Sign in" : status === "needs_input" ? "Needs your answers" : status;

// Use structured agent evidence first. The summary fallback repairs legacy
// reports that incorrectly used review for an unopened authentication screen.
export function preparationStatus(result: Task["result"]): TaskStatus {
  if (result?.blocker === "login") return "needs_login";
  if (result?.blocker === "technical") return "blocked";
  if (result?.blocker === "user_input" ||
      (Array.isArray(result?.unansweredFields) && result.unansweredFields.length)) return "needs_input";
  if (result?.formState === "filled" && typeof result.answers === "string" && result.answers.trim() && result.evidenceUrl) return "review";
  if (/sign[ -]?in|log[ -]?in|create (?:an )?account|registration|authentication/i.test(result?.summary || "")) return "needs_login";
  return "needs_input";
}

// These tasks only read data or save drafts. Form preparation can already have
// changed an external form, so it deliberately requires owner reconciliation.
export const recoverableClaimKind = (kind: string) =>
  ["discover", "draft", "mail_review", "linkedin_sync"].includes(kind);

export type TaskCategory = "all" | "applications" | "outreach" | "discovery";
export const taskCategories: { value: TaskCategory; label: string }[] = [
  { value: "all", label: "All tasks" },
  { value: "applications", label: "Job applications" },
  { value: "outreach", label: "People outreach" },
  { value: "discovery", label: "Discovery & inbox" },
];
export function taskCategory(kind: TaskKind): TaskCategory {
  if (kind === "application_prepare" || kind === "application_submit") return "applications";
  if (["draft", "linkedin_send", "linkedin_sync"].includes(kind)) return "outreach";
  return "discovery";
}
export function matchesTaskStatus(task: Task, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "active") return !["completed", "cancelled"].includes(task.status);
  if (filter === "attention") return ["blocked", "uncertain", "needs_login", "needs_input"].includes(task.status);
  return task.status === filter;
}
export function taskCompletionMeaning(kind: TaskKind): string {
  if (kind === "discover") return "Discovery report completed. Applications and outreach are separate tasks.";
  if (kind === "draft") return "Draft saved. Review and sending happen separately in Outreach.";
  if (kind === "application_prepare") return "Preparation task closed. Check the separate submission task for the actual outcome.";
  if (kind === "application_submit") return "Submission reported complete. Verify the receipt below.";
  if (kind === "linkedin_send") return "LinkedIn send reported complete. Verify the conversation evidence below.";
  return "Message review completed. This does not mean an application or message was sent.";
}
export function blockedNextStep(task: Task): string {
  const summary = task.result?.summary || "";
  if (/duplicate|identity/i.test(summary)) return "Compare the original job IDs or LinkedIn profiles in the records below. Resolve the duplicate record first, then retry this task. Retrying alone does not merge records.";
  if (/claim|lease|expired/i.test(summary)) return "Ask the assigned agent to check the saved form or conversation for any existing action. Once the outcome is known, retry to let the same agent claim again.";
  if (/browser|login|sign.in|authentication/i.test(summary)) return "Ask the assigned agent to identify the blocked page and provide its cloud-browser handoff if login is needed. A login in your local browser does not authenticate the agent’s browser. Resolve access, then retry.";
  return "Read the reported reason and task details below. Resolve the missing capability or data with the assigned agent, then retry. If no reason was reported, ask the agent for the exact failed step.";
}
