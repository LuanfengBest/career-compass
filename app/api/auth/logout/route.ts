import {guard, failure, json} from '../../../lib/server/http';
import {ownerCookie} from '../../../lib/server/owner-auth';
import {endBrowserSession} from '../../../lib/server/agent-connection';
export async function POST(req:Request){try{guard(req,true);endBrowserSession(req);const r=json({ok:true});r.headers.set('Set-Cookie',`${ownerCookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);r.headers.append('Set-Cookie','career_agent_session=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0');return r;}catch(e){return failure(e);}}
