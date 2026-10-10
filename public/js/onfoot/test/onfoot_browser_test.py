#!/usr/bin/env python3
"""
Browser test for Agent ONFOOT (headless Chromium + SwiftShader).

    cd public && python3 -m http.server 8203 &      # or let this script start one
    python3 public/js/onfoot/test/onfoot_browser_test.py [--port 8203] [--shots DIR]

  1. garage, driver + cook + solo (AI Doc): both avatars scripted through the real input paths (GarageView key path for
     "me", CMD/DriverInput for the partner) on the real GameSim → tutorial done, GarageView fades out and
     releases the camera (finished), zero console errors
  2. every supply stop (8 stops, 7 shop types): scripted player through ShopChallenge's key path →
     onDone fires with 0 < score <= 1, zero console errors, draw calls <= 150
"""
import os, sys, time, subprocess, socket, json, argparse

ap = argparse.ArgumentParser()
ap.add_argument('--port', type=int, default=8203)
ap.add_argument('--shots', default=None)
args = ap.parse_args()
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))   # public/
BASE = f'http://localhost:{args.port}/onfoot-test.html'

def port_open(p):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(('127.0.0.1', p)) == 0

server = None
if not port_open(args.port):
    server = subprocess.Popen([sys.executable, '-m', 'http.server', str(args.port)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        if port_open(args.port): break
        time.sleep(0.1)

from playwright.sync_api import sync_playwright

fails = 0
def check(name, ok, detail=''):
    global fails
    if not ok: fails += 1
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{' — ' + str(detail) if detail else ''}", flush=True)

IGNORE = ('GL Driver', 'GroupMarkerNotSet', 'swiftshader', 'WebGL-')
def page_with_log(b):
    pg = b.new_page(viewport={'width': 960, 'height': 540})
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and not any(s in m.text for s in IGNORE) else None)
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    return pg, errs

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    # ── 1. garage ────────────────────────────────────────────────────────────
    for role, q in (('driver', 'bot=both'), ('cook', 'bot=both'), ('driver', 'bot=me&solo=1')):
        if 'solo' in q: role_tag = 'solo'
        else: role_tag = role
        print(f'\n── garage · {role_tag} ──', flush=True)
        pg, errs = page_with_log(b)
        pg.goto(f'{BASE}?mode=garage&role={role}&{q}&shot=1')
        pg.wait_for_function('window.__onfoot && window.__onfoot.gv', timeout=90000)
        pg.evaluate('window.__onfoot.paused = true')
        real = pg.evaluate('window.__onfoot.real')
        t = pg.evaluate('''(() => { const O = window.__onfoot; for (let i = 0; i < 60 * 120; i++) { if (O.done) return i / 60; O.fast(1 / 60); } return -1; })()''')
        st = pg.evaluate('JSON.stringify(window.__onfoot.state())')
        G = json.loads(st) if st and st != 'null' else {}
        check(f'{role_tag}: tutorial completed by scripted players ({"GameSim" if real else "local loop"})', t > 0, f'{t:.1f} s sim time')
        check(f'{role_tag}: final items', G.get('items', {}).get('engine') == 'on' and G.get('items', {}).get('crate') == 'rv' and G.get('rook', {}).get('inRv') and G.get('doc', {}).get('inRv'), G.get('items'))
        # let the view see the countdown snapshot, fade out and release the camera
        r = pg.evaluate('''(() => { const O = window.__onfoot; const s = O.sim ? O.sim.snapshot() : { phase: 'countdown', garage: O.state() };
            const ph = s.phase; for (let i = 0; i < 15 && !O.gv.finished; i++) O.gv.update(0.1, s); return [ph, O.gv.finished, !window.__view.cameraController]; })()''')
        check(f'{role_tag}: phase → countdown; GarageView faded out and released the camera', r[0] == 'countdown' and r[1] and r[2], r)
        pg.evaluate('window.__onfoot.paused = false')
        time.sleep(3)
        if args.shots: pg.screenshot(path=os.path.join(args.shots, f'test-garage-{role_tag}.png'), timeout=180000)
        check(f'{role_tag}: zero console errors', not errs, errs[:3])
        pg.close()
    # ── 2. shops ─────────────────────────────────────────────────────────────
    stops = ['hardware', 'market', 'chandlery', 'gas_ice', 'megamart', 'farm', 'junkyard', 'lastgas']
    for stop in stops:
        print(f'\n── shop · {stop} ──', flush=True)
        pg, errs = page_with_log(b)
        pg.goto(f'{BASE}?mode=shop&stop={stop}&shot=1')
        pg.wait_for_function('window.__onfoot && window.__onfoot.shop', timeout=90000)
        typ = pg.evaluate('window.__onfoot.shop.type')
        pg.evaluate('window.__onfoot.shop.setBot(true)')
        res = pg.evaluate('''(() => { const O = window.__onfoot, s = O.shop; let n = 0; while (!O.done && !O.aborted && n < 60 * 120) { s.fastForward(0.5); n += 30; } return { done: O.done, score: O.score, t: n / 60, state: s.debugState() }; })()''')
        time.sleep(2)
        calls = pg.evaluate('window.__onfoot.calls')
        sc = res.get('score')
        check(f'{stop} ({typ}): onDone fired with a score > 0', res.get('done') and sc is not None and 0 < sc <= 1, f"score {sc:.2f} after {res['t']:.1f} s" if sc is not None else res)
        check(f'{stop}: draw calls ≤ 150', calls is not None and calls <= 150, calls)
        check(f'{stop}: zero console errors', not errs, errs[:3])
        pg.close()
    b.close()

if server: server.terminate()
print(f"\n{'ALL PASS' if not fails else str(fails) + ' FAILED'}")
sys.exit(1 if fails else 0)
