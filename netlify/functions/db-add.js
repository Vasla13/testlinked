const { getStore, connectLambda } = require("@netlify/blobs");
const crypto = require("crypto");

const STORE_NAME = "bni-linked-db";
const API_KEY = process.env.BNI_LINKED_KEY;
const REQUIRE_AUTH = process.env.BNI_LINKED_REQUIRE_AUTH !== "0";

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

function getHeader(event, name) {
  const wanted = String(name || "").toLowerCase();
  const headers = event.headers || {};
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === wanted) return value;
  }
  return undefined;
}

function isAuthorized(event) {
  if (!REQUIRE_AUTH) return true;
  if (!API_KEY) return false;
  const key = getHeader(event, "x-api-key");
  return key === API_KEY;
}

function authError() {
  if (REQUIRE_AUTH && !API_KEY) {
    return jsonResponse(503, { ok: false, error: "API key is not configured on server" });
  }
  return jsonResponse(401, { ok: false, error: "Unauthorized" });
}

exports.handler = async (event) => {
  connectLambda(event);

  if (!isAuthorized(event)) {
    return authError();
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return jsonResponse(400, { ok: false, error: "Invalid JSON body" });
  }

  const page = String(body.page || "").toLowerCase();
  // On passe tout en minuscule pour éviter les problèmes de nommage de fichiers
  const action = String(body.action || "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "");
  const data = body.data;

  if (!["point", "map"].includes(page)) {
    return jsonResponse(400, { ok: false, error: "Invalid page" });
  }

  // MODIFICATION ICI : On autorise les actions composées (ex: export-mission-alpha)
  // Au lieu de vérifier l'égalité stricte, on vérifie si ça COMMENCE par import ou export
  if (!action.startsWith("import") && !action.startsWith("export")) {
    return jsonResponse(400, { ok: false, error: "Invalid action" });
  }

  const ts = Date.now();
  // La clé inclura le nom personnalisé (action)
  const key = `${page}/${ts}_${action}_${crypto.randomUUID()}`;

  try {
    const store = getStore(STORE_NAME);
    await store.setJSON(key, data, {
      metadata: { page, action, ts },
    });

    return jsonResponse(200, { ok: true, key, ts });
  } catch (e) {
    console.error("db-add error:", e);
    return jsonResponse(500, { ok: false, error: "Failed to save entry" });
  }
};
