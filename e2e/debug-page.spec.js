// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Debug Page Structure', () => {
  test('Capture page structure and screenshot', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('📝 Opening game page...');
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Take screenshot
    await page.screenshot({ path: 'e2e/screenshots/initial-page.png', fullPage: true });
    console.log('📝 Screenshot saved to e2e/screenshots/initial-page.png');

    // Get page content
    const html = await page.content();
    console.log('📝 Page title:', await page.title());
    
    // Find all input and button elements
    const inputs = await page.locator('input').all();
    const buttons = await page.locator('button').all();
    
    console.log('\n📝 INPUT ELEMENTS:');
    for (let i = 0; i < Math.min(inputs.length, 10); i++) {
      const input = inputs[i];
      const id = await input.getAttribute('id');
      const placeholder = await input.getAttribute('placeholder');
      const value = await input.getAttribute('value');
      const type = await input.getAttribute('type');
      console.log(`  ${i+1}. id="${id}", placeholder="${placeholder}", value="${value}", type="${type}"`);
    }

    console.log('\n📝 BUTTON ELEMENTS:');
    for (let i = 0; i < Math.min(buttons.length, 10); i++) {
      const button = buttons[i];
      const text = await button.textContent();
      const id = await button.getAttribute('id');
      const onclick = await button.getAttribute('onclick');
      console.log(`  ${i+1}. id="${id}", text="${text?.trim()}", onclick="${onclick}"`);
    }

    // Get all section IDs
    const sections = await page.locator('[id*="section"], [class*="section"]').all();
    console.log('\n📝 SECTIONS:');
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const id = await section.getAttribute('id');
      const classes = await section.getAttribute('class');
      const hidden = await section.classList().then(c => c.includes('hidden')).catch(() => false);
      console.log(`  ${i+1}. id="${id}", class="${classes}", hidden=${hidden}`);
    }

    await context.close();
  });
});
