import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),dir=mkdtempSync(join(tmpdir(),'career-native-round-'));
process.env.CAREER_DB_PATH=join(dir,'test.sqlite');
process.env.TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,14).toString('hex');
const d=require('../.test-build/server/database.js'),s=require('../.test-build/server/task-store.js'),a=require('../.test-build/server/task-actions.js'),p=require('../.test-build/server/portal.js');
const begin=(actor,key,extra={})=>a.agentTaskAction(actor,{action:'begin_discovery_round',roundKey:key,title:'Native search fixture',brief:'User-defined full scope fixture; no website quota',channel:'auto',prepareApplications:true,...extra});
let batch;
test('empty Tasks never creates daily work; retired daily_tick cannot revive old saved defaults',()=>{
 d.setSetting('daily_routine',{enabled:true,jobsPerAgent:10,contactsPerAgent:10});
 assert.equal(s.taskSnapshot().tasks.length,0);
 assert.throws(()=>a.agentTaskAction('dot',{action:'daily_tick'}),e=>e.status===410);
 assert.equal(s.allTasks().length,0);
});
test('native discovery is agent-initiated, idempotent across actors and does not register or resume a worker',()=>{
 const first=begin('dot','fixture-day-am');batch=first.batch.id;
 assert.equal(first.created,true);assert.equal(first.batch.origin,'agent');
 const joined=begin('muse','fixture-day-am',{brief:'Should not replace original scope'});
 assert.equal(joined.created,false);assert.equal(joined.batch.id,batch);
 assert.equal(joined.batch.brief,first.batch.brief);
 assert.equal(begin('dot','fixture-day-am').created,false);
 assert.equal(s.allTasks().length,2);
 for(const actor of ['dot','muse'])assert.equal(d.readSetting(`worker_schedule:${actor}`),null);
 assert.equal('jobsPerAgent' in first.batch,false);
 assert.throws(()=>begin('dot','invalid',{channel:undefined}),/Explicit channel/);
 assert.equal(s.allBatches().length,1);
});
test('both native reports are required before deduplicated preparation; never automatically submit',()=>{
 for(const actor of ['dot','muse']){
  const queued=s.allTasks().find(t=>t.batchId===batch&&t.owner===actor);
  const t=a.agentTaskAction(actor,{action:'claim',taskId:queued.id,usesLocalBrowser:false}).task;
  p.submitAgent(actor,{eventId:`job-${actor}`,type:'opportunity',batchId:batch,taskId:t.id,claimToken:t.claimToken,job:{company:'Example',role:'Product Analyst New Grad',family:'DA',region:'United States',location:'NY',jdUrl:'https://example.com/careers/1',fit:'Fixture evidence',summary:'2027 full-time entry-level'}});
  a.agentTaskAction(actor,{action:'report',taskId:t.id,claimToken:t.claimToken,eventId:`finish-${actor}`,status:'completed',summary:'Fixture completed',coverage:'Fixture sources only'});
  if(actor==='dot')assert.equal(s.allTasks().some(t=>t.kind==='application_prepare'),false);
 }
 assert.equal(s.allBatches().find(b=>b.id===batch).status,'released');
 const prepared=s.allTasks().filter(t=>t.kind==='application_prepare');assert.equal(prepared.length,1);assert.equal(prepared[0].owner,'dot');
 assert.equal(s.allTasks().some(t=>t.kind==='application_submit'),false);
 assert.equal(d.readWorkspace().workspace.applications.length,0);
 const t=a.agentTaskAction('dot',{action:'claim',taskId:prepared[0].id,usesLocalBrowser:false}).task;
 a.agentTaskAction('dot',{action:'report',taskId:t.id,claimToken:t.claimToken,eventId:'prepare',status:'review',summary:'Form actually filled in fixture',answers:'Fixture answers',formState:'filled',evidenceUrl:'https://example.com/careers/1'});
 assert.equal(s.allTasks().find(x=>x.id===t.id).result.formState,'filled');assert.equal(d.readWorkspace().workspace.applications.length,0);
 assert.equal(begin('muse','fixture-day-am').batch.status,'released');
 assert.equal(s.allTasks().filter(t=>t.kind==='discover').length,2);
});
test('temporary batch edits update both queued tasks and reject silent changes after pickup',()=>{
 const next=a.userTaskAction({action:'create',requestId:'temporary',title:'Temporary search',brief:'Temporary scope',mode:'discover',channel:'email',prepareApplications:false});
 const b=s.allBatches().find(x=>x.id===next.batchId);
 a.userTaskAction({action:'edit_batch',batchId:b.id,version:b.version,brief:'Updated full-scope fixture'});
 const tasks=s.allTasks().filter(t=>t.batchId===b.id);assert.equal(tasks.every(t=>t.input.brief==='Updated full-scope fixture'),true);
 a.agentTaskAction(tasks[0].owner,{action:'claim',taskId:tasks[0].id,usesLocalBrowser:false});
 assert.throws(()=>a.userTaskAction({action:'edit_batch',batchId:b.id,version:b.version+1,brief:'Too late'}),/already started/);
});
test.after(()=>{d.db().close();rmSync(dir,{recursive:true,force:true});});
