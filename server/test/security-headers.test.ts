import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb, type Db } from '../src/db.js';
import { createApp } from '../src/app.js';

let db: Db;
let app: ReturnType<typeof createApp>;
let dataDir: string;

beforeEach(() => {
  db = openDb(':memory:');
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wardrobe-sec-'));
  app = createApp(db, dataDir);
});

describe('security headers', () => {
  it('sets the core hardening headers on every response', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['permissions-policy']).toBe(
      'camera=(), microphone=(), geolocation=()'
    );
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
  });

  it('sets a CSP tuned for transformers.js (wasm + workers)', async () => {
    const res = await request(app).get('/api/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval' blob:");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("connect-src 'self' https: data: blob:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('does not leak x-powered-by', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('applies headers to error responses too', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  describe('opt-in HSTS', () => {
    afterEach(() => {
      delete process.env.WARDROBE_HSTS;
    });

    it('is off by default (plain-http localhost)', async () => {
      delete process.env.WARDROBE_HSTS;
      const res = await request(app).get('/api/health');
      expect(res.headers['strict-transport-security']).toBeUndefined();
    });

    it('is set when WARDROBE_HSTS=1', async () => {
      process.env.WARDROBE_HSTS = '1';
      const res = await request(app).get('/api/health');
      expect(res.headers['strict-transport-security']).toContain('max-age=');
    });
  });
});
