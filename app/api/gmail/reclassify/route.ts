import { reclassifyRecentMail } from "../../../lib/server/gmail";
import { guard, json, failure } from "../../../lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    guard(request, true);
    return json(await reclassifyRecentMail());
  } catch (e) {
    return failure(e);
  }
}
