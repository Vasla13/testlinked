import { state } from './state.js';
import { selectItem } from './ui.js';

const markersLayer = document.getElementById('markers-layer');
const zonesLayer = document.getElementById('zones-layer');
const circlesLayer = document.getElementById('circles-layer');

// --- RENDU GLOBAL ---
export function renderAll() {
    renderZones();
    renderMarkers();
}

// --- 1. RENDU DES ZONES (SVG) ---
export function renderZones() {
    zonesLayer.innerHTML = ''; // Clear

    // 1a. Zones existantes
    state.groups.forEach((group, gIndex) => {
        if (!group.visible) return;
        if (!group.zones) return;

        group.zones.forEach((zone, zIndex) => {
            const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            
            // Conversion points [{x,y}, {x,y}] -> "x,y x,y"
            const pointsStr = zone.points.map(p => `${p.x},${p.y}`).join(" ");
            poly.setAttribute("points", pointsStr);
            
            // Style
            poly.setAttribute("fill", group.color);
            poly.setAttribute("stroke", group.color);
            
            // Sélection
            if (state.selectedItem && 
                state.selectedItem.type === 'zone' && 
                state.selectedItem.groupIndex === gIndex && 
                state.selectedItem.itemIndex === zIndex) {
                poly.classList.add("selected");
            }

            // Interaction
            poly.onmousedown = (e) => {
                if (state.drawingMode) return;
                e.stopPropagation();
                selectItem('zone', gIndex, zIndex);
            };

            zonesLayer.appendChild(poly);
        });
    });

    // 1b. Zone en cours de dessin (Aperçu)
    if (state.drawingMode && state.tempPoints.length > 0) {
        const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        const pointsStr = state.tempPoints.map(p => `${p.x},${p.y}`).join(" ");
        poly.setAttribute("points", pointsStr);
        poly.setAttribute("fill", "none");
        poly.setAttribute("stroke", "#ff00ff"); // Couleur temporaire
        poly.setAttribute("stroke-width", "0.5");
        poly.setAttribute("stroke-dasharray", "2");
        zonesLayer.appendChild(poly);
    }
}

// --- 2. RENDU DES MARKERS ---
export function renderMarkers() {
    markersLayer.innerHTML = '';
    circlesLayer.innerHTML = '';

    state.groups.forEach((group, gIndex) => {
        if (!group.visible) return;

        group.points.forEach((point, pIndex) => {
            const el = document.createElement('div');
            el.className = 'marker';
            el.style.left = `${point.x}%`;
            el.style.top = `${point.y}%`;
            el.style.setProperty('--marker-color', group.color);

            const label = document.createElement('div');
            label.className = 'marker-label';
            label.innerText = point.name;
            el.appendChild(label);

            // Check sélection
            const isSelected = (state.selectedItem && 
                state.selectedItem.type === 'point' && 
                state.selectedItem.groupIndex === gIndex && 
                state.selectedItem.itemIndex === pIndex);

            if (isSelected) {
                el.classList.add('selected');
                renderTacticalCircle(point, group.color); // Dessine le cercle si sélectionné
            }

            el.onmousedown = (e) => {
                if(state.drawingMode) return;
                e.stopPropagation();
                selectItem('point', gIndex, pIndex);
            };

            markersLayer.appendChild(el);
        });
    });
}

function renderTacticalCircle(point, color) {
    const circle = document.createElement('div');
    circle.className = 'tactical-circle';
    circle.style.left = `${point.x}%`;
    circle.style.top = `${point.y}%`;
    const size = 150; 
    circle.style.width = `${size}px`;
    circle.style.height = `${size}px`;
    circle.style.setProperty('--circle-color', color);
    circlesLayer.appendChild(circle);
}