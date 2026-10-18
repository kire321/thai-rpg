// USER JOURNEY TEST (red/green) — SW image cache vs. ?v= version stamping
//
// Reproduces the 2026-10-17 diagnostics screenshots: a device whose SW cache
// holds entries the current requests can never match (old/renamed/unversioned
// URLs), plus two never-cached images, fully offline.
//
// Fidelity notes:
// - App AND /cms mirror are same-origin (test-origin-server.py), so the SW
//   intercepts everything — the only faithful offline-image setup.
// - Content "regeneration" = rewriting characters/places JSON picture names,
//   mirroring the Oct-16 content batch that renamed every image file.
// - Same-origin state: cmsBaseUrl='/cms' seeded into localStorage.
//
// Setup:
//   python3 src/test/test-origin-server.py 8088 dist/ /tmp/cms-mirror
//   node src/test/test-image-version-cache.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:8088';
const MIRROR = process.argv[3] || '/tmp/cms-mirror';
const BLOCKED = ['narrator.png', 'grammar_mill.png'];
const EXPECTED_IMAGES = 48;
let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
};
const mirrorCtl = async (q) => {
  const r = await fetch(`${BASE}/__control__?${q}`);
  console.log('   [mirror]', await r.text());
};

// ---- mirror content management ----------------------------------------
const pristine = `${MIRROR}-pristine`;
if (!fs.existsSync(pristine)) fs.cpSync(MIRROR, pristine, { recursive: true });

function readJson(p) { return JSON.parse(fs.readFileSync(path.join(pristine, p), 'utf8')); }
function writeJson(p, data) {
  const fp = path.join(MIRROR, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(data));
}
function copyImage(srcRel, dstRel) {
  const dst = path.join(MIRROR, dstRel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(path.join(pristine, srcRel), dst);
}

// v1 = "old content": same records, picture files renamed v1_<name>.png
function installV1Content() {
  for (const f of ['vocab_items.json', 'episodes.json', 'attributes.json', 'tags.json']) {
    fs.cpSync(path.join(pristine, f), path.join(MIRROR, f));
  }
  for (const j of ['characters', 'places']) {
    const data = readJson(`${j}.json`);
    const items = Array.isArray(data) ? data : Object.values(data);
    for (const c of items) {
      const p = c.picture;
      if (!p) continue;
      const v1 = p.replace(/([^/]+)$/, 'v1_$1');
      copyImage(p, v1);
      c.picture = v1;
    }
    writeJson(`${j}.json`, data);
  }
}
// v2 = "regenerated content": live picture names, with a marker edit so the
// content fingerprint changes even when picture paths stay the same.
function installV2Content({ touch = false } = {}) {
  for (const f of ['vocab_items.json', 'episodes.json', 'attributes.json', 'tags.json', 'places.json']) {
    fs.cpSync(path.join(pristine, f), path.join(MIRROR, f));
  }
  const chars = readJson('characters.json');
  const items = Array.isArray(chars) ? chars : Object.values(chars);
  if (touch) items[0].name = items[0].name + ' ✦';
  writeJson('characters.json', chars);
}

// ---- browser helpers ----------------------------------------------------
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ serviceWorkers: 'allow' });
await context.addInitScript(() => {
  if (!localStorage.getItem('__seeded')) {
    localStorage.setItem('thai-rpg-state', JSON.stringify({
      pageIndex: 0, isSettingsOpen: false, currentView: 'welcome', dateshift: 0, cmsBaseUrl: '/cms', toast: null,
    }));
    localStorage.setItem('__seeded', '1');
  }
});
const page = await context.newPage();
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /\[Images\]|\[Store\]|\[CMS\]|\[Cache\]|repair/i.test(t)) console.log('   [page]', t.slice(0, 200)); });
page.on('pageerror', (e) => console.log('   [pageerror]', String(e).slice(0, 200)));

const cacheImageKeys = () => page.evaluate(async () => {
  const out = new Set();
  for (const n of await caches.keys()) {
    if (!n.startsWith('thai-rpg') || n.includes('content')) continue;
    const c = await caches.open(n);
    for (const k of await c.keys()) {
      if (k.url.includes('/cms/') && /\.(png|jpe?g|webp)([?#]|$)/i.test(k.url)) out.add(k.url);
    }
  }
  return [...out];
});
const dumpKeys = async (label) => {
  const ks = await cacheImageKeys();
  console.log(`   [keys@${label}] ${ks.length}:`, ks.slice(0, 5).map((k) => k.split('/cms/')[1]).join(', '));
};
const waitFor = async (fn, desc, timeout = 60000) => {
  const t0 = Date.now();
  let lastV, lastErr;
  while (Date.now() - t0 < timeout) {
    try {
      lastV = await fn();
      lastErr = undefined;
      if (lastV) return lastV;
    } catch (e) { lastErr = String(e).slice(0, 200); }
    await page.waitForTimeout(500);
  }
  console.log(`   (timeout waiting for ${desc}; last=${JSON.stringify(lastV)?.slice(0, 120)} err=${lastErr})`);
  return null;
};
// Welcome screen OR a resumed episode (state persists across reloads, so a
// reload mid-test lands back in the episode view — no 'Start Episode' button).
// NOTE: 'text=A, css=B' does NOT parse as a union — once the string starts
// with 'text=', the entire remainder (comma included) becomes the literal text
// pattern and matches nothing. Wait on the DOM directly instead.
const waitForApp = async () => {
  try {
    // Ready = real content rendered: welcome or an episode screen. The
    // loading screen has text too — exclude it, or the reload fires mid-fetch
    // and aborts the first load's CMS downloads (real users don't reload in
    // 2s either; resumed-episode screens are covered by the Next/choice check).
    await page.waitForFunction(() => {
      const txt = document.body.innerText;
      if (/loading|กำลังโหลด/i.test(txt)) return false;
      return txt.includes('Start Episode')
        || [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Next'));
    }, null, { timeout: 90000 });
  } catch (e) {
    const body = await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => '<no body>');
    console.log(`   [waitForApp FAIL] body=${JSON.stringify(body)}`);
    await page.screenshot({ path: '/tmp/waitforapp-fail.png' }).catch(() => {});
    throw e;
  }
};
const loadApp = async () => {
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await waitForApp();
};
// The app shell (JS/CSS bundle) is fetched on first load BEFORE the service
// worker controls the page, so it bypasses the SW and is NOT cached. A second
// ONLINE reload routes the bundle through the SW's fetch handler, which
// caches it — only then can the app boot fully offline. (Same reason
// test-offline-images.mjs reloads before simulating airplane mode.)
const loadAppWithCachedShell = async () => {
  await loadApp();
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await waitForApp();
  // The reload must end up SW-controlled before any caching pass runs;
  // on a slow install the ensure's controller wait is the only guard.
  try {
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  } catch (e) {
    const reg = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration('/').catch(() => null);
      return r ? { active: r.active?.state, installing: r.installing?.state, waiting: r.waiting?.state } : 'none';
    });
    console.log('   [controller-wait FAIL] registration:', JSON.stringify(reg));
    throw e;
  }
};
const imageVersion = () => page.evaluate(() => JSON.parse(localStorage.getItem('thai-rpg-state') || '{}').imageVersion || 0);
const renderState = () => page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img')].filter((im) => im.src.includes('/cms/'));
  return {
    total: imgs.length,
    broken: imgs.filter((im) => !(im.complete && im.naturalWidth > 0)).map((im) => im.src.split('/').pop()),
    placeholder: document.body.innerText.includes('retry pending'),
  };
});
// allowedBroken: basenames that are permitted to fail (images the scenario
// deliberately kept out of the cache). Placeholders are tolerated only while
// EVERY broken image is an allowed one.
const playAndCheckImages = async (label, { allowedBroken = [] } = {}) => {
  await waitForApp();
  const start = await page.$('text=Start Episode');
  if (start) { await start.click(); await page.waitForTimeout(1500); }
  let broken = [], placeholder = false, sawImages = 0;
  for (let i = 0; i < 20; i++) {
    const st = await renderState();
    broken = broken.concat(st.broken);
    placeholder = placeholder || st.placeholder;
    sawImages = Math.max(sawImages, st.total);
    const next = await page.$('button:has-text("Next")');
    if (next) { await next.click(); await page.waitForTimeout(800); continue; }
    // Choice screen (or a lazy-loading beat): give images a moment to appear,
    // then take the first choice button to keep advancing the episode.
    await page.waitForTimeout(1200);
    const st2 = await renderState();
    sawImages = Math.max(sawImages, st2.total);
    const choice = await page.$('button:not(:has-text("Next")):visible');
    if (!choice) break;
    await choice.click();
    await page.waitForTimeout(800);
  }
  const unexpected = broken.filter((b) => !allowedBroken.some((a) => b.includes(a)));
  // Non-vacuity: the session must show SOME image-related signal. A resumed
  // mid-episode run can cross image-less narrative screens (0 <img> at every
  // step) — broken/placeholder are still hard failures below when unexpected.
  check(`${label}: image slots rendered (non-vacuous)`, sawImages > 0 || broken.length > 0 || placeholder, `${sawImages} decoded, ${broken.length} broken, placeholder=${placeholder}`);
  check(`${label}: every unexpected image decodes (no 503 from SW)`, unexpected.length === 0, unexpected.slice(0, 4).join(', '));
  if (allowedBroken.length) {
    check(`${label}: placeholders only for never-cached (allowed) images`, !placeholder || broken.every((b) => allowedBroken.some((a) => b.includes(a))));
  } else {
    check(`${label}: no 'retry pending' placeholders`, !placeholder);
  }
};

// ================= PHASE 1: v1 content online — images cached unversioned
console.log('PHASE 1: v1 content, online first load');
await mirrorCtl('unblock=1&offline=0'); // reset any state from previous runs
installV1Content();
await loadAppWithCachedShell();
const keys1 = await waitFor(async () => {
  const ks = await cacheImageKeys();
  return ks.length >= EXPECTED_IMAGES ? ks : null;
}, '48 cached images');
check('all v1 images cached on first load', keys1 && keys1.length >= EXPECTED_IMAGES,
  keys1 ? `${keys1.length} keys` : 'no keys');

// ============ PHASE 2: content regenerated; 2 images unreachable (screenshots)
console.log('PHASE 2: v2 content (renamed pictures), narrator.png+grammar_mill.png unreachable');
await mirrorCtl(`block=${BLOCKED.join(',')}`);
installV2Content();
await page.reload({ waitUntil: 'load' });
await waitForApp();
const v2 = await waitFor(async () => {
  const ks = await cacheImageKeys();
  return ks.filter((k) => !k.includes('v1_')).length >= EXPECTED_IMAGES - BLOCKED.length ? ks : null;
}, '46 v2 images cached');
check('the 2 unreachable images are indeed NOT cached (user device state)', v2 && BLOCKED.every((b) => !v2.some((k) => k.includes(`/${b}`))),
  BLOCKED.map((b) => `${b}:${v2 ? v2.filter((k) => k.includes(`/${b}`)).length : '?'}`).join(' '));
check('other 46 v2 images cached under versioned URLs', v2 && v2.filter((k) => !k.includes('v1_') && k.includes('?v=')).length >= EXPECTED_IMAGES - BLOCKED.length);
const T1 = await imageVersion();
check('imageVersion bumped on content change', T1 > 0, `T1=${T1}`);
// Pace the test to the app's pass: the rename-prune (v1_ orphans deleted)
// runs at the END of the ensure pass, which is sequential through the SW and
// can outlast the checks above. Moving on early leaves orphans behind.
const pruned = await waitFor(async () => {
  const ks = await cacheImageKeys();
  return ks.every((k) => !k.includes('v1_')) ? ks : null;
}, 'v1 orphans pruned', 90000);
check('renamed v1 orphans pruned after the pass completes', !!pruned);

// ===== PHASE 3: back online (still fully offline in between) — repair must self-heal
console.log('PHASE 3: unblock; app returns online — verify-and-repair fills the gaps');
await mirrorCtl('unblock=1');
// Reload rather than synthetic events: the phase-2 caching pass may still be
// running (calls coalesce), and a fresh load triggers its own unthrottled pass.
await page.reload({ waitUntil: 'load' });
await waitForApp();
// Require the CURRENT-name key (v1_narrator.png also matches 'narrator.png'
// — a v1 orphan once made this check pass before the repair ran).
const healed = await waitFor(async () => {
  const ks = await cacheImageKeys();
  return BLOCKED.every((b) => ks.some((k) => k.includes(`/${b}`) && !k.includes('v1_'))) ? ks : null;
}, 'blocked images repaired into cache', 90000);
check('verify-and-repair caches the 2 previously-missing images', !!healed);
await dumpKeys('end-phase3');

// ============ PHASE 4: content changed again, ALL images unreachable, then offline
// The dangerous window: requests now carry ?v=T2 but the cache only has
// ?v=T1 entries. Old behavior evicted the T1 entries up front and 503'd
// offline; the cache must keep serving until the new version lands.
console.log('PHASE 4: content touch + all images blocked → offline with only old-variant entries');
await mirrorCtl('block=.png');
installV2Content({ touch: true });
await page.reload({ waitUntil: 'load' });
await waitForApp();
await page.waitForTimeout(3000);
const T2 = await imageVersion();
check('imageVersion bumped again on changed content', T2 > 0 && T2 !== T1, `T1=${T1} T2=${T2}`);
await mirrorCtl('offline=1');
await page.reload({ waitUntil: 'load', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(5000);
// Direct probe of the fix: the cache only holds ?v=T1 entries, but requests
// carry ?v=T2. The SW must serve the old variant (ignoreSearch fallback).
// NOTE: after phase 3's repair, narrator.png IS cached — at its old ?v=T1
// variant. Offline at ?v=T2 it must still be served (that's the fallback
// doing its job), so only a genuinely never-cached URL can 503.
const probe = await page.evaluate(async (T) => {
  const cached = await fetch(`/cms/characters/pricha.png?v=${T}`, { mode: 'cors' }).then((r) => r.ok).catch(() => false);
  const oldVariantResp = await fetch(`/cms/characters/narrator.png?v=${T}`, { mode: 'cors' }).then((r) => r.status).catch((e) => 'EXC:' + String(e).slice(0, 80));
  const missing = await fetch(`/cms/characters/ghost_never_cached.png?v=${T}`, { mode: 'cors' }).then((r) => r.status).catch(() => 0);
  return { cached, oldVariant: oldVariantResp, missing };
}, T2);
await dumpKeys('phase4-pre-probe');
check('SW serves old-variant bytes for the NEW version stamp (ignoreSearch fallback)', probe.cached);
check('offline image cached at an older variant is still served', probe.oldVariant === 200, `status=${probe.oldVariant}`);
check('truly-never-cached image 503s offline (nothing to serve — correct)', probe.missing === 503, `status=${probe.missing}`);
await playAndCheckImages('offline with old-variant cache entries', { allowedBroken: BLOCKED });

// ============ PHASE 5: online again — repair, then cache converges to exactly
// the current versioned URLs (no stale variants, no renamed orphans)
console.log('PHASE 5: back online — repair + prune; exactly one current entry per image');
await mirrorCtl('offline=0&unblock=1');
await page.reload({ waitUntil: 'load' });
await waitForApp();
const T3 = await waitFor(async () => {
  const v = await imageVersion();
  const ks = await cacheImageKeys();
  return ks.filter((k) => k.includes(`?v=${v}`)).length >= EXPECTED_IMAGES ? v : null;
}, '48 images cached at current version', 90000);
check('all 48 images re-cached at current imageVersion', !!T3, `T3=${T3}`);
// The SW pass caches new variants BEFORE pruneStaleImageVariants finishes
// deleting superseded ones — wait for CONVERGENCE (exactly the current set),
// not merely for the new keys to appear.
const keys5 = await waitFor(async () => {
  const ks = await cacheImageKeys();
  return ks.length === EXPECTED_IMAGES && ks.every((k) => k.includes(`?v=${T3}`) && !k.includes('v1_')) ? ks : null;
}, 'cache converges to exactly the current 48', 60000);
check('no stale variants or renamed orphans left in cache', !!keys5,
  keys5 ? `${keys5.length} keys` : 'did not converge');
await mirrorCtl('offline=1');
await page.reload({ waitUntil: 'load', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(5000);
await playAndCheckImages('offline after convergence');

// ============ PHASE 6: reload online with UNCHANGED content — no churn
console.log('PHASE 6: reload online, content unchanged — version + cache stable, no re-fetch');
await mirrorCtl('offline=0');
await page.reload({ waitUntil: 'load' });
await waitForApp();
await page.waitForTimeout(5000);
const T4 = await imageVersion();
const keys6 = await cacheImageKeys();
check('imageVersion NOT re-bumped when content unchanged', T4 === T3, `T3=${T3} T4=${T4}`);
check('image cache keys untouched (no re-download churn)',
  keys6.length === EXPECTED_IMAGES && keys6.every((k) => k.includes(`?v=${T3}`)));

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
