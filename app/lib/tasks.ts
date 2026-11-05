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
