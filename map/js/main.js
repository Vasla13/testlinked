import { state, setGroups, exportToJSON } from './state.js';
// CORRECTION : On ne demande plus renderMarkers à engine.js
import { initEngine, centerMap } from './engine.js'; 
import { renderGroupsList, initUI } from './ui.js';
// CORRECTION : On importe renderAll depuis render.js
import { renderAll } from './render.js';

const DEFAULT_DATA = [
    { name: "Alliés", color: "#73fbf7", visible: true, points: [], zones: [] },
    { name: "Hostiles", color: "#ff6b81", visible: true, points: [], zones: [] },
    { name: "Neutres", color: "#ffd400", visible: true, points: [], zones: [] }
];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialisation UI (Listeners boutons, HUD...)
    initUI();

    // 2. Initialisation Data
    setGroups(DEFAULT_DATA);
    
    // 3. Engine (Physique, Zoom, Events souris)
    initEngine();
    
    // 4. Premier Rendu
    renderGroupsList();
    renderAll(); // On dessine tout (zones, points, liens...)

    // 5. Listeners Import/Export
    const fileInput = document.getElementById('fileImport');
    if (fileInput) {
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const json = JSON.parse(evt.target.result);
                    if(json.groups) {
                        setGroups(json.groups);
                        // Restauration des liens si présents
                        if(json.tacticalLinks) state.tacticalLinks = json.tacticalLinks;
                        
                        renderGroupsList();
                        renderAll();
                    } else { alert("Format JSON invalide."); }
                } catch(err) { console.error(err); alert("Erreur fichier."); }
            };
            reader.readAsText(file);
        };
    }

    const btnSave = document.getElementById('btnSave');
    if (btnSave) btnSave.onclick = exportToJSON;

    const btnReset = document.getElementById('btnResetView');
    if (btnReset) btnReset.onclick = centerMap;

    const btnAddGroup = document.getElementById('btnAddGroup');
    if (btnAddGroup) {
        btnAddGroup.onclick = () => {
            const name = prompt("Nom du groupe ?");
            if(name) {
                state.groups.push({ name, color: '#ffffff', visible: true, points: [], zones: [] });
                renderGroupsList();
            }
        };
    }
});