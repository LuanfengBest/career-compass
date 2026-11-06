import {NextResponse, type NextRequest} from 'next/server';
import {cloudMode, ownerAuthenticated, agentApiPath} from './app/lib/server/owner-auth';
import {appOrigin} from './app/lib/server/http';
import {oauthPublicPath} from './app/lib/oauth-paths';

export function proxy(req: NextRequest) {
  if (!cloudMode() || req.nextUrl.pathname === "/api/health") return NextResponse.next();
  try {
    const origin = appOrigin();
    if (req.headers.get('host') !== new URL(origin).host) return new NextResponse('Invalid host', {status:403});
    const path = req.nextUrl.pathname;
    if (path === '/login' || path === '/api/auth/login' || path === '/api/health') return NextResponse.next();
    // Agent handlers validate their own token or paired session; all other APIs and pages require owner login.
    if (agentApiPath(path) || oauthPublicPath(path) || ownerAuthenticated(req)) return NextResponse.next();
    if (path.startsWith('/api/')) return NextResponse.json({error:'Authentication required'},{status:401,headers:{'Cache-Control':'no-store'}});
    return NextResponse.redirect(new URL('/login',origin));
  } catch {
    return new NextResponse('Cloud access is not configured.',{status:503});
  }
}
export const config = {matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']};
