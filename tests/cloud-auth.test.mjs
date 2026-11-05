import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const a=require('../.test-build/server/owner-auth.js'),h=require('../.test-build/server/http.js');
process.env.DEPLOYMENT_MODE='cloud';process.env.APP_URL='https://career.example.com';
const request=(path='/',headers={})=>new Request(`https://career.example.com${path}`,{headers:{host:'career.example.com',...headers}});
test('cloud access fails closed without valid owner secrets and HTTPS',()=>{
 assert.throws(()=>h.appOrigin(),/HTTPS/);
 process.env.OWNER_SESSION_SECRET='7'.repeat(64);
 process.env.OWNER_PASSWORD_HASH=a.hashPassword('fixture-password-not-real');
 assert.equal(h.appOrigin(),'https://career.example.com');
 process.env.APP_URL='http://career.example.com';assert.throws(()=>h.appOrigin(),/HTTPS/);
 process.env.APP_URL='https://career.example.com/';
});
test('password check and signed owner sessions reject forgery, expiry and password rotation',()=>{
 assert.equal(a.passwordMatches('wrong'),false);assert.equal(a.passwordMatches('fixture-password-not-real'),true);
 const now=Date.now(),token=a.createOwnerSession(now),headers={cookie:`${a.ownerCookie}=${token}`};
 assert.equal(a.ownerAuthenticated(request('/',headers),now),true);
 assert.equal(a.ownerAuthenticated(request('/',headers),now+12*3600000),false);
 assert.equal(a.ownerAuthenticated(request('/',{cookie:`${a.ownerCookie}=${token.slice(0,-1)}${token.endsWith('a')?'b':'a'}`}),now),false);
 process.env.OWNER_PASSWORD_HASH=a.hashPassword('rotated-fixture');assert.equal(a.ownerAuthenticated(request('/',headers),now),false);
});
test('private API data requires owner login; origin and host checks still apply',()=>{
 for(const path of ['/api/workspace','/api/data','/api/portal','/api/tasks','/api/gmail/events','/api/agent-session']){
  assert.throws(()=>h.guard(request(path)),e=>e.status===401);
 }
 const cookie=`${a.ownerCookie}=${a.createOwnerSession()}`;
 assert.doesNotThrow(()=>h.guard(request('/api/workspace',{cookie})));
 assert.doesNotThrow(()=>h.guard(request('/api/workspace',{cookie,origin:'https://career.example.com'}),true));
 assert.throws(()=>h.guard(request('/api/workspace',{cookie,origin:'https://evil.example'}),true),e=>e.status===403);
 assert.throws(()=>h.guard(request('/api/workspace',{cookie,host:'evil.example'})),e=>e.status===403);
 assert.throws(()=>h.guard(request('/api/workspace',{cookie,'sec-fetch-site':'cross-site'})),e=>e.status===403);
 // Only explicitly agent-authenticated handlers can pass the owner guard.
 assert.equal(a.agentApiPath('/api/agents/tasks'),true);assert.equal(a.agentApiPath('/api/agents/other'),false);
 assert.equal(a.agentApiPath('/api/agent-session'),false);
});
