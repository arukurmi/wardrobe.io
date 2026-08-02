import type { Request, Response, NextFunction } from 'express';

/**
 * Belt-and-suspenders guard for the `/data` static mount. express.static
 * already normalizes and blocks traversal, but this rejects any request
 * whose (decoded) path still contains a ".." segment or a null byte before
 * it ever reaches the static handler.
 */
export function blockTraversal(req: Request, res: Response, next: NextFunction): void {
  let decoded = req.path;
  try {
    decoded = decodeURIComponent(req.path);
  } catch {
    // malformed percent-encoding is itself suspicious
    res.status(400).json({ error: 'bad path' });
    return;
  }
  if (decoded.includes('\0') || /(^|[\\/])\.\.([\\/]|$)/.test(decoded)) {
    res.status(400).json({ error: 'bad path' });
    return;
  }
  next();
}
