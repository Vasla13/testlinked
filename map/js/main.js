import { state, setGroups, exportToJSON } from './state.js';
import { initEngine, centerMap } from './engine.js'; 
import { renderGroupsList, initUI, selectPoint, customAlert, customPrompt } from './ui.js';
import { gpsToPercentage } from './utils.js';
import { renderAll } from './render.js';
import { ICONS } from './constants.js';

const DEFAULT_DATA = [
    { name: "Alliés", color: "#73fbf7", visible: true, points: [], zones: [] },
    { name: "Hostiles", color: "#ff6b81", visible: true, points: [], zones: [] },
    { name: "Neutres", color: "#ffd400", visible: true, points: [], zones: [] }
];

document.addEventListener('DOMContentLoaded', () => {
    initUI();
    setGroups(DEFAULT_DATA);
    initEngine();
    renderGroupsList();
    renderAll(); 

    // Remplissage Select Icônes
    const gpsIconSelect = document.getElementById('gpsIconType');
    if(gpsIconSelect) {
        let opts = '';
        for(const k in ICONS) opts += `<option value="${k}">${k}</option>`;
        gpsIconSelect.innerHTML = opts;
    }

    // Gestion Panneau GPS
    const gpsPanel = document.getElementById('gps-panel');
    const btnToggleGps = document.getElementById('btnToggleGpsPanel');
    const btnCloseGps = document.querySelector('.close-gps');
    if(gpsPanel && btnToggleGps) {
        btnToggleGps.onclick = () => { gpsPanel.style.display = (gpsPanel.style.display === 'none') ? 'block' : 'none'; };
        if(btnCloseGps) btnCloseGps.onclick = () => { gpsPanel.style.display = 'none'; };
    }

    // Gestion Import (CORRIGÉE & AVEC MODALES)
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
                        
                        await customAlert("IMPORTATION RÉUSSIE", `Les données tactiques ont été chargées.<br>Calques : ${json.groups.length}`);
                    } else {
                        await customAlert("ERREUR IMPORT", "Le fichier ne contient pas de structure 'groups' valide.");
                    }
                } catch (err) {
                    console.error(err);
                    await customAlert("ERREUR CRITIQUE", "Fichier corrompu ou format JSON invalide.");
                }
                fileInput.value = ''; // Reset obligatoire
            };
            reader.readAsText(file);
        });
    }

    // Ajout GPS
    const inpX = document.getElementById('gpsInputX');
    const inpY = document.getElementById('gpsInputY');
    const btnAddGps = document.getElementById('btnAddGpsPoint');

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
                await customAlert("COORDONNÉES INVALIDES", "Veuillez entrer des valeurs numériques pour X et Y.");
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

                const vw = window.innerWidth;
                const vh = window.innerHeight;
                state.view.scale = 2.0; 
                state.view.x = (vw / 2) - (newPoint.x * state.mapWidth / 100) * state.view.scale;
                state.view.y = (vh / 2) - (newPoint.y * state.mapHeight / 100) * state.view.scale;
                
                import('./engine.js').then(eng => eng.updateTransform());
                selectPoint(state.groups.indexOf(targetGroup), targetGroup.points.length - 1);

                // Reset champs
                inpX.value = ""; inpY.value = "";
                document.getElementById('gpsName').value = "";
                document.getElementById('gpsAffiliation').value = "";
                document.getElementById('gpsNotes').value = "";
            } else {
                await customAlert("ATTENTION", "Aucun groupe de calques n'est disponible.");
            }
        };
    }
    
    // Boutons divers
    const btnSave = document.getElementById('btnSave');
    if(btnSave) btnSave.onclick = exportToJSON;
    const btnReset = document.getElementById('btnResetView');
    if(btnReset) btnReset.onclick = centerMap;
    
    // NOUVEAU GROUPE AVEC MODALE
    const btnAddGroup = document.getElementById('btnAddGroup');
    if(btnAddGroup) btnAddGroup.onclick = async () => {
        const name = await customPrompt("NOUVEAU CALQUE", "Entrez le nom du nouveau groupe :");
        if(name) {
            state.groups.push({ name, color: '#ffffff', visible: true, points: [], zones: [] });
            renderGroupsList();
        }
    };
});