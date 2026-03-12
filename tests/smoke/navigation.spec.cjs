const { test, expect } = require('@playwright/test');
const { installNetlifyMocks, seedHomeBootSeen, waitForMapReady, waitForPointReady } = require('./helpers.cjs');

test('home guest gate opens before navigating to point', async ({ page }) => {
    await installNetlifyMocks(page);
    await seedHomeBootSeen(page);

    await page.goto('/');
    await expect(page.locator('#module-reticule')).toBeVisible();
    await page.click('#module-reticule');
    await expect(page.locator('#module-auth-overlay')).toBeVisible();
    await page.click('#module-auth-guest');
    await page.waitForURL('**/point/');
    await waitForPointReady(page);
});

test('home guest gate opens before navigating to map', async ({ page }) => {
    await installNetlifyMocks(page);
    await seedHomeBootSeen(page);

    await page.goto('/');
    await expect(page.locator('#module-tactique')).toBeVisible();
    await page.click('#module-tactique');
    await expect(page.locator('#module-auth-overlay')).toBeVisible();
    await page.click('#module-auth-guest');
    await page.waitForURL('**/map/');
    await waitForMapReady(page);
});
