# Renders the R3-START approval images from public/r3-start-preview.html (headless Chromium, swiftshader).
#   python3 docs/r3/render_r3_start.py [name ...]      (server on http://localhost:3100)
# Writes docs/r3/start-*.png at 1280x720.
import asyncio, os, sys, time
from playwright.async_api import async_playwright

BASE = os.environ.get('BASE', 'http://localhost:3100') + '/r3-start-preview.html?'
OUT = os.path.dirname(os.path.abspath(__file__))
SHOTS = {
    'start-before-top': 'cam=top&layout=0&shot=1',
    'start-after-top': 'cam=top&shot=1',
    'start-before-back': 'cam=back&layout=0&shot=1',
    'start-after-back': 'cam=back&shot=1',
    'start-before-left': 'cam=left&layout=0&shot=1',
    'start-after-left': 'cam=left&shot=1',
    'start-after-door': 'cam=door&shot=1',
    'start-after-turn': 'cam=turn&shot=1',
    'start-props': 'mode=props&shot=1',
}

async def shot(browser, name, query):
    page = await browser.new_page(viewport={'width': 1280, 'height': 720})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    t0 = time.time()
    await page.goto(BASE + query)
    await page.wait_for_function('window.__r3 && window.__r3.ready', timeout=180000)
    try:
        await page.wait_for_function('window.__r3.settled()', timeout=120000)
    except Exception:
        print('  (not settled)')
    await page.wait_for_timeout(3000 if 'props' not in name else 1200)
    stats = await page.evaluate('window.__r3.stats ? window.__r3.stats() : null')
    await page.screenshot(path=os.path.join(OUT, name + '.png'))
    print(f'{name}.png  {time.time() - t0:.1f}s  {stats or ""}  {"ERRORS: " + " | ".join(errors[:3]) if errors else ""}')
    await page.close()

async def main():
    names = sys.argv[1:] or list(SHOTS)
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
        for n in names:
            await shot(browser, n, SHOTS[n])
        await browser.close()

asyncio.run(main())
