// ─────────────────────────────────────────────────────────────────────────────
// Cutaway — keeps the cook's dollhouse view of the lab clear of roofs and walls.
//
// The van camera floats ~9 m up beside the RV. On the open road that's fine, but in Rook's Garage, under a
// shop's roof overhang at a supply stop or on a tight street, the world sits between the camera and the lab.
// vanCamera already pulls the near plane up to the van (that removes things right in front of the camera);
// this removes the rest: one convex box of material clipping planes (clipIntersection), in the van's own
// frame, that starts just above the van's roof line (local y > 3.45) and spans from the far wall to past the
// camera. Everything in the lab is below that line, so sharing palette materials with the world is harmless.
//
//   const cut = new Cutaway(view);
//   cut.update(m, camLocal);   // m: van-local → world Matrix4; camLocal: camera position in van-local metres
//   cut.disable();             // nothing clipped (planes moved to infinity)
//
// It attaches the shared plane array to every material in the scene the first time it is enabled (one shader
// variant each, compiled once) and re-scans for new materials once a second while enabled. The plane array is
// disabled by WorldView pre-render whenever the van camera is not the active controller.
//
// Unity port: a URP renderer feature / shader keyword with a clip box (or simply fade occluders).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const BIG = 1e9;
const ROOF_Y = 3.45;        // van-local: everything in the lab is below this
const HALF_W = 1.45, HALF_L = 4.6;
const _n = new THREE.Vector3(), _p = new THREE.Vector3(), _nm = new THREE.Matrix3();

export class Cutaway {
  constructor(view) {
    this.view = view;
    this.planes = Array.from({ length: 6 }, () => new THREE.Plane(new THREE.Vector3(0, 1, 0), BIG));
    this.local = Array.from({ length: 6 }, () => new THREE.Plane());
    this.seen = new WeakSet();
    this.enabled = false;
    this._scanT = 0;
    this.stats = { materials: 0 };
    if (view.renderer) view.renderer.localClippingEnabled = true;
    this._offPre = view.addPreRender ? view.addPreRender(() => { if (this.enabled && this.owner && view.cameraController !== this.owner) this.disable(); }) : null;
  }

  /** The camera controller this cutaway belongs to; it stays enabled only while that one drives the camera. */
  setOwner(ctrl) { this.owner = ctrl; }

  _attach() {
    const visit = (m) => {
      if (!m || this.seen.has(m)) return;
      this.seen.add(m);
      if (m.clippingPlanes && m.clippingPlanes.length && m.clippingPlanes !== this.planes) return;   // someone else's
      if (m.isShaderMaterial && !m.clipping) return;
      m.clippingPlanes = this.planes;
      m.clipIntersection = true;
      m.needsUpdate = true;
      this.stats.materials++;
    };
    this.view.scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) m.forEach(visit); else visit(m);
    });
  }

  update(m, camLocal, dt = 0) {
    this._scanT -= dt;
    if (this._scanT <= 0) { this._attach(); this._scanT = 1; }
    this.enabled = true;
    const side = camLocal.x >= 0 ? 1 : -1;
    const xNear = Math.max(Math.abs(camLocal.x) + 3, HALF_W + 1);   // past the camera
    const z0 = Math.min(camLocal.z - 3, -HALF_L - 1.5), z1 = Math.max(camLocal.z + 3, HALF_L + 1.5);
    // inside of the box = the negative side of every plane (three.js clips where distance < 0 for all)
    const L = this.local;
    L[0].set(_n.set(0, -1, 0), ROOF_Y);                 // y > ROOF_Y
    L[1].set(_n.set(0, 1, 0), -200);                    // y < 200 (keeps the sky)
    L[2].set(_n.set(side, 0, 0), -xNear);               // side·x < xNear
    L[3].set(_n.set(-side, 0, 0), -(HALF_W + 0.25));     // side·x > −(far wall)
    L[4].set(_n.set(0, 0, 1), -z1);                     // z < z1
    L[5].set(_n.set(0, 0, -1), z0);                     // z > z0
    _nm.getNormalMatrix(m);
    for (let i = 0; i < 6; i++) this.planes[i].copy(L[i]).applyMatrix4(m, _nm);
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    // one plane that clips nothing → the intersection clips nothing
    this.planes[0].set(_p.set(0, 1, 0), BIG);
  }

  destroy() {
    this.disable();
    if (this._offPre) this._offPre();
  }
}
