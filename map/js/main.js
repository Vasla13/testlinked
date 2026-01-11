import { state, setGroups, exportToJSON } from './state.js';
import { initEngine, renderMarkers, centerMap } from './engine.js';
import { renderGroupsList } from './ui.js';

// Données par défaut si pas de JSON chargé
const DEFAULT_DATA = [
    { name: "Alliés", color: "#73fbf7", visible: true, points: [] },
    { name: "Hostiles", color: "#ff6b81", visible: true, points: [] },
    { name: "Points d'intérêt", color: "#ffd400", visible: true, points: [] }
];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialisation
    setGroups(DEFAULT_DATA);
    initEngine();
    renderGroupsList();

    // 2. Gestion Import
    const fileInput = document.getElementById('fileImport');
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if(!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const json = JSON.parse(evt.target.result);
                
                if(json.groups) {
                    // CORRECTION BUG IMPORT:
                    // On force visible=true au chargement pour que l'utilisateur voit les données
                    // Ou on respecte le JSON, mais on met à jour l'UI.
                    // Ici, je choisis de respecter le JSON mais l'UI montrera la case décochée.
                    setGroups(json.groups);
                    
                    renderGroupsList();
                    renderMarkers();
                    alert("Importation réussie !");
                } else {
                    alert("Format JSON invalide (propriété 'groups' manquante).");
                }
            } catch(err) {
                console.error(err);
                alert("Erreur de lecture du fichier JSON.");
            }
        };
        reader.readAsText(file);
    };

    // 3. Gestion Export
    document.getElementById('btnSave').onclick = exportToJSON;

    // 4. Reset View
    document.getElementById('btnResetView').onclick = centerMap;

    // 5. Ajout Groupe
    document.getElementById('btnAddGroup').onclick = () => {
        const name = prompt("Nom du nouveau groupe ?");
        if(name) {
            state.groups.push({
                name: name,
                color: '#ffffff',
                visible: true,
                points: []
            });
            renderGroupsList();
        }
    };
});