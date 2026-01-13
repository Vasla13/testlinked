import { customAlert } from './ui.js';

const API_BASE = '/.netlify/functions';
const LOCAL_STORAGE_KEY = 'bni_linked_local_map';

export const api = {
    // Sauvegarder (Cloud OU Local)
    async saveMap(data) {
        // 1. Tentative Cloud
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
            
            // Si le serveur répond (même une erreur 404/405/500), on vérifie si c'est OK
            if (response.ok) {
                const res = await response.json();
                return res.ok;
            } else {
                throw new Error(`Cloud Error: ${response.status}`);
            }
        } catch (e) {
            // 2. Fallback Local (Si erreur Cloud ou Localhost)
            console.warn("⚠️ Mode Cloud indisponible (Localhost ?). Sauvegarde locale utilisée.", e);
            try {
                const saveData = {
                    ts: Date.now(),
                    data: data
                };
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(saveData));
                // On simule un petit délai réseau pour le réalisme
                await new Promise(r => setTimeout(r, 500)); 
                return true;
            } catch (localErr) {
                console.error("Erreur Locale:", localErr);
                return false;
            }
        }
    },

    // Charger (Cloud OU Local)
    async loadLatestMap() {
        // 1. Tentative Cloud
        try {
            const listResponse = await fetch(`${API_BASE}/db-list?prefix=map/`);
            if (listResponse.ok) {
                const entries = await listResponse.json();
                if (entries && entries.length > 0) {
                    // Tri par date
                    entries.sort((a, b) => (b.metadata?.ts || 0) - (a.metadata?.ts || 0));
                    const latestKey = entries[0].key;

                    const getResponse = await fetch(`${API_BASE}/db-get?key=${encodeURIComponent(latestKey)}`);
                    if (getResponse.ok) {
                        return await getResponse.json();
                    }
                }
            } else {
                throw new Error(`Cloud Error: ${listResponse.status}`);
            }
        } catch (e) {
            // 2. Fallback Local
            console.warn("⚠️ Mode Cloud indisponible. Chargement depuis LocalStorage.");
            const local = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (local) {
                try {
                    const parsed = JSON.parse(local);
                    console.log("📂 Données locales chargées (Date:", new Date(parsed.ts).toLocaleString(), ")");
                    return parsed.data;
                } catch (err) {
                    console.error("Données locales corrompues");
                }
            }
        }
        return null;
    }
};