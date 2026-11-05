import { agentAuth } from "../../../lib/server/portal";
import { body, json, failure, HttpError } from "../../../lib/server/http";
import { taskSnapshot } from "../../../lib/server/task-store";
import { agentTaskAction } from "../../../lib/server/task-actions";
import { readWorkspace, setSetting } from "../../../lib/server/database";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const actor = agentAuth(req);
    setSetting(`worker_poll:${actor}`, new Date().toISOString());
    return json({
      ...taskSnapshot(actor),
      profile: readWorkspace().workspace.profile,
      instructions:
        "Claim before working. Renew claim every 2 minutes. Read /api/agents/guide. Do not execute a task assigned to another actor. All writes use canonical IDs.",
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const actor = agentAuth(req),
      v = await body(req);
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw new HttpError(400, "Expected an object.");
    return json(agentTaskAction(actor, v as Record<string, unknown>));
  } catch (e) {
    return failure(e);
  }
}
