const test = require('node:test');
const assert = require('node:assert/strict');

const { __test } = require('../netlify/functions/alerts.js');

test('normalizeAlert nettoie la whitelist et resume les cercles en une alerte publique coherente', () => {
  const previous = {
    id: 'alert_1',
    createdAt: '2026-03-10T08:00:00.000Z',
    updatedAt: '2026-03-10T08:00:00.000Z',
    activeCircleIndex: 0,
    circles: [
      { xPercent: 10, yPercent: 10, gpsX: 1, gpsY: 1, radius: 1.5 },
    ],
  };

  const normalized = __test.normalizeAlert({
    title: 'Intervention secteur nord',
    description: 'Equipe en mouvement',
    visibilityMode: 'whitelist',
    allowedUsers: [' Alice ', 'alice', 'b@d!', 'xy'],
    circles: [
      { xPercent: 20, yPercent: 30, gpsX: 12.5, gpsY: 48.1, radius: 2.5 },
      { xPercent: 30, yPercent: 40, gpsX: 13.5, gpsY: 49.1, radius: 3.5 },
    ],
    activeCircleIndex: 99,
    startsAt: '2026-03-11T14:30:00',
    active: true,
  }, previous);

  assert.equal(normalized.id, 'alert_1');
  assert.equal(normalized.shapeType, 'circle');
  assert.equal(normalized.circles.length, 2);
  assert.equal(normalized.activeCircleIndex, 1);
  assert.deepEqual(normalized.allowedUsers, ['alice']);
  assert.match(normalized.startsAt, /Z$/);
  assert.equal(normalized.gpsX, 13);
  assert.equal(normalized.gpsY, 48.6);
  assert.equal(normalized.radius, 3.5);
});
