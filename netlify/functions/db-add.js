const { getStore, connectLambda } = require("@netlify/blobs");
const crypto = require("crypto");

const STORE_NAME = "bni-linked-db";
const API_KEY = process.env.BNI_LINKED_KEY;

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

function isAuthorized(event) {
  if (!API_KEY) return true;
  const key = event.headers?.["x-api-key"] || event.headers?.["X-API-Key"];
  return key === API_KEY;
}

exports.handler = async (event) => {
  connectLambda(event);

  if (!isAuthorized(event)) {
    return jsonResponse(401, { ok: false, error: "Unauthorized" });
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
