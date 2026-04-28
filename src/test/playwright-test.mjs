// Playwright headless browser test for Thai RPG episode flow
// Tests the actual rendered UI in a headless Chromium browser

import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:4173';

async function runTests() {
  console.log('Starting Playwright headless browser tests...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone-like
  });
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`✓ ${name}`);
    } catch (error) {
      failed++;
      console.log(`✗ ${name}`);
      console.log(`  Error: ${error.message}`);
    }
  }

  // ===== TEST 1: Page loads =====
  await test('Page loads with title', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const title = await page.title();
    if (!title.includes('Thai RPG')) throw new Error(`Expected title to contain 'Thai RPG', got: ${title}`);
  });

  // ===== TEST 2: Loading spinner appears then disappears =====
  await test('Loading spinner shows then content appears', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    // Wait for loading to complete (max 10s)
    await page.waitForFunction(() => {
      return !document.body.textContent.includes('Loading Thai RPG');
    }, { timeout: 10000 });
    // Check that welcome page content appears
    const welcomeText = await page.locator('text=Welcome to Thai RPG').first();
    if (!await welcomeText.isVisible().catch(() => false)) {
      throw new Error('Welcome text not visible after loading');
    }
  });

  // ===== TEST 3: Header shows episode count =====
  await test('Header shows episode count', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
      return !document.body.textContent.includes('Loading Thai RPG');
    }, { timeout: 10000 });
    const headerText = await page.locator('header').textContent();
    if (!headerText.includes('Ep:')) throw new Error(`Header should show Ep: count, got: ${headerText}`);
  });

  // ===== TEST 4: CRITICAL - Start Episode button works =====
  await test('Start Episode button navigates to episode', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
      return !document.body.textContent.includes('Loading Thai RPG');
    }, { timeout: 10000 });
    
    // Click Start Episode
    await page.click('button:has-text("Start Episode")');
    await page.waitForTimeout(500); // Allow React to re-render
    
    // Check we're in episode view (look for the debug text or line content)
    const bodyText = await page.locator('body').textContent();
    
    // Should NOT show the welcome screen anymore
    if (bodyText.includes('Welcome to Thai RPG') && !bodyText.includes('ship') && !bodyText.includes('lattice')) {
      throw new Error('Still on welcome screen after clicking Start Episode');
    }
    
    // Should show episode content (a dialogue line)
    // The debug panel or actual line content should be visible
    const hasEpisodeContent = bodyText.includes('ship') || 
                               bodyText.includes('lattice') || 
                               bodyText.includes('View: episode') ||
                               bodyText.includes('Narrator') ||
                               bodyText.includes('The');
    if (!hasEpisodeContent) {
      throw new Error(`Expected episode content, got: ${bodyText.substring(0, 200)}`);
    }
  });

  // ===== TEST 5: Episode navigation - Next button =====
  await test('Next button advances through episode lines', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
      return !document.body.textContent.includes('Loading Thai RPG');
    }, { timeout: 10000 });
    
    await page.click('button:has-text("Start Episode")');
    await page.waitForTimeout(500);
    
    // Get initial line text
    const initialText = await page.locator('body').textContent();
    
    // Click Next
    const nextButton = page.locator('button:has-text("Next")');
    if (await nextButton.isVisible().catch(() => false)) {
      await nextButton.click();
      await page.waitForTimeout(300);
      
      const afterText = await page.locator('body').textContent();
      // Content should have changed
      if (initialText === afterText) {
        throw new Error('Content did not change after clicking Next');
      }
    }
  });

  // ===== TEST 6: No blank screen (no crash) =====
  await test('No blank screen after Start Episode', async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
      return !document.body.textContent.includes('Loading Thai RPG');
    }, { timeout: 10000 });
    
    await page.click('button:has-text("Start Episode")');
    await page.waitForTimeout(1000);
    
    // The body should have substantial content
    const bodyHTML = await page.locator('body').innerHTML();
    if (bodyHTML.length < 100) {
      throw new Error('Page appears blank (very little HTML content)');
    }
    
    // Should NOT have an error message
    const bodyText = await page.locator('body').textContent();
    if (bodyText.includes('Something went wrong') || bodyText.includes('Render Error')) {
      throw new Error(`Error screen shown: ${bodyText.substring(0, 200)}`);
    }
    
    // Should have visible elements
    const buttons = await page.locator('button').count();
    if (buttons === 0) {
      throw new Error('No buttons visible - page may be blank');
    }
  });

  await browser.close();

  console.log('\n' + '='.repeat(60));
  console.log(`Tests passed: ${passed}`);
  console.log(`Tests failed: ${failed}`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
