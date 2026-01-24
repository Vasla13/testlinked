export const api = {
    // Envoi silencieux vers la base de données (Netlify Functions)
    async saveToDatabase(data, filename) {
        const endpoint = '/.netlify/functions/db-add';

        // Nettoyage du nom pour l'action (lettres, chiffres, tirets uniquement)
        const safeName = (filename || 'autosave').replace(/[^a-zA-Z0-9-_]/g, '');

        try {
            // FORMAT STRICTEMENT ADAPTÉ À VOTRE DB-ADD.JS
            const payload = {
                page: "map",                 // Obligatoire : "map" ou "point"
                action: `export-${safeName}`, // Obligatoire : doit commencer par "export" ou "import"
                data: data                   // Le contenu JSON
            };

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                console.log("[DB] Sauvegarde silencieuse réussie. Clé :", result.key);
                return true;
            } else {
                console.error("[DB] Échec sauvegarde :", response.status);
                return false;
            }
        } catch (e) {
            console.error("[DB] Erreur réseau :", e);
            return false;
        }
    }
};