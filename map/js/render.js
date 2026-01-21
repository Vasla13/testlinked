import { state } from './state.js';
import { ICONS, MAP_SCALE_UNIT } from './constants.js';
import { handlePointClick, handleLinkClick, handleLinkHover, handleLinkOut, moveTooltip, selectItem } from './ui.js';
import { handleZoneMouseDown } from './zone-editor.js';

const markersLayer = document.getElementById('markers-layer');
const zonesLayer = document.getElementById('zones-layer');
const linksLayer = document.getElementById('links-layer'); 

document.addEventListener('mousemove', moveTooltip);

// Configuration du SVG pour utiliser les coordonnées 0-100%
function configureSVG(layer) {
    if (layer) {
        layer.setAttribute("viewBox", "0 0 100 100");
        layer.setAttribute("preserveAspectRatio", "none");
        // IMPORTANT : Le conteneur doit laisser passer les clics (pour le drag map)
        layer.style.pointerEvents = 'none'; 
        // Par sécurité, on s'assure qu'il est bien dimensionné
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

// --- RENDU ZONES ---
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

            el.setAttribute("fill", group.color);
            el.setAttribute("stroke", isSelected ? "#fff" : group.color);
            el.setAttribute("stroke-width", isSelected ? "0.2" : "0.08"); 
            el.setAttribute("fill-opacity", isSelected ? "0.3" : "0.15");
            el.setAttribute("class", "tactical-zone");
            
            // --- CORRECTION CLIC ---
            // On force l'élément à capturer les clics, même si le parent est en "none"
            el.style.pointerEvents = 'auto'; 
            el.style.cursor = 'pointer';

            if (isSelected) el.classList.add("selected");

            el.onmousedown = (e) => {
                // Bloquer la propagation pour ne pas draguer la map
                if (state.drawingMode || state.measuringMode) return;
                if (e.button === 2) return; // Clic droit géré ailleurs
                
                e.stopPropagation(); 
                selectItem('zone', gIndex, zIndex);
                handleZoneMouseDown(e, gIndex, zIndex);
            };

            zonesLayer.appendChild(el);
        });
    });

    // Rendu TEMPORAIRE (Création)
    if (state.drawingMode) {
        if (state.tempZone && state.drawingType === 'CIRCLE') {
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", state.tempZone.cx);
            circle.setAttribute("cy", state.tempZone.cy);
            circle.setAttribute("r", state.tempZone.r);
            circle.setAttribute("fill", "none");
            circle.setAttribute("stroke", "#00ff00");
            circle.setAttribute("stroke-width", "0.15");
            circle.setAttribute("stroke-dasharray", "1");
            zonesLayer.appendChild(circle);
        } else if (state.tempPoints.length > 0) {
            const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
            poly.setAttribute("points", state.tempPoints.map(p => `${p.x},${p.y}`).join(" "));
            poly.setAttribute("fill", "none");
            poly.setAttribute("stroke", "#ff00ff");
            poly.setAttribute("stroke-width", "0.15");
            zonesLayer.appendChild(poly);
        }
    }
}

// --- RENDU LIENS ---
function renderTacticalLinks() {
    if(!linksLayer) return;
    linksLayer.innerHTML = ''; 
    // IMPORTANT : Le conteneur ne doit pas bloquer
    linksLayer.style.pointerEvents = 'none'; 

    if(!state.tacticalLinks) return;

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
            line.setAttribute("stroke-width", "0.15");
            line.setAttribute("class", "tactical-link-line");
            
            // --- CORRECTION CLIC LIEN ---
            line.style.pointerEvents = 'visibleStroke'; // Capture le clic sur le trait
            line.style.cursor = 'pointer';
            
            line.onclick = (e) => { 
                e.stopPropagation(); 
                handleLinkClick(e, link); 
            };
            line.onmouseover = (e) => { 
                line.setAttribute("stroke-width", "0.4"); 
                handleLinkHover(e, link); 
            };
            line.onmouseout = (e) => { 
                line.setAttribute("stroke-width", "0.15"); 
                handleLinkOut(); 
            };
            linksLayer.appendChild(line);
        }
    });
}

// --- RENDU MARKERS (Inchangé) ---
function renderMarkersAndClusters() {
    markersLayer.innerHTML = '';
    let counterScale = 1 / Math.max(state.view.scale, 0.2);

    state.groups.forEach((group, gIndex) => {
        if (!group.visible) return;
        group.points.forEach((point, pIndex) => {
            if (state.statusFilter !== 'ALL' && (point.status || 'ACTIVE') !== state.statusFilter) return;
            
            const el = document.createElement('div');
            el.className = `marker status-${(point.status || 'ACTIVE').toLowerCase()}`;
            el.style.left = `${point.x}%`;
            el.style.top = `${point.y}%`;
            el.style.setProperty('--marker-color', group.color || '#00ffff');
            // Marker clickable
            el.style.pointerEvents = 'auto'; 

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