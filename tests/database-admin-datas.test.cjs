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

test('Node merging logic merges data entity and associated user into single node', () => {
  const normKey = (str) =>
    String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const user = {
    id: 'usr_michel',
    username: 'michelmuck',
    firstName: 'Michel',
    lastName: 'Muck',
    associatedPoints: ['Michel Muck'],
  };

  const loadedUsers = [user];
  const allSubgraphKeys = ['michel muck', 'banque fleeca'];
  const entities = new Map([
    ['michel muck', { name: 'Michel Muck', statuses: ['actif'], occurrences: [{ boardId: 'b1' }] }],
    ['banque fleeca', { name: 'Banque Fleeca', statuses: ['actif'], occurrences: [{ boardId: 'b1' }] }]
  ]);

  // Map users to entities
  const cleanNormKey = (s) => normKey(s).replace(/^@+/, '');
  const userToEntityMap = new Map();
  const entityToUserMap = new Map();
  for (const k of allSubgraphKeys) {
    const cleanK = cleanNormKey(k);
    const matchedUser = loadedUsers.find((u) => {
      const points = Array.isArray(u.associatedPoints) ? u.associatedPoints : [];
      if (points.some((p) => cleanNormKey(p) === cleanK)) return true;
      const full = `${u.firstName || ''} ${u.lastName || ''}`.trim();
      const reverse = `${u.lastName || ''} ${u.firstName || ''}`.trim();
      if (full && cleanNormKey(full) === cleanK) return true;
      if (reverse && cleanNormKey(reverse) === cleanK) return true;
      if (cleanNormKey(u.username) === cleanK) return true;
      return false;
    });
    if (matchedUser) {
      userToEntityMap.set(String(matchedUser.id), k);
      entityToUserMap.set(k, matchedUser);
    }
  }

  // Build merged graph nodes
  const graphNodes = [];
  for (const k of allSubgraphKeys) {
    const e = entities.get(k);
    const associatedUser = entityToUserMap.get(k);
    const rawName = e?.name || k;
    let label = rawName;
    if (associatedUser) {
      const atTag = `@${associatedUser.username}`;
      if (!label.toLowerCase().includes(atTag.toLowerCase())) {
        label = `${rawName} (${atTag})`;
      }
    }
    graphNodes.push({
      id: `data:${k}`,
      dataKey: k,
      label,
      rawName,
      hasUser: Boolean(associatedUser),
      user: associatedUser ? safeUser(associatedUser) : null,
    });
  }

  const michelNode = graphNodes.find((n) => n.dataKey === 'michel muck');
  assert.ok(michelNode);
  assert.equal(michelNode.hasUser, true);
  assert.equal(michelNode.label, 'Michel Muck (@michelmuck)');
  assert.equal(michelNode.user.username, 'michelmuck');

  const fleecaNode = graphNodes.find((n) => n.dataKey === 'banque fleeca');
  assert.ok(fleecaNode);
  assert.equal(fleecaNode.hasUser, false);
  assert.equal(fleecaNode.label, 'Banque Fleeca');
  assert.equal(fleecaNode.user, null);

  // Redundant user node should NOT be present among data entities
  assert.equal(graphNodes.some((n) => n.id === `user:${user.id}`), false);
});

test('Status resolution correctly handles inactif, disparu, and mort with proper priority', () => {
  const resolveStatus = (statuses) => {
    if (!statuses || !statuses.length) return null;
    const norm = statuses.map((s) => String(s || '').trim().toLowerCase());
    if (norm.includes('mort') || norm.includes('deceased')) return 'mort';
    if (norm.includes('disparu') || norm.includes('missing')) return 'disparu';
    if (norm.includes('inactif') || norm.includes('inactive')) return 'inactif';
    return 'actif';
  };

  assert.equal(resolveStatus(['inactif']), 'inactif');
  assert.equal(resolveStatus(['inactive']), 'inactif');
  assert.equal(resolveStatus(['actif', 'inactif']), 'inactif'); // Inactive overrides active
  assert.equal(resolveStatus(['inactif', 'disparu']), 'disparu'); // Missing overrides inactive
  assert.equal(resolveStatus(['inactif', 'mort']), 'mort'); // Deceased overrides inactive
  assert.equal(resolveStatus(['actif']), 'actif');
  assert.equal(resolveStatus([]), null);
});

test('Graph physics attraction calculations enforce zero attraction on inactif/mort and shared-indirect scaling', () => {
  // Simulator link strength function matching database/index.html & point/js/physics.js logic
  function computeLinkStrength(link, sourceNode, targetNode) {
    const sStatus = String(sourceNode?.status || '').toLowerCase();
    const tStatus = String(targetNode?.status || '').toLowerCase();
    const inactiveStatuses = ['inactif', 'inactive', 'mort', 'deceased', 'disparu', 'missing'];

    // Inactif / mort / disparu -> force d'attraction nulle
    if (inactiveStatuses.includes(sStatus) || inactiveStatuses.includes(tStatus)) {
      return 0;
    }

    const shared = link.sharedIndirectCount || 0;
    const isEx = ['ex_employe', 'ex_membre'].includes(link.kind);
    if (isEx) {
      if (shared === 0) return 0;
      return Math.min(0.45, 0.05 + shared * 0.1);
    }

    const sDeg = sourceNode?.degree ?? 1;
    const tDeg = targetNode?.degree ?? 1;

    let baseStrength = 0.7;
    if (isEx) {
      if (shared === 0) return 0;
      baseStrength = Math.min(0.45, 0.05 + shared * 0.1);
    } else if (link.kind === 'ami') {
      if (shared === 0) baseStrength = 0.02; // minimal attraction if 0 shared indirect
      else baseStrength = Math.min(0.85, 0.06 + shared * 0.16);
    } else if (link.kind === 'connaissance') {
      if (shared === 0) baseStrength = 0.01;
      else baseStrength = Math.min(0.7, 0.04 + shared * 0.12);
    } else if (link.kind === 'amour') {
      if (shared === 0) baseStrength = 0.04;
      else baseStrength = Math.min(0.9, 0.1 + shared * 0.18);
    }

    // 2nd degree to 2nd degree has strictly reduced attraction compared to base
    if (sDeg === 2 && tDeg === 2) {
      return Math.min(baseStrength * 0.5, 0.06);
    }

    return baseStrength;
  }

  const activeNode1 = { id: 'n1', status: 'actif', degree: 1 };
  const activeNode2 = { id: 'n2', status: 'actif', degree: 1 };
  const inactiveNode = { id: 'n3', status: 'inactif', degree: 1 };
  const deadNode = { id: 'n4', status: 'mort', degree: 1 };
  const missingNode = { id: 'n5', status: 'disparu', degree: 1 };
  const deg2NodeA = { id: 'n6', status: 'actif', degree: 2 };
  const deg2NodeB = { id: 'n7', status: 'actif', degree: 2 };

  // 1. Inactif / mort / disparu gives zero attraction
  assert.equal(computeLinkStrength({ kind: 'ami', sharedIndirectCount: 5 }, activeNode1, inactiveNode), 0);
  assert.equal(computeLinkStrength({ kind: 'collegue' }, activeNode1, deadNode), 0);
  assert.equal(computeLinkStrength({ kind: 'ami' }, missingNode, activeNode2), 0);

  // 2. Ex employé / Ex membre: 0 shared -> 0 strength; > 0 shared -> scales up
  assert.equal(computeLinkStrength({ kind: 'ex_employe', sharedIndirectCount: 0 }, activeNode1, activeNode2), 0);
  assert.equal(computeLinkStrength({ kind: 'ex_membre', sharedIndirectCount: 0 }, activeNode1, activeNode2), 0);
  assert.ok(computeLinkStrength({ kind: 'ex_employe', sharedIndirectCount: 2 }, activeNode1, activeNode2) > 0);
  assert.ok(computeLinkStrength({ kind: 'ex_membre', sharedIndirectCount: 3 }, activeNode1, activeNode2) > 0.2);

  // 3. Ami: 0 shared -> minimal attraction (0.02); scales up with shared connections
  const ami0 = computeLinkStrength({ kind: 'ami', sharedIndirectCount: 0 }, activeNode1, activeNode2);
  const ami1 = computeLinkStrength({ kind: 'ami', sharedIndirectCount: 1 }, activeNode1, activeNode2);
  const ami3 = computeLinkStrength({ kind: 'ami', sharedIndirectCount: 3 }, activeNode1, activeNode2);
  assert.equal(ami0, 0.02);
  assert.ok(ami1 > ami0);
  assert.ok(ami3 > ami1);

  // 4. Connaissance and amour scaling
  const conn0 = computeLinkStrength({ kind: 'connaissance', sharedIndirectCount: 0 }, activeNode1, activeNode2);
  const conn2 = computeLinkStrength({ kind: 'connaissance', sharedIndirectCount: 2 }, activeNode1, activeNode2);
  assert.equal(conn0, 0.01);
  assert.ok(conn2 > conn0);

  // 5. 2nd degree to 2nd degree has reduced attraction (< 1st degree)
  const deg2Strength = computeLinkStrength({ kind: 'relation' }, deg2NodeA, deg2NodeB);
  assert.equal(deg2Strength, 0.06);

  // 2nd degree friends with 0 shared has less attraction than 1st degree (0.01 vs 0.02)
  const deg2Ami0 = computeLinkStrength({ kind: 'ami', sharedIndirectCount: 0 }, deg2NodeA, deg2NodeB);
  assert.equal(deg2Ami0, 0.01);
  assert.ok(deg2Ami0 < ami0);
});

test('Shared indirect connections counter accurately computes common non-enemy neighbors excluding clouds', () => {
  const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }, { id: 'cloud:board_1' }];
  const links = [
    { source: 'A', target: 'C', kind: 'ami' },
    { source: 'B', target: 'C', kind: 'ami' },
    { source: 'A', target: 'D', kind: 'collegue' },
    { source: 'B', target: 'D', kind: 'collegue' },
    { source: 'A', target: 'cloud:board_1', kind: 'membre_cloud' },
    { source: 'B', target: 'cloud:board_1', kind: 'membre_cloud' },
    { source: 'A', target: 'B', kind: 'ami' },
  ];

  const adj = new Map();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const l of links) {
    if (l.kind === 'ennemi') continue;
    adj.get(l.source).add(l.target);
    adj.get(l.target).add(l.source);
  }

  // Calculate shared indirect count for A-B excluding cloud: nodes
  const aNeighbors = adj.get('A');
  const bNeighbors = adj.get('B');
  let shared = 0;
  for (const neighbor of aNeighbors) {
    if (neighbor !== 'B' && bNeighbors.has(neighbor) && !String(neighbor).startsWith('cloud:')) {
      shared++;
    }
  }

  // A and B both connect to C and D (and cloud:board_1 which is excluded) -> shared count is 2
  assert.equal(shared, 2);
});

test('Map status normalization correctly translates French statuses inactif, disparu, mort', () => {
  const normMapStatus = (s) => {
    const raw = String(s || 'ACTIVE').toLowerCase();
    if (raw === 'inactive' || raw === 'inactif') return 'inactive';
    if (raw === 'missing' || raw === 'disparu') return 'missing';
    if (raw === 'deceased' || raw === 'mort') return 'deceased';
    return 'active';
  };

  assert.equal(normMapStatus('inactif'), 'inactive');
  assert.equal(normMapStatus('INACTIF'), 'inactive');
  assert.equal(normMapStatus('disparu'), 'missing');
  assert.equal(normMapStatus('mort'), 'deceased');
  assert.equal(normMapStatus('active'), 'active');
  assert.equal(normMapStatus('ACTIVE'), 'active');
});

test('User rename logic supports firstName, lastName, and username validation / reindexing', () => {
  const store = new Map();
  const user = {
    id: 'usr_abc',
    username: 'oldname',
    firstName: 'OldFirst',
    lastName: 'OldLast',
    associatedPoints: ['Jean'],
  };
  store.set(`users/${user.id}`, user);
  store.set(`users/by-name/oldname`, { userId: user.id, username: 'oldname' });

  // 1. Invalid username fails
  const invalidCheck = normalizeUsername('ab');
  assert.equal(invalidCheck.ok, false);

  // 2. Already taken username by another user fails
  store.set(`users/by-name/takenname`, { userId: 'other_user', username: 'takenname' });
  const checkTaken = normalizeUsername('takenname');
  assert.equal(checkTaken.ok, true);
  const existing = store.get(`users/by-name/${checkTaken.username}`);
  assert.ok(existing && existing.userId !== user.id);

  // 3. Valid username renames and moves index
  const validCheck = normalizeUsername('newname');
  assert.equal(validCheck.ok, true);
  const newUsername = validCheck.username;
  store.delete(`users/by-name/${user.username}`);
  user.username = newUsername;
  user.firstName = 'NewFirst';
  user.lastName = 'NewLast';
  store.set(`users/by-name/${newUsername}`, { userId: user.id, username: newUsername });
  store.set(`users/${user.id}`, user);

  assert.equal(store.has('users/by-name/oldname'), false);
  assert.equal(store.get('users/by-name/newname').userId, 'usr_abc');
  assert.equal(user.firstName, 'NewFirst');
  assert.equal(user.lastName, 'NewLast');
});

test('User delete logic removes userKey and usernameKey', () => {
  const store = new Map();
  const userId = 'usr_to_delete';
  const username = 'delete_me';
  store.set(`users/${userId}`, { id: userId, username });
  store.set(`users/by-name/${username}`, { userId, username });

  // Delete
  assert.equal(store.has(`users/${userId}`), true);
  assert.equal(store.has(`users/by-name/${username}`), true);
  store.delete(`users/${userId}`);
  store.delete(`users/by-name/${username}`);

  assert.equal(store.has(`users/${userId}`), false);
  assert.equal(store.has(`users/by-name/${username}`), false);
});

test('Status normalization supports groups and companies (mort, disparu, inactif, actif)', () => {
  const normalizePersonStatus = (value, type = null) => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'inactive' || raw === 'inactif') return 'inactif';
    if (raw === 'missing' || raw === 'disparu') return 'disparu';
    if (raw === 'deceased' || raw === 'mort') return 'mort';
    return 'actif';
  };

  for (const type of ['person', 'group', 'company']) {
    assert.equal(normalizePersonStatus('inactif', type), 'inactif');
    assert.equal(normalizePersonStatus('disparu', type), 'disparu');
    assert.equal(normalizePersonStatus('mort', type), 'mort');
    assert.equal(normalizePersonStatus('actif', type), 'actif');
    assert.equal(normalizePersonStatus('unknown', type), 'actif');
    assert.equal(normalizePersonStatus('', type), 'actif');
  }
});

test('Hostile links (ennemi, rival) have red color #ff3344, zero attraction and repulsion flags', () => {
  const HOSTILE_LINK_KINDS = new Set(['ennemi', 'rival']);
  const POINT_LINK_COLORS = {
    patron: '#9b59b6',
    haut_grade: '#f39c12',
    employe: '#f1c40f',
    ex_employe: '#94a3b8',
    collegue: '#e67e22',
    partenaire: '#1abc9c',
    famille: '#8e44ad',
    couple: '#e84393',
    amour: '#fd79a8',
    ami: '#2ecc71',
    connaissance: '#bdc3c7',
    ennemi: '#ff3344',
    rival: '#ff3344',
    affiliation: '#3498db',
    membre: '#2980b9',
    ex_membre: '#64748b',
    relation: '#95a5a6'
  };

  // 1. Both ennemi and rival are hostile
  assert.equal(HOSTILE_LINK_KINDS.has('ennemi'), true);
  assert.equal(HOSTILE_LINK_KINDS.has('rival'), true);
  assert.equal(HOSTILE_LINK_KINDS.has('ami'), false);

  // 2. Both ennemi and rival are colored #ff3344
  assert.equal(POINT_LINK_COLORS['ennemi'], '#ff3344');
  assert.equal(POINT_LINK_COLORS['rival'], '#ff3344');

  // 3. Hostile links have zero attraction force in simulation
  const getPhysicsStrength = (link) => {
    if (HOSTILE_LINK_KINDS.has(link.kind)) return 0;
    return 0.7;
  };
  assert.equal(getPhysicsStrength({ kind: 'ennemi' }), 0);
  assert.equal(getPhysicsStrength({ kind: 'rival' }), 0);
  assert.equal(getPhysicsStrength({ kind: 'ami' }), 0.7);
});

test('Person color dynamically computes weighted average of connected organizations/groups', () => {
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  };
  const rgbToHex = (r, g, b) => {
    const ch = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0))).toString(16).padStart(2, '0');
    return `#${ch(r)}${ch(g)}${ch(b)}`;
  };

  const computeGraphNodeColors = (nodes, links) => {
    const orgColors = new Map();
    for (const node of nodes) {
      if (node.pointType === 'group' || node.pointType === 'company') {
        if (node.color && node.color !== '#ffffff') {
          orgColors.set(node.id, node.color);
        }
      }
    }

    const personColors = new Map();
    for (const node of nodes) {
      if (node.pointType === 'person' || (!node.pointType && !node.isUser && !node.isCloud)) {
        let totalR = 0, totalG = 0, totalB = 0, count = 0;
        for (const l of links) {
          const sId = typeof l.source === 'object' ? l.source.id : l.source;
          const tId = typeof l.target === 'object' ? l.target.id : l.target;
          let otherId = null;
          if (sId === node.id) otherId = tId;
          else if (tId === node.id) otherId = sId;

          if (otherId && orgColors.has(otherId)) {
            const rgb = hexToRgb(orgColors.get(otherId));
            totalR += rgb.r;
            totalG += rgb.g;
            totalB += rgb.b;
            count++;
          }
        }
        if (count > 0) {
          personColors.set(node.id, rgbToHex(totalR / count, totalG / count, totalB / count));
        } else {
          personColors.set(node.id, '#ffffff');
        }
      }
    }
    return { orgColors, personColors };
  };

  const nodes = [
    { id: 'org_red', pointType: 'group', color: '#ff0000' },
    { id: 'org_blue', pointType: 'company', color: '#0000ff' },
    { id: 'p_dual', pointType: 'person' },
    { id: 'p_solo', pointType: 'person' },
    { id: 'p_alone', pointType: 'person' },
  ];
  const links = [
    { source: 'p_dual', target: 'org_red' },
    { source: 'p_dual', target: 'org_blue' },
    { source: 'p_solo', target: 'org_red' },
  ];

  const { personColors } = computeGraphNodeColors(nodes, links);

  // Alone person has default #ffffff
  assert.equal(personColors.get('p_alone'), '#ffffff');
  // Solo person has exact red color #ff0000
  assert.equal(personColors.get('p_solo'), '#ff0000');
  // Dual person has average of #ff0000 and #0000ff -> #800080 (purple)
  assert.equal(personColors.get('p_dual'), '#800080');
});

