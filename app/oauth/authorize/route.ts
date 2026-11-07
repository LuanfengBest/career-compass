import {appOrigin} from "../../lib/server/http";
import {ownerAuthenticated} from "../../lib/server/owner-auth";
import {createConsent, finishConsent, validateAuthorization, OAuthError} from "../../lib/server/mcp-oauth";
import {oauthHost, oauthForm, consentHtml, escapeHtml, consentBinding} from "../../lib/server/oauth-http";
export const runtime="nodejs";
export async function GET(req: Request) {
  try {
    oauthHost(req); const url=new URL(req.url), a=validateAuthorization(url.searchParams);
    if(!ownerAuthenticated(req)) {
      const login=new URL("/login",appOrigin()); login.searchParams.set("returnTo",`${url.pathname}${url.search}`);
      return Response.redirect(login,303);
    }
    const nonce=createConsent(a,consentBinding(req));
    return consentHtml(`<p>PRIVATE WORKSPACE · OAUTH</p><h1>Connect ChatGPT Dot</h1><p>Allow <strong>${escapeHtml(a.clientName)}</strong> to access Career Compass as <strong>dot</strong>?</p><ul><li>Read your profile, opportunities, contacts, drafts and imported email evidence.</li><li>Claim Dot tasks, save discoveries and drafts, and report actual work.</li><li>Use this connection in later sessions through refresh tokens, until revoked or expired (up to 90 days).</li></ul><p>This connection cannot change owner settings, approve applications or send Gmail messages. External submissions and LinkedIn sends still require separately reviewed tasks. It does not grant access to your Mac, Gmail account or LinkedIn browser.</p><p>Callback: <code>${escapeHtml(a.redirect)}</code></p><form method="post" action="/oauth/authorize"><input type="hidden" name="consent" value="${nonce}"><button name="decision" value="allow">Allow Dot connection</button><button class="secondary" name="decision" value="deny">Cancel</button></form><p>You can revoke access in Agents → ChatGPT Dot OAuth.</p>`);
  } catch(e) {return consentHtml(`<h1>Connection could not start</h1><p>${escapeHtml(e instanceof Error?e.message:"Try again from ChatGPT.")}</p>`,e instanceof OAuthError?e.status:500);}
}
export async function POST(req: Request) {
  try {
    oauthHost(req);
    if(!ownerAuthenticated(req)) throw new OAuthError("access_denied","Your workspace sign-in expired or is missing. Sign in, then restart Connect from ChatGPT.",403);
    if(req.headers.get("origin")!==appOrigin() || req.headers.get("sec-fetch-site")==="cross-site") throw new OAuthError("access_denied","The browser did not send a valid workspace origin. Restart Connect from ChatGPT to load a fresh authorization page.",403);
    const p=await oauthForm(req);
    if(!["allow","deny"].includes(p.get("decision")||"")) throw new OAuthError("invalid_request","Choose Allow or Cancel.");
    return Response.redirect(finishConsent(p.get("consent")||"",consentBinding(req),p.get("decision")==="allow"),303);
  } catch(e) {return consentHtml(`<h1>Connection not saved</h1><p>${escapeHtml(e instanceof Error?e.message:"Try again from ChatGPT.")}</p>`,e instanceof OAuthError?e.status:500);}
}
