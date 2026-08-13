import { describe, expect, it } from 'vitest';
import { getAccessInfo } from './accessInfo.mjs';

describe('getAccessInfo', () => {
  it('localhost access prefers a LAN URL for a scannable QR code', () => {
    const result = getAccessInfo({ headers: { host: 'localhost:4195' } }, { interfaces: { WiFi: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }] }, publicUrl: '' });
    expect(result.primary).toBe('http://192.168.1.20:4195');
    expect(result.urls).toContain('http://localhost:4195');
  });

  it('configured HTTPS public URL takes priority', () => {
    const result = getAccessInfo({ headers: { host: 'localhost:4173' } }, { interfaces: {}, publicUrl: 'https://sonae.example/app' });
    expect(result.primary).toBe('https://sonae.example');
  });
});
