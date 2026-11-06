// Run after npm test && npm run build. Uses a separate database and loopback port.
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{hashPassword}=require('../.test-build/server/owner-auth.js');
const dir=mkdtempSync(join(tmpdir(),'career-mcp-http-')),port=Number(process.env.MCP_TEST_PORT||3109),base=`https://127.0.0.1:${port}`;
const password=randomBytes(24).toString('base64url');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,APP_URL:base,DEPLOYMENT_MODE:'cloud',CAREER_DB_PATH:join(dir,'fixture.sqlite'),OWNER_PASSWORD_HASH:hashPassword(password),OWNER_SESSION_SECRET:randomBytes(32).toString('hex'),TOKEN_ENCRYPTION_KEY:randomBytes(32).toString('hex')},stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',b=>{log+=b});child.stderr.on('data',b=>{log+=b});
const call=(path,init={})=>fetch(`http://127.0.0.1:${port}${path}`,{...init,redirect:'manual',headers:{host:new URL(base).host,...init.headers}});
const form=(path,values,headers={})=>call(path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(values).toString()});
try{
 for(let i=0;i<100;i++){if(log.includes('Ready in'))break;if(child.exitCode!==null)throw Error('Fixture server exited: '+log);await new Promise(r=>setTimeout(r,100));}
 assert.equal((await call('/api/portal')).status,401);
 const unauth=await call('/mcp');assert.equal(unauth.status,401);assert.match(unauth.headers.get('www-authenticate'),/oauth-protected-resource/);
 for(const path of ['/.well-known/oauth-authorization-server','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'])assert.equal((await call(path)).status,200);
 const redirect='https://chatgpt.com/connector_platform_oauth_redirect';
 const reg=await call('/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({redirect_uris:[redirect],client_name:'HTTP fixture'})});assert.equal(reg.status,201);const client=await reg.json();
 const verifier=randomBytes(32).toString('base64url'),resource=base+'/mcp';
 const authPath='/oauth/authorize?'+new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',resource,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),state:'fixture'});
 const start=await call(authPath);assert.equal(start.status,303);assert.ok(new URL(start.headers.get('location')).searchParams.get('returnTo').startsWith('/oauth/authorize?'));
 const login=await call('/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const consent=await call(authPath,{headers:{cookie}});assert.equal(consent.status,200);const html=await consent.text(),nonce=html.match(/name="consent" value="([^"]+)"/)[1];
 assert.equal((await form('/oauth/authorize',{consent:nonce,decision:'allow'},{cookie,origin:'https://evil.test'})).status,403);
 const accepted=await form('/oauth/authorize',{consent:nonce,decision:'allow'},{cookie,origin:base});assert.equal(accepted.status,303);const target=new URL(accepted.headers.get('location'));assert.equal(target.searchParams.get('state'),'fixture');assert.equal(target.searchParams.get('iss'),base);
 const exchange={grant_type:'authorization_code',client_id:client.client_id,redirect_uri:redirect,code:target.searchParams.get('code'),code_verifier:verifier,resource};
 const response=await form('/oauth/token',exchange);assert.equal(response.status,200);const token=await response.json();assert.equal((await form('/oauth/token',exchange)).status,400);
 const rpc=async(method,params={},access=token.access_token)=>{const r=await call('/mcp',{method:'POST',headers:{authorization:`Bearer ${access}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});assert.equal(r.status,200);return r.json();};
 assert.equal((await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'HTTP fixture',version:'1'}})).result.serverInfo.name,'career-compass');
 assert.equal((await rpc('tools/list')).result.tools.length,7);
 assert.equal(JSON.parse((await rpc('tools/call',{name:'career_connection',arguments:{}})).result.content[0].text).actor,'dot');
 const fresh=await form('/oauth/token',{grant_type:'refresh_token',client_id:client.client_id,refresh_token:token.refresh_token,resource});assert.equal(fresh.status,200);const rotated=await fresh.json();await rpc('tools/list',{},rotated.access_token);
 assert.equal((await call('/api/portal',{headers:{authorization:`Bearer ${rotated.access_token}`}})).status,401);
 const revoked=await form('/oauth/revoke',{token:rotated.refresh_token,client_id:client.client_id});assert.equal(revoked.status,200);assert.equal((await call('/mcp',{headers:{authorization:`Bearer ${rotated.access_token}`}})).status,401);
 console.log('HTTP smoke passed: private routes, discovery, owner consent/CSRF, PKCE exchange/replay, MCP initialize/list/call, refresh, scope isolation, revoke. No real workspace data used.');
}finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill('SIGKILL');resolve()},5000).unref();});rmSync(dir,{recursive:true,force:true});}
