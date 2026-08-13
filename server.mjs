import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { handleProductApi, handleProductImageApi } from './server/productLookup.mjs';
import { getAccessInfo } from './server/accessInfo.mjs';

const root = resolve('dist');
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8' };

if (!existsSync(join(root, 'index.html'))) {
  console.error('dist がありません。先に npm run build を実行してください。');
  process.exit(1);
}

createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const apiMatch = requestUrl.pathname.match(/^\/api\/products\/([^/]+)$/);
  if (apiMatch && req.method === 'GET') return handleProductApi(req, res, decodeURIComponent(apiMatch[1]));
  if (requestUrl.pathname === '/api/product-image' && req.method === 'GET') return handleProductImageApi(req, res, requestUrl.searchParams.get('url') || '');
  if (requestUrl.pathname === '/api/access-info' && req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(getAccessInfo(req)));
    return;
  }

  const requested = normalize(decodeURIComponent(requestUrl.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = resolve(root, `.${requested}`);
  const outsideRoot = relative(root, file).startsWith('..');
  if (outsideRoot) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if ((req.headers.accept || '').includes('text/html')) file = join(root, 'index.html');
    else {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0', () => console.log(`そなえメモ: http://localhost:${port}`));
