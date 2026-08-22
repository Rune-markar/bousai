import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { handleProductApi, handleProductImageApi } from './server/productLookup.mjs';
import { getAccessInfo } from './server/accessInfo.mjs';

const defaultRoot = resolve(process.env.APP_DIST_DIR || 'dist');
const defaultPort = Number(process.env.PORT || 4173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const firstHeaderValue = (value) => String(Array.isArray(value) ? value[0] : value || '').split(',')[0].trim();

function hasValidAuthority(value) {
  if (value === undefined) return true;
  const authority = firstHeaderValue(value);
  if (!authority || /[\s/?#\\]/.test(authority)) return false;
  try {
    const parsed = new URL(`http://${authority}/`);
    return Boolean(parsed.hostname) && !parsed.username && !parsed.password
      && parsed.pathname === '/' && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

function sendText(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(body);
}

export function createRequestHandler({ root = defaultRoot, appApiEnabled = true } = {}) {
  const staticRoot = resolve(root);

  return async function requestHandler(req, res) {
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob: https://images.openfoodfacts.org; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' https://world.openfoodfacts.org; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    try {
      if (!hasValidAuthority(req.headers.host) || !hasValidAuthority(req.headers['x-forwarded-host'])) {
        sendText(res, 400, 'Bad request');
        return;
      }

      let requestUrl;
      let pathname;
      try {
        requestUrl = new URL(req.url || '/', 'http://localhost');
        pathname = decodeURIComponent(requestUrl.pathname);
      } catch {
        sendText(res, 400, 'Bad request');
        return;
      }
      if (pathname.includes('\0')) {
        sendText(res, 400, 'Bad request');
        return;
      }

      const apiMatch = appApiEnabled && pathname.match(/^\/api\/products\/([^/]+)$/);
      if (apiMatch && req.method === 'GET') return await handleProductApi(req, res, apiMatch[1]);
      if (appApiEnabled && pathname === '/api/product-image' && req.method === 'GET') return await handleProductImageApi(req, res, requestUrl.searchParams.get('url') || '');
      if (appApiEnabled && pathname === '/api/access-info' && req.method === 'GET') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(getAccessInfo(req)));
        return;
      }

      const requested = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
      let file = resolve(staticRoot, `.${requested}`);
      const outsideRoot = relative(staticRoot, file).startsWith('..');
      if (outsideRoot) {
        sendText(res, 403, 'Forbidden');
        return;
      }
      if (!existsSync(file) || statSync(file).isDirectory()) {
        if (pathname === '/' || (req.headers.accept || '').includes('text/html')) file = join(staticRoot, 'index.html');
        else {
          sendText(res, 404, 'Not found');
          return;
        }
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const stream = createReadStream(file);
      stream.on('error', () => {
        if (!res.headersSent) sendText(res, 500, 'Internal server error');
        else res.destroy();
      });
      stream.pipe(res);
    } catch (error) {
      if (res.writableEnded) return;
      console.error('Request failed', error);
      if (!res.headersSent) sendText(res, 500, 'Internal server error');
      else res.destroy();
    }
  };
}

export function createAppServer(options) {
  return createServer(createRequestHandler(options));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  if (!existsSync(join(defaultRoot, 'index.html'))) {
    console.error(`${defaultRoot} がありません。対応する環境を先にビルドしてください。`);
    process.exit(1);
  }
  const appApiEnabled = process.env.APP_API_ENABLED !== 'false';
  createAppServer({ root: defaultRoot, appApiEnabled }).listen(defaultPort, '0.0.0.0', () => console.log(`そなえメモ (${process.env.APP_ENVIRONMENT || 'local'}): http://localhost:${defaultPort}`));
}
