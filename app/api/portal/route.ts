import {sendApprovedDrafts} from "../../lib/server/bulk-outreach";
import {oauthConnections,revokeDotOAuth} from "../../lib/server/mcp-oauth";
import { provisionLocalCredential, localCredentialConfigured, revokeBrowserSessions, browserConnectionConfigured, issueCloudCredential } from "../../lib/server/agent-connection";
import { body, failure, guard, HttpError, json } from "../../lib/server/http";
import {
  drafts,
  events,
  issueToken,
  saveDraft,
  textField,
} from "../../lib/server/portal";
import { readSetting, removeSetting } from "../../lib/server/database";
import { gmailCanSend } from "../../lib/server/gmail";
import { sendPortalDraft, syncContactMail } from "../../lib/server/portal-mail";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    guard(req);
    return json({
      drafts: drafts(),
      events: events(),
      sendEnabled: gmailCanSend(),
      syncAt: readSetting("portal_sync_at"),
      oauthConnections: oauthConnections(),
      dotMcpCheck: readSetting("agent_mcp_check:dot"),
      agents: (["dot", "muse"] as const).map((actor) => ({
        actor,
        configured: !!readSetting(`agent_token:${actor}`) || !!readSetting(`agent_cloud_token:${actor}`) || browserConnectionConfigured(actor) || (actor === "dot" && oauthConnections().length > 0),
        cloudCredential: !!readSetting(`agent_cloud_token:${actor}`),
        cloudCheck: readSetting<string>(`agent_cloud_check:${actor}`),
        localCredential: localCredentialConfigured(actor),
        lastSeen: readSetting(`agent_seen:${actor}`),
      })),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    guard(req, true);
    const v = (await body(req)) as Record<string, unknown>;
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw new HttpError(400, "Expected a JSON object.");
    if(v.action === "oauth-disconnect") {revokeDotOAuth();return json({ok:true});}
    if (["connect", "disconnect", "local-connect", "cloud-connect", "cloud-disconnect"].includes(String(v.action))) {
      if (v.actor !== "dot" && v.actor !== "muse")
        throw new HttpError(400, "Invalid agent.");
      if(v.action === "local-connect") return json(provisionLocalCredential(v.actor));
      if(v.action === "cloud-connect") return json(issueCloudCredential(v.actor));
      if(v.action === "cloud-disconnect") {
        removeSetting(`agent_cloud_token:${v.actor}`);
        removeSetting(`agent_cloud_check:${v.actor}`);
        return json({ok:true});
      }
      if (v.action === "disconnect") {
        if(v.actor === "dot")revokeDotOAuth();
        removeSetting(`agent_token:${v.actor}`);
        removeSetting(`agent_cloud_token:${v.actor}`);
        removeSetting(`agent_cloud_check:${v.actor}`);
        revokeBrowserSessions(v.actor);
        return json({ ok: true });
      }
      return json({ token: issueToken(v.actor) });
    }
    if (v.action === "send_bulk") return json(await sendApprovedDrafts(v.approved));
    if (v.action === "sync") return json(await syncContactMail());
    const id = textField(v.id, "id", 300);
    const old = drafts().find((d) => d.id === id);
    if (!old || old.version !== v.version)
      throw new HttpError(
        409,
        "Draft changed; reload before editing or sending.",
      );
    if (v.action === "send")
      return json(await sendPortalDraft(id, Number(v.version)));
    if (v.action !== "edit" || old.status !== "draft")
      throw new HttpError(409, "Only unsent drafts can be edited.");
    const subject = textField(
      v.subject,
      "subject",
      200,
      old.channel === "email",
    );
    if (/[\r\n]/.test(subject))
      throw new HttpError(400, "Subject must be one line.");
    saveDraft({
      ...old,
      subject,
      text: textField(v.text, "text", 20000),
      version: old.version + 1,
      edited: true,
      updatedAt: new Date().toISOString(),
    });
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
