"""Cook lab end-to-end test (Python Playwright, headless Chromium).

  cd public && python3 -m http.server 8092 &
  python3 public/js/cook/test/playthrough.py [outdir]

Checks: zero console errors, full premium playthrough via real pointer events
(RECIPE_DONE with quality sent), fire start + extinguish, cop alarm, cook-down,
compact mode, keyboard focus never captured. Saves screenshots to outdir.
"""
import json, os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get('COOK_URL', 'http://localhost:8092/cook-test.html')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '../../../../docs')
os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
fails = []


def check(cond, msg):
    print(('PASS  ' if cond else 'FAIL  ') + msg)
    if not cond:
        fails.append(msg)


def shot(page, name, el=None):
    path = os.path.join(OUT, f'cook-{name}.png')
    (el or page).screenshot(path=path)
    print('      saved', path)


def wait(page, js, timeout=30000, arg=None):
    page.wait_for_function(js, arg=arg, timeout=timeout)


def watch(page, errs):
    page.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))


with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)

    # ── full-size panel ───────────────────────────────────────────────────────
    pg = b.new_page(viewport={'width': 1600, 'height': 900})
    errs = []
    watch(pg, errs)
    pg.goto(BASE + '?shots=1&cop=0')
    wait(pg, 'window.__cook && window.__cook.ui.scene.layout')
    pg.wait_for_timeout(600)
    shot(pg, 'book-idle')

    # premium playthrough by real clicks + pointer events
    pg.click('.ck-cook[data-id="premium"]')
    wait(pg, "__cook.lab.state === 'running'", 3000)
    check(pg.evaluate("__cook.host.commands.some(c => c.type === 'startRecipe' && c.recipeId === 'premium')"), 'START_RECIPE sent for premium')
    pg.evaluate("import('./js/cook/test/autoplay.js').then(m => m.start(window.__cook))")
    seen = []
    for step_type in ['grind', 'measure', 'heat', 'stir', 'cool', 'break']:
        frac = {'measure': 0.55, 'break': 0.4, 'grind': 0.4}.get(step_type, 0.45)
        wait(pg, f"(() => {{ const g = __cook.lab.current; return g && g.type === '{step_type}' && g.progress >= {frac}; }})()", 60000)
        shot(pg, f'step-{step_type}')
        seen.append(step_type)
    wait(pg, "__cook.host.commands.some(c => c.type === 'recipeDone' && c.recipeId === 'premium')", 60000)
    done = pg.evaluate("__cook.host.commands.find(c => c.type === 'recipeDone' && c.recipeId === 'premium')")
    check(done is not None and 0 <= done['quality'] <= 1, f"RECIPE_DONE premium quality={done and done['quality']}")
    check(done['reqId'] == pg.evaluate("__cook.host.commands.find(c => c.type === 'startRecipe' && c.recipeId === 'premium').reqId"), 'RECIPE_DONE reqId matches START_RECIPE')
    pg.wait_for_timeout(500)
    shot(pg, 'result')
    check(pg.evaluate("!document.querySelector('.ck-result').hidden"), 'result card shown')
    pg.click('.ck-result')
    wait(pg, "__cook.lab.state === 'idle'", 3000)
    pg.wait_for_timeout(300)
    check(pg.evaluate("__cook.host.inv.units") == 4, 'host credited 4 units')

    # hammer (patch the hull)
    pg.click('.ck-cook[data-id="patch"]')
    wait(pg, "(() => { const g = __cook.lab.current; return g && g.type === 'hammer' && g.progress >= 0.4; })()", 20000)
    shot(pg, 'step-hammer')
    wait(pg, "__cook.host.commands.some(c => c.type === 'recipeDone' && c.recipeId === 'patch')", 30000)
    check(True, 'patch (hammer) recipe done')
    pg.evaluate('__bot.stop()')
    pg.evaluate('__cook.lab.dismissResult(); __cook.lab.toggleVent(false); __cook.lab.fumes = 0; __cook.host.crew.cook = 100')

    # fire: start, beat it with real clicks on the flames, then extinguisher button
    pg.click('.ck-cook[data-id="street"]')
    wait(pg, "__cook.lab.state === 'running'", 3000)
    pg.evaluate("__cook.lab.startFire(0.55, 'test')")
    pg.wait_for_timeout(700)
    shot(pg, 'fire')
    f0 = pg.evaluate('__cook.lab.fire')
    pos = pg.evaluate("(() => { const a = __cook.lab.fireArea(); return __cook.ui.focusToClient(a.x, a.y - 0.05); })()")
    for _ in range(2):
        pg.mouse.click(pos['x'], pos['y'])
        pg.wait_for_timeout(40)
    f1 = pg.evaluate('__cook.lab.fire')
    check(f1 < f0 - 0.3, f'clicking flames beats the fire ({f0:.2f} → {f1:.2f})')
    pg.click('.ck-ext')
    pg.wait_for_timeout(100)
    check(pg.evaluate('__cook.lab.fire') == 0 and pg.evaluate('__cook.lab.extinguisher') == 2, 'extinguisher put it out (2 charges left)')
    check(not any(c['type'] == 'explosion' for c in pg.evaluate('__cook.host.commands')), 'no explosion while fighting the fire')

    # cop alongside alarm (curtains open while cooking)
    pg.evaluate('__cook.host.copForce = true')
    pg.wait_for_timeout(1300)
    check(pg.evaluate("!document.querySelector('.ck-alarm').hidden"), 'cop alarm visible')
    shot(pg, 'cop-alarm')
    pg.click('.ck-curtains')
    pg.wait_for_timeout(600)
    check(pg.evaluate("document.querySelector('.ck-alarm').hidden") and pg.evaluate('__cook.lab.getLabState({peek:true}).curtains'), 'closing curtains clears alarm; LabState.curtains=true')
    shot(pg, 'curtains-closed')
    pg.evaluate('__cook.host.copForce = false')
    pg.click('.ck-curtains')

    # vent + smoke warning
    pg.click('.ck-vent')
    pg.wait_for_timeout(300)
    check(pg.evaluate("!document.querySelector('.ck-smoke').hidden"), 'vent open while cooking → smoke warning')
    pg.click('.ck-vent')

    # callout
    pg.click('.ck-call >> nth=0')
    check(pg.evaluate("__cook.host.commands.some(c => c.type === 'callout' && c.text === 'Slow down!')"), 'callout sent')

    # abort with confirm
    pg.click('.ck-abort')
    pg.wait_for_timeout(150)
    shot(pg, 'confirm-dump')
    pg.click('.ck-confirm-yes')
    check(pg.evaluate("__cook.host.commands.some(c => c.type === 'recipeFail' && c.reason === 'aborted')"), 'dump batch → RECIPE_FAIL aborted')
    pg.evaluate('__cook.lab.dismissResult()')

    # cook down
    pg.evaluate('__cook.host.crew.cook = 0')
    wait(pg, '__cook.lab.cookDown', 3000)
    pg.wait_for_timeout(400)
    shot(pg, 'cook-down')
    check(pg.evaluate("__cook.lab.pointerDown(0.5, 0.5)") is False, 'input disabled while cook is down')

    # explosion path
    pg.evaluate('__cook.host.crew.cook = 100; __cook.lab._recover("test")')
    pg.click('.ck-cook[data-id="smoke"]')
    wait(pg, "__cook.lab.state === 'running'", 3000)
    pg.evaluate("__cook.lab.startFire(0.95, 'test')")
    wait(pg, "__cook.host.commands.some(c => c.type === 'explosion')", 5000)
    check(pg.evaluate("__cook.host.commands.some(c => c.type === 'recipeFail' && c.reason === 'explosion')"), 'fire ≥ 1 → EXPLOSION + RECIPE_FAIL')
    pg.wait_for_timeout(300)
    shot(pg, 'exploded')

    # keyboard focus never captured by the panel
    pg.mouse.click(800, 450)
    pg.click('.ck-vent')
    pg.click('.ck-call >> nth=1')
    active = pg.evaluate('document.activeElement && document.activeElement.tagName')
    check(active in ('BODY', 'HTML'), f'focus stays on body after clicks (activeElement={active})')
    check(pg.evaluate("document.querySelectorAll('.cook-ui input, .cook-ui select, .cook-ui textarea, .cook-ui [tabindex]:not([tabindex=\"-1\"])').length") == 0, 'no focusable inputs inside the panel')

    # narrow layout: recipe book drawer
    pg.set_viewport_size({'width': 1024, 'height': 640})
    pg.wait_for_timeout(300)
    pg.click('.ck-book-toggle'); pg.wait_for_timeout(350)
    check(pg.evaluate("document.querySelector('.cook-ui').classList.contains('ck-drawer-open')"), 'narrow: recipe drawer opens')
    shot(pg, 'narrow-drawer')
    pg.click('.ck-book-toggle'); pg.wait_for_timeout(250)
    # narrower full-mode sizes
    for (w, h, name) in [(1024, 640, 'full-1024'), (1920, 1080, 'full-hd')]:
        pg.set_viewport_size({'width': w, 'height': h})
        pg.wait_for_timeout(400)
        shot(pg, name)
    check(len(errs) == 0, 'zero console errors (full mode)' + ('' if not errs else ': ' + ' | '.join(errs[:5])))
    pg.close()

    # ── compact (solo, docked 520×400) ────────────────────────────────────────
    pg = b.new_page(viewport={'width': 1280, 'height': 720})
    errs2 = []
    watch(pg, errs2)
    pg.goto(BASE + '?compact=1&shots=1&cop=0')
    wait(pg, 'window.__cook && window.__cook.ui.scene.layout')
    box = pg.evaluate("(() => { const r = document.getElementById('host').getBoundingClientRect(); return [r.width, r.height]; })()")
    check(box == [520, 400], f'compact host is 520×400 ({box})')
    check(pg.evaluate("document.querySelector('.cook-ui').classList.contains('ck-compact')"), 'compact class applied')
    host = pg.query_selector('#host')
    pg.wait_for_timeout(500)
    shot(pg, 'compact-idle', host)
    pg.click('.ck-menu-btn')
    pg.wait_for_timeout(200)
    shot(pg, 'compact-menu', host)
    pg.click('.ck-menu .ck-cook[data-id="street"]')
    wait(pg, "__cook.lab.state === 'running'", 3000)
    # compact menu while cooking offers "Dump …" with confirmation
    pg.click('.ck-menu-btn'); pg.wait_for_timeout(150)
    check(pg.evaluate("!!document.querySelector('.ck-menu-abort')"), 'compact menu offers dump while cooking')
    pg.click('.ck-menu-btn'); pg.wait_for_timeout(100)
    wait(pg, "__cook.lab.state === 'running'", 3000)
    pg.evaluate("import('./js/cook/test/autoplay.js').then(m => m.start(window.__cook))")
    wait(pg, "(() => { const g = __cook.lab.current; return g && g.type === 'heat' && g.progress >= 0.3; })()", 30000)
    shot(pg, 'compact-heat', host)
    pg.evaluate('__cook.host.copForce = true')
    pg.wait_for_timeout(1200)
    shot(pg, 'compact-cop', host)
    pg.evaluate('__cook.host.copForce = false')
    wait(pg, "__cook.host.commands.some(c => c.type === 'recipeDone' && c.recipeId === 'street')", 60000)
    check(True, 'street batch completed in compact mode')
    # driver keys still reach the page (focus not stolen)
    pg.evaluate("window.__keys = []; window.addEventListener('keydown', e => __keys.push([e.code, e.defaultPrevented]))")
    pg.click('.ck-tb-vent')
    for k in ['KeyW', 'KeyA', 'Space', 'ShiftLeft', 'KeyQ', 'KeyE', 'ArrowUp']:
        pg.keyboard.press(k)
    keys = pg.evaluate('__keys')
    check(len(keys) == 7 and not any(prevented for _, prevented in keys), f'driver keys reach window un-prevented in compact mode ({keys})')
    check(pg.evaluate('document.activeElement.tagName') in ('BODY', 'HTML'), 'compact: focus stays on body')
    # tiny container
    pg.evaluate("Object.assign(document.getElementById('host').style, {width: '420px', height: '320px'})")
    pg.wait_for_timeout(400)
    shot(pg, 'compact-420', host)
    check(len(errs2) == 0, 'zero console errors (compact)' + ('' if not errs2 else ': ' + ' | '.join(errs2[:5])))
    pg.close()
    b.close()

print('\n' + ('ALL PASS' if not fails else f'{len(fails)} FAILED: ' + '; '.join(fails)))
sys.exit(1 if fails else 0)
