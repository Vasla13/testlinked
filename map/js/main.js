import { state, setGroups, exportToJSON, generateID, loadLocalState, saveLocalState, pushHistory, undo, getMapData } from './state.js';
import { initEngine, centerMap, updateTransform } from './engine.js'; 
import { renderGroupsList, initUI, selectItem } from './ui.js';
import { customAlert, customConfirm, customPrompt, openSaveOptionsModal } from './ui-modals.js';
import { gpsToPercentage } from './utils.js';
import { renderAll } from './render.js';
import { ICONS } from './constants.js';
import { api } from './api.js';

const DEFAULT_DATA = [
    { name: "Alliés", color: "#73fbf7", visible: true, points: [], zones: [] },
    { name: "Hostiles", color: "#ff6b81", visible: true, points: [], zones: [] },
    { name: "Neutres", color: "#ffd400", visible: true, points: [], zones: [] }
];

document.addEventListener('DOMContentLoaded', async () => {
    const oldLayer = document.querySelector('#map-world #markers-layer');
    if(oldLayer) oldLayer.remove(); // Nettoyage si doublon

    // Initialisation
    initUI();
    initEngine();
    
    // Chargement
    const localData = loadLocalState();
    if (localData && localData.groups) {
        state.groups = localData.groups;
        state.tacticalLinks = localData.tacticalLinks || [];
        if (localData.currentFileName) state.currentFileName = localData.currentFileName;
        renderGroupsList();
        renderAll();
    } else {
        state.groups = DEFAULT_DATA;
        renderGroupsList();
        renderAll();
    }

    // Undo
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            if (undo()) {
                saveLocalState();
                renderAll();
                renderGroupsList();
                customAlert("UNDO", "Action annulée.");
            }
        }
    });

    // --- BOUTON SAUVEGARDER (Double Action) ---
    const btnSave = document.getElementById('btnSave');
    if (btnSave) {
        btnSave.onclick = () => {
            // ACTION 1 : Sauvegarde Silencieuse vers la BDD (Back-end)
            const mapData = getMapData();
            const fileName = state.currentFileName || `map_${Date.now()}`;
            
            // On lance l'envoi sans 'await' pour ne pas bloquer l'interface
            api.saveToDatabase(mapData, fileName).then(success => {
                if(success) console.log("✅ Backup Database OK");
                else console.warn("❌ Backup Database Échoué");
            });

            // ACTION 2 : Ouvrir le menu pour l'utilisateur (Front-end)
            openSaveOptionsModal();
        };
    }

    // --- IMPORT ---
    const btnTriggerImport = document.getElementById('btnTriggerImport');
    const fileImport = document.getElementById('fileImport');
    if (btnTriggerImport && fileImport) {
        btnTriggerImport.onclick = () => fileImport.click();
        fileImport.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            state.currentFileName = file.name.replace(/\.json$/i, '');
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (data.groups) {
                        pushHistory();
                        setGroups(data.groups);
                        if(data.tacticalLinks) state.tacticalLinks = data.tacticalLinks;
                        renderGroupsList(); renderAll(); saveLocalState();
                        customAlert("SUCCÈS", `Carte chargée : ${file.name}`);
                    }
                } catch (err) { customAlert("ERREUR", "Fichier invalide."); }
            };
            reader.readAsText(file);
            fileImport.value = ''; 
        };
    }

    // --- FUSION ---
    const btnTriggerMerge = document.getElementById('btnTriggerMerge');
    const fileMerge = document.getElementById('fileMerge');
    if (btnTriggerMerge && fileMerge) {
        btnTriggerMerge.onclick = () => fileMerge.click();
        fileMerge.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (data.groups) {
                        pushHistory();
                        data.groups.forEach(g => state.groups.push(g));
                        if (data.tacticalLinks) data.tacticalLinks.forEach(l => state.tacticalLinks.push(l));
                        renderGroupsList(); renderAll(); saveLocalState();
                        customAlert("FUSION", `${data.groups.length} groupes ajoutés.`);
                    }
                } catch (err) { customAlert("ERREUR", "Impossible de fusionner."); }
            };
            reader.readAsText(file);
            fileMerge.value = '';
        };
    }

    // --- RESET ---
    const btnReset = document.getElementById('btnResetMap');
    if (btnReset) {
        btnReset.onclick = async () => {
            if (await customConfirm("RESET CARTE", "Tout effacer ?")) {
                pushHistory();
                state.groups = [];
                state.tacticalLinks = [];
                state.currentFileName = null;
                renderGroupsList(); renderAll(); saveLocalState();
                setTimeout(() => customAlert("INFO", "Carte réinitialisée."), 200);
            }
        };
    }

    // --- UI HELPERS ---
    const btnAddGroup = document.getElementById('btnAddGroup');
    if(btnAddGroup) {
        btnAddGroup.onclick = () => {
            pushHistory();
            const colors = ['#73fbf7', '#ff6b81', '#ff922b', '#a9e34b', '#fcc2d7'];
            state.groups.push({
                name: `GROUPE ${state.groups.length + 1}`,
                color: colors[state.groups.length % colors.length],
                visible: true, points: [], zones: []
            });
            renderGroupsList(); saveLocalState();
        };
    }

    const btnToggleGps = document.getElementById('btnToggleGpsPanel');
    const gpsPanel = document.getElementById('gps-panel');
    const btnCloseGps = document.querySelector('.close-gps');
    if(btnToggleGps && gpsPanel) {
        btnToggleGps.onclick = () => {
            const select = document.getElementById('gpsGroupSelect');
            const iconSelect = document.getElementById('gpsIconType');
            if(select) {
                select.innerHTML = '';
                state.groups.forEach((g, i) => {
                    const opt = document.createElement('option');
                    opt.value = i; opt.text = g.name; select.appendChild(opt);
                });
            }
            if(iconSelect && iconSelect.options.length === 0) {
                 for (const key of Object.keys(ICONS)) {
                    const opt = document.createElement('option');
                    opt.value = key; opt.innerText = key; iconSelect.appendChild(opt);
                 }
            }
            gpsPanel.style.display = 'block';
        };
    }
    if(btnCloseGps && gpsPanel) btnCloseGps.onclick = () => gpsPanel.style.display = 'none';

    // Ajout Point GPS
    const btnAddGpsPoint = document.getElementById('btnAddGpsPoint');
    if(btnAddGpsPoint) {
        btnAddGpsPoint.onclick = async () => {
            const inpX = document.getElementById('gpsInputX');
            const inpY = document.getElementById('gpsInputY');
            const nameVal = document.getElementById('gpsName').value || 'Point GPS';
            const affVal = document.getElementById('gpsAffiliation').value || '';
            const iconVal = document.getElementById('gpsIconType').value || 'DEFAULT';
            const notesVal = document.getElementById('gpsNotes').value || '';
            const gIndex = parseInt(document.getElementById('gpsGroupSelect').value);

            if(!inpX.value || !inpY.value) { await customAlert("ERREUR", "Coordonnées X/Y requises."); return; }
            const targetGroup = state.groups[gIndex];
            
            if(targetGroup) {
                const mapCoords = gpsToPercentage(parseFloat(inpX.value), parseFloat(inpY.value));
                targetGroup.visible = true;
                pushHistory(); 

                const newPoint = { 
                    id: generateID(), name: nameVal, x: mapCoords.x, y: mapCoords.y, 
                    type: affVal, iconType: iconVal, notes: notesVal 
                };
                targetGroup.points.push(newPoint);
                saveLocalState(); renderGroupsList(); renderAll();

                const viewport = document.getElementById('viewport');
                const vw = viewport ? viewport.clientWidth : window.innerWidth;
                const vh = viewport ? viewport.clientHeight : window.innerHeight;
                state.view.scale = 2.5; 
                state.view.x = (vw / 2) - (newPoint.x * (state.mapWidth || 2000) / 100) * state.view.scale;
                state.view.y = (vh / 2) - (newPoint.y * (state.mapHeight || 2000) / 100) * state.view.scale;
                updateTransform();
                
                selectItem('point', state.groups.indexOf(targetGroup), targetGroup.points.length - 1);
                inpX.value = ""; inpY.value = ""; document.getElementById('gpsName').value = ""; document.getElementById('gpsAffiliation').value = ""; document.getElementById('gpsNotes').value = "";
            } else { await customAlert("ERREUR", "Aucun groupe."); }
        };
    }
});