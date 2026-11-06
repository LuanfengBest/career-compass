import {createHash, randomBytes, randomUUID} from "node:crypto";
import {db} from "./database";
import {appOrigin, HttpError} from "./http";
import {cloudMode} from "./owner-auth";

export const MCP_SCOPE = "career:agent";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
type Client = {client_id: string; client_name: string; redirect_uris: string[]; token_endpoint_auth_method: "none"};
type Authorization = {clientId: string; redirect: string; state: string; challenge: string; resource: string; scope: string};
export type McpGrant = {id: string; actor: "dot"; clientId: string; resource: string; scope: string; expires: number; createdAt: string};
type Token = {grantId: string; clientId: string; used?: boolean};
function store() {
  const d = db();
  d.exec(`CREATE TABLE IF NOT EXISTS mcp_oauth (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(kind,id));`);
  return d;
}
function get<T>(kind: string, id: string): T | null {
  const row = store().prepare("SELECT body FROM mcp_oauth WHERE kind=? AND id=? AND expires>?").get(kind, id, Date.now());
  return row ? JSON.parse(String(row.body)) as T : null;
}
function put(kind: string, id: string, value: unknown, expires: number) {
  store().prepare("INSERT INTO mcp_oauth VALUES (?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body,expires=excluded.expires").run(kind,id,JSON.stringify(value),expires);
}
function del(kind: string, id: string) { store().prepare("DELETE FROM mcp_oauth WHERE kind=? AND id=?").run(kind,id); }
export class OAuthError extends HttpError {
  constructor(public code: string, message: string, status = 400) { super(status, message); }
}
export function mcpResource() {
  if (!cloudMode()) throw new OAuthError("temporarily_unavailable", "MCP OAuth requires the deployed HTTPS workspace.",503);
  return `${appOrigin()}/mcp`;
}
export function oauthMetadata() {
  mcpResource(); const base = appOrigin();
  return {issuer: base, authorization_endpoint: `${base}/oauth/authorize`, token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`, revocation_endpoint: `${base}/oauth/revoke`,
    authorization_response_iss_parameter_supported: true, response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"], token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"], scopes_supported: [MCP_SCOPE]};
}
export function resourceMetadata() {
  return {resource: mcpResource(), authorization_servers: [appOrigin()], scopes_supported: [MCP_SCOPE], bearer_methods_supported: ["header"]};
}
// No arbitrary redirects, loopback callbacks, URL fetches or client-provided actor.
function allowedRedirect(value: string) {
  try { const u=new URL(value); return u.origin==="https://chatgpt.com" && !u.search && !u.hash && !u.username && !u.password &&
    (u.pathname==="/connector_platform_oauth_redirect" || /^\/connector\/oauth\/[a-zA-Z0-9_-]+$/.test(u.pathname)); } catch {return false;}
}
export function oauthRateLimit(bucket: string, limit: number) {
  const id = `${bucket}:${Math.floor(Date.now()/60000)}`, count = get<number>("rate",id) || 0;
  if (count>=limit) throw new OAuthError("temporarily_unavailable","Too many requests. Retry in one minute.",429);
  put("rate",id,count+1,Date.now()+120000);
  store().prepare("DELETE FROM mcp_oauth WHERE expires<=?").run(Date.now());
}
export function registerClient(v: Record<string,unknown>) {
  mcpResource(); oauthRateLimit("register",20);
  if (!Array.isArray(v.redirect_uris) || !v.redirect_uris.length || v.redirect_uris.length>5 ||
    !v.redirect_uris.every(x=>typeof x==="string" && allowedRedirect(x)))
    throw new OAuthError("invalid_redirect_uri","Only official ChatGPT connector callback URLs are supported.");
  if (v.token_endpoint_auth_method && v.token_endpoint_auth_method!=="none") throw new OAuthError("invalid_client_metadata","Use public-client PKCE (none).");
  if (v.grant_types && (!Array.isArray(v.grant_types) || !v.grant_types.every(x=>["authorization_code","refresh_token"].includes(String(x))))) throw new OAuthError("invalid_client_metadata","Unsupported grant type.");
  if (v.response_types && (!Array.isArray(v.response_types) || v.response_types.length!==1 || v.response_types[0]!=="code")) throw new OAuthError("invalid_client_metadata","Only code responses are supported.");
  if (v.scope && v.scope!==MCP_SCOPE) throw new OAuthError("invalid_scope","Unsupported scope.");
  if (Number(store().prepare("SELECT count(*) n FROM mcp_oauth WHERE kind='client'").get()!.n)>=1000) throw new OAuthError("temporarily_unavailable","Client registration capacity reached.",503);
  const c: Client={client_id:randomUUID(),client_name:typeof v.client_name==="string"?v.client_name.slice(0,100):"ChatGPT connector",redirect_uris:v.redirect_uris as string[],token_endpoint_auth_method:"none"};
  // Client registrations persist across token rotation and server restarts.
  put("client",c.client_id,c,8640000000000000);
  return {...c,client_id_issued_at:Math.floor(Date.now()/1000),grant_types:["authorization_code","refresh_token"],response_types:["code"],scope:MCP_SCOPE};
}
export function validateAuthorization(p: URLSearchParams): Authorization & {clientName: string} {
  for (const key of p.keys()) if (p.getAll(key).length !== 1) throw new OAuthError("invalid_request", "Duplicate parameters.");
  const client=get<Client>("client",p.get("client_id")||"");
  if (!client) throw new OAuthError("invalid_client","Unknown OAuth client. Start again from ChatGPT.");
  const redirect=p.get("redirect_uri")||"";
  if (!client.redirect_uris.includes(redirect)) throw new OAuthError("invalid_request","Redirect URI does not match the registered client.");
  if (p.get("response_type")!=="code" || p.get("code_challenge_method")!=="S256" || !/^[A-Za-z0-9_-]{43}$/.test(p.get("code_challenge")||"")) throw new OAuthError("invalid_request","Authorization code with S256 PKCE is required.");
  if (p.getAll("resource").length!==1 || p.get("resource")!==mcpResource()) throw new OAuthError("invalid_target","Incorrect MCP resource.");
  if (p.get("scope") && p.get("scope")!==MCP_SCOPE) throw new OAuthError("invalid_scope","Unsupported scope.");
  const state=p.get("state")||""; if(state.length>2000) throw new OAuthError("invalid_request","State is too long.");
  return {clientId:client.client_id,clientName:client.client_name,redirect,state,challenge:p.get("code_challenge")!,resource:mcpResource(),scope:MCP_SCOPE};
}
export function createConsent(auth: Authorization, ownerSession: string) {
  oauthRateLimit("consent",30);
  const nonce=secret(); put("consent",hash(nonce),{auth,binding:hash(ownerSession)},Date.now()+10*60000); return nonce;
}
export function finishConsent(nonce: string, ownerSession: string, approved: boolean) {
  const d=store(); d.exec("BEGIN IMMEDIATE");
  try {
    const pending=get<{auth:Authorization;binding:string}>("consent",hash(nonce));
    if (!pending || pending.binding!==hash(ownerSession)) throw new OAuthError("invalid_request","Consent expired or belongs to another login. Restart the connection.");
    del("consent",hash(nonce)); const a=pending.auth, target=new URL(a.redirect);
    target.searchParams.set("iss",appOrigin()); if(a.state) target.searchParams.set("state",a.state);
    if (approved) {
      const code=secret(); put("code",hash(code),a,Date.now()+120000); target.searchParams.set("code",code);
    } else target.searchParams.set("error","access_denied");
    d.exec("COMMIT"); return target.toString();
  } catch(e) {d.exec("ROLLBACK");throw e;}
}
function issueTokens(grant: McpGrant) {
  const access=`ccm_a_${secret()}`, refresh=`ccm_r_${secret()}`, now=Date.now();
  put("access",hash(access),{grantId:grant.id,clientId:grant.clientId},Math.min(now+3600000,grant.expires));
  put("refresh",hash(refresh),{grantId:grant.id,clientId:grant.clientId},Math.min(now+30*86400000,grant.expires));
  return {access_token:access,refresh_token:refresh,token_type:"Bearer",expires_in:Math.floor((Math.min(now+3600000,grant.expires)-now)/1000),scope:grant.scope};
}
export function exchangeToken(p: URLSearchParams) {
  mcpResource(); oauthRateLimit("token",120);
  const clientId=p.get("client_id")||"";
  if (!get<Client>("client",clientId)) throw new OAuthError("invalid_client","Unknown client.");
  if (p.getAll("resource").length!==1 || p.get("resource")!==mcpResource()) throw new OAuthError("invalid_target","Incorrect MCP resource.");
  if (p.get("scope") && p.get("scope")!==MCP_SCOPE) throw new OAuthError("invalid_scope","Unsupported scope.");
  const d=store(); d.exec("BEGIN IMMEDIATE");
  try {
    let grant: McpGrant;
    if (p.get("grant_type")==="authorization_code") {
      const key=hash(p.get("code")||""), a=get<Authorization>("code",key), verifier=p.get("code_verifier")||"";
      if(!a || a.clientId!==clientId || a.redirect!==p.get("redirect_uri") || a.resource!==mcpResource() || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || createHash("sha256").update(verifier).digest("base64url")!==a.challenge) throw new OAuthError("invalid_grant","Invalid, expired or already used code, redirect, or PKCE verifier.");
      del("code",key); grant={id:randomUUID(),actor:"dot",clientId,resource:a.resource,scope:a.scope,createdAt:new Date().toISOString(),expires:Date.now()+90*86400000};
      put("grant",grant.id,grant,grant.expires);
    } else if(p.get("grant_type")==="refresh_token") {
      const key=hash(p.get("refresh_token")||""), t=get<Token>("refresh",key);
      if(!t || t.clientId!==clientId) throw new OAuthError("invalid_grant","Invalid refresh token.");
      if(t.used) {
        del("grant",t.grantId); d.exec("COMMIT");
        // Preserve revocation even though this request fails.
        throw new OAuthError("invalid_grant","Refresh token replay detected. Reconnect from ChatGPT.");
      }
      const g=get<McpGrant>("grant",t.grantId);
      if(!g || g.resource!==mcpResource()) throw new OAuthError("invalid_grant","Connection expired or revoked.");
      grant=g; put("refresh",key,{...t,used:true},g.expires);
    } else throw new OAuthError("unsupported_grant_type","Only authorization_code and refresh_token are supported.");
    const tokens=issueTokens(grant); d.exec("COMMIT"); return tokens;
  } catch(e) { if(d.isTransaction) d.exec("ROLLBACK"); throw e; }
}
export function authenticateMcp(req: Request): McpGrant {
  const raw=req.headers.get("authorization")?.match(/^Bearer (ccm_a_[A-Za-z0-9_-]+)$/)?.[1];
  const t=raw?get<Token>("access",hash(raw)):null, g=t?get<McpGrant>("grant",t.grantId):null;
  if(!g || g.resource!==mcpResource() || g.scope!==MCP_SCOPE || g.actor!=="dot") throw new OAuthError("invalid_token","OAuth connection required.",401);
  return g;
}
export function revokeToken(p: URLSearchParams) {
  const raw=p.get("token")||"", t=get<Token>(raw.startsWith("ccm_r_")?"refresh":"access",hash(raw));
  if(t && t.clientId===p.get("client_id")) del("grant",t.grantId);
}
export function oauthConnections() {
  return store().prepare("SELECT body FROM mcp_oauth WHERE kind='grant' AND expires>?").all(Date.now()).map(r=>JSON.parse(String(r.body)) as McpGrant).map(g=>({id:g.id,actor:g.actor,createdAt:g.createdAt,expiresAt:new Date(g.expires).toISOString()}));
}
export function revokeDotOAuth() { store().prepare("DELETE FROM mcp_oauth WHERE kind IN ('grant','consent','code','claim')").run(); }
export function saveMcpClaim(grantId: string, task: {id: string; claimToken?: string; batchId?: string}) {
  if(task.claimToken) put("claim",`${grantId}:${task.id}`,{taskId:task.id,claimToken:task.claimToken,batchId:task.batchId},Date.now()+86400000);
}
export function mcpClaim(grantId: string, taskId: string) {
  const c=get<{taskId:string;claimToken:string;batchId?:string}>("claim",`${grantId}:${taskId}`);
  if(!c) throw new HttpError(409,"Claim this task through this OAuth connection first. Existing browser claims are separate; read the recovery rules.");
  return c;
}
