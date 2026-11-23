// Generate brand assets from the supplied image; never execute files in its directory.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const require = createRequire(new URL('../../server/package.json', import.meta.url));
const sharp = require('sharp');
const sourcePath = process.argv[2];
if (!sourcePath) throw Error('Pass the supplied transparent PNG path');
const output = fileURLToPath(new URL('../assets/img/brand/', import.meta.url));
const build = fileURLToPath(new URL('../../_build/brand-artwork/', import.meta.url));
await mkdir(output, { recursive: true }); await mkdir(build, { recursive: true });
const input = await readFile(sourcePath);
const metadata = await sharp(input, { limitInputPixels: 25_000_000 }).metadata();
if (!metadata.hasAlpha || metadata.format !== 'png') throw Error('Expected the supplied transparent PNG');
const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let left = info.width, top = info.height, right = 0, bottom = 0;
for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
  if (data[(y * info.width + x) * 4 + 3] >= 8) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
}
if (right <= left || bottom <= top) throw Error('Logo has no usable visible outline');
const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
const cropped = await sharp(input).extract(crop).png().toBuffer();
// Keep original pixels for the icon. Header tints share precisely the same alpha silhouette.
const tint = async (colour, width) => {
  const alpha = await sharp(cropped).resize({ width }).extractChannel('alpha').toBuffer();
  const meta = await sharp(alpha).metadata();
  return sharp({ create: { width: meta.width, height: meta.height, channels: 3, background: colour } }).joinChannel(alpha).png().toBuffer();
};
await copyFile(sourcePath, join(build, 'along-source.png'));
await writeFile(join(output, 'along-ink.png'), await tint('#1B1813', 1000));
await writeFile(join(output, 'along-light.png'), await tint('#FFF9EA', 1000));
// Same pixel sizes as the original APK resources (QM.png 512, f1.png 432). The adaptive
// mark must fit the 66/108 safe circle: radius 132px at 432, logo half-width * 1.007 <= 132.
const iconMark = await sharp(cropped).resize({ width: 260, height: 260, fit: 'inside' }).png().toBuffer();
const legacyMark = await sharp(cropped).resize({ width: 415, height: 310, fit: 'inside' }).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#F7F2E8' } }).composite([{ input: legacyMark, gravity: 'centre' }]).png().toFile(join(build, 'launcher-legacy.png'));
await sharp({ create: { width: 432, height: 432, channels: 4, background: '#00000000' } }).composite([{ input: iconMark, gravity: 'centre' }]).png().toFile(join(build, 'launcher-mark.png'));
await sharp(cropped).resize({ width: 1000 }).flatten({ background: '#F7F2E8' }).png().toFile(join(build, 'logo-on-paper.png'));
await sharp(join(build, 'launcher-legacy.png')).resize(256).png().toFile(join(output, 'app-icon.png'));
await writeFile(join(build, 'manifest.json'), JSON.stringify({ sourceDimensions: { width: info.width, height: info.height }, crop, paper: '#F7F2E8', overrides: { 'res/QM.png': 'launcher-legacy.png', 'res/f1.png': 'launcher-mark.png' }, backgroundColour: { old: '0xffeef3ef', replacement: '0xfff7f2e8' } }, null, 2));
console.log(JSON.stringify({ output, build, crop, originalPreserved: true, variants: ['along-ink.png', 'along-light.png', 'app-icon.png'], iconLayers: ['launcher-legacy.png', 'launcher-mark.png'] }, null, 2));
