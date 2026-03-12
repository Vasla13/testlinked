const { test, expect } = require('@playwright/test');
const { drawCircleInViewport, installNetlifyMocks, waitForMapReady } = require('./helpers.cjs');

test('map can create a point from GPS input and select it', async ({ page }) => {
    await installNetlifyMocks(page);

    await page.goto('/map/');
    await waitForMapReady(page);

    await page.click('#btnAddGroup');
    await page.click('#btnToggleGpsPanel');
    await page.fill('#gpsInputX', '0');
    await page.fill('#gpsInputY', '0');
    await page.fill('#gpsName', 'Smoke Point');
    await page.click('#btnAddGpsPoint');

    await expect(page.locator('#edName')).toHaveValue('Smoke Point');
});

test('map keeps a single interaction controller for draw mode and exposes the mode hud', async ({ page }) => {
    await installNetlifyMocks(page);

    await page.goto('/map/');
    await waitForMapReady(page);

    await page.click('#btnAddGroup');

    const viewport = page.locator('#viewport');
    const box = await viewport.boundingBox();
    if (!box) throw new Error('Viewport not available');

    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45, { button: 'right' });
    await expect(page.locator('#context-menu')).toBeVisible();
    await page.click('#ctx-new-zone');

    await expect(page.locator('#map-interaction-mode')).toBeVisible();
    await expect(page.locator('#mapInteractionModeLabel')).toHaveText('Mode cercle');

    await drawCircleInViewport(page, '#viewport', {
        startXRatio: 0.52,
        startYRatio: 0.44,
        endXRatio: 0.68,
        endYRatio: 0.58,
    });

    await expect(page.locator('#ezName')).toHaveValue(/Zone 1/);
    await expect(page.locator('#map-interaction-mode')).toBeHidden();
});
