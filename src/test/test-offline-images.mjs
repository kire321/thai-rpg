// USER JOURNEY TEST (red/green) — high fidelity, local CMS mirror
//
// Given I loaded Thai RPG, disabled wifi, used other apps, then returned to Thai RPG
// When I tap "Next"
// Then I should see the character image (not the broken-image placeholder)
//
// Fidelity notes:
// - App served on 127.0.0.1:8088, CMS mirror on 127.0.0.1:9001 (cross-origin, CORS).
// - The mirror can drop connections per-path or globally — this fails fetches
//   for BOTH the page AND the service worker (Playwright routing can't do that).
// - cmsBaseUrl is seeded into localStorage so the app uses the mirror.
//
// The 2 blocked images model the user's device state (diagnostics screenshots):
// most images cached, a few permanently missing because prefetch failures are
// never repaired.
//
// Setup:
//   python3 src/test/cms-mirror.py 9001 /path/to/cms-copy   # see skill file
//   python3 -m http.server 8088 --bind 127.0.0.1 --directory dist
//   node src/test/test-offline-images.mjs
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:8088';
const CMS = process.argv[3] || 'http://127.0.0.1:9001';
const BLOCKED = ['narrator.png', 'khrueang_market.png'];
let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};
const mirrorCtl = async (q) => {
  const r = await fetch(`${CMS}/__control__?${q}`);
  console.log('   [mirror]', await r.text());
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: 'allow' });
await context.addInitScript((cms) => {
  if (!localStorage.getItem('__seeded')) {
    localStorage.setItem('thai-rpg-state', JSON.stringify({
      pageIndex: 0, isSettingsOpen: false, currentView: 'welcome', dateshift: 0, cmsBaseUrl: cms, toast: null,
    }));
    localStorage.setItem('__seeded', '1');
  }
}, CMS);
const page = await context.newPage();
page.on('console', (m) => { const t = m.text(); if (/\[Images\]|repair/i.test(t)) console.log('   [page]', t.slice(0, 220)); });

const cachedMissing = () => page.evaluate(async (BLOCKED) => {
  const cached = new Set();
  for (const n of await caches.keys()) {
    if (!n.startsWith('thai-rpg') || n.includes('content')) continue;
    const c = await caches.open(n);
    for (const k of await c.keys()) cached.add(k.url);
  }
  return BLOCKED.filter((b) => ![...cached].some((u) => u.includes(b)));
}, BLOCKED);

console.log('STEP 1: load app online; 2 images unreachable (transient failure, never cached)');
await mirrorCtl(`block=${BLOCKED.join(',')}`);
await page.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('text=Start Episode', { timeout: 90000 });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('text=Start Episode', { timeout: 90000 });
await page.waitForTimeout(20000);
const missing1 = await cachedMissing();
console.log('   missing after initial prefetch:', JSON.stringify(missing1));
check('setup: blocked images are indeed NOT in SW cache', missing1.length === BLOCKED.length,
  `missing=${JSON.stringify(missing1)}`);

console.log('STEP 2: network recovers; app foregrounded again (online + visibility events)');
await mirrorCtl('unblock=1');
await page.evaluate(() => {
  window.dispatchEvent(new Event('online'));
  document.dispatchEvent(new Event('visibilitychange'));
});
await page.waitForTimeout(15000);
const missing2 = await cachedMissing();
check('repair: previously-failed images are re-cached while online', missing2.length === 0,
  `still missing: ${missing2.join(', ')}`);

console.log('STEP 3: disable wifi (mirror drops ALL connections; app origin aborted)');
await mirrorCtl('offline=1');
await context.route('**127.0.0.1:8088/**', (route) => route.abort('internetdisconnected'));

console.log('STEP 4: use other apps → OS discards tab; reload page offline');
await page.reload({ waitUntil: 'load', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(6000);
const bootText = await page.evaluate(() => document.body.innerText.slice(0, 100).replace(/\n/g, ' '));
check('app boots offline from SW cache', bootText.length > 50, bootText.slice(0, 60));

const startBtn = await page.$('text=Start Episode');
if (startBtn) { await startBtn.click(); await page.waitForTimeout(2000); }

console.log('STEP 5: tap Next — every image must render from SW cache, no placeholders');
let brokenTaps = 0, placeholders = 0, taps = 0, sawBlockedImg = false;
for (let i = 0; i < 24; i++) {
  const next = await page.$('button:has-text("Next")');
  if (!next) break;
  await next.click();
  await page.waitForTimeout(900);
  taps++;
  const state = await page.evaluate((BLOCKED) => {
    const imgs = [...document.querySelectorAll('img')].filter((im) => im.src.includes(':9001') || im.src.includes('kimi.page'));
    return {
      ok: imgs.filter((im) => im.complete && im.naturalWidth > 0).map((im) => im.src.split('/').pop()),
      broken: imgs.filter((im) => !(im.complete && im.naturalWidth > 0)).map((im) => im.src.split('/').pop()),
      placeholder: document.body.innerText.includes('retry pending'),
      hitBlocked: imgs.some((im) => BLOCKED.some((b) => im.src.includes(b))),
    };
  }, BLOCKED);
  if (state.hitBlocked) sawBlockedImg = true;
  if (state.broken.length) { brokenTaps++; console.log(`   tap ${taps}: BROKEN ${state.broken.join(', ')}`); }
  if (state.placeholder) { placeholders++; console.log(`   tap ${taps}: retry-pending placeholder (ok imgs: ${state.ok.join(', ') || 'none'})`); }
}
console.log(`   (${taps} taps, blocked images encountered in DOM: ${sawBlockedImg})`);
check('no broken images while tapping Next offline', brokenTaps === 0, `${brokenTaps}/${taps} taps broken`);
check('no retry-pending placeholders offline', placeholders === 0, `${placeholders} taps`);

await page.screenshot({ path: '/tmp/journey-final.png' });
await browser.close();
await mirrorCtl('offline=0').catch(() => {});
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
