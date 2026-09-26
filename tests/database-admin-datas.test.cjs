const test = require('node:test');
const assert = require('node:assert/strict');

// Import collab helpers
const {
  safeUser,
  normalizeUsername,
  withMember,
  withoutMember,
  sanitizeRole,
} = require('../netlify/lib/collab');

test('safeUser includes firstName, lastName and associatedPoints', () => {
  const user = {
    id: 'usr_123',
    username: 'jude',
    firstName: 'Jude',
    lastName: 'Dupont',
    associatedPoints: ['Jean Dupont', 'Banque Fleeca'],
    createdAt: '2026-09-26T20:00:00.000Z',
    passwordHash: 'secret123',
  };

  const safe = safeUser(user);
  assert.equal(safe.id, 'usr_123');
  assert.equal(safe.username, 'jude');
  assert.equal(safe.firstName, 'Jude');
  assert.equal(safe.lastName, 'Dupont');
  assert.deepEqual(safe.associatedPoints, ['Jean Dupont', 'Banque Fleeca']);
  assert.equal(safe.createdAt, '2026-09-26T20:00:00.000Z');
  assert.equal(safe.passwordHash, undefined);
});

test('withMember and withoutMember correctly update members list', () => {
  const board = {
    id: 'brd_1',
    members: [
      { userId: 'usr_1', username: 'alice', role: 'owner' }
    ]
  };

  // Add new member
  const withBob = withMember(board, { userId: 'usr_2', username: 'bob', role: 'editor' });
  assert.equal(withBob.length, 2);
  assert.equal(withBob[1].username, 'bob');
  assert.equal(withBob[1].role, 'editor');

  // Update existing member role
  const updateBob = withMember({ ...board, members: withBob }, { userId: 'usr_2', username: 'bob', role: 'viewer' });
  assert.equal(updateBob.length, 2);
  assert.equal(updateBob[1].role, 'viewer');

  // Remove member
  const withoutBob = withoutMember({ ...board, members: updateBob }, 'usr_2');
  assert.equal(withoutBob.length, 1);
  assert.equal(withoutBob[0].username, 'alice');
});

test('sanitizeRole allows only valid roles with editor fallback', () => {
  assert.equal(sanitizeRole('owner'), 'owner');
  assert.equal(sanitizeRole('editor'), 'editor');
  assert.equal(sanitizeRole('viewer'), 'viewer');
  assert.equal(sanitizeRole('admin'), 'editor');
  assert.equal(sanitizeRole('super_admin'), 'editor');
  assert.equal(sanitizeRole('', 'viewer'), 'viewer');
});

test('Datas aggregation logic correctly merges duplicates across Point and Map clouds', () => {
  const normKey = (str) =>
    String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const mockBoards = [
    {
      id: 'brd_point_1',
      title: 'Dossier Gang',
      page: 'point',
      data: {
        nodes: [
          { id: 'n1', name: 'John Doe', type: 'Personne', notes: 'Chef de gang' },
          { id: 'n2', name: 'Vangelico', type: 'Lieu' }
        ],
        links: [
          { source: 'n1', target: 'n2', kind: 'braquage' }
        ]
      }
    },
    {
      id: 'brd_map_1',
      title: 'Opération Alpha',
      page: 'map',
      data: {
        groups: [
          {
            name: 'Cibles',
            points: [
              { id: 'p1', name: 'john doe', notes: 'Repéré secteur Sud' },
              { id: 'p2', name: 'Planque Nord' }
            ]
          }
        ],
        tacticalLinks: [
          { source: 'p1', target: 'p2', label: 'trajet' }
        ]
      }
    }
  ];

  const datasMap = new Map();
  for (const board of mockBoards) {
    if (board.page === 'point') {
      for (const n of board.data.nodes) {
        const k = normKey(n.name);
        if (!datasMap.has(k)) {
          datasMap.set(k, { key: k, name: n.name, count: 0, occurrences: [] });
        }
        const item = datasMap.get(k);
        item.count++;
        item.occurrences.push({ boardId: board.id, id: n.id });
      }
    } else if (board.page === 'map') {
      for (const g of board.data.groups) {
        for (const pt of g.points) {
          const k = normKey(pt.name);
          if (!datasMap.has(k)) {
            datasMap.set(k, { key: k, name: pt.name, count: 0, occurrences: [] });
          }
          const item = datasMap.get(k);
          item.count++;
          item.occurrences.push({ boardId: board.id, id: pt.id });
        }
      }
    }
  }

  // John Doe should be aggregated from both boards!
  const johnEntry = datasMap.get('john doe');
  assert.ok(johnEntry);
  assert.equal(johnEntry.count, 2);
  assert.equal(johnEntry.occurrences.length, 2);
  assert.equal(johnEntry.occurrences[0].boardId, 'brd_point_1');
  assert.equal(johnEntry.occurrences[1].boardId, 'brd_map_1');

  // Vangelico and Planque Nord are distinct
  assert.equal(datasMap.get('vangelico').count, 1);
  assert.equal(datasMap.get('planque nord').count, 1);
});

test('Auto-matching detects user full name and username matches', () => {
  const normKey = (str) =>
    String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const user = {
    username: 'jude_op',
    firstName: 'Jude',
    lastName: 'Dupont'
  };

  const entityKey1 = normKey('Jude Dupont');
  const entityKey2 = normKey('jude_op');
  const entityKey3 = normKey('Autre Nom');

  const fullName = `${user.firstName} ${user.lastName}`;

  assert.equal(normKey(fullName) === entityKey1, true);
  assert.equal(normKey(user.username) === entityKey2, true);
  assert.equal(normKey(fullName) === entityKey3, false);
});
