// ─────────────────────────────────────────────────────────────────────────────
// Live rear-view mirrors for the first-person cab (rv_cab_fp).
//   const m = new Mirrors(cab, { rvLength, rvHeight, hz: 20, far: 150 });
//   m.render(renderer, scene, mainCamera, dt)   // from view.addPreRender — renders AT MOST one
//                                               // mirror per frame, round-robin (~hz each)
//   m.stats → { calls, renders, last }         // draw calls of the last mirror pass
//   m.dispose()
// Each glass plane gets its own small WebGLRenderTarget (mirror flip: map.repeat.x = −1,
// offset.x = 1). Side mirrors look back along the RV flanks (slightly outward); the centre
// mirror is fed by a rear camera at the back of the RV roof (the real one would only show the
// lab's back wall). Mirror passes skip the shadow-map update and the cab itself, use a short far
// plane, and a mirror outside the driver's view frustum (head turned away) is skipped.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const RV_LAYER = 1;
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _frustum = new THREE.Frustum(), _pv = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export class Mirrors {
  constructor(cab, { rvLength = 8.6, rvHeight = 3.4, hz = 20, far = 150, scale = 1 } = {}) {
    this.cab = cab;
    this.frame = cab.getObjectByName('rv_frame') || cab;
    this.hz = hz;
    this.budget = 1;
    this.idx = 0;
    this.stats = { calls: 0, renders: 0, last: '' };
    this.list = [];
    const defs = [
      // name, long side px, vertical fov, local camera setup
      { name: 'mirror_l_glass', long: 256 * scale, fov: 34, side: 1 },
      { name: 'mirror_r_glass', long: 256 * scale, fov: 34, side: -1 },
      { name: 'mirror_c_glass', long: 320 * scale, fov: 15, side: 0 },
    ];
    for (const d of defs) {
      const mesh = cab.getObjectByName(d.name);
      if (!mesh || !mesh.isMesh) continue;
      const gp = mesh.geometry.parameters || {};
      const w = gp.width || 0.2, h = gp.height || 0.3;
      const aspect = w / h;
      const W = aspect >= 1 ? Math.round(d.long) : Math.max(32, Math.round(d.long * aspect));
      const H = aspect >= 1 ? Math.max(24, Math.round(d.long / aspect)) : Math.round(d.long);
      const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, stencilBuffer: false, samples: 0 });
      rt.texture.name = 'mirror_' + d.name;
      rt.texture.generateMipmaps = false;
      rt.texture.minFilter = THREE.LinearFilter;
      rt.texture.magFilter = THREE.LinearFilter;
      rt.texture.wrapS = THREE.RepeatWrapping;
      rt.texture.repeat.x = -1;                 // mirror flip (UV u runs left→right as Rook sees it)
      rt.texture.offset.x = 1;
      const mat = new THREE.MeshBasicMaterial({ map: rt.texture, color: 0xd9dfe2, name: 'CR_MirrorLive', fog: false });
      mesh.material = mat;
      const cam = new THREE.PerspectiveCamera(d.fov, aspect, 0.3, far);
      cam.layers.set(0); cam.layers.enable(RV_LAYER);
      // local (RV-frame) camera pose
      const lp = new THREE.Vector3(), lq = new THREE.Quaternion();
      if (d.side === 0) {
        lp.set(0, Math.max(2.2, rvHeight - 0.55), -rvLength / 2 - 0.25);
        const dir = new THREE.Vector3(0, -0.07, -1).normalize();
        lq.setFromRotationMatrix(_m.lookAt(lp, lp.clone().add(dir), UP));
      } else {
        lp.copy(mesh.position).add(new THREE.Vector3(0.06 * d.side, 0.04, -0.04));
        const yawOut = 0.15 * d.side;           // ~9° outward: the flank shows on the inner edge
        const dir = new THREE.Vector3(Math.sin(yawOut), -0.05, -Math.cos(yawOut)).normalize();
        lq.setFromRotationMatrix(_m.lookAt(lp, lp.clone().add(dir), UP));
      }
      this.list.push({ name: d.name, mesh, rt, mat, cam, lp, lq, period: 1 / hz, age: 1, calls: 0 });
    }
  }

  /** Render at most one due mirror this frame (each visible mirror ≈ hz; off-screen mirrors cost nothing). */
  render(renderer, scene, mainCamera, dt) {
    if (!this.list.length) return;
    // frustum of the driver's camera (skip mirrors the head is turned away from)
    mainCamera.updateMatrixWorld();
    _pv.multiplyMatrices(mainCamera.projectionMatrix, mainCamera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    this.cab.updateMatrixWorld(true);
    let visible = 0;
    for (const m of this.list) { m.age += dt; m.vis = _frustum.intersectsObject(m.mesh); if (m.vis) visible++; }
    this.visible = visible;
    if (!visible) return;
    this.budget = Math.min(1.5, this.budget + dt * this.hz * visible);
    if (this.budget < 1) return;
    let pick = null;
    for (let k = 0; k < this.list.length; k++) {
      const i = (this.idx + k) % this.list.length, m = this.list[i];
      if (!m.vis || m.age < m.period * 0.9) continue;
      pick = m; this.idx = (i + 1) % this.list.length; break;
    }
    if (!pick) return;
    this.budget -= 1;
    pick.age = 0;
    // pose from the RV frame
    this.frame.updateWorldMatrix(true, false);
    _p.copy(pick.lp).applyMatrix4(this.frame.matrixWorld);
    this.frame.getWorldQuaternion(_q);
    pick.cam.position.copy(_p);
    pick.cam.quaternion.copy(_q).multiply(pick.lq);
    pick.cam.updateMatrixWorld();
    // draw: no shadow-map refresh (reuse last frame's), cab hidden (no feedback into its own texture)
    const sm = renderer.shadowMap, au = sm.autoUpdate;
    const cabVis = this.cab.visible;
    const prevRt = renderer.getRenderTarget();
    sm.autoUpdate = false;
    this.cab.visible = false;
    try {
      renderer.setRenderTarget(pick.rt);
      renderer.clear();
      renderer.render(scene, pick.cam);
    } finally {
      renderer.setRenderTarget(prevRt);
      sm.autoUpdate = au;
      this.cab.visible = cabVis;
    }
    const calls = renderer.info.render.calls;
    pick.calls = calls;
    this.stats.calls = calls;
    this.stats.renders++;
    this.stats.last = pick.name;
  }

  setFar(far) { for (const m of this.list) { m.cam.far = far; m.cam.updateProjectionMatrix(); } }
  /** Average draw calls per mirror pass (last measured for each). */
  get callsPerPass() { const a = this.list.filter((m) => m.calls > 0); return a.length ? Math.round(a.reduce((s, m) => s + m.calls, 0) / a.length) : 0; }

  dispose() {
    for (const m of this.list) { m.rt.dispose(); m.mat.dispose(); }
    this.list = [];
  }
}
