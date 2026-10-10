// Test-only stand-in for ART's assets/index.js, written in ART's conventions (one shared
// vertex-colour material, MeshBasic lamps, cloneable emissive light materials, a CanvasTexture
// sign, a glossy Phong oil slick, a builder that throws, a KINDS_3D list that omits a kind).
// Used by view-test.html?assets=./test/mockAssets.js to exercise the real-asset code path.
import * as THREE from 'three';
import { createFallbackModel, FALLBACK_KINDS } from '../fallbackModels.js';

const VCOL = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, name: 'CR_Matte_VCol' });
const LAMP = new THREE.MeshBasicMaterial({ color: '#ffd98a', name: 'CR_Unlit_lamp' });
const GLOSS = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 90, specular: 0x777777, flatShading: true });
let signTex = null;
function sign() {
  if (signTex) return signTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#d9a83a'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#22262a'; g.font = 'bold 44px sans-serif'; g.fillText('EAT HERE', 18, 80);
  signTex = new THREE.CanvasTexture(c); signTex.colorSpace = THREE.SRGBColorSpace;
  return signTex;
}

export const KINDS_3D = FALLBACK_KINDS.filter((k) => k !== 'shack');

export function createModel(kind, variant = 0) {
  if (kind === 'mesa') throw new Error('mock: mesa builder broken');
  const m = createFallbackModel(kind, variant);
  m.traverse((o) => {
    if (!o.isMesh) return;
    const mat = o.material;
    const em = mat.emissive ? mat.emissive.r + mat.emissive.g + mat.emissive.b : 0;
    if (/^light_/.test(o.name)) { o.material = mat.clone(); o.material.emissiveIntensity = 0.1; return; }
    if (em > 0.01 && mat.emissiveIntensity >= 0.5) { o.material = LAMP; return; }
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = mat.color.r; col[i * 3 + 1] = mat.color.g; col[i * 3 + 2] = mat.color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.geometry = g;
    o.material = kind === 'oil_slick' ? GLOSS : VCOL;
  });
  if (kind === 'billboard') {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.4), new THREE.MeshLambertMaterial({ map: sign() }));
    p.position.set(0, 5.6, 0.16); m.add(p);
  }
  return m;
}
export function preloadAssets() { return new Promise((r) => setTimeout(r, 50)); }
