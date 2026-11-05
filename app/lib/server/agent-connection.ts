import {mkdirSync,writeFileSync,readFileSync,renameSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {db,readSetting,setSetting,removeSetting} from './database';
import {seal,unseal} from './crypto';
import {appOrigin,HttpError} from './http';
import type {Agent} from '../portal';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function provisionLocalCredential(actor:Agent) {
 const dir=resolve('.data/agent-credentials');mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
 const file=join(dir,`${actor}.json`);let valid=false;
 try {const saved=unseal<{token:string;actor:Agent}>(JSON.parse(readFileSync(file,'utf8')).sealed);valid=saved.actor===actor&&hash(saved.token)===readSetting(`agent_token:${actor}`);}catch{/* Missing/stale local credential is replaced. */}
 if(!valid) {
  const token=randomBytes(32).toString('hex');const temp=`${file}.${randomUUID()}.tmp`;
  writeFileSync(temp,JSON.stringify({sealed:seal({actor,token,origin:appOrigin()})}),{mode:0o600,flag:'wx'});renameSync(temp,file);
  setSetting(`agent_token:${actor}`,hash(token));setSetting(`agent_seen:${actor}`,null);
 }
 chmodSync(file,0o600);return {ok:true,actor,path:file,replaced:!valid};
}
export function startBrowserSession(actor:Agent) {
 const token=randomBytes(32).toString('hex');
 setSetting(`agent_browser:${hash(token)}`,{actor,expiresAt:Date.now()+12*3600000,generation:readSetting(`agent_session_generation:${actor}`)||0});return token;
}
export function browserSessionActor(req:Request):Agent|null {
 const token=req.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('career_agent_session='))?.slice('career_agent_session='.length);
 if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 const session=readSetting<{actor:Agent;expiresAt:number;generation:number}>(`agent_browser:${hash(token)}`);
 if(!session||session.expiresAt<=Date.now()||session.generation!==(readSetting(`agent_session_generation:${session.actor}`)||0))return null;
 if(!['GET','HEAD'].includes(req.method)&&req.headers.get('origin')!==appOrigin())throw new HttpError(403,'Browser actions require the local website origin.');
 return session.actor;
}
export function localCredentialConfigured(actor:Agent) {
 try {const saved=unseal<{token:string}>(JSON.parse(readFileSync(resolve('.data/agent-credentials',`${actor}.json`),'utf8')).sealed);const current=readSetting<string>(`agent_token:${actor}`);return !!current&&timingSafeEqual(Buffer.from(hash(saved.token)),Buffer.from(current));}catch{return false;}
}

export function revokeBrowserSessions(actor:Agent) {
 setSetting(`agent_session_generation:${actor}`,Number(readSetting(`agent_session_generation:${actor}`)||0)+1);
}
export function endBrowserSession(req:Request) {
 const token=req.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('career_agent_session='))?.slice('career_agent_session='.length);
 if(token&&/^[a-f0-9]{64}$/.test(token))removeSetting(`agent_browser:${hash(token)}`);
}

export function browserConnectionConfigured(actor:Agent) {
 const generation=readSetting(`agent_session_generation:${actor}`)||0;
 return db().prepare("SELECT body FROM settings WHERE key LIKE 'agent_browser:%'").all().some(row=>{
  const session=JSON.parse(String(row.body));
  return session.actor===actor&&session.expiresAt>Date.now()&&session.generation===generation;
 });
}
