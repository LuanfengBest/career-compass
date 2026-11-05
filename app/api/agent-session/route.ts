import {body,guard,json,failure,HttpError,appOrigin} from '../../lib/server/http';
import {startBrowserSession,browserSessionActor,endBrowserSession} from '../../lib/server/agent-connection';
export const runtime='nodejs';
export async function GET(req:Request){try{guard(req);return json({actor:browserSessionActor(req)});}catch(e){return failure(e);}}
export async function POST(req:Request){try{guard(req,true);const v=await body(req) as Record<string,unknown>;if(v?.actor!=='dot'&&v?.actor!=='muse'&&v?.action!=='disconnect')throw new HttpError(400,'Choose an actor.');endBrowserSession(req);const token=v.action==='disconnect'?'':startBrowserSession(v.actor as 'dot'|'muse');const r=json({ok:true});r.headers.set('Set-Cookie',`career_agent_session=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${token?43200:0}${appOrigin().startsWith("https:")?"; Secure":""}`);return r;}catch(e){return failure(e);}}
