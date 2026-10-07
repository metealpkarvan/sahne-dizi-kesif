import { authHandler } from '../server/auth.js';

// Plain Vercel Functions do not rely on a framework's catch-all route parser.
// The rewrite supplies authPath; the local server keeps the original auth URL.
export async function authRouter(request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/auth/')) {
    const authPath = url.searchParams.get('authPath');
    if (url.pathname !== '/api/auth-router' || !authPath || authPath.length > 200 || !/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/.test(authPath)) {
      return Response.json({error:{code:'INVALID_AUTH_PATH',message:'Hesap işlemi bulunamadı.'}},{status:400,headers:{'Cache-Control':'no-store'}});
    }
    url.pathname = `/api/auth/${authPath}`;
    url.searchParams.delete('authPath');
    request = new Request(url, {
      method: request.method,
      headers: request.headers,
      signal: request.signal,
      ...(!['GET','HEAD'].includes(request.method) && request.body ? {body:request.body,duplex:'half'} : {}),
    });
  }
  const response = await authHandler(request);
  response.headers.set('Cache-Control','no-store');
  response.headers.set('X-Content-Type-Options','nosniff');
  return response;
}

export const GET = authRouter;
export const POST = authRouter;
