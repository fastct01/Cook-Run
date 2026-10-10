// Test bot: plays the active minigame by dispatching real PointerEvents on the CookUI
// canvas (so the full input path — DOM → CookUI → CookLab → minigame — is exercised).
// Usage (from devtools / Playwright):  (await import('./js/cook/test/autoplay.js')).start(window.__cook)
const PID = 7;

export function start({ lab, ui }, opts = {}) {
  const bot = { on: true, down: false, ang: 0, lastClick: 0, heat: null, stats: { events: 0 }, skill: opts.skill ?? 1 };
  const cv = ui.canvas;
  const fire = (type, nx, ny) => {
    const p = ui.focusToClient(nx, ny);
    cv.dispatchEvent(new PointerEvent(type, { pointerId: PID, pointerType: 'mouse', isPrimary: true, clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
    bot.stats.events++;
  };
  const down = (x, y) => { fire('pointerdown', x, y); bot.down = true; };
  const move = (x, y) => fire('pointermove', x, y);
  const up = (x, y) => { fire('pointerup', x ?? 0.5, y ?? 0.5); bot.down = false; };
  const tap = (x, y) => { fire('pointerdown', x, y); fire('pointerup', x, y); bot.down = false; };
  let last = performance.now();
  let lastStep = -1;

  function frame(now) {
    if (!bot.on) { if (bot.down) up(); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    // a sensible player manages the air: vent on when it gets hazy, off once it clears
    if (opts.manageAir !== false && !lab.cookDown) {
      if (!lab.ventOpen && lab.fumes > 0.5) lab.toggleVent(true);
      else if (lab.ventOpen && lab.fumes < 0.12) lab.toggleVent(false);
    }
    const g = lab.current;
    if (!lab.inputEnabled || !g) { if (bot.down) up(); requestAnimationFrame(frame); return; }
    if (lab.stepIndex !== lastStep) { lastStep = lab.stepIndex; if (bot.down) up(); bot.ang = 0; bot.heat = null; }
    const t = now / 1000;
    switch (g.type) {
      case 'grind': {
        bot.ang += Math.PI * 2 * 1.3 * dt;
        const x = 0.5 + Math.cos(bot.ang) * 0.11, y = 0.58 + Math.sin(bot.ang) * 0.06;
        if (!bot.down) down(x, y); else move(x, y);
        break;
      }
      case 'stir': {
        bot.ang += Math.PI * 2 * g.target * dt;
        const x = 0.42 + Math.cos(bot.ang) * 0.1, y = 0.56 + Math.sin(bot.ang) * 0.05;
        if (!bot.down) down(x, y); else move(x, y);
        break;
      }
      case 'measure': {
        const mid = (g.min + g.max) / 2;
        if (!g.poured && !bot.down) down(0.5, 0.55);
        else if (bot.down && g.level >= mid - g.rate * 0.03) up(0.5, 0.55);
        break;
      }
      case 'heat': {
        // drag the dial like a player: grab once, then move vertically to the wanted setting
        const mid = (g.bandMin + g.bandMax) / 2;
        const want = Math.max(0, Math.min(1, 0.55 + (g.temp < g.bandMin - 15 ? 0.3 : 0) + (mid - g.temp) * 0.006));
        if (!bot.down) { down(0.88, 0.46); bot.heat = { y0: 0.46, d0: g.dial }; }
        else move(0.88, bot.heat.y0 - (want - bot.heat.d0) / 1.6);
        break;
      }
      case 'cool': {
        const x = 0.5 + (-g.d) / 2.4;
        if (!bot.down) down(x, 0.6); else move(x, 0.6);
        break;
      }
      case 'break': {
        if (t - bot.lastClick > 0.16) {
          bot.lastClick = t;
          const i = g.shards.findIndex((s) => s.state === 'on');
          if (i >= 0) { const p = g._shardScreen(g.shards[i]); tap(p.x, p.y); }
        }
        break;
      }
      case 'hammer': {
        if (t - bot.lastClick > 0.11) {
          bot.lastClick = t;
          const tg = g.targets()[0];
          if (tg) tap(tg.x, tg.y);
        }
        break;
      }
      default: break;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  bot.stop = () => { bot.on = false; };
  window.__bot = bot;
  return bot;
}
