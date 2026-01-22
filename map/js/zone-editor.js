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

// NOUVEAU : Mode Dessin Libre
export function startDrawingFree(groupIndex) {
    setupDrawingMode('POLYGON', groupIndex, "MODE LIBRE: Maintenez le clic gauche pour dessiner");
    state.isFreeMode = true; 
}

function setupDrawingMode(type, groupIndex, msg) {
    state.drawingMode = true;
    state.drawingType = type;
    state.drawingGroupIndex = groupIndex;
    
    // Reset des états
    state.tempZone = null;
    state.tempPoints = [];
    state.isFreeMode = false;
    state.isFreeDrawing = false;

    document.body.style.cursor = 'crosshair';
    
    // Désélectionner
    if(state.selectedPoint || state.selectedZone) selectItem(null); 
    
    // Notification UI
    let notif = document.getElementById('drawing-notif');
    if(!notif) {
        notif = document.createElement('div');
        notif.id = 'drawing-notif';
        notif.style.cssText = "position:fixed; top:80px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:#0f0; padding:10px 20px; border-radius:5px; pointer-events:none; z-index:9999; font-weight:bold; border:1px solid #0f0;";
        document.body.appendChild(notif);
    }
    notif.innerHTML = msg;
    
    renderAll();
}

// --- HANDLERS MAP ---

export function handleMapMouseDown(e) {
    const coords = getMapPercentCoords(e.clientX, e.clientY);

    // 1. DÉBUT CERCLE
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
    
    // 2. POLYGONE (Classique ou Libre)
    if (state.drawingMode && state.drawingType === 'POLYGON' && e.button === 0) {
        if (state.isFreeMode) {
            state.tempPoints = [coords]; 
            state.isFreeDrawing = true;  
            renderAll();
            return;
        } else {
            state.tempPoints.push(coords);
            renderAll();
            return;
        }
    }
    
    // 3. FIN POLYGONE CLASSIQUE (Clic Droit)
    if (state.drawingMode && state.drawingType === 'POLYGON' && !state.isFreeMode && e.button === 2) {
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
        state.tempZone.r = Math.sqrt(dx*dx + dy*dy);
        renderAll();
        return;
    }

    // 2. DESSIN LIBRE
    if (state.drawingMode && state.drawingType === 'POLYGON' && state.isFreeMode && state.isFreeDrawing) {
        const lastPt = state.tempPoints[state.tempPoints.length - 1];
        const distSq = (coords.x - lastPt.x)**2 + (coords.y - lastPt.y)**2;
        if (distSq > 0.00005) { 
            state.tempPoints.push(coords);
            renderAll();
        }
        return;
    }

    // 3. DRAG & DROP ZONE
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
    if (state.drawingMode && state.drawingType === 'CIRCLE' && state.tempZone) {
        finishCircle();
        return;
    }

    if (state.drawingMode && state.drawingType === 'POLYGON' && state.isFreeMode && state.isFreeDrawing) {
        state.isFreeDrawing = false;
        finishPolygon(); 
        return;
    }

    if (state.draggingItem) {
        state.draggingItem = null;
    }
}

// --- FINALISATION ---

function finishCircle() {
    if (state.tempZone.r < 0.2) {} // Seuil min
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
        if(state.isFreeMode) { state.tempPoints = []; return; }
        await customAlert("ATTENTION", "Une zone doit comporter au moins 3 points.");
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
    state.isFreeMode = false;
    state.isFreeDrawing = false;
    
    document.body.style.cursor = 'default';
    const notif = document.getElementById('drawing-notif');
    if(notif) notif.remove();
    renderAll();
}

export function handleZoneMouseDown(e, gIndex, zIndex) {
    const coords = getMapPercentCoords(e.clientX, e.clientY);
    const zone = state.groups[gIndex].zones[zIndex];

    state.draggingItem = {
        type: 'zone',
        groupIndex: gIndex,
        zoneIndex: zIndex,
        startMouseMap: coords,
        origCx: zone.cx || 0,
        origCy: zone.cy || 0,
        origPoints: zone.points ? JSON.parse(JSON.stringify(zone.points)) : []
    };
}