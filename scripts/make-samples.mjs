// Generate sample "outfit" test photos with sharp (offline-safe), plus
// download a couple of real CC0 outfit photos when the network allows.
// Output: scratch-samples/ (gitignored)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const outDir = path.join(import.meta.dirname, '..', 'scratch-samples');
fs.mkdirSync(outDir, { recursive: true });

const REAL_PHOTOS = [
  // Unsplash full-body outfit shots (hotlink-stable CDN URLs)
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80',
  'https://images.unsplash.com/photo-1490114538077-0a7f8cb49891?w=800&q=80',
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&q=80',
  'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=800&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&q=80',
];

async function downloadReal() {
  let n = 0;
  for (const [i, url] of REAL_PHOTOS.entries()) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(String(res.status));
      const buf = Buffer.from(await res.arrayBuffer());
      await sharp(buf).jpeg({ quality: 88 }).toFile(path.join(outDir, `real-${i + 1}.jpg`));
      n++;
    } catch (err) {
      console.warn(`skip ${url}: ${err.message}`);
    }
  }
  return n;
}

/** Synthetic person-ish composite: colored "shirt" + "pants" blocks so the
 * segmentation model has something clothing-shaped to find. */
async function makeSynthetic(name, shirtColor, pantsColor) {
  const w = 600;
  const h = 900;
  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" fill="#d8d3c8"/>
    <circle cx="300" cy="150" r="70" fill="#c99b72"/>
    <rect x="180" y="230" width="240" height="280" rx="40" fill="${shirtColor}"/>
    <rect x="150" y="250" width="60" height="220" rx="30" fill="${shirtColor}"/>
    <rect x="390" y="250" width="60" height="220" rx="30" fill="${shirtColor}"/>
    <rect x="200" y="510" width="90" height="330" rx="25" fill="${pantsColor}"/>
    <rect x="310" y="510" width="90" height="330" rx="25" fill="${pantsColor}"/>
    <rect x="195" y="840" width="100" height="45" rx="18" fill="#2b2622"/>
    <rect x="305" y="840" width="100" height="45" rx="18" fill="#2b2622"/>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(path.join(outDir, name));
}

const real = await downloadReal();
await makeSynthetic('synth-red-blue.jpg', '#b33939', '#30507a');
await makeSynthetic('synth-red-blue-2.jpg', '#b23a3a', '#2f4f79'); // near-dup of above
await makeSynthetic('synth-green-black.jpg', '#3a7d44', '#1e1e22');
console.log(`samples ready in ${outDir} (${real} real, 3 synthetic)`);
