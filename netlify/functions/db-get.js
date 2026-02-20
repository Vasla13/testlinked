const { getStore, connectLambda } = require("@netlify/blobs");

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

  const key = String(event.queryStringParameters?.key || "");
  if (!key) {
    return jsonResponse(400, { ok: false, error: "Missing key" });
  }

  try {
    const store = getStore(STORE_NAME);
    const data = await store.get(key, { type: "json" });

    if (data === null) {
      return jsonResponse(404, { ok: false, error: "Not found" });
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(data),
    };
  } catch (e) {
    console.error("db-get error:", e);
    return jsonResponse(500, { ok: false, error: "Failed to get entry" });
  }
};
