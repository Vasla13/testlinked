const {
  connectLambda,
  jsonResponse,
  preflightResponse,
  errorResponse,
  readBody,
  normalizeUsername,
  hashPassword,
  safeUser,
  nowIso,
  newId,
  getStoreClient,
  getUserByUsername,
  createSession,
  deleteSession,
  resolveAuth,
  userKey,
  usernameKey,
  listKeysByPrefix,
  getUserBoardIndex,
} = require("../lib/collab");

exports.handler = async (event) => {
  connectLambda(event);

  if (event.httpMethod === "OPTIONS") {
    return preflightResponse();
  }

  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return errorResponse(405, "Method not allowed");
  }

  const body = event.httpMethod === "POST"
    ? readBody(event)
    : {
        action: event.queryStringParameters?.action || "",
        username: event.queryStringParameters?.username || "",
        password: event.queryStringParameters?.password || "",
        token: event.queryStringParameters?.token || "",
      };

  if (event.httpMethod === "POST" && !body) {
    return errorResponse(400, "JSON invalide.");
  }

  const action = String(body.action || "").toLowerCase();
  const store = getStoreClient();

  if (action === "register") {
    if (event.httpMethod !== "POST") {
      return errorResponse(400, "register doit etre en POST.");
    }
    const usernameCheck = normalizeUsername(body.username);
    if (!usernameCheck.ok) {
      return errorResponse(400, usernameCheck.reason);
    }

    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    if (!firstName) {
      return errorResponse(400, "Le prénom est obligatoire pour créer un compte.");
    }
    if (!lastName) {
      return errorResponse(400, "Le nom est obligatoire pour créer un compte.");
    }

    const username = usernameCheck.username;
    const password = String(body.password || "");
    if (password.length < 3) {
      return errorResponse(400, "Mot de passe trop court (min 3).");
    }

    const existing = await getUserByUsername(store, username);
    if (existing) {
      return errorResponse(409, "Ce nom utilisateur existe deja.");
    }

    const user = {
      id: newId("usr"),
      username,
      firstName,
      lastName,
      associatedPoints: [],
      passwordHash: hashPassword(password),
      createdAt: nowIso(),
    };

    await store.setJSON(userKey(user.id), user);
    await store.setJSON(usernameKey(username), { userId: user.id, username });

    const session = await createSession(store, user);
    return jsonResponse(200, {
      ok: true,
      token: session.token,
      user: safeUser(user),
    });
  }

  if (action === "login") {
    if (event.httpMethod !== "POST") {
      return errorResponse(400, "login doit etre en POST.");
    }
    const usernameCheck = normalizeUsername(body.username);
    if (!usernameCheck.ok) {
      return errorResponse(400, "Nom utilisateur invalide.");
    }

    const username = usernameCheck.username;
    const password = String(body.password || "");
    const user = await getUserByUsername(store, username);
    if (!user) {
      return errorResponse(401, "Identifiants invalides.");
    }

    if (user.passwordHash !== hashPassword(password)) {
      return errorResponse(401, "Identifiants invalides.");
    }

    const session = await createSession(store, user);
    return jsonResponse(200, {
      ok: true,
      token: session.token,
      user: safeUser(user),
    });
  }

  if (action === "me") {
    const auth = await resolveAuth(event, body);
    if (!auth.ok) {
      return errorResponse(auth.statusCode || 401, auth.error || "Session invalide.");
    }

    return jsonResponse(200, {
      ok: true,
      user: safeUser(auth.user),
    });
  }

  if (action === "logout") {
    const auth = await resolveAuth(event, body);
    if (!auth.ok) {
      return errorResponse(auth.statusCode || 401, auth.error || "Session invalide.");
    }

    await deleteSession(auth.store, auth.token);
    return jsonResponse(200, { ok: true });
  }

  if (action === "list_users") {
    const auth = await resolveAuth(event, body);
    if (!auth.ok) {
      return errorResponse(auth.statusCode || 401, auth.error || "Session requise.");
    }

    const allKeys = await listKeysByPrefix(store, "users/", 1000);
    const userKeys = allKeys.filter(
      (k) => !k.startsWith("users/by-name/") && !k.includes("/boards")
    );

    const rawUsers = await Promise.all(
      userKeys.map((k) => store.get(k, { type: "json" }).catch(() => null))
    );

    const users = [];
    for (const u of rawUsers) {
      if (u && u.id && u.username) {
        const boardIndex = await getUserBoardIndex(store, u.id).catch(() => ({ boardIds: [] }));
        users.push({
          ...safeUser(u),
          boardIds: boardIndex.boardIds || [],
        });
      }
    }

    users.sort((a, b) => String(a.username).localeCompare(String(b.username)));

    return jsonResponse(200, {
      ok: true,
      users,
    });
  }

  if (action === "admin_update_user") {
    const auth = await resolveAuth(event, body);
    if (!auth.ok) {
      return errorResponse(auth.statusCode || 401, auth.error || "Session requise.");
    }

    const targetUserId = String(body.userId || "").trim();
    if (!targetUserId) {
      return errorResponse(400, "ID utilisateur manquant.");
    }

    const targetUser = await store.get(userKey(targetUserId), { type: "json" });
    if (!targetUser) {
      return errorResponse(404, "Utilisateur introuvable.");
    }

    if (body.firstName !== undefined) {
      targetUser.firstName = String(body.firstName || "").trim();
    }
    if (body.lastName !== undefined) {
      targetUser.lastName = String(body.lastName || "").trim();
    }
    if (body.username !== undefined) {
      const usernameCheck = normalizeUsername(body.username);
      if (!usernameCheck.ok) {
        return errorResponse(400, usernameCheck.reason || "Nom d'utilisateur invalide.");
      }
      const newUsername = usernameCheck.username;
      if (newUsername !== targetUser.username) {
        const existing = await store.get(usernameKey(newUsername), { type: "json" }).catch(() => null);
        if (existing && String(existing.userId) !== String(targetUser.id)) {
          return errorResponse(409, "Ce nom d'utilisateur est déjà utilisé.");
        }
        await store.delete(usernameKey(targetUser.username)).catch(() => {});
        targetUser.username = newUsername;
        await store.setJSON(usernameKey(newUsername), { userId: targetUser.id, username: newUsername });
      }
    }
    if (body.password && String(body.password).length >= 3) {
      targetUser.passwordHash = hashPassword(body.password);
    }
    if (Array.isArray(body.associatedPoints)) {
      const dedup = Array.from(
        new Set(body.associatedPoints.map((s) => String(s || "").trim()).filter(Boolean))
      );
      targetUser.associatedPoints = dedup;
    }

    await store.setJSON(userKey(targetUser.id), targetUser);
    return jsonResponse(200, {
      ok: true,
      user: safeUser(targetUser),
    });
  }

  if (action === "admin_delete_user") {
    const auth = await resolveAuth(event, body);
    if (!auth.ok) {
      return errorResponse(auth.statusCode || 401, auth.error || "Session requise.");
    }

    const targetUserId = String(body.userId || "").trim();
    if (!targetUserId) {
      return errorResponse(400, "ID utilisateur manquant.");
    }

    const targetUser = await store.get(userKey(targetUserId), { type: "json" });
    if (!targetUser) {
      return errorResponse(404, "Utilisateur introuvable.");
    }

    await store.delete(userKey(targetUserId)).catch(() => {});
    if (targetUser.username) {
      await store.delete(usernameKey(targetUser.username)).catch(() => {});
    }

    return jsonResponse(200, {
      ok: true,
      message: "Utilisateur supprimé avec succès.",
      deletedUserId: targetUserId,
    });
  }

  if (action === "associate_user_point") {
    const auth = await resolveAuth(event, body);
    if (!auth.ok) {
      return errorResponse(auth.statusCode || 401, auth.error || "Session requise.");
    }

    const targetUserId = String(body.userId || "").trim();
    const pointName = String(body.pointName || "").trim();
    const mode = String(body.mode || "toggle"); // "add" | "remove" | "toggle"

    if (!targetUserId || !pointName) {
      return errorResponse(400, "Données incomplètes (userId et pointName requis).");
    }

    const targetUser = await store.get(userKey(targetUserId), { type: "json" });
    if (!targetUser) {
      return errorResponse(404, "Utilisateur introuvable.");
    }

    const currentPoints = Array.isArray(targetUser.associatedPoints) ? [...targetUser.associatedPoints] : [];
    const normalizedTarget = pointName.toLowerCase();
    const exists = currentPoints.some((p) => String(p).toLowerCase() === normalizedTarget);

    if (mode === "remove" || (mode === "toggle" && exists)) {
      targetUser.associatedPoints = currentPoints.filter(
        (p) => String(p).toLowerCase() !== normalizedTarget
      );
    } else {
      if (!exists) {
        currentPoints.push(pointName);
      }
      targetUser.associatedPoints = currentPoints;
    }

    await store.setJSON(userKey(targetUser.id), targetUser);
    return jsonResponse(200, {
      ok: true,
      user: safeUser(targetUser),
    });
  }

  return errorResponse(400, "Action inconnue.");
};
