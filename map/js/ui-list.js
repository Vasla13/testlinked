import { state, saveLocalState } from './state.js';
import { selectItem } from './ui.js';
import { renderAll } from './render.js';
import { updateTransform, centerMap } from './engine.js'; // Pour le focus

export function renderGroupsList() {
    const container = document.getElementById('groups-list');
    if (!container) return;
    
    container.innerHTML = ''; // Reset

    state.groups.forEach((group, gIndex) => {
        // 1. CALCUL DU TOTAL (Points + Zones)
        const pointCount = group.points.length;
        const zoneCount = group.zones ? group.zones.length : 0;
        const totalCount = pointCount + zoneCount;

        // Création du conteneur du groupe
        const groupEl = document.createElement('div');
        groupEl.className = 'group-item';
        groupEl.style.borderLeft = `3px solid ${group.color}`;
        
        // --- EN-TÊTE DU GROUPE (Click pour déplier) ---
        const header = document.createElement('div');
        header.className = 'group-header';
        header.style.cursor = 'pointer';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.padding = '10px';
        header.style.background = 'rgba(255,255,255,0.02)';

        // Contenu de l'en-tête
        header.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span class="color-dot" style="background:${group.color}; box-shadow:0 0 5px ${group.color}"></span>
                <span style="font-weight:700; font-size:0.9rem;">${group.name}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:0.75rem; color:#666; background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px;">
                    ${totalCount}
                </span>
                <button class="mini-btn btn-focus" title="Centrer sur le groupe">👁️</button>
                <button class="mini-btn btn-visibility" style="opacity:${group.visible ? 1 : 0.3}">
                    ${group.visible ? 'On' : 'Off'}
                </button>
            </div>
        `;

        // --- LISTE DES ÉLÉMENTS (Cachée par défaut) ---
        const contentList = document.createElement('div');
        contentList.className = 'group-content';
        contentList.style.display = 'none'; // Caché par défaut
        contentList.style.padding = '0 0 10px 25px';
        contentList.style.fontSize = '0.8rem';

        // A) Lister les Points
        if(group.points.length > 0) {
            group.points.forEach((p, pIndex) => {
                const pRow = document.createElement('div');
                pRow.style.padding = '4px 0';
                pRow.style.color = '#8892b0';
                pRow.style.cursor = 'pointer';
                pRow.innerHTML = `📍 ${p.name}`;
                pRow.onmouseover = () => pRow.style.color = '#fff';
                pRow.onmouseout = () => pRow.style.color = '#8892b0';
                
                // Clic sur un point -> Sélectionne le point sur la carte
                pRow.onclick = (e) => {
                    e.stopPropagation();
                    selectItem('point', gIndex, pIndex);
                };
                contentList.appendChild(pRow);
            });
        }

        // B) Lister les Zones
        if(group.zones && group.zones.length > 0) {
            group.zones.forEach((z, zIndex) => {
                const zRow = document.createElement('div');
                zRow.style.padding = '4px 0';
                zRow.style.color = '#8892b0'; // Couleur dim
                zRow.style.cursor = 'pointer';
                // Icône différente selon le type
                const icon = z.type === 'CIRCLE' ? '⭕' : '📐';
                zRow.innerHTML = `${icon} ${z.name || 'Zone sans nom'}`;
                
                zRow.onmouseover = () => zRow.style.color = '#fff';
                zRow.onmouseout = () => zRow.style.color = '#8892b0';

                // Clic sur une zone -> Sélectionne la zone sur la carte
                zRow.onclick = (e) => {
                    e.stopPropagation();
                    selectItem('zone', gIndex, zIndex);
                };
                contentList.appendChild(zRow);
            });
        }

        // --- GESTION DES CLICS ---

        // 1. Déplier / Replier l'accordéon
        header.onclick = (e) => {
            // Si on clique sur un bouton (oeil/visibilité), on ne déplie pas
            if(e.target.tagName === 'BUTTON') return;
            
            const isClosed = contentList.style.display === 'none';
            contentList.style.display = isClosed ? 'block' : 'none';
            header.style.background = isClosed ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)';
        };

        // 2. Bouton Visibilité (On/Off)
        const btnVis = header.querySelector('.btn-visibility');
        btnVis.onclick = (e) => {
            e.stopPropagation();
            group.visible = !group.visible;
            renderAll();
            renderGroupsList(); // Recharge juste la liste pour mettre à jour l'icône
            saveLocalState();
        };

        // 3. Bouton Focus (Centrer sur les éléments du groupe)
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

// Fonction utilitaire pour calculer le centre d'un groupe et zoomer dessus
function focusOnGroup(group) {
    if ((group.points.length === 0) && (!group.zones || group.zones.length === 0)) return;

    let minX = 100, maxX = 0, minY = 100, maxY = 0;
    let found = false;

    // Check points
    group.points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        found = true;
    });

    // Check zones
    if (group.zones) {
        group.zones.forEach(z => {
            if(z.type === 'CIRCLE') {
                // Approximation pour le cercle (centre)
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
        
        // Calcul du zoom (approximatif)
        const width = maxX - minX;
        const height = maxY - minY;
        const maxDim = Math.max(width, height);
        
        // Si c'est un point unique ou très petit, zoom fort, sinon zoom adapté
        const newScale = maxDim < 5 ? 3 : (80 / maxDim); 

        // Application au moteur
        const viewport = document.getElementById('viewport');
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        
        // On récupère la taille de l'image stockée dans state (si dispo) ou défaut
        const mapW = state.mapWidth || 2000; 
        const mapH = state.mapHeight || 2000;

        state.view.scale = Math.min(Math.max(newScale, 0.2), 5); // Clamp zoom
        state.view.x = (vw / 2) - (centerX * mapW / 100) * state.view.scale;
        state.view.y = (vh / 2) - (centerY * mapH / 100) * state.view.scale;
        
        updateTransform();
    }
}