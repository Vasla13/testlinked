import { state, setGroups, exportToJSON } from './state.js';
import { initEngine, centerMap } from './engine.js';
import { renderGroupsList, initUI } from './ui.js';
// Correction import : renderAll vient de render.js
import { renderAll } from './render.js';

const DEFAULT_DATA = [
    { name: "Alliés", color: "#73fbf7", visible: true, points: [], zones: [] },
    { name: "Hostiles", color: "#ff6b81", visible: true, points: [], zones: [] },
    { name: "Neutres", color: "#ffd400", visible: true, points: [], zones: [] }
];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialisation UI
    initUI();

    // 2. Initialisation Data
    setGroups(DEFAULT_DATA);
    
    // 3. Engine
    initEngine();
    renderGroupsList();
    // Premier rendu vide ou par défaut
    renderAll();

    // 4. Listeners Import/Export
    const fileInput = document.getElementById('fileImport');
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const json = JSON.parse(evt.target.result);
                if(json.groups) {
                    setGroups(json.groups);
                    renderGroupsList();
                    renderAll();
                } else { alert("Format JSON invalide."); }
            } catch(err) { console.error(err); alert("Erreur fichier."); }
        };
        reader.readAsText(file);
    };

    document.getElementById('btnSave').onclick = exportToJSON;
    document.getElementById('btnResetView').onclick = centerMap;

    document.getElementById('btnAddGroup').onclick = () => {
        const name = prompt("Nom du groupe ?");
        if(name) {
            state.groups.push({ name, color: '#ffffff', visible: true, points: [], zones: [] });
            renderGroupsList();
        }
    };
});