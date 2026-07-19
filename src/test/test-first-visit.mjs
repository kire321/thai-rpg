// Test: first-visit race — single load, NO reload; prefetch must still cache everything
// Setup: same servers as test-offline-images.mjs
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:8088';
const CMS = process.argv[3] || 'http://127.0.0.1:9001';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: 'allow' });
await context.addInitScript((cms) => {
  if (!localStorage.getItem('__seeded')) {
    localStorage.setItem('thai-rpg-state', JSON.stringify({ pageIndex: 0, isSettingsOpen: false, currentView: 'welcome', dateshift: 0, cmsBaseUrl: cms, toast: null }));
    localStorage.setItem('__seeded', '1');
  }
}, CMS);
const page = await context.newPage();
page.on('console', (m) => { const t = m.text(); if (/\[Images\]/i.test(t)) console.log('   [page]', t.slice(0, 200)); });

await fetch(`${CMS}/__control__?unblock=1`);
console.log('first visit, NO reload — prefetch races SW startup');
await page.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('text=Start Episode', { timeout: 90000 });

// poll up to 60s for all images cached
let missing = [];
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2000);
  missing = await page.evaluate(async (CMS) => {
    const expected = [];
    for (const f of ['characters.json', 'places.json']) {
      const data = await (await fetch(`${CMS}/${f}`)).json();
      const items = Array.isArray(data) ? data : Object.values(data);
      for (const item of items) if (item?.picture) expected.push(item.picture.startsWith('/') ? CMS + item.picture : item.picture);
    }
    const missing = [];
    for (const url of expected) {
      let found = false;
      for (const n of await caches.keys()) {
        if (!n.startsWith('thai-rpg') || n.includes('content')) continue;
        const c = await caches.open(n);
        if (await c.match(url, { ignoreVary: true })) { found = true; break; }
      }
      if (!found) missing.push(url.split('/').pop());
    }
    return missing;
  }, CMS);
  if (missing.length === 0) break;
}
console.log(missing.length === 0 ? 'PASS  all images cached on first visit (no reload)' : `FAIL  missing: ${missing.join(', ')}`);
await browser.close();
process.exit(missing.length === 0 ? 0 : 1);
