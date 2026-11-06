import {exchangeToken} from "../../lib/server/mcp-oauth";
import {oauthHost,oauthForm,oauthFailure} from "../../lib/server/oauth-http";
import {json} from "../../lib/server/http";
export const runtime="nodejs";
export async function POST(req: Request) {
  try {oauthHost(req);return json(exchangeToken(await oauthForm(req)));}catch(e){return oauthFailure(e);}
}
