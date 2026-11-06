import {agentAuth} from "../../../lib/server/portal";
import {cloudMode, ownerAuthenticated} from "../../../lib/server/owner-auth";
import {guard, failure, json} from "../../../lib/server/http";
import {agentGuide} from "../../../lib/server/agent-guide";
export async function GET(req: Request) {
  try {
    if (cloudMode() && !ownerAuthenticated(req)) agentAuth(req); else guard(req);
    return json(agentGuide());
  } catch(e) { return failure(e); }
}
