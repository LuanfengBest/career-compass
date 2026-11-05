import { body, guard, json, failure, HttpError } from "../../lib/server/http";
import { taskSnapshot } from "../../lib/server/task-store";
import { userTaskAction } from "../../lib/server/task-actions";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    guard(req);
    return json(taskSnapshot());
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    guard(req, true);
    const v = await body(req);
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw new HttpError(400, "Expected an object.");
    if ((v as Record<string, unknown>).action === "save_routine")
      throw new HttpError(410, "Website daily plans were removed. Manage routines in each personal agent.");
    return json(userTaskAction(v as Record<string, unknown>));
  } catch (e) {
    return failure(e);
  }
}
