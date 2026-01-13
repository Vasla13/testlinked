import { state } from './state.js';
import { selectItem } from './ui.js';
import { ICONS, MAP_SCALE_UNIT } from './constants.js';

const markersLayer = document.getElementById('markers-layer');
const zonesLayer = document.getElementById('zones-layer');
const linksLayer = document.getElementById('links-layer'); 

export function renderAll() {
    renderZones();
    renderTacticalLinks(); 
    renderMarkersAndClusters(); 
    renderMeasureTool(); 
}

export function renderZones() {
    zonesLayer.innerHTML = '';
    state.groups.forEach((group, gIndex) => {
        if (!group.visible || !group.zones) return;
        group.zones.forEach((zone, zIndex) => {
            const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            const pointsStr = zone.points.map(p => `${p.x},${p.y}`).join(" ");
            poly.setAttribute("points", pointsStr);
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
    if (state.drawingMode && state.tempPoints.length > 0) {
        const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        const pointsStr = state.tempPoints.map(p => `${p.x},${p.y}`).join(" ");
        poly.setAttribute("points", pointsStr);
        poly.setAttribute("fill", "none");
        poly.setAttribute("stroke", "#ff00ff");
        poly.setAttribute("stroke-width", "0.5");
        poly.setAttribute("stroke-dasharray", "2");
        zonesLayer.appendChild(poly);
    }
}

// Rendu des marqueurs
export function renderMarkersAndClusters() {
    markersLayer.innerHTML = '';
    
    // Contre-échelle pour garder la taille constante lors du zoom
    let counterScale = 1 / Math.max(state.view.scale, 0.2);

    state.groups.forEach((group, gIndex) => {
        if (!group.visible) return;
        group.points.forEach((point, pIndex) => {
            if (state.statusFilter !== 'ALL' && (point.status || 'ACTIVE') !== state.statusFilter) return;
            // Passe la couleur du groupe par défaut si pas de couleur specifique
            renderSingleMarker(point, gIndex, pIndex, group.color, counterScale);
        });
    });
}

function renderSingleMarker(point, gIndex, pIndex, color, scaleFactor) {
    const el = document.createElement('div');
    const status = point.status || 'ACTIVE';
    el.className = `marker status-${status.toLowerCase()}`;
    el.style.left = `${point.x}%`;
    el.style.top = `${point.y}%`;
    
    // IMPORTANT: On utilise la couleur du groupe (par exemple le cyan par défaut)
    el.style.setProperty('--marker-color', color || '#00ffff');

    // LOGIQUE LOGO PAR DÉFAUT
    const iconType = point.iconType || 'DEFAULT';
    const svgContent = ICONS[iconType] || ICONS.DEFAULT;
    
    el.innerHTML = `
        <div class="marker-content-wrapper" style="transform: scale(${scaleFactor})">
            <div class="marker-icon-box">
                <svg viewBox="0 0 24 24">${svgContent}</svg>
            </div>
            <div class="marker-label">${point.name}</div>
        </div>
    `;

    const isSelected = (state.selectedPoint && state.selectedPoint.groupIndex === gIndex && state.selectedPoint.pointIndex === pIndex);
    if (isSelected) el.classList.add('selected');

    el.onmousedown = (e) => {
        if(state.drawingMode || state.measuringMode) return;
        e.stopPropagation();
        selectItem('point', gIndex, pIndex);
    };

    markersLayer.appendChild(el);
}

export function renderTacticalLinks() {
    if(!linksLayer) return;
    linksLayer.innerHTML = ''; 
    if(state.tacticalLinks) {
        state.tacticalLinks.forEach(link => {
            const gFrom = state.groups[link.from.g];
            const gTo = state.groups[link.to.g];
            if(gFrom && gTo && gFrom.visible && gTo.visible) {
                const pFrom = gFrom.points[link.from.p];
                const pTo = gTo.points[link.to.p];
                if(pFrom && pTo) {
                    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                    line.setAttribute("x1", pFrom.x); line.setAttribute("y1", pFrom.y);
                    line.setAttribute("x2", pTo.x); line.setAttribute("y2", pTo.y);
                    line.setAttribute("stroke", link.color || "#ffffff");
                    line.setAttribute("stroke-width", "0.4");
                    line.setAttribute("class", "tactical-link-line");
                    linksLayer.appendChild(line);
                }
            }
        });
    }
    renderMeasureTool();
}

export function renderMeasureTool() {
    if (state.measurePoints.length === 2) {
        const p1 = state.measurePoints[0];
        const p2 = state.measurePoints[1];
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", p1.x); line.setAttribute("y1", p1.y);
        line.setAttribute("x2", p2.x); line.setAttribute("y2", p2.y);
        line.setAttribute("stroke", "#ff00ff");
        line.setAttribute("stroke-width", "0.6");
        line.setAttribute("stroke-dasharray", "4");
        linksLayer.appendChild(line);

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