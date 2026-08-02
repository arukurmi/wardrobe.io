import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { blockTraversal } from '../src/lib/staticGuard.js';

function run(reqPath: string) {
  const req = { path: reqPath } as Request;
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status } as unknown as Response;
  const next = vi.fn();
  blockTraversal(req, res, next);
  return { status, json, next };
}

describe('blockTraversal', () => {
  it('passes normal data paths through', () => {
    const { next, status } = run('/pieces/V1StGXR8_Z5j.webp');
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it('400s a "\\.\\." traversal segment', () => {
    const { next, status, json } = run('/pieces/../../etc/passwd');
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: 'bad path' });
  });

  it('400s a percent-encoded traversal segment', () => {
    const { next, status } = run('/%2e%2e/secret');
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
  });

  it('400s a null byte', () => {
    const { next, status } = run('/pieces/a\0.webp');
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
  });

  it('400s malformed percent-encoding', () => {
    const { next, status } = run('/pieces/%E0%A4%A.webp');
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
  });

  it('does not flag a "\\.\\." embedded inside a filename', () => {
    const { next, status } = run('/pieces/a..b.webp');
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });
});
