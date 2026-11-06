import {appOrigin, HttpError, json} from "./http";
import {ownerCookie} from "./owner-auth";
import {OAuthError, mcpResource} from "./mcp-oauth";
export function oauthHost(req: Request) {
  mcpResource();
  if(req.headers.get("host")!==new URL(appOrigin()).host) throw new OAuthError("invalid_request","Invalid host.",403);
}
export function oauthFailure(e: unknown) {
  return json({error:e instanceof OAuthError?e.code:"server_error",error_description:e instanceof HttpError?e.message:"OAuth operation failed."},e instanceof HttpError?e.status:500);
}
export async function oauthForm(req: Request) {
  if(!req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new OAuthError("invalid_request","Expected form encoding.",415);
  const text=await req.text();
  if(Buffer.byteLength(text)>16000) throw new OAuthError("invalid_request","Request too large.",413);
  const params=new URLSearchParams(text);
  for(const key of params.keys()) if(params.getAll(key).length!==1) throw new OAuthError("invalid_request","Duplicate parameters.");
  return params;
}
export function escapeHtml(s: string) { return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!)); }
export function consentBinding(req: Request) {
  return req.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(`${ownerCookie}=`))?.slice(ownerCookie.length+1) || "";
}
export function consentHtml(body: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect ChatGPT Dot · Career Compass</title><style>body{font:18px/1.6 system-ui;background:#f4f6fa;color:#18243c;margin:0;padding:6vh 24px}main{max-width:640px;margin:auto;background:white;border:1px solid #dce1ec;border-radius:20px;padding:32px}h1{line-height:1.2}button,a{font:inherit}button{border:0;border-radius:8px;padding:12px 20px;cursor:pointer;margin:8px;background:#3157e5;color:white}.secondary{background:#eef1f7;color:#18243c}code{overflow-wrap:anywhere}</style><main>${body}</main></html>`,{status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
}
