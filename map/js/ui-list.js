import { state, saveLocalState } from './state.js';
import { selectItem } from './ui.js';
import { renderAll } from './render.js';
import { updateTransform } from './engine.js'; 

export function renderGroupsList() {
    const container = document.getElementById('groups-list');
    if (!container) return;
    
    container.innerHTML = ''; 

    state.groups.forEach((group, gIndex) => {
        // Calcul totaux
        const pointCount = group.points.length;
        const zoneCount = group.zones ? group.zones.length : 0;
        const totalCount = pointCount + zoneCount;

        const groupEl = document.createElement('div');
        groupEl.className = 'group-item';
        groupEl.style.borderLeft = `3px solid ${group.color}`;
        
        // --- HEADER ---
        const header = document.createElement('div');
        header.className = 'group-header';
        header.style.cursor = 'pointer';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.padding = '10px';
        header.style.background = 'rgba(255,255,255,0.02)';

        header.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span class="color-dot" style="background:${group.color}; box-shadow:0 0 5px ${group.color}"></span>
                <span style="font-weight:700; font-size:0.9rem;">${group.name}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:0.75rem; color:#666; background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px;">
                    ${totalCount}
                </span>
                <button class="mini-btn btn-focus" title="Vue d'ensemble du groupe">👁️</button>
                <button class="mini-btn btn-visibility" style="opacity:${group.visible ? 1 : 0.3}">
                    ${group.visible ? 'On' : 'Off'}
                </button>
            </div>
        `;

        // --- LISTE DÉROULANTE ---
        const contentList = document.createElement('div');
        contentList.className = 'group-content';
        contentList.style.display = 'none'; 
        contentList.style.padding = '0 0 10px 25px';
        contentList.style.fontSize = '0.8rem';

        // A) POINTS
        if(group.points.length > 0) {
            group.points.forEach((p, pIndex) => {
                const pRow = document.createElement('div');
                pRow.style.padding = '4px 0';
                pRow.style.color = '#8892b0';
                pRow.style.cursor = 'pointer';
                pRow.innerHTML = `📍 ${p.name}`;
                pRow.onmouseover = () => pRow.style.color = '#fff';
                pRow.onmouseout = () => pRow.style.color = '#8892b0';
                
                // CLIC SUR POINT : Sélectionne ET Focus
                pRow.onclick = (e) => {
                    e.stopPropagation();
                    selectItem('point', gIndex, pIndex);
                    focusOnTarget(p.x, p.y); // <-- NOUVEAU : Focus caméra
                };
                contentList.appendChild(pRow);
            });
        }

        // B) ZONES
        if(group.zones && group.zones.length > 0) {
            group.zones.forEach((z, zIndex) => {
                const zRow = document.createElement('div');
                zRow.style.padding = '4px 0';
                zRow.style.color = '#8892b0';
                zRow.style.cursor = 'pointer';
                const icon = z.type === 'CIRCLE' ? '⭕' : '📐';
                zRow.innerHTML = `${icon} ${z.name || 'Zone sans nom'}`;
                zRow.onmouseover = () => zRow.style.color = '#fff';
                zRow.onmouseout = () => zRow.style.color = '#8892b0';

                // CLIC SUR ZONE : Sélectionne ET Focus
                zRow.onclick = (e) => {
                    e.stopPropagation();
                    selectItem('zone', gIndex, zIndex);
                    
                    // Calcul du centre de la zone pour le focus
                    let targetX = 0, targetY = 0;
                    
                    if (z.type === 'CIRCLE') {
                        targetX = z.cx;
                        targetY = z.cy;
                    } else if (z.points && z.points.length > 0) {
                        // Pour un polygone, on fait la moyenne des points
                        let sumX = 0, sumY = 0;
                        z.points.forEach(pt => { sumX += pt.x; sumY += pt.y; });
                        targetX = sumX / z.points.length;
                        targetY = sumY / z.points.length;
                    }
                    
                    focusOnTarget(targetX, targetY); // <-- NOUVEAU : Focus caméra
                };
                contentList.appendChild(zRow);
            });
        }

        // --- GESTION CLICK HEADER ---
        header.onclick = (e) => {
            if(e.target.tagName === 'BUTTON') return;
            const isClosed = contentList.style.display === 'none';
            contentList.style.display = isClosed ? 'block' : 'none';
            header.style.background = isClosed ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)';
        };

        const btnVis = header.querySelector('.btn-visibility');
        btnVis.onclick = (e) => {
            e.stopPropagation();
            group.visible = !group.visible;
            renderAll();
            renderGroupsList(); 
            saveLocalState();
        };

        const btnFocus = header.querySelector('.btn-focus');
        btnFocus.onclick = (e) => {
            e.stopPropagation();
            focusOnGroup(group);
        };

        groupEl.appendChild(header);
        groupEl.appendChild(contentList);
        container.appendChild(groupEl);
    });
}

// FONCTION : Centrer la caméra sur une coordonnée précise (x, y en %)
function focusOnTarget(percentX, percentY) {
    const viewport = document.getElementById('viewport');
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    
    // Taille de la map (ou défaut si pas chargée)
    const mapW = state.mapWidth || 2000; 
    const mapH = state.mapHeight || 2000;

    // Zoom agréable pour voir l'objet
    const targetScale = 2.5; 

    state.view.scale = targetScale;
    
    // Calcul pour centrer le point au milieu de l'écran
    // Formule : (Milieu Écran) - (Position Point en pixels Zoomé)
    state.view.x = (vw / 2) - (percentX * mapW / 100) * targetScale;
    state.view.y = (vh / 2) - (percentY * mapH / 100) * targetScale;
    
    updateTransform();
}

// FONCTION : Centrer sur tout le groupe
function focusOnGroup(group) {
    if ((group.points.length === 0) && (!group.zones || group.zones.length === 0)) return;

    let minX = 100, maxX = 0, minY = 100, maxY = 0;
    let found = false;

    group.points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        found = true;
    });

    if (group.zones) {
        group.zones.forEach(z => {
            if(z.type === 'CIRCLE') {
                if (z.cx < minX) minX = z.cx;
                if (z.cx > maxX) maxX = z.cx;
                if (z.cy < minY) minY = z.cy;
                if (z.cy > maxY) maxY = z.cy;
                found = true;
            } else if (z.points) {
                z.points.forEach(zp => {
                    if (zp.x < minX) minX = zp.x;
                    if (zp.x > maxX) maxX = zp.x;
                    if (zp.y < minY) minY = zp.y;
                    if (zp.y > maxY) maxY = zp.y;
                    found = true;
                });
            }
        });
    }

    if (found) {
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const width = maxX - minX;
        const height = maxY - minY;
        const maxDim = Math.max(width, height);
        const newScale = maxDim < 5 ? 3 : (80 / maxDim); 

        const viewport = document.getElementById('viewport');
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        const mapW = state.mapWidth || 2000; 
        const mapH = state.mapHeight || 2000;

        state.view.scale = Math.min(Math.max(newScale, 0.2), 5);
        state.view.x = (vw / 2) - (centerX * mapW / 100) * state.view.scale;
        state.view.y = (vh / 2) - (centerY * mapH / 100) * state.view.scale;
        
        updateTransform();
    }
}