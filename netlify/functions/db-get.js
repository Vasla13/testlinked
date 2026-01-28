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
