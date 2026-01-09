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
