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

// --- 1. ZONES ---
export function renderZones() {
    zonesLayer.innerHTML = '';
    state.groups.forEach((group, gIndex) => {
        if (!group.visible) return;
        if (!group.zones) return;
        group.zones.forEach((zone, zIndex) => {
            const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            const pointsStr = zone.points.map(p => `${p.x},${p.y}`).join(" ");
            poly.setAttribute("points", pointsStr);
            poly.setAttribute("fill", group.color);
            poly.setAttribute("stroke", group.color);
            
            if (state.selectedZone && state.selectedZone.groupIndex === gIndex && state.selectedZone.zoneIndex === zIndex) {
                poly.classList.add("selected");
            }
            poly.onmousedown = (e) => {
                if (state.drawingMode || state.measuringMode || state.linkingMode) return;
                e.stopPropagation();
                selectItem('zone', gIndex, zIndex);
            };
            zonesLayer.appendChild(poly);
        });
    });
    // Dessin en cours
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

// --- 2. MARKERS & CLUSTERING ---
export function renderMarkersAndClusters() {
    markersLayer.innerHTML = '';
    
    const isZoomedOut = state.view.scale < 0.6; 
    const CLUSTER_THRESHOLD = 5; 
    
    const visiblePoints = [];

    state.groups.forEach((group, gIndex) => {
        if (!group.visible) return;
        group.points.forEach((point, pIndex) => {
            const status = point.status || 'ACTIVE';
            if (state.statusFilter !== 'ALL' && status !== state.statusFilter) return;
            visiblePoints.push({ ...point, gIndex, pIndex, color: group.color });
        });
    });

    if (isZoomedOut) {
        const processed = new Set();
        const clusters = [];
        visiblePoints.forEach((p, i) => {
            if (processed.has(i)) return;
            const cluster = { x: p.x, y: p.y, points: [p], color: p.color };
            processed.add(i);
            visiblePoints.forEach((other, j) => {
                if (i === j || processed.has(j)) return;
                const dist = Math.sqrt((p.x - other.x)**2 + (p.y - other.y)**2);
                if (dist < CLUSTER_THRESHOLD) {
                    cluster.points.push(other);
                    processed.add(j);
                }
            });
            clusters.push(cluster);
        });
        clusters.forEach(c => {
            if (c.points.length === 1) renderSingleMarker(c.points[0]);
            else renderClusterMarker(c);
        });
    } else {
        visiblePoints.forEach(p => renderSingleMarker(p));
    }
}

function renderSingleMarker(point) {
    const el = document.createElement('div');
    const status = point.status || 'ACTIVE';
    el.className = `marker status-${status.toLowerCase()}`;
    el.style.left = `${point.x}%`;
    el.style.top = `${point.y}%`;
    el.style.setProperty('--marker-color', point.color);

    const iconType = point.iconType || 'DEFAULT';
    const svgContent = ICONS[iconType] || ICONS.DEFAULT;
    
    // CORRECTION : Encapsulation dans <svg> pour un centrage parfait
    el.innerHTML = `
        <div class="marker-icon-wrapper">
            <svg viewBox="0 0 24 24" width="100%" height="100%">${svgContent}</svg>
        </div>
        <div class="marker-label">${point.name}</div>
    `;

    const isSelected = (state.selectedPoint && 
        state.selectedPoint.groupIndex === point.gIndex && 
        state.selectedPoint.pointIndex === point.pIndex);

    if (isSelected) el.classList.add('selected');

    el.onmousedown = (e) => {
        if(state.drawingMode || state.measuringMode) return;
        e.stopPropagation();
        selectItem('point', point.gIndex, point.pIndex);
    };

    markersLayer.appendChild(el);
}

function renderClusterMarker(cluster) {
    const el = document.createElement('div');
    el.className = 'marker cluster';
    el.style.left = `${cluster.x}%`;
    el.style.top = `${cluster.y}%`;
    el.style.setProperty('--marker-color', cluster.color);

    el.innerHTML = `<div class="cluster-count">${cluster.points.length}</div>`;

    el.onmousedown = (e) => {
        e.stopPropagation();
        state.view.x = -cluster.x * (state.view.scale * 2.5) + (window.innerWidth/2);
        state.view.y = -cluster.y * (state.view.scale * 2.5) + (window.innerHeight/2);
        state.view.scale *= 2.5;
        import('./engine.js').then(mod => mod.updateTransform());
        renderAll();
    };

    markersLayer.appendChild(el);
}

// --- 3. LIENS TACTIQUES ---
export function renderTacticalLinks() {
    linksLayer.innerHTML = ''; 

    if(state.tacticalLinks) {
        state.tacticalLinks.forEach(link => {
            const gFrom = state.groups[link.from.g];
            const gTo = state.groups[link.to.g];
            if(!gFrom || !gTo || !gFrom.visible || !gTo.visible) return;

            const pFrom = gFrom.points[link.from.p];
            const pTo = gTo.points[link.to.p];

            if(pFrom && pTo) {
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("x1", pFrom.x);
                line.setAttribute("y1", pFrom.y);
                line.setAttribute("x2", pTo.x);
                line.setAttribute("y2", pTo.y);
                line.setAttribute("stroke", link.color || "#ffffff");
                line.setAttribute("stroke-width", "0.3");
                line.setAttribute("stroke-dasharray", "1, 1");
                line.setAttribute("class", "tactical-link");
                line.setAttribute("marker-end", "url(#arrowhead)");
                linksLayer.appendChild(line);
            }
        });
    }

    if (state.measurePoints.length === 2) {
        const p1 = state.measurePoints[0];
        const p2 = state.measurePoints[1];
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", p1.x); line.setAttribute("y1", p1.y);
        line.setAttribute("x2", p2.x); line.setAttribute("y2", p2.y);
        line.setAttribute("stroke", "#ff00ff");
        line.setAttribute("stroke-width", "0.5");
        linksLayer.appendChild(line);
    }
}

// --- 4. OUTIL RÈGLE ---
export function renderMeasureTool() {
    const existingLabel = document.getElementById('measure-label');
    if(existingLabel) existingLabel.remove();

    if (state.measurePoints.length === 2) {
        const p1 = state.measurePoints[0];
        const p2 = state.measurePoints[1];
        const distPercent = Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2);
        const distKm = (distPercent * (MAP_SCALE_UNIT / 1000)).toFixed(2); 

        const label = document.createElement('div');
        label.id = 'measure-label';
        label.className = 'measure-tag';
        label.innerText = `${distKm} km`;
        label.style.left = `${(p1.x + p2.x)/2}%`;
        label.style.top = `${(p1.y + p2.y)/2}%`;
        markersLayer.appendChild(label);
    }
}

// --- CORRECTION MAJEURE : CALCUL PRÉCIS DES COORDONNÉES ---
export function getMapPercentCoords(clientX, clientY) {
    const mapWorld = document.getElementById('map-world');
    // On utilise la taille VISIBLE actuelle (incluant le zoom CSS)
    const rect = mapWorld.getBoundingClientRect(); 
    
    // Position du clic relative au coin haut-gauche de l'image
    const xPixel = clientX - rect.left;
    const yPixel = clientY - rect.top;

    // Conversion simple : (Position / Taille Totale) * 100
    // Cette méthode marche quel que soit le zoom ou la translation
    return {
        x: (xPixel / rect.width) * 100,
        y: (yPixel / rect.height) * 100
    };
}