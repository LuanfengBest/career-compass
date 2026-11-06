import {oauthMetadata} from "../../lib/server/mcp-oauth";
import {oauthHost,oauthFailure} from "../../lib/server/oauth-http";
import {json} from "../../lib/server/http";
export const runtime="nodejs";
export async function GET(req: Request){try{oauthHost(req);return json(oauthMetadata());}catch(e){return oauthFailure(e);}}
