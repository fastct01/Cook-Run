"""Playwright end-to-end test for the 3D cook presenters (van-presenters-test.html).

Plays every step type with REAL mouse/keyboard events aimed at screen positions computed by
projecting each presenter's debugTargets() (anchor-local 3D points) through the bench camera.
Checks: zero console errors, the step completes, score > 0.6; saves screenshots.

  cd public && python3 -m http.server 8096 &
  python3 public/js/van/presenters/test/playthrough.py [--out DIR] [--only grind,heat] [--port 8096]
"""
import argparse
import asyncio
import json
import math
import os
import sys

from playwright.async_api import async_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--out', default='/tmp/vancook-shots')
ap.add_argument('--port', type=int, default=8096)
ap.add_argument('--only', default='')
ap.add_argument('--no-idle', action='store_true')
args = ap.parse_args()
os.makedirs(args.out, exist_ok=True)
BASE = f'http://localhost:{args.port}/van-presenters-test.html'
TYPES = ['grind', 'measure', 'heat', 'stir', 'cool', 'break', 'hammer']
if args.only:
    TYPES = [t for t in TYPES if t in args.only.split(',')]
IDLE = ['grind', 'measure', 'stove', 'cool', 'break', 'hammer']
DT = 1 / 30

results = []


def fail(msg):
    print('FAIL ', msg)
    results.append((False, msg))


def ok(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    results.append((bool(cond), msg))


async def open_page(browser, query):
    page = await browser.new_page(viewport={'width': 1280, 'height': 720})
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    await page.goto(f'{BASE}?{query}')
    await page.wait_for_function('window.__h && window.__h.ready', timeout=180000)
    return page, errors


async def shot(page, name):
    await page.evaluate('__h.render()')
    path = os.path.join(args.out, f'{name}.png')
    await page.screenshot(path=path)
    return path


async def info(page):
    return await page.evaluate('__h.info()')


async def advance(page, sec):
    return await page.evaluate(f'__h.advance({sec})')


class Shots:
    """Takes a 'mid' shot when progress first passes 0.45 and a 'late' one past 0.85."""

    def __init__(self, page, t):
        self.page, self.t, self.mid, self.late = page, t, False, False

    async def check(self, prog, done=False):
        if not self.mid and prog >= 0.45 and not done:
            self.mid = True
            await shot(self.page, f'{self.t}-mid')
        if not self.late and prog >= 0.85 and not done:
            self.late = True
            await shot(self.page, f'{self.t}-late')


async def play_circle(page, t, rps, max_iter):
    T = await page.evaluate('__h.targets()')
    c, r = T['center'], T['radius']
    n = max(8, round(2 * math.pi / (2 * math.pi * rps * DT)))
    pts = [[c[0] + math.cos(i / n * 2 * math.pi) * r, c[1], c[2] + math.sin(i / n * 2 * math.pi) * r] for i in range(n)]
    scr = await page.evaluate(f'__h.screenOfMany({json.dumps(pts)})')
    S = Shots(page, t)
    await page.mouse.move(scr[0]['x'], scr[0]['y'])
    await page.mouse.down()
    st = None
    for i in range(1, max_iter):
        p = scr[i % n]
        await page.mouse.move(p['x'], p['y'])
        st = await advance(page, DT)
        await S.check(st['progress'], st['done'])
        if st['done'] or st['failed']:
            break
    await page.mouse.up()
    return st


async def play_measure(page):
    T = await page.evaluate('__h.targets()')
    p = await page.evaluate(f'__h.screenOf({json.dumps(T["point"])})')
    mid = (T['min'] + T['max']) / 2
    l0 = (await info(page))['level']
    await page.keyboard.down('Space')
    await advance(page, 0.25)
    await page.keyboard.up('Space')
    l1 = (await info(page))['level']
    ok(l1 > l0 + 0.03, f'measure: holding Space pours ({l0:.3f} → {l1:.3f})')
    await advance(page, 0.05)
    S = Shots(page, 'measure')
    await page.mouse.move(p['x'], p['y'])
    await page.mouse.down()
    st = None
    for _ in range(400):
        st = await advance(page, DT)
        if st['level'] >= 0.3 and not S.mid:
            S.mid = True
            await shot(page, 'measure-mid')
        if st['level'] >= mid - T['rate'] * DT * 1.2:
            break
    await shot(page, 'measure-late')
    await page.mouse.up()
    for _ in range(90):
        st = await advance(page, DT)
        if st['done']:
            break
    return st


async def play_heat(page):
    T = await page.evaluate('__h.targets()')
    # keyboard first: D turns the gas up
    d0 = (await info(page))['dial']
    await page.keyboard.down('KeyD')
    await advance(page, 0.3)
    await page.keyboard.up('KeyD')
    d1 = (await info(page))['dial']
    ok(d1 > d0 + 0.08, f'heat: holding D turns the knob up ({d0:.2f} → {d1:.2f})')
    await page.keyboard.down('KeyA')
    await advance(page, 0.2)
    await page.keyboard.up('KeyA')
    d2 = (await info(page))['dial']
    ok(d2 < d1 - 0.04, f'heat: holding A turns it down ({d1:.2f} → {d2:.2f})')
    # drag the knob like a player: grab it, then move along the panel's up axis
    p = await page.evaluate(f'__h.screenOf({json.dumps(T["point"])})')
    await page.mouse.move(p['x'], p['y'])
    await page.mouse.down()
    st = await info(page)
    dPress = st['dial']
    js = '''(([pt, up, per, d0]) => {
      __h.advance(%f);
      const g = __lab.current, i = __h.info();
      if (!g || g.type !== 'heat') return { ...i, x: 0, y: 0 };
      const mid = (g.bandMin + g.bandMax) / 2;
      const want = Math.max(0, Math.min(1, 0.55 + (g.temp < g.bandMin - 12 ? 0.3 : 0) + (mid - g.temp) * 0.006));
      const k = (want - d0) * per;
      const s = __h.screenOf([pt[0] + up[0] * k, pt[1] + up[1] * k, pt[2] + up[2] * k]);
      return { ...i, x: s.x, y: s.y, want };
    })''' % DT
    S = Shots(page, 'heat')
    moved = False
    for _ in range(900):
        st = await page.evaluate(f'({js})({json.dumps([T["point"], T["up"], T["perDial"], dPress])})')
        if st['done'] or st['failed']:
            break
        await page.mouse.move(st['x'], st['y'])
        if not moved:
            moved = True
        await S.check(st['progress'])
    await page.mouse.up()
    return st


async def play_cool(page):
    h0 = await page.evaluate('__lab.current.hand')
    await page.keyboard.down('KeyD')
    await advance(page, 0.35)
    h1 = await page.evaluate('__lab.current.hand')
    await page.keyboard.up('KeyD')
    ok(h1 > h0 + 0.3, f'cool: holding D pushes the glove right (hand {h0:.2f} → {h1:.2f})')
    T = await page.evaluate('__h.targets()')
    js = '''(([pt, per]) => {
      __h.advance(%f);
      const g = __lab.current, i = __h.info();
      if (!g || g.type !== 'cool') return { ...i, x: 0, y: 0 };
      const x = pt[0] - g.d * per;
      const s = __h.screenOf([x, pt[1], pt[2]]);
      return { ...i, x: s.x, y: s.y };
    })''' % DT
    p = await page.evaluate(f'__h.screenOf({json.dumps(T["point"])})')
    await page.mouse.move(p['x'], p['y'])
    await page.mouse.down()
    S = Shots(page, 'cool')
    st = None
    for _ in range(600):
        st = await page.evaluate(f'({js})({json.dumps([T["point"], T["perHand"]])})')
        if st['done'] or st['failed']:
            break
        await page.mouse.move(st['x'], st['y'])
        await S.check(st['progress'])
    await page.mouse.up()
    # keyboard steer
    return st


async def play_clicks(page, t, gap):
    S = Shots(page, t)
    st = None
    for _ in range(200):
        T = await page.evaluate('__h.targets()')
        if T is None:
            st = await info(page)
            break
        if not T['points']:
            st = await advance(page, gap)
            if st['done']:
                break
            continue
        p = await page.evaluate(f'__h.screenOf({json.dumps(T["points"][0])})')
        await page.mouse.click(p['x'], p['y'])
        st = await advance(page, gap)
        await S.check(st['progress'], st['done'])
        if st['done'] or st['failed']:
            break
    return st


async def run_step(browser, t):
    page, errors = await open_page(browser, f'step={t}&manual=1&shots=1')
    await advance(page, 0.3)
    st0 = await info(page)
    ok(st0['type'] == t and not st0['away'], f'{t}: presenter live at its station (hint: "{st0["hint"]}")')
    await shot(page, f'{t}-start')
    if t == 'grind':
        st = await play_circle(page, t, 1.4, 900)
    elif t == 'stir':
        tgt = (await page.evaluate('__h.targets()'))['target']
        st = await play_circle(page, t, tgt, 1200)
    elif t == 'measure':
        st = await play_measure(page)
    elif t == 'heat':
        st = await play_heat(page)
    elif t == 'cool':
        st = await play_cool(page)
    elif t == 'break':
        st = await play_clicks(page, t, 0.22)
    elif t == 'hammer':
        st = await play_clicks(page, t, 0.13)
    await advance(page, 0.5)
    await shot(page, f'{t}-done')
    fin = await info(page)
    sc = fin['stepScores'][-1]['score'] if fin['stepScores'] else (st or {}).get('score', 0)
    done = bool(fin['stepScores']) or fin['state'] == 'done'
    ok(done, f'{t}: step completed via real pointer events (state={fin["state"]})')
    ok(sc > 0.6, f'{t}: score {sc:.2f} > 0.6')
    dc = st0['presenterDrawCalls']
    ok(dc <= 25, f'{t}: presenter draw calls {dc} ≤ 25')
    ok(not errors, f'{t}: zero console errors {errors[:3] if errors else ""}')
    await page.close()


async def run_api(browser):
    page, errors = await open_page(browser, 'step=heat&manual=1')
    await advance(page, 0.2)
    r = await page.evaluate('''(async () => {
      const m = await import('./js/van/presenters/index.js');
      const p = __p, out = {};
      out.types = m.presenterTypes.join(',');
      out.map = JSON.stringify(m.STEP_STATION);
      out.unknown = m.createPresenter('nope', { anchor: __h.scene }) === null;
      out.idleUnknown = m.buildIdleProps('nope') === null;
      out.idleAll = ['grind','measure','stove','cool','break','hammer'].every((s) => { const o = m.buildIdleProps(s); const ok = !!(o && o.isObject3D); m.disposeIdleProps(o); return ok; });
      const c = p.camera(); out.cam = !!(c.pos && c.pos.isVector3 && c.target && c.target.isVector3 && c.fov > 30 && c.fov < 60);
      out.camDist = +c.pos.distanceTo(c.target).toFixed(2);
      out.pick = Array.isArray(p.pick()) && p.pick().length > 0;
      out.cursor = p.cursor;
      out.hint = typeof p.hint === 'string' && p.hint.length > 0;
      out.upNoDown = p.key('KeyD', false) === false;          // keyup without our keydown is not consumed
      out.walkKey = p.key('KeyW', true) === false;            // movement keys pass through
      out.down = p.key('KeyD', true) === true && p.key('KeyD', true) === true && p.key('KeyD', false) === true;
      p.update(1 / 60, { active: false });                    // Doc steps away
      out.inactiveKey = p.key('KeyD', true) === false;
      p.update(1 / 60, { active: true });
      out.nullHit = (() => { try { p.pointerDown(null); p.pointerMove(null); p.pointerUp(null); return true; } catch (e) { return String(e); } })();
      // every type: build against a stand-in anchor, dispose cleanly
      const T = __h.scene.position.constructor;
      out.dc = {};
      return out;
    })()''')
    ok(r['types'] == 'grind,measure,heat,stir,cool,break,hammer', f'api: presenterTypes = {r["types"]}')
    ok(json.loads(r['map']) == {'grind': 'grind', 'measure': 'measure', 'heat': 'stove', 'stir': 'stove', 'cool': 'cool', 'break': 'break', 'hammer': 'hammer'}, 'api: STEP_STATION mapping')
    ok(r['unknown'] and r['idleUnknown'], 'api: unknown step/station → null')
    ok(r['idleAll'], 'api: buildIdleProps for all six step stations')
    ok(r['cam'] and 0.8 <= r['camDist'] <= 1.35, f'api: camera() pose in anchor space (distance {r["camDist"]} m)')
    ok(r['pick'] and r['hint'] and r['cursor'], f'api: pick()/hint/cursor ("{r["cursor"]}")')
    ok(r['upNoDown'] and r['walkKey'] and r['down'], 'api: key gating (only consumes keyups it owns; WASD-walk keys pass)')
    ok(r['inactiveKey'], 'api: no key play while Doc is not working the station')
    ok(r['nullHit'] is True, f'api: null hits are safe ({r["nullHit"]})')
    ok(not errors, f'api: zero console errors {errors[:3] if errors else ""}')
    await page.close()


async def run_away(browser):
    page, errors = await open_page(browser, 'step=grind&manual=1&away=1')
    await advance(page, 0.2)
    T = await page.evaluate('__h.targets()')
    c, r = T['center'], T['radius']
    pts = [[c[0] + math.cos(i / 12 * 6.283) * r, c[1], c[2] + math.sin(i / 12 * 6.283) * r] for i in range(12)]
    scr = await page.evaluate(f'__h.screenOfMany({json.dumps(pts)})')
    await page.mouse.move(scr[0]['x'], scr[0]['y'])
    await page.mouse.down()
    for i in range(36):
        await page.mouse.move(scr[i % 12]['x'], scr[i % 12]['y'])
        await advance(page, DT)
    await page.mouse.up()
    st = await info(page)
    ok(st['away'] and st['progress'] == 0, f'away from the station: pointer input ignored (progress {st["progress"]})')
    ok(not errors, f'away: zero console errors {errors[:3] if errors else ""}')
    await page.close()


async def run_fire(browser):
    # crank the burner and walk away (presence null): the heat step keeps simulating → fire blooms at the pot
    page, errors = await open_page(browser, 'step=heat&manual=1&shots=1')
    await advance(page, 0.2)
    T = await page.evaluate('__h.targets()')
    p = await page.evaluate(f'__h.screenOf({json.dumps(T["point"])})')
    await page.keyboard.down('KeyD')
    await advance(page, 2.6)
    await page.keyboard.up('KeyD')
    await page.evaluate("__lab.setPresence(null)")
    st = None
    for _ in range(60):
        st = await advance(page, 0.5)
        if st['fire'] > 0.25:
            break
    ok(st['away'] and st['fire'] > 0, f'heat: unattended burner set the lab on fire (fire {st["fire"]:.2f}, temp {st["temp"]:.0f})')
    await shot(page, 'heat-fire')
    ok(not errors, f'heat fire: zero console errors {errors[:3] if errors else ""}')
    await page.close()


async def run_spill(browser):
    # hold the pour way past the band → overflow: spill drops + puddle, score 0.2
    page, errors = await open_page(browser, 'step=measure&manual=1&shots=1&bumps=0')
    await advance(page, 0.2)
    T = await page.evaluate('__h.targets()')
    p = await page.evaluate(f'__h.screenOf({json.dumps(T["beaker"])})')
    await page.mouse.move(p['x'], p['y'])
    await page.mouse.down()
    st = None
    for _ in range(200):
        st = await advance(page, DT)
        if st['done']:
            break
    await advance(page, 0.6)
    await page.mouse.up()
    await shot(page, 'measure-spill')
    st = await info(page)
    ok(st['done'] and abs(st['score'] - 0.2) < 1e-6, f'measure: overfill spills (score {st["score"]:.2f})')
    ok(not errors, f'spill: zero console errors {errors[:3] if errors else ""}')
    await page.close()


async def run_recipe(browser):
    # the whole premium batch on one bench: presenters swap per step (heat → stir share the stove)
    page, errors = await open_page(browser, 'recipe=premium&manual=1&shots=1&bumps=0')
    js = '''(() => {
      const V = __h.scene.position.constructor;
      const seen = []; let a = 0, last = -1, down = false, tt = 0;
      for (let i = 0; i < 60 * 30 * 4; i++) {
        const p = __p, lab = __lab, g = lab.current;
        if (lab.state === 'done' || lab.state === 'failed') break;
        if (p && g && !g.done) {
          if (seen[seen.length - 1] !== p.type) { seen.push(p.type); down = false; a = 0; tt = 0; }
          tt += 1 / 30;
          const T = p.debugTargets();
          const hit = (q) => ({ local: new V(q[0], q[1], q[2]), object: null });
          if (T.kind === 'circle') {
            a += Math.PI * 2 * (p.type === 'stir' ? g.target : 1.4) / 30;
            const q = hit([T.center[0] + Math.cos(a) * T.radius, T.center[1], T.center[2] + Math.sin(a) * T.radius]);
            if (!down) { p.pointerDown(q); down = true; } else p.pointerMove(q);
          } else if (T.kind === 'hold') {
            const mid = (g.min + g.max) / 2;
            if (!down && !g.poured) { p.pointerDown(hit(T.point)); down = true; }
            if (down && g.level >= mid - g.rate / 30 * 1.2) { p.pointerUp(null); down = false; }
          } else if (T.kind === 'knob') {
            const mid = (g.bandMin + g.bandMax) / 2;
            g.setDial(Math.max(0, Math.min(1, 0.55 + (g.temp < g.bandMin - 12 ? 0.3 : 0) + (mid - g.temp) * 0.006)));
          } else if (T.kind === 'slide') {
            p.pointerMove(hit([T.point[0] - g.d * T.perHand, T.point[1], T.point[2]]));
          } else if (T.kind === 'click' && T.points.length && Math.floor(tt * 6) !== last) {
            last = Math.floor(tt * 6);
            p.pointerDown(hit(T.points[0])); p.pointerUp(hit(T.points[0]));
          }
        } else if (down && p) { p.pointerUp(null); down = false; }
        __h.advance(1 / 30);
      }
      return { seen, state: __lab.state, result: __lab.result, dc: __h.render() };
    })()'''
    r = await page.evaluate(js)
    await shot(page, 'recipe-premium-end')
    want = ['grind', 'measure', 'heat', 'stir', 'cool', 'break']
    ok(r['seen'] == want, f'premium recipe: presenters swapped through {r["seen"]}')
    ok(r['state'] == 'done' and r['result'] and r['result']['quality'] > 0.6, f'premium recipe done, quality {r["result"] and r["result"]["quality"]}')
    ok(not errors, f'recipe: zero console errors {errors[:3] if errors else ""}')
    await page.close()


async def run_realtime(browser):
    # the normal requestAnimationFrame loop (no manual clock): hammer a few nails
    page, errors = await open_page(browser, 'step=hammer')
    await page.wait_for_timeout(800)
    for _ in range(4):
        T = await page.evaluate('__h.targets()')
        if T['points']:
            p = await page.evaluate(f'__h.screenOf({json.dumps(T["points"][0])})')
            await page.mouse.click(p['x'], p['y'])
        await page.wait_for_timeout(250)
    st = await info(page)
    ok(st['progress'] > 0, f'realtime loop: hammer hits land ({st["progress"]:.2f})')
    ok(not errors, f'realtime: zero console errors {errors[:3] if errors else ""}')
    await page.close()


async def run_static(browser, query, name):
    page, errors = await open_page(browser, query)
    await shot(page, name)
    st = await page.evaluate('__h.info()')
    ok(not errors, f'{name}: zero console errors {errors[:3] if errors else ""}')
    await page.close()
    return st


async def main():
    async with async_playwright() as p:
        launch = lambda: p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
        jobs = [(f'step {t}', (lambda t=t: (lambda b: run_step(b, t)))()) for t in TYPES]
        if not args.only:
            jobs += [('api', run_api), ('away', run_away), ('fire', run_fire), ('spill', run_spill), ('recipe', run_recipe), ('realtime', run_realtime),
                     ('gallery', lambda b: run_static(b, 'all=1&manual=1&shots=1', 'gallery'))]
            if not args.no_idle:
                jobs.append(('idle gallery', lambda b: run_static(b, 'idle=all&manual=1&shots=1', 'idle-gallery')))
                jobs += [(f'idle {st}', (lambda st=st: (lambda b: run_static(b, f'idle={st}&manual=1&shots=1', f'idle-{st}')))()) for st in IDLE]
        for name, job in jobs:
            browser = await launch()          # fresh browser per scenario keeps swiftshader memory flat
            try:
                await job(browser)
            except Exception as e:  # noqa
                fail(f'{name}: exception {e}')
            await browser.close()
    bad = [m for okk, m in results if not okk]
    print(f'\n{len(results) - len(bad)}/{len(results)} passed')
    if bad:
        print('FAILED:\n  ' + '\n  '.join(bad))
    sys.exit(1 if bad else 0)

asyncio.run(main())
