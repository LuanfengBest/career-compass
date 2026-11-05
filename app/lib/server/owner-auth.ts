import {createHmac, randomBytes, scryptSync, timingSafeEqual} from 'node:crypto';

export const ownerCookie = 'career_owner';
export const cloudMode = () => process.env.DEPLOYMENT_MODE === 'cloud';
export function cloudAuthConfigured() {
  return /^[a-f0-9]{64}$/i.test(process.env.OWNER_SESSION_SECRET || '') &&
    /^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(process.env.OWNER_PASSWORD_HASH || '');
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password: string) {
  if (!cloudAuthConfigured() || password.length > 1024) return false;
  const [salt, expected] = process.env.OWNER_PASSWORD_HASH!.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(expected, 'hex'));
}
function signature(payload: string) {
  return createHmac('sha256', process.env.OWNER_SESSION_SECRET!)
    .update(`${process.env.APP_URL}\n${process.env.OWNER_PASSWORD_HASH}\n${payload}`).digest('hex');
}
export function createOwnerSession(now = Date.now()) {
  if (!cloudAuthConfigured()) throw new Error('Cloud owner authentication is not configured.');
  const payload = Buffer.from(JSON.stringify({expires: now + 12*3600000, nonce: randomBytes(16).toString('hex')})).toString('base64url');
  return `${payload}.${signature(payload)}`;
}
export function ownerAuthenticated(req: Request, now = Date.now()) {
  if (!cloudAuthConfigured()) return false;
  const token = req.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${ownerCookie}=`))?.slice(ownerCookie.length+1);
  if (!token || token.length > 512) return false;
  const [payload, mac, extra] = token.split('.');
  if (extra || !/^[a-f0-9]{64}$/.test(mac || '')) return false;
  if (!timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(signature(payload),'hex'))) return false;
  try {
    const value = JSON.parse(Buffer.from(payload,'base64url').toString());
    return Number.isSafeInteger(value.expires) && value.expires > now && value.expires <= now + 12*3600000;
  } catch {return false;}
}
// Only these handlers perform their own agent authentication before reading data.
export function agentApiPath(path: string) {
  return ['/api/agents','/api/agents/tasks','/api/agents/connection','/api/agents/guide'].includes(path);
}
