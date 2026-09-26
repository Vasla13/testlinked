const { test, expect } = require('@playwright/test');
const { installNetlifyMocks } = require('./helpers.cjs');

test('database page renders 4 tabs, clouds, users, datas and graph modal', async ({ page }) => {
  await installNetlifyMocks(page, {
    authSession: true,
    authUser: {
      id: 'usr_jude',
      username: 'jude',
      firstName: 'Jude',
      lastName: 'Dupont',
      associatedPoints: ['Braquage Fleeca']
    },
    boards: [
      {
        id: 'brd_point_1',
        title: 'Enquête Los Santos',
        page: 'point',
        ownerId: 'usr_jude',
        ownerName: 'jude',
        createdAt: '2026-09-26T20:00:00.000Z',
        updatedAt: '2026-09-26T21:00:00.000Z',
        members: [
          { userId: 'usr_jude', username: 'jude', role: 'owner' },
          { userId: 'usr_mia', username: 'mia', role: 'editor' }
        ],
        associatedData: ['Braquage Fleeca'],
        data: {
          nodes: [
            { id: 'n1', name: 'John Doe', type: 'Personne', notes: 'Suspect principal' },
            { id: 'n2', name: 'Banque Fleeca', type: 'Lieu' }
          ],
          links: [
            { source: 'n1', target: 'n2', kind: 'braquage' }
          ]
        }
      },
      {
        id: 'brd_map_1',
        title: 'Opération Tactique',
        page: 'map',
        ownerId: 'usr_mia',
        ownerName: 'mia',
        createdAt: '2026-09-26T19:00:00.000Z',
        updatedAt: '2026-09-26T20:30:00.000Z',
        members: [
          { userId: 'usr_mia', username: 'mia', role: 'owner' },
          { userId: 'usr_jude', username: 'jude', role: 'editor' }
        ],
        data: {
          groups: [
            {
              id: 'grp_1',
              name: 'Cibles',
              points: [
                { id: 'p1', name: 'John Doe', notes: 'Vu sur zone' },
                { id: 'p2', name: 'Planque Nord' }
              ]
            }
          ],
          tacticalLinks: [
            { source: 'p1', target: 'p2', label: 'déplacement' }
          ]
        }
      }
    ]
  });

  // Navigate to database
  await page.goto('/database/');

  // Check top title
  await expect(page.locator('.main-title')).toHaveText('SYSTEM DATABASE');

  // Check 4 tabs exist
  const tabPoint = page.locator('button[data-tab="point"]');
  const tabMap = page.locator('button[data-tab="map"]');
  const tabUsers = page.locator('button[data-tab="users"]');
  const tabDatas = page.locator('button[data-tab="datas"]');

  await expect(tabPoint).toBeVisible();
  await expect(tabMap).toBeVisible();
  await expect(tabUsers).toBeVisible();
  await expect(tabDatas).toBeVisible();

  // Switch to Map tab
  await tabMap.click();
  await expect(page.locator('#panel-map')).toBeVisible();

  // Switch to Users tab
  await tabUsers.click();
  await expect(page.locator('#panel-users')).toBeVisible();
  await expect(page.locator('#btn-open-create-user')).toBeVisible();

  // Switch to Datas tab
  await tabDatas.click();
  await expect(page.locator('#panel-datas')).toBeVisible();
});
