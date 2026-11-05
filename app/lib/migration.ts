import { initialWorkspace } from "./demo";
import { isWorkspace } from "./logic";
import type { Workspace } from "./model";

const legacyLabels: Record<string, string> = {
  已收藏: "Saved",
  已投递: "Applied",
  测评: "Assessment",
  面试: "Interview",
  拒绝: "Rejected",
  撤回: "Saved",
  未发送: "Not sent",
  已发送: "Sent",
  已回复: "Replied",
  已约聊: "Meeting booked",
  不再联系: "Do not contact",
  未联系: "Not contacted",
  已停止: "Stopped",
  示例: "Demo",
  人工记录: "Manual",
  用户提供: "User provided",
};
const translate = (value: unknown) =>
  typeof value === "string" ? (legacyLabels[value] ?? value) : value;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

// Keep the existing storage key so an upgrade preserves contacts, drafts, profile and preferences.
export function migrateWorkspace(value: unknown): Workspace | null {
  if (isWorkspace(value)) return value;
  if (
    !object(value) ||
    value.version !== 1 ||
    !Array.isArray(value.applications) ||
    !Array.isArray(value.contacts) ||
    !Array.isArray(value.outreach)
  )
    return null;
  if (
    ![...value.applications, ...value.contacts, ...value.outreach].every(object)
  )
    return null;
  const upgraded = {
    ...value,
    version: 2,
    jobs: initialWorkspace.jobs,
    applications: value.applications.map((a: Record<string, unknown>) => ({
      ...a,
      stage: translate(a.stage),
      origin: translate(a.origin),
      appliedAt: "",
      notes:
        a.stage === "撤回"
          ? "Previous stage: Withdrawn. Moved to Saved during the workflow update."
          : "",
    })),
    contacts: value.contacts.map((c: Record<string, unknown>) => {
      const fixture = c.demo
        ? initialWorkspace.contacts.find((item) => item.id === c.id)
        : undefined;
      return {
        ...c,
        emailStatus: translate(c.emailStatus),
        relationship: fixture?.relationship ?? translate(c.relationship),
        evidence: fixture?.evidence ?? c.evidence,
        source: fixture?.source ?? c.source,
      };
    }),
    outreach: value.outreach.map((o: Record<string, unknown>) => ({
      ...o,
      status: translate(o.status),
    })),
  };
  return isWorkspace(upgraded) ? upgraded : null;
}
