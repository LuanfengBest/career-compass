import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),dir=mkdtempSync(join(tmpdir(),'career-bulk-'));
process.env.CAREER_DB_PATH=join(dir,'test.sqlite');process.env.TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,15).toString('hex');
const {sendApprovedDrafts}=require('../.test-build/server/bulk-outreach.js'),p=require('../.test-build/server/portal.js'),d=require('../.test-build/server/database.js');
const approvals=[];
for(let i=0;i<3;i++){
 const c=p.submitAgent('dot',{eventId:`c${i}`,type:'contact',contact:{externalId:`c${i}`,name:`Fixture ${i}`,company:'Example',title:'Analyst',relationship:'Fixture',evidence:'Fixture only',source:'https://example.com',linkedin:`https://www.linkedin.com/in/fixture-${i}`,email:`fixture${i}@example.com`}});
 const draft={id:`d${i}`,contactId:c.contactId,channel:i===2?'linkedin':'email',author:'dot',subject:'Fixture',text:'Not sent',version:1,edited:false,status:'draft',updatedAt:new Date().toISOString(),recipient:`fixture${i}@example.com`};p.saveDraft(draft);approvals.push({id:draft.id,version:1,recipient:i===2?`https://www.linkedin.com/in/fixture-${i}`:draft.recipient});
}
test('bulk preflight rejects changed versions and recipients without any send; duplicate contact is rejected',async()=>{
 let calls=0;const transports={email:async()=>{calls++;},linkedin:()=>{calls++;}};
 await assert.rejects(()=>sendApprovedDrafts([approvals[0],{...approvals[1],version:2}],transports),/changed/);
 await assert.rejects(()=>sendApprovedDrafts([{...approvals[0],recipient:'wrong@example.com'}],transports),/recipient/);
 await assert.rejects(()=>sendApprovedDrafts([approvals[0],approvals[0]],transports),/one message/);
 assert.equal(calls,0);
});
test('bulk stops on error, labels remaining as not attempted and never automatically retries',async()=>{
 const called=[];const result=await sendApprovedDrafts(approvals,{email:async(id)=>{called.push(id);if(id==='d1')throw Error('fixture timeout');},linkedin:()=>{throw Error('Should not queue');}});
 assert.deepEqual(called,['d0','d1']);assert.deepEqual(result.results.map(r=>r.status),['sent','attention','not_attempted']);
});
test('bulk distinguishes Gmail acceptance from LinkedIn queued status',async()=>{
 const result=await sendApprovedDrafts([approvals[0],approvals[2]],{email:async()=>{},linkedin:()=>({ok:true})});assert.deepEqual(result.results.map(r=>r.status),['sent','queued']);
});
test.after(()=>{d.db().close();rmSync(dir,{recursive:true,force:true});});
