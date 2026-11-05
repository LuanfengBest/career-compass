import {spawn} from 'node:child_process';
// Local website/Gmail service only; does not schedule or start external agents.
const children=[
 spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3000'],{stdio:'inherit'}),
 spawn(process.execPath,['--env-file=.env.local','scripts/sync-worker.mjs'],{stdio:'inherit'})
];
let stopping=false;
function stop(code){if(stopping)return;stopping=true;for(const c of children)c.kill('SIGTERM');setTimeout(()=>{for(const c of children)c.kill('SIGKILL');process.exit(code)},8000).unref();Promise.all(children.map(c=>c.exitCode!==null?Promise.resolve():new Promise(r=>c.once('exit',r)))).then(()=>process.exit(code));}
for(const c of children){c.on('error',()=>stop(1));c.on('exit',code=>{if(!stopping)stop(code||1)});}
process.on('SIGINT',()=>stop(0));process.on('SIGTERM',()=>stop(0));
