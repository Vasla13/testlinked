import { state } from './state.js';
import { renderEditor, closeEditor } from './ui.js';

const viewport = document.getElementById('viewport');
const mapWorld = document.getElementById('map-world');
const mapImage = document.getElementById('map-image');
const markersLayer = document.getElementById('markers-layer');
const hudCoords = document.getElementById('coords-display');

// Applique le zoom/panoramique CSS
export function updateTransform() {
    mapWorld.style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.scale})`;
}

// Génère les points DOM
export function renderMarkers() {
    markersLayer.innerHTML = ''; // Nettoyage

    state.groups.forEach((group, gIndex) => {
        // IMPORTANT : Si le groupe est masqué, on ne dessine pas
        if (!group.visible) return;

        group.points.forEach((point, pIndex) => {
            const el = document.createElement('div');
            el.className = 'marker';
            
            // CORRECTION: Utilisation directe des % du JSON
            el.style.left = `${point.x}%`;
            el.style.top = `${point.y}%`;
            
            // Variable CSS pour la couleur (pour le glow)
            el.style.setProperty('--marker-color', group.color);

            // Label interne
            const label = document.createElement('div');
            label.className = 'marker-label';
            label.innerText = point.name;
            el.appendChild(label);

            // État sélectionné
            if (state.selectedPoint && 
                state.selectedPoint.groupIndex === gIndex && 
                state.selectedPoint.pointIndex === pIndex) {
                el.classList.add('selected');
            }

            // Clic sur le point
            el.onmousedown = (e) => {
                e.stopPropagation(); // Évite de drag la map
                selectPoint(gIndex, pIndex);
            };

            markersLayer.appendChild(el);
        });
    });
}

export function selectPoint(gIndex, pIndex) {
    state.selectedPoint = { groupIndex: gIndex, pointIndex: pIndex };
    renderMarkers(); // Met à jour la classe .selected
    renderEditor();  // Ouvre le panneau droite
}

export function deselect() {
    state.selectedPoint = null;
    renderMarkers();
    closeEditor();
}

// Initialisation des événements souris (Zoom/Pan)
export function initEngine() {
    // Une fois l'image chargée, on initialise le centrage
    mapImage.onload = () => {
        state.mapWidth = mapImage.naturalWidth;
        state.mapHeight = mapImage.naturalHeight;
        centerMap();
    };
    // Si l'image est déjà en cache
    if(mapImage.complete) {
        state.mapWidth = mapImage.naturalWidth;
        state.mapHeight = mapImage.naturalHeight;
        centerMap();
    }

    // ZOOM (Molette)
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSpeed = 0.1;
        const delta = e.deltaY > 0 ? -1 : 1;
        const newScale = state.view.scale * (1 + delta * zoomSpeed);

        // Limites min/max
        if (newScale < 0.1 || newScale > 8) return;

        // Zoom vers le curseur
        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calcul mathématique pour que le point sous la souris reste fixe
        state.view.x = mouseX - (mouseX - state.view.x) * (newScale / state.view.scale);
        state.view.y = mouseY - (mouseY - state.view.y) * (newScale / state.view.scale);
        state.view.scale = newScale;

        updateTransform();
    });

    // PAN (Drag)
    viewport.addEventListener('mousedown', (e) => {
        if(e.button !== 0) return; // Clic gauche uniquement
        state.isDragging = true;
        state.lastMouse = { x: e.clientX, y: e.clientY };
        viewport.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        // Mise à jour coordonnées HUD
        updateHUDCoords(e);

        if (!state.isDragging) return;
        const dx = e.clientX - state.lastMouse.x;
        const dy = e.clientY - state.lastMouse.y;
        state.view.x += dx;
        state.view.y += dy;
        state.lastMouse = { x: e.clientX, y: e.clientY };
        updateTransform();
    });

    window.addEventListener('mouseup', () => {
        state.isDragging = false;
        viewport.style.cursor = 'grab';
    });

    // CLIC DROIT (Ajout rapide)
    viewport.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const coords = getMapPercentCoords(e.clientX, e.clientY);
        
        // On ajoute au premier groupe visible par défaut
        if(state.groups.length > 0) {
            const newPoint = { 
                name: "Nouvelle Position", 
                x: coords.x, 
                y: coords.y, 
                type: "point" 
            };
            state.groups[0].points.push(newPoint);
            // On sélectionne le nouveau point
            selectPoint(0, state.groups[0].points.length - 1);
        }
    });
}

// Recentre la carte
export function centerMap() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    // Fit to screen
    const scale = Math.min(vw / state.mapWidth, vh / state.mapHeight);
    state.view.scale = scale || 0.5;
    state.view.x = (vw - state.mapWidth * state.view.scale) / 2;
    state.view.y = (vh - state.mapHeight * state.view.scale) / 2;
    updateTransform();
}

// Convertit la position souris écran en % carte
function getMapPercentCoords(clientX, clientY) {
    const rect = mapWorld.getBoundingClientRect(); // Position actuelle de la map transformée
    // Position relative au coin haut-gauche de la map
    const relX = (clientX - rect.left);
    const relY = (clientY - rect.top);
    
    // On divise par l'échelle pour avoir la coordonnée "réelle" en px sur l'image originale
    const originalX = relX / state.view.scale;
    const originalY = relY / state.view.scale;

    // Conversion en pourcentage
    return {
        x: (originalX / state.mapWidth) * 100,
        y: (originalY / state.mapHeight) * 100
    };
}

function updateHUDCoords(e) {
    if(state.mapWidth === 0) return;
    const coords = getMapPercentCoords(e.clientX, e.clientY);
    hudCoords.innerText = `X: ${coords.x.toFixed(2)} | Y: ${coords.y.toFixed(2)}`;
}