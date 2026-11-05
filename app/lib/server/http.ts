import {cloudMode, cloudAuthConfigured, ownerAuthenticated, agentApiPath} from "./owner-auth";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function appOrigin() {
  const url = new URL(process.env.APP_URL || "http://127.0.0.1:3000");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new HttpError(503, "APP_URL must be a bare origin.");
  if (cloudMode()) {
    if (url.protocol !== "https:" || !cloudAuthConfigured())
      throw new HttpError(503, "Cloud mode requires HTTPS and owner authentication secrets.");
  } else if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new HttpError(503, "This adapter is local-only unless authenticated cloud mode is configured.");
  }
  return url.origin;
}
export function guard(
  request: Request,
  mutation = false,
  oauthCallback = false,
) {
  const expected = appOrigin();
  // Next may normalize request.url to localhost internally; validate the actual Host header.
  if (request.headers.get("host") !== new URL(expected).host)
    throw new HttpError(403, "Use the configured APP_URL.");
  const path = new URL(request.url).pathname;
  if (cloudMode() && !ownerAuthenticated(request) && !agentApiPath(path))
    throw new HttpError(401, "Sign in to your private workspace.");
  if (!oauthCallback && request.headers.get("sec-fetch-site") === "cross-site")
    throw new HttpError(403, "Cross-site requests are not allowed.");
  if (mutation && request.headers.get("origin") !== expected)
    throw new HttpError(403, "A same-origin request is required.");
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function failure(error: unknown) {
  return json(
    {
      error:
        error instanceof HttpError
          ? error.message
          : "Operation failed. Check configuration and retry; existing records were retained.",
    },
    error instanceof HttpError ? error.status : 500,
  );
}
export async function body(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 5_000_000)
    throw new HttpError(413, "Request is too large.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
