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
  if (result?.blocker === "user_input" ||
      (Array.isArray(result?.unansweredFields) && result.unansweredFields.length)) return "needs_input";
  if (result?.blocker === "technical") return "blocked";
  if (result?.formState === "filled" && typeof result.answers === "string" && result.answers.trim() && result.evidenceUrl) return "review";
  if (/sign[ -]?in|log[ -]?in|create (?:an )?account|registration|authentication/i.test(result?.summary || "")) return "needs_login";
  return "needs_input";
}

// These tasks only read data or save drafts. Form preparation can already have
// changed an external form, so it deliberately requires owner reconciliation.
export const recoverableClaimKind = (kind: string) =>
  ["discover", "draft", "mail_review", "linkedin_sync"].includes(kind);
