import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url),w=require('../.test-build/workbench.js');
const claim={id:'task-one',owner:'muse',kind:'discover',batchId:'batch-one',claimToken:'private-fixture',leaseUntil:new Date(Date.now()+600000).toISOString()};
test('workbench rejects legacy round-result envelopes with actionable format guidance',()=>{
 assert.throws(()=>w.prepareWorkbenchRequest('/api/agents',{eventId:'legacy',action:'result',jobs:{windowOutsideDiscoveries:[]}},claim,'muse'),/type:"opportunity"/);
 assert.throws(()=>w.prepareWorkbenchRequest('/api/agents',{eventId:'missing-type'},claim,'muse'),/Convert one record/);
 for(const action of ['complete','result',undefined])assert.throws(()=>w.prepareWorkbenchRequest('/api/agents/tasks',{action,eventId:'done'},claim,'muse'),/action:"report"/);
 assert.throws(()=>w.prepareDiscoveryCompletion(claim,'muse',{eventId:'done',summary:'',coverage:'checked'}),/summary/);
 assert.throws(()=>w.prepareDiscoveryCompletion({...claim,kind:'draft'},'muse',{eventId:'done',summary:'saved',coverage:'checked'}),/discovery claim/);
});
test('workbench attaches current claim privately and preserves record identity',()=>{
 const input={eventId:'record-one',type:'contact',contact:{name:'Fixture'}};
 const result=w.prepareWorkbenchRequest('/api/agents',input,claim,'muse');
 assert.equal(result.claimToken,claim.claimToken);assert.equal(result.taskId,claim.id);assert.equal(result.batchId,claim.batchId);assert.equal(result.eventId,input.eventId);
 assert.equal(input.claimToken,undefined);
 assert.deepEqual(w.readWorkbenchClaim(JSON.parse(JSON.stringify(claim))),claim);
 assert.equal(w.readWorkbenchClaim({...claim,claimToken:''}),null);
 assert.equal(w.readWorkbenchClaim({...claim,leaseUntil:'bad date'}),null);
});
test('workbench rejects conflicting IDs, old tokens, expired claims and wrong actors',()=>{
 for(const bad of [{taskId:'other'},{batchId:'other'},{claimToken:'old'}])assert.throws(()=>w.prepareWorkbenchRequest('/api/agents',{type:'opportunity',...bad},claim,'muse'));
 assert.throws(()=>w.prepareWorkbenchRequest('/api/agents',{type:'contact'},claim,'dot'));
 assert.throws(()=>w.prepareWorkbenchRequest('/api/agents/tasks',{action:'report'},null,'muse'));
 assert.throws(()=>w.prepareWorkbenchRequest('/api/agents',{type:'draft'},{...claim,leaseUntil:new Date(0).toISOString()},'muse'),/expired/);
 const unrelated={action:'register_worker',schedule:'fixture'};
 assert.deepEqual(w.prepareWorkbenchRequest('/api/agents/tasks',unrelated,claim,'muse'),unrelated);
 assert.equal(JSON.stringify(w.redactWorkbenchResponse({task:claim,nested:[{claimToken:'secret'}]})).includes('private-fixture'),false);
});
test('token-free UI records and heartbeat pass real server claim checks; duplicate delivery remains idempotent',()=>{
 const dir=mkdtempSync(join(tmpdir(),'cc-workbench-'));
 process.env.CAREER_DB_PATH=join(dir,'fixture.sqlite');
 const a=require('../.test-build/server/task-actions.js'),s=require('../.test-build/server/task-store.js'),p=require('../.test-build/server/portal.js'),db=require('../.test-build/server/database.js');
 try{
  const b=a.userTaskAction({action:'create',requestId:'workbench',title:'Fixture batch',brief:'Fixture scope',mode:'discover',channel:'email',prepareApplications:false});
  const queued=s.allTasks().find(t=>t.batchId===b.batchId&&t.owner==='muse');
  const claimed=a.agentTaskAction('muse',{action:'claim',taskId:queued.id,usesLocalBrowser:false}).task;
  const held=w.readWorkbenchClaim(claimed);
  assert.throws(()=>a.agentTaskAction('muse',{action:'complete',eventId:'bad-completion'}),/Unknown agent task action/);
  assert.throws(()=>a.agentTaskAction('muse',{action:'report',eventId:'missing-task',status:'completed'}),/CLAIM_TASK_ID_MISSING/);
  const heartbeat=w.prepareWorkbenchRequest('/api/agents/tasks',{action:'heartbeat',eventId:'hb1'},held,'muse');
  const renewed=a.agentTaskAction('muse',heartbeat);assert.ok(renewed.ok);
  const jobInput={eventId:'job-one',type:'opportunity',job:{company:'Example',role:'Data Science Graduate',family:'DS',region:'United States',location:'United States',jdUrl:'https://example.com/jobs/fixture',fit:'Fixture entry-level evidence; eligibility unconfirmed',summary:'Fixture JD evidence',deadline:'',sponsorship:{status:'Unknown',quote:''}}};
  const jobBody=w.prepareWorkbenchRequest('/api/agents',jobInput,held,'muse');
  const jobReceipt=p.submitAgent('muse',jobBody);
  assert.equal(jobReceipt.ok,true);assert.equal(p.submitAgent('muse',jobBody).jobId,jobReceipt.jobId);
  assert.equal(db.readWorkspace().workspace.jobs.length,1);
  const input={eventId:'contact-one',type:'contact',contact:{externalId:'fixture',name:'Fixture Person',company:'Example',title:'Analyst',relationship:'Fixture',evidence:'Fixture only',source:'https://example.com',linkedin:'https://www.linkedin.com/in/workbench-fixture',email:'fixture@example.com'}};
  const body=w.prepareWorkbenchRequest('/api/agents',input,held,'muse');
  const first=p.submitAgent('muse',body),again=p.submitAgent('muse',body);
  assert.equal(first.contactId,again.contactId);assert.equal(db.readWorkspace().workspace.contacts.length,1);
  const completion=w.prepareDiscoveryCompletion(held,'muse',{eventId:'done',summary:'Fixtures imported',coverage:'One job and one contact fixture'});
  const done=a.agentTaskAction('muse',completion);
  assert.deepEqual(a.agentTaskAction('muse',completion),done);
  assert.equal(s.allTasks().find(t=>t.id===queued.id).status,'completed');
  assert.equal(p.events().some(e=>e.kind==='sent'),false);
 }finally{db.db().close();rmSync(dir,{recursive:true,force:true});}
});
