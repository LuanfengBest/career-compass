import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
if(process.platform!=='darwin')throw Error('This optional helper is for macOS only.');
const root=resolve('.');
for(const file of ['.next/BUILD_ID','.worker-build/server/sync-worker.js','.env.local'])if(!existsSync(join(root,file)))throw Error(`Prepare ${file} before installing the service.`);
const label='com.careercompass.local',domain=`gui/${process.getuid()}`;
const folder=join(homedir(),'Library/LaunchAgents'),file=join(folder,`${label}.plist`),logs=join(root,'.data/logs');
mkdirSync(folder,{recursive:true});mkdirSync(logs,{recursive:true,mode:0o700});
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
writeFileSync(file,`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${escape(process.execPath)}</string><string>${escape(join(root,'scripts/start-local.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${escape(root)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/local/bin:/usr/bin:/bin</string><key>NODE_ENV</key><string>production</string><key>DEPLOYMENT_MODE</key><string>local</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${escape(join(logs,'local-service.log'))}</string>
<key>StandardErrorPath</key><string>${escape(join(logs,'local-service-error.log'))}</string>
</dict></plist>`,{mode:0o600});
spawnSync('launchctl',['bootout',`${domain}/${label}`],{stdio:'ignore'});
const result=spawnSync('launchctl',['bootstrap',domain,file],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
console.log(`Installed local website + read-only Gmail service: ${label}. No external agent schedule changed.`);
console.log(`Stop: launchctl bootout ${domain}/${label}`);
