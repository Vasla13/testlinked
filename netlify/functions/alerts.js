const { getStore, connectLambda } = require("@netlify/blobs");
const crypto = require("crypto");
const {
  resolveAuth,
  listKeysByPrefix,
  getStoreClient,
  normalizeUsername,
} = require("../lib/collab");

const STORE_NAME = "bni-linked-alerts";
const CURRENT_KEY = "alerts/current";
const API_KEY = process.env.BNI_LINKED_KEY;
const REQUIRE_AUTH = process.env.BNI_LINKED_REQUIRE_AUTH !== "0";
const STAFF_ACCESS_CODE = "staff";

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key, x-staff-code, x-collab-token",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
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

function hasStaffCode(event, body = null) {
  const headerCode = String(getHeader(event, "x-staff-code") || "").trim();
  const bodyCode = String(body?.accessCode || "").trim();
  return headerCode === STAFF_ACCESS_CODE || bodyCode === STAFF_ACCESS_CODE;
}

function authError() {
  if (REQUIRE_AUTH && !API_KEY) {
    return jsonResponse(503, { ok: false, error: "API key is not configured on server" });
  }
  return jsonResponse(401, { ok: false, error: "Unauthorized" });
}

function clampNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (Number.isFinite(min) && num < min) return min;
  if (Number.isFinite(max) && num > max) return max;
  return num;
}

function normalizeZonePoints(rawPoints) {
  if (!Array.isArray(rawPoints)) return [];
  return rawPoints
    .map((point) => {
      if (!point || typeof point !== "object") return null;
      const x = clampNumber(point.x, NaN, -1000, 1000);
      const y = clampNumber(point.y, NaN, -1000, 1000);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        x: Number(x.toFixed(4)),
        y: Number(y.toFixed(4)),
      };
    })
    .filter(Boolean);
}

function normalizeAllowedUsers(rawUsers) {
  if (!Array.isArray(rawUsers)) return [];
  const seen = new Set();
  const clean = [];
  rawUsers.forEach((value) => {
    const normalized = normalizeUsername(value);
    if (!normalized.ok) return;
    const username = normalized.username;
    if (seen.has(username)) return;
    seen.add(username);
    clean.push(username);
  });
  return clean;
}

function normalizeAlert(raw, previous = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  const title = String(source.title || "").trim();
  const description = String(source.description || "").trim();
  const gpsX = clampNumber(source.gpsX, NaN);
  const gpsY = clampNumber(source.gpsY, NaN);
  const xPercent = clampNumber(source.xPercent, NaN, -1000, 1000);
  const yPercent = clampNumber(source.yPercent, NaN, -1000, 1000);
  const radius = clampNumber(source.radius, previous?.radius || 2.5, 0.4, 18);
  const zonePoints = normalizeZonePoints(source.zonePoints);
  const shapeType = source.shapeType === "zone" && zonePoints.length >= 3 ? "zone" : "circle";
  const visibilityMode = source.visibilityMode === "whitelist" ? "whitelist" : "all";
  const allowedUsers = normalizeAllowedUsers(source.allowedUsers);

  if (!title) throw new Error("Titre requis.");
  if (!description) throw new Error("Description requise.");
  if (!Number.isFinite(gpsX) || !Number.isFinite(gpsY)) {
    throw new Error("Coordonnees GPS invalides.");
  }
  if (!Number.isFinite(xPercent) || !Number.isFinite(yPercent)) {
    throw new Error("Position carte invalide.");
  }

  const now = new Date().toISOString();
  return {
    id: String(previous?.id || source.id || `alert_${crypto.randomUUID()}`),
    title,
    description,
    gpsX,
    gpsY,
    xPercent,
    yPercent,
    radius,
    shapeType,
    zonePoints: shapeType === "zone" ? zonePoints : [],
    visibilityMode,
    allowedUsers: visibilityMode === "whitelist" ? allowedUsers : [],
    active: source.active !== false,
    createdAt: String(previous?.createdAt || now),
    updatedAt: now,
  };
}

async function getCurrentAlert(store) {
  const value = await store.get(CURRENT_KEY, { type: "json" }).catch(() => null);
  if (!value || typeof value !== "object") return null;
  return value;
}

function isViewerAllowed(alert, viewer) {
  if (!alert || typeof alert !== "object" || !alert.active) return false;
  if (String(alert.visibilityMode || "all") !== "whitelist") return true;
  const normalized = normalizeUsername(viewer?.username || "");
  if (!normalized.ok) return false;
  const allow = new Set(normalizeAllowedUsers(alert.allowedUsers));
  return allow.has(normalized.username);
}

function toPublicAlert(alert, viewer = null) {
  if (!alert || typeof alert !== "object") return null;
  if (!isViewerAllowed(alert, viewer)) return null;
  return {
    id: String(alert.id || ""),
    title: String(alert.title || ""),
    description: String(alert.description || ""),
    gpsX: Number(alert.gpsX),
    gpsY: Number(alert.gpsY),
    xPercent: Number(alert.xPercent),
    yPercent: Number(alert.yPercent),
    radius: Number(alert.radius || 2.5),
    shapeType: String(alert.shapeType || "circle"),
    zonePoints: Array.isArray(alert.zonePoints) ? alert.zonePoints : [],
    visibilityMode: String(alert.visibilityMode || "all"),
    active: true,
    createdAt: String(alert.createdAt || ""),
    updatedAt: String(alert.updatedAt || ""),
  };
}

async function resolveViewer(event) {
  const auth = await resolveAuth(event).catch(() => null);
  if (!auth || !auth.ok || !auth.user) return null;
  return auth.user;
}

async function listKnownUsers(query = "") {
  const prefix = "users/by-name/";
  const store = getStoreClient();
  const keys = await listKeysByPrefix(store, prefix, 400).catch(() => []);
  const lowered = String(query || "").trim().toLowerCase();
  return keys
    .map((key) => String(key || "").slice(prefix.length))
    .filter(Boolean)
    .filter((username) => !lowered || username.includes(lowered))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 40);
}

exports.handler = async (event) => {
  connectLambda(event);

  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(204, { ok: true });
  }

  const store = getStore(STORE_NAME);

  if (event.httpMethod === "GET") {
    const id = String(event.queryStringParameters?.id || "").trim();
    const current = await getCurrentAlert(store);
    const viewer = await resolveViewer(event);
    const publicAlert = toPublicAlert(current, viewer);

    if (id) {
      if (!publicAlert || String(publicAlert.id) !== id) {
        return jsonResponse(200, { ok: true, alert: null });
      }
      return jsonResponse(200, { ok: true, alert: publicAlert });
    }

    return jsonResponse(200, { ok: true, alert: publicAlert });
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

  if (!(isAuthorized(event) || hasStaffCode(event, body))) {
    return authError();
  }

  const action = String(body.action || "").toLowerCase();

  if (action === "get-admin") {
    const current = await getCurrentAlert(store);
    return jsonResponse(200, { ok: true, alert: current });
  }

  if (action === "list_users") {
    const query = String(body.query || "").trim().toLowerCase();
    const users = await listKnownUsers(query);
    return jsonResponse(200, { ok: true, users });
  }

  if (action === "delete") {
    await store.delete(CURRENT_KEY).catch(() => null);
    return jsonResponse(200, { ok: true, alert: null });
  }

  if (action === "upsert") {
    try {
      const previous = await getCurrentAlert(store);
      const nextAlert = normalizeAlert(body.alert, previous);
      await store.setJSON(CURRENT_KEY, nextAlert);
      return jsonResponse(200, { ok: true, alert: nextAlert });
    } catch (error) {
      return jsonResponse(400, { ok: false, error: error.message || "Invalid alert" });
    }
  }

  return jsonResponse(400, { ok: false, error: "Invalid action" });
};
