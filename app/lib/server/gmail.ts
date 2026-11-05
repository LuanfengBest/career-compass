import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import {
  acquireLease,
  db,
  readSetting,
  readWorkspace,
  releaseLease,
  removeSetting,
  setSetting,
} from "./database";
import { encryptionKey, seal, unseal } from "./crypto";
import { appOrigin, HttpError } from "./http";
import {
  classifyMail,
  isRecruitingMail,
  mailInWindow,
  type EmailEvent,
  gmailMessageUrl,
  mailClassificationVersion,
} from "../mail";
import { mailBody } from "./mail-content";
const scope = "https://www.googleapis.com/auth/gmail.readonly";
const sendScope = "https://www.googleapis.com/auth/gmail.send";
type Tokens = {
  access_token: string;
  refresh_token?: string;
  expiresAt: number;
  email: string;
  scope?: string;
};
type Cursor = {
  mode: "initial" | "history";
  historyId: string;
  pageToken?: string;
  after: number;
  syncedAt?: string;
  catchUpPending?: boolean;
  windowDays?: number;
};
type Message = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate: string;
  payload?: {
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    mimeType?: string;
    parts?: NonNullable<Message["payload"]>[];
  };
};
function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const owner = process.env.GMAIL_ACCOUNT_EMAIL?.toLowerCase().trim();
  if (!clientId || !clientSecret || !owner || !owner.includes("@"))
    throw new HttpError(
      503,
      "Fill GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GMAIL_ACCOUNT_EMAIL in .env.local, then restart the server.",
    );
  try {
    encryptionKey();
  } catch {
    throw new HttpError(
      503,
      "Generate TOKEN_ENCRYPTION_KEY with npm run setup:local.",
    );
  }
  return {
    clientId,
    clientSecret,
    owner,
    redirect: `${appOrigin()}/api/gmail/callback`,
  };
}
export function gmailStatus() {
  let configured = true;
  let message = "Ready to authorize read-only Gmail access.";
  try {
    config();
  } catch (e) {
    configured = false;
    message = e instanceof Error ? e.message : "Configuration required.";
  }
  const stored = readSetting<string>("gmail_tokens");
  let email = "";
  let connected = false;
  if (stored && configured) {
    try {
      email = unseal<Tokens>(stored).email;
      connected = true;
      message = gmailCanSend()
        ? "Read and send authorization saved. Sending occurs only from the draft Send action."
        : "Read-only authorization saved. Use Sync Gmail to fetch messages.";
    } catch {
      message =
        "Stored authorization cannot be decrypted. Restore the original encryption key or reconnect.";
    }
  }
  const cursor = readSetting<Cursor>("gmail_cursor");
  const syncError = readSetting<{ message: string; at: string }>(
    "gmail_last_error",
  );
  return {
    configured,
    connected,
    sendEnabled: gmailCanSend(),
    email,
    message,
    syncError,
    lastSync: cursor?.syncedAt || null,
    more:
      !!cursor?.pageToken ||
      cursor?.mode === "initial" ||
      !!cursor?.catchUpPending,
    phase: cursor?.mode || "not-started",
    paused: readWorkspace().workspace.emailPaused,
  };
}
async function tokenRequest(params: Record<string, string>) {
  const { clientId, clientSecret } = config();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      ...params,
    }),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new HttpError(
      502,
      "Google rejected the authorization or refresh request. Reconnect Gmail and check the OAuth configuration.",
    );
  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
}
export async function startOAuth(allowSend = false) {
  const { clientId, redirect, owner } = config();
  const state = randomBytes(32).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  setSetting("gmail_oauth", { state, verifier, expires: Date.now() + 600000 });
  (await cookies()).set("career_gmail_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: appOrigin().startsWith("https:"),
    path: "/api/gmail",
    maxAge: 600,
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: allowSend ? `${scope} ${sendScope}` : scope,
    access_type: "offline",
    prompt: "consent",
    state,
    login_hint: owner,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return url.href;
}
export async function finishOAuth(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const saved = readSetting<{
    state: string;
    verifier: string;
    expires: number;
  }>("gmail_oauth");
  if (
    !state ||
    !saved ||
    state !== saved.state ||
    state !== jar.get("career_gmail_state")?.value ||
    saved.expires < Date.now()
  )
    throw new HttpError(
      400,
      "OAuth session expired or state did not match. Start Connect Gmail again.",
    );
  removeSetting("gmail_oauth");
  jar.delete("career_gmail_state");
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.has("error"))
    throw new HttpError(400, "Gmail authorization was cancelled or denied.");
  const { redirect, owner } = config();
  const result = await tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirect,
    code_verifier: saved.verifier,
  });
  if (!result.scope?.split(" ").includes(scope))
    throw new HttpError(400, "Gmail read-only permission was not granted.");
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    {
      headers: { Authorization: `Bearer ${result.access_token}` },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    },
  );
  if (!response.ok)
    throw new HttpError(
      502,
      "Could not verify the Gmail account. Confirm that Gmail API is enabled.",
    );
  const profile = (await response.json()) as { emailAddress: string };
  if (profile.emailAddress.toLowerCase() !== owner) {
    await revoke(result.access_token);
    throw new HttpError(
      403,
      "This is not GMAIL_ACCOUNT_EMAIL. Authorize the configured account.",
    );
  }
  const old = readSetting<string>("gmail_tokens");
  let previous: Tokens | null = null;
  if (old) {
    try {
      previous = unseal<Tokens>(old);
    } catch {
      /* Reauthorization repairs the token record. */
    }
  }
  if (previous && previous.email !== profile.emailAddress)
    throw new HttpError(
      409,
      "Disconnect the existing mailbox before switching accounts.",
    );
  const refresh_token = result.refresh_token || previous?.refresh_token;
  if (!refresh_token)
    throw new HttpError(
      400,
      "No offline refresh token was granted. Revoke the app in Google Account, then reconnect.",
    );
  setSetting(
    "gmail_tokens",
    seal({
      access_token: result.access_token,
      refresh_token,
      expiresAt: Date.now() + result.expires_in * 1000,
      email: profile.emailAddress,
      scope: result.scope,
    } satisfies Tokens),
  );
}
export async function accessToken() {
  const encrypted = readSetting<string>("gmail_tokens");
  if (!encrypted) throw new HttpError(401, "Connect Gmail first.");
  const tokens = unseal<Tokens>(encrypted);
  if (tokens.expiresAt > Date.now() + 60000) return tokens.access_token;
  if (!tokens.refresh_token)
    throw new HttpError(401, "Reconnect Gmail to refresh authorization.");
  const result = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
  });
  setSetting(
    "gmail_tokens",
    seal({
      ...tokens,
      ...result,
      expiresAt: Date.now() + result.expires_in * 1000,
    }),
  );
  return result.access_token;
}
export async function gmailApi<T>(path: string, token: string): Promise<T> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    const reasons: string[] = (failure?.error?.errors || []).map(
      (e: { reason?: string }) => e.reason || "",
    );
    const message = reasons.some((r) =>
      /rateLimitExceeded|userRateLimitExceeded|dailyLimitExceeded|quotaExceeded/.test(
        r,
      ),
    )
      ? "Gmail quota or rate limit reached. Imported events are saved; retry later to resume this page."
      : reasons.includes("domainPolicy")
        ? "Your Google Workspace administrator blocked Gmail API access. Ask your school administrator to allow this OAuth application."
        : reasons.includes("insufficientPermissions")
          ? "Gmail read permission is missing. Reconnect Gmail and grant read-only access."
          : `Gmail returned HTTP ${response.status}. Imported events are saved; retry later or reconnect.`;
    throw new HttpError(response.status === 404 ? 404 : 502, message);
  }
  return response.json();
}
export function emailEvents(): EmailEvent[] {
  const rows = db()
    .prepare(
      "SELECT body FROM email_events WHERE json_extract(body,'$.receivedAt') >= ? ORDER BY json_extract(body,'$.receivedAt') DESC, id DESC",
    )
    .all(new Date(Date.now() - 30 * 86400000).toISOString());
  return rows
    .map((r) => JSON.parse(String(r.body)) as EmailEvent)
    .filter(
      (e) =>
        mailInWindow(e.receivedAt) &&
        (e.classificationVersion === mailClassificationVersion
          ? e.recruitingEvidence === true
          : isRecruitingMail(e.subject, e.snippet, e.from)),
    );
}
export function emailCounts() {
  const events = emailEvents();
  return {
    total: events.length,
    pending: events.filter((e) => !e.reviewed).length,
  };
}
export function emailPage(page = 1, stage = "All statuses") {
  const all = emailEvents().filter((e) => !e.reviewed);
  const filtered = all.filter(
    (e) =>
      stage === "All statuses" ||
      (e.suggestedStage || "Manual review") === stage,
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const current = Math.max(1, Math.min(Math.floor(page) || 1, pages));
  const stages: Record<string, number> = {};
  for (const e of all) {
    const key = e.suggestedStage || "Manual review";
    stages[key] = (stages[key] || 0) + 1;
  }
  return {
    events: filtered.slice((current - 1) * 20, current * 20).map((event) => ({
      ...event,
      originalUrl: gmailMessageUrl(event, process.env.GMAIL_ACCOUNT_EMAIL),
    })),
    total: filtered.length,
    page: current,
    pages,
    size: 20,
    counts: emailCounts(),
    stages,
  };
}
export async function syncGmail() {
  if (readWorkspace().workspace.emailPaused)
    throw new HttpError(
      409,
      "Gmail sync is paused. Enable it in Settings first.",
    );
  if (!acquireLease("gmail", 600))
    throw new HttpError(409, "Gmail sync is already running.");
  try {
    const token = await accessToken();
    let cursor = readSetting<Cursor>("gmail_cursor");
    if (cursor?.windowDays !== 30) cursor = null;
    if (!cursor) {
      const profile = await gmailApi<{ historyId: string }>("profile", token);
      cursor = {
        mode: "initial",
        historyId: profile.historyId,
        after: Math.floor(Date.now() / 1000) - 30 * 86400,
        windowDays: 30,
      };
      setSetting("gmail_cursor", cursor);
    }
    let ids: string[];
    let nextPageToken: string | undefined;
    let nextHistoryId = cursor.historyId;
    const params = new URLSearchParams({ maxResults: "25" });
    if (cursor.pageToken) params.set("pageToken", cursor.pageToken);
    if (cursor.mode === "initial") {
      params.set(
        "q",
        `after:${cursor.after} -in:sent -in:drafts -category:promotions -category:social {"your application" "application received" "application submitted" "thank you for applying" "interview" "assessment" "recruiter" "offer letter"}`,
      );
      const page = await gmailApi<{
        messages?: { id: string }[];
        nextPageToken?: string;
      }>(`messages?${params}`, token);
      ids = (page.messages || []).map((m) => m.id);
      nextPageToken = page.nextPageToken;
    } else {
      params.set("startHistoryId", cursor.historyId);
      params.set("historyTypes", "messageAdded");
      let page: {
        history?: { messagesAdded?: { message: { id: string } }[] }[];
        nextPageToken?: string;
        historyId: string;
      };
      try {
        page = await gmailApi(`history?${params}`, token);
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) {
          removeSetting("gmail_cursor");
          throw new HttpError(
            409,
            "Gmail history expired. Sync again to safely re-import the last 30 days; existing events will be deduplicated.",
          );
        }
        throw e;
      }
      ids = [
        ...new Set(
          (page.history || []).flatMap((h) =>
            (h.messagesAdded || []).map((m) => m.message.id),
          ),
        ),
      ];
      nextPageToken = page.nextPageToken;
      nextHistoryId = page.historyId;
    }
    let imported = 0;
    for (const id of ids) {
      if (db().prepare("SELECT id FROM email_events WHERE id=?").get(id))
        continue;
      if (readWorkspace().workspace.emailPaused)
        throw new HttpError(
          409,
          "Sync paused. The current page will resume safely next time.",
        );
      await new Promise((resolve) => setTimeout(resolve, 250));
      let message: Message;
      try {
        message = await gmailApi(
          `messages/${encodeURIComponent(id)}?format=full`,
          token,
        );
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) continue;
        throw e;
      }
      if (
        message.labelIds?.some((label) => label === "SENT" || label === "DRAFT")
      )
        continue;
      const headers = message.payload?.headers || [];
      const subject =
        headers.find((h) => h.name.toLowerCase() === "subject")?.value ||
        "(No subject)";
      const from =
        headers.find((h) => h.name.toLowerCase() === "from")?.value || "";
      const text = mailBody(message.payload) || message.snippet || "";
      const bulk = headers.some(
        (h) => h.name.toLowerCase() === "list-id" && !!h.value,
      );
      if (
        !mailInWindow(new Date(Number(message.internalDate)).toISOString()) ||
        !isRecruitingMail(subject, text, from, bulk)
      )
        continue;
      const classification = classifyMail(subject, text, from, bulk);
      const event: EmailEvent = {
        id,
        threadId: message.threadId,
        subject,
        from,
        receivedAt: new Date(Number(message.internalDate)).toISOString(),
        snippet: (message.snippet || "").slice(0, 500),
        suggestedStage: classification.stage,
        reason: classification.reason,
        reviewed: false,
        recruitingEvidence: true,
        classificationVersion: mailClassificationVersion,
        mailboxEmail: config().owner,
        rfcMessageId: headers.find((h) => h.name.toLowerCase() === "message-id")
          ?.value,
      };
      db()
        .prepare("INSERT OR IGNORE INTO email_events VALUES (?, ?)")
        .run(id, JSON.stringify(event));
      imported++;
    }
    setSetting("gmail_cursor", {
      ...cursor,
      pageToken: nextPageToken,
      mode: nextPageToken ? cursor.mode : "history",
      catchUpPending: cursor.mode === "initial" || !!nextPageToken,
      historyId:
        nextPageToken || cursor.mode === "initial"
          ? cursor.historyId
          : nextHistoryId,
      syncedAt: new Date().toISOString(),
    } satisfies Cursor);
    removeSetting("gmail_last_error");
    return {
      imported,
      more: !!nextPageToken || cursor.mode === "initial",
      counts: emailCounts(),
      status: gmailStatus(),
    };
  } catch (e) {
    setSetting("gmail_last_error", {
      message:
        e instanceof HttpError
          ? e.message
          : "Gmail request failed. Saved checkpoints are retained; retry later.",
      at: new Date().toISOString(),
    });
    throw e;
  } finally {
    releaseLease("gmail");
  }
}
async function revoke(token: string) {
  const result = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(15000),
  });
  return result.ok || result.status === 400;
}
export async function disconnectGmail() {
  if (!acquireLease("gmail", 60))
    throw new HttpError(
      409,
      "Wait for the active Gmail sync to finish, then disconnect.",
    );
  try {
    let revoked = true;
    const encrypted = readSetting<string>("gmail_tokens");
    if (encrypted) {
      try {
        const token = unseal<Tokens>(encrypted);
        revoked = await revoke(token.refresh_token || token.access_token);
      } catch {
        revoked = false;
      }
    }
    removeSetting("gmail_tokens");
    removeSetting("gmail_cursor");
    removeSetting("gmail_oauth");
    removeSetting("gmail_last_error");
    return {
      revoked,
      message: revoked
        ? "Disconnected. Imported events are retained for your records."
        : "Local credentials removed. Also revoke Career Compass in your Google Account permissions.",
    };
  } finally {
    releaseLease("gmail");
  }
}

// Upgrade cached recent emails using their original body, without moving history checkpoints.
export async function reclassifyRecentMail() {
  if (readWorkspace().workspace.emailPaused)
    throw new HttpError(
      409,
      "Enable Gmail sync in Settings before re-reading messages.",
    );
  if (!acquireLease("gmail", 600))
    throw new HttpError(409, "A Gmail sync is already running.");
  let processed = 0;
  const pending = () =>
    db()
      .prepare(
        "SELECT body FROM email_events WHERE json_extract(body,'$.receivedAt')>=? AND COALESCE(json_extract(body,'$.classificationVersion'),0) < ? ORDER BY json_extract(body,'$.receivedAt') DESC",
      )
      .all(
        new Date(Date.now() - 30 * 86400000).toISOString(),
        mailClassificationVersion,
      );
  try {
    const token = await accessToken();
    for (const row of pending().slice(0, 15)) {
      if (readWorkspace().workspace.emailPaused)
        throw new HttpError(409, "Gmail sync paused.");
      const old: EmailEvent = JSON.parse(String(row.body));
      await new Promise((r) => setTimeout(r, 750));
      let message: Message;
      try {
        message = await gmailApi(
          `messages/${encodeURIComponent(old.id)}?format=full`,
          token,
        );
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) {
          db()
            .prepare(
              "UPDATE email_events SET body=json_set(body,'$.classificationVersion',?,'$.recruitingEvidence',json('false')) WHERE id=?",
            )
            .run(mailClassificationVersion, old.id);
          processed++;
          continue;
        }
        throw e;
      }
      const headers = message.payload?.headers || [];
      const subject =
        headers.find((h) => h.name.toLowerCase() === "subject")?.value ||
        old.subject;
      const from =
        headers.find((h) => h.name.toLowerCase() === "from")?.value || old.from;
      const text = mailBody(message.payload) || message.snippet || "";
      const bulk = headers.some(
        (h) => h.name.toLowerCase() === "list-id" && !!h.value,
      );
      const classification = classifyMail(subject, text, from, bulk);
      // Re-read after await to preserve a user's dismiss / manual correction made during the request.
      const current = JSON.parse(
        String(
          db().prepare("SELECT body FROM email_events WHERE id=?").get(old.id)!
            .body,
        ),
      ) as EmailEvent;
      const next: EmailEvent = {
        ...current,
        subject,
        from,
        threadId: message.threadId,
        snippet: (message.snippet || old.snippet).slice(0, 500),
        classificationVersion: mailClassificationVersion,
        recruitingEvidence: current.agentReviewedBy
          ? current.recruitingEvidence
          : isRecruitingMail(subject, text, from, bulk),
        mailboxEmail: config().owner,
        rfcMessageId: headers.find((h) => h.name.toLowerCase() === "message-id")
          ?.value,
        ...(!current.manuallyLabeled && !current.agentReviewedBy
          ? {
              suggestedStage: classification.stage,
              reason: classification.reason,
            }
          : {}),
      };
      db()
        .prepare("UPDATE email_events SET body=? WHERE id=?")
        .run(JSON.stringify(next), old.id);
      processed++;
    }
    return { processed, remaining: pending().length, counts: emailCounts() };
  } finally {
    releaseLease("gmail");
  }
}

export function gmailCanSend() {
  try {
    const stored = readSetting<string>("gmail_tokens");
    return (
      !!stored && !!unseal<Tokens>(stored).scope?.split(" ").includes(sendScope)
    );
  } catch {
    return false;
  }
}
