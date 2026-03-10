import { state, setGroups, generateID, loadLocalState, saveLocalState, pushHistory, undo, getMapData } from './state.js';
import { initEngine, updateTransform } from './engine.js'; 
import { renderGroupsList, initUI, selectItem } from './ui.js';
import { customAlert, customConfirm, openSaveOptionsModal } from './ui-modals.js';
import { gpsToPercentage } from './utils.js';
import { renderAll } from './render.js';
import { ICONS } from './constants.js';
import { api } from './api.js';
import { initCloudCollab, openCloudMenu, getCloudSaveModalOptions } from './cloud.js';
import { initAlertPickerMode, loadAlertFromUrl } from './alerts.js';

const DEFAULT_DATA = [
    { name: "Alliés", color: "#73fbf7", visible: true, points: [], zones: [] },
    { name: "Hostiles", color: "#ff6b81", visible: true, points: [], zones: [] },
    { name: "Neutres", color: "#ffd400", visible: true, points: [], zones: [] }
];

function makePairKey(a, b) {
    const x = String(a ?? '');
    const y = String(b ?? '');
    return x < y ? `${x}|${y}` : `${y}|${x}`;
}

function makeUniqueId(idSet) {
    let next = '';
    do {
        next = generateID();
    } while (idSet.has(String(next)));
    return next;
}

function sanitizeZoneStyle(rawStyle) {
    const styleValue = rawStyle && typeof rawStyle === 'object' ? rawStyle : {};
    const width = Number(styleValue.width);
    const style = ['solid', 'dashed', 'dotted'].includes(styleValue.style) ? styleValue.style : 'solid';
    return {
        width: Number.isFinite(width) ? width : 2,
        style
    };
}

function sanitizeIncomingGroup(rawGroup, pointIds, zoneIds, fallbackIndex) {
    const palette = ['#73fbf7', '#ff6b81', '#ffd400', '#ff922b', '#a9e34b'];
    const source = rawGroup && typeof rawGroup === 'object' ? rawGroup : {};
    const safeGroup = {
        name: String(source.name || `GROUPE ${fallbackIndex + 1}`),
        color: String(source.color || palette[fallbackIndex % palette.length]),
        visible: source.visible !== false,
        points: [],
        zones: []
    };

    const points = Array.isArray(source.points) ? source.points : [];
    points.forEach((rawPoint, index) => {
        if (!rawPoint || typeof rawPoint !== 'object') return;

        let pointId = String(rawPoint.id || '');
        if (!pointId || pointIds.has(pointId)) {
            pointId = makeUniqueId(pointIds);
        }
        pointIds.add(pointId);

        const x = Number(rawPoint.x);
        const y = Number(rawPoint.y);

        safeGroup.points.push({
            id: pointId,
            name: String(rawPoint.name || `Point ${index + 1}`),
            x: Number.isFinite(x) ? x : 50,
            y: Number.isFinite(y) ? y : 50,
            type: String(rawPoint.type || ''),
            iconType: String(rawPoint.iconType || 'DEFAULT'),
            notes: String(rawPoint.notes || ''),
            status: String(rawPoint.status || 'ACTIVE')
        });
    });

    const zones = Array.isArray(source.zones) ? source.zones : [];
    zones.forEach((rawZone, index) => {
        if (!rawZone || typeof rawZone !== 'object') return;

        let zoneId = String(rawZone.id || '');
        if (!zoneId || zoneIds.has(zoneId)) {
            zoneId = makeUniqueId(zoneIds);
        }
        zoneIds.add(zoneId);

        const zoneType = rawZone.type === 'CIRCLE' ? 'CIRCLE' : 'POLYGON';
        const zoneStyle = sanitizeZoneStyle(rawZone.style);

        if (zoneType === 'CIRCLE') {
            const cx = Number(rawZone.cx);
            const cy = Number(rawZone.cy);
            const r = Number(rawZone.r);
            safeGroup.zones.push({
                id: zoneId,
                name: String(rawZone.name || `Zone ${index + 1}`),
                type: 'CIRCLE',
                cx: Number.isFinite(cx) ? cx : 50,
                cy: Number.isFinite(cy) ? cy : 50,
                r: Number.isFinite(r) && r > 0 ? r : 1,
                style: zoneStyle
            });
            return;
        }

        const pointsRaw = Array.isArray(rawZone.points) ? rawZone.points : [];
        const zonePoints = pointsRaw
            .map(pt => {
                const x = Number(pt?.x);
                const y = Number(pt?.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                return { x, y };
            })
            .filter(Boolean);

        if (zonePoints.length < 3) return;

        safeGroup.zones.push({
            id: zoneId,
            name: String(rawZone.name || `Zone ${index + 1}`),
            type: 'POLYGON',
            points: zonePoints,
            style: zoneStyle
        });
    });

    return safeGroup;
}

function mergeIncomingMapData(data) {
    const stats = {
        addedGroups: 0,
        addedPoints: 0,
        addedZones: 0,
        addedLinks: 0,
        skippedLinks: 0
    };

    const pointIds = new Set();
    const zoneIds = new Set();
    state.groups.forEach(group => {
        (group.points || []).forEach(point => pointIds.add(String(point.id)));
        (group.zones || []).forEach(zone => zoneIds.add(String(zone.id)));
    });

    const incomingGroups = Array.isArray(data?.groups) ? data.groups : [];
    incomingGroups.forEach((group, index) => {
        const safeGroup = sanitizeIncomingGroup(group, pointIds, zoneIds, state.groups.length + index);
        state.groups.push(safeGroup);
        stats.addedGroups += 1;
        stats.addedPoints += safeGroup.points.length;
        stats.addedZones += safeGroup.zones.length;
    });

    const existingLinkIds = new Set((state.tacticalLinks || []).map(link => String(link.id)));
    const existingPairs = new Set((state.tacticalLinks || []).map(link => makePairKey(link.from, link.to)));
    const incomingLinks = Array.isArray(data?.tacticalLinks) ? data.tacticalLinks : [];

    incomingLinks.forEach(rawLink => {
        if (!rawLink || typeof rawLink !== 'object') return;

        const from = String(rawLink.from || rawLink.source || '');
        const to = String(rawLink.to || rawLink.target || '');
        if (!from || !to || from === to) {
            stats.skippedLinks += 1;
            return;
        }
        if (!pointIds.has(from) || !pointIds.has(to)) {
            stats.skippedLinks += 1;
            return;
        }

        const pairKey = makePairKey(from, to);
        if (existingPairs.has(pairKey)) {
            stats.skippedLinks += 1;
            return;
        }

        let linkId = String(rawLink.id || '');
        if (!linkId || existingLinkIds.has(linkId)) {
            linkId = makeUniqueId(existingLinkIds);
        }

        state.tacticalLinks.push({
            id: linkId,
            from,
            to,
            color: rawLink.color || null,
            type: String(rawLink.type || 'Standard')
        });

        existingLinkIds.add(linkId);
        existingPairs.add(pairKey);
        stats.addedLinks += 1;
    });

    return stats;
}

function focusPointById(targetId) {
    const wantedId = String(targetId || '').trim();
    if (!wantedId) return false;

    for (let groupIndex = 0; groupIndex < state.groups.length; groupIndex++) {
        const group = state.groups[groupIndex];
        const points = Array.isArray(group?.points) ? group.points : [];
        for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
            const point = points[pointIndex];
            if (String(point.id) !== wantedId) continue;

            group.visible = true;

            const viewport = document.getElementById('viewport');
            const vw = viewport ? viewport.clientWidth : window.innerWidth;
            const vh = viewport ? viewport.clientHeight : window.innerHeight;
            const mapW = state.mapWidth || 2000;
            const mapH = state.mapHeight || 2000;

            state.view.scale = 2.5;
            state.view.x = (vw / 2) - (point.x * mapW / 100) * state.view.scale;
            state.view.y = (vh / 2) - (point.y * mapH / 100) * state.view.scale;

            updateTransform();
            selectItem('point', groupIndex, pointIndex);
            return true;
        }
    }

    return false;
}

document.addEventListener('DOMContentLoaded', async () => {
    const oldLayer = document.querySelector('#map-world #markers-layer');
    if(oldLayer) oldLayer.remove(); // Nettoyage si doublon

    // Initialisation
    initUI();
    initEngine();
    initAlertPickerMode();
    
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

    const focusId = new URLSearchParams(window.location.search).get('focus');
    if (focusId) {
        const focusedNow = focusPointById(focusId);
        if (!focusedNow) {
            setTimeout(() => {
                if (!focusPointById(focusId)) {
                    customAlert("INFO", "Point tactique introuvable.");
                }
            }, 600);
        }
    }

    await initCloudCollab();
    await loadAlertFromUrl();

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

    const btnSave = document.getElementById('btnSave');
    const fileImport = document.getElementById('fileImport');
    const fileMerge = document.getElementById('fileMerge');
    const btnDataFileToggle = document.getElementById('btnDataFileToggle');
    const dataActionLaunchers = document.getElementById('dataActionLaunchers');

    const syncDataActionsUi = () => {
        if (!btnDataFileToggle) return;
        const expanded = Boolean(dataActionLaunchers && !dataActionLaunchers.hidden);
        btnDataFileToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    };

    const closeDataActions = () => {
        if (!dataActionLaunchers || dataActionLaunchers.hidden) return;
        dataActionLaunchers.hidden = true;
        syncDataActionsUi();
    };

    const toggleDataActions = () => {
        if (!dataActionLaunchers) {
            openCloudMenu();
            return;
        }
        dataActionLaunchers.hidden = !dataActionLaunchers.hidden;
        syncDataActionsUi();
    };

    const openSaveHub = () => {
        const saveOptions = getCloudSaveModalOptions();

        if (!saveOptions.localExportLocked) {
            const mapData = getMapData();
            const fileName = state.currentFileName || `map_${Date.now()}`;
            api.saveToDatabase(mapData, fileName).then(success => {
                if(success) console.log("✅ Backup Database OK");
                else console.warn("❌ Backup Database Échoué");
            });
        }

        openSaveOptionsModal(saveOptions);
    };

    if (btnSave) {
        btnSave.onclick = openSaveHub;
    }

    const btnCloudMenu = document.getElementById('btnCloudMenu');
    if (btnCloudMenu) {
        btnCloudMenu.onclick = () => {
            closeDataActions();
            openCloudMenu();
        };
    }

    if (btnDataFileToggle) {
        syncDataActionsUi();
        btnDataFileToggle.onclick = (event) => {
            event.stopPropagation();
            toggleDataActions();
        };
    }

    if (dataActionLaunchers) {
        dataActionLaunchers.addEventListener('click', (event) => {
            event.stopPropagation();
        });
        Array.from(dataActionLaunchers.querySelectorAll('button')).forEach((button) => {
            button.addEventListener('click', () => {
                closeDataActions();
            });
        });
    }

    window.addEventListener('click', () => {
        closeDataActions();
    });

    // --- IMPORT ---
    const btnTriggerImport = document.getElementById('btnTriggerImport');
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
    if (btnTriggerMerge && fileMerge) {
        btnTriggerMerge.onclick = () => fileMerge.click();
        fileMerge.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (Array.isArray(data.groups)) {
                        pushHistory();
                        const stats = mergeIncomingMapData(data);
                        renderGroupsList(); renderAll(); saveLocalState();
                        customAlert(
                            "FUSION",
                            `${stats.addedGroups} groupes, ${stats.addedPoints} points, ${stats.addedZones} zones, ${stats.addedLinks} liens ajoutés.`
                        );
                    } else {
                        customAlert("ERREUR", "Fichier de fusion invalide.");
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
