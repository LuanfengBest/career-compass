import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {backup} from 'node:sqlite';
const require=createRequire(import.meta.url);
const {db}=require('../.test-build/server/database.js');
const {archiveLegacyJobs}=require('../.test-build/server/archive-jobs.js');
mkdirSync('.data/backups',{recursive:true});
const file=`.data/backups/before-agent-only-${Date.now()}.sqlite`;
await backup(db(),file);
try{console.log(JSON.stringify({...archiveLegacyJobs(),backup:file}));}finally{db().close();}
