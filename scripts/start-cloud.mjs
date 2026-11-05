import {spawn} from 'node:child_process';
import {isAbsolute, dirname} from 'node:path';
import {mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
process.env.DEPLOYMENT_MODE='cloud';
if(!process.env.APP_URL && process.env.RAILWAY_PUBLIC_DOMAIN)process.env.APP_URL=`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
const {appOrigin}=require('../.worker-build/server/http.js');
try {
 appOrigin();
 if(!/^[a-f0-9]{64}$/i.test(process.env.TOKEN_ENCRYPTION_KEY||''))throw Error('TOKEN_ENCRYPTION_KEY must be 64 hex characters.');
 if(!process.env.CAREER_DB_PATH || !isAbsolute(process.env.CAREER_DB_PATH))throw Error('CAREER_DB_PATH must point to an absolute path on a persistent volume.');
 mkdirSync(dirname(process.env.CAREER_DB_PATH),{recursive:true,mode:0o700});
} catch(e) {console.error(e.message);process.exit(1);}
const children=[spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port',process.env.PORT||'3000'],{stdio:'inherit'}),spawn(process.execPath,['scripts/sync-worker.mjs'],{stdio:'inherit'})];
let stopping=false;
function stop(code){if(stopping)return;stopping=true;for(const c of children)c.kill('SIGTERM');setTimeout(()=>{for(const c of children)c.kill('SIGKILL');process.exit(code)},8000).unref();Promise.all(children.map(c=>c.exitCode!==null?Promise.resolve():new Promise(r=>c.once('exit',r)))).then(()=>process.exit(code));}
for(const c of children){c.on('error',()=>stop(1));c.on('exit',code=>{if(!stopping)stop(code||1)});}
process.on('SIGINT',()=>stop(0));process.on('SIGTERM',()=>stop(0));
