import { state } from './state.js';
// Importe la fonction helper depuis render.js
import { renderAll, getMapPercentCoords } from './render.js';
import { handleDrawingClick } from './zone-editor.js';

const viewport = document.getElementById('viewport');
const mapWorld = document.getElementById('map-world');
const mapImage = document.getElementById('map-image');
const hudCoords = document.getElementById('coords-display');

export function updateTransform() {
    mapWorld.style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.scale})`;
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

    // ZOOM
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
        
        renderAll(); // Re-calcul clustering
        updateTransform();
    });

    // SOURIS (Draw, Measure, Pan)
    viewport.addEventListener('mousedown', (e) => {
        // Priorité 1: Dessin de zone
        if (state.drawingMode) { 
            handleDrawingClick(e); 
            return; 
        }
        
        // Priorité 2: Outil de Mesure
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

        // Priorité 3: Pan (Déplacement carte)
        if(e.button === 0) {
            state.isDragging = true;
            state.lastMouse = { x: e.clientX, y: e.clientY };
            viewport.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => {
        updateHUDCoords(e);
        
        // Update visuel ligne de mesure
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
        state.isDragging = false;
        if(!state.drawingMode && !state.measuringMode) viewport.style.cursor = 'grab';
    });

    // CLIC DROIT (Context Menu / Création rapide)
    viewport.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // Si on dessine ou mesure, le clic droit annule ou finit, géré ailleurs ou ignoré ici
        if(state.drawingMode) { handleDrawingClick(e); return; }
        if(state.measuringMode) { 
            // Annuler la mesure
            state.measuringMode = false; 
            state.measurePoints = [];
            renderAll();
            document.body.style.cursor = 'default';
            // Update UI button state via DOM hack ou re-render UI
            const btn = document.getElementById('btnMeasure');
            if(btn) btn.classList.remove('active');
            return;
        }
        
        // Création rapide d'un point
        const coords = getMapPercentCoords(e.clientX, e.clientY);
        if(state.groups.length > 0) {
            // Ajoute au premier groupe visible
            const targetGroup = state.groups.find(g => g.visible) || state.groups[0];
            targetGroup.points.push({ name: "Nouv. Point", x: coords.x, y: coords.y, iconType: "DEFAULT" });
            
            // Recharger la liste et la carte
            import('./ui.js').then(ui => ui.renderGroupsList());
            renderAll();
        }
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
    hudCoords.innerText = `COORD: ${coords.x.toFixed(2)} | ${coords.y.toFixed(2)}`;
}