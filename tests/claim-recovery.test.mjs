import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'cc-recovery-'));
process.env.CAREER_DB_PATH=join(dir,'test.sqlite');
const require=createRequire(import.meta.url),a=require('../.test-build/server/task-actions.js'),s=require('../.test-build/server/task-store.js'),d=require('../.test-build/server/database.js');
const queued=(kind='discover')=>{const t=s.newTask(kind,'muse','Recovery fixture',{});s.saveTask(t);return t;};
const claim=t=>a.agentTaskAction('muse',{action:'claim',taskId:t.id,usesLocalBrowser:true}).task;
const recover=t=>a.agentTaskAction('muse',{action:'recover_claim',taskId:t.id,version:t.version,stopPreviousContext:true}).task;
test('cross-tab recovery rotates a live claim atomically, retains browser lock and fences old clients',()=>{
 const old=claim(queued());
 assert.throws(()=>a.agentTaskAction('dot',{action:'recover_claim',taskId:old.id,version:old.version,stopPreviousContext:true}),/OWNER/);
 assert.throws(()=>a.agentTaskAction('muse',{action:'recover_claim',taskId:old.id,version:old.version}),/CHANGED/);
 const next=recover(old);
 assert.notEqual(next.claimToken,old.claimToken);assert.equal(next.id,old.id);assert.equal(next.owner,old.owner);assert.equal(next.browser,true);
 assert.equal(s.taskDb().prepare('SELECT task_id FROM browser_claims').get().task_id,next.id);
 assert.throws(()=>recover(old),/CHANGED/);
 assert.throws(()=>a.agentTaskAction('muse',{action:'heartbeat',eventId:'old-renew',taskId:old.id,claimToken:old.claimToken}),/CLAIM_TOKEN_MISMATCH/);
 assert.throws(()=>a.agentTaskAction('muse',{action:'report',eventId:'old-result',taskId:old.id,claimToken:old.claimToken,status:'blocked',summary:'stale context'}),/CLAIM_TOKEN_MISMATCH/);
 assert.equal(a.agentTaskAction('muse',{action:'heartbeat',eventId:'new-renew',taskId:next.id,claimToken:next.claimToken}).ok,true);
 assert.equal(s.publicTask(next).claimToken,undefined);
 a.agentTaskAction('muse',{action:'report',eventId:'new-result',taskId:next.id,claimToken:next.claimToken,status:'blocked',summary:'Fixture stop'});
 assert.throws(()=>recover(s.allTasks().find(t=>t.id===next.id)),/INACTIVE/);
});
test('recovery never revives expired claims or resumes external form/send/submit work',()=>{
 const old=claim(queued());old.leaseUntil=new Date(0).toISOString();s.saveTask(old);
 assert.throws(()=>recover(old),/INACTIVE/);
 assert.throws(()=>s.requireClaim('muse',old.id,old.claimToken),/CLAIM_EXPIRED/);
 for(const kind of ['application_prepare','application_submit','linkedin_send']){
  const t=queued(kind);t.status='claimed';t.claimToken='fixture';t.leaseUntil=new Date(Date.now()+600000).toISOString();s.saveTask(t);
  assert.throws(()=>recover(t),/EXTERNAL_WORK/);
  assert.equal(s.allTasks().find(x=>x.id===t.id).claimToken,'fixture');
 }
});
test.after(()=>{d.db().close();rmSync(dir,{recursive:true,force:true});});
