// Local transport only: never prints credentials or accepts an arbitrary network destination.
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDecipheriv} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [actor,command,file]=process.argv.slice(2);
try {
 if(!['dot','muse'].includes(actor))throw Error('Usage: node scripts/agent-client.mjs dot|muse check|tasks|context|guide|task-action|report [request.json]');
 process.loadEnvFile(resolve(root,'.env.local'));
 const record=JSON.parse(readFileSync(resolve(root,'.data/agent-credentials',`${actor}.json`),'utf8'));
 const [iv,tag,encrypted]=record.sealed.split('.').map(s=>Buffer.from(s,'base64url'));
 const decipher=createDecipheriv('aes-256-gcm',Buffer.from(process.env.TOKEN_ENCRYPTION_KEY||'','hex'),iv);decipher.setAuthTag(tag);
 const credential=JSON.parse(Buffer.concat([decipher.update(encrypted),decipher.final()]).toString());
 if(credential.actor!==actor)throw Error('Wrong credential identity.');
 const base=new URL(credential.origin);if(base.protocol!=='http:'||!['127.0.0.1','localhost'].includes(base.hostname)||base.username||base.password)throw Error('Only the configured local portal is allowed.');
 const routes={check:'/api/agents/connection',tasks:'/api/agents/tasks',context:'/api/agents',guide:'/api/agents/guide','task-action':'/api/agents/tasks',report:'/api/agents'};
 if(!routes[command])throw Error('Unknown command.');
 const write=['task-action','report'].includes(command);const body=write?JSON.stringify(JSON.parse(readFileSync(resolve(file||''),'utf8'))):undefined;
 const response=await fetch(new URL(routes[command],base),{method:write?'POST':'GET',headers:{Authorization:`Bearer ${credential.token}`,...(write?{'Content-Type':'application/json'}:{})},body,redirect:'error',signal:AbortSignal.timeout(120000)});
 const value=await response.json();if(!response.ok)throw Error(`Portal returned ${response.status}: ${value.error||'Request rejected'}`);
 console.log(JSON.stringify(value,null,2));
} catch(e){const message=e instanceof Error?e.message:'Request failed';console.error(message.includes('ENOENT')?'Local credential or request file is missing. Open Agents → Prepare local connection.':message.includes('authenticate')?'Local credential cannot be decrypted; prepare the connection again.':message);process.exitCode=1;}
