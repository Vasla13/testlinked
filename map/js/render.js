// map/js/render.js
import { state } from './state.js';
import { ICONS, MAP_SCALE_UNIT } from './constants.js';
import { handlePointClick, handleLinkClick, handleLinkHover, handleLinkOut, moveTooltip, selectItem } from './ui.js';

const markersLayer = document.getElementById('markers-layer');
const zonesLayer = document.getElementById('zones-layer');
const linksLayer = document.getElementById('links-layer'); 

// Listener global pour le suivi de souris (tooltip)
document.addEventListener('mousemove', moveTooltip);

export function renderAll() {
    renderZones();
    renderTacticalLinks(); 
    renderMarkersAndClusters(); 
    renderMeasureTool(); 
}

// --- RENDU ZONES ---
function renderZones() {
    zonesLayer.innerHTML = '';
    state.groups.forEach((group, gIndex) => {
        if (!group.visible || !group.zones) return;
        group.zones.forEach((zone, zIndex) => {
            const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            poly.setAttribute("points", zone.points.map(p => `${p.x},${p.y}`).join(" "));
            poly.setAttribute("fill", group.color);
            poly.setAttribute("stroke", group.color);
            poly.setAttribute("class", "tactical-zone");
            
            if (state.selectedZone && state.selectedZone.groupIndex === gIndex && state.selectedZone.zoneIndex === zIndex) {
                poly.classList.add("selected");
            }
            
            poly.onmousedown = (e) => {
                if (state.drawingMode || state.measuringMode) return;
                e.stopPropagation();
                selectItem('zone', gIndex, zIndex);
            };
            zonesLayer.appendChild(poly);
        });
    });

    // Tracé temporaire pendant dessin
    if (state.drawingMode && state.tempPoints.length > 0) {
        const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        poly.setAttribute("points", state.tempPoints.map(p => `${p.x},${p.y}`).join(" "));
        poly.setAttribute("fill", "none");
        poly.setAttribute("stroke", "#ff00ff");
        poly.setAttribute("stroke-width", "0.5");
        poly.setAttribute("stroke-dasharray", "2");
        zonesLayer.appendChild(poly);
    }
}

// --- RENDU MARKERS ---
function renderMarkersAndClusters() {
    markersLayer.innerHTML = '';
    let counterScale = 1 / Math.max(state.view.scale, 0.2); // Taille constante

    state.groups.forEach((group, gIndex) => {
        if (!group.visible) return;
        group.points.forEach((point, pIndex) => {
            if (state.statusFilter !== 'ALL' && (point.status || 'ACTIVE') !== state.statusFilter) return;
            
            const el = document.createElement('div');
            el.className = `marker status-${(point.status || 'ACTIVE').toLowerCase()}`;
            el.style.left = `${point.x}%`;
            el.style.top = `${point.y}%`;
            el.style.setProperty('--marker-color', group.color || '#00ffff');

            const svgContent = ICONS[point.iconType] || ICONS.DEFAULT;
            el.innerHTML = `
                <div class="marker-content-wrapper" style="transform: scale(${counterScale})">
                    <div class="marker-icon-box"><svg viewBox="0 0 24 24">${svgContent}</svg></div>
                    <div class="marker-label">${point.name}</div>
                </div>
            `;

            if (state.selectedPoint && state.selectedPoint.groupIndex === gIndex && state.selectedPoint.pointIndex === pIndex) {
                el.classList.add('selected');
            }

            el.onmousedown = (e) => {
                if(state.drawingMode || state.measuringMode) return;
                e.stopPropagation();
                handlePointClick(gIndex, pIndex);
            };
            markersLayer.appendChild(el);
        });
    });
}

// --- RENDU LIENS TACTIQUES ---
function renderTacticalLinks() {
    if(!linksLayer) return;
    linksLayer.innerHTML = ''; 
    linksLayer.style.pointerEvents = 'auto'; 

    if(!state.tacticalLinks) return;

    // Helper rapide pour trouver un point
    const findP = (id) => {
        for (const g of state.groups) {
            const p = g.points.find(x => x.id === id);
            if (p) return p;
        }
        return null;
    };

    state.tacticalLinks.forEach(link => {
        const pFrom = findP(link.from);
        const pTo = findP(link.to);

        if(pFrom && pTo) {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", pFrom.x); line.setAttribute("y1", pFrom.y);
            line.setAttribute("x2", pTo.x); line.setAttribute("y2", pTo.y);
            line.setAttribute("stroke", link.color || "#ffffff");
            line.setAttribute("stroke-width", "0.5");
            line.setAttribute("class", "tactical-link-line");
            line.style.cursor = "pointer";
            
            // Events
            line.onclick = (e) => { e.stopPropagation(); handleLinkClick(e, link); };
            line.onmouseover = (e) => { line.setAttribute("stroke-width", "1.5"); handleLinkHover(e, link); };
            line.onmouseout = (e) => { line.setAttribute("stroke-width", "0.5"); handleLinkOut(); };

            linksLayer.appendChild(line);
        }
    });
}

// --- RENDU OUTIL MESURE ---
function renderMeasureTool() {
    if (state.measurePoints.length === 2) {
        const [p1, p2] = state.measurePoints;
        
        // Ligne
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", p1.x); line.setAttribute("y1", p1.y);
        line.setAttribute("x2", p2.x); line.setAttribute("y2", p2.y);
        line.setAttribute("stroke", "#ff00ff");
        line.setAttribute("stroke-width", "0.6");
        line.setAttribute("stroke-dasharray", "4");
        line.style.pointerEvents = "none";
        linksLayer.appendChild(line);

        // Label Distance
        const existingLabel = document.getElementById('measure-label');
        if(existingLabel) existingLabel.remove();

        const distPercent = Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2);
        const distKm = (distPercent * (MAP_SCALE_UNIT / 1000)).toFixed(2); 

        const label = document.createElement('div');
        label.id = 'measure-label';
        label.className = 'measure-tag';
        label.innerText = `${distKm} km`;
        label.style.left = `${(p1.x + p2.x)/2}%`;
        label.style.top = `${(p1.y + p2.y)/2}%`;
        
        let counterScale = 1 / Math.max(state.view.scale, 0.2);
        label.style.transform = `translate(-50%, -50%) scale(${counterScale})`;
        
        markersLayer.appendChild(label);
    } else {
        const existingLabel = document.getElementById('measure-label');
        if(existingLabel) existingLabel.remove();
    }
}

export function getMapPercentCoords(clientX, clientY) {
    const mapWorld = document.getElementById('map-world');
    const rect = mapWorld.getBoundingClientRect(); 
    return {
        x: ((clientX - rect.left) / rect.width) * 100,
        y: ((clientY - rect.top) / rect.height) * 100
    };
}