const { getStore, connectLambda } = require("@netlify/blobs");

const STORE_NAME = "bni-linked-db";
const API_KEY = process.env.BNI_LINKED_KEY;

// Réponse JSON standardisée
function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: { 
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*" // Utile si accès hors domaine
    },
    body: JSON.stringify(obj),
  };
}

function isAuthorized(event) {
  if (!API_KEY) return true;
  const key = event.headers?.["x-api-key"] || event.headers?.["X-API-Key"];
  return key === API_KEY;
}

// Analyse sécurisée de la clé
function parseKey(key) {
  try {
    // Format attendu : "page/timestamp_action_uuid"
    const [page, rest] = key.split("/", 2);
    if (!rest) return null; // Clé invalide

    const parts = rest.split("_");
    const ts = Number(parts[0]);
    
    // Si le timestamp n'est pas valide, on ignore ce fichier
    if (!Number.isFinite(ts) || ts <= 0) return null;

    // Reconstitution de l'action (tout entre le timestamp et le dernier segment uuid)
    // Ex: 123456_export_mission_alpha_uuid -> export_mission_alpha
    const actionParts = parts.slice(1, parts.length - 1); 
    const action = actionParts.join("_") || "unknown";
    
    return {
      key,
      page,
      action,
      ts,
      createdAt: new Date(ts).toISOString(),
    };
  } catch (e) {
    return null; // En cas de clé malformée
  }
}

exports.handler = async (event) => {
  // Initialisation du contexte pour Netlify Blobs
  connectLambda(event);

  if (!isAuthorized(event)) {
    return jsonResponse(401, { ok: false, error: "Unauthorized" });
  }

  // 1. Validation des paramètres
  const page = String(event.queryStringParameters?.page || "").toLowerCase();
  const fast = event.queryStringParameters?.fast === "1";
  
  // Gestion de la limite (sécurité)
  let limit = parseInt(event.queryStringParameters?.limit || "50", 10);
  if (limit < 1) limit = 50;
  if (limit > 500) limit = 500; 

  // Validation stricte de la "page" pour éviter de scanner n'importe quoi
  if (!["point", "map"].includes(page)) {
    return jsonResponse(400, { ok: false, error: "Invalid page parameter" });
  }

  try {
    const store = getStore(STORE_NAME);
    
    // 2. Boucle de récupération optimisée
    // On récupère les blobs, on les parse et on filtre immédiatement pour économiser la RAM
    let allEntries = [];
    let cursor = undefined;
    let safetyCounter = 0;
    const MAX_SCAN_FILES = 5000; // Limite dure pour éviter le timeout
    
    do {
        const result = await store.list({ 
            prefix: `${page}/`, 
            cursor: cursor 
        });
        
        // Traitement immédiat du lot reçu
        if (result.blobs && result.blobs.length > 0) {
            const batchProcessed = result.blobs
                .map(b => parseKey(b.key)) // Transformation
                .filter(e => e !== null)   // Retrait des clés invalides
                .filter(e => e.page === page && (e.action.startsWith("import") || e.action.startsWith("export"))); // Filtrage métier

            allEntries = allEntries.concat(batchProcessed);
        }

        cursor = result.cursor;
        safetyCounter += (result.blobs ? result.blobs.length : 0);

        // Si mode rapide et assez d'entrées, on stoppe tôt
        if (fast && allEntries.length >= limit) {
            cursor = null;
            break;
        }

        // Arrêt d'urgence si trop de fichiers
        if (safetyCounter >= MAX_SCAN_FILES) {
            console.warn(`[DB-LIST] Limite de scan atteinte (${MAX_SCAN_FILES} fichiers). Résultat partiel.`);
            break; 
        }
        
    } while (cursor);

    // 3. Tri final : Du plus récent au plus ancien
    allEntries.sort((a, b) => b.ts - a.ts);

    // 4. Découpage (Pagination finale)
    const limitedEntries = allEntries.slice(0, limit);

    return jsonResponse(200, { 
        ok: true, 
        count: limitedEntries.length,
        totalScanned: safetyCounter,
        totalFound: allEntries.length, 
        entries: limitedEntries 
    });

  } catch (e) {
    console.error("db-list error:", e);
    return jsonResponse(500, { ok: false, error: "Failed to list entries" });
  }
};
