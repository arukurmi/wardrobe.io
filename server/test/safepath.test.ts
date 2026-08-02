import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { isSafeName, safeJoin } from '../src/lib/safepath.js';

describe('isSafeName', () => {
  it('accepts real nanoid-style ids and filenames', () => {
    expect(isSafeName('V1StGXR8_Z5j')).toBe(true); // nanoid(12)
    expect(isSafeName('V1StGXR8_Z5j.webp')).toBe(true);
    expect(isSafeName('aB3-_dEf9xyz.jpeg')).toBe(true);
    expect(isSafeName('photo123.png')).toBe(true);
  });

  it('rejects traversal and separators', () => {
    expect(isSafeName('../x')).toBe(false);
    expect(isSafeName('..')).toBe(false);
    expect(isSafeName('a/b')).toBe(false);
    expect(isSafeName('a\\b')).toBe(false);
    expect(isSafeName('./a')).toBe(false);
  });

  it('rejects empty, control characters and null bytes', () => {
    expect(isSafeName('')).toBe(false);
    expect(isSafeName('a\0b')).toBe(false);
    expect(isSafeName('a\nb')).toBe(false);
  });

  it('rejects unexpected characters and dotfiles', () => {
    expect(isSafeName('a b')).toBe(false);
    expect(isSafeName('a.b.c')).toBe(false); // more than one dot
    expect(isSafeName('.hidden')).toBe(false);
    expect(isSafeName('file.toolongext')).toBe(false);
  });

  it('rejects over-long names', () => {
    expect(isSafeName('a'.repeat(129))).toBe(false);
    expect(isSafeName('a'.repeat(128))).toBe(true);
  });
});

describe('safeJoin', () => {
  const base = '/var/data';

  it('returns the resolved path for valid segments', () => {
    expect(safeJoin(base, 'pieces', 'abc.webp')).toBe(
      path.resolve(base, 'pieces', 'abc.webp')
    );
  });

  it('allows the base itself', () => {
    expect(safeJoin(base)).toBe(path.resolve(base));
  });

  it('throws when a segment escapes the base', () => {
    expect(() => safeJoin(base, '..', 'etc', 'passwd')).toThrow(/unsafe path/);
    expect(() => safeJoin(base, 'pieces', '..', '..', 'secret')).toThrow(/unsafe path/);
  });

  it('throws on an absolute escaping segment', () => {
    expect(() => safeJoin(base, '/etc/passwd')).toThrow(/unsafe path/);
  });
});
