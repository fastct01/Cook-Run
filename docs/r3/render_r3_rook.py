#!/usr/bin/env python3
"""Render the R3-ROOK preview PNGs (1280x720) with headless Chromium + SwiftShader.

    python3 docs/r3/render_r3_rook.py [--base http://localhost:3100] [--only young,guns] [--extra "&cam=..."]

Needs the game server (serves public/) - `curl -sf localhost:3100/healthz`.
"""
import argparse, os, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--base', default='http://localhost:3100')
ap.add_argument('--only', default='')
ap.add_argument('--extra', default='')
ap.add_argument('--out', default=os.path.dirname(os.path.abspath(__file__)))
args = ap.parse_args()
SHOTS = [('young', 'rook-young.png'), ('closeup', 'rook-young-closeup.png'), ('guns', 'guns-lineup.png'),
         ('aim', 'rook-roof-guns.png'), ('scene', 'rook-roof-scene.png'), ('bg', 'bg-roof-rook.png')]
only = set(filter(None, args.only.split(',')))
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    for view, name in SHOTS:
        if only and view not in only:
            continue
        pg = b.new_page(viewport={'width': 1280, 'height': 720})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'GL Driver' not in m.text and 'GroupMarker' not in m.text else None)
        t0 = time.time()
        pg.goto(f'{args.base}/r3-rook-preview.html?view={view}{args.extra}', wait_until='load')
        pg.wait_for_function('window.__ready === true', timeout=600000)
        time.sleep(1.0)
        pg.screenshot(path=os.path.join(args.out, name), timeout=600000)
        print(f'  {name}  {time.time() - t0:.1f}s', ' ERR: ' + ' | '.join(errs[:3]) if errs else '', flush=True)
        pg.close()
    b.close()
