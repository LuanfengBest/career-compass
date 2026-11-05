import {cloudMode} from "../../lib/server/owner-auth";
import { emailCounts, gmailStatus } from "../../lib/server/gmail";
import { db, readWorkspace, readSetting } from "../../lib/server/database";
import { guard, failure, json } from "../../lib/server/http";
import { resolve } from "node:path";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    guard(request);
    const { revision, workspace } = readWorkspace();
    return json({
      database: {
        connected: true,
        provider: cloudMode() ? "SQLite · persistent cloud volume" : "SQLite · this computer",
        path: resolve(
          /* turbopackIgnore: true */ process.env.CAREER_DB_PATH ||
            ".data/career-compass.sqlite",
        ),
        revision,
        records: {
          jobs: workspace.jobs.length,
          applications: workspace.applications.length,
          contacts: workspace.contacts.length,
          leads: Number(
            db().prepare("SELECT COUNT(*) AS n FROM leads").get()!.n,
          ),
          emails: emailCounts(),
        },
      },
      gmail: gmailStatus(),
      worker: readSetting("sync_worker"),
      linkedin: {
        mode: "agent-mediated",
        message:
          "Jobs and contacts are reported by your agents. Tasks can request agent-reported conversation sync and reviewed message sends; no direct LinkedIn messaging API is connected. Results require a working agent browser session.",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
