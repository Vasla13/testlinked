const { getStore, connectLambda } = require("@netlify/blobs");
const { MAX_SCAN_FILES, normalizePage, parseKey, removeIndexEntry } = require("../lib/db-index");

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

  const key = String(body.key || "");
  if (!key) {
    return jsonResponse(400, { ok: false, error: "Missing key" });
  }

  try {
    const store = getStore(STORE_NAME);
    const parsed = parseKey(key);
    await store.delete(key);
    if (parsed && normalizePage(parsed.page)) {
      await removeIndexEntry(store, parsed.page, key, { maxScanFiles: MAX_SCAN_FILES });
    }
    return jsonResponse(200, { ok: true });
  } catch (e) {
    console.error("db-delete error:", e);
    return jsonResponse(500, { ok: false, error: "Failed to delete entry" });
  }
};
