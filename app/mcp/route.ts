import {WebStandardStreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {authenticateMcp,MCP_SCOPE,oauthRateLimit} from "../lib/server/mcp-oauth";
import {oauthHost,oauthFailure} from "../lib/server/oauth-http";
import {createCareerMcp} from "../lib/server/mcp-tools";
import {appOrigin,HttpError} from "../lib/server/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function handle(req: Request) {
  try {
    oauthHost(req);
    const origin=req.headers.get("origin");
    if(origin && ![appOrigin(),"https://chatgpt.com"].includes(origin))throw new HttpError(403,"Invalid origin.");
    const grant=authenticateMcp(req);oauthRateLimit(`mcp:${grant.id}`,180);
    if(req.method!=="POST")return new Response(null,{status:405,headers:{Allow:"POST"}});
    const raw=await req.text();if(Buffer.byteLength(raw)>1_000_000)throw new HttpError(413,"Request too large.");
    let message;try{message=JSON.parse(raw);}catch{throw new HttpError(400,"Invalid JSON.");}
    const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    const server=createCareerMcp(grant);
    try {
      await server.connect(transport);
      const response=await transport.handleRequest(req,{parsedBody:message});
      // Materialize the JSON response before closing the stateless SDK transport.
      const result=new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers});
      result.headers.set("Cache-Control","no-store");return result;
    } finally {await server.close();}
  } catch(e) {
    const response=oauthFailure(e);
    if(e instanceof HttpError && e.status===401)response.headers.set("WWW-Authenticate",`Bearer resource_metadata="${appOrigin()}/.well-known/oauth-protected-resource", scope="${MCP_SCOPE}", error="invalid_token"`);
    return response;
  }
}
export const POST=handle;
export const GET=handle;
export const DELETE=handle;
