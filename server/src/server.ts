import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const dataDir = process.env.WARDROBE_DATA ?? path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = openDb(path.join(dataDir, 'wardrobe.db'));
const app = createApp(db, dataDir);

// user images (crops + originals)
app.use(
  '/data',
  express.static(dataDir, { index: false, dotfiles: 'ignore', fallthrough: false })
);

// built client, with SPA fallback
const clientDist = path.join(root, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api|data).*/, (_req, res) =>
    res.sendFile(path.join(clientDist, 'index.html'))
  );
}

const port = Number(process.env.PORT ?? 3001);
app.listen(port, '127.0.0.1', () => {
  console.log(`wardrobe.io server on http://localhost:${port} (data: ${dataDir})`);
});
