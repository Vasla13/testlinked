import { state } from './state.js';
import { ICONS, MAP_SCALE_UNIT } from './constants.js';
import { handleLinkClick, handleLinkHover, handleLinkOut, moveTooltip, selectItem } from './ui.js';
import { startMarkerDrag } from './engine.js'; 
import { handleZoneMouseDown } from './zone-editor.js';

const markersLayer = document.getElementById('markers-layer');
const zonesLayer = document.getElementById('zones-layer');
const linksLayer = document.getElementById('links-layer'); 

document.addEventListener('mousemove', moveTooltip);

function configureSVG(layer) {
    if (layer) {
        layer.setAttribute("viewBox", "0 0 100 100");
        layer.setAttribute("preserveAspectRatio", "none");
        layer.style.pointerEvents = 'none'; 
        layer.style.width = '100%';
        layer.style.height = '100%';
    }
}

export function renderAll() {
    configureSVG(zonesLayer);
    configureSVG(linksLayer);

    renderZones();
    renderTacticalLinks(); 
    renderMarkersAndClusters(); 
    renderMeasureTool(); 
}

function renderZones() {
    zonesLayer.innerHTML = '';
    
    state.groups.forEach((group, gIndex) => {
        if (!group.visible || !group.zones) return;
        
        group.zones.forEach((zone, zIndex) => {
            let el;
            const isSelected = (state.selectedZone && state.selectedZone.groupIndex === gIndex && state.selectedZone.zoneIndex === zIndex);
            
            if (zone.type === 'CIRCLE') {
                el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                el.setAttribute("cx", zone.cx);
                el.setAttribute("cy", zone.cy);
                el.setAttribute("r", zone.r);
            } else {
                el = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
                const pointsStr = zone.points.map(p => `${p.x},${p.y}`).join(" ");
                el.setAttribute("points", pointsStr);
            }

            let strokeWidth = "0.08"; 
            if (zone.style && zone.style.width) {
                strokeWidth = (zone.style.width * 0.05).toString();
            }
            if (isSelected) strokeWidth = (parseFloat(strokeWidth) * 1.5).toString();

            el.setAttribute("fill", group.color);
            el.setAttribute("stroke", isSelected ? "#fff" : group.color);
            el.setAttribute("stroke-width", strokeWidth);
            
            if (zone.style) {
                if (zone.style.style === 'dashed') el.setAttribute("stroke-dasharray", "0.5, 0.5");
                if (zone.style.style === 'dotted') el.setAttribute("stroke-dasharray", "0.1, 0.3");
            }

            el.setAttribute("fill-opacity", isSelected ? "0.3" : "0.15");
            el.setAttribute("class", "tactical-zone");
            el.style.pointerEvents = 'auto'; 
            el.style.cursor = 'pointer';

            if (isSelected) el.classList.add("selected");

            el.onmousedown = (e) => {
                if (state.drawingMode || state.measuringMode) return;
                if (e.button === 2) return; 
                e.stopPropagation(); 
                selectItem('zone', gIndex, zIndex);
                handleZoneMouseDown(e, gIndex, zIndex);
            };

            zonesLayer.appendChild(el);
        });
    });

    // Dessin en cours
    if (state.drawingMode) {
        let draftWidth = (state.drawOptions.width * 0.05).toString();
        let draftDash = "";
        if (state.drawOptions.style === 'dashed') draftDash = "0.5, 0.5";
        if (state.drawOptions.style === 'dotted') draftDash = "0.1, 0.3";

        if (state.tempZone && state.drawingType === 'CIRCLE') {
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", state.tempZone.cx);
            circle.setAttribute("cy", state.tempZone.cy);
            circle.setAttribute("r", state.tempZone.r);
            circle.setAttribute("fill", "none");
            circle.setAttribute("stroke", "#00ff00");
            circle.setAttribute("stroke-width", draftWidth);
            circle.setAttribute("stroke-dasharray", draftDash);
            zonesLayer.appendChild(circle);
        } else if (state.tempPoints.length > 0) {
            const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
            poly.setAttribute("points", state.tempPoints.map(p => `${p.x},${p.y}`).join(" "));
            poly.setAttribute("fill", "none");
            poly.setAttribute("stroke", state.drawingPending ? "#00ff00" : "#ff00ff");
            poly.setAttribute("stroke-width", draftWidth);
            if(draftDash) poly.setAttribute("stroke-dasharray", draftDash);
            zonesLayer.appendChild(poly);
        }
    }
}

function renderTacticalLinks() {
    if(!linksLayer) return;
    linksLayer.innerHTML = ''; 
    linksLayer.style.pointerEvents = 'none'; 

    if(!state.tacticalLinks) return;

    let defs = linksLayer.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        linksLayer.appendChild(defs);
    } else {
        defs.innerHTML = ''; 
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        marker.setAttribute("id", "arrowhead");
        marker.setAttribute("markerWidth", "10"); marker.setAttribute("markerHeight", "7");
        marker.setAttribute("refX", "9"); marker.setAttribute("refY", "3.5");
        marker.setAttribute("orient", "auto");
        const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        polygon.setAttribute("points", "0 0, 10 3.5, 0 7");
        polygon.setAttribute("fill", "#ffffff");
        marker.appendChild(polygon);
        defs.appendChild(marker);
    }

    const findPointInfo = (id) => {
        for (const g of state.groups) {
            const p = g.points.find(x => x.id === id);
            if (p) return { point: p, color: g.color || '#ffffff' };
        }
        return null;
    };

    state.tacticalLinks.forEach(link => {
        const fromInfo = findPointInfo(link.from);
        const toInfo = findPointInfo(link.to);
        
        if(fromInfo && toInfo) {
            const pFrom = fromInfo.point;
            const pTo = toInfo.point;
            const cFrom = fromInfo.color;
            const cTo = toInfo.color;

            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", pFrom.x); line.setAttribute("y1", pFrom.y);
            line.setAttribute("x2", pTo.x); line.setAttribute("y2", pTo.y);
            
            let finalColor = link.color;
            if (!finalColor || finalColor === '#ffffff') {
                if (cFrom === cTo) {
                    finalColor = cFrom;
                } else {
                    const gradId = `grad_${link.id}`;
                    const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
                    grad.setAttribute("id", gradId);
                    grad.setAttribute("gradientUnits", "userSpaceOnUse");
                    grad.setAttribute("x1", pFrom.x); grad.setAttribute("y1", pFrom.y);
                    grad.setAttribute("x2", pTo.x); grad.setAttribute("y2", pTo.y);
                    
                    const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
                    stop1.setAttribute("offset", "0%"); stop1.setAttribute("stop-color", cFrom);
                    
                    const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
                    stop2.setAttribute("offset", "100%"); stop2.setAttribute("stop-color", cTo);
                    
                    grad.appendChild(stop1);
                    grad.appendChild(stop2);
                    defs.appendChild(grad);
                    
                    finalColor = `url(#${gradId})`;
                }
            }

            line.setAttribute("stroke", finalColor);
            line.setAttribute("stroke-width", "0.15");
            line.setAttribute("class", "tactical-link-line");
            line.style.pointerEvents = 'visibleStroke'; 
            line.style.cursor = 'pointer';
            
            line.onclick = (e) => { e.stopPropagation(); handleLinkClick(e, link); };
            line.onmouseover = (e) => { line.setAttribute("stroke-width", "0.4"); handleLinkHover(e, link); };
            line.onmouseout = (e) => { line.setAttribute("stroke-width", "0.15"); handleLinkOut(); };
            linksLayer.appendChild(line);
        }
    });
}

// --- RENDU DES MARQUEURS (MODIFIÉ POUR IMAGES) ---
function renderMarkersAndClusters() {
    markersLayer.innerHTML = '';

    state.groups.forEach((group, gIndex) => {
        if (!group.visible) return;
        group.points.forEach((point, pIndex) => {
            if (state.statusFilter !== 'ALL' && (point.status || 'ACTIVE') !== state.statusFilter) return;
            
            const el = document.createElement('div');
            el.className = `marker status-${(point.status || 'ACTIVE').toLowerCase()}`;
            el.style.left = `${point.x}%`;
            el.style.top = `${point.y}%`;
            el.style.setProperty('--marker-color', group.color || '#00ffff');
            el.style.pointerEvents = 'auto'; 

            if (state.selectedPoint && state.selectedPoint.groupIndex === gIndex && state.selectedPoint.pointIndex === pIndex) {
                el.classList.add('selected');
            }
            if (state.draggingMarker && state.draggingMarker.groupIndex === gIndex && state.draggingMarker.pointIndex === pIndex) {
                el.classList.add('is-dragging');
            }

            const iconData = ICONS[point.iconType] || ICONS.DEFAULT;
            
            // --- DETECTION : URL ou SVG ? ---
            let innerContent = '';
            
            // Si ça commence par http (lien) ou data: (image encodée) ou ./ (local)
            if (iconData.startsWith('http') || iconData.startsWith('data:') || iconData.startsWith('./') || iconData.startsWith('/')) {
                // C'est une IMAGE
                innerContent = `
                    <div class="marker-icon-box">
                        <img src="${iconData}" alt="icon" style="width:20px; height:20px; object-fit:contain; filter: drop-shadow(0 0 2px var(--marker-color));">
                    </div>`;
            } else {
                // C'est du SVG (Code HTML)
                innerContent = `
                    <div class="marker-icon-box">
                        <svg viewBox="0 0 24 24">${iconData}</svg>
                    </div>`;
            }

            el.innerHTML = `
                <div class="marker-content-wrapper">
                    ${innerContent}
                    <div class="marker-label">${point.name}</div>
                </div>
            `;

            el.onmousedown = (e) => {
                if(state.drawingMode || state.measuringMode) return;
                if(e.button === 2) return; 
                e.stopPropagation(); 
                startMarkerDrag(e, gIndex, pIndex);
            };

            markersLayer.appendChild(el);
        });
    });
}

function renderMeasureTool() {
    if (state.measurePoints.length === 2) {
        const [p1, p2] = state.measurePoints;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", p1.x); line.setAttribute("y1", p1.y);
        line.setAttribute("x2", p2.x); line.setAttribute("y2", p2.y);
        line.setAttribute("stroke", "#ff00ff");
        line.setAttribute("stroke-width", "0.2");
        line.setAttribute("stroke-dasharray", "1");
        line.style.pointerEvents = "none";
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
        label.style.transform = `translate(-50%, -50%)`;
        
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