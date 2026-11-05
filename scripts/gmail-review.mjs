// Local, read-only Gmail audit. Run after `npx tsc -p tsconfig.test.json`.
// Credentials are loaded by Node's --env-file; never printed or exported.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { accessToken, gmailApi } = require('../.test-build/server/gmail.js');
const { readWorkspace } = require('../.test-build/server/database.js');
const { mailBody } = require('../.test-build/server/mail-content.js');
if (readWorkspace().workspace.emailPaused) throw new Error('Gmail reads are paused.');
const dir = '.data/gmail-review';
mkdirSync(dir, { recursive: true, mode: 0o700 });
const save = (name, value) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(value), { mode: 0o600 });
const load = (name) => existsSync(`${dir}/${name}.json`) ? JSON.parse(readFileSync(`${dir}/${name}.json`, 'utf8')) : null;
const mode = process.argv[2] || 'index';
const token = await accessToken();
let state = load('index') || { after: Math.floor(Date.now()/1000)-30*86400, before: Math.floor(Date.now()/1000), ids: [], metadata: {}, listed: false };
if (mode === 'index') {
  while (!state.listed) {
    const params = new URLSearchParams({q:`after:${state.after} before:${state.before} -in:drafts`, maxResults:'100'});
    if(state.pageToken) params.set('pageToken',state.pageToken);
    const p = await gmailApi(`messages?${params}`,token);
    state.ids=[...new Set([...state.ids,...(p.messages||[]).map(x=>x.id)])];
    state.pageToken=p.nextPageToken; state.listed=!p.nextPageToken; save('index',state);
  }
  console.log(JSON.stringify({listed:state.ids.length, existingMetadata:Object.keys(state.metadata).length, after:new Date(state.after*1000).toISOString(), before:new Date(state.before*1000).toISOString()}));
  const pending=state.ids.filter(id=>!state.metadata[id]);
  // Gmail's documented batch endpoint; inner requests are GET only.
  for (let i=0;i<pending.length;i+=10) {
    if(readWorkspace().workspace.emailPaused)throw new Error('Gmail reads paused.');
    const ids=pending.slice(i,i+10), boundary='career_compass_read_batch';
    const p=new URLSearchParams({format:'metadata'});
    for(const h of ['Subject','From','To','Date','List-ID','Message-ID'])p.append('metadataHeaders',h);
    const body=ids.map(id=>`--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <${id}>\r\n\r\nGET /gmail/v1/users/me/messages/${id}?${p} HTTP/1.1\r\n\r\n`).join('')+`--${boundary}--\r\n`;
    const response=await fetch('https://gmail.googleapis.com/batch/gmail/v1',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':`multipart/mixed; boundary=${boundary}`},body,signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw new Error(`Batch HTTP ${response.status}`);
    const contentType=response.headers.get('content-type')||'';
    const splitBoundary=contentType.match(/boundary="?([^"; ]+)/)?.[1];
    if(!splitBoundary)throw new Error('Missing batch boundary');
    let failed=false;
    for(const part of (await response.text()).split('--'+splitBoundary)) {
      const id=part.match(/Content-ID: <response-([a-f0-9]+)>/i)?.[1];
      if(!id)continue;
      const code=part.match(/HTTP\/1\.1 (\d+)/)?.[1];
      const jsonStart=part.indexOf('{');
      if(code==='200'&&jsonStart>=0)state.metadata[id]=JSON.parse(part.slice(jsonStart).trim());
      else if(code==='404')state.metadata[id]={id,unavailable:true};
      else { console.log(JSON.stringify({failedMessage:id,status:code})); failed=true; }
    }
    save('index',state);
    if(failed)throw new Error('Batch incomplete; checkpoint preserved.');
    console.log(JSON.stringify({metadata:Object.keys(state.metadata).length,total:state.ids.length}));
    await new Promise(r=>setTimeout(r,1000));
  }
  state.completedAt=new Date().toISOString();save('index',state);console.log('Metadata audit complete.');
} else if(mode==='read') {
  const ids=process.argv.slice(3);
  for(const id of ids) {
    if(!state.ids.includes(id))throw new Error('Message outside audited window.');
    if(load(id))continue;
    if(readWorkspace().workspace.emailPaused)throw new Error('Gmail reads paused.');
    const m=await gmailApi(`messages/${id}?format=full`,token);
    save(id,{message:m,text:mailBody(m.payload)||m.snippet||''});
    await new Promise(r=>setTimeout(r,250));
  }
  console.log(JSON.stringify({read:ids.length}));
} else throw new Error('Use index or read <message ids>.');
