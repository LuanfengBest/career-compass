import {agentAuth} from '../../../lib/server/portal';
import {json,failure} from '../../../lib/server/http';
import {cloudCredentialActor} from '../../../lib/server/agent-connection';
import {setSetting} from '../../../lib/server/database';
export const runtime='nodejs';
// A transport diagnostic is deliberately not a worker check-in or queue poll.
export async function GET(req:Request){try{
 const actor=agentAuth(req),checkedAt=new Date().toISOString();
 const cloud=cloudCredentialActor(req)===actor;
 if(cloud)setSetting(`agent_cloud_check:${actor}`,checkedAt);
 return json({ok:true,actor,checkedAt,transport:cloud?'https-api':'local-helper-or-browser',purpose:'connection diagnostic only; no task was claimed, no schedule or persistent agent access verified'});
}catch(e){return failure(e);}}
