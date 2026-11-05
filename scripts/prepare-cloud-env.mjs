// Generates private deployment inputs locally; never prints secret values.
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {randomBytes,scryptSync} from 'node:crypto';
import {parseEnv} from 'node:util';
const folder='.data/deploy';mkdirSync(folder,{recursive:true,mode:0o700});
const file=`${folder}/railway.env`;
if(existsSync(file)){console.log(`Existing private configuration retained: ${file}`);process.exit(0);}
const existing=existsSync('.env.local')?parseEnv(readFileSync('.env.local','utf8')):{};
const password=randomBytes(24).toString('base64url'),salt=randomBytes(16).toString('hex');
const env={DEPLOYMENT_MODE:'cloud',CAREER_DB_PATH:'/data/career-compass.sqlite',TOKEN_ENCRYPTION_KEY:existing.TOKEN_ENCRYPTION_KEY||randomBytes(32).toString('hex'),OWNER_PASSWORD_HASH:`${salt}:${scryptSync(password,salt,64).toString('hex')}`,OWNER_SESSION_SECRET:randomBytes(32).toString('hex')};
for(const key of ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GMAIL_ACCOUNT_EMAIL'])if(existing[key])env[key]=existing[key];
writeFileSync(file,Object.entries(env).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
writeFileSync(`${folder}/workspace-login.txt`,`Private website login password:\n${password}\n\nDo not commit this file or paste this password into chat.\n`,{mode:0o600,flag:'wx'});
console.log(`Private deployment env: ${file}\nPrivate login details: ${folder}/workspace-login.txt\nNo secrets were printed. APP_URL is supplied by the Railway domain at startup.`);
