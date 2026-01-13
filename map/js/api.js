import { customAlert } from './ui.js';

const API_BASE = '/.netlify/functions';

export const api = {
    // Sauvegarder l'état actuel (JSON) dans le cloud
    async saveMap(data) {
        try {
            const response = await fetch(`${API_BASE}/db-add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page: 'map',
                    action: 'export',
                    data: data
                })
            });
            const res = await response.json();
            return res.ok;
        } catch (e) {
            console.error("Erreur Save Cloud:", e);
            return false;
        }
    },

    // Récupérer la liste des sauvegardes et charger la plus récente
    async loadLatestMap() {
        try {
            // 1. Lister les entrées pour la page "map"
            // Note: On suppose que db-list accepte un paramètre prefix ou renvoie tout
            const listResponse = await fetch(`${API_BASE}/db-list?prefix=map/`);
            if (!listResponse.ok) return null;
            
            const entries = await listResponse.json();
            if (!entries || entries.length === 0) return null;

            // 2. Trier par date (le plus récent en premier)
            // Les clés sont formatées: map/{ts}_export_{uuid} ou on utilise metadata.ts
            entries.sort((a, b) => (b.metadata?.ts || 0) - (a.metadata?.ts || 0));
            const latestKey = entries[0].key;

            // 3. Récupérer le contenu de la plus récente
            const getResponse = await fetch(`${API_BASE}/db-get?key=${encodeURIComponent(latestKey)}`);
            if (!getResponse.ok) return null;

            return await getResponse.json();
        } catch (e) {
            console.error("Erreur Load Cloud:", e);
            return null;
        }
    }
};