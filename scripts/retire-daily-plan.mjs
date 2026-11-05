// Remove only the obsolete website-owned plan. Never register/resume native workers.
import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const file=resolve(process.env.CAREER_DB_PATH || '.data/career-compass.sqlite');
const db=new DatabaseSync(file);
try {
 db.exec('PRAGMA busy_timeout=5000');
 const old=db.prepare("SELECT key FROM settings WHERE key='daily_routine'").get();
 if(!old){console.log('No website daily plan remains.');}
 else {
  mkdirSync('.data/backups',{recursive:true,mode:0o700});
  const destination=`.data/backups/before-retire-daily-plan-${Date.now()}.sqlite`;
  await backup(db,destination);
  const result=db.prepare("DELETE FROM settings WHERE key='daily_routine'").run();
  console.log(JSON.stringify({removedSettings:result.changes,backup:destination,nativeSchedulesChanged:false,tasksChanged:false}));
 }
} finally {db.close();}
