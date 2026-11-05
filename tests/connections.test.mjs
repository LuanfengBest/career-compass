import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),dir=mkdtempSync(join(tmpdir(),'career-connections-'));
const cwd=process.cwd();process.chdir(dir);
process.env.CAREER_DB_PATH=join(dir,'test.sqlite');process.env.APP_URL='http://127.0.0.1:3000';process.env.TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,12).toString('hex');
const c=require('../.test-build/server/agent-connection.js'),p=require('../.test-build/server/portal.js'),d=require('../.test-build/server/database.js'),{unseal}=require('../.test-build/server/crypto.js');
const request=(token,method='GET',extra={})=>new Request('http://127.0.0.1:3000/api/agents',{method,headers:{host:'127.0.0.1:3000',cookie:`career_agent_session=${token}`,...extra}});
test('local credentials are encrypted, private, reusable and repaired after revocation',()=>{
 const result=c.provisionLocalCredential('dot');assert.equal(result.replaced,true);assert.equal(result.token,undefined);
 const disk=readFileSync(result.path,'utf8');const token=unseal(JSON.parse(disk).sealed).token;
 assert.equal(disk.includes(token),false);assert.equal(statSync(result.path).mode&0o777,0o600);
 assert.equal(c.provisionLocalCredential('dot').replaced,false);assert.equal(c.localCredentialConfigured('dot'),true);
 assert.equal(p.agentAuth(request('', 'GET',{authorization:`Bearer ${token}`})),'dot');
 d.removeSetting('agent_token:dot');assert.equal(c.localCredentialConfigured('dot'),false);
 assert.equal(c.provisionLocalCredential('dot').replaced,true);
 assert.throws(()=>p.agentAuth(request('', 'GET',{authorization:`Bearer ${token}`})),/revoked/);
});
test('browser session enforces origin, ends on logout and actor-wide revoke; bearer identity wins',()=>{
 const session=c.startBrowserSession('muse');assert.equal(p.agentAuth(request(session)),'muse');
 assert.throws(()=>p.agentAuth(request(session,'POST')),/origin/);
 assert.equal(p.agentAuth(request(session,'POST',{origin:process.env.APP_URL})),'muse');
 const dot=p.issueToken('dot');assert.equal(p.agentAuth(request(session,'GET',{authorization:`Bearer ${dot}`})),'dot');
 assert.throws(()=>p.agentAuth(request(session,'GET',{authorization:'Bearer invalid'})),/revoked/);
 c.endBrowserSession(request(session));assert.equal(c.browserSessionActor(request(session)),null);
 const next=c.startBrowserSession('muse');c.revokeBrowserSessions('muse');assert.equal(c.browserSessionActor(request(next)),null);
});
test('browser session expires after twelve hours',()=>{
 const token=c.startBrowserSession('muse'),now=Date.now;try{Date.now=()=>now()+13*3600000;assert.equal(c.browserSessionActor(request(token)),null);}finally{Date.now=now;}
});
test.after(()=>{d.db().close();process.chdir(cwd);rmSync(dir,{recursive:true,force:true});});
