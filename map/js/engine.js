import { state } from './state.js';
import { startDrawingZone, handleDrawingClick } from './zone-editor.js';

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
        const zoomSpeed = 0.1;
        const delta = e.deltaY > 0 ? -1 : 1;
        const newScale = state.view.scale * (1 + delta * zoomSpeed);
        if (newScale < 0.05 || newScale > 8) return;

        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        state.view.x = mouseX - (mouseX - state.view.x) * (newScale / state.view.scale);
        state.view.y = mouseY - (mouseY - state.view.y) * (newScale / state.view.scale);
        state.view.scale = newScale;
        updateTransform();
    });

    // PAN & CLICK
    viewport.addEventListener('mousedown', (e) => {
        if (state.drawingMode) {
            handleDrawingClick(e);
            return;
        }
        if(e.button === 0) { // Gauche
            state.isDragging = true;
            state.lastMouse = { x: e.clientX, y: e.clientY };
            viewport.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => {
        updateHUDCoords(e);
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
        if(!state.drawingMode) viewport.style.cursor = 'grab';
    });

    // CLIC DROIT -> Création rapide
    viewport.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if(state.drawingMode) {
            handleDrawingClick(e); // Fin du dessin
            return;
        }
        
        // Création point rapide
        const coords = getMapPercentCoords(e.clientX, e.clientY);
        if(state.groups.length > 0) {
            // Ajoute au premier groupe visible
            const targetGroup = state.groups.find(g => g.visible) || state.groups[0];
            const newPoint = { 
                name: "Nouv. Position", 
                x: coords.x, 
                y: coords.y, 
                type: "point" 
            };
            targetGroup.points.push(newPoint);
            
            // On importe selectItem dynamiquement pour éviter cycle au chargement si besoin, 
            // ou on suppose que ui.js est chargé.
            // Pour faire simple, on re-rend tout via un dispatch ou appel direct si possible.
            // Ici on va laisser l'utilisateur cliquer sur le point créé, ou re-render.
            
            // Import dynamique pour éviter cycle engine <-> ui
            import('./render.js').then(m => m.renderAll());
            import('./ui.js').then(m => {
                m.renderGroupsList();
                // Auto-select le nouveau point
                // m.selectItem('point', state.groups.indexOf(targetGroup), targetGroup.points.length - 1);
            });
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

export function getMapPercentCoords(clientX, clientY) {
    const rect = mapWorld.getBoundingClientRect(); 
    const relX = (clientX - rect.left);
    const relY = (clientY - rect.top);
    const originalX = relX / state.view.scale;
    const originalY = relY / state.view.scale;
    return {
        x: (originalX / state.mapWidth) * 100,
        y: (originalY / state.mapHeight) * 100
    };
}

function updateHUDCoords(e) {
    if(state.mapWidth === 0) return;
    const coords = getMapPercentCoords(e.clientX, e.clientY);
    hudCoords.innerText = `COORD: ${coords.x.toFixed(2)} | ${coords.y.toFixed(2)}`;
}