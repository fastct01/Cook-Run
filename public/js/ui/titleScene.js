// Cook & Run — the live desert title scene (Round 3, LOBBY). Plain DOM + inline SVG, no WebGL.
//
//   import { createTitleScene } from './titleScene.js';
//   const scene = createTitleScene(hostEl);   // fills hostEl (position it yourself, e.g. fixed inset 0)
//   scene.setMode('title' | 'room' | 'difficulty');   // the RV only runs on the title; the others add a dim scrim
//   scene.rvPass({ cop: true });                      // test hook: send the RV down the road right now
//   scene.freeze(ms)                                  // test hook: pause everything, the RV pass at `ms` (screenshots)
//   scene.destroy();
//   window.__titleScene                               // the live scene (handy in devtools / Playwright)
//
// Everything moves with transform / opacity only: CSS keyframes from lobby.css (.crs-a-* classes) for the
// looping bits (pumpjacks, flames, bushes, clouds, vultures, puffs) and Web Animations for the paths that
// depend on the viewport (cars, the RV + cop, tumbleweeds). The road is a fixed-camera perspective:
//   screen y = horizon + P / z,  road half-width = (y − horizon) / HC,  object scale = (y − horizon) / K
// (HC and K are the values of the approved mockups docs/r3/ui/src/Main*.html, so sizes match them).
// Every 18 s the RV wiggles down the road puffing smoke from its roof vent; every other pass a cop chases it.
// Phones (portrait or < 700 px) get the stacked composition and half the traffic.
// prefers-reduced-motion: one static frame (no Web Animations, CSS animations off in lobby.css).
//
// staticSceneSVG(W, H) returns the same scene as one standalone SVG string (used to make the boot
// splash backgrounds public/img/lobby/boot-wide.svg + boot-tall.svg; see docs/NOTES-r3-build-lobby.md).

const HC = 1.84;      // camera height in road half-widths (mockup)
const K = 213.4;      // object scale divisor (mockup: scale = (y − horizon) / K)
const SHOULDER = 1.131;
const RV_EVERY = 18000;
const RV_DUR = 5700;
const COP_LAG = 2200;   // the cop is a few car lengths behind: visible as the RV leaves the frame

const C = {
  skyTop: '#8DB8CE', skyMid: '#B4CBD0', skyLow: '#E6D3B2', skyHaze: '#F2DAB2', sun: '#FBEFD2', cloud: '#FBF4E6',
  farTop: '#DDB59C', farLow: '#CFA184', nearTop: '#AC5D3E', nearLow: '#9C4A32',
  gndTop: '#E6C899', gndMid: '#D8B88A', gndLow: '#B98E5F', shoulder: '#8A7258', asphalt: '#4A4A48', line: '#F1EAD8', dash: '#D9A83A',
  rig: '#8E6B5E', rigDark: '#765649', bush: '#687044', bush2: '#7F8653', bush3: '#959B68',
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const f1 = (v) => Math.round(v * 10) / 10;
const f2 = (v) => Math.round(v * 100) / 100;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── layout ───────────────────────────────────────────────────────────────────
export function sceneLayout(W, H) {
  W = Math.max(280, Math.round(W)); H = Math.max(320, Math.round(H));
  const portrait = W / H < 0.9;
  const Hy = Math.round(H * (portrait ? 0.44 : 0.6));
  const u = portrait ? clamp(H / 844, 0.75, 1.5) : clamp(H / 720, 0.6, 1.8);
  return { W, H, Hy, cx: W / 2, P: H - Hy, u, portrait, phone: portrait || W < 700 };
}

const roadHalf = (L, y) => (y - L.Hy) / HC;
const objScale = (L, y) => (y - L.Hy) / K;

// ── shared drawings (symbols) ────────────────────────────────────────────────
const poly = (pts) => `M${pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join('L')}Z`;

function bushSym(id, seed) {
  const r = rng(seed);
  let s = `<ellipse cx="32" cy="33" rx="30" ry="3" fill="rgba(110,70,30,0.22)"/><ellipse cx="32" cy="26" rx="24" ry="9" fill="${C.bush}"/>`;
  for (let i = 0; i < 17; i++) {
    const x = 6 + r() * 50;
    const dome = 25 - 12 * Math.sqrt(Math.max(0, 1 - ((x - 31) / 27) ** 2));
    const y = dome + r() * (28 - dome);
    const rad = 4 + r() * 3.2;
    const col = r() < 0.16 ? C.bush3 : r() < 0.55 ? C.bush2 : C.bush;
    s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rad)}" fill="${col}"/>`;
  }
  for (let i = 0; i < 6; i++) {
    const x = 12 + r() * 38, y = 13 + r() * 10, a = -Math.PI / 2 + (r() - 0.5) * 1.6, l = 4 + r() * 4;
    s += `<path d="M${f1(x)} ${f1(y)}l${f1(Math.cos(a) * l)} ${f1(Math.sin(a) * l)}" stroke="${r() < 0.5 ? C.bush : C.bush2}" stroke-width="1.1" stroke-linecap="round"/>`;
  }
  return `<symbol id="${id}" viewBox="0 0 60 36" overflow="visible">${s}</symbol>`;
}

const CACTUS = `<rect x="13" y="2" width="8" height="46" rx="4" fill="${C.bush}"/><path d="M14 26H8a3 3 0 0 1-3-3V12" stroke="${C.bush}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M20 20h6a3 3 0 0 0 3-3V8" stroke="${C.bush}" stroke-width="6" fill="none" stroke-linecap="round"/><ellipse cx="17" cy="48" rx="12" ry="2" fill="rgba(110,70,30,0.2)"/>`;
const TANK = `<rect x="0" y="9" width="26" height="15" fill="${C.rig}"/><ellipse cx="13" cy="9" rx="13" ry="3" fill="${C.rig}"/><path d="M0 15H26" stroke="${C.rigDark}" stroke-width="1.4"/><rect x="30" y="13" width="18" height="11" fill="${C.rig}"/><ellipse cx="39" cy="13" rx="9" ry="2.2" fill="${C.rig}"/><path d="M2 9V5h22v4M4 5V9M22 5V9" stroke="${C.rigDark}" stroke-width="0.9" fill="none"/><rect x="54" y="-6" width="3" height="30" fill="${C.rigDark}"/>`;
const PJ_FRAME = `<path d="M6 30L13 8L20 30" stroke="${C.rig}" stroke-width="2.2" fill="none"/><rect x="0" y="29" width="34" height="2.5" fill="${C.rig}"/><rect x="24" y="22" width="8" height="8" fill="${C.rigDark}"/>`;
const PJ_CRANK = `<rect x="3" y="-2" width="2" height="7" fill="${C.rig}"/>`;
const PJ_BEAM = `<rect x="0" y="2.6" width="34" height="2.8" fill="${C.rig}"/><path d="M30 0h4a4 4 0 0 1 0 8h-4z" fill="${C.rig}"/><rect x="1" y="0" width="5" height="8" fill="${C.rigDark}"/><path d="M32 8v14" stroke="${C.rigDark}" stroke-width="1"/>`;
const TUMBLE = `<path d="M12.4 35.2Q22.7 12.3 8.1 7.9" fill="none" stroke="#A3804F" stroke-width="1.3" stroke-linecap="round"/><path d="M8.7 32.7Q20.1 11.7 9.1 7.0" fill="none" stroke="#8A6A43" stroke-width="1.3" stroke-linecap="round"/><path d="M35.4 27.2Q18.6 25.9 9.7 33.5" fill="none" stroke="#B8955F" stroke-width="1.1" stroke-linecap="round"/><path d="M22.8 36.8Q28.1 21.4 12.5 4.7" fill="none" stroke="#A3804F" stroke-width="1.2" stroke-linecap="round"/><path d="M36.8 17.5Q26.5 16.2 20.5 37.0" fill="none" stroke="#8A6A43" stroke-width="1.1" stroke-linecap="round"/><path d="M32.6 31.5Q25.7 14.3 3.3 23.1" fill="none" stroke="#B8955F" stroke-width="1.3" stroke-linecap="round"/><path d="M9.1 7.0Q20.9 12.1 37.0 21.3" fill="none" stroke="#A3804F" stroke-width="1.0" stroke-linecap="round"/><path d="M24.6 36.4Q18.7 16.7 12.5 4.7" fill="none" stroke="#8A6A43" stroke-width="1.4" stroke-linecap="round"/><path d="M3.7 24.9Q25.3 23.6 25.6 3.9" fill="none" stroke="#B8955F" stroke-width="1.1" stroke-linecap="round"/><path d="M4.8 12.3Q26.8 24.1 37.0 19.6" fill="none" stroke="#A3804F" stroke-width="1.2" stroke-linecap="round"/><path d="M36.9 17.9Q18.5 24.6 17.6 36.8" fill="none" stroke="#8A6A43" stroke-width="1.1" stroke-linecap="round"/><path d="M3.0 21.2Q23.0 24.8 20.7 3.0" fill="none" stroke="#B8955F" stroke-width="1.3" stroke-linecap="round"/><path d="M32.1 8.0Q23.5 21.7 22.1 36.9" fill="none" stroke="#A3804F" stroke-width="1.3" stroke-linecap="round"/><path d="M3.6 24.6Q28.0 19.5 36.8 17.7" fill="none" stroke="#8A6A43" stroke-width="1.4" stroke-linecap="round"/><path d="M35.8 26.3Q22.6 28.9 3.5 15.9" fill="none" stroke="#B8955F" stroke-width="1.5" stroke-linecap="round"/><path d="M16.3 36.6Q23.0 11.4 11.1 5.5" fill="none" stroke="#A3804F" stroke-width="1.3" stroke-linecap="round"/><path d="M37.2 25.3A18 17 0 0 1 9.4 34.6" fill="none" stroke="#94724A" stroke-width="1.6" stroke-linecap="round"/><path d="M6.7 32.2A18 17 0 0 1 12.8 3.5" fill="none" stroke="#94724A" stroke-width="1.6" stroke-linecap="round"/><path d="M16.2 2.4A18 17 0 0 1 37.9 22.1" fill="none" stroke="#94724A" stroke-width="1.6" stroke-linecap="round"/>`;
const VULTURE = `<path d="M1 4q4.5-4 9 2 4.5-6 9-2" fill="none" stroke="#5A4038" stroke-width="2" stroke-linecap="round"/>`;
// traffic (from the approved mockup): A = red sedan going away, B = pale-blue van going away, D = green car coming
const CAR_A = `<ellipse cx="38" cy="60" rx="38" ry="3.5" fill="rgba(60,35,15,0.26)"/><rect x="6" y="46" width="13" height="14" rx="2.5" fill="#1F1B18"/><rect x="57" y="46" width="13" height="14" rx="2.5" fill="#1F1B18"/><path d="M10 28H66L58 6H18z" fill="#9E4733"/><path d="M14 26H62L55 10H21z" fill="#2B3138"/><path d="M24 26l8-14h5l-8 14z" fill="#62737C" opacity="0.55"/><rect x="2" y="26" width="72" height="24" rx="6" fill="#B5543C"/><rect x="5" y="30" width="13" height="7" rx="1.5" fill="#E5483A"/><rect x="58" y="30" width="13" height="7" rx="1.5" fill="#E5483A"/><rect x="30" y="36" width="16" height="7" rx="1" fill="#EFE9DB"/><rect x="3" y="44" width="70" height="6" rx="2.5" fill="#8A857E"/>`;
const CAR_B = `<ellipse cx="40" cy="70" rx="40" ry="3.5" fill="rgba(60,35,15,0.26)"/><rect x="8" y="56" width="13" height="14" rx="2.5" fill="#1F1B18"/><rect x="59" y="56" width="13" height="14" rx="2.5" fill="#1F1B18"/><rect x="13" y="4" width="54" height="28" rx="5" fill="#8FA9B1"/><rect x="19" y="8" width="42" height="14" rx="2" fill="#2B3138"/><path d="M27 22l7-14h4l-7 14z" fill="#62737C" opacity="0.5"/><rect x="4" y="28" width="72" height="30" rx="3" fill="#A9C1C8"/><path d="M12 33H68" stroke="#8FA9B1" stroke-width="2"/><rect x="4" y="31" width="6" height="16" rx="1.5" fill="#E5483A"/><rect x="70" y="31" width="6" height="16" rx="1.5" fill="#E5483A"/><rect x="32" y="45" width="16" height="7" rx="1" fill="#EFE9DB"/><rect x="2" y="56" width="76" height="6" rx="2.5" fill="#8A857E"/>`;
const CAR_D = `<ellipse cx="38" cy="58" rx="38" ry="3.5" fill="rgba(60,35,15,0.26)"/><rect x="7" y="44" width="12" height="14" rx="2.5" fill="#1F1B18"/><rect x="57" y="44" width="12" height="14" rx="2.5" fill="#1F1B18"/><path d="M18 6H58L64 26H12z" fill="#7AA294"/><path d="M21 9H55L60 24H16z" fill="#2B3442"/><path d="M27 24l8-13h5l-8 13z" fill="#6A7F8A" opacity="0.6"/><rect x="3" y="24" width="70" height="24" rx="6" fill="#8FB5A6"/><rect x="26" y="31" width="24" height="9" rx="2" fill="#2E2B28"/><circle cx="14" cy="34" r="5" fill="#FFF2CF"/><circle cx="62" cy="34" r="5" fill="#FFF2CF"/><rect x="3" y="43" width="70" height="6" rx="2.5" fill="#C9C2B4"/>`;
const CARS = {
  carA: { w: 76, h: 62, svg: CAR_A }, carB: { w: 80, h: 72, svg: CAR_B }, carD: { w: 76, h: 60, svg: CAR_D },
};

// Three-quarter vehicles, drawn with a small oblique projector: P(u across, w along, v up) → [x, y].
// Front faces the viewer (lower left), the side recedes to the upper right, like a vehicle coming down
// the left lane toward the camera. Original drawings (the game's own RV + county cruiser palettes).
function oblique(o, Wv, Dv, Hv) {
  return (u, w, v) => [o[0] + u * Wv[0] + w * Dv[0], o[1] + u * Wv[1] + w * Dv[1] - v * Hv];
}
function faceF(P, u0, u1, w, v0, v1) { return poly([P(u0, w, v0), P(u1, w, v0), P(u1, w, v1), P(u0, w, v1)]); }
function faceR(P, u, w0, w1, v0, v1) { return poly([P(u, w0, v0), P(u, w1, v0), P(u, w1, v1), P(u, w0, v1)]); }
function faceT(P, u0, u1, w0, w1, v) { return poly([P(u0, w0, v), P(u1, w0, v), P(u1, w1, v), P(u0, w1, v)]); }
function sideWheel(P, Dv, Hv, w, rw, rv, u = 1) {
  const [cx, cy] = P(u, w, rv);
  const m = (k) => `matrix(${f2(Dv[0] * rw * k)} ${f2(Dv[1] * rw * k)} 0 ${f2(Hv * rv * k)} ${f1(cx)} ${f1(cy)})`;
  return `<circle r="1.12" fill="#3A322C" transform="${m(1)}"/><circle r="1" fill="#2A2522" transform="${m(1)}"/><circle r="0.48" fill="#8A857E" transform="${m(1)}"/><circle r="0.2" fill="#5E5750" transform="${m(1)}"/>`;
}

function buildRV() {
  const o = [16, 166], Wv = [74, 8], Dv = [96, -42], Hv = 100;
  const P = oblique(o, Wv, Dv, Hv);
  const cream = '#EFE6D2', side = '#E2D6BC', top = '#F6EFE0', teal = '#3F8A82', mustard = '#D9A83A', rust = '#B5543C';
  const glass = '#2E3A40', frame = '#9A6B3C';
  let s = '';
  // ground shadow + the left wheels peeking under the front
  s += `<path d="${poly([P(-0.06, -0.03, 0), P(1.1, -0.03, 0), P(1.1, 1.03, 0), P(-0.06, 1.03, 0)])}" fill="rgba(70,40,20,0.28)"/>`;
  s += `<path d="${faceF(P, 0.07, 0.25, 0.08, 0, 0.12)}" fill="#2A2522"/>`;
  // living box: top + right side
  s += `<path d="${faceT(P, 0, 1, 0.27, 1, 1)}" fill="${top}"/>`;
  s += `<path d="${faceR(P, 1, 0.27, 1, 0.1, 1)}" fill="${side}"/>`;
  s += `<path d="${faceR(P, 1, 0.27, 1, 0.1, 0.28)}" fill="${teal}"/>`;
  s += `<path d="${faceR(P, 1, 0.27, 1, 0.3, 0.32)}" fill="${mustard}"/>`;
  s += `<path d="${faceR(P, 1, 0.27, 1, 0.8, 0.83)}" fill="${teal}"/>`;
  s += `<path d="${faceR(P, 1, 0.27, 1, 0.845, 0.86)}" fill="${mustard}"/>`;
  // windows (wood frames, the last one rust like the in-game model)
  for (const [w0, w1, v0, v1, fc] of [[0.45, 0.57, 0.45, 0.71, frame], [0.64, 0.79, 0.45, 0.71, frame], [0.88, 0.95, 0.48, 0.69, rust]]) {
    s += `<path d="${faceR(P, 1, w0, w1, v0, v1)}" fill="${fc}"/>`;
    s += `<path d="${faceR(P, 1, w0 + 0.012, w1 - 0.012, v0 + 0.03, v1 - 0.03)}" fill="${glass}"/>`;
    s += `<path d="${faceR(P, 1, w0 + 0.02, w0 + 0.045, v0 + 0.05, v1 - 0.05)}" fill="#6E8790" opacity="0.5"/>`;
  }
  // the rust-red side door with its little window and handle
  s += `<path d="${faceR(P, 1, 0.305, 0.385, 0.12, 0.75)}" fill="${rust}"/>`;
  s += `<path d="${faceR(P, 1, 0.305, 0.385, 0.12, 0.75)}" fill="none" stroke="#7E3524" stroke-width="0.9"/>`;
  s += `<path d="${faceR(P, 1, 0.32, 0.37, 0.52, 0.68)}" fill="${glass}"/>`;
  s += `<path d="${faceR(P, 1, 0.362, 0.374, 0.4, 0.43)}" fill="#E9DFC8"/>`;
  // roof: AC unit + the roof vent with its crooked chimney (the smoke comes out of it)
  s += `<path d="${faceT(P, 0.3, 0.7, 0.4, 0.56, 1.07)}" fill="#B3AE88"/>`;
  s += `<path d="${faceR(P, 0.7, 0.4, 0.56, 1, 1.07)}" fill="#8C8A6A"/>`;
  s += `<path d="${faceF(P, 0.3, 0.7, 0.4, 1, 1.07)}" fill="#A09D7A"/>`;
  for (let i = 1; i < 4; i++) { const w = 0.4 + i * 0.04; s += `<path d="M${P(0.36, w, 1.07).map(f1).join(' ')}L${P(0.64, w, 1.07).map(f1).join(' ')}" stroke="#8C8A6A" stroke-width="0.9"/>`; }
  s += `<path d="${faceT(P, 0.44, 0.64, 0.75, 0.85, 1.03)}" fill="#D8CDB5"/>`;
  s += `<path d="${faceR(P, 0.64, 0.75, 0.85, 1, 1.03)}" fill="#B9AE96"/>`;
  s += `<path d="${faceF(P, 0.44, 0.64, 0.75, 1, 1.03)}" fill="#CDC2AC"/>`;
  const [bx, by] = P(0.54, 0.8, 1.03);
  const chim = [[bx, by], [bx, by - 13], [bx + 5, by - 19], [bx + 5, by - 23]];
  s += `<path d="M${chim.map((p) => `${f1(p[0])} ${f1(p[1])}`).join('L')}" fill="none" stroke="#9C9486" stroke-width="3.2" stroke-linejoin="round"/>`;
  s += `<rect x="${f1(chim[3][0] - 5)}" y="${f1(chim[3][1] - 3)}" width="10" height="3.4" rx="1" fill="#7E776B"/>`;
  // cab: side, hood, windshield, front
  s += `<path d="${poly([P(0.97, 0, 0.1), P(0.97, 0.27, 0.1), P(0.97, 0.27, 0.64), P(0.97, 0.16, 0.64), P(0.97, 0.08, 0.42), P(0.97, 0, 0.36)])}" fill="${side}"/>`;
  s += `<path d="${faceR(P, 0.97, 0, 0.27, 0.1, 0.28)}" fill="${teal}"/>`;
  s += `<path d="${faceR(P, 0.97, 0, 0.27, 0.3, 0.32)}" fill="${mustard}"/>`;
  s += `<path d="${poly([P(0.97, 0.13, 0.45), P(0.97, 0.25, 0.45), P(0.97, 0.25, 0.62), P(0.97, 0.165, 0.62)])}" fill="${glass}"/>`;
  s += `<path d="${poly([P(0.03, 0, 0.36), P(0.97, 0, 0.36), P(0.97, 0.08, 0.42), P(0.03, 0.08, 0.42)])}" fill="#F4ECDA"/>`;
  s += `<path d="${poly([P(0.05, 0.08, 0.42), P(0.95, 0.08, 0.42), P(0.95, 0.16, 0.64), P(0.05, 0.16, 0.64)])}" fill="${glass}"/>`;
  s += `<path d="${poly([P(0.22, 0.08, 0.42), P(0.36, 0.08, 0.42), P(0.5, 0.16, 0.64), P(0.4, 0.16, 0.64)])}" fill="#6E8790" opacity="0.5"/>`;
  s += `<path d="${faceF(P, 0.03, 0.97, 0, 0.1, 0.36)}" fill="${cream}"/>`;
  s += `<path d="${faceF(P, 0.03, 0.97, 0, 0.12, 0.2)}" fill="${teal}"/>`;
  s += `<path d="${faceF(P, 0.03, 0.97, 0, 0.21, 0.225)}" fill="${mustard}"/>`;
  s += `<path d="${faceF(P, 0.3, 0.7, 0, 0.235, 0.33)}" fill="#3A3530"/>`;
  for (const v of [0.26, 0.285, 0.31]) s += `<path d="M${P(0.32, 0, v).map(f1).join(' ')}L${P(0.68, 0, v).map(f1).join(' ')}" stroke="#5E5750" stroke-width="1"/>`;
  s += `<path d="${faceF(P, 0.07, 0.23, 0, 0.24, 0.32)}" fill="#FFF2C8"/><path d="${faceF(P, 0.77, 0.93, 0, 0.24, 0.32)}" fill="#FFF2C8"/>`;
  s += `<path d="${faceF(P, -0.02, 1.02, 0, 0.05, 0.12)}" fill="#B8B2A6"/>`;
  s += `<path d="${faceF(P, 0.42, 0.58, 0, 0.065, 0.11)}" fill="#F1EAD8"/>`;
  // over-cab bunk with its little front window
  s += `<path d="${faceT(P, 0.02, 0.98, 0.04, 0.27, 0.97)}" fill="${top}"/>`;
  s += `<path d="${faceR(P, 0.98, 0.04, 0.27, 0.64, 0.97)}" fill="${side}"/>`;
  s += `<path d="${faceR(P, 0.98, 0.04, 0.27, 0.8, 0.83)}" fill="${teal}"/>`;
  s += `<path d="${faceR(P, 0.98, 0.04, 0.27, 0.845, 0.86)}" fill="${mustard}"/>`;
  s += `<path d="${faceF(P, 0.02, 0.98, 0.04, 0.64, 0.97)}" fill="${cream}"/>`;
  s += `<path d="${faceF(P, 0.02, 0.98, 0.04, 0.64, 0.68)}" fill="#D9CEB6"/>`;
  s += `<path d="${faceF(P, 0.28, 0.72, 0.04, 0.74, 0.89)}" fill="${frame}"/><path d="${faceF(P, 0.31, 0.69, 0.04, 0.765, 0.865)}" fill="${glass}"/>`;
  s += `<path d="${faceF(P, 0.02, 0.98, 0.04, 0.8, 0.83)}" fill="${teal}"/><path d="${faceF(P, 0.02, 0.28, 0.04, 0.845, 0.86)}" fill="${mustard}"/><path d="${faceF(P, 0.72, 0.98, 0.04, 0.845, 0.86)}" fill="${mustard}"/>`;
  // right-side wheels + mirrors
  s += sideWheel(P, Dv, Hv, 0.16, 0.06, 0.13, 0.985) + sideWheel(P, Dv, Hv, 0.76, 0.06, 0.13, 1.0);
  const ml = P(-0.03, 0.1, 0.47), mr = P(1.03, 0.1, 0.47);
  s += `<path d="M${f1(ml[0] + 6)} ${f1(ml[1] + 2)}H${f1(ml[0])}" stroke="#2A2522" stroke-width="1.6"/><rect x="${f1(ml[0] - 5)}" y="${f1(ml[1] - 6)}" width="5" height="11" rx="1.2" fill="#2A2522"/>`;
  s += `<path d="M${f1(mr[0] - 6)} ${f1(mr[1] + 2)}H${f1(mr[0])}" stroke="#2A2522" stroke-width="1.6"/><rect x="${f1(mr[0])}" y="${f1(mr[1] - 6)}" width="5" height="11" rx="1.2" fill="#2A2522"/>`;
  const anchor = P(0.5, 0, 0);
  return { w: 206, h: 182, svg: s, ax: f1(anchor[0]), ay: f1(anchor[1]), front: Math.hypot(Wv[0], Wv[1]), smoke: [f1(chim[3][0]), f1(chim[3][1] - 4)] };
}

function buildCop() {
  const o = [14, 122], Wv = [66, 7], Dv = [86, -36], Hv = 52;
  const P = oblique(o, Wv, Dv, Hv);
  const navy = '#1E2740', navyHi = '#2C3756', navySide = '#18203A', white = '#ECE8E0', glass = '#2B3442';
  let s = '';
  s += `<path d="${poly([P(-0.06, -0.04, 0), P(1.1, -0.04, 0), P(1.1, 1.04, 0), P(-0.06, 1.04, 0)])}" fill="rgba(60,35,15,0.28)"/>`;
  s += `<path d="${faceF(P, 0.08, 0.26, 0.17, 0, 0.2)}" fill="#1A1714"/>`;
  // lower body
  s += `<path d="${faceT(P, 0, 1, 0, 1, 0.55)}" fill="${navyHi}"/>`;
  s += `<path d="${faceR(P, 1, 0, 1, 0.16, 0.55)}" fill="${navySide}"/>`;
  s += `<path d="${faceR(P, 1, 0.3, 0.72, 0.18, 0.55)}" fill="${white}"/>`;
  s += `<path d="M${P(1, 0.51, 0.18).map(f1).join(' ')}L${P(1, 0.51, 0.55).map(f1).join(' ')}" stroke="#B9B4AA" stroke-width="0.8"/>`;
  const [sx, sy] = P(1, 0.4, 0.37);
  s += `<path d="M${f1(sx)} ${f1(sy - 4)}l1.1 2.6 2.8 .3-2.1 1.9.6 2.8-2.4-1.4-2.4 1.4.6-2.8-2.1-1.9 2.8-.3z" fill="#D9A83A"/>`;
  s += `<path d="${faceR(P, 1, 0, 1, 0.28, 0.3)}" fill="#0F1424" opacity="0.6"/>`;
  // cabin: windshield, side glass with a white pillar, white roof
  s += `<path d="${poly([P(0.94, 0.3, 0.55), P(0.94, 0.76, 0.55), P(0.94, 0.66, 1), P(0.94, 0.42, 1)])}" fill="${glass}"/>`;
  s += `<path d="${faceR(P, 0.94, 0.535, 0.56, 0.55, 1)}" fill="${white}"/>`;
  s += `<path d="${faceT(P, 0.06, 0.94, 0.42, 0.66, 1)}" fill="${white}"/>`;
  s += `<path d="${poly([P(0.06, 0.3, 0.55), P(0.94, 0.3, 0.55), P(0.94, 0.42, 1), P(0.06, 0.42, 1)])}" fill="${glass}"/>`;
  s += `<path d="${poly([P(0.2, 0.3, 0.55), P(0.34, 0.3, 0.55), P(0.48, 0.42, 1), P(0.38, 0.42, 1)])}" fill="#5F7280" opacity="0.6"/>`;
  // light bar (the flashing overlays are HTML, see LIGHTS below) + antenna
  s += `<path d="${faceT(P, 0.14, 0.86, 0.48, 0.58, 1.12)}" fill="#3A3A40"/>`;
  s += `<path d="${faceF(P, 0.14, 0.5, 0.48, 1, 1.12)}" fill="#2A4E9C"/><path d="${faceF(P, 0.5, 0.86, 0.48, 1, 1.12)}" fill="#9C2A26"/>`;
  s += `<path d="${faceR(P, 0.86, 0.48, 0.58, 1, 1.12)}" fill="#7A2420"/>`;
  s += `<path d="M${P(0.3, 0.64, 1).map(f1).join(' ')}l-1 -24" stroke="#1A1714" stroke-width="1"/>`;
  // front: grille, lamps, push bar
  s += `<path d="${faceF(P, 0, 1, 0, 0.16, 0.55)}" fill="${navy}"/>`;
  s += `<path d="${faceF(P, 0.3, 0.7, 0, 0.28, 0.44)}" fill="#10141E"/>`;
  s += `<path d="${faceF(P, 0.06, 0.24, 0, 0.32, 0.44)}" fill="#EDE7D6"/><path d="${faceF(P, 0.76, 0.94, 0, 0.32, 0.44)}" fill="#EDE7D6"/>`;
  s += `<path d="${faceF(P, 0.27, 0.73, -0.03, 0.08, 0.5)}" fill="none" stroke="#0D0D0D" stroke-width="2.6"/>`;
  s += `<path d="M${P(0.27, -0.03, 0.22).map(f1).join(' ')}L${P(0.73, -0.03, 0.22).map(f1).join(' ')}M${P(0.27, -0.03, 0.36).map(f1).join(' ')}L${P(0.73, -0.03, 0.36).map(f1).join(' ')}" stroke="#0D0D0D" stroke-width="2.4"/>`;
  s += `<path d="${faceF(P, -0.02, 1.02, 0, 0.1, 0.18)}" fill="#3A3A40"/>`;
  s += sideWheel(P, Dv, Hv, 0.2, 0.065, 0.2) + sideWheel(P, Dv, Hv, 0.8, 0.065, 0.2);
  const mr = P(1.02, 0.31, 0.6), ml = P(-0.02, 0.31, 0.6);
  s += `<rect x="${f1(mr[0])}" y="${f1(mr[1] - 3)}" width="4" height="5" rx="1" fill="${navy}"/><rect x="${f1(ml[0] - 4)}" y="${f1(ml[1] - 3)}" width="4" height="5" rx="1" fill="${navy}"/>`;
  const a = P(0.5, 0, 0);
  const bl = [P(0.14, 0.48, 1.12), P(0.5, 0.48, 1)], rd = [P(0.5, 0.48, 1.12), P(0.86, 0.48, 1)];
  const box = (q) => ({ x: f1(Math.min(q[0][0], q[1][0])), y: f1(Math.min(q[0][1], q[1][1]) - 1), w: f1(Math.abs(q[1][0] - q[0][0])), h: f1(Math.abs(q[1][1] - q[0][1]) + 3) });
  return { w: 176, h: 132, svg: s, ax: f1(a[0]), ay: f1(a[1]), front: Math.hypot(Wv[0], Wv[1]), lights: { blue: box(bl), red: box(rd) } };
}

const RV = buildRV();
const COP = buildCop();

export function symbolsSVG(pre) {
  let s = '';
  for (let i = 0; i < 4; i++) s += bushSym(`${pre}bush${i}`, 101 + i * 37);
  s += `<symbol id="${pre}cactus" viewBox="0 0 34 50" overflow="visible">${CACTUS}</symbol>`;
  s += `<symbol id="${pre}tank" viewBox="0 0 60 24" overflow="visible">${TANK}</symbol>`;
  s += `<symbol id="${pre}pjframe" viewBox="0 0 34 31" overflow="visible">${PJ_FRAME}</symbol>`;
  s += `<symbol id="${pre}pjcrank" viewBox="0 0 8 8" overflow="visible">${PJ_CRANK}</symbol>`;
  s += `<symbol id="${pre}pjbeam" viewBox="0 0 38 8" overflow="visible">${PJ_BEAM}</symbol>`;
  s += `<symbol id="${pre}tumble" viewBox="0 0 40 40" overflow="visible">${TUMBLE}</symbol>`;
  s += `<symbol id="${pre}vulture" viewBox="0 0 20 10" overflow="visible">${VULTURE}</symbol>`;
  for (const [k, c] of Object.entries(CARS)) s += `<symbol id="${pre}${k}" viewBox="0 0 ${c.w} ${c.h}" overflow="visible">${c.svg}</symbol>`;
  s += `<symbol id="${pre}rv" viewBox="0 0 ${RV.w} ${RV.h}" overflow="visible">${RV.svg}</symbol>`;
  s += `<symbol id="${pre}cop" viewBox="0 0 ${COP.w} ${COP.h}" overflow="visible">${COP.svg}</symbol>`;
  return s;
}

// ── the static backdrop: sky, sun glow, mesas, ground, road, haze ──────────────
const MESAS = {
  wide: {
    far: [[0, -62], [64, -64], [92, -86], [196, -88], [220, -64], [330, -60], [360, -46], [500, -44], [530, -32], [560, -28], [590, -22], [700, -20], [738, -32], [772, -56], [870, -58], [898, -80], [1016, -84], [1040, -56], [1150, -54], [1176, -70], [1280, -68]],
    near: [[0, -28], [36, -30], [64, -54], [156, -58], [182, -32], [262, -18], [450, -16], [484, -24], [540, -20], [562, -10], [712, -9], [736, -18], [790, -20], [812, -46], [824, -58], [930, -60], [944, -36], [1030, -26], [1100, -24], [1120, -40], [1200, -42], [1216, -26], [1280, -26]],
    w: 1280,
  },
  tall: {
    far: [[0, -44], [40, -46], [60, -60], [130, -62], [148, -40], [240, -36], [262, -22], [300, -20], [318, -34], [390, -36]],
    near: [[0, -18], [30, -20], [48, -34], [110, -36], [124, -14], [270, -10], [286, -24], [340, -26], [352, -14], [390, -14]],
    w: 390,
  },
};

function backdropSVG(L, pre) {
  const { W, H, Hy, cx, P, u } = L;
  const M = L.portrait ? MESAS.tall : MESAS.wide;
  const mu = L.portrait ? u : u * 1;
  const mesa = (pts) => `M0 ${Hy + 2}${pts.map(([x, y]) => `L${f1(x / M.w * W)} ${f1(Hy + y * mu)}`).join('')}L${W} ${Hy + 2}Z`;
  const sunR = (L.portrait ? 40 : 58) * u, sunY = Hy - (L.portrait ? 42 : 68) * u;
  let s = `<defs><linearGradient id="${pre}sky" x1="0" y1="0" x2="0" y2="${Hy}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.skyTop}"/><stop offset=".34" stop-color="${C.skyMid}"/><stop offset=".78" stop-color="${C.skyLow}"/><stop offset="1" stop-color="${C.skyHaze}"/></linearGradient>`;
  s += `<radialGradient id="${pre}glow" cx="${f1(cx)}" cy="${f1(sunY)}" r="${f1(sunR * 4.2)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="rgba(255,238,205,0.55)"/><stop offset="1" stop-color="rgba(255,238,205,0)"/></radialGradient>`;
  s += `<linearGradient id="${pre}far" x1="0" y1="${f1(Hy - 90 * mu)}" x2="0" y2="${Hy}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.farTop}"/><stop offset="1" stop-color="${C.farLow}"/></linearGradient>`;
  s += `<linearGradient id="${pre}near" x1="0" y1="${f1(Hy - 60 * mu)}" x2="0" y2="${Hy}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.nearTop}"/><stop offset="1" stop-color="${C.nearLow}"/></linearGradient>`;
  s += `<linearGradient id="${pre}gnd" x1="0" y1="${Hy}" x2="0" y2="${H}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.gndTop}"/><stop offset=".3" stop-color="${C.gndMid}"/><stop offset="1" stop-color="${C.gndLow}"/></linearGradient>`;
  s += `<linearGradient id="${pre}haze" x1="0" y1="${Hy - 22 * mu}" x2="0" y2="${Hy + 26 * mu}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="rgba(240,219,183,0)"/><stop offset=".5" stop-color="rgba(240,219,183,0.85)"/><stop offset="1" stop-color="rgba(240,219,183,0)"/></linearGradient></defs>`;
  s += `<rect width="${W}" height="${Hy + 4}" fill="url(#${pre}sky)"/><circle cx="${f1(cx)}" cy="${f1(sunY)}" r="${f1(sunR * 4.2)}" fill="url(#${pre}glow)"/>`;
  return { open: s, mesas: `<path d="${mesa(M.far)}" fill="url(#${pre}far)"/><path d="${mesa(M.near)}" fill="url(#${pre}near)"/>`, land: landSVG(L, pre), sunR, sunY };
}

function landSVG(L, pre) {
  const { W, H, Hy, cx, P, u } = L;
  let s = `<rect x="0" y="${Hy}" width="${W}" height="${P}" fill="url(#${pre}gnd)"/>`;
  // furrows: denser toward the horizon
  for (let off = 0.05 * 290 * Math.max(0.7, P / 290) * 0.35 + 9; off < P; off *= 1.163) {
    s += `<path d="M0 ${f1(Hy + off)}H${W}" stroke="rgba(120,72,38,0.075)" stroke-width="${f2(1 + off / 90)}"/>`;
  }
  // road: shoulder, asphalt, edge lines
  const yb = H + 60, R = roadHalf(L, yb);
  const top = Hy + 0.8;
  s += `<path d="M${f1(cx - 0.5)} ${top}L${f1(cx + 0.5)} ${top}L${f1(cx + R * SHOULDER)} ${yb}L${f1(cx - R * SHOULDER)} ${yb}Z" fill="${C.shoulder}"/>`;
  s += `<path d="M${f1(cx - 0.4)} ${top}L${f1(cx + 0.4)} ${top}L${f1(cx + R)} ${yb}L${f1(cx - R)} ${yb}Z" fill="${C.asphalt}"/>`;
  s += `<path d="M${f1(cx - 0.4)} ${top}L${f1(cx - R * 0.889)} ${yb}L${f1(cx - R * 0.958)} ${yb}Z" fill="${C.line}"/>`;
  s += `<path d="M${f1(cx + 0.4)} ${top}L${f1(cx + R * 0.889)} ${yb}L${f1(cx + R * 0.958)} ${yb}Z" fill="${C.line}"/>`;
  // centre dashes in perspective (d = depth, 1 at the bottom edge)
  for (let d = 1.08; d < 70; d += 0.82) {
    const y0 = Hy + P / (d + 0.265), y1 = Hy + P / d;
    if (y1 - y0 < 0.12) break;
    const h0 = Math.max(0.2, roadHalf(L, y0) * 0.035), h1 = Math.max(0.2, roadHalf(L, y1) * 0.035);
    s += `<path d="M${f1(cx - h0)} ${f1(y0)}L${f1(cx + h0)} ${f1(y0)}L${f1(cx + h1)} ${f1(y1)}L${f1(cx - h1)} ${f1(y1)}Z" fill="${C.dash}"/>`;
  }
  s += `<rect x="0" y="${f1(Hy - 22 * u)}" width="${W}" height="${f1(48 * u)}" fill="url(#${pre}haze)"/>`;
  return s;
}

// ── props ───────────────────────────────────────────────────────────────────
function cloudPath(w, h) {
  return `M${f1(.08 * w)} ${f1(h)}C${f1(-.02 * w)} ${f1(h)} 0 ${f1(.55 * h)} ${f1(.16 * w)} ${f1(.52 * h)}C${f1(.16 * w)} ${f1(.2 * h)} ${f1(.38 * w)} ${f1(.1 * h)} ${f1(.48 * w)} ${f1(.3 * h)}C${f1(.55 * w)} ${f1(-.05 * h)} ${f1(.82 * w)} 0 ${f1(.8 * w)} ${f1(.4 * h)}C${f1(.98 * w)} ${f1(.35 * h)} ${f1(1.04 * w)} ${f1(.95 * h)} ${f1(.9 * w)} ${f1(h)}Z`;
}
function clouds(L) {
  const list = L.portrait
    ? [[16 / 390, 40 / 372, 120, 30, 0.8], [250 / 390, 96 / 372, 110, 28, 0.7], [170 / 390, 178 / 372, 90, 22, 0.55]]
    : [[120 / 1280, 54 / 430, 210, 52, 0.85], [470 / 1280, 142 / 430, 130, 32, 0.7], [760 / 1280, 70 / 430, 170, 42, 0.8], [1010 / 1280, 40 / 430, 150, 38, 0.75], [1150 / 1280, 196 / 430, 120, 30, 0.6]];
  return list.map(([fx, fy, w, h, op], i) => ({ x: fx * L.W, y: fy * L.Hy, w: w * L.u, h: h * L.u, op, d: Math.round((14 + (i % 3) * 6) * L.u), dur: 13 + (i % 3) * 4, delay: -i * 3.1, rev: i % 2 === 1 }));
}

function rigs(L) {
  const { W, Hy, u } = L;
  if (L.portrait) {
    return [
      { k: 'pj', x: 326 / 390 * W, y: Hy, s: 0.75 * u, ph: -1.82 }, { k: 'pj', x: 20 / 390 * W, y: Hy, s: 0.7 * u, ph: -1.4 },
      { k: 'pj', x: 92 / 390 * W, y: Hy, s: 0.6 * u, ph: -0.44 }, { k: 'tank', x: 268 / 390 * W, y: Hy, s: 0.8 * u },
    ];
  }
  return [
    { k: 'tank', x: 742 / 1280 * W, y: Hy, s: 1 * u }, { k: 'pj', x: 832 / 1280 * W, y: Hy, s: 1 * u, ph: -1.24 },
    { k: 'pj', x: 878 / 1280 * W, y: Hy, s: 0.8 * u, ph: -1.46 }, { k: 'tank', x: 1010 / 1280 * W, y: Hy, s: 0.9 * u },
    { k: 'pj', x: 1110 / 1280 * W, y: Hy, s: 0.9 * u, ph: -2.7 }, { k: 'pj', x: 1250 / 1280 * W, y: Hy, s: 0.85 * u, ph: -0.5 },
    { k: 'pj', x: 36 / 1280 * W, y: Hy, s: 0.8 * u, ph: -2.52 },
    { k: 'tank', x: L.cx + (776 - 640) * u, y: Hy + 46 * u, s: 2.1 * u, near: true },
    { k: 'pj', x: L.cx - (640 - 506) * u, y: Hy + 38 * u, s: 2.3 * u, ph: -2.42, near: true },
  ];
}

// Bushes + cacti, scattered off the road with a fixed seed (so the boot splash matches the live scene).
function scatter(L) {
  const r = rng(L.portrait ? 7 : 3);
  const n = L.portrait ? 12 : Math.round(clamp(L.W / 58, 14, 30));
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 400) {
    const t = r();
    const off = 10 + Math.pow(t, 1.15) * (L.P - 10);
    const y = L.Hy + off;
    const s = objScale(L, y);
    const isCactus = out.length % 6 === 4;
    const w = (isCactus ? 34 : 60) * s;
    const edge = roadHalf(L, y) * SHOULDER + w * 0.6 + 8;
    const room = L.cx - edge + 20;                 // free ground on each side of the road
    if (room < w * 0.5) continue;
    const side = out.length % 2 ? 1 : -1;          // alternate sides so both verges get some
    const x = L.cx + side * (edge + r() * room);
    if (out.some((o) => Math.abs(o.x - x) < (o.w + w) * 0.45 && Math.abs(o.y - y) < Math.max(6, (o.s + s) * 14))) continue;
    out.push({ k: isCactus ? 'cactus' : 'bush', v: Math.floor(r() * 4), x, y, s, w, sway: !isCactus && s > 0.3 && r() < 0.7, ph: -(r() * 1.5).toFixed(2) });
  }
  return out.sort((a, b) => a.y - b.y);
}

// ── vehicle paths (Web Animations keyframes) ─────────────────────────────────
// z goes exponentially from z0 to z1 over `travel` ms (the mockups' constant visual speed); xf(t) is the
// lateral position in road half-widths; the vehicle is scaled so its front is `size` half-widths wide.
function pathFrames(L, { z0, z1, travel, period, xf, size, front, fadeIn, fadeOut }) {
  const N = 36;
  const frames = [];
  const vis = travel / period;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const z = z0 * Math.pow(z1 / z0, t);
    const y = L.Hy + L.P / z;
    const sc = Math.max(0.01, size * roadHalf(L, y) / front);
    const x = L.cx + xf(t) * roadHalf(L, y);
    let op = 1;
    if (fadeIn) op = Math.min(1, t / 0.08);
    if (fadeOut) op = Math.min(op, (1 - t) / 0.12);
    frames.push({ offset: +(t * vis).toFixed(5), transform: `translate(${f1(x)}px,${f1(y)}px) scale(${sc.toFixed(4)})`, opacity: +clamp(op, 0, 1).toFixed(2) });
  }
  if (vis < 1) {
    const last = frames[frames.length - 1];
    frames.push({ offset: Math.min(1, +(vis + 0.0001).toFixed(5)), transform: last.transform, opacity: 0 });
    if (vis + 0.0001 < 1) frames.push({ offset: 1, transform: last.transform, opacity: 0 });
  }
  return frames;
}

function trafficSpecs(L) {
  // z ranges from the mockups: going-away cars enter below the bottom edge and fade at the horizon
  const zNear = (sy) => L.P / (sy - L.Hy);
  const bottom = zNear(L.H + 330 * L.P / 290);
  const far = 13.5 * Math.max(1, L.P / 290);
  const half = L.phone;
  const period = half ? 12000 : 9000;
  const list = [
    { id: 'carA', z0: bottom, z1: far, travel: period * 0.667, period, delay: 0, xf: () => 0.534, size: 0.655, fadeOut: true },
    { id: 'carD', z0: far * 1.12, z1: bottom * 0.9, travel: period * 0.6, period, delay: half ? -6000 : -2100, xf: () => -0.551, size: 0.655, fadeIn: true },
  ];
  if (!half) list.splice(1, 0, { id: 'carB', z0: bottom * 0.92, z1: far * 0.95, travel: period * 0.644, period, delay: -1700, xf: () => 0.55, size: 0.68, fadeOut: true });
  return list;
}

// Phones: the menu is docked over the lower half, so the pass ends (and fades) just under the panel's top.
const passZ1 = (L) => (L.phone ? 2.2 : 0.36);
const rvSpec = (L) => ({ z0: 15 * Math.max(1, L.P / 290), z1: passZ1(L), travel: RV_DUR, period: RV_DUR, xf: (t) => -0.45 + 0.1 * Math.sin(t * Math.PI * 3.1) - 0.4 * t * t, size: 0.7, front: RV.front, fadeIn: true, fadeOut: L.phone });
const copSpec = (L) => ({ z0: 15 * Math.max(1, L.P / 290), z1: passZ1(L), travel: RV_DUR, period: RV_DUR, xf: (t) => 0.42 + 0.14 * Math.sin(t * Math.PI * 2.6 + 0.6), size: 0.64, front: COP.front, fadeIn: true, fadeOut: L.phone });

// ── markup builders ─────────────────────────────────────────────────────────
const svgUse = (pre, id, w, h, extra = '') => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible" aria-hidden="true" focusable="false"${extra}><use href="#${pre}${id}"/></svg>`;

function propHTML(L, p, pre) {
  if (p.k === 'bush' || p.k === 'cactus') {
    const [w, h] = p.k === 'bush' ? [60, 36] : [34, 50];
    const inner = svgUse(pre, p.k === 'bush' ? `bush${p.v}` : 'cactus', w, h);
    return `<div class="crs-p" style="left:${f1(p.x - w / 2)}px;top:${f1(p.y - h)}px;width:${w}px;height:${h}px;transform:scale(${p.s.toFixed(3)})">${p.sway ? `<div class="crs-a-sway" style="animation-delay:${p.ph}s">${inner}</div>` : inner}</div>`;
  }
  if (p.k === 'tank') {
    return `<div class="crs-p crs-p--rig" style="left:${f1(p.x)}px;top:${f1(p.y - 24)}px;width:60px;height:24px;transform:scale(${p.s.toFixed(3)})">${svgUse(pre, 'tank', 60, 24)}<i class="crs-flame crs-a-flick"></i><i class="crs-redlamp crs-a-blink"></i></div>`;
  }
  // pumpjack: static frame, turning crank, nodding beam
  return `<div class="crs-p crs-p--rig" style="left:${f1(p.x)}px;top:${f1(p.y - 31)}px;width:34px;height:31px;transform:scale(${p.s.toFixed(3)})">${svgUse(pre, 'pjframe', 34, 31)}`
    + `<div class="crs-pj-crank crs-a-crank" style="animation-delay:${p.ph}s">${svgUse(pre, 'pjcrank', 8, 8)}</div>`
    + `<div class="crs-pj-beam crs-a-nod" style="animation-delay:${p.ph}s">${svgUse(pre, 'pjbeam', 38, 8)}</div></div>`;
}

function vehicleHTML(pre, id, v) {
  return `<div class="crs-veh crs-veh--${id}" data-veh="${id}" style="left:${-v.w / 2}px;top:${-v.h}px;width:${v.w}px;height:${v.h}px">${svgUse(pre, id, v.w, v.h)}</div>`;
}

function rvHTML(pre) {
  let puffs = '';
  const cols = ['#F3EEE6', '#E2DCD2', '#F7F3EC', '#D8D2C7', '#EEE8DF', '#E6E0D6'];
  for (let i = 0; i < 6; i++) puffs += `<i class="crs-puff" style="left:${RV.smoke[0] - 9}px;top:${RV.smoke[1] - 9}px;background:${cols[i]};animation-delay:${(-i * 0.375).toFixed(3)}s"></i>`;
  return `<div class="crs-veh crs-rv" data-veh="rv" style="left:${-RV.ax}px;top:${-RV.ay}px;width:${RV.w}px;height:${RV.h}px;transform-origin:${RV.ax}px ${RV.ay}px">`
    + `<div class="crs-wig" style="transform-origin:${RV.ax}px ${RV.ay}px"><div class="crs-bob">${svgUse(pre, 'rv', RV.w, RV.h)}</div>${puffs}</div></div>`;
}

function copHTML(pre) {
  const { blue, red } = COP.lights;
  return `<div class="crs-veh crs-cop" data-veh="cop" style="left:${-COP.ax}px;top:${-COP.ay}px;width:${COP.w}px;height:${COP.h}px;transform-origin:${COP.ax}px ${COP.ay}px">`
    + `<div class="crs-bob">${svgUse(pre, 'cop', COP.w, COP.h)}`
    + `<i class="crs-lamp crs-lamp--b" style="left:${blue.x}px;top:${blue.y}px;width:${blue.w}px;height:${blue.h}px"></i>`
    + `<i class="crs-lamp crs-lamp--r" style="left:${red.x}px;top:${red.y}px;width:${red.w}px;height:${red.h}px"></i>`
    + `<i class="crs-glow crs-glow--b" style="left:${f1(blue.x + blue.w / 2 - 16)}px;top:${f1(blue.y - 12)}px"></i>`
    + `<i class="crs-glow crs-glow--r" style="left:${f1(red.x + red.w / 2 - 16)}px;top:${f1(red.y - 12)}px"></i></div></div>`;
}

function sceneHTML(L, pre) {
  const bd = backdropSVG(L, pre);
  let h = `<svg class="crs-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>${symbolsSVG(pre)}</defs></svg>`;
  h += `<svg class="crs-layer" width="${L.W}" height="${L.H}" viewBox="0 0 ${L.W} ${L.H}" aria-hidden="true" focusable="false">${bd.open}</svg>`;
  const hr = bd.sunR * 1.28;
  h += `<i class="crs-halo crs-a-halo" style="left:${f1(L.cx - hr)}px;top:${f1(bd.sunY - hr)}px;width:${f1(hr * 2)}px;height:${f1(hr * 2)}px"></i>`;
  h += `<i class="crs-sun" style="left:${f1(L.cx - bd.sunR)}px;top:${f1(bd.sunY - bd.sunR)}px;width:${f1(bd.sunR * 2)}px;height:${f1(bd.sunR * 2)}px"></i>`;
  for (const c of clouds(L)) {
    h += `<svg class="crs-cloud crs-a-drift" width="${f1(c.w)}" height="${f1(c.h)}" viewBox="0 0 ${f1(c.w)} ${f1(c.h)}" aria-hidden="true" style="left:${f1(c.x)}px;top:${f1(c.y)}px;opacity:${c.op};--d:${c.d}px;animation-duration:${c.dur}s;animation-delay:${c.delay.toFixed(1)}s${c.rev ? ';animation-direction:alternate-reverse' : ''}"><path d="${cloudPath(c.w, c.h)}" fill="${C.cloud}"/></svg>`;
  }
  h += `<svg class="crs-layer" width="${L.W}" height="${L.H}" viewBox="0 0 ${L.W} ${L.H}" aria-hidden="true" focusable="false">${bd.mesas}${bd.land}</svg>`;
  const rg = rigs(L);
  for (const p of rg.filter((q) => !q.near)) h += propHTML(L, p, pre);
  // heat shimmer + the mirage pool on the road
  for (const [fx, dy, w, ph] of [[0.367, 3, 120, 0], [0.469, 7, 90, -0.55], [0.57, 4, 140, -1.1], [0.703, 9, 100, -1.65], [0.242, 8, 110, -2.2], [0.828, 2, 90, -2.75]]) {
    const ww = w * L.u;
    h += `<svg class="crs-shim crs-a-shim" width="${f1(ww)}" height="6" viewBox="0 0 ${f1(ww)} 6" aria-hidden="true" style="left:${f1(fx * L.W)}px;top:${f1(L.Hy + dy * L.u)}px;animation-delay:${ph}s"><path d="M0 3q${f1(ww / 8)} -3 ${f1(ww / 4)} 0t${f1(ww / 4)} 0t${f1(ww / 4)} 0t${f1(ww / 4)} 0" fill="none" stroke="#FFF6E6" stroke-width="1.2"/></svg>`;
  }
  h += `<i class="crs-mirage crs-a-mirage" style="left:${f1(L.cx - 26 * L.u)}px;top:${f1(L.Hy + 5 * L.u)}px;width:${f1(52 * L.u)}px;height:${f1(Math.max(3, 4 * L.u))}px"></i>`;
  for (const p of rg.filter((q) => q.near)) h += propHTML(L, p, pre);
  for (const p of scatter(L)) h += propHTML(L, p, pre);
  // tumbleweeds: one behind the traffic, one in front (phones: just the near one)
  const tw = (frac, id) => `<div class="crs-tumble" data-tumble="${id}" style="top:${f1(L.Hy + frac * L.P - 40)}px"><i class="crs-tumble-shadow"></i><div class="crs-a-hop"><div class="crs-a-spin">${svgUse(pre, 'tumble', 40, 40)}</div></div></div>`;
  if (!L.phone) h += tw(0.29, 'far');
  for (const t of trafficSpecs(L)) h += vehicleHTML(pre, t.id, CARS[t.id]);
  h += copHTML(pre) + rvHTML(pre);
  h += tw(L.phone ? 0.6 : 0.766, 'near');
  // vultures circling over the oil field
  const vc = L.portrait ? [300 / 390 * L.W, 236 / 372 * L.Hy] : [790 / 1280 * L.W, 216 / 430 * L.Hy];
  for (const [r, sz, d, fd] of [[34, 13, 0, 0], [52, 10, -3.1, -1.03]]) {
    h += `<div class="crs-vulture crs-a-circle" style="left:${f1(vc[0])}px;top:${f1(vc[1])}px;animation-delay:${d}s"><div class="crs-a-flap" style="left:${f1(r * L.u)}px;top:${f1(-sz * L.u / 2)}px;width:${f1(sz * L.u)}px;height:${f1(sz * L.u / 2)}px;animation-delay:${fd}s">${svgUse(pre, 'vulture', 20, 10, ` style="width:100%;height:100%"`)}</div></div>`;
  }
  h += `<i class="crs-scrim"></i>`;
  return h;
}

// ── standalone SVG (boot splash backgrounds) ────────────────────────────────
export function staticSceneSVG(W, H, { pre = 'b-' } = {}) {
  const L = sceneLayout(W, H);
  const bd = backdropSVG(L, pre);
  const SZ = { bush0: [60, 36], bush1: [60, 36], bush2: [60, 36], bush3: [60, 36], cactus: [34, 50], tank: [60, 24], pjframe: [34, 31], pjbeam: [38, 8], pjcrank: [8, 8], carA: [76, 62], carB: [80, 72], carD: [76, 60] };
  const use = (id, x, y, s) => `<use href="#${pre}${id}" width="${SZ[id][0]}" height="${SZ[id][1]}" transform="translate(${f1(x)} ${f1(y)}) scale(${s.toFixed(3)})"/>`;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.W} ${L.H}" width="${L.W}" height="${L.H}" preserveAspectRatio="xMidYMid slice">`;
  s += bd.open.replace('<defs>', `<defs>${symbolsSVG(pre)}`);
  const hr = bd.sunR * 1.28;
  s += `<circle cx="${f1(L.cx)}" cy="${f1(bd.sunY)}" r="${f1(hr)}" fill="${C.sun}" opacity=".42"/><circle cx="${f1(L.cx)}" cy="${f1(bd.sunY)}" r="${f1(bd.sunR)}" fill="${C.sun}"/>`;
  for (const c of clouds(L)) s += `<path transform="translate(${f1(c.x)} ${f1(c.y)})" d="${cloudPath(c.w, c.h)}" fill="${C.cloud}" opacity="${c.op}"/>`;
  s += bd.mesas + bd.land;
  const rig = (p) => {
    if (p.k === 'tank') return use('tank', p.x, p.y - 24 * p.s, p.s) + `<ellipse cx="${f1(p.x + 55.5 * p.s)}" cy="${f1(p.y + (-24 - 10.5) * p.s)}" rx="${f1(2.5 * p.s)}" ry="${f1(4.5 * p.s)}" fill="#F7A73B"/>`;
    const tx = p.x, ty = p.y - 31 * p.s;
    return use('pjframe', tx, ty, p.s) + `<g transform="translate(${f1(tx)} ${f1(ty)}) scale(${p.s.toFixed(3)})"><g transform="translate(-6 4) rotate(-6 19 4)"><use href="#${pre}pjbeam" width="38" height="8"/></g><g transform="translate(24 20)"><use href="#${pre}pjcrank" width="8" height="8"/></g></g>`;
  };
  const rg = rigs(L);
  for (const p of rg.filter((q) => !q.near)) s += rig(p);
  for (const p of rg.filter((q) => q.near)) s += rig(p);
  for (const p of scatter(L)) {
    const [w, hh] = p.k === 'bush' ? [60, 36] : [34, 50];
    s += use(p.k === 'bush' ? `bush${p.v}` : 'cactus', p.x - (w / 2) * p.s, p.y - hh * p.s, p.s);
  }
  // two cars frozen mid-road, like Title-Loading.png
  for (const [id, t] of [['carA', L.portrait ? 0.42 : 0.3], ['carD', 0.6]]) {
    const spec = trafficSpecs(L).find((q) => q.id === id);
    const z = spec.z0 * Math.pow(spec.z1 / spec.z0, t);
    const y = L.Hy + L.P / z;
    const c = CARS[id];
    const sc = spec.size * roadHalf(L, y) / c.w;
    const x = L.cx + spec.xf(t) * roadHalf(L, y);
    s += use(id, x - (c.w / 2) * sc, y - c.h * sc, sc);
  }
  return `${s}</svg>`;
}

// ── the live scene ──────────────────────────────────────────────────────────
let uid = 0;

export class TitleScene {
  constructor(host, { reducedMotion } = {}) {
    this.host = host;
    this.pre = `crs${++uid}-`;
    this.mode = 'title';
    this.passes = 0;
    this.anims = [];
    this._rvAnims = [];
    this._rvTimer = null;
    this._destroyed = false;
    let mq = null;
    try { mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null; } catch { mq = null; }
    this.reduced = reducedMotion ?? !!(mq && mq.matches);
    this.el = document.createElement('div');
    this.el.className = 'crs';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.dataset.mode = this.mode;
    host.appendChild(this.el);
    this._onResize = () => {
      clearTimeout(this._rz);
      this._rz = setTimeout(() => { if (!this._destroyed) this._maybeRebuild(); }, 180);
    };
    window.addEventListener('resize', this._onResize);
    this._build();
    if (typeof window !== 'undefined') window.__titleScene = this;
  }

  _size() {
    const r = this.el.getBoundingClientRect();
    return [r.width || window.innerWidth || 1280, r.height || window.innerHeight || 720];
  }

  _maybeRebuild() {
    const [w, h] = this._size();
    if (this.L && Math.abs(w - this.L.W) < 2 && Math.abs(h - this.L.H) < 2) return;
    this._build();
  }

  _build() {
    this._stopAll();
    const [w, h] = this._size();
    const L = this.L = sceneLayout(w, h);
    this.el.classList.toggle('crs--phone', L.phone);
    this.el.innerHTML = sceneHTML(L, this.pre);
    this.veh = {};
    for (const v of this.el.querySelectorAll('[data-veh]')) this.veh[v.dataset.veh] = v;
    const canAnimate = typeof this.el.animate === 'function';
    if (!canAnimate) return;
    // traffic (loops)
    for (const t of trafficSpecs(L)) {
      const el = this.veh[t.id];
      const a = el.animate(pathFrames(L, { ...t, front: CARS[t.id].w }), { duration: t.period, iterations: Infinity, delay: t.delay, easing: 'linear' });
      this.anims.push(a);
    }
    // tumbleweeds roll left → right
    for (const tw of this.el.querySelectorAll('[data-tumble]')) {
      const y = parseFloat(tw.style.top) + 40;
      const sc = Math.max(0.15, objScale(L, y));
      const near = tw.dataset.tumble === 'near';
      const kf = [
        { offset: 0, transform: `translateX(-80px) scale(${sc.toFixed(3)})`, opacity: 1 },
        { offset: 0.88, transform: `translateX(${L.W + 80}px) scale(${sc.toFixed(3)})`, opacity: 1 },
        { offset: 0.881, transform: `translateX(${L.W + 80}px) scale(${sc.toFixed(3)})`, opacity: 0 },
        { offset: 1, transform: `translateX(-80px) scale(${sc.toFixed(3)})`, opacity: 0 },
      ];
      this.anims.push(tw.animate(kf, { duration: near ? 9000 : 11000, iterations: Infinity, delay: near ? -8400 : -3900, easing: 'linear' }));
    }
    // the RV (+ cop) pass, driven by a timer so the test hook / mode switches can start or skip it
    this._rvAnims = [
      this.veh.rv.animate(pathFrames(L, rvSpec(L)), { duration: RV_DUR, fill: 'none', easing: 'linear' }),
      this.veh.cop.animate(pathFrames(L, copSpec(L)), { duration: RV_DUR, delay: COP_LAG, fill: 'none', easing: 'linear' }),
    ];
    for (const a of this._rvAnims) { a.cancel(); a.onfinish = () => this._rvDone(); }
    if (this.reduced) {
      // one static frame: traffic frozen mid-road, no RV
      for (const a of this.anims) { a.pause(); a.currentTime = 2600; }
      return;
    }
    this._schedule(this.passes === 0 ? 2400 : 6000);
  }

  _schedule(ms) {
    clearTimeout(this._rvTimer);
    this._rvTimer = setTimeout(() => {
      if (this._destroyed) return;
      if (this.mode === 'title' && !document.hidden && !this.driving) this.rvPass({ auto: true });
      this._schedule(RV_EVERY);
    }, ms);
  }

  /** Send the RV down the road now. `cop` defaults to every other pass (the first one has a cop). */
  rvPass({ cop, auto = false } = {}) {
    if (this._destroyed || !this._rvAnims.length) return false;
    if (!auto && !this.reduced) this._schedule(RV_EVERY);   // a manual pass resets the 18 s clock
    const withCop = cop ?? this.passes % 2 === 0;
    this.passes += 1;
    const [rv, cp] = this._rvAnims;
    this.veh.rv.classList.add('is-driving');
    rv.cancel(); rv.play();
    cp.cancel();
    if (withCop) { this.veh.cop.classList.add('is-driving'); cp.play(); } else this.veh.cop.classList.remove('is-driving');
    this.lastPass = { at: Date.now(), cop: withCop };
    return true;
  }

  /** Test hook: pause every Web Animation; the RV pass is shown `ms` into its run (cop included). */
  freeze(ms = 3000, { cop = true } = {}) {
    if (!this._rvAnims.length) return false;
    const [rv, cp] = this._rvAnims;
    this.veh.rv.classList.add('is-driving');
    this.veh.cop.classList.toggle('is-driving', cop);
    for (const a of this.anims) a.pause();
    rv.pause(); rv.currentTime = ms;
    if (cop) { cp.pause(); cp.currentTime = ms; } else cp.cancel();
    clearTimeout(this._rvTimer);
    return true;
  }

  get driving() { return this._rvAnims.some((a) => a.playState === 'running'); }

  _rvDone() {
    const [rv, cp] = this._rvAnims;
    if (rv && rv.playState !== 'running') this.veh.rv.classList.remove('is-driving');
    if (cp && cp.playState !== 'running') this.veh.cop.classList.remove('is-driving');
  }

  setMode(mode) {
    this.mode = mode;
    this.el.dataset.mode = mode;
  }

  stats() {
    return {
      mode: this.mode, reduced: this.reduced, layout: this.L && { W: this.L.W, H: this.L.H, horizon: this.L.Hy, phone: this.L.phone },
      traffic: trafficSpecs(this.L).length, running: this.anims.filter((a) => a.playState === 'running').length,
      passes: this.passes, rvDriving: !!this.veh?.rv?.classList.contains('is-driving'), copDriving: !!this.veh?.cop?.classList.contains('is-driving'),
    };
  }

  _stopAll() {
    for (const a of [...this.anims, ...this._rvAnims]) { try { a.onfinish = null; a.cancel(); } catch { /* ignore */ } }
    this.anims = [];
    this._rvAnims = [];
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    clearTimeout(this._rvTimer);
    clearTimeout(this._rz);
    window.removeEventListener('resize', this._onResize);
    this._stopAll();
    this.el.remove();
    if (window.__titleScene === this) window.__titleScene = null;
  }
}

export function createTitleScene(host, opts) { return new TitleScene(host, opts); }
