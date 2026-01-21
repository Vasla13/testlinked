import { state } from './state.js';
import { renderAll, getMapPercentCoords } from './render.js';
import { handlePointClick } from './ui.js';

const viewport = document.getElementById('viewport');
const mapWorld = document.getElementById('map-world');
const mapImage = document.getElementById('map-image');
const hudCoords = document.getElementById('coords-display');
const markersLayer = document.getElementById('markers-layer');

export function updateTransform() {
    mapWorld.style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.scale})`;

    if (markersLayer && state.mapWidth && state.mapHeight) {
        markersLayer.style.transform = `translate(${state.view.x}px, ${state.view.y}px)`;
        markersLayer.style.width = `${state.mapWidth * state.view.scale}px`;
        markersLayer.style.height = `${state.mapHeight * state.view.scale}px`;
    }
}

// CORRECTION : On calcule l'écart (offset) au clic
export function startMarkerDrag(e, gIndex, pIndex) {
    const mouseStart = getMapPercentCoords(e.clientX, e.clientY);
    const point = state.groups[gIndex].points[pIndex];

    state.draggingMarker = {
        groupIndex: gIndex,
        pointIndex: pIndex,
        startX: e.clientX,
        startY: e.clientY,
        hasMoved: false,
        // On mémorise la différence de position entre la souris et le point
        offsetX: point.x - mouseStart.x,
        offsetY: point.y - mouseStart.y
    };
    viewport.style.cursor = 'grabbing';
}

export function initEngine() {
    if(mapImage.complete) {
        state.mapWidth = mapImage.naturalWidth;
        state.mapHeight = mapImage.naturalHeight;
        centerMap();
    } else {
        mapImage.onload = () => {
            state.mapWidth = mapImage.naturalWidth;
            state.mapHeight = mapImage.naturalHeight;
            centerMap();
        };
    }

    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        const newScale = state.view.scale * (1 + delta * 0.1);
        if (newScale < 0.05 || newScale > 8) return;

        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        state.view.x = mouseX - (mouseX - state.view.x) * (newScale / state.view.scale);
        state.view.y = mouseY - (mouseY - state.view.y) * (newScale / state.view.scale);
        state.view.scale = newScale;
        
        renderAll();
        updateTransform();
    });

    viewport.addEventListener('mousedown', (e) => {
        if (state.draggingMarker) return; 
        if (state.drawingMode) return; 
        
        if (state.measuringMode && e.button === 0) {
            const coords = getMapPercentCoords(e.clientX, e.clientY);
            if (state.measureStep === 0 || state.measureStep === 2) {
                state.measurePoints = [coords, coords];
                state.measureStep = 1;
            } else if (state.measureStep === 1) {
                state.measurePoints[1] = coords;
                state.measureStep = 2;
            }
            renderAll();
            return;
        }

        if(e.button === 0) {
            state.isDragging = true;
            state.lastMouse = { x: e.clientX, y: e.clientY };
            viewport.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => {
        updateHUDCoords(e);
        
        // --- LOGIQUE DEPLACEMENT POINT ---
        if (state.draggingMarker) {
            const dx = Math.abs(e.clientX - state.draggingMarker.startX);
            const dy = Math.abs(e.clientY - state.draggingMarker.startY);

            if (dx > 5 || dy > 5 || state.draggingMarker.hasMoved) {
                state.draggingMarker.hasMoved = true;
                
                const coords = getMapPercentCoords(e.clientX, e.clientY);
                const gIdx = state.draggingMarker.groupIndex;
                const pIdx = state.draggingMarker.pointIndex;
                
                // CORRECTION : On applique l'offset pour garder le point sous la souris
                state.groups[gIdx].points[pIdx].x = coords.x + state.draggingMarker.offsetX;
                state.groups[gIdx].points[pIdx].y = coords.y + state.draggingMarker.offsetY;
                
                renderAll(); 
            }
            return; 
        }

        if (state.measuringMode && state.measureStep === 1) {
            const coords = getMapPercentCoords(e.clientX, e.clientY);
            state.measurePoints[1] = coords;
            renderAll(); 
        }

        if (state.drawingMode) return; 

        if (state.isDragging) {
            const dx = e.clientX - state.lastMouse.x;
            const dy = e.clientY - state.lastMouse.y;
            state.view.x += dx;
            state.view.y += dy;
            state.lastMouse = { x: e.clientX, y: e.clientY };
            updateTransform();
        }
    });

    window.addEventListener('mouseup', () => {
        if (state.draggingMarker) {
            if (!state.draggingMarker.hasMoved) {
                handlePointClick(state.draggingMarker.groupIndex, state.draggingMarker.pointIndex);
            }
            state.draggingMarker = null;
            renderAll(); 
        }

        state.isDragging = false;
        if(!state.drawingMode && !state.measuringMode) viewport.style.cursor = 'grab';
    });
}

export function centerMap() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if(!state.mapWidth) return;
    const scale = Math.min(vw / state.mapWidth, vh / state.mapHeight);
    state.view.scale = scale || 0.5;
    state.view.x = (vw - state.mapWidth * state.view.scale) / 2;
    state.view.y = (vh - state.mapHeight * state.view.scale) / 2;
    updateTransform();
}

function updateHUDCoords(e) {
    if(state.mapWidth === 0) return;
    const coords = getMapPercentCoords(e.clientX, e.clientY);
    if(hudCoords) hudCoords.innerText = `COORD: ${coords.x.toFixed(2)} | ${coords.y.toFixed(2)}`;
}