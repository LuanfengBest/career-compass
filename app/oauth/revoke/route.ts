import {revokeToken,oauthRateLimit} from "../../lib/server/mcp-oauth";
import {oauthHost,oauthForm,oauthFailure} from "../../lib/server/oauth-http";
import {json} from "../../lib/server/http";
export const runtime="nodejs";
export async function POST(req: Request) {
  try{oauthHost(req);oauthRateLimit("revoke",120);revokeToken(await oauthForm(req));return json({});}catch(e){return oauthFailure(e);}
}
