// ─────────────────────────────────────────────────────────────────────────────
// Model library: wraps ART's assets/index.js (dynamic import) with fallbacks.
//   const lib = await ModelLib.load();
//   lib.staticProto(kind, variant)  → { groups, bbox, size }   (baked, for chunk batching)
//   lib.instance(kind, variant)     → { rig, root, size, bbox, real, proto } (animated entity,
//                                      one draw call via the rig shader — see rig.js)
//   lib.isReal(kind)                → true if ART's model was used
// Any kind missing from ART (or a failed import / throwing builder) falls back to
// fallbackModels.js so the view always renders.
// ─────────────────────────────────────────────────────────────────────────────
import { createFallbackModel } from './fallbackModels.js';
import { extractGroups } from './bake.js';
import { buildRigProto, RigInstance } from './rig.js';


export class ModelLib {
  constructor(assets) {
    this.assets = assets;            // module namespace or null
    this.realKinds = new Set();
    this.failed = new Set();
    this.static = new Map();
    this.entity = new Map();
    this.source = assets ? 'assets' : 'fallback';
  }

  static async load({ timeoutMs = 4000, url = null } = {}) {
    // test hook: ?assets=<url relative to this file> lets the harness swap the asset module
    if (!url && typeof location !== 'undefined') { const a = new URLSearchParams(location.search).get('assets'); if (a && /^[\w./-]+\.js$/.test(a)) url = a; }
    url = url || '../assets/index.js';
    let mod = null;
    try {
      mod = await import(new URL(url, import.meta.url).href);
      if (typeof mod.createModel !== 'function') mod = null;
      if (mod && typeof mod.preloadAssets === 'function') {
        const base = mod.CATEGORIES ? Object.entries(mod.CATEGORIES).filter(([c]) => !c.startsWith('x_')).flatMap(([, k]) => k) : undefined;
        await Promise.race([Promise.resolve(mod.preloadAssets(base ? { kinds: base } : undefined)), new Promise((r) => setTimeout(r, timeoutMs))]);
      }
    } catch (e) {
      console.info('[view] assets/index.js unavailable, using fallback models:', e && e.message);
      mod = null;
    }
    const lib = new ModelLib(mod);
    if (mod && Array.isArray(mod.KINDS_3D)) lib.kindList = new Set(mod.KINDS_3D);
    return lib;
  }

  // Raw model (not cached). Tries ART first.
  create(kind, variant = 0) {
    if (this.assets && !this.failed.has(kind) && (!this.kindList || this.kindList.has(kind))) {
      try {
        const m = this.assets.createModel(kind, variant);
        if (m && m.isObject3D) {
          let meshes = 0;
          m.traverse((o) => { if (o.isMesh) meshes++; });
          if (meshes > 0) { this.realKinds.add(kind); return m; }
        }
      } catch (e) {
        console.warn(`[view] createModel('${kind}') failed; using fallback.`, e && e.message);
      }
      this.failed.add(kind);
    }
    return createFallbackModel(kind, variant);
  }
  isReal(kind) { return this.realKinds.has(kind); }

  sizeOf(root, bbox) {
    const s = root.userData && root.userData.size;
    if (s && s.w > 0) return { w: s.w, h: s.h, l: s.l };
    return { w: bbox.max.x - bbox.min.x, h: bbox.max.y - bbox.min.y, l: bbox.max.z - bbox.min.z };
  }

  staticProto(kind, variant = 0) {
    const key = kind + '|' + variant;
    let p = this.static.get(key);
    if (!p) {
      const root = this.create(kind, variant);
      const { groups, bbox } = extractGroups(root);
      p = { groups, bbox, size: this.sizeOf(root, bbox), tris: groups.reduce((a, g) => a + g.pos.length / 9, 0) };
      this.static.set(key, p);
    }
    return p;
  }

  rigProto(kind, variant = 0) {
    const key = kind + '|' + variant;
    let p = this.entity.get(key);
    if (!p) {
      const root = this.create(kind, variant);
      p = buildRigProto(root);
      p.kind = kind; p.real = this.isReal(kind);
      this.entity.set(key, p);
    }
    return p;
  }

  // Animated instance: one draw call (rig shader) + any non-bakeable extras.
  instance(kind, variant = 0, opts = {}) {
    const p = this.rigProto(kind, variant);
    const rig = new RigInstance(p, opts);
    return { rig, root: rig.root, size: p.size, bbox: p.bbox, real: p.real, proto: p };
  }
}
