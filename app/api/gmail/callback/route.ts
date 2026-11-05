import { finishOAuth } from "../../../lib/server/gmail";
import { guard, failure, appOrigin } from "../../../lib/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    guard(request, false, true);
    await finishOAuth(request);
    return Response.redirect(`${appOrigin()}/settings?gmail=connected`, 303);
  } catch (e) {
    return failure(e);
  }
}
