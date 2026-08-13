import { networkInterfaces } from 'node:os';

const unique = (values) => [...new Set(values.filter(Boolean))];

export function getAccessInfo(req, { interfaces = networkInterfaces(), publicUrl = process.env.PUBLIC_URL || '' } = {}) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto === 'https' ? 'https' : 'http';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  const portMatch = host.match(/:(\d+)$/);
  const port = portMatch ? `:${portMatch[1]}` : '';
  const requestOrigin = `${protocol}://${host}`;
  const localUrls = Object.values(interfaces).flat().filter((entry) => entry?.family === 'IPv4' && !entry.internal)
    .map((entry) => `${protocol}://${entry.address}${port}`);
  let configured = '';
  try {
    if (publicUrl) configured = new URL(publicUrl).origin;
  } catch {
    configured = '';
  }
  const urls = unique([configured, requestOrigin, ...localUrls]);
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  return { primary: configured || (localHost ? localUrls[0] : requestOrigin) || requestOrigin, urls };
}
