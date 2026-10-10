#!/usr/bin/env python3
"""Render the R3-GARAGE preview PNGs (1280x720) with headless Chromium + SwiftShader.

    python3 docs/r3/render_r3_garage.py [--base http://localhost:3100] [--only overview,cab]

Needs the game server (serves public/) — `curl -sf localhost:3100/healthz`.
"""
import argparse, os, sys, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--base', default='http://localhost:3100')
ap.add_argument('--only', default='')
ap.add_argument('--out', default=os.path.dirname(os.path.abspath(__file__)))
args = ap.parse_args()
SHOTS = [('overview', 'garage-overview.png'), ('lab', 'garage-lab-corner.png'), ('rack', 'garage-suit-rack.png'),
         ('cab', 'garage-exit-cab-view.png'), ('lineup', 'props-lineup.png'), ('crew', 'crew-suited.png')]
only = set(filter(None, args.only.split(',')))
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    for view, name in SHOTS:
        if only and view not in only: continue
        pg = b.new_page(viewport={'width': 1280, 'height': 720})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'GL Driver' not in m.text and 'GroupMarker' not in m.text else None)
        t0 = time.time()
        pg.goto(f'{args.base}/r3-garage-preview.html?view={view}', wait_until='load')
        pg.wait_for_function('window.__ready === true', timeout=240000)
        time.sleep(1.0)
        pg.screenshot(path=os.path.join(args.out, name), timeout=240000)
        print(f'  {name}  {time.time() - t0:.1f}s', ' ERR: ' + ' | '.join(errs[:3]) if errs else '', flush=True)
        pg.close()
    b.close()
