import { startOAuth } from "../../../lib/server/gmail";
import { guard, failure } from "../../../lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    guard(request, true);
    const data = await request.formData();
    return Response.redirect(
      await startOAuth(data.get("send") === "true"),
      303,
    );
  } catch (e) {
    return failure(e);
  }
}
