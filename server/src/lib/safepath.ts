import path from 'node:path';

/**
 * Defense-in-depth helpers for building filesystem paths out of
 * DB-stored filenames / ids.
 *
 * Today every id is a 12-char nanoid (`[A-Za-z0-9_-]`) and every stored
 * filename is `<id>.<ext>` where ext is a short image extension, so these
 * guards never reject a legitimate value. They exist so that a malformed or
 * hand-crafted value can never be turned into a path that escapes its
 * intended directory.
 */

const MAX_NAME_LEN = 128;

// nanoid alphabet (A-Za-z0-9_-) optionally followed by a single short
// extension (e.g. ".webp", ".jpeg"). No path separators, no "..", no dots
// elsewhere, no control characters.
const SAFE_NAME_RE = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9]{1,5})?$/;

/**
 * True when `name` is a single, safe path segment: only the nanoid/filename
 * charset actually used by this app. Rejects empty, over-long, path
 * separators, "..", control characters and any other unexpected byte.
 */
export function isSafeName(name: string): boolean {
  if (typeof name !== 'string') return false;
  if (name.length === 0 || name.length > MAX_NAME_LEN) return false;
  return SAFE_NAME_RE.test(name);
}

/**
 * Join `segments` onto `base` and assert the resolved result stays inside
 * `path.resolve(base)`. Throws if the result would escape the base directory.
 */
export function safeJoin(base: string, ...segments: string[]): string {
  const resolvedBase = path.resolve(base);
  const target = path.resolve(resolvedBase, ...segments);
  if (target !== resolvedBase && !target.startsWith(resolvedBase + path.sep)) {
    throw new Error(
      `unsafe path: ${segments.join('/')} escapes base directory ${resolvedBase}`
    );
  }
  return target;
}
