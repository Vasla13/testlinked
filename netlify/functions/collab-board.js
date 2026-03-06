const {
  connectLambda,
  jsonResponse,
  preflightResponse,
  errorResponse,
  readBody,
  normalizeUsername,
  normalizeTitle,
  normalizePage,
  safeUser,
  nowIso,
  newId,
  resolveAuth,
  listKeysByPrefix,
  boardKey,
  getUserByUsername,
  getUserById,
  getRoleForUser,
  canEditBoard,
  sanitizeRole,
  withMember,
  withoutMember,
  boardSummary,
  ROLE_OWNER,
  ROLE_EDITOR,
} = require("../lib/collab");

async function loadBoard(store, boardId) {
  if (!boardId) return null;
  return store.get(boardKey(boardId), { type: "json" });
}

async function saveBoard(store, board) {
  return store.setJSON(boardKey(board.id), board);
}

function validatePointBoardData(data) {
  if (!data || typeof data !== "object") return false;
  if (!Array.isArray(data.nodes) || !Array.isArray(data.links)) return false;
  return true;
}

function validateMapBoardData(data) {
  if (!data || typeof data !== "object") return false;
  if (!Array.isArray(data.groups)) return false;
  if (data.tacticalLinks !== undefined && !Array.isArray(data.tacticalLinks)) return false;
  return true;
}

function validateBoardData(data, page) {
  const normalizedPage = normalizePage(page);
  if (normalizedPage === "map") return validateMapBoardData(data);
  return validatePointBoardData(data);
}

const PRESENCE_STALE_MS = 15000;
const PRESENCE_MAX_ITEMS = 24;
const SESSION_ACTIVE_MS = 35000;
const SESSION_SCAN_MAX = 400;
const BOARD_ACTIVITY_MAX = 40;
const COLLAB_NODE_FIELDS = [
  "name",
  "type",
  "color",
  "num",
  "accountNumber",
  "citizenNumber",
  "description",
  "notes",
  "x",
  "y",
  "fixed",
  "linkedMapPointId",
];
const COLLAB_LINK_FIELDS = ["source", "target", "kind"];

function isSameBoardPayload(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) {
    return false;
  }
}

function cloneJson(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    return fallback;
  }
}

function pluralize(count, singular, plural = `${singular}s`) {
  return Math.abs(Number(count) || 0) > 1 ? plural : singular;
}

function timeValue(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortById(list) {
  return [...list].sort((a, b) => String(a?.id || "").localeCompare(String(b?.id || "")));
}

function normalizeNode(node) {
  if (!node || typeof node !== "object") return null;
  const id = node.id ?? "";
  if (id === "") return null;
  return {
    id,
    name: String(node.name || "").trim(),
    type: String(node.type || "person"),
    color: String(node.color || ""),
    num: String(node.num || ""),
    accountNumber: String(node.accountNumber || ""),
    citizenNumber: String(node.citizenNumber || ""),
    description: String(node.description || node.notes || ""),
    notes: String(node.notes || node.description || ""),
    x: Number(node.x) || 0,
    y: Number(node.y) || 0,
    fixed: Boolean(node.fixed),
    linkedMapPointId: String(node.linkedMapPointId || ""),
  };
}

function normalizeLink(link) {
  if (!link || typeof link !== "object") return null;
  const id = link.id ?? "";
  if (id === "") return null;
  const source = link.source && typeof link.source === "object" ? link.source.id : link.source;
  const target = link.target && typeof link.target === "object" ? link.target.id : link.target;
  const sourceId = String(source ?? "");
  const targetId = String(target ?? "");
  if (!sourceId || !targetId || sourceId === targetId) return null;
  return {
    id,
    source: sourceId,
    target: targetId,
    kind: String(link.kind || "relation"),
  };
}

function normalizeEntityMeta(rawMeta, fields, fallbackUpdatedAt = "", fallbackUser = "") {
  const fallbackAt = String(fallbackUpdatedAt || "");
  const fallbackBy = String(fallbackUser || "");
  const meta = rawMeta && typeof rawMeta === "object" ? rawMeta : {};
  const fieldTimes = {};
  for (const field of fields) {
    fieldTimes[field] = String(meta.fieldTimes?.[field] || meta[field] || fallbackAt || "");
  }
  return {
    updatedAt: String(meta.updatedAt || fallbackAt || ""),
    updatedBy: String(meta.updatedBy || fallbackBy || ""),
    fieldTimes,
  };
}

function normalizeDeletedEntries(list, fallbackUpdatedAt = "", fallbackUser = "") {
  const latest = new Map();
  const fallbackAt = String(fallbackUpdatedAt || "");
  const fallbackBy = String(fallbackUser || "");
  const source = Array.isArray(list) ? list : [];
  for (const item of source) {
    const id = String(item?.id ?? "").trim();
    if (!id) continue;
    const next = {
      id,
      deletedAt: String(item?.deletedAt || fallbackAt || ""),
      deletedBy: String(item?.deletedBy || fallbackBy || ""),
    };
    const prev = latest.get(id);
    if (!prev || timeValue(next.deletedAt) >= timeValue(prev.deletedAt)) {
      latest.set(id, next);
    }
  }
  return sortById([...latest.values()]);
}

function normalizeBoardPayload(data, options = {}) {
  const fallbackUpdatedAt = String(options.fallbackUpdatedAt || "");
  const fallbackUser = String(options.fallbackUser || "");
  const raw = data && typeof data === "object" ? data : {};
  const nodes = sortById(
    (Array.isArray(raw.nodes) ? raw.nodes : [])
      .map((node) => {
        const normalized = normalizeNode(node);
        if (!normalized) return null;
        return {
          ...normalized,
          _collab: normalizeEntityMeta(node?._collab, COLLAB_NODE_FIELDS, fallbackUpdatedAt, fallbackUser),
        };
      })
      .filter(Boolean)
  );
  const links = sortById(
    (Array.isArray(raw.links) ? raw.links : [])
      .map((link) => {
        const normalized = normalizeLink(link);
        if (!normalized) return null;
        return {
          ...normalized,
          _collab: normalizeEntityMeta(link?._collab, COLLAB_LINK_FIELDS, fallbackUpdatedAt, fallbackUser),
        };
      })
      .filter(Boolean)
  );
  return {
    meta: raw.meta && typeof raw.meta === "object" ? { ...raw.meta } : {},
    physicsSettings: raw.physicsSettings && typeof raw.physicsSettings === "object"
      ? cloneJson(raw.physicsSettings, {})
      : {},
    nodes,
    links,
    deletedNodes: normalizeDeletedEntries(raw.deletedNodes, fallbackUpdatedAt, fallbackUser),
    deletedLinks: normalizeDeletedEntries(raw.deletedLinks, fallbackUpdatedAt, fallbackUser),
    _collab: normalizeEntityMeta(raw._collab, ["physicsSettings"], fallbackUpdatedAt, fallbackUser),
  };
}

function normalizeBoardActivity(board) {
  const rows = Array.isArray(board?.activity) ? board.activity : [];
  return rows
    .map((item) => ({
      id: String(item?.id || ""),
      at: String(item?.at || ""),
      actorId: String(item?.actorId || ""),
      actorName: String(item?.actorName || ""),
      type: String(item?.type || "info"),
      text: String(item?.text || "").trim(),
    }))
    .filter((item) => item.id && item.text)
    .sort((a, b) => timeValue(b.at) - timeValue(a.at))
    .slice(0, BOARD_ACTIVITY_MAX);
}

function appendBoardActivity(board, user, type, text) {
  if (!board || !text) return;
  const existing = normalizeBoardActivity(board);
  const latest = existing[0];
  if (
    latest &&
    String(type || "info") === "save" &&
    String(latest.type || "") === "save" &&
    String(latest.actorId || "") === String(user?.id || "") &&
    (Date.now() - timeValue(latest.at)) < 25000
  ) {
    latest.at = nowIso();
    latest.text = String(text || "").trim();
    board.activity = [latest, ...existing.slice(1)].slice(0, BOARD_ACTIVITY_MAX);
    return;
  }

  const entry = {
    id: newId("act"),
    at: nowIso(),
    actorId: String(user?.id || ""),
    actorName: String(user?.username || ""),
    type: String(type || "info"),
    text: String(text || "").trim(),
  };
  board.activity = [entry, ...existing].slice(0, BOARD_ACTIVITY_MAX);
}

function summarizeBoardDelta(previousData, nextData, options = {}) {
  const prevNodes = Array.isArray(previousData?.nodes) ? previousData.nodes.length : 0;
  const nextNodes = Array.isArray(nextData?.nodes) ? nextData.nodes.length : 0;
  const prevLinks = Array.isArray(previousData?.links) ? previousData.links.length : 0;
  const nextLinks = Array.isArray(nextData?.links) ? nextData.links.length : 0;
  const nodeDelta = nextNodes - prevNodes;
  const linkDelta = nextLinks - prevLinks;
  const parts = [];

  if (nodeDelta !== 0) {
    parts.push(`${nodeDelta > 0 ? "+" : ""}${nodeDelta} ${pluralize(nodeDelta, "fiche")}`);
  }
  if (linkDelta !== 0) {
    parts.push(`${linkDelta > 0 ? "+" : ""}${linkDelta} ${pluralize(linkDelta, "lien")}`);
  }
  if (options.mergedConflict) {
    parts.push("fusion auto");
  }
  return parts.join(" · ") || "contenu mis a jour";
}

function cloneEntity(entity, fields) {
  if (!entity) return null;
  const result = { id: entity.id };
  for (const field of fields) result[field] = cloneJson(entity[field], entity[field]);
  result._collab = normalizeEntityMeta(entity._collab, fields, entity?._collab?.updatedAt || "", entity?._collab?.updatedBy || "");
  return result;
}

function mergeEntities(left, right, fields) {
  if (!left && !right) return null;
  if (!left) return cloneEntity(right, fields);
  if (!right) return cloneEntity(left, fields);

  const leftMeta = normalizeEntityMeta(left._collab, fields, left?._collab?.updatedAt || "", left?._collab?.updatedBy || "");
  const rightMeta = normalizeEntityMeta(right._collab, fields, right?._collab?.updatedAt || "", right?._collab?.updatedBy || "");
  const merged = { id: right.id ?? left.id };
  const fieldTimes = {};
  let latestAt = "";
  let latestBy = "";

  for (const field of fields) {
    const leftAt = String(leftMeta.fieldTimes[field] || leftMeta.updatedAt || "");
    const rightAt = String(rightMeta.fieldTimes[field] || rightMeta.updatedAt || "");
    const useRight = timeValue(rightAt) >= timeValue(leftAt);
    merged[field] = cloneJson(useRight ? right[field] : left[field], useRight ? right[field] : left[field]);
    fieldTimes[field] = useRight ? rightAt : leftAt;
    if (timeValue(fieldTimes[field]) >= timeValue(latestAt)) {
      latestAt = fieldTimes[field];
      latestBy = useRight ? String(rightMeta.updatedBy || "") : String(leftMeta.updatedBy || "");
    }
  }

  merged._collab = {
    updatedAt: latestAt || String(rightMeta.updatedAt || leftMeta.updatedAt || ""),
    updatedBy: latestBy || String(rightMeta.updatedBy || leftMeta.updatedBy || ""),
    fieldTimes,
  };
  return merged;
}

function mergeDeletedEntries(leftList, rightList) {
  return normalizeDeletedEntries([...(Array.isArray(leftList) ? leftList : []), ...(Array.isArray(rightList) ? rightList : [])]);
}

function normalizeLinkSignature(link) {
  const a = String(link?.source || "");
  const b = String(link?.target || "");
  const pair = a < b ? `${a}|${b}` : `${b}|${a}`;
  return `${pair}|${String(link?.kind || "")}`;
}

function dedupeLinksBySignature(links) {
  const latest = new Map();
  for (const link of links) {
    const sig = normalizeLinkSignature(link);
    const prev = latest.get(sig);
    if (!prev || timeValue(link?._collab?.updatedAt) >= timeValue(prev?._collab?.updatedAt)) {
      latest.set(sig, link);
    }
  }
  return sortById([...latest.values()]);
}

function pruneBoardPayload(payload) {
  const normalized = normalizeBoardPayload(payload, {
    fallbackUpdatedAt: payload?._collab?.updatedAt || "",
    fallbackUser: payload?._collab?.updatedBy || "",
  });
  const deletedNodes = new Map(normalized.deletedNodes.map((item) => [String(item.id), item]));
  const nodes = normalized.nodes.filter((node) => {
    const tombstone = deletedNodes.get(String(node.id));
    if (!tombstone) return true;
    return timeValue(node?._collab?.updatedAt) > timeValue(tombstone.deletedAt);
  });
  const nodeIds = new Set(nodes.map((node) => String(node.id)));

  const deletedLinks = new Map(normalized.deletedLinks.map((item) => [String(item.id), item]));
  const links = dedupeLinksBySignature(
    normalized.links.filter((link) => {
      const tombstone = deletedLinks.get(String(link.id));
      if (tombstone && timeValue(link?._collab?.updatedAt) <= timeValue(tombstone.deletedAt)) return false;
      return nodeIds.has(String(link.source)) && nodeIds.has(String(link.target));
    })
  );

  return {
    ...normalized,
    nodes,
    links,
  };
}

function mergeBoardPayload(existingData, incomingData, options = {}) {
  const existing = normalizeBoardPayload(existingData, {
    fallbackUpdatedAt: options.existingUpdatedAt || "",
    fallbackUser: options.existingUser || "",
  });
  const incoming = normalizeBoardPayload(incomingData, {
    fallbackUpdatedAt: options.incomingUpdatedAt || options.existingUpdatedAt || "",
    fallbackUser: options.incomingUser || "",
  });
  const mergedNodeIds = new Set([
    ...existing.nodes.map((node) => String(node.id)),
    ...incoming.nodes.map((node) => String(node.id)),
  ]);
  const existingNodes = new Map(existing.nodes.map((node) => [String(node.id), node]));
  const incomingNodes = new Map(incoming.nodes.map((node) => [String(node.id), node]));
  const nodes = sortById(
    [...mergedNodeIds]
      .map((id) => mergeEntities(existingNodes.get(id), incomingNodes.get(id), COLLAB_NODE_FIELDS))
      .filter(Boolean)
  );

  const mergedLinkIds = new Set([
    ...existing.links.map((link) => String(link.id)),
    ...incoming.links.map((link) => String(link.id)),
  ]);
  const existingLinks = new Map(existing.links.map((link) => [String(link.id), link]));
  const incomingLinks = new Map(incoming.links.map((link) => [String(link.id), link]));
  const links = sortById(
    [...mergedLinkIds]
      .map((id) => mergeEntities(existingLinks.get(id), incomingLinks.get(id), COLLAB_LINK_FIELDS))
      .filter(Boolean)
  );

  const existingBoardMeta = normalizeEntityMeta(existing._collab, ["physicsSettings"], options.existingUpdatedAt || "", options.existingUser || "");
  const incomingBoardMeta = normalizeEntityMeta(incoming._collab, ["physicsSettings"], options.incomingUpdatedAt || "", options.incomingUser || "");
  const existingPhysicsAt = String(existingBoardMeta.fieldTimes.physicsSettings || existingBoardMeta.updatedAt || "");
  const incomingPhysicsAt = String(incomingBoardMeta.fieldTimes.physicsSettings || incomingBoardMeta.updatedAt || "");
  const useIncomingPhysics = timeValue(incomingPhysicsAt) >= timeValue(existingPhysicsAt);
  const boardMeta = {
    updatedAt: useIncomingPhysics
      ? String(incomingBoardMeta.updatedAt || incomingPhysicsAt || existingBoardMeta.updatedAt || "")
      : String(existingBoardMeta.updatedAt || existingPhysicsAt || incomingBoardMeta.updatedAt || ""),
    updatedBy: useIncomingPhysics
      ? String(incomingBoardMeta.updatedBy || "")
      : String(existingBoardMeta.updatedBy || ""),
    fieldTimes: {
      physicsSettings: useIncomingPhysics ? incomingPhysicsAt : existingPhysicsAt,
    },
  };

  return pruneBoardPayload({
    meta: {
      ...(existing.meta || {}),
      ...(incoming.meta || {}),
    },
    physicsSettings: useIncomingPhysics
      ? cloneJson(incoming.physicsSettings, incoming.physicsSettings)
      : cloneJson(existing.physicsSettings, existing.physicsSettings),
    nodes,
    links,
    deletedNodes: mergeDeletedEntries(existing.deletedNodes, incoming.deletedNodes),
    deletedLinks: mergeDeletedEntries(existing.deletedLinks, incoming.deletedLinks),
    _collab: boardMeta,
  });
}

function presenceKey(boardId, userId) {
  return `presence/${boardId}/${userId}`;
}

async function listOnlineUsers(store, allowedUserIds = null) {
  const keys = await listKeysByPrefix(store, "sessions/", SESSION_SCAN_MAX);
  const rows = await Promise.all(keys.map((key) => store.get(key, { type: "json" }).catch(() => null)));
  const now = Date.now();
  const allow = allowedUserIds instanceof Set ? allowedUserIds : null;
  const latestByUser = new Map();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const key = keys[index];
    const userId = String(row?.userId || "");
    if (!row || !userId) {
      if (key) await store.delete(key).catch(() => {});
      continue;
    }
    if (allow && !allow.has(userId)) continue;
    const age = now - timeValue(row.lastAt);
    if (age > SESSION_ACTIVE_MS) continue;
    const prev = latestByUser.get(userId);
    if (!prev || timeValue(row.lastAt) >= timeValue(prev.lastAt)) {
      latestByUser.set(userId, { userId, lastAt: String(row.lastAt || "") });
    }
  }

  return [...latestByUser.values()]
    .sort((a, b) => timeValue(b.lastAt) - timeValue(a.lastAt))
    .map((item) => item.userId);
}

function presencePrefix(boardId) {
  return `presence/${boardId}/`;
}

async function listBoardPresence(store, boardId) {
  const keys = await listKeysByPrefix(store, presencePrefix(boardId), PRESENCE_MAX_ITEMS);
  const rows = await Promise.all(keys.map((key) => store.get(key, { type: "json" }).catch(() => null)));
  const now = Date.now();
  const active = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const key = keys[index];
    if (!row || !row.userId) {
      if (key) await store.delete(key).catch(() => {});
      continue;
    }
    const age = now - timeValue(row.lastAt);
    if (age > PRESENCE_STALE_MS) {
      if (key) await store.delete(key).catch(() => {});
      continue;
    }
    active.push({
      userId: String(row.userId || ""),
      username: String(row.username || ""),
      role: sanitizeRole(row.role || ROLE_EDITOR, ROLE_EDITOR),
      boardId: String(row.boardId || boardId || ""),
      activeNodeId: String(row.activeNodeId || ""),
      activeNodeName: String(row.activeNodeName || ""),
      mode: String(row.mode || "editing"),
      lastAt: String(row.lastAt || ""),
    });
  }

  active.sort((a, b) => String(a.username || "").localeCompare(String(b.username || "")));
  return active;
}

async function touchBoardPresence(store, board, user, role, payload = {}) {
  const boardId = String(board?.id || "");
  if (!boardId || !user?.id) return [];
  const now = nowIso();
  await store.setJSON(presenceKey(boardId, user.id), {
    boardId,
    userId: user.id,
    username: user.username,
    role: sanitizeRole(role || ROLE_EDITOR, ROLE_EDITOR),
    activeNodeId: String(payload.activeNodeId || ""),
    activeNodeName: String(payload.activeNodeName || "").slice(0, 80),
    mode: String(payload.mode || "editing"),
    lastAt: now,
  });
  return listBoardPresence(store, boardId);
}

async function clearBoardPresence(store, boardId, userId) {
  if (!boardId || !userId) return;
  await store.delete(presenceKey(boardId, userId)).catch(() => {});
}

function sleep(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  return new Promise((resolve) => setTimeout(resolve, safeMs));
}

exports.handler = async (event) => {
  connectLambda(event);

  if (event.httpMethod === "OPTIONS") {
    return preflightResponse();
  }

  if (event.httpMethod !== "POST") {
    return errorResponse(405, "Method not allowed");
  }

  const body = readBody(event);
  if (!body) {
    return errorResponse(400, "JSON invalide.");
  }

  const action = String(body.action || "").toLowerCase();
  const auth = await resolveAuth(event, body);
  if (!auth.ok) {
    return errorResponse(auth.statusCode || 401, auth.error || "Session requise.");
  }

  const { store, user } = auth;

  if (action === "list_boards") {
    const keys = await listKeysByPrefix(store, "boards/", 1000);
    const loadedBoards = await Promise.all(
      keys.map((key) => store.get(key, { type: "json" }).catch(() => null))
    );
    const boards = loadedBoards
      .filter((board) => board && board.id)
      .map((board) => {
        const role = getRoleForUser(board, user.id);
        if (!role) return null;
        return boardSummary(board, role);
      })
      .filter(Boolean);

    boards.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return jsonResponse(200, {
      ok: true,
      user: safeUser(user),
      boards,
    });
  }

  if (action === "create_board") {
    const data = body.data;
    const page = normalizePage(body.page);
    if (!validateBoardData(data, page)) {
      return errorResponse(400, "Donnees du tableau invalides.");
    }

    const boardId = newId("brd");
    const now = nowIso();
    const normalizedData = mergeBoardPayload(
      { meta: {}, physicsSettings: {}, nodes: [], links: [], deletedNodes: [], deletedLinks: [], _collab: { updatedAt: now, updatedBy: user.username, fieldTimes: { physicsSettings: now } } },
      data,
      {
        existingUpdatedAt: now,
        incomingUpdatedAt: now,
        existingUser: user.username,
        incomingUser: user.username,
      }
    );
    const boardActivity = [];
    const board = {
      id: boardId,
      title: normalizeTitle(body.title),
      page,
      ownerId: user.id,
      ownerName: user.username,
      createdAt: now,
      updatedAt: now,
      lastEditedBy: {
        userId: user.id,
        username: user.username,
        at: now,
      },
      members: [
        {
          userId: user.id,
          username: user.username,
          role: ROLE_OWNER,
          addedAt: now,
        },
      ],
      data: normalizedData,
      activity: boardActivity,
    };
    appendBoardActivity(board, user, "board", "a cree le board");

    await saveBoard(store, board);
    return jsonResponse(200, {
      ok: true,
      board: {
        ...boardSummary(board, ROLE_OWNER),
        members: board.members,
        data: board.data,
        activity: normalizeBoardActivity(board),
      },
      presence: [],
      boardId,
    });
  }

  if (action === "get_board") {
    const boardId = String(body.boardId || "");
    const board = await loadBoard(store, boardId);
    if (!board) return errorResponse(404, "Tableau introuvable.");

    const role = getRoleForUser(board, user.id);
    if (!role) return errorResponse(403, "Acces refuse.");
    const presence = await listBoardPresence(store, boardId);
    const memberIds = new Set([
      String(board.ownerId || ""),
      ...(Array.isArray(board.members) ? board.members.map((member) => String(member.userId || "")) : []),
    ].filter(Boolean));
    const onlineUsers = await listOnlineUsers(store, memberIds);

    return jsonResponse(200, {
      ok: true,
      role,
      board: {
        ...boardSummary(board, role),
        members: Array.isArray(board.members) ? board.members : [],
        data: normalizeBoardPayload(board.data, {
          fallbackUpdatedAt: board.updatedAt || "",
          fallbackUser: board.lastEditedBy?.username || board.ownerName || "",
        }),
        activity: normalizeBoardActivity(board),
      },
      presence,
      onlineUsers,
    });
  }

  if (action === "watch_board") {
    const boardId = String(body.boardId || "");
    const board = await loadBoard(store, boardId);
    if (!board) return errorResponse(404, "Tableau introuvable.");

    const role = getRoleForUser(board, user.id);
    if (!role) return errorResponse(403, "Acces refuse.");
    const initialPresence = await listBoardPresence(store, boardId);

    const sinceUpdatedAt = String(body.sinceUpdatedAt || "").trim();
    const currentUpdatedAt = String(board.updatedAt || "");
    if (!sinceUpdatedAt || currentUpdatedAt !== sinceUpdatedAt) {
      return jsonResponse(200, {
        ok: true,
        changed: true,
        boardId,
        updatedAt: currentUpdatedAt,
        role,
        lastEditedBy: board.lastEditedBy || null,
        presence: initialPresence,
      });
    }

    const requestedTimeoutMs = Number(body.timeoutMs);
    const timeoutMs = Number.isFinite(requestedTimeoutMs)
      ? Math.max(1200, Math.min(9000, requestedTimeoutMs))
      : 7000;

    const pollEveryMs = 450;
    const deadline = Date.now() + timeoutMs;
    let latestBoard = board;
    let latestRole = role;

    while (Date.now() < deadline) {
      await sleep(pollEveryMs);
      latestBoard = await loadBoard(store, boardId);

      if (!latestBoard) {
        return jsonResponse(200, {
          ok: true,
          changed: true,
          boardId,
          deleted: true,
          presence: [],
        });
      }

      latestRole = getRoleForUser(latestBoard, user.id);
      if (!latestRole) {
        return jsonResponse(200, {
          ok: true,
          changed: true,
          boardId,
          revoked: true,
          presence: [],
        });
      }

      const latestUpdatedAt = String(latestBoard.updatedAt || "");
      if (latestUpdatedAt !== sinceUpdatedAt) {
        const presence = await listBoardPresence(store, boardId);
        return jsonResponse(200, {
          ok: true,
          changed: true,
          boardId,
          updatedAt: latestUpdatedAt,
          role: latestRole,
          lastEditedBy: latestBoard.lastEditedBy || null,
          presence,
        });
      }
    }

    const presence = await listBoardPresence(store, boardId);
    return jsonResponse(200, {
      ok: true,
      changed: false,
      boardId,
      updatedAt: currentUpdatedAt,
      presence,
    });
  }

  if (action === "touch_presence") {
    const boardId = String(body.boardId || "");
    const board = await loadBoard(store, boardId);
    if (!board) return errorResponse(404, "Tableau introuvable.");

    const role = getRoleForUser(board, user.id);
    if (!role) return errorResponse(403, "Acces refuse.");

    const presence = await touchBoardPresence(store, board, user, role, body);
    return jsonResponse(200, {
      ok: true,
      boardId,
      presence,
    });
  }

  if (action === "clear_presence") {
    const boardId = String(body.boardId || "");
    if (boardId) {
      await clearBoardPresence(store, boardId, user.id);
    }
    return jsonResponse(200, {
      ok: true,
      boardId,
    });
  }

  if (action === "save_board") {
    const boardId = String(body.boardId || "");
    const board = await loadBoard(store, boardId);
    if (!board) return errorResponse(404, "Tableau introuvable.");

    const role = getRoleForUser(board, user.id);
    if (!canEditBoard(role)) return errorResponse(403, "Modification interdite.");

    const data = body.data;
    const page = normalizePage(board.page || body.page || "point");
    if (!validateBoardData(data, page)) {
      return errorResponse(400, "Donnees du tableau invalides.");
    }

    const expectedUpdatedAt = String(body.expectedUpdatedAt || "").trim();
    const hadVersionDrift = Boolean(expectedUpdatedAt && String(board.updatedAt || "") !== expectedUpdatedAt);

    const nextTitle = normalizeTitle(body.title || board.title);
    const mergedData = mergeBoardPayload(board.data, data, {
      existingUpdatedAt: board.updatedAt || "",
      incomingUpdatedAt: expectedUpdatedAt || nowIso(),
      existingUser: board.lastEditedBy?.username || board.ownerName || "",
      incomingUser: user.username,
    });
    const normalizedCurrent = normalizeBoardPayload(board.data, {
      fallbackUpdatedAt: board.updatedAt || "",
      fallbackUser: board.lastEditedBy?.username || board.ownerName || "",
    });
    const sameData = isSameBoardPayload(normalizedCurrent, mergedData);
    const sameTitle = String(nextTitle) === String(board.title || "");
    const presence = await touchBoardPresence(store, board, user, role, body);
    if (sameData && sameTitle) {
      return jsonResponse(200, {
        ok: true,
      board: {
        ...boardSummary(board, role),
        data: normalizedCurrent,
        activity: normalizeBoardActivity(board),
      },
      unchanged: true,
      mergedConflict: hadVersionDrift,
      presence,
    });
    }

    const now = nowIso();
    const deltaSummary = summarizeBoardDelta(normalizedCurrent, mergedData, { mergedConflict: hadVersionDrift });
    board.data = mergedData;
    board.title = nextTitle;
    board.updatedAt = now;
    board.lastEditedBy = {
      userId: user.id,
      username: user.username,
      at: now,
    };
    appendBoardActivity(board, user, "save", `a modifie le board (${deltaSummary})`);

    await saveBoard(store, board);
    return jsonResponse(200, {
      ok: true,
      board: {
        ...boardSummary(board, role),
        data: board.data,
        activity: normalizeBoardActivity(board),
      },
      mergedConflict: hadVersionDrift,
      presence,
    });
  }

  if (action === "rename_board") {
    const boardId = String(body.boardId || "");
    const board = await loadBoard(store, boardId);
    if (!board) return errorResponse(404, "Tableau introuvable.");

    const role = getRoleForUser(board, user.id);
    if (role !== ROLE_OWNER) return errorResponse(403, "Seul le lead peut renommer.");

    const nextTitle = normalizeTitle(body.title || board.title);
    if (String(nextTitle) === String(board.title || "")) {
      return jsonResponse(200, {
        ok: true,
        board: boardSummary(board, role),
        unchanged: true,
      });
    }

    const now = nowIso();
    board.title = nextTitle;
    board.updatedAt = now;
    board.lastEditedBy = {
      userId: user.id,
      username: user.username,
      at: now,
    };
    appendBoardActivity(board, user, "rename", `a renomme le board en "${nextTitle}"`);

    await saveBoard(store, board);
    return jsonResponse(200, {
      ok: true,
      board: {
        ...boardSummary(board, role),
        activity: normalizeBoardActivity(board),
      },
    });
  }

  if (action === "delete_board") {
    const boardId = String(body.boardId || "");
    const board = await loadBoard(store, boardId);
    if (!board) return errorResponse(404, "Tableau introuvable.");

    const role = getRoleForUser(board, user.id);
    if (role !== ROLE_OWNER) return errorResponse(403, "Seul le lead peut supprimer.");

    await store.delete(boardKey(boardId));
    return jsonResponse(200, { ok: true, deleted: true, boardId });
  }

  if (action === "share_board") {
    const boardId = String(body.boardId || "");
    const board = await loadBoard(store, boardId);
    if (!board) return errorResponse(404, "Tableau introuvable.");

    const role = getRoleForUser(board, user.id);
    if (role !== ROLE_OWNER) return errorResponse(403, "Seul le lead peut partager.");

    const usernameCheck = normalizeUsername(body.username);
    if (!usernameCheck.ok) return errorResponse(400, "Nom utilisateur invalide.");

    const targetUser = await getUserByUsername(store, usernameCheck.username);
    if (!targetUser) return errorResponse(404, "Utilisateur introuvable.");

    const memberRole = sanitizeRole(body.role, ROLE_EDITOR);
    const now = nowIso();
    board.members = withMember(board, {
      userId: targetUser.id,
      username: targetUser.username,
      role: targetUser.id === board.ownerId ? ROLE_OWNER : memberRole,
      addedAt: now,
    });
    board.updatedAt = now;
    board.lastEditedBy = {
      userId: user.id,
      username: user.username,
      at: now,
    };
    appendBoardActivity(board, user, "member", `a ajoute ${targetUser.username} (${targetUser.id === board.ownerId ? ROLE_OWNER : memberRole})`);

    await saveBoard(store, board);
    return jsonResponse(200, {
      ok: true,
      members: board.members,
    });
  }

  if (action === "remove_member") {
    const boardId = String(body.boardId || "");
    const targetUserId = String(body.userId || "");
    const board = await loadBoard(store, boardId);
    if (!board) return errorResponse(404, "Tableau introuvable.");

    const role = getRoleForUser(board, user.id);
    if (role !== ROLE_OWNER) return errorResponse(403, "Seul le lead peut retirer.");
    if (!targetUserId) return errorResponse(400, "Utilisateur cible manquant.");
    if (targetUserId === String(board.ownerId)) return errorResponse(400, "Impossible de retirer le lead.");

    const removedMember = (Array.isArray(board.members) ? board.members : []).find((member) => String(member.userId) === targetUserId);
    board.members = withoutMember(board, targetUserId);
    const now = nowIso();
    board.updatedAt = now;
    board.lastEditedBy = {
      userId: user.id,
      username: user.username,
      at: now,
    };
    appendBoardActivity(board, user, "member", `a retire ${removedMember?.username || "un membre"}`);
    await saveBoard(store, board);

    return jsonResponse(200, { ok: true, members: board.members });
  }

  if (action === "transfer_board") {
    const boardId = String(body.boardId || "");
    const targetUserId = String(body.userId || "");
    const board = await loadBoard(store, boardId);
    if (!board) return errorResponse(404, "Tableau introuvable.");

    const role = getRoleForUser(board, user.id);
    if (role !== ROLE_OWNER) return errorResponse(403, "Seul le lead peut transferer.");
    if (!targetUserId) return errorResponse(400, "Utilisateur cible manquant.");
    if (targetUserId === String(board.ownerId)) return errorResponse(400, "Cet utilisateur est deja lead.");

    const targetUser = await getUserById(store, targetUserId);
    if (!targetUser) return errorResponse(404, "Utilisateur cible introuvable.");

    const now = nowIso();
    board.members = withMember(board, {
      userId: board.ownerId,
      username: board.ownerName,
      role: ROLE_EDITOR,
      addedAt: now,
    });
    board.members = withMember(board, {
      userId: targetUser.id,
      username: targetUser.username,
      role: ROLE_OWNER,
      addedAt: now,
    });

    board.ownerId = targetUser.id;
    board.ownerName = targetUser.username;
    board.updatedAt = now;
    board.lastEditedBy = {
      userId: user.id,
      username: user.username,
      at: now,
    };
    appendBoardActivity(board, user, "member", `a donne le lead a ${targetUser.username}`);

    await saveBoard(store, board);
    return jsonResponse(200, {
      ok: true,
      board: {
        ...boardSummary(board, getRoleForUser(board, user.id)),
        activity: normalizeBoardActivity(board),
      },
      members: board.members,
    });
  }

  if (action === "leave_board") {
    const boardId = String(body.boardId || "");
    const board = await loadBoard(store, boardId);
    if (!board) return errorResponse(404, "Tableau introuvable.");
    const role = getRoleForUser(board, user.id);
    if (!role) return errorResponse(403, "Acces refuse.");
    if (role === ROLE_OWNER) {
      return errorResponse(400, "Le lead doit transferer avant de quitter.");
    }
    board.members = withoutMember(board, user.id);
    const now = nowIso();
    board.updatedAt = now;
    board.lastEditedBy = {
      userId: user.id,
      username: user.username,
      at: now,
    };
    appendBoardActivity(board, user, "member", "a quitte le board");
    await saveBoard(store, board);
    return jsonResponse(200, { ok: true });
  }

  return errorResponse(400, "Action inconnue.");
};
