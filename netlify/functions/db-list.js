const { getStore, connectLambda } = require("@netlify/blobs");

const STORE_NAME = "bni-linked-db";

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

function parseKey(key) {
  // key format: "<page>/<ts>_<action>_<uuid>"
  const [page, rest] = key.split("/", 2);
  const parts = (rest || "").split("_");
  const ts = Number(parts[0] || 0);
  const action = String(parts[1] || "");
  return {
    key,
    page,
    action,
    ts,
    createdAt: Number.isFinite(ts) && ts > 0 ? new Date(ts).toISOString() : null,
  };
}

exports.handler = async (event) => {
  connectLambda(event);

  const page = String(event.queryStringParameters?.page || "").toLowerCase();
  if (!["point", "map"].includes(page)) {
    return jsonResponse(400, { ok: false, error: "Invalid page" });
  }

  try {
    const store = getStore(STORE_NAME);
    const { blobs } = await store.list({ prefix: `${page}/` });

    const entries = (blobs || [])
      .map((b) => parseKey(b.key))
      .filter((e) => e.page === page && (e.action === "import" || e.action === "export"));

    entries.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    return jsonResponse(200, { ok: true, entries });
  } catch (e) {
    console.error("db-list error:", e);
    return jsonResponse(500, { ok: false, error: "Failed to list entries" });
  }
};
