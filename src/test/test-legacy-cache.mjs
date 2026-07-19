// Test: legacy cache entries (written by the OLD service worker into its old
// cache name) must still serve offline via findInAnyCache + ignoreVary.
// This models the 21 images on the user's phone, cached by the old SW.
// Setup: same servers as test-offline-images.mjs
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:8088';
const CMS = process.argv[3] || 'http://127.0.0.1:9001';
const LEGACY_CACHE = 'thai-rpg-2026-07-14-01'; // old SW's cache name (preserved)
const LEGACY_IMG = CMS + '/places/silent_zone.png';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: 'allow' });
await context.addInitScript((cms) => {
  if (!localStorage.getItem('__seeded')) {
    localStorage.setItem('thai-rpg-state', JSON.stringify({ pageIndex: 0, isSettingsOpen: false, currentView: 'welcome', dateshift: 0, cmsBaseUrl: cms, toast: null }));
    localStorage.setItem('__seeded', '1');
  }
}, CMS);
const page = await context.newPage();

await fetch(`${CMS}/__control__?unblock=1`);
await page.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('text=Start Episode', { timeout: 90000 });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('text=Start Episode', { timeout: 90000 });
await page.waitForTimeout(3000);

// Simulate a legacy entry: store the image under the OLD cache name only
const setup = await page.evaluate(async ({ LEGACY_CACHE, LEGACY_IMG }) => {
  const resp = await fetch(LEGACY_IMG, { mode: 'cors' });
  const legacy = await caches.open(LEGACY_CACHE);
  await legacy.put(LEGACY_IMG, resp);
  // Remove from current caches so ONLY the legacy entry remains
  for (const n of await caches.keys()) {
    if (!n.startsWith('thai-rpg') || n.includes('content') || n === LEGACY_CACHE) continue;
    const c = await caches.open(n);
    await c.delete(LEGACY_IMG);
  }
  return { stored: true };
}, { LEGACY_CACHE, LEGACY_IMG });
console.log('legacy entry stored');

// Go offline and request the image through the SW (as <img> would)
await fetch(`${CMS}/__control__?offline=1`);
await context.route('**127.0.0.1:8088/**', (route) => route.abort('internetdisconnected'));
const result = await page.evaluate(async (LEGACY_IMG) => {
  try {
    const r = await fetch(LEGACY_IMG, { mode: 'cors' });
    const blob = await r.blob();
    return { status: r.status, size: blob.size };
  } catch (e) { return { error: e.message }; }
}, LEGACY_IMG);
await fetch(`${CMS}/__control__?offline=0`).catch(() => {});
console.log('offline fetch of legacy-cached image:', JSON.stringify(result));
const pass = result.status === 200 && result.size > 1000;
console.log(pass ? 'PASS  legacy entry serves offline' : 'FAIL  legacy entry NOT served offline');
await browser.close();
process.exit(pass ? 0 : 1);
