import { state, setGroups, exportToJSON } from './state.js';
import { initEngine, centerMap, updateTransform } from './engine.js'; 
import { renderGroupsList, initUI, selectPoint, customAlert, customConfirm, customPrompt } from './ui.js';
import { gpsToPercentage } from './utils.js';
import { renderAll } from './render.js';
import { ICONS } from './constants.js';
import { api } from './api.js'; // Assurez-vous d'avoir créé api.js

const DEFAULT_DATA = [
    { name: "Alliés", color: "#73fbf7", visible: true, points: [], zones: [] },
    { name: "Hostiles", color: "#ff6b81", visible: true, points: [], zones: [] },
    { name: "Neutres", color: "#ffd400", visible: true, points: [], zones: [] }
];

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Init UI & Engine
    initUI();
    initEngine();
    
    // 2. Gestion Chargement Données (Cloud vs Local vs Default)
    const cloudStatus = document.getElementById('cloud-status');
    if(cloudStatus) cloudStatus.style.display = 'inline-block'; // Afficher 'SYNC' pendant chargement
    
    // Essai chargement Cloud
    console.log("☁️ Chargement Cloud...");
    const cloudData = await api.loadLatestMap();
    
    if (cloudData && cloudData.groups) {
        console.log("✅ Données Cloud reçues");
        setGroups(cloudData.groups);
        if(cloudData.tacticalLinks) state.tacticalLinks = cloudData.tacticalLinks;
    } else {
        console.log("⚠️ Pas de données Cloud ou erreur, utilisation défaut.");
        setGroups(DEFAULT_DATA);
    }
    
    if(cloudStatus) cloudStatus.style.display = 'none';

    // 3. Rendu initial
    renderGroupsList();
    renderAll(); 


    // --- GESTION BOUTONS & EVENTS ---

    // Sauvegarde CLOUD
    const btnCloudSave = document.getElementById('btnCloudSave');
    if(btnCloudSave) {
        btnCloudSave.onclick = async () => {
            const confirmSave = await customConfirm("SAUVEGARDE CLOUD", "Écraser la version en ligne actuelle ?");
            if(confirmSave) {
                if(cloudStatus) cloudStatus.style.display = 'inline-block';
                
                const success = await api.saveMap({
                    groups: state.groups,
                    tacticalLinks: state.tacticalLinks
                });
                
                if(cloudStatus) cloudStatus.style.display = 'none';
                
                if(success) await customAlert("SUCCÈS", "Données synchronisées dans le Cloud.");
                else await customAlert("ERREUR", "Échec de la connexion au serveur.");
            }
        };
    }

    // Sauvegarde JSON Local
    const btnSave = document.getElementById('btnSave');
    if(btnSave) btnSave.onclick = exportToJSON;

    // Reset Vue
    const btnReset = document.getElementById('btnResetView');
    if(btnReset) btnReset.onclick = centerMap;

    // Ajouter Groupe
    const btnAddGroup = document.getElementById('btnAddGroup');
    if(btnAddGroup) btnAddGroup.onclick = async () => {
        const name = await customPrompt("NOUVEAU CALQUE", "Nom du groupe :");
        if(name) {
            state.groups.push({ name, color: '#ffffff', visible: true, points: [], zones: [] });
            renderGroupsList();
        }
    };

    // --- GESTION IMPORT JSON LOCAL ---
    const fileInput = document.getElementById('fileImport');
    const btnTriggerImport = document.getElementById('btnTriggerImport');

    if (btnTriggerImport && fileInput) {
        btnTriggerImport.onclick = () => { fileInput.click(); };

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const json = JSON.parse(evt.target.result);
                    if (json.groups && Array.isArray(json.groups)) {
                        setGroups(json.groups);
                        if (json.tacticalLinks) state.tacticalLinks = json.tacticalLinks;
                        else state.tacticalLinks = [];

                        renderGroupsList();
                        renderAll();
                        await customAlert("IMPORT RÉUSSI", `${json.groups.length} calques chargés.`);
                    } else {
                        await customAlert("ERREUR", "Format JSON invalide.");
                    }
                } catch (err) {
                    await customAlert("ERREUR", "Fichier corrompu.");
                }
                fileInput.value = ''; 
            };
            reader.readAsText(file);
        });
    }

    // --- Remplissage Select Icônes (GPS Panel) ---
    const gpsIconSelect = document.getElementById('gpsIconType');
    if(gpsIconSelect) {
        let opts = '';
        for(const k in ICONS) opts += `<option value="${k}">${k}</option>`;
        gpsIconSelect.innerHTML = opts;
    }

    // --- GESTION PANNEAU GPS & CRÉATION ---
    const gpsPanel = document.getElementById('gps-panel');
    const btnToggleGps = document.getElementById('btnToggleGpsPanel');
    const btnCloseGps = document.querySelector('.close-gps');
    
    if(gpsPanel && btnToggleGps) {
        btnToggleGps.onclick = () => { gpsPanel.style.display = (gpsPanel.style.display === 'none') ? 'block' : 'none'; };
        if(btnCloseGps) btnCloseGps.onclick = () => { gpsPanel.style.display = 'none'; };
    }

    const inpX = document.getElementById('gpsInputX');
    const inpY = document.getElementById('gpsInputY');
    const btnAddGps = document.getElementById('btnAddGpsPoint');

    // Paste automatique intelligent
    if(inpX) {
        inpX.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');
            const matches = text.match(/([-\d.]+)[,\s]+([-\d.]+)/);
            if (matches && matches.length >= 3) { inpX.value = matches[1]; inpY.value = matches[2]; } 
            else { inpX.value = text; }
        });
    }

    if(btnAddGps) {
        btnAddGps.onclick = async () => {
            const xVal = parseFloat(inpX.value);
            const yVal = parseFloat(inpY.value);
            const nameVal = document.getElementById('gpsName').value || `GPS: ${xVal.toFixed(0)},${yVal.toFixed(0)}`;
            const iconVal = document.getElementById('gpsIconType').value || 'DEFAULT';
            const affVal = document.getElementById('gpsAffiliation').value || '';
            const notesVal = document.getElementById('gpsNotes').value || '';

            if (isNaN(xVal) || isNaN(yVal)) {
                await customAlert("ERREUR", "Coordonnées invalides.");
                return;
            }

            const mapCoords = gpsToPercentage(xVal, yVal);

            if (state.groups.length > 0) {
                let targetGroup = state.groups.find(g => g.name.includes("intérêt") || g.name.includes("Neutre"));
                if (!targetGroup) targetGroup = state.groups[0];
                targetGroup.visible = true;

                const newPoint = { 
                    name: nameVal, x: mapCoords.x, y: mapCoords.y, 
                    type: affVal, iconType: iconVal, notes: notesVal
                };
                targetGroup.points.push(newPoint);

                renderGroupsList();
                renderAll();

                // Centrage et Zoom sur le nouveau point
                const viewport = document.getElementById('viewport');
                const vw = viewport ? viewport.clientWidth : window.innerWidth;
                const vh = viewport ? viewport.clientHeight : window.innerHeight;
                
                state.view.scale = 2.5; 
                state.view.x = (vw / 2) - (newPoint.x * state.mapWidth / 100) * state.view.scale;
                state.view.y = (vh / 2) - (newPoint.y * state.mapHeight / 100) * state.view.scale;
                
                updateTransform();
                selectPoint(state.groups.indexOf(targetGroup), targetGroup.points.length - 1);

                // Reset
                inpX.value = ""; inpY.value = "";
                document.getElementById('gpsName').value = "";
                document.getElementById('gpsAffiliation').value = "";
                document.getElementById('gpsNotes').value = "";
                
            } else {
                await customAlert("ERREUR", "Aucun groupe disponible.");
            }
        };
    }
});