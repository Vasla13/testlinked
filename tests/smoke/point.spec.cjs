const { test, expect } = require('@playwright/test');
const { installNetlifyMocks, waitForPointReady } = require('./helpers.cjs');

test('point guest file menu keeps local actions and auth-gated cloud access', async ({ page }) => {
    await installNetlifyMocks(page);

    await page.goto('/point/');
    await waitForPointReady(page);

    await page.click('#btnDataFileToggle');

    await expect(page.locator('#cloud-home-tab-local')).toBeVisible();
    await expect(page.locator('#cloud-home-tab-cloud')).toBeVisible();
    await expect(page.locator('[data-local-action="save-file"]')).toBeVisible();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.click('[data-local-action="open-file"]');
    const chooser = await chooserPromise;
    expect(chooser).toBeTruthy();

    await page.click('#btnDataFileToggle');

    await page.click('#cloud-home-tab-cloud');

    await expect(page.locator('#cloud-auth-user')).toBeVisible();
    await expect(page.locator('#cloud-auth-pass')).toBeVisible();
});

test('point editor keeps long names visible and uses a square color picker', async ({ page }) => {
    await installNetlifyMocks(page);

    await page.goto('/point/');
    await waitForPointReady(page);

    await page.evaluate(() => {
        const btn = document.getElementById('createPerson');
        if (!btn) throw new Error('createPerson button missing');
        btn.click();
    });
    await expect(page.locator('#edQuickNameInline')).toBeVisible();
    await expect(page.locator('#edQuickNameInline')).toHaveJSProperty('tagName', 'TEXTAREA');

    await page.fill('#edQuickNameInline', 'Jean-Baptiste Maximilien de la Tour du Nord - secteur tres long');

    const nameHeight = await page.locator('#edQuickNameInline').evaluate((el) => el.clientHeight);
    expect(nameHeight).toBeGreaterThan(40);

    const colorBox = await page.locator('#edColorQuick').boundingBox();
    if (!colorBox) throw new Error('Color input not available');
    expect(Math.abs(colorBox.width - colorBox.height)).toBeLessThanOrEqual(6);
});

test('point settings presets remain clickable and update the panel state', async ({ page }) => {
    await installNetlifyMocks(page);

    await page.goto('/point/');
    await waitForPointReady(page);

    await page.getByTitle('Ouvrir les parametres et presets de vision reseau').click();
    await expect(page.locator('#settings-panel')).toBeVisible();

    await page.locator('.settings-preset-btn').nth(1).click();

    await expect(page.locator('.settings-preset-btn.active .settings-preset-name')).toContainText('Ennemis tres eloignes');
    await expect(page.locator('#val-repulsion')).toHaveText('1520');
});

test('point owner can open the Gerer board panel', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('bniLinkedCollabSession_v1', JSON.stringify({
            token: 'smoke-token',
            user: { username: 'smoke-user' },
        }));
    });

    await installNetlifyMocks(page, {
        authSession: true,
        authUser: { username: 'smoke-user' },
        boards: [{
            id: 'board-owner',
            title: 'Board Owner',
            role: 'owner',
            page: 'point',
            members: [{ userId: 'u-smoke', username: 'smoke-user', role: 'owner' }],
            onlineUsers: ['u-smoke'],
        }],
    });

    await page.goto('/point/');
    await waitForPointReady(page);

    await page.click('#btnDataFileToggle');
    await expect(page.locator('.cloud-manage-board')).toBeVisible();
    await page.click('.cloud-manage-board');

    await expect(page.locator('.cloud-board-manage-head')).toBeVisible();
    await expect(page.locator('.modal-tool-title')).toContainText('Gestion du board');
});
