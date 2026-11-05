import { emailPage } from "../../../lib/server/gmail";
import { db } from "../../../lib/server/database";
import {
  body,
  guard,
  failure,
  HttpError,
  json,
} from "../../../lib/server/http";
import { stages } from "../../../lib/model";
import type { EmailEvent } from "../../../lib/mail";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    guard(request);
    const params = new URL(request.url).searchParams;
    return json(
      emailPage(
        Number(params.get("page") || 1),
        params.get("stage") || "All statuses",
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    guard(request, true);
    const value = (await body(request)) as {
      id?: unknown;
      stage?: unknown;
      dismiss?: unknown;
    };
    if (!value || typeof value.id !== "string")
      throw new HttpError(400, "Choose an email.");
    const row = db()
      .prepare("SELECT body FROM email_events WHERE id=?")
      .get(value.id);
    if (!row) throw new HttpError(404, "Email not found.");
    const event: EmailEvent = JSON.parse(String(row.body));
    if (value.dismiss === true) event.reviewed = true;
    else {
      if (
        value.stage !== "Manual review" &&
        !stages.includes(value.stage as (typeof stages)[number])
      )
        throw new HttpError(400, "Choose a valid status.");
      event.suggestedStage =
        value.stage === "Manual review"
          ? null
          : (value.stage as (typeof stages)[number]);
      event.manuallyLabeled = true;
    }
    db()
      .prepare("UPDATE email_events SET body=? WHERE id=?")
      .run(JSON.stringify(event), event.id);
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
