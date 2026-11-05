import {agentAuth} from '../../../lib/server/portal';
import {json,failure} from '../../../lib/server/http';
export const runtime='nodejs';
// A transport diagnostic is deliberately not a worker check-in or queue poll.
export async function GET(req:Request){try{return json({ok:true,actor:agentAuth(req),purpose:'connection diagnostic; no task was claimed or executed'});}catch(e){return failure(e);}}
