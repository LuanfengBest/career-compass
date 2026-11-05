import { readWorkspace, writeWorkspace } from "../../lib/server/database";
import { isWorkspace } from "../../lib/logic";
import { body, failure, guard, HttpError, json } from "../../lib/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    guard(request);
    return json(readWorkspace());
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(request: Request) {
  try {
    guard(request, true);
    const value = (await body(request)) as {
      workspace?: unknown;
      revision?: unknown;
    };
    if (
      !value ||
      !isWorkspace(value.workspace) ||
      !Number.isSafeInteger(value.revision) ||
      Number(value.revision) < 0
    )
      throw new HttpError(400, "Invalid workspace or revision.");
    if (!writeWorkspace(value.workspace, Number(value.revision)))
      throw new HttpError(
        409,
        "Another tab updated this workspace. Export your pending edits, then reload before saving.",
      );
    return json({ revision: Number(value.revision) + 1 });
  } catch (e) {
    return failure(e);
  }
}
