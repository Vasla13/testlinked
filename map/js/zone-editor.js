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

// Mode Dessin Libre
export function startDrawingFree(groupIndex) {
    setupDrawingMode('POLYGON', groupIndex, "✏️ DESSIN LIBRE: Maintenez clic gauche. Relâchez pour éditer.");
    state.isFreeMode = true; 
}

function setupDrawingMode(type, groupIndex, msg) {
    state.drawingMode = true;
    state.drawingType = type;
    state.drawingGroupIndex = groupIndex;
    
    // Reset
    state.tempZone = null;
    state.tempPoints = [];
    state.isFreeMode = (type === 'POLYGON' && state.isFreeMode);
    state.isFreeDrawing = false;
    state.drawingPending = false;

    document.body.style.cursor = 'crosshair';
    
    // Désélectionner pour éviter les conflits
    if(state.selectedPoint || state.selectedZone) selectItem(null); 
    
    showNotification(msg);
    initToolbarEvents(); 
}

function showNotification(msg) {
    let notif = document.getElementById('drawing-notif');
    if(!notif) {
        notif = document.createElement('div');
        notif.id = 'drawing-notif';
        notif.style.cssText = "position:fixed; top:90px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:#0f0; padding:10px 20px; border-radius:5px; pointer-events:none; z-index:4000; font-weight:bold; border:1px solid #0f0; font-family:'Rajdhani'; text-transform:uppercase;";
        document.body.appendChild(notif);
    }
    notif.innerHTML = msg;
    notif.style.display = 'block';
}

// --- GESTION BARRE D'OUTILS ---

function initToolbarEvents() {
    const toolbar = document.getElementById('drawing-toolbar');
    if(!toolbar) return;

    const range = document.getElementById('drawWidth');
    const val = document.getElementById('drawWidthVal');
    const select = document.getElementById('drawStyle');
    
    range.oninput = () => {
        state.drawOptions.width = parseInt(range.value);
        val.innerText = range.value + 'px';
        renderAll();
    };
    
    select.onchange = () => {
        state.drawOptions.style = select.value;
        renderAll();
    };

    document.getElementById('btnDrawConfirm').onclick = confirmDrawing;
    document.getElementById('btnDrawCancel').onclick = cancelDrawing;
    document.getElementById('btnDrawSmooth').onclick = smoothDrawing;
}

function showToolbar() {
    const toolbar = document.getElementById('drawing-toolbar');
    if(toolbar) toolbar.style.display = 'block';
    const notif = document.getElementById('drawing-notif');
    if(notif) notif.style.display = 'none';
}

function hideToolbar() {
    const toolbar = document.getElementById('drawing-toolbar');
    if(toolbar) toolbar.style.display = 'none';
}

// --- HANDLERS MAP ---

export function handleMapMouseDown(e) {
    if (state.drawingPending) return; // Bloque si en attente de validation

    const coords = getMapPercentCoords(e.clientX, e.clientY);

    // 1. DÉBUT CERCLE
    if (state.drawingMode && state.drawingType === 'CIRCLE' && e.button === 0) {
        state.tempZone = { cx: coords.x, cy: coords.y, r: 0 };
        renderAll();
        return;
    }
    
    // 2. POLYGONE / LIBRE
    if (state.drawingMode && state.drawingType === 'POLYGON' && e.button === 0) {
        if (state.isFreeMode) {
            state.tempPoints = [coords]; 
            state.isFreeDrawing = true;  
            renderAll();
        } else {
            state.tempPoints.push(coords);
            renderAll();
        }
        return;
    }
    
    // 3. CLIC DROIT (Fin Polygone Classique)
    if (state.drawingMode && state.drawingType === 'POLYGON' && !state.isFreeMode && e.button === 2) {
        e.preventDefault();
        state.drawingPending = true;
        showToolbar();
        document.body.style.cursor = 'default';
        return;
    }
}

export function handleMapMouseMove(e) {
    if (state.drawingPending) return;

    const coords = getMapPercentCoords(e.clientX, e.clientY);

    // A. DESSIN DU CERCLE (Rayon)
    if (state.drawingMode && state.drawingType === 'CIRCLE' && state.tempZone) {
        const dx = coords.x - state.tempZone.cx;
        const dy = coords.y - state.tempZone.cy;
        state.tempZone.r = Math.sqrt(dx*dx + dy*dy);
        renderAll();
        return;
    }

    // B. DESSIN LIBRE (Traceur)
    if (state.drawingMode && state.drawingType === 'POLYGON' && state.isFreeDrawing) {
        const lastPt = state.tempPoints[state.tempPoints.length - 1];
        const distSq = (coords.x - lastPt.x)**2 + (coords.y - lastPt.y)**2;
        if (distSq > 0.00002) { 
            state.tempPoints.push(coords);
            renderAll();
        }
        return;
    }

    // C. DÉPLACEMENT (DRAG & DROP) D'UNE ZONE EXISTANTE [C'EST ICI QUE CA MANQUAIT]
    if (state.draggingItem && state.draggingItem.type === 'zone') {
        const item = state.draggingItem;
        const group = state.groups[item.groupIndex];
        const zone = group.zones[item.zoneIndex];
        
        // Calcul du déplacement
        const deltaX = coords.x - item.startMouseMap.x;
        const deltaY = coords.y - item.startMouseMap.y;

        if (zone.type === 'CIRCLE') {
            zone.cx = item.origCx + deltaX;
            zone.cy = item.origCy + deltaY;
        } else {
            // Pour les polygones, on déplace chaque point
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
    // 1. FIN CERCLE
    if (state.drawingMode && state.drawingType === 'CIRCLE' && state.tempZone) {
        finishCircle();
        return;
    }

    // 2. FIN TRACÉ LIBRE
    if (state.drawingMode && state.drawingType === 'POLYGON' && state.isFreeDrawing) {
        state.isFreeDrawing = false;
        
        if (state.tempPoints.length > 2) {
            state.drawingPending = true;
            document.body.style.cursor = 'default';
            showToolbar();
        } else {
            state.tempPoints = [];
        }
        renderAll();
        return;
    }

    // 3. FIN DU DRAG (On libère l'objet déplacé)
    if (state.draggingItem) {
        state.draggingItem = null;
        // On ne render pas forcément ici, le dernier move l'a fait
    }
}

// --- ACTIONS ---

function confirmDrawing() {
    const group = state.groups[state.drawingGroupIndex];
    if (group) {
        group.zones.push({
            id: generateID(),
            name: "Zone " + (group.zones.length + 1),
            type: 'POLYGON',
            points: [...state.tempPoints],
            style: { ...state.drawOptions }
        });
        selectItem('zone', state.drawingGroupIndex, group.zones.length - 1);
    }
    stopDrawing();
}

function cancelDrawing() {
    state.tempPoints = [];
    state.drawingPending = false;
    hideToolbar();
    stopDrawing();
}

function smoothDrawing() {
    if (state.tempPoints.length < 3) return;
    const pts = state.tempPoints;
    const smoothed = [];
    
    smoothed.push(pts[0]);
    for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i+1];
        smoothed.push({ x: 0.75 * p1.x + 0.25 * p2.x, y: 0.75 * p1.y + 0.25 * p2.y });
        smoothed.push({ x: 0.25 * p1.x + 0.75 * p2.x, y: 0.25 * p1.y + 0.75 * p2.y });
    }
    smoothed.push(pts[pts.length - 1]);
    
    state.tempPoints = smoothed;
    renderAll();
}

function finishCircle() {
    if (state.tempZone.r < 0.2) {} 
    const group = state.groups[state.drawingGroupIndex];
    if (group) {
        group.zones.push({
            id: generateID(),
            name: "Zone " + (group.zones.length + 1),
            type: 'CIRCLE',
            cx: state.tempZone.cx,
            cy: state.tempZone.cy,
            r: state.tempZone.r,
            style: { ...state.drawOptions }
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
    state.drawingPending = false;
    
    document.body.style.cursor = 'default';
    const notif = document.getElementById('drawing-notif');
    if(notif) notif.remove();
    
    hideToolbar();
    renderAll();
}

// Initialise le drag (appelé depuis render.js)
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