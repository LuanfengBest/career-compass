import {appOrigin, body, failure, HttpError, json} from '../../../lib/server/http';
import {cloudMode, createOwnerSession, ownerCookie, passwordMatches} from '../../../lib/server/owner-auth';
import {db} from '../../../lib/server/database';
export const runtime='nodejs';
export async function POST(req: Request) {
  try {
    const origin=appOrigin();
    if (!cloudMode()) throw new HttpError(400,'Local mode does not require this login.');
    if (req.headers.get('host')!==new URL(origin).host || req.headers.get('origin')!==origin || req.headers.get('sec-fetch-site')==='cross-site') throw new HttpError(403,'Same-origin login required.');
    const input=await body(req) as {password?:unknown};
    if (!input || typeof input.password!=='string' || input.password.length>1024) throw new HttpError(400,'Enter your password.');
    const store=db();
    store.exec('CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY CHECK(id=1), attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL)');
    const now=Date.now();
    store.prepare('INSERT INTO login_attempts VALUES (1,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END, reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END').run(now+15*60000,now,now,now+15*60000);
    const limit=store.prepare('SELECT attempts FROM login_attempts WHERE id=1').get()!;
    if(Number(limit.attempts)>10)throw new HttpError(429,'Too many attempts. Try again in 15 minutes.');
    if (!passwordMatches(input.password)) throw new HttpError(401,'Incorrect password.');
    store.prepare('DELETE FROM login_attempts WHERE id=1').run();
    const result=json({ok:true});
    result.headers.set('Set-Cookie',`${ownerCookie}=${createOwnerSession()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`);
    return result;
  } catch(e) {return failure(e);}
}
