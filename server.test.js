import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAppServer } from './server.mjs';

function get(port, path = '/', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, headers, agent: false }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('production app server request validation', () => {
  let root;
  let server;
  let port;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sonae-server-test-'));
    await writeFile(join(root, 'index.html'), '<!doctype html><title>fixture</title>', 'utf8');
    server = createAppServer({ root });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    port = server.address().port;
  });

  afterEach(async () => {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('returns 400 for malformed percent-encoding and remains available', async () => {
    const invalid = await get(port, '/%E0%A4%A');
    expect(invalid.status).toBe(400);

    const next = await get(port, '/');
    expect(next.status).toBe(200);
    expect(next.body).toContain('<title>fixture</title>');
  });

  it('returns 400 for an invalid Host header and remains available', async () => {
    const invalid = await get(port, '/', { Host: '[' });
    expect(invalid.status).toBe(400);

    const next = await get(port, '/');
    expect(next.status).toBe(200);
    expect(next.headers['content-security-policy']).toContain("img-src 'self' data: blob:");
    expect(next.body).toContain('<title>fixture</title>');
  });

  it('does not expose local application APIs when they are disabled for demo', async () => {
    await new Promise((resolve) => server.close(resolve));
    server = createAppServer({ root, appApiEnabled: false });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    port = server.address().port;

    const response = await get(port, '/api/access-info', { Accept: 'application/json' });

    expect(response.status).toBe(404);
    expect(response.body).toBe('Not found');
  });
});
