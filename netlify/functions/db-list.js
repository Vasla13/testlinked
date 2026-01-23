const { getStore, connectLambda } = require("@netlify/blobs");

const STORE_NAME = "bni-linked-db";

// Réponse JSON standardisée
function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

// Analyse de la clé pour extraire les métadonnées
// Format attendu : "page/timestamp_action_uuid"
function parseKey(key) {
  const [page, rest] = key.split("/", 2);
  const parts = (rest || "").split("_");
  const ts = Number(parts[0] || 0);
  // Reconstitution de l'action si elle contient des underscores (ex: export_mission_alpha)
  // On prend tout ce qu'il y a entre le timestamp et le dernier segment (uuid)
  const actionParts = parts.slice(1, parts.length - 1); 
  const action = actionParts.join("_") || "unknown";
  
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

  // 1. Récupération et validation des paramètres
  const page = String(event.queryStringParameters?.page || "").toLowerCase();
  
  // Par défaut, on ne renvoie que les 50 derniers fichiers pour éviter de surcharger le client
  let limit = parseInt(event.queryStringParameters?.limit || "50", 10);
  if (limit < 1) limit = 50;
  if (limit > 500) limit = 500; // Sécurité max

  if (!["point", "map"].includes(page)) {
    return jsonResponse(400, { ok: false, error: "Invalid page parameter" });
  }

  try {
    const store = getStore(STORE_NAME);
    
    // 2. Boucle de récupération (Pagination Netlify Blobs)
    // L'API renvoie les données par pages (ex: 1000 par appel).
    // Pour trier correctement par date (le plus récent), on doit tout récupérer.
    let allBlobs = [];
    let cursor = undefined;
    
    do {
        const result = await store.list({ 
            prefix: `${page}/`, 
            cursor: cursor 
        });
        
        if (result.blobs) {
            allBlobs = allBlobs.concat(result.blobs);
        }
        cursor = result.cursor;
        
        // Sécurité anti-timeout : si on a plus de 5000 backups, on arrête pour ne pas crasher la fonction
        if (allBlobs.length > 5000) break; 
        
    } while (cursor);

    // 3. Traitement des données en mémoire
    const entries = allBlobs
      .map((b) => parseKey(b.key))
      // Filtrage : on garde la page demandée et les actions valides (import/export)
      .filter((e) => e.page === page && (e.action.startsWith("import") || e.action.startsWith("export")));

    // 4. Tri par date décroissante (Le plus récent en premier)
    entries.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    // 5. Application de la limite (Slicing)
    // On ne renvoie que les 'limit' premiers éléments après le tri
    const limitedEntries = entries.slice(0, limit);

    return jsonResponse(200, { 
        ok: true, 
        count: limitedEntries.length,
        totalFound: entries.length, // Info utile pour le frontend (ex: "Affichage 50/230")
        entries: limitedEntries 
    });

  } catch (e) {
    console.error("db-list error:", e);
    return jsonResponse(500, { ok: false, error: "Failed to list entries" });
  }
};