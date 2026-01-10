import { state, isGroup, isCompany } from './state.js';
import { NODE_BASE_SIZE, DEG_SCALE, R_MIN, R_MAX, LINK_KIND_EMOJI, TYPES } from './constants.js';
import { computeLinkColor } from './utils.js';

const canvas = document.getElementById('graph');
const ctx = canvas.getContext('2d');

const degreeCache = new Map();

const NODE_ICONS = {
    [TYPES.PERSON]: '👤',
    [TYPES.COMPANY]: '🏢',
    [TYPES.GROUP]: '👥'
};

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
    const r = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * r;
    canvas.height = canvas.clientHeight * r;
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

// Fonction de sécurité couleur
function safeColor(c) {
    if (typeof c !== 'string') return '#999999';
    const isValid = /^#([0-9A-F]{3}){1,2}$/i.test(c) || /^#([0-9A-F]{8})$/i.test(c);
    return isValid ? c : '#999999';
}

export function draw() {
    const p = state.view;
    const r = window.devicePixelRatio || 1;
    const w = canvas.width / r;
    const h = canvas.height / r;
    
    const isFocus = state.focusMode;
    const isPath = state.pathMode;
    const showTypes = state.showLinkTypes; 

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    drawGrid(w, h, p);

    ctx.translate(w / 2 + p.x, h / 2 + p.y);
    ctx.scale(p.scale, p.scale);

    const useGlow = (!state.performance && p.scale > 0.4);
    
    // Hover logic
    const focusId = state.hoverId || state.selection;
    const hasFocus = (focusId !== null);
    
    function isDimmed(objType, obj) {
        if (isPath) {
            if (objType === 'node') return !state.pathPath.has(obj.id);
            if (objType === 'link') {
                const s = obj.source.id, t = obj.target.id;
                const k1 = `${s}-${t}`, k2 = `${t}-${s}`;
                return !(state.pathLinks.has(k1) || state.pathLinks.has(k2));
            }
        }
        if (!hasFocus) return false;
        
        if (objType === 'node') {
            if (obj.id === focusId) return false;
            const connected = state.links.some(l => 
                (l.source.id === focusId && l.target.id === obj.id) || 
                (l.target.id === focusId && l.source.id === obj.id)
            );
            return !connected;
        }
        if (objType === 'link') {
            return (obj.source.id !== focusId && obj.target.id !== focusId);
        }
        return false;
    }

    // 1. DESSIN DES LIENS
    for (const l of state.links) {
        if (isFocus) {
            if (!state.focusSet.has(l.source.id) || !state.focusSet.has(l.target.id)) continue;
        }
        
        if (!l.source.x || !l.target.x) continue;
        
        const dimmed = isDimmed('link', l);
        const globalAlpha = dimmed ? 0.05 : 0.8;

        ctx.beginPath();
        ctx.moveTo(l.source.x, l.source.y);
        ctx.lineTo(l.target.x, l.target.y);

        if (showTypes) {
            const color = computeLinkColor(l);
            ctx.strokeStyle = color;
            ctx.lineWidth = (dimmed ? 1 : 2) / Math.sqrt(p.scale);
            if (useGlow && !dimmed) {
                ctx.shadowBlur = 8;
                ctx.shadowColor = color;
            } else {
                ctx.shadowBlur = 0;
            }
        } else {
            if (state.performance) {
                ctx.strokeStyle = "rgba(255,255,255,0.2)";
            } else {
                try {
                    const grad = ctx.createLinearGradient(l.source.x, l.source.y, l.target.x, l.target.y);
                    grad.addColorStop(0, safeColor(l.source.color));
                    grad.addColorStop(1, safeColor(l.target.color));
                    ctx.strokeStyle = grad;
                } catch (e) {
                    ctx.strokeStyle = '#999'; 
                }
            }
            ctx.lineWidth = (dimmed ? 1 : 1.5) / Math.sqrt(p.scale);
            ctx.shadowBlur = 0;
        }

        ctx.globalAlpha = globalAlpha;
        ctx.stroke();
        
        if (showTypes && p.scale > 0.6 && !dimmed) {
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

    // 2. LIEN TEMPORAIRE
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

    // 3. DESSIN DES NOEUDS (CORRECTION LAYER)
    // On dessine d'abord les structures (fond), puis les personnes (devant)
    
    // On trie ou on sépare : Structures vs Personnes
    const structures = [];
    const people = [];
    
    for (const n of state.nodes) {
        if (n.type === TYPES.PERSON) people.push(n);
        else structures.push(n);
    }

    // Fonction helper de dessin
    const drawSingleNode = (n) => {
        if (isFocus && !state.focusSet.has(n.id)) return;
        
        const dimmed = isDimmed('node', n);
        const rad = nodeRadius(n); 
        
        ctx.globalAlpha = (isPath && state.pathPath.has(n.id)) ? 1.0 : (dimmed ? 0.1 : 1.0);

        ctx.beginPath();
        if (isGroup(n)) drawPolygon(ctx, n.x, n.y, rad * 1.2, 4); 
        else if (isCompany(n)) drawPolygon(ctx, n.x, n.y, rad * 1.1, 6, Math.PI/2); 
        else ctx.arc(n.x, n.y, rad, 0, Math.PI * 2);

        ctx.fillStyle = safeColor(n.color);
        
        const isPathNode = isPath && state.pathPath.has(n.id);

        if (state.selection === n.id || state.hoverId === n.id || isPathNode) {
            ctx.shadowBlur = isPathNode ? 40 : 30; 
            ctx.shadowColor = isPathNode ? '#ffff00' : safeColor(n.color); 
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = (isPathNode ? 6 : 4) / Math.sqrt(p.scale);
            ctx.stroke();
        } else {
            ctx.shadowBlur = 0;
            if(!dimmed && p.scale > 0.5) {
                ctx.strokeStyle = "rgba(255,255,255,0.4)";
                ctx.lineWidth = 1.5 / Math.sqrt(p.scale);
                ctx.stroke();
            }
        }
        ctx.fill();
        ctx.shadowBlur = 0;

        if (!dimmed && (p.scale > 0.4 || rad > 15)) {
            ctx.globalAlpha = 1; 
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.font = `${rad}px sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(NODE_ICONS[n.type] || '', n.x, n.y + (rad*0.05));
        }
    };

    // PASSE 1 : Structures
    structures.forEach(drawSingleNode);
    // PASSE 2 : Gens (Au dessus)
    people.forEach(drawSingleNode);

    // 4. LABELS (Toujours au dessus de tout)
    if (state.showLabels) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // On peut dessiner les labels dans n'importe quel ordre, ou prioriser les personnes aussi
        const allNodesSorted = [...structures, ...people];
        
        for (const n of allNodesSorted) {
            if (isFocus && !state.focusSet.has(n.id)) continue;

            const rad = nodeRadius(n);
            const dimmed = isDimmed('node', n);
            if (dimmed) continue;

            const isImportant = (n.type === TYPES.COMPANY || n.type === TYPES.GROUP);
            const isPathNode = isPath && state.pathPath.has(n.id);
            const showName = (state.hoverId === n.id || state.selection === n.id) || (p.scale > 0.5 || isImportant) || isPathNode;

            if (showName) {
                const fontSize = (isPathNode ? 16 : 13) / Math.sqrt(p.scale);
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
                
                ctx.strokeStyle = isPathNode ? '#ffff00' : safeColor(n.color);
                ctx.lineWidth = (isPathNode ? 3 : 1) / Math.sqrt(p.scale);
                ctx.stroke();

                ctx.globalAlpha = 1.0; ctx.fillStyle = '#ffffff';
                ctx.fillText(label, n.x, boxY + textH/2 + padding/2);
            }
        }
    }

    ctx.restore();
}

function drawGrid(w, h, p) {
    ctx.save();
    ctx.strokeStyle = "rgba(115, 251, 247, 0.08)"; 
    ctx.lineWidth = 1;
    const gridSize = 100 * p.scale; 
    const offsetX = (w/2 + p.x) % gridSize;
    const offsetY = (h/2 + p.y) % gridSize;
    ctx.beginPath();
    for (let x = offsetX; x < w; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = offsetY; y < h; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.restore();
}