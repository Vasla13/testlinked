import { state, isGroup, isCompany } from './state.js';
import { NODE_BASE_SIZE, DEG_SCALE, R_MIN, R_MAX, LINK_KIND_EMOJI, TYPES, KINDS, FILTERS, FILTER_RULES } from './constants.js';
import { computeLinkColor, safeHex } from './utils.js';

const canvas = document.getElementById('graph');
const ctx = canvas.getContext('2d');
const container = document.getElementById('center'); 

const degreeCache = new Map();
const NODE_ICONS = { [TYPES.PERSON]: '👤', [TYPES.COMPANY]: '🏢', [TYPES.GROUP]: '👥' };

export function updateDegreeCache() {
    degreeCache.clear();
    for (const l of state.links) {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        degreeCache.set(s, (degreeCache.get(s) || 0) + 1);
        degreeCache.set(t, (degreeCache.get(t) || 0) + 1);
    }
}

export function nodeRadius(n) {
    const base = NODE_BASE_SIZE[n.type] || 10;
    const d = degreeCache.get(n.id) || 0;
    const r = base + (DEG_SCALE[n.type] || 4.0) * d;
    return Math.max(R_MIN[n.type], Math.min(R_MAX[n.type], r));
}

export function resizeCanvas() {
    if (!canvas || !container) return;
    const r = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * r;
    canvas.height = h * r;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(r, 0, 0, r, 0, 0);
    draw();
}

function drawPolygon(ctx, x, y, radius, sides, rotate = 0) {
    ctx.moveTo(x + radius * Math.cos(rotate), y + radius * Math.sin(rotate));
    for (let i = 1; i <= sides; i++) {
        const angle = i * 2 * Math.PI / sides + rotate;
        ctx.lineTo(x + radius * Math.cos(angle), y + radius * Math.sin(angle));
    }
}

export function draw() {
    if (canvas.width === 0 || canvas.height === 0) return;

    const p = state.view;
    const r = window.devicePixelRatio || 1;
    const w = canvas.width / r;
    const h = canvas.height / r;
    
    const isFocus = state.focusMode;
    const isPath = state.pathMode;
    const isHVT = state.hvtMode; 
    const showTypes = state.showLinkTypes; 
    const labelMode = state.labelMode; 
    const activeFilter = state.activeFilter; 

    // NETTOYAGE
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    
    // GRILLE (Optimisée : trait fin)
    ctx.save();
    ctx.strokeStyle = "rgba(115, 251, 247, 0.05)"; 
    ctx.lineWidth = 1;
    const gridSize = 100 * p.scale; 
    const offsetX = (w/2 + p.x) % gridSize;
    const offsetY = (h/2 + p.y) % gridSize;
    ctx.beginPath();
    for (let x = offsetX; x < w; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = offsetY; y < h; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.restore();

    ctx.translate(w / 2 + p.x, h / 2 + p.y);
    ctx.scale(p.scale, p.scale);

    const useGlow = (!state.performance && p.scale > 0.4);
    const focusId = state.hoverId || state.selection;
    const hasFocus = (focusId !== null);

    const allowedKinds = FILTER_RULES[activeFilter];
    const visibleLinks = new Set();
    const activeNodes = new Set(); 

    // Pré-calcul de visibilité
    for (const l of state.links) {
        if (allowedKinds && !allowedKinds.has(l.kind)) continue;
        visibleLinks.add(l);
        activeNodes.add(l.source.id || l.source);
        activeNodes.add(l.target.id || l.target);
    }

    // Helper pour griser ce qui n'est pas focus
    function isDimmed(objType, obj) {
        if (isHVT) return false; // En HVT, on gère la transparence différemment
        if (state.pathfinding.startId !== null && !state.pathfinding.active) return false;
        if (state.pathfinding.active) {
            if (objType === 'node') return !state.pathfinding.pathNodes.has(obj.id);
            if (objType === 'link') {
                const s = obj.source.id || obj.source;
                const t = obj.target.id || obj.target;
                const k1 = `${s}-${t}`, k2 = `${t}-${s}`;
                return !(state.pathfinding.pathLinks.has(k1) || state.pathfinding.pathLinks.has(k2));
            }
        }
        if (!hasFocus) return false;
        if (objType === 'node') {
            if (obj.id === focusId) return false;
            return !state.links.some(l => 
                visibleLinks.has(l) &&
                ((l.source.id === focusId && l.target.id === obj.id) || 
                 (l.target.id === focusId && l.source.id === obj.id))
            );
        }
        if (objType === 'link') return (obj.source.id !== focusId && obj.target.id !== focusId);
        return false;
    }

    // 1. DESSIN DES LIENS
    for (const l of state.links) {
        if (!visibleLinks.has(l)) continue;
        if (l.kind === KINDS.ENNEMI) continue; 
        if (isFocus && (!state.focusSet.has(l.source.id) || !state.focusSet.has(l.target.id))) continue;
        
        let dimmed = isDimmed('link', l);
        let globalAlpha = dimmed ? 0.2 : 0.8;

        // Optimisation HVT : On rend très transparents les liens faibles
        if (isHVT) {
            const sScore = l.source.hvtScore || 0;
            const tScore = l.target.hvtScore || 0;
            if (sScore < 0.2 && tScore < 0.2) globalAlpha = 0.05; 
            else globalAlpha = 0.4;
        }

        ctx.beginPath();
        ctx.moveTo(l.source.x, l.source.y);
        ctx.lineTo(l.target.x, l.target.y);

        const isPathLink = state.pathfinding.active && !dimmed;

        if (showTypes || isPathLink) {
             const color = isPathLink ? '#00ffff' : computeLinkColor(l);
             ctx.strokeStyle = color;
             ctx.lineWidth = (isPathLink ? 4 : (dimmed ? 1 : 2)) / Math.sqrt(p.scale);
             // On enlève le shadowBlur en mode HVT pour la perf
             if(isPathLink) { ctx.shadowBlur = 15; ctx.shadowColor = '#00ffff'; }
             else if(useGlow && !dimmed && !isHVT) { ctx.shadowBlur = 8; ctx.shadowColor = color; }
             else { ctx.shadowBlur = 0; }
        } else {
             if (state.performance) ctx.strokeStyle = "rgba(255,255,255,0.2)";
             else {
                 try {
                    const grad = ctx.createLinearGradient(l.source.x, l.source.y, l.target.x, l.target.y);
                    grad.addColorStop(0, safeHex(l.source.color));
                    grad.addColorStop(1, safeHex(l.target.color));
                    ctx.strokeStyle = grad;
                 } catch(e) { ctx.strokeStyle = '#999'; }
             }
             ctx.lineWidth = (dimmed ? 1 : 1.5) / Math.sqrt(p.scale);
             ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = globalAlpha;
        ctx.stroke();

        if (showTypes && p.scale > 0.6 && !dimmed && !isPathLink && !isHVT) {
            const mx = (l.source.x + l.target.x) / 2;
            const my = (l.source.y + l.target.y) / 2;
            const color = computeLinkColor(l);
            ctx.globalAlpha = 1; ctx.shadowBlur = 0;
            ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(mx, my, 10 / Math.sqrt(p.scale), 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = color; ctx.lineWidth = 1 / Math.sqrt(p.scale); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = `${14 / Math.sqrt(p.scale)}px sans-serif`; 
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const emoji = LINK_KIND_EMOJI[l.kind] || '•';
            ctx.fillText(emoji, mx, my);
        }
    }

    // 2. LIEN TEMP
    if (state.tempLink) {
        ctx.beginPath();
        ctx.moveTo(state.tempLink.x1, state.tempLink.y1);
        ctx.lineTo(state.tempLink.x2, state.tempLink.y2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2 / Math.sqrt(p.scale);
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // 3. NOEUDS
    const sortedNodes = state.nodes.filter(n => n.type !== TYPES.PERSON).concat(state.nodes.filter(n => n.type === TYPES.PERSON));

    for (const n of sortedNodes) {
        if (activeFilter !== FILTERS.ALL) {
            if (n.type === TYPES.PERSON && !activeNodes.has(n.id)) continue;
        }
        if (isFocus && !state.focusSet.has(n.id)) continue;
        
        const dimmed = isDimmed('node', n);
        let rad = nodeRadius(n); 
        let alpha = (isPath && state.pathPath.has(n.id)) ? 1.0 : (dimmed ? 0.4 : 1.0);
        let nodeColor = safeHex(n.color);
        
        // --- LOGIQUE VISUELLE HVT (MODIFIÉE) ---
        let isBoss = false;
        if (isHVT) {
            const score = n.hvtScore || 0;
            if (score > 0.6) { 
                // LE BOSS : Très gros, mais garde sa couleur
                isBoss = true;
                rad = rad * (1 + score * 0.8); // Grossissement statique
                // nodeColor = '#ff0000';  <-- LIGNE SUPPRIMÉE, on garde n.color
                alpha = 1.0;
            } else if (score < 0.2) { 
                // LE PETIT : Très transparent
                alpha = 0.15; 
                rad *= 0.8;
            } else { 
                alpha = 0.6;
            }
        }

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        if (isGroup(n)) drawPolygon(ctx, n.x, n.y, rad * 1.2, 4); 
        else if (isCompany(n)) drawPolygon(ctx, n.x, n.y, rad * 1.1, 6, Math.PI/2); 
        else ctx.arc(n.x, n.y, rad, 0, Math.PI * 2);

        ctx.fillStyle = nodeColor;
        
        const isPathNode = isPath && state.pathPath.has(n.id);
        const isPathfindingNode = state.pathfinding.active && state.pathfinding.pathNodes.has(n.id);
        const isPathStart = state.pathfinding.startId === n.id;

        // Gestion Contour (Sans animation lourde)
        if (state.selection === n.id || state.hoverId === n.id || isPathNode || isPathfindingNode || isPathStart) {
            ctx.shadowBlur = 20; 
            let strokeColor = '#ffffff';
            if (isPathNode || isPathfindingNode) strokeColor = '#00ffff';
            if (isPathStart) strokeColor = '#ffff00';
            ctx.shadowColor = strokeColor;
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 3 / Math.sqrt(p.scale);
            ctx.stroke();
        } else if (isBoss) {
            // Boss HVT : Contour de sa propre couleur (plus lumineux) ou blanc
            ctx.shadowBlur = 15;
            ctx.shadowColor = nodeColor; // Glow de la couleur du point
            ctx.strokeStyle = '#ffffff'; // Contour blanc pour bien détacher
            ctx.lineWidth = 3 / Math.sqrt(p.scale);
            ctx.stroke();
        } else {
            ctx.shadowBlur = 0;
            if(!dimmed && p.scale > 0.5 && !isHVT) {
                ctx.strokeStyle = "rgba(255,255,255,0.3)";
                ctx.lineWidth = 1 / Math.sqrt(p.scale);
                ctx.stroke();
            }
        }
        ctx.fill();
        ctx.shadowBlur = 0; // Reset important

        // Icônes
        if (!dimmed && (p.scale > 0.4 || rad > 15) && (!isHVT || n.hvtScore > 0.2)) {
            ctx.globalAlpha = 1; 
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.font = `${rad}px sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(NODE_ICONS[n.type] || '', n.x, n.y + (rad*0.05));
        }
    }

    // 4. LABELS
    if (labelMode > 0) { 
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const n of sortedNodes) {
            if (activeFilter !== FILTERS.ALL) { if (n.type === TYPES.PERSON && !activeNodes.has(n.id)) continue; }
            if (isFocus && !state.focusSet.has(n.id)) continue;
            
            // Filtre HVT pour labels
            if (isHVT && n.hvtScore < 0.5) continue;

            const rad = nodeRadius(n);
            const dimmed = isDimmed('node', n);
            if (dimmed) continue;
            
            const isImportant = (n.type === TYPES.COMPANY || n.type === TYPES.GROUP);
            const isPathNode = isPath && state.pathPath.has(n.id);
            const isPathfindingNode = state.pathfinding.active && state.pathfinding.pathNodes.has(n.id);
            const isHover = (state.hoverId === n.id || state.selection === n.id);
            const isPathStart = state.pathfinding.startId === n.id;
            
            let showName = false;
            if (labelMode === 2) showName = true;
            else if (labelMode === 1) showName = isHover || isPathNode || isPathfindingNode || isPathStart || (p.scale > 0.5 || isImportant);
            
            if (isHVT && n.hvtScore > 0.6) showName = true;

            if (showName) {
                const fontSize = (isPathNode || isPathfindingNode || isPathStart || (isHVT && n.hvtScore > 0.6) ? 16 : 13) / Math.sqrt(p.scale);
                ctx.font = `600 ${fontSize}px "Rajdhani", sans-serif`; 
                const label = n.name;
                const metrics = ctx.measureText(label);
                const textW = metrics.width;
                const textH = fontSize * 1.4;
                const padding = 6 / Math.sqrt(p.scale);
                const boxX = n.x - textW / 2 - padding;
                const boxY = n.y + rad + 6 / Math.sqrt(p.scale);

                ctx.globalAlpha = 0.9; ctx.fillStyle = '#0a0c16'; 
                ctx.beginPath();
                if(ctx.roundRect) ctx.roundRect(boxX, boxY, textW + padding*2, textH + padding, 6);
                else ctx.rect(boxX, boxY, textW + padding*2, textH + padding);
                ctx.fill();
                
                let strokeColor = safeHex(n.color);
                if (isPathNode || isPathfindingNode) strokeColor = '#00ffff';
                if (isPathStart) strokeColor = '#ffff00';
                // En HVT, le label garde la couleur du point (pas de rouge forcé)
                
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = ((isPathNode || isPathfindingNode || isPathStart || (isHVT && n.hvtScore > 0.6)) ? 2 : 1) / Math.sqrt(p.scale);
                ctx.stroke();
                ctx.globalAlpha = 1.0; ctx.fillStyle = '#ffffff';
                ctx.fillText(label, n.x, boxY + textH/2 + padding/2);
            }
        }
    }
    // Pas de requestAnimationFrame ici -> Performance sauvée
    ctx.restore();
}