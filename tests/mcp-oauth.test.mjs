import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash,randomBytes} from 'node:crypto';
const require=createRequire(import.meta.url),dir=mkdtempSync(join(tmpdir(),'career-oauth-'));
process.env.CAREER_DB_PATH=join(dir,'test.sqlite');
process.env.DEPLOYMENT_MODE='cloud';process.env.APP_URL='https://career.example.com';
process.env.OWNER_SESSION_SECRET='7'.repeat(64);process.env.TOKEN_ENCRYPTION_KEY='6'.repeat(64);
const owner=require('../.test-build/server/owner-auth.js');
process.env.OWNER_PASSWORD_HASH=owner.hashPassword('fixture-only-password');
const o=require('../.test-build/server/mcp-oauth.js'),m=require('../.test-build/server/mcp-tools.js'),db=require('../.test-build/server/database.js'),a=require('../.test-build/server/task-actions.js'),s=require('../.test-build/server/task-store.js');
const resource=process.env.APP_URL+'/mcp',redirect='https://chatgpt.com/connector_platform_oauth_redirect';
const params=v=>new URLSearchParams(v);
const request=token=>new Request(resource,{headers:{authorization:`Bearer ${token}`}});
function begin(){
 const client=o.registerClient({redirect_uris:[redirect],token_endpoint_auth_method:'none'});
 const verifier=randomBytes(32).toString('base64url');
 const query=params({client_id:client.client_id,redirect_uri:redirect,response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),resource,scope:o.MCP_SCOPE,state:'test-state'});
 const auth=o.validateAuthorization(query),nonce=o.createConsent(auth,'owner-session');
 return {client,verifier,query,nonce};
}
function authorize(){const flow=begin();const target=new URL(o.finishConsent(flow.nonce,'owner-session',true));
 const exchange=params({grant_type:'authorization_code',client_id:flow.client.client_id,code:target.searchParams.get('code'),redirect_uri:redirect,code_verifier:flow.verifier,resource});
 return {...flow,exchange,target,tokens:o.exchangeToken(exchange)};
}
const refresh=f=>params({grant_type:'refresh_token',client_id:f.client.client_id,refresh_token:f.tokens.refresh_token,resource});
test('discovery metadata, callback allowlist and PKCE validation fail closed',()=>{
 assert.equal(o.oauthMetadata().authorization_response_iss_parameter_supported,true);
 assert.equal(o.resourceMetadata().resource,resource);
 for(const url of ['https://evil.test/','http://chatgpt.com/connector_platform_oauth_redirect',redirect+'?next=https://evil.test','https://chatgpt.com.evil.test/connector_platform_oauth_redirect','https://chatgpt.com/other'])assert.throws(()=>o.registerClient({redirect_uris:[url]}),/official ChatGPT/);
 const f=begin();
 for(const [key,value] of [['redirect_uri','https://evil.test'],['resource','https://evil.test/mcp'],['code_challenge_method','plain'],['scope','admin']]){const p=new URLSearchParams(f.query);p.set(key,value);assert.throws(()=>o.validateAuthorization(p));}
 const duplicate=new URLSearchParams(f.query);duplicate.append('client_id','other');assert.throws(()=>o.validateAuthorization(duplicate),/Duplicate/);
 assert.throws(()=>o.finishConsent(f.nonce,'different-owner',true),/another login/);
 const denied=new URL(o.finishConsent(f.nonce,'owner-session',false));assert.equal(denied.searchParams.get('error'),'access_denied');assert.equal(denied.searchParams.get('iss'),process.env.APP_URL);assert.equal(denied.searchParams.get('state'),'test-state');
 assert.throws(()=>o.finishConsent(f.nonce,'owner-session',true),/expired/);
});
test('authorization code is single use, PKCE bound and audience constrained',()=>{
 const f=begin(),url=new URL(o.finishConsent(f.nonce,'owner-session',true));
 const exchange=params({grant_type:'authorization_code',client_id:f.client.client_id,code:url.searchParams.get('code'),redirect_uri:redirect,code_verifier:'x'.repeat(43),resource});
 assert.throws(()=>o.exchangeToken(exchange),/PKCE/);
 exchange.set('code_verifier',f.verifier);exchange.set('resource','https://evil.test/mcp');assert.throws(()=>o.exchangeToken(exchange),/resource/);
 exchange.set('resource',resource);const tokens=o.exchangeToken(exchange);assert.equal(o.authenticateMcp(request(tokens.access_token)).actor,'dot');
 assert.throws(()=>o.exchangeToken(exchange),/already used/);assert.throws(()=>o.authenticateMcp(request(tokens.refresh_token)),/required/);
 assert.throws(()=>o.authenticateMcp(new Request(resource,{headers:{cookie:'career_owner='+owner.createOwnerSession()}})),/required/);
 assert.throws(()=>o.authenticateMcp(request('legacy-agent-token')),/required/);
 const bodies=db.db().prepare("SELECT body FROM mcp_oauth WHERE kind IN ('access','refresh','code')").all();
 assert.equal(JSON.stringify(bodies).includes(tokens.access_token),false);assert.equal(JSON.stringify(bodies).includes(tokens.refresh_token),false);
});
test('refresh rotation retains identity; replay revokes the entire grant',()=>{
 const f=authorize(),grant=o.authenticateMcp(request(f.tokens.access_token));
 const rotated=o.exchangeToken(refresh(f));assert.equal(o.authenticateMcp(request(rotated.access_token)).id,grant.id);
 assert.throws(()=>o.exchangeToken(refresh(f)),/replay/);
 assert.throws(()=>o.authenticateMcp(request(rotated.access_token)),/required/);
 assert.throws(()=>o.exchangeToken(params({...Object.fromEntries(refresh(f)),refresh_token:rotated.refresh_token})),/revoked/);
});
test('expiration, client binding, revocation and consent cookie isolation',()=>{
 const f=authorize(),other=begin();const bad=refresh(f);bad.set('client_id',other.client.client_id);assert.throws(()=>o.exchangeToken(bad),/Invalid refresh/);
 const now=Date.now;try{Date.now=()=>now()+3600001;assert.throws(()=>o.authenticateMcp(request(f.tokens.access_token)),/required/);const fresh=o.exchangeToken(refresh(f));assert.equal(o.authenticateMcp(request(fresh.access_token)).actor,'dot');o.revokeToken(params({token:fresh.refresh_token,client_id:f.client.client_id}));assert.throws(()=>o.authenticateMcp(request(fresh.access_token)),/required/);}finally{Date.now=now;}
 const {consentBinding}=require('../.test-build/server/oauth-http.js');assert.equal(consentBinding(new Request(resource,{headers:{cookie:'other=abc; career_owner=correct; extra=1'}})),'correct');
});
test('MCP server claims survive token refresh, hide secrets and preserve existing dedupe/ownership',async()=>{
 const f=authorize(),g=o.authenticateMcp(request(f.tokens.access_token));
 const batch=a.userTaskAction({action:'create',requestId:'mcp-pilot',title:'Fixture',brief:'Test scope',mode:'discover',channel:'email',prepareApplications:true,autoRelease:true}).batchId;
 const tasks=s.allTasks().filter(t=>t.batchId===batch),dot=tasks.find(t=>t.owner==='dot'),muse=tasks.find(t=>t.owner==='muse');
 assert.throws(()=>m.mcpTaskAction(g,{action:'claim',taskId:muse.id}),/queued/);
 assert.throws(()=>m.mcpTaskAction(g,{action:'claim',taskId:dot.id,usesLocalBrowser:true}),/Mac/);
 for(const action of ['approve','release','retry','cancel','send'])assert.throws(()=>m.mcpTaskAction(g,{action,taskId:dot.id}),/cannot approve/);
 const claimed=m.mcpTaskAction(g,{action:'claim',taskId:dot.id});assert.equal(claimed.task.claimToken,undefined);assert.ok(o.mcpClaim(g.id,dot.id).claimToken);
 const other=authorize(),g2=o.authenticateMcp(request(other.tokens.access_token));assert.throws(()=>m.mcpTaskAction(g2,{action:'heartbeat',taskId:dot.id,eventId:'different-grant'}),/connection first/);
 const refreshed=o.exchangeToken(refresh(f)),g3=o.authenticateMcp(request(refreshed.access_token));
 m.mcpTaskAction(g3,{action:'heartbeat',taskId:dot.id,eventId:'mcp-heartbeat'});
 const contact={externalId:'mcp-fixture',name:'Fixture Contact',company:'Fixture',title:'Analyst',relationship:'Test',evidence:'Fixture only',source:'https://example.com',linkedin:'https://www.linkedin.com/in/mcp-fixture',email:'fixture@example.com'};
 const payload={type:'contact',eventId:'mcp-contact',taskId:dot.id,actor:'muse',contact};
 const saved=await m.mcpSubmitReport(g3,payload);assert.equal(saved.ok,true);const again=await m.mcpSubmitReport(g3,payload);assert.equal(again.ok,true);
 const museClaim=a.agentTaskAction('muse',{action:'claim',taskId:muse.id,usesLocalBrowser:false}).task;
 require('../.test-build/server/portal.js').submitAgent('muse',{...payload,eventId:'muse-same-contact',taskId:muse.id,batchId:batch,claimToken:museClaim.claimToken});
 const people=db.readWorkspace().workspace.contacts;assert.equal(people.length,1);assert.deepEqual([...people[0].discoveredBy].sort(),['dot','muse']);
 m.mcpTaskAction(g3,{action:'report',taskId:dot.id,eventId:'mcp-completed',status:'completed',summary:'Fixture completed',coverage:'Fixture scope'});
 a.agentTaskAction('muse',{action:'report',taskId:muse.id,claimToken:museClaim.claimToken,eventId:'muse-completed',status:'completed',summary:'Fixture completed',coverage:'Fixture scope'});
 assert.ok(s.allTasks().some(t=>t.kind==='draft'&&t.owner==='dot'));
 o.revokeDotOAuth();assert.throws(()=>o.authenticateMcp(request(refreshed.access_token)),/required/);assert.throws(()=>o.mcpClaim(g.id,dot.id),/connection first/);
});
test('actual SDK transport initializes and exposes only scoped tools',async()=>{
 const f=authorize(),grant=o.authenticateMcp(request(f.tokens.access_token));
 const {WebStandardStreamableHTTPServerTransport}=await import('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js');
 const rpc=async(method,params={})=>{const server=m.createCareerMcp(grant),transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});await server.connect(transport);try{const req=new Request(resource,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const res=await transport.handleRequest(req);assert.equal(res.status,200);return await res.json();}finally{await server.close();}};
 const init=await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'fixture',version:'1'}});assert.equal(init.result.serverInfo.name,'career-compass');
 const listed=await rpc('tools/list');assert.equal(listed.result.tools.length,7);assert.equal(listed.result.tools.some(t=>t.name.includes('send')),false);
 const connection=await rpc('tools/call',{name:'career_connection',arguments:{}});assert.equal(JSON.parse(connection.result.content[0].text).actor,'dot');
 const denied=await rpc('tools/call',{name:'career_task_action',arguments:{payload:{action:'approve'}}});assert.equal(denied.result.isError,true);
});
test.after(()=>{db.db().close();rmSync(dir,{recursive:true,force:true});});
