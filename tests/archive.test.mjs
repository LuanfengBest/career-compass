import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),dir=mkdtempSync(join(tmpdir(),'career-archive-'));
process.env.CAREER_DB_PATH=join(dir,'test.sqlite');
const d=require('../.test-build/server/database.js'),a=require('../.test-build/server/archive-jobs.js'),{jobs}=require('../.test-build/demo.js');
test('archive removes legacy feeds, preserves agents, manual jobs and application links, and is idempotent',()=>{
 const {workspace:w,revision}=d.readWorkspace();
 w.jobs=[{...jobs[0],id:'old',sourceId:'feed'},{...jobs[0],id:'agent',sourceId:'feed',discoveredBy:['dot']},{...jobs[0],id:'manual'},{...jobs[0],id:'applied',sourceId:'feed'}];
 w.applications=[{jobId:'applied',stage:'Applied',origin:'Manual',updatedAt:new Date().toISOString(),appliedAt:'2026-11-05',notes:''}];
 assert.equal(d.writeWorkspace(w,revision),true);
 assert.equal(a.archiveLegacyJobs().archived,1);
 assert.deepEqual(d.readWorkspace().workspace.jobs.map(j=>j.id),['agent','manual','applied']);
 assert.equal(a.archivedJobs()[0].id,'old');assert.equal(a.archiveLegacyJobs().archived,0);
});
test.after(()=>{d.db().close();rmSync(dir,{recursive:true,force:true});});
