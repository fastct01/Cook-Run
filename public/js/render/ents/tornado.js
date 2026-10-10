// ─────────────────────────────────────────────────────────────────────────────
// The salt-flats tornado ("a tornado that throws cars"). Cheap but big:
//   • ONE translucent mesh: 4 nested funnel shells + the base debris skirt + the
//     wall cloud overhead, merged into one geometry (aLayer attribute) and drawn
//     with a custom shader: scrolling canvas-generated fBm noise, per-layer spin,
//     rising streaks, fresnel-thick silhouettes, bend/sway in the vertex shader.
//   • ONE instanced mesh of tumbling debris (planks, sheet metal, crates).
//   • Particles (shared pool): ground dust ring, orbiting wisps and grit.
//   • Storm light: darkens/tints fog, sun, sky near the funnel (storm.js).
// Cars thrown around it are ordinary car ents (y > 0) — entities.js tumbles them.
//
//   const tv = new TornadoView(scene, particles);
//   tv.update(dt, { x, z, y, height, radius, spin, intensity, bendX, bendZ }, camera);
//   tv.setVisible(false); tv.dispose();
// Unity: a VFX Graph / Shuriken setup — 4 cone meshes with a scrolling noise shader,
// a debris particle system with mesh particles, and a post-process volume for the darkening.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { ATLAS } from '../textures.js';
import { XATLAS } from './atlas.js';

const RS = 48;         // radial segments
// layer table: [radiusScale, alpha, spin, rise, noiseRepU, noiseRepV, twist]
const LAYERS = [
  [0.68, 0.97, 1.7, 0.30, 1, 3.4, 1.3],   // 0 core (solid trunk)
  [0.78, 0.32, 1.25, 0.24, 1, 4.0, 1.0],  // 1 main (texture just over the trunk)
  [0.95, 0.16, 0.95, 0.38, 2, 4.6, 0.8],  // 2 outer haze
  [1.2, 0.09, 0.62, 0.52, 1, 2.4, 0.5],   // 3 wisps
  [1.0, 0.8, 2.3, 0.45, 5, 1.5, 0.5],     // 4 debris skirt
  [1.0, 0.97, 0.16, 0.0, 3, 2.0, 2.2],    // 5 wall cloud (twist = spiral bands)
];

// ── noise texture (tileable fBm, bands stretched around the funnel) ─────────
let _noise = null;
function noiseTexture() {
  if (_noise) return _noise;
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  let seed = 7;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const chan = (gx0, gy0, oct) => {
    const out = new Float32Array(S * S);
    let amp = 1, tot = 0;
    for (let o = 0; o < oct; o++) {
      const gx = gx0 << o, gy = gy0 << o;
      const grid = new Float32Array(gx * gy);
      for (let i = 0; i < grid.length; i++) grid[i] = rnd();
      for (let y = 0; y < S; y++) {
        const fy = (y / S) * gy, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
        const y1 = (y0 + 1) % gy;
        for (let x = 0; x < S; x++) {
          const fx = (x / S) * gx, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
          const x1 = (x0 + 1) % gx;
          const a = grid[y0 * gx + x0], b = grid[y0 * gx + x1], cc = grid[y1 * gx + x0], d = grid[y1 * gx + x1];
          out[y * S + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (cc + (d - cc) * sx) * sy);
        }
      }
      tot += amp; amp *= 0.55;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  };
  const r = chan(3, 9, 5), gch = chan(5, 5, 4), b = chan(2, 14, 4);
  for (let i = 0; i < S * S; i++) {
    const k = (v) => Math.max(0, Math.min(255, Math.round(((v - 0.5) * 1.9 + 0.5) * 255)));
    img.data[i * 4] = k(r[i]); img.data[i * 4 + 1] = k(gch[i]); img.data[i * 4 + 2] = k(b[i]); img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  _noise = new THREE.CanvasTexture(c);
  _noise.wrapS = _noise.wrapT = THREE.RepeatWrapping;
  _noise.generateMipmaps = true;
  _noise.minFilter = THREE.LinearMipmapLinearFilter;
  return _noise;
}

// ── geometry: normalised funnel (height 0..1, top radius 1) ────────────────
function funnelR(h) { return 0.2 + 0.8 * Math.pow(h, 1.6); }
function buildGeometry() {
  const pos = [], nrm = [], uv = [], lay = [], idx = [];
  const ring = (layer, profile, HS) => {
    const base = pos.length / 3;
    for (let j = 0; j <= HS; j++) {
      const [r, h, slope] = profile(j / HS);
      for (let i = 0; i <= RS; i++) {
        const a = (i / RS) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        pos.push(ca * r, h, sa * r);
        const n = new THREE.Vector3(ca, -slope, sa).normalize();
        nrm.push(n.x, n.y, n.z);
        uv.push(i / RS, j / HS);
        lay.push(layer);
      }
    }
    for (let j = 0; j < HS; j++) for (let i = 0; i < RS; i++) {
      const a = base + j * (RS + 1) + i, b = a + RS + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  };
  for (let L = 0; L < 4; L++) {
    const s = LAYERS[L][0];
    ring(L, (t) => {
      const h = t * (L === 3 ? 0.92 : 1.0) + (L === 3 ? 0.06 : 0);
      const r = funnelR(h) * s;
      const dr = 0.8 * 1.6 * Math.pow(Math.max(h, 1e-3), 0.6) * s;
      return [r, h, dr];
    }, 30);
  }
  // debris skirt: a billowing bulb around the touchdown point
  ring(4, (t) => {
    const h = t * 0.24;
    const r = 0.14 + 0.42 * Math.pow(Math.sin(Math.min(1, t * 1.1) * Math.PI), 0.7) + t * 0.12;
    return [r, h, -Math.cos(t * Math.PI) * 2];
  }, 12);
  // wall cloud: a closed, slightly lowered dome spreading out from the funnel top
  ring(5, (t) => {
    const r = t * 8.5;
    const s = Math.min(1, t / 0.3), e = s * s * (3 - 2 * s);
    const h = 0.9 + 0.17 * e - 0.03 * t;      // lowered wall cloud where the funnel hangs
    return [r, h, -0.5];
  }, 18);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aLayer', new THREE.Float32BufferAttribute(lay, 1));
  g.setIndex(idx);
  return g;
}

const VERT = /* glsl */`
  attribute float aLayer;
  uniform float uTime, uHeight, uRadius;
  uniform vec2 uBend, uWobble;
  varying vec2 vUv, vPlanar;
  varying float vH, vLayer, vFogDepth, vFres;
  vec2 centreAt(float h, float t) {
    vec2 c = uBend * pow(h, 1.6);
    c += vec2(sin(t * 0.83 + h * 4.1), cos(t * 0.67 + h * 3.3)) * uWobble.x * h;
    c += vec2(sin(t * 1.9 + 1.3), cos(t * 1.55)) * uWobble.y * pow(1.0 - h, 5.0);   // the base dances
    return c;
  }
  void main() {
    vUv = uv; vLayer = aLayer; vPlanar = position.xz;
    float h = position.y;
    vH = h;
    // rope-like breathing of the radius
    float br = 1.0 + 0.07 * sin(uTime * 2.3 + h * 9.0 + aLayer) + 0.05 * sin(uTime * 1.1 - h * 5.0);
    vec3 p = vec3(position.x * uRadius * br, h * uHeight, position.z * uRadius * br);
    vec2 c = centreAt(aLayer > 4.5 ? 1.0 : min(h, 1.0), uTime);
    if (aLayer > 4.5) c *= 0.6;
    p.xz += c;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFres = 1.0 - abs(dot(n, normalize(-mv.xyz)));
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */`
  uniform sampler2D uNoise;
  uniform float uTime, uSpin, uIntensity;
  uniform vec4 uL[6];       // spin, rise, repU, repV
  uniform vec4 uL2[6];      // alpha, twist, -, -
  uniform vec3 uColTop, uColBot, uColSkirt, uColCloud, uLight;
  uniform vec3 fogColor;
  uniform float fogNear, fogFar;
  varying vec2 vUv, vPlanar;
  varying float vH, vLayer, vFogDepth, vFres;
  void main() {
    int li = int(vLayer + 0.5);
    vec4 L = uL[li]; vec4 L2 = uL2[li];
    vec2 uv = vec2(vUv.x * L.z + uTime * uSpin * L.x * 0.16 - vH * L2.y, vUv.y * L.w - uTime * L.y);
    vec4 n1 = texture2D(uNoise, uv);
    vec4 n2 = texture2D(uNoise, uv * vec2(2.0, 1.6) + vec2(0.31, 0.17) + vec2(uTime * 0.01, 0.0));
    float n = n1.r * 0.62 + n2.b * 0.38;
    float dens = smoothstep(0.3, 0.78, n);
    vec3 col; float a;
    if (li == 5) {
      // wall cloud: planar swirl noise (no polar seam), dense dark middle, spiral bands, frayed edge
      float rr = length(vPlanar);
      float th = atan(vPlanar.y, vPlanar.x) + 1.4 * sqrt(rr) - uTime * uSpin * 0.07;
      vec2 qq = vec2(cos(th), sin(th)) * rr;
      vec4 c1 = texture2D(uNoise, qq * 0.42 + vec2(0.5));
      vec4 c2 = texture2D(uNoise, qq * 1.1 + vec2(0.31, 0.77));
      float lump = smoothstep(0.25, 0.78, c1.g * 0.6 + c2.r * 0.4);
      float edge = 1.0 - smoothstep(0.45, 1.0, vUv.y + (c1.b - 0.5) * 0.3);
      a = L2.x * edge * (0.66 + 0.34 * lump);
      col = uColCloud * (0.6 + 0.6 * lump) * (0.85 + 0.25 * vUv.y);
    } else if (li == 4) {
      float bandFade = smoothstep(0.0, 0.1, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y + (n1.g - 0.5) * 0.4));
      a = L2.x * (0.2 + 1.0 * dens) * bandFade * pow(1.0 - vFres, 1.4);
      col = uColSkirt * (0.62 + 0.6 * n);
    } else {
      float vert = smoothstep(0.0, 0.04, vH) * (1.0 - smoothstep(0.86, 0.97, vH));
      if (li == 0) a = (0.86 + 0.14 * dens) * vert;                                               // solid core
      else a = L2.x * (0.4 + 0.8 * dens) * vert * (0.6 + 0.5 * pow(vFres, 1.2));
      a *= li >= 2 ? smoothstep(1.0, 0.8, vFres) : smoothstep(1.0, 0.93, vFres) * 0.6 + 0.4;   // soft outer silhouettes
      col = mix(uColBot, uColTop, smoothstep(0.05, 0.6, vH)) * (0.62 + 0.62 * n);
      col *= (1.0 - 0.15 * float(li == 0)) * (0.72 + 0.4 * (1.0 - vFres));   // rounded, volumetric shading
    }
    col *= uLight;
    a *= uIntensity;
    if (a < 0.004) discard;
    float f = smoothstep(fogNear, fogFar, vFogDepth) * 0.72;
    col = mix(col, fogColor, f);
    gl_FragColor = vec4(col, min(a, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
const ND = 56;

export class TornadoView {
  constructor(scene, particles, storm = null) {
    this.scene = scene; this.particles = particles; this.storm = storm;
    this.time = 0;
    this.k = 0;                      // smoothed intensity
    this.root = new THREE.Group(); this.root.name = 'tornado';
    scene.add(this.root);
    const u = this.u = {
      uNoise: { value: noiseTexture() }, uTime: { value: 0 }, uHeight: { value: 75 }, uRadius: { value: 26 },
      uBend: { value: new THREE.Vector2() }, uWobble: { value: new THREE.Vector2(2.5, 1.2) },
      uSpin: { value: 1 }, uIntensity: { value: 1 },
      uL: { value: LAYERS.map((l) => new THREE.Vector4(l[2], l[3], l[4], l[5])) },
      uL2: { value: LAYERS.map((l) => new THREE.Vector4(l[1], l[6], 0, 0)) },
      uColTop: { value: new THREE.Color('#70685f') }, uColBot: { value: new THREE.Color('#b09878') },
      uColSkirt: { value: new THREE.Color('#a88a68') }, uColCloud: { value: new THREE.Color('#3c3936') },
      uLight: { value: new THREE.Color(1, 1, 1) },
      fogColor: { value: new THREE.Color() }, fogNear: { value: 100 }, fogFar: { value: 600 },
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(buildGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.root.add(this.mesh);
    // debris: one instanced mesh
    const dg = new THREE.BoxGeometry(1, 1, 1);
    this.debrisMat = new THREE.MeshLambertMaterial({ flatShading: true });
    this.debris = new THREE.InstancedMesh(dg, this.debrisMat, ND);
    this.debris.frustumCulled = false;
    this.debris.castShadow = false;
    const cols = ['#6b5844', '#8a6f4e', '#7d7f84', '#9c4a32', '#5a5d62', '#c2b08a', '#4f8f8a', '#3b3631'];
    let s = 3; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    this.items = [];
    for (let i = 0; i < ND; i++) {
      const kind = rnd();
      const size = kind < 0.45 ? [1.8 + rnd() * 1.6, 0.12, 0.3] : kind < 0.75 ? [1.1 + rnd(), 0.05, 0.8 + rnd() * 0.6] : [0.6 + rnd() * 0.5, 0.5 + rnd() * 0.3, 0.6 + rnd() * 0.4];
      this.items.push({ a: rnd() * Math.PI * 2, h: rnd() * 0.7, rf: 0.45 + rnd() * 0.9, w: 0.7 + rnd() * 0.9, bob: rnd() * 6, size, rot: new THREE.Quaternion().setFromEuler(_e.set(rnd() * 6, rnd() * 6, rnd() * 6)), ax: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), sp: 2 + rnd() * 6, rise: 0.015 + rnd() * 0.035 });
      this.debris.setColorAt(i, new THREE.Color(cols[i % cols.length]));
    }
    this.root.add(this.debris);
    this.wisps = [];
    for (let i = 0; i < 20; i++) this.wisps.push({ a: rnd() * 6.28, h: 0.03 + rnd() * 0.45, rf: 0.9 + rnd() * 0.5, sz: 6 + rnd() * 8, w: 0.5 + rnd() * 0.5, g: 0.55 + rnd() * 0.15 });
    this.grit = [];
    for (let i = 0; i < 60; i++) this.grit.push({ a: rnd() * 6.28, h: rnd() * 0.55, rf: 0.6 + rnd() * 0.9, sz: 0.35 + rnd() * 0.6, w: 1 + rnd() * 1.2, cell: rnd() < 0.5 ? ATLAS.CHUNK : XATLAS.PLANK });
    this.acc = 0;
    this.prev = null;
    this.bend = new THREE.Vector2();
    this.visible = true;
  }

  setVisible(on) { this.visible = on; this.root.visible = on; }

  /** p: { x, y, z, height, radius, spin, intensity } (world), cam: THREE.Camera */
  update(dt, p, cam) {
    this.time += dt;
    const u = this.u;
    const H = p.height ?? 75, R = p.radius ?? 26;
    this.k += ((p.intensity ?? 1) - this.k) * Math.min(1, dt * 1.5);
    const k = this.k;
    this.root.visible = this.visible && k > 0.01;
    if (!this.root.visible) { if (this.storm) this.storm.set(0); return; }
    this.root.position.set(p.x, p.y ?? 0, p.z);
    const spin = p.spin ?? 1;
    u.uTime.value = this.time; u.uHeight.value = H * (0.55 + 0.45 * k); u.uRadius.value = R;
    u.uSpin.value = spin; u.uIntensity.value = Math.min(1, k * 1.15);
    // the top lags behind the motion of the base (bend against travel), plus explicit bend from state
    if (this.prev && dt > 0) {
      const vx = (p.x - this.prev.x) / dt, vz = (p.z - this.prev.z) / dt;
      if (Math.abs(vx) + Math.abs(vz) < 80) { this.bend.x += ((-vx * 1.4 + (p.bendX || 0)) - this.bend.x) * Math.min(1, dt * 0.8); this.bend.y += ((-vz * 1.4 + (p.bendZ || 0)) - this.bend.y) * Math.min(1, dt * 0.8); }
    }
    this.prev = { x: p.x, z: p.z };
    const sway = 6 + Math.sin(this.time * 0.21) * 3;
    u.uBend.value.set(this.bend.x + Math.sin(this.time * 0.17) * sway, this.bend.y + Math.cos(this.time * 0.13) * sway * 0.7);
    // light + fog from the scene
    const fog = this.scene.fog;
    if (fog) { u.fogColor.value.copy(fog.color); u.fogNear.value = fog.near; u.fogFar.value = Math.max(fog.far * 1.6, fog.near + 200); }
    this._light(u.uLight.value);

    const cx = (h) => {   // centre offset at normalised height h (mirrors the vertex shader)
      const t = this.time;
      return [u.uBend.value.x * Math.pow(h, 1.6) + Math.sin(t * 0.83 + h * 4.1) * 2.5 * h + Math.sin(t * 1.9 + 1.3) * 1.2 * Math.pow(1 - h, 5),
        u.uBend.value.y * Math.pow(h, 1.6) + Math.cos(t * 0.67 + h * 3.3) * 2.5 * h + Math.cos(t * 1.55) * 1.2 * Math.pow(1 - h, 5)];
    };
    const Hh = u.uHeight.value;
    // debris orbit
    for (let i = 0; i < ND; i++) {
      const d = this.items[i];
      d.h += d.rise * dt * spin; if (d.h > 0.78) { d.h = 0.02; d.a += 2; }
      const rr = funnelR(d.h) * R * d.rf * 1.05 + 2;
      d.a += dt * spin * d.w * (14 / Math.max(4, rr));
      const [ox, oz] = cx(d.h);
      _v.set(ox + Math.cos(d.a) * rr, d.h * Hh + Math.sin(this.time * 2 + d.bob) * 1.2, oz + Math.sin(d.a) * rr);
      _q.setFromAxisAngle(d.ax, dt * d.sp); d.rot.premultiply(_q);
      _s.set(d.size[0], d.size[1], d.size[2]).multiplyScalar(k);
      _m.compose(_v, d.rot, _s);
      this.debris.setMatrixAt(i, _m);
    }
    this.debris.instanceMatrix.needsUpdate = true;

    // particles (only when someone can see them)
    const P = this.particles;
    const dist = cam ? Math.hypot(cam.position.x - p.x, cam.position.z - p.z) : 0;
    if (P && dist < 700) {
      const near = dist < 320;
      const gy = p.y ?? 0;
      // base dust ring billowing outward
      this.acc += dt * (near ? 55 : 18) * k;
      while (this.acc > 1) {
        this.acc -= 1;
        const a = Math.random() * Math.PI * 2, r0 = R * (0.12 + Math.random() * 0.3);
        const [ox, oz] = cx(0.02);
        const tang = 10 * spin, out = 1.5 + Math.random() * 4;
        const c = (0.6 + Math.random() * 0.14);
        const L = u.uLight.value;
        P.spawn({ x: p.x + ox + Math.cos(a) * r0, y: gy + 0.3 + Math.random() * 1.5, z: p.z + oz + Math.sin(a) * r0,
          vx: Math.cos(a) * out - Math.sin(a) * tang, vy: 1.5 + Math.random() * 3.5, vz: Math.sin(a) * out + Math.cos(a) * tang,
          life: 2.4 + Math.random() * 1.4, size: 4, size1: 14, r: c * 0.86 * L.r, g: c * 0.72 * L.g, b: c * 0.56 * L.b, alpha: 0.42, cell: Math.random() < 0.5 ? ATLAS.PUFF : XATLAS.SOFT, drag: 0.8, spin: (Math.random() - 0.5) * 0.8 });
      }
      // orbiting wisps hugging the funnel
      for (const w of this.wisps) {
        w.a += dt * spin * w.w * 1.2;
        const h = w.h;
        const rr = funnelR(h) * R * w.rf;
        const [ox, oz] = cx(h);
        const g = w.g * (0.9 + 0.1 * Math.sin(this.time + w.a));
        P.once({ x: p.x + ox + Math.cos(w.a) * rr, y: gy + h * Hh, z: p.z + oz + Math.sin(w.a) * rr, cell: XATLAS.WISP, size: w.sz * (0.6 + h), rot: w.a * 0.3, r: g, g: g * 0.88, b: g * 0.74, alpha: 0.14 * k });
      }
      if (near) for (const q of this.grit) {
        q.a += dt * spin * q.w * 2.2;
        const rr = funnelR(q.h) * R * q.rf + 1.5;
        const [ox, oz] = cx(q.h);
        P.once({ x: p.x + ox + Math.cos(q.a) * rr, y: gy + q.h * Hh + 1, z: p.z + oz + Math.sin(q.a) * rr, cell: q.cell, size: q.sz, rot: q.a * 3, r: 0.36, g: 0.31, b: 0.26, alpha: 0.95 * k });
      }
      // dark ground shadow under the funnel
      P.once({ x: p.x, y: gy + 0.06, z: p.z, flat: true, cell: ATLAS.GLOW, size: R * 2.6, r: 0, g: 0, b: 0, alpha: 0.32 * k });
    }
    // storm darkening near the funnel
    if (this.storm && cam) {
      const sk = (1 - smooth(140, 520, dist)) * k;
      this.storm.set(sk);
    }
  }

  _light(out) {
    // follow the scene's lighting (time of day) without a real light pass
    if (!this._lights) {
      this._lights = { hemi: null, sun: null };
      this.scene.traverse((o) => { if (o.isHemisphereLight && !this._lights.hemi) this._lights.hemi = o; if (o.isDirectionalLight && !this._lights.sun) this._lights.sun = o; });
    }
    const { hemi, sun } = this._lights;
    out.setRGB(0.55, 0.55, 0.55);
    if (hemi) out.add(_c1.copy(hemi.color).multiplyScalar(hemi.intensity * 0.3));
    if (sun) out.add(_c1.copy(sun.color).multiplyScalar(sun.intensity * 0.1));
    if (!hemi && !sun) out.setRGB(1, 1, 1);
    out.r = Math.min(out.r, 1.25); out.g = Math.min(out.g, 1.25); out.b = Math.min(out.b, 1.25);
  }

  dispose() {
    this.root.removeFromParent();
    this.mesh.geometry.dispose(); this.mat.dispose();
    this.debris.geometry.dispose(); this.debrisMat.dispose(); this.debris.dispose();
    if (this.storm) this.storm.set(0);
  }
}
const _c1 = new THREE.Color();
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
