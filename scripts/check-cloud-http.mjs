// Uses disposable SQLite and generated credentials. Does not read the real workspace.
import {spawn} from 'node:child_process';
import {request as httpRequest} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,scryptSync} from 'node:crypto';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
const folder=mkdtempSync(join(tmpdir(),'career-cloud-check-'));
const password=randomBytes(24).toString('hex'),salt=randomBytes(16).toString('hex');
const origin='https://career.example.com',base='http://127.0.0.1:3101';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3101'],{
 env:{...process.env,DEPLOYMENT_MODE:'cloud',APP_URL:origin,CAREER_DB_PATH:join(folder,'test.sqlite'),OWNER_SESSION_SECRET:randomBytes(32).toString('hex'),OWNER_PASSWORD_HASH:`${salt}:${scryptSync(password,salt,64).toString('hex')}`,TOKEN_ENCRYPTION_KEY:randomBytes(32).toString('hex')},stdio:'ignore'
});
const request=(path,options={})=>new Promise((resolve,reject)=>{
 const req=httpRequest(base+path,{method:options.method||'GET',headers:{host:'career.example.com',...options.headers}},res=>{
  const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{
   const headers=new Headers();for(const [key,value] of Object.entries(res.headers)){if(Array.isArray(value))for(const item of value)headers.append(key,item);else if(value)headers.set(key,value);}
   resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers}));
  });
 });req.on('error',reject);if(options.body)req.write(options.body);req.end();
});
try {
 let ready=false;
 for(let i=0;i<50;i++){if(server.exitCode!==null)throw Error('Cloud test server exited');try{if((await request('/api/health')).ok){ready=true;break;}}catch{}await delay(200);}
 assert.ok(ready,'Server starts');
 const homepage=await request('/');if(homepage.status!==307)console.log('Anonymous page diagnostic:',homepage.status,await homepage.text());assert.equal(homepage.status,307);
 assert.equal((await request('/login')).status,200);
 for(const path of ['/api/workspace','/api/data','/api/portal','/api/tasks','/api/integrations','/api/agent-session','/api/agents','/api/agents/tasks','/api/agents/guide','/api/agents/connection'])assert.equal((await request(path)).status,401,path);
 assert.equal((await request('/api/auth/login',{method:'POST',headers:{origin:'https://wrong.example','content-type':'application/json'},body:JSON.stringify({password})})).status,403);
 assert.equal((await request('/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({password:'wrong'})})).status,401);
 const login=await request('/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({password})});
 assert.equal(login.status,200);
 const setCookie=login.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/Secure/);
 const cookie=setCookie.split(';')[0];
 assert.equal((await request('/',{headers:{cookie}})).status,200);
 assert.equal((await request('/api/workspace',{headers:{cookie}})).status,200);
 assert.equal((await request('/api/agents/tasks',{headers:{cookie}})).status,401,'Owner is not automatically an agent');
 const pair=await request('/api/agent-session',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({actor:'dot'})});assert.equal(pair.status,200);
 const agentCookie=pair.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/api/agents/connection',{headers:{cookie:agentCookie}})).status,200);
 assert.equal((await request('/api/workspace',{headers:{cookie:agentCookie}})).status,401,'Agent session cannot access owner APIs');
 const logout=await request('/api/auth/logout',{method:'POST',headers:{cookie:`${cookie}; ${agentCookie}`,origin}});assert.equal(logout.status,200);
 assert.equal((await request('/api/agents/connection',{headers:{cookie:agentCookie}})).status,401,'Logout revokes paired browser');
 console.log('Cloud HTTP checks passed: login, private pages/APIs, agent isolation, same-origin checks and logout.');
}finally{server.kill('SIGTERM');await Promise.race([new Promise(r=>server.once('exit',r)),delay(5000)]);if(server.exitCode===null)server.kill('SIGKILL');rmSync(folder,{recursive:true,force:true});}
