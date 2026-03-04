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

function isSameBoardPayload(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) {
    return false;
  }
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
      data,
    };

    await saveBoard(store, board);
    return jsonResponse(200, {
      ok: true,
      board: boardSummary(board, ROLE_OWNER),
      boardId,
    });
  }

  if (action === "get_board") {
    const boardId = String(body.boardId || "");
    const board = await loadBoard(store, boardId);
    if (!board) return errorResponse(404, "Tableau introuvable.");

    const role = getRoleForUser(board, user.id);
    if (!role) return errorResponse(403, "Acces refuse.");

    return jsonResponse(200, {
      ok: true,
      role,
      board: {
        ...boardSummary(board, role),
        members: Array.isArray(board.members) ? board.members : [],
        data: board.data,
      },
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
    if (expectedUpdatedAt && String(board.updatedAt || "") !== expectedUpdatedAt) {
      return errorResponse(409, "Conflit de version: le board a ete modifie ailleurs. Recharge puis reapplique tes changements.", {
        currentUpdatedAt: board.updatedAt || "",
        lastEditedBy: board.lastEditedBy || null,
      });
    }

    const nextTitle = normalizeTitle(body.title || board.title);
    const sameData = isSameBoardPayload(board.data, data);
    const sameTitle = String(nextTitle) === String(board.title || "");
    if (sameData && sameTitle) {
      return jsonResponse(200, {
        ok: true,
        board: boardSummary(board, role),
        unchanged: true,
      });
    }

    const now = nowIso();
    board.data = data;
    board.title = nextTitle;
    board.updatedAt = now;
    board.lastEditedBy = {
      userId: user.id,
      username: user.username,
      at: now,
    };

    await saveBoard(store, board);
    return jsonResponse(200, {
      ok: true,
      board: boardSummary(board, role),
    });
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

    board.members = withoutMember(board, targetUserId);
    board.updatedAt = nowIso();
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

    await saveBoard(store, board);
    return jsonResponse(200, {
      ok: true,
      board: boardSummary(board, getRoleForUser(board, user.id)),
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
    board.updatedAt = nowIso();
    await saveBoard(store, board);
    return jsonResponse(200, { ok: true });
  }

  return errorResponse(400, "Action inconnue.");
};
