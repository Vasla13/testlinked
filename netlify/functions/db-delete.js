const { getStore, connectLambda } = require("@netlify/blobs");

const STORE_NAME = "bni-linked-db";

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  connectLambda(event);

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
