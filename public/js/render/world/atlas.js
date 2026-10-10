// ─────────────────────────────────────────────────────────────────────────────
// Runtime sign atlas (VIEW-WORLD-A). ART's buildings carry one CanvasTexture per
// sign; baked naively each costs a draw call per chunk (≈10 per downtown chunk).
// Every opaque / alpha-cut sign texture is copied once into a 2048² atlas page
// and its UVs are remapped, so all signs of a chunk share ONE material.
// Tiling textures (UVs outside 0..1) and non-canvas images are left alone.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const PAD = 4;
const MAXDIM = 512;

export class SignAtlas {
  constructor({ size = 2048 } = {}) {
    this.size = size;
    this.pages = [];
    this.slots = new Map();   // texture uuid → slot | null
    this.dirty = new Set();
  }

  _page() {
    const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!cv) return null;
    cv.width = cv.height = this.size;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, this.size, this.size);
    const texture = new THREE.CanvasTexture(cv);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const p = { id: this.pages.length, canvas: cv, ctx, texture, shelves: [], bottom: 0 };
    this.pages.push(p);
    return p;
  }

  _alloc(w, h) {
    const W = w + PAD * 2, H = h + PAD * 2;
    for (const p of this.pages) {
      for (const sh of p.shelves) if (sh.h >= H && sh.h <= H * 1.6 && sh.x + W <= this.size) { const r = { page: p, x: sh.x, y: sh.y }; sh.x += W; return r; }
      if (p.bottom + H <= this.size) { const sh = { y: p.bottom, h: H, x: W }; p.shelves.push(sh); p.bottom += H; return { page: p, x: 0, y: sh.y }; }
    }
    const p = this._page();
    if (!p) return null;
    const sh = { y: 0, h: H, x: W }; p.shelves.push(sh); p.bottom = H;
    return { page: p, x: 0, y: 0 };
  }

  /** Slot for a texture, or null if it cannot be atlased. */
  slotFor(tex) {
    if (!tex) return null;
    if (this.slots.has(tex.uuid)) return this.slots.get(tex.uuid);
    let slot = null;
    const img = tex.image;
    const drawable = img && (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement
      || typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement && img.complete
      || typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap
      || typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas);
    if (drawable && img.width > 0 && img.height > 0) {
      const k = Math.min(1, MAXDIM / Math.max(img.width, img.height));
      const w = Math.max(4, Math.round(img.width * k)), h = Math.max(4, Math.round(img.height * k));
      const a = this._alloc(w, h);
      if (a) {
        const ctx = a.page.ctx;
        try {
          // edge bleed for mipmaps, then the image itself
          ctx.drawImage(img, a.x, a.y, w + PAD * 2, h + PAD * 2);
          ctx.drawImage(img, a.x + PAD, a.y + PAD, w, h);
          slot = { page: a.page, x: a.x + PAD, y: a.y + PAD, w, h, flipY: tex.flipY !== false };
          this.dirty.add(a.page);
        } catch (e) { slot = null; }
      }
    }
    this.slots.set(tex.uuid, slot);
    return slot;
  }

  /** Remap a texture's uv array into the slot. Returns a new Float32Array or null when UVs tile. */
  remap(slot, tex, uv) {
    tex.updateMatrix();
    const e = tex.matrix.elements;
    const S = this.size;
    const out = new Float32Array(uv.length);
    for (let i = 0; i < uv.length; i += 2) {
      let u = uv[i], v = uv[i + 1];
      const tu = e[0] * u + e[3] * v + e[6], tv = e[1] * u + e[4] * v + e[7];
      if (tu < -0.02 || tu > 1.02 || tv < -0.02 || tv > 1.02) return null;
      u = Math.min(1, Math.max(0, tu)); v = Math.min(1, Math.max(0, tv));
      const px = slot.x + u * slot.w;
      const py = slot.y + (slot.flipY ? (1 - v) : v) * slot.h;
      out[i] = px / S;
      out[i + 1] = 1 - py / S;
    }
    return out;
  }

  /** Upload changed pages (call once per frame after building chunks). */
  flush() {
    if (!this.dirty.size) return;
    for (const p of this.dirty) p.texture.needsUpdate = true;
    this.dirty.clear();
  }

  dispose() { for (const p of this.pages) p.texture.dispose(); this.pages = []; this.slots.clear(); }
}
