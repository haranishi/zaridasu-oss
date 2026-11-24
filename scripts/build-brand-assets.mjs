// node --import tsx scripts/build-brand-assets.mjs
// Bロゴの共通原図からアプリの公開素材を再生成する。原図はsrc/lib/brand-assets.ts。
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { BRAND_ICON_TRANSFORM, BRAND_INK, BRAND_PIN_PATH, BRAND_RED, BRAND_WORDMARK_PATH } from '../src/lib/brand-assets.ts';

const root = new URL('../', import.meta.url);
const save = (file, content) => writeFile(new URL(file, root), content);
const svg = (box, body, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" ${extra}>${body}</svg>\n`;
const pin = (color, transform = '') => `<path d="${BRAND_PIN_PATH}" fill="${color}" fill-rule="evenodd"${transform ? ` transform="${transform}"` : ''}/>`;
const word = (color, transform) => `<path d="${BRAND_WORDMARK_PATH}" fill="${color}" transform="${transform}"/>`;
const lockup = svg('0 0 1000 306', pin(BRAND_RED) + word(BRAND_INK, 'translate(282 60) scale(1.9)'), 'role="img" aria-label="ザリダス"');
const icon = size => svg('0 0 512 512', `<rect width="512" height="512" fill="${BRAND_RED}"/>` + pin('#fff', BRAND_ICON_TRANSFORM), `width="${size}" height="${size}"`);

await save('public/brand-symbol.svg', svg('0 0 240 306', pin(BRAND_RED), 'role="img" aria-label="ザリダス"'));
await save('public/brand-symbol-mono.svg', svg('0 0 240 306', pin('#000'), 'role="img" aria-label="ザリダス"'));
await save('public/brand-symbol-white.svg', svg('0 0 240 306', pin('#fff'), 'role="img" aria-label="ザリダス"'));
await save('public/logo-horizontal.svg', lockup);
await save('public/logo-horizontal-mono.svg', svg('0 0 1000 306', pin('#000') + word('#000', 'translate(282 60) scale(1.9)'), 'role="img" aria-label="ザリダス"'));
for (const size of [192, 512]) {
  await save(`public/icon-${size}.svg`, icon(size));
  await save(`public/icon-${size}.png`, await sharp(Buffer.from(icon(size))).resize(size, size).png().toBuffer());
}
await save('public/apple-touch-icon.png', await sharp(Buffer.from(icon(180))).resize(180, 180).png().toBuffer());

// ICOの各フレームはPNG。faviconを16/32/48pxで表示するブラウザ向け。
const frames = await Promise.all([16, 32, 48].map(size => sharp(Buffer.from(icon(size))).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + frames.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const start = 6 + index * 16;
  header[start] = [16, 32, 48][index];
  header[start + 1] = header[start];
  header.writeUInt16LE(1, start + 4);
  header.writeUInt16LE(32, start + 6);
  header.writeUInt32LE(frame.length, start + 8);
  header.writeUInt32LE(offset, start + 12);
  offset += frame.length;
});
await save('public/favicon.ico', Buffer.concat([header, ...frames]));

// レイアウト・コピーは維持し、OGPの旧マスコットだけを同じ原図へ置き換える。
let og = await readFile(new URL('public/og-image.svg', root), 'utf8');
const ogPin = `<!-- B3 brand pin:start -->\n  ${pin('#fff', 'translate(910 185) scale(0.92)')}\n  <!-- B3 brand pin:end -->`;
if (og.includes('<!-- B3 brand pin:start -->')) {
  og = og.replace(/<!-- B3 brand pin:start -->[\s\S]*?<!-- B3 brand pin:end -->/, ogPin);
} else {
  og = og.replace(/<!-- 主役: マスコット[\s\S]*?<\/svg>/, ogPin + '\n</svg>');
}
og = og.replace(/主役=マスコット1つ/g, '主役=B3のピン1つ').replace(/マスコットへ/g, 'ピンへ');
og = og.replace(/<text x="96" y="180"[^>]*>ザリダス<\/text>/, word('#fff', 'translate(96 116) scale(0.66)'));
await save('public/og-image.svg', og);
await save('public/og-image.png', await sharp(Buffer.from(og)).png().toBuffer());

console.log('Bロゴ: SVG・PWAアイコン・favicon・OGPを更新しました。');
