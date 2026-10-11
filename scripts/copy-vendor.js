// Copies the parts of three.js the browser needs into public/vendor so the
// game is plain static files (works on Render, any static host, or file preview).
import { cpSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'three');
const dst = join(root, 'public', 'vendor', 'three');
if (!existsSync(src)) { console.warn('[copy-vendor] three not installed, skipping'); process.exit(0); }
mkdirSync(join(dst, 'addons'), { recursive: true });
for (const f of readdirSync(join(src, 'build'))) {
  if (f.endsWith('.module.js') || f === 'three.core.js') cpSync(join(src, 'build', f), join(dst, f));
}
for (const d of ['exporters', 'utils', 'controls', 'loaders']) {
  cpSync(join(src, 'examples', 'jsm', d), join(dst, 'addons', d), { recursive: true });
}
console.log('[copy-vendor] three.js copied to public/vendor/three');

// Round 3 UI fonts (SIL Open Font License): Archivo (text, width + weight axes) and Fraunces (big moments).
// Only the latin subsets; css/fonts.css points at these. Missing packages just fall back to system fonts.
const fonts = [
  ['@fontsource-variable/archivo', 'archivo-latin-wdth-normal.woff2'],
  ['@fontsource-variable/archivo', 'archivo-latin-ext-wdth-normal.woff2'],
  ['@fontsource-variable/fraunces', 'fraunces-latin-full-normal.woff2'],
  ['@fontsource-variable/fraunces', 'fraunces-latin-full-italic.woff2'],
];
const fdst = join(root, 'public', 'vendor', 'fonts');
mkdirSync(fdst, { recursive: true });
let nf = 0;
for (const [pkg, file] of fonts) {
  const f = join(root, 'node_modules', ...pkg.split('/'), 'files', file);
  if (existsSync(f)) { cpSync(f, join(fdst, file)); nf++; }
}
console.log(`[copy-vendor] ${nf} font files copied to public/vendor/fonts`);
