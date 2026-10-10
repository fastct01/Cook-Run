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
