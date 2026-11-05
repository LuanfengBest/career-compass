import {db,readWorkspace,writeWorkspace} from './database';
import type {Job} from '../model';
export function archivedJobs():Job[]{return db().prepare('SELECT body FROM archived_jobs ORDER BY archived_at DESC,id').all().map(r=>JSON.parse(String(r.body)));}
// Only legacy collector records; never archive agent/manual records or real application evidence.
export function archiveLegacyJobs(){
 const d=db();d.exec('BEGIN IMMEDIATE');
 try{
  const {workspace:w,revision}=readWorkspace();
  const protectedIds=new Set(w.applications.map(a=>a.jobId));
  // Active execution always protects the current working set.
  const hasTasks=d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='execution_tasks'").get();
  if(hasTasks&&Number(d.prepare("SELECT count(*) AS n FROM execution_tasks").get()!.n))throw new Error('Task history exists; review job references before archiving.');
  const legacy=w.jobs.filter(j=>j.sourceId&&!j.discoveredBy?.length&&!protectedIds.has(j.id));
  const ids=new Set(legacy.map(j=>j.id));
  const insert=d.prepare('INSERT OR IGNORE INTO archived_jobs VALUES (?,?,?,?)');
  const at=new Date().toISOString();
  for(const j of legacy)insert.run(j.id,JSON.stringify(j),at,'Legacy website feed; agent-only discovery enabled');
  w.jobs=w.jobs.filter(j=>!ids.has(j.id));
  // Contact links remain evidence: archived jobs retain the same stable IDs.
  if(legacy.length&&!writeWorkspace(w,revision))throw new Error('Workspace revision changed');
  d.exec('DELETE FROM leads');
  d.exec('COMMIT');return{archived:legacy.length,remaining:w.jobs.length,contacts:w.contacts.length,applications:w.applications.length};
 }catch(e){d.exec('ROLLBACK');throw e;}
}
