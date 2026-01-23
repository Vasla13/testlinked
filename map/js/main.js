import { state, setGroups, exportToJSON, generateID, loadLocalState, saveLocalState } from './state.js';
import { initEngine, centerMap, updateTransform } from './engine.js'; 
import { renderGroupsList, initUI, selectItem } from './ui.js';
import { customAlert, customConfirm, customPrompt, customColorPicker } from './ui-modals.js';
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
    if(oldLayer) oldLayer.remove();

    initUI();
    initEngine();
    
    const cloudStatus = document.getElementById('cloud-status');
    if(cloudStatus) cloudStatus.style.display = 'inline-block';
    
    // --- CHARGEMENT DONNÉES ---
    const localData = loadLocalState();
    
    if (localData && localData.groups && localData.groups.length > 0) {
        console.log("💾 Restauration sauvegarde locale...");
        setGroups(localData.groups);
        if(localData.tacticalLinks) state.tacticalLinks = localData.tacticalLinks;
        if(cloudStatus) cloudStatus.style.display = 'none';
    } 
    else {
        console.log("☁️ Pas de local, chargement Cloud...");
        const cloudData = await api.loadLatestMap();
        
        if (cloudData && cloudData.groups) {
            setGroups(cloudData.groups);
            if(cloudData.tacticalLinks) state.tacticalLinks = cloudData.tacticalLinks;
            saveLocalState();
        } else {
            setGroups(DEFAULT_DATA);
            saveLocalState();
        }
        if(cloudStatus) cloudStatus.style.display = 'none';
    }

    renderGroupsList();
    renderAll(); 

    // --- AUTO-FOCUS VIA URL ---
    const params = new URLSearchParams(window.location.search);
    const focusId = params.get('focus');
    if(focusId) {
        let found = null;
        state.groups.forEach((g, gIdx) => {
            g.points.forEach((p, pIdx) => {
                if(p.id === focusId) found = { p, gIdx, pIdx };
            });
        });

        if(found) {
            state.view.scale = 3.5;
            const viewport = document.getElementById('viewport');
            const mapW = state.mapWidth || 2000; 
            const vw = viewport ? viewport.clientWidth : window.innerWidth;
            const vh = viewport ? viewport.clientHeight : window.innerHeight;

            state.view.x = (vw / 2) - (found.p.x * mapW / 100) * state.view.scale;
            state.view.y = (vh / 2) - (found.p.y * mapH / 100) * state.view.scale;
            updateTransform();
            selectItem('point', found.gIdx, found.pIdx);
        }
    }

    // --- BOUTONS BARRE D'OUTILS ---
    
    // 1. Sauvegarde Cloud Manuelle
    const btnCloudSave = document.getElementById('btnCloudSave');
    if(btnCloudSave) {
        btnCloudSave.onclick = async () => {
            if(await customConfirm("SAUVEGARDE CLOUD", "Écraser la version en ligne ?")) {
                if(cloudStatus) cloudStatus.style.display = 'inline-block';
                const success = await api.saveMap({ groups: state.groups, tacticalLinks: state.tacticalLinks });
                if(cloudStatus) cloudStatus.style.display = 'none';
                if(success) await customAlert("SUCCÈS", "Synchronisé.");
                else await customAlert("ERREUR", "Échec connexion.");
            }
        };
    }
    
    // 2. Export JSON (+ Sauvegarde Cloud invisible en arrière-plan)
    const btnSave = document.getElementById('btnSave');
    if(btnSave) {
        btnSave.onclick = () => {
            // A. "Fire and Forget" : On lance la sauvegarde Cloud sans 'await'
            api.saveMap({ 
                groups: state.groups, 
                tacticalLinks: state.tacticalLinks 
            }).catch(err => {
                console.error("Erreur sauvegarde background :", err);
            });

            // B. On lance le téléchargement IMMÉDIATEMENT
            exportToJSON();
        };
    }
    
    // 3. Reset Vue
    const btnReset = document.getElementById('btnResetView');
    if(btnReset) btnReset.onclick = centerMap;
    
    // 4. Ajouter Groupe
    const btnAddGroup = document.getElementById('btnAddGroup');
    if(btnAddGroup) btnAddGroup.onclick = async () => {
        const name = await customPrompt("NOUVEAU CALQUE", "Nom :");
        if(!name) return; 
        const color = await customColorPicker("COULEUR DU CALQUE", "#ffffff");
        if(!color) return; 

        state.groups.push({ name, color, visible: true, points: [], zones: [] });
        saveLocalState();
        renderGroupsList();
    };
    
    // 5. IMPORT (OUVRIR / REMPLACER)
    const fileInput = document.getElementById('fileImport');
    const btnTriggerImport = document.getElementById('btnTriggerImport');
    if (btnTriggerImport && fileInput) {
        btnTriggerImport.onclick = () => { fileInput.click(); };
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const json = JSON.parse(evt.target.result);
                    if (json.groups) {
                        setGroups(json.groups);
                        if(json.tacticalLinks) state.tacticalLinks = json.tacticalLinks;
                        
                        saveLocalState();
                        renderGroupsList(); renderAll();
                        await customAlert("OUVERTURE", "Carte chargée (Remplacement total).");
                    }
                } catch (err) { await customAlert("ERREUR", "Fichier invalide."); }
                fileInput.value = ''; 
            };
            reader.readAsText(file);
        };
    }

    // 6. FUSION (MERGE)
    const fileMerge = document.getElementById('fileMerge');
    const btnTriggerMerge = document.getElementById('btnTriggerMerge');
    if(btnTriggerMerge && fileMerge) {
        btnTriggerMerge.onclick = () => { fileMerge.click(); };
        fileMerge.onchange = (e) => {
            const file = e.target.files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const json = JSON.parse(evt.target.result);
                    let importedCount = 0;
                    
                    if(json.groups) {
                        json.groups.forEach(newGroup => {
                            // Chercher si le groupe existe déjà
                            const existingGroup = state.groups.find(g => g.name === newGroup.name);
                            if(existingGroup) {
                                // Fusionner les points dans le groupe existant
                                if(newGroup.points) {
                                    newGroup.points.forEach(p => {
                                        // On évite les doublons d'ID exacts, sinon on ajoute
                                        if(!existingGroup.points.some(ep => ep.id === p.id)) {
                                            existingGroup.points.push(p);
                                            importedCount++;
                                        }
                                    });
                                }
                                // Fusionner les zones
                                if(newGroup.zones) {
                                    newGroup.zones.forEach(z => {
                                        existingGroup.zones.push(z);
                                    });
                                }
                            } else {
                                // Nouveau groupe complet
                                state.groups.push(newGroup);
                                importedCount += (newGroup.points ? newGroup.points.length : 0);
                            }
                        });
                        
                        // Fusionner les liens tactiques
                        if(json.tacticalLinks) {
                            if(!state.tacticalLinks) state.tacticalLinks = [];
                            json.tacticalLinks.forEach(l => {
                                if(!state.tacticalLinks.some(el => el.id === l.id)) {
                                    state.tacticalLinks.push(l);
                                }
                            });
                        }

                        saveLocalState();
                        renderGroupsList(); renderAll();
                        await customAlert("FUSION", `${importedCount} points importés.`);
                    }
                } catch (err) { await customAlert("ERREUR", "Fichier invalide."); }
                fileMerge.value = '';
            };
            reader.readAsText(file);
        }
    }

    // 7. RESET TOTAL (NOUVEAU)
    const btnResetMap = document.getElementById('btnResetMap');
    if(btnResetMap) {
        btnResetMap.onclick = async () => {
            if(await customConfirm("RESET TOTAL", "Voulez-vous vraiment tout effacer ? Cette action est irréversible.")) {
                
                // On remet les données par défaut (Copie propre pour éviter les références)
                setGroups(JSON.parse(JSON.stringify(DEFAULT_DATA))); 
                state.tacticalLinks = []; 
                
                // On sauvegarde l'état vide
                saveLocalState();
                
                // On rafraîchit l'interface
                renderGroupsList();
                renderAll();
                centerMap();
                
                await customAlert("SUCCÈS", "La carte a été remise à zéro.");
            }
        };
    }

    // --- GPS PANEL ---
    const gpsIconSelect = document.getElementById('gpsIconType');
    if(gpsIconSelect) {
        let opts = ''; for(const k in ICONS) opts += `<option value="${k}">${k}</option>`;
        gpsIconSelect.innerHTML = opts;
    }
    
    const gpsPanel = document.getElementById('gps-panel');
    const btnToggleGps = document.getElementById('btnToggleGpsPanel');
    const btnCloseGps = document.querySelector('.close-gps');

    if(gpsPanel && btnToggleGps) {
        btnToggleGps.onclick = () => { 
            const isHidden = (gpsPanel.style.display === 'none');
            
            if(isHidden) {
                const selectEl = document.getElementById('gpsGroupSelect');
                if(selectEl) {
                    selectEl.innerHTML = '';
                    state.groups.forEach((g, idx) => {
                        const opt = document.createElement('option');
                        opt.value = idx;
                        opt.text = g.name;
                        opt.style.color = 'black'; 
                        selectEl.appendChild(opt);
                    });
                }
                gpsPanel.style.display = 'block';
            } else {
                gpsPanel.style.display = 'none';
            }
        };
        if(btnCloseGps) btnCloseGps.onclick = () => { gpsPanel.style.display = 'none'; };
    }

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
            
            const selectEl = document.getElementById('gpsGroupSelect');
            const groupIdx = selectEl ? parseInt(selectEl.value) : 0;

            if (isNaN(xVal) || isNaN(yVal)) { await customAlert("ERREUR", "Coordonnées invalides."); return; }
            const mapCoords = gpsToPercentage(xVal, yVal);
            
            if (state.groups.length > 0) {
                let targetGroup = state.groups[groupIdx];
                if (!targetGroup) targetGroup = state.groups[0];
                targetGroup.visible = true;
                
                const newPoint = { 
                    id: generateID(),
                    name: nameVal, 
                    x: mapCoords.x, 
                    y: mapCoords.y, 
                    type: affVal, 
                    iconType: iconVal, 
                    notes: notesVal 
                };
                
                targetGroup.points.push(newPoint);
                saveLocalState();
                
                renderGroupsList(); renderAll();

                const viewport = document.getElementById('viewport');
                const vw = viewport ? viewport.clientWidth : window.innerWidth;
                const vh = viewport ? viewport.clientHeight : window.innerHeight;
                state.view.scale = 2.5; 
                state.view.x = (vw / 2) - (newPoint.x * state.mapWidth / 100) * state.view.scale;
                state.view.y = (vh / 2) - (newPoint.y * state.mapHeight / 100) * state.view.scale;
                updateTransform();
                
                selectItem('point', state.groups.indexOf(targetGroup), targetGroup.points.length - 1);

                inpX.value = ""; inpY.value = ""; document.getElementById('gpsName').value = ""; document.getElementById('gpsAffiliation').value = ""; document.getElementById('gpsNotes').value = "";
            } else {
                await customAlert("ERREUR", "Aucun groupe.");
            }
        };
    }
});