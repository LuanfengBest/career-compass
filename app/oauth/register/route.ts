import {registerClient,OAuthError} from "../../lib/server/mcp-oauth";
import {oauthHost,oauthFailure} from "../../lib/server/oauth-http";
import {json} from "../../lib/server/http";
export const runtime="nodejs";
export async function POST(req: Request) {
  try {
    oauthHost(req);const raw=await req.text();if(raw.length>16000)throw new OAuthError("invalid_client_metadata","Request too large.",413);
    let v;try{v=JSON.parse(raw);}catch{throw new OAuthError("invalid_client_metadata","Expected JSON.");}
    if(!v || typeof v!=="object" || Array.isArray(v))throw new OAuthError("invalid_client_metadata","Expected object.");
    return json(registerClient(v),201);
  }catch(e){return oauthFailure(e);}
}
