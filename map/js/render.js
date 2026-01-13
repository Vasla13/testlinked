import { state, findPointById } from './state.js';
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

// --- ZONES ---
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

// --- MARKERS (Avec correction de taille de texte) ---
export function renderMarkersAndClusters() {
    markersLayer.innerHTML = '';
    
    // Seuil de clustering très bas pour voir les points individuels de loin
    const isZoomedOut = state.view.scale < 0.15; 
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
        // Logique Clustering
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

    // === CORRECTION MAJEURE ICI ===
    // On calcule l'inverse du zoom. Si le zoom est petit (ex: 0.5), l'échelle du texte double (2.0)
    // On limite à 0.2 pour éviter des textes gigantesques si on dézoome à l'infini.
    const labelScale = 1 / Math.max(state.view.scale, 0.2); 

    el.innerHTML = `
        <div class="marker-icon-wrapper">
            <svg viewBox="0 0 24 24" width="100%" height="100%">${svgContent}</svg>
        </div>
        <div class="marker-label" style="transform: translateX(-50%) scale(${labelScale}); transform-origin: bottom center; bottom: 26px;">
            ${point.name}
        </div>
    `;

    if (state.selectedPoint && 
        state.selectedPoint.groupIndex === point.gIndex && 
        state.selectedPoint.pointIndex === point.pIndex) {
        el.classList.add('selected');
    }

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
    
    // On garde aussi les clusters visibles de loin
    const clusterScale = 1 / Math.max(state.view.scale, 0.3);
    el.style.transform = `translate(-50%, -50%) scale(${clusterScale})`;

    el.innerHTML = `<div class="cluster-count">${cluster.points.length}</div>`;
    
    el.onmousedown = (e) => {
        e.stopPropagation();
        // Zoom sur le cluster
        state.view.x = -cluster.x * (state.view.scale * 2.5) + (window.innerWidth/2);
        state.view.y = -cluster.y * (state.view.scale * 2.5) + (window.innerHeight/2);
        state.view.scale *= 2.5;
        import('./engine.js').then(mod => mod.updateTransform());
        renderAll();
    };
    markersLayer.appendChild(el);
}

// --- LIENS & OUTILS ---
export function renderTacticalLinks() {
    linksLayer.innerHTML = ''; 
    if(!state.tacticalLinks) return;

    state.tacticalLinks.forEach(link => {
        const pFrom = findPointById(link.from);
        const pTo = findPointById(link.to);

        if(pFrom && pTo) {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", pFrom.x);
            line.setAttribute("y1", pFrom.y);
            line.setAttribute("x2", pTo.x);
            line.setAttribute("y2", pTo.y);
            line.setAttribute("stroke", link.color || "#ffffff");
            
            // On garde les lignes fines mais visibles
            const strokeWidth = 0.3 / Math.max(state.view.scale, 0.1);
            line.setAttribute("stroke-width", strokeWidth);
            line.setAttribute("stroke-dasharray", `${1/state.view.scale}, ${1/state.view.scale}`);
            
            line.setAttribute("class", "tactical-link");
            linksLayer.appendChild(line);
        }
    });

    if (state.measurePoints.length === 2) {
        const p1 = state.measurePoints[0];
        const p2 = state.measurePoints[1];
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", p1.x); line.setAttribute("y1", p1.y);
        line.setAttribute("x2", p2.x); line.setAttribute("y2", p2.y);
        line.setAttribute("stroke", "#ff00ff");
        line.setAttribute("stroke-width", 0.5 / state.view.scale); // Scale fix
        linksLayer.appendChild(line);
    }
}

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
        
        // Le label de mesure reste aussi lisible
        const labelScale = 1 / Math.max(state.view.scale, 0.2);
        label.style.transform = `translate(-50%, -50%) scale(${labelScale})`;
        
        markersLayer.appendChild(label);
    }
}

export function getMapPercentCoords(clientX, clientY) {
    const mapWorld = document.getElementById('map-world');
    const rect = mapWorld.getBoundingClientRect(); 
    const xPixel = clientX - rect.left;
    const yPixel = clientY - rect.top;
    return {
        x: (xPixel / rect.width) * 100,
        y: (yPixel / rect.height) * 100
    };
}