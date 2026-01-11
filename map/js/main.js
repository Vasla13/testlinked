import { state, setGroups, exportToJSON } from './state.js';
import { initEngine, centerMap, getMapInstance, pctToLeaflet, leafletToPct } from './engine.js';
import { renderGroupsList, selectItem } from './ui.js';
import { renderAll } from './render.js';

// Données par défaut (Structure identique à map_data.json)
const DEFAULT_DATA = [
    { name: "Points d'intérêt", color: "#ffd400", visible: true, points: [], zones: [] },
    { name: "Hostiles", color: "#ff6b81", visible: true, points: [], zones: [] },
    { name: "Alliés", color: "#73fbf7", visible: true, points: [], zones: [] }
];

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Initialiser le moteur (Leaflet)
    // On doit faire ça avant de charger les données pour que la map existe
    const map = initEngine();
    
    // 2. Charger les données
    // On utilise DEFAULT_DATA au démarrage
    setGroups(DEFAULT_DATA);
    
    // 3. Initialiser l'UI et le Rendu
    renderGroupsList();
    renderAll();
    
    // Petit délai pour centrer correctement une fois le DOM prêt
    setTimeout(() => {
        centerMap();
    }, 100);

    // --- GESTIONNAIRES D'ÉVÉNEMENTS (BOUTONS) ---

    // Bouton Sauvegarder
    const btnSave = document.getElementById('btnSave');
    if (btnSave) btnSave.onclick = exportToJSON;

    // Bouton Recentrer
    const btnReset = document.getElementById('btnResetView');
    if (btnReset) btnReset.onclick = centerMap;

    // Bouton Ajouter Groupe
    const btnAddGroup = document.getElementById('btnAddGroup');
    if (btnAddGroup) btnAddGroup.onclick = () => {
        const name = prompt("Nom du nouveau groupe (Calque) :");
        if (name) {
            state.groups.push({
                name: name,
                color: '#ffffff', // Blanc par défaut, éditable
                visible: true,
                points: [],
                zones: []
            });
            renderGroupsList();
        }
    };

    // Bouton Radar (Scan)
    const btnRadar = document.getElementById('btnRadar');
    const viewport = document.getElementById('viewport');
    
    // Création dynamique de l'overlay radar s'il n'existe pas dans le HTML
    let radarOverlay = document.getElementById('radar-overlay');
    if (!radarOverlay) {
        radarOverlay = document.createElement('div');
        radarOverlay.className = 'radar-overlay';
        radarOverlay.innerHTML = '<div class="radar-line"></div>';
        viewport.appendChild(radarOverlay);
    }

    if (btnRadar) btnRadar.onclick = () => {
        const isScanning = viewport.classList.toggle('scanning');
        btnRadar.classList.toggle('active', isScanning);
    };

    // --- GESTION DE L'IMPORT JSON ---
    const fileInput = document.getElementById('fileImport');
    if (fileInput) fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const json = JSON.parse(evt.target.result);
                // Support des deux formats : { groups: [...] } ou directement [...]
                const groupsData = json.groups ? json.groups : (Array.isArray(json) ? json : null);
                
                if (groupsData) {
                    setGroups(groupsData);
                    renderGroupsList();
                    renderAll();
                    centerMap();
                    alert("✅ Importation réussie !");
                } else {
                    alert("⚠️ Format JSON invalide. Structure attendue : { groups: [...] }");
                }
            } catch (err) {
                console.error(err);
                alert("❌ Erreur de lecture du fichier JSON.");
            }
        };
        reader.readAsText(file);
    };

    // --- MENU CONTEXTUEL (CLIC DROIT SUR LA MAP) ---
    // Leaflet gère son propre event 'contextmenu', mais on l'écoute sur l'instance map
    // dans engine.js qui met à jour state.lastRightClickPos.
    // Ici, on écoute l'event DOM global sur le conteneur pour intercepter l'action.
    
    const mapContainer = document.getElementById('map-world');
    mapContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault(); // Bloque le menu navigateur par défaut

        // On utilise un petit timeout pour s'assurer que Leaflet a mis à jour la position dans state
        setTimeout(() => {
            if (state.lastRightClickPos && state.groups.length > 0) {
                // On demande le nom du point
                const name = prompt("Nouveau point d'intérêt :", "Position Tactique");
                if (name) {
                    // On ajoute au PREMIER groupe visible (ou le groupe 0 par défaut)
                    const targetGroupIndex = 0; 
                    
                    const newPoint = {
                        name: name,
                        x: state.lastRightClickPos.x,
                        y: state.lastRightClickPos.y,
                        type: 'point'
                    };

                    state.groups[targetGroupIndex].points.push(newPoint);
                    
                    // On sélectionne le nouveau point
                    selectItem('point', targetGroupIndex, state.groups[targetGroupIndex].points.length - 1);
                    
                    renderAll();
                    renderGroupsList();
                }
            } else if (state.groups.length === 0) {
                alert("Veuillez d'abord créer un groupe pour ajouter des points.");
            }
        }, 50);
    });
});