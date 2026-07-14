// Generates the PWA icons from an inline SVG. Run: node scripts/generate-icons.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

function svg(size, maskable) {
  const bgRadius = maskable ? 0 : size * 0.22;
  const scale = maskable ? 0.5 : 0.62; // maskable keeps content inside the safe zone
  const cw = size * scale;
  const ch = cw * 1.4;
  const cx = size / 2;
  const cy = size / 2;
  const cardX = cx - cw / 2;
  const cardY = cy - ch / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${bgRadius}" fill="#0f5132"/>
  <g transform="rotate(-10 ${cx} ${cy})">
    <rect x="${cardX}" y="${cardY}" width="${cw}" height="${ch}" rx="${cw * 0.12}"
          fill="#fdfdfb" stroke="#0a3527" stroke-width="${size * 0.012}"/>
    <text x="${cx}" y="${cy + cw * 0.02}" font-family="Georgia, serif" font-weight="700"
          font-size="${cw * 0.85}" text-anchor="middle" dominant-baseline="central" fill="#1c2430">8</text>
    <text x="${cx - cw * 0.3}" y="${cy - ch * 0.28}" font-family="Georgia, serif" font-weight="700"
          font-size="${cw * 0.3}" text-anchor="middle" dominant-baseline="central" fill="#c0392b">&#9824;</text>
  </g>
</svg>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-512-maskable.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

for (const t of targets) {
  const buf = Buffer.from(svg(t.size, t.maskable));
  await sharp(buf).png().toFile(join(outDir, t.file));
  console.log('wrote', t.file);
}
