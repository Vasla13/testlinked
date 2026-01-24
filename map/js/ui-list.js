import { state, saveLocalState } from './state.js';
import { selectItem } from './ui.js';
import { renderAll } from './render.js';
import { updateTransform } from './engine.js'; 
import { openGroupEditor } from './ui-modals.js'; // IMPORT NÉCESSAIRE

export function renderGroupsList() {
    const container = document.getElementById('groups-list');
    if (!container) return;
    
    // FIX SCROLL
    const currentScroll = container.scrollTop;

    container.innerHTML = ''; 

    state.groups.forEach((group, gIndex) => {
        // FILTRAGE
        const term = state.searchTerm ? state.searchTerm.toLowerCase() : '';
        const filteredPoints = group.points.filter(p => {
            if (!term) return true;
            return (p.name && p.name.toLowerCase().includes(term)) || 
                   (p.type && p.type.toLowerCase().includes(term));
        });

        if (term && filteredPoints.length === 0 && (!group.zones || group.zones.length === 0)) {
            return;
        }

        const pointCount = filteredPoints.length;
        const zoneCount = group.zones ? group.zones.length : 0;
        const totalCount = pointCount + zoneCount;

        const groupEl = document.createElement('div');
        groupEl.className = 'group-item';
        groupEl.style.borderLeft = `3px solid ${group.color}`;
        
        // HEADER
        const header = document.createElement('div');
        header.className = 'group-header';
        header.style.cursor = 'pointer';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.padding = '10px';
        header.style.background = 'rgba(255,255,255,0.02)';

        const eyeOpacity = group.visible ? '1' : '0.3';
        const eyeColor = group.visible ? '#fff' : 'var(--text-dim)';

        header.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span class="color-dot" style="background:${group.color}; box-shadow:0 0 5px ${group.color}"></span>
                <span style="font-weight:700; font-size:0.9rem;">${group.name}</span>
            </div>
            <div style="display:flex; align-items:center; gap:5px;">
                <span style="font-size:0.75rem; color:#666; background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px; margin-right:5px;">
                    ${totalCount}
                </span>
                
                <button class="mini-btn btn-settings" title="Modifier/Supprimer" style="padding:4px 8px; color:var(--accent-cyan);">
                    ⚙️
                </button>

                <button class="mini-btn btn-focus" title="Centrer la vue" style="padding:4px 8px;">
                    🎯
                </button>
                
                <button class="mini-btn btn-visibility" title="Afficher/Masquer" style="opacity:${eyeOpacity}; color:${eyeColor}; padding:4px 8px;">
                    👁️
                </button>
            </div>
        `;

        // LISTE CONTENU
        const contentList = document.createElement('div');
        contentList.className = 'group-content';
        contentList.style.display = term ? 'block' : 'none'; 
        contentList.style.padding = '0 0 10px 25px';
        contentList.style.fontSize = '0.8rem';

        // Points
        if(filteredPoints.length > 0) {
            filteredPoints.forEach((p) => {
                const originalPIndex = group.points.indexOf(p);
                const pRow = document.createElement('div');
                pRow.style.padding = '4px 0';
                pRow.style.color = '#8892b0';
                pRow.style.cursor = 'pointer';
                pRow.innerHTML = `📍 ${p.name}`;
                pRow.onmouseover = () => pRow.style.color = '#fff';
                pRow.onmouseout = () => pRow.style.color = '#8892b0';
                pRow.onclick = (e) => {
                    e.stopPropagation();
                    selectItem('point', gIndex, originalPIndex);
                    focusOnTarget(p.x, p.y);
                };
                contentList.appendChild(pRow);
            });
        }

        // Zones
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
                zRow.onclick = (e) => {
                    e.stopPropagation();
                    selectItem('zone', gIndex, zIndex);
                    // Calcul centre
                    let targetX = 0, targetY = 0;
                    if (z.type === 'CIRCLE') { targetX = z.cx; targetY = z.cy; } 
                    else if (z.points) {
                        let sumX = 0, sumY = 0;
                        z.points.forEach(pt => { sumX += pt.x; sumY += pt.y; });
                        targetX = sumX / z.points.length; targetY = sumY / z.points.length;
                    }
                    focusOnTarget(targetX, targetY);
                };
                contentList.appendChild(zRow);
            });
        }

        // EVENTS HEADER
        header.onclick = (e) => {
            if(e.target.closest('button')) return;
            const isClosed = contentList.style.display === 'none';
            contentList.style.display = isClosed ? 'block' : 'none';
            header.style.background = isClosed ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)';
        };

        const btnVis = header.querySelector('.btn-visibility');
        if (btnVis) btnVis.onclick = (e) => {
            e.stopPropagation();
            group.visible = !group.visible;
            renderAll(); 
            renderGroupsList(); 
            saveLocalState();
        };

        const btnFocus = header.querySelector('.btn-focus');
        if (btnFocus) btnFocus.onclick = (e) => {
            e.stopPropagation();
            focusOnGroup(group);
        };
        
        // LOGIQUE BOUTON EDIT (NOUVEAU)
        const btnEdit = header.querySelector('.btn-settings');
        if (btnEdit) btnEdit.onclick = (e) => {
            e.stopPropagation();
            openGroupEditor(gIndex); // Appel à la modale
        };

        groupEl.appendChild(header);
        groupEl.appendChild(contentList);
        container.appendChild(groupEl);
    });

    container.scrollTop = currentScroll;
}

function focusOnTarget(percentX, percentY) {
    const viewport = document.getElementById('viewport');
    if(!viewport) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const mapW = state.mapWidth || 2000; 
    const mapH = state.mapHeight || 2000;
    const targetScale = 2.5; 

    state.view.scale = targetScale;
    state.view.x = (vw / 2) - (percentX * mapW / 100) * targetScale;
    state.view.y = (vh / 2) - (percentY * mapH / 100) * targetScale;
    updateTransform();
}

function focusOnGroup(group) {
    if ((!group.points || group.points.length === 0) && (!group.zones || group.zones.length === 0)) return;

    let minX = 100, maxX = 0, minY = 100, maxY = 0;
    let found = false;

    if(group.points) {
        group.points.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
            found = true;
        });
    }

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
        let width = maxX - minX;
        let height = maxY - minY;
        
        if(width < 1) width = 10;
        if(height < 1) height = 10;

        const viewport = document.getElementById('viewport');
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        const mapW = state.mapWidth || 2000; 
        const mapH = state.mapHeight || 2000;

        const contentW = (width / 100) * mapW;
        const contentH = (height / 100) * mapH;
        
        const scaleX = vw / (contentW * 1.5); 
        const scaleY = vh / (contentH * 1.5);
        const newScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.2), 4.0);

        state.view.scale = newScale;
        state.view.x = (vw / 2) - (centerX * mapW / 100) * state.view.scale;
        state.view.y = (vh / 2) - (centerY * mapH / 100) * state.view.scale;
        
        updateTransform();
    }
}