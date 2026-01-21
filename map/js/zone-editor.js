import { state, generateID } from './state.js';
import { renderAll, getMapPercentCoords } from './render.js';
import { selectItem } from './ui.js';
import { customAlert } from './ui-modals.js';

// --- INITIALISATION DES MODES ---

export function startDrawingCircle(groupIndex) {
    setupDrawingMode('CIRCLE', groupIndex, "MODE CERCLE: Cliquez + Glissez pour le rayon");
}

export function startDrawingPolygon(groupIndex) {
    setupDrawingMode('POLYGON', groupIndex, "MODE POLYGONE: Clic Gauche = Point, Clic Droit = Finir");
}

function setupDrawingMode(type, groupIndex, msg) {
    state.drawingMode = true;
    state.drawingType = type;
    state.drawingGroupIndex = groupIndex;
    state.tempZone = null;
    state.tempPoints = []; // Pour polygone
    document.body.style.cursor = 'crosshair';
    
    // Désélectionner
    if(state.selectedPoint || state.selectedZone) selectItem(null); 
    
    // Notification UI
    const notif = document.createElement('div');
    notif.id = 'drawing-notif';
    notif.style.cssText = "position:fixed; top:80px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:#0f0; padding:10px 20px; border-radius:5px; pointer-events:none; z-index:9999; font-weight:bold; border:1px solid #0f0;";
    notif.innerHTML = msg;
    document.body.appendChild(notif);
    
    renderAll();
}

// --- HANDLERS MAP (Appelés depuis ui.js) ---

export function handleMapMouseDown(e) {
    const coords = getMapPercentCoords(e.clientX, e.clientY);

    // 1. DÉBUT CERCLE (Clic Gauche)
    if (state.drawingMode && state.drawingType === 'CIRCLE' && e.button === 0) {
        state.tempZone = {
            cx: coords.x,
            cy: coords.y,
            r: 0,
            startMouse: { x: coords.x, y: coords.y }
        };
        renderAll();
        return;
    }
    
    // 2. POINTS POLYGONE (Clic Gauche)
    if (state.drawingMode && state.drawingType === 'POLYGON' && e.button === 0) {
        state.tempPoints.push(coords);
        renderAll();
        return;
    }
    
    // 3. FIN POLYGONE (Clic Droit)
    if (state.drawingMode && state.drawingType === 'POLYGON' && e.button === 2) {
        e.preventDefault();
        finishPolygon();
        return;
    }
}

export function handleMapMouseMove(e) {
    const coords = getMapPercentCoords(e.clientX, e.clientY);

    // 1. DRAG RAYON CERCLE
    if (state.drawingMode && state.drawingType === 'CIRCLE' && state.tempZone) {
        const dx = coords.x - state.tempZone.cx;
        const dy = coords.y - state.tempZone.cy;
        // Correction aspect ratio (simplifié)
        state.tempZone.r = Math.sqrt(dx*dx + dy*dy);
        renderAll();
        return;
    }

    // 2. DRAG & DROP D'UNE ZONE EXISTANTE
    if (state.draggingItem && state.draggingItem.type === 'zone') {
        const item = state.draggingItem;
        const group = state.groups[item.groupIndex];
        const zone = group.zones[item.zoneIndex];
        
        const deltaX = coords.x - item.startMouseMap.x;
        const deltaY = coords.y - item.startMouseMap.y;

        if (zone.type === 'CIRCLE') {
            zone.cx = item.origCx + deltaX;
            zone.cy = item.origCy + deltaY;
        } else {
            // Déplacer tous les points du polygone
            if(item.origPoints) {
                zone.points = item.origPoints.map(p => ({
                    x: p.x + deltaX,
                    y: p.y + deltaY
                }));
            }
        }
        renderAll();
    }
}

export function handleMapMouseUp(e) {
    // 1. FIN CERCLE (Relâchement clic)
    if (state.drawingMode && state.drawingType === 'CIRCLE' && state.tempZone) {
        finishCircle();
        return;
    }

    // 2. FIN DRAG
    if (state.draggingItem) {
        state.draggingItem = null;
        // On laisse la sélection active pour pouvoir éditer de suite
    }
}

// --- LOGIQUE FIN ---

function finishCircle() {
    if (state.tempZone.r < 0.2) {
        customAlert("INFO", "Rayon trop petit. Glissez la souris pour définir la taille.");
        state.tempZone = null;
        return;
    }

    const group = state.groups[state.drawingGroupIndex];
    if (group) {
        group.zones.push({
            id: generateID(),
            name: "Zone " + (group.zones.length + 1),
            type: 'CIRCLE',
            cx: state.tempZone.cx,
            cy: state.tempZone.cy,
            r: state.tempZone.r
        });
        selectItem('zone', state.drawingGroupIndex, group.zones.length - 1);
    }
    stopDrawing();
}

async function finishPolygon() {
    if (state.tempPoints.length < 3) {
        await customAlert("ATTENTION", "Une zone doit comporter au moins 3 points.");
        // On ne quitte pas, on laisse l'utilisateur continuer ou annuler
        return;
    }
    const group = state.groups[state.drawingGroupIndex];
    if (group) {
        group.zones.push({
            id: generateID(),
            name: "Zone " + (group.zones.length + 1),
            type: 'POLYGON',
            points: [...state.tempPoints]
        });
        selectItem('zone', state.drawingGroupIndex, group.zones.length - 1);
    }
    stopDrawing();
}

export function stopDrawing() {
    state.drawingMode = false;
    state.drawingType = null;
    state.tempZone = null;
    state.tempPoints = [];
    state.drawingGroupIndex = null;
    document.body.style.cursor = 'default';
    
    const notif = document.getElementById('drawing-notif');
    if(notif) notif.remove();
    
    renderAll();
}

// Initialise le drag (appelé depuis render.js au mousedown sur l'élément)
export function handleZoneMouseDown(e, gIndex, zIndex) {
    const coords = getMapPercentCoords(e.clientX, e.clientY);
    const zone = state.groups[gIndex].zones[zIndex];

    state.draggingItem = {
        type: 'zone',
        groupIndex: gIndex,
        zoneIndex: zIndex,
        startMouseMap: coords,
        // Sauvegarde état initial pour le delta
        origCx: zone.cx || 0,
        origCy: zone.cy || 0,
        origPoints: zone.points ? JSON.parse(JSON.stringify(zone.points)) : []
    };
}