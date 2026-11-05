import { disconnectGmail } from "../../../lib/server/gmail";
import { guard, failure, json } from "../../../lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    guard(request, true);
    return json(await disconnectGmail());
  } catch (e) {
    return failure(e);
  }
}
