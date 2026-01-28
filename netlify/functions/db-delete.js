const { getStore, connectLambda } = require("@netlify/blobs");

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

  const key = String(body.key || "");
  if (!key) {
    return jsonResponse(400, { ok: false, error: "Missing key" });
  }

  try {
    const store = getStore(STORE_NAME);
    await store.delete(key);
    return jsonResponse(200, { ok: true });
  } catch (e) {
    console.error("db-delete error:", e);
    return jsonResponse(500, { ok: false, error: "Failed to delete entry" });
  }
};
