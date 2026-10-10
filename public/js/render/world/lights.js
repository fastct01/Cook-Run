// ─────────────────────────────────────────────────────────────────────────────
// Night lights (VIEW-WORLD-A): after ~18.5 h every street lamp in the loaded
// chunks gets a warm glowing head (one Points draw call) and a light pool on the
// ground (one InstancedMesh draw call). Lamp heads are collected per chunk while
// baking (LAMP_HEADS = model-space head offsets per kind).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { softDiscTexture } from '../textures.js';

export const LAMP_HEADS = {
  streetlight: [[0, 8.0, 2.6]],
};
const CAP = 600;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const UPQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

export class NightLights {
  constructor(scene) {
    this.scene = scene;
    const tex = softDiscTexture();
    this.poolMat = new THREE.MeshBasicMaterial({ color: '#ffc874', map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    this.poolGeo = new THREE.PlaneGeometry(1, 1);
    this.pools = new THREE.InstancedMesh(this.poolGeo, this.poolMat, CAP);
    this.pools.count = 0; this.pools.renderOrder = 4; this.pools.frustumCulled = false; this.pools.visible = false;
    this.headGeo = new THREE.BufferGeometry();
    this.headPos = new Float32Array(CAP * 3);
    this.headGeo.setAttribute('position', new THREE.BufferAttribute(this.headPos, 3));
    this.headGeo.setDrawRange(0, 0);
    this.headMat = new THREE.PointsMaterial({ color: '#ffe0a0', map: tex, size: 3.2, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    this.heads = new THREE.Points(this.headGeo, this.headMat);
    this.heads.frustumCulled = false; this.heads.renderOrder = 6; this.heads.visible = false;
    scene.add(this.pools, this.heads);
    this.key = '';
  }

  /** chunks: Map(ci → {lamps:[x,y,z,…]}) ; night 0..1 */
  update(chunks, night) {
    const on = night > 0.02;
    this.pools.visible = this.heads.visible = on;
    if (!on) return;
    this.poolMat.opacity = 0.42 * night;
    this.headMat.opacity = 0.95 * night;
    const key = [...chunks.keys()].join(',');
    if (key === this.key) return;
    this.key = key;
    let n = 0;
    for (const ch of chunks.values()) {
      const L = ch.lamps;
      if (!L) continue;
      for (let i = 0; i < L.length && n < CAP; i += 3, n++) {
        this.headPos[n * 3] = L[i]; this.headPos[n * 3 + 1] = L[i + 1] - 0.15; this.headPos[n * 3 + 2] = L[i + 2];
        _p.set(L[i], 0.06, L[i + 2]); _s.set(9, 9, 1);
        _m.compose(_p, UPQ, _s);
        this.pools.setMatrixAt(n, _m);
      }
    }
    this.pools.count = n;
    this.pools.instanceMatrix.needsUpdate = true;
    this.headGeo.attributes.position.needsUpdate = true;
    this.headGeo.setDrawRange(0, n);
  }

  dispose() {
    this.scene.remove(this.pools, this.heads);
    this.poolGeo.dispose(); this.poolMat.dispose(); this.headGeo.dispose(); this.headMat.dispose();
    this.pools.dispose();
  }
}
