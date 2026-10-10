// ─────────────────────────────────────────────────────────────────────────────
// Shared on-foot jump. PURE LOGIC: no DOM, no three.js. Used by the garage tutorial (host sim +
// the cook's prediction), Doc in the van lab and Rook in the shop challenges.
//
//   a.jt = -1 (on the ground) · a.jumpBuf = 0 · a.y = 0
//   tryJump(a)                  // press: jump now if grounded, else buffer it for the landing
//   stepJump(a, dt, canJump)    // advance; → 'jump' | 'land' | null; sets a.y (height above the floor, m)
//   jumpY(jt)                   // height for a time since take-off (remote avatars rebuild the arc from jt)
//
// The arc is a fixed parabola (not integrated gravity): exact peak/airtime, deterministic, and a remote
// client can reconstruct it from one number. No double jump. Collision stays 2D: you can't hop furniture.
// Unity port: a small JumpMotor component; CharacterController.Move gets the same y each frame.
// ─────────────────────────────────────────────────────────────────────────────

export const JUMP = Object.freeze({ height: 0.5, time: 0.45, airControl: 0.35, buffer: 0.12 });

export function jumpY(jt, J = JUMP) {
  if (!(jt >= 0) || jt >= J.time) return 0;
  const u = jt / J.time;
  return 4 * J.height * u * (1 - u);
}

export const airborne = (a) => a.jt >= 0;

export function tryJump(a, J = JUMP) {
  if (a.jt >= 0) { a.jumpBuf = J.buffer; return false; }
  a.jt = 0; a.jumpBuf = 0;
  return true;
}

export function stepJump(a, dt, canJump = true, J = JUMP) {
  let ev = null;
  if (a.jt >= 0) {
    a.jt += dt;
    if (a.jt >= J.time) {
      a.jt = -1; ev = 'land';
      if (a.jumpBuf > 0 && canJump) { a.jt = 0; ev = 'jump'; }
      a.jumpBuf = 0;
    }
  } else if (a.jt == null) a.jt = -1;
  a.jumpBuf = Math.max(0, (a.jumpBuf || 0) - dt);
  a.y = jumpY(a.jt, J);
  return ev;
}

export function resetJump(a) { a.jt = -1; a.jumpBuf = 0; a.y = 0; }
