import { state, isGroup, isCompany } from './state.js';
import { NODE_BASE_SIZE, DEG_SCALE, R_MIN, R_MAX, LINK_KIND_EMOJI, TYPES } from './constants.js';
import { computeLinkColor } from './utils.js';

const canvas = document.getElementById('graph');
const ctx = canvas.getContext('2d');

const degreeCache = new Map();

// Icônes affichées à l'intérieur des nœuds si assez zoomé
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

// Fonction utilitaire pour dessiner un polygone régulier (Carré, Hexagone)
function drawPolygon(ctx, x, y, radius, sides, rotate = 0) {
    ctx.moveTo(x + radius * Math.cos(rotate), y + radius * Math.sin(rotate));
    for (let i = 1; i <= sides; i++) {
        const angle = i * 2 * Math.PI / sides + rotate;
        ctx.lineTo(x + radius * Math.cos(angle), y + radius * Math.sin(angle));
    }
}

export function draw() {
    const p = state.view;
    const r = window.devicePixelRatio || 1;
    const w = canvas.width / r;
    const h = canvas.height / r;
    
    // Vérification rapide : sommes-nous en mode Focus ?
    const isFocus = state.focusMode;

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    
    // --- GRILLE DE FOND ---
    drawGrid(w, h, p);

    ctx.translate(w / 2 + p.x, h / 2 + p.y);
    ctx.scale(p.scale, p.scale);

    const useGlow = (!state.performance && p.scale > 0.4);
    
    // --- GESTION DU HOVER (DIMMING) ---
    // Si on survole quelque chose, on assombrit le reste
    const focusId = state.hoverId || state.selection;
    const hasFocus = (focusId !== null);
    
    function isDimmed(objType, obj) {
        if (!hasFocus) return false;
        if (objType === 'node') {
            if (obj.id === focusId) return false;
            // On vérifie si c'est un voisin direct du focus
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
        // --- FILTRE MODE FOCUS ---
        if (isFocus) {
            // Si l'un des deux bouts n'est pas dans le set visible, on ne dessine pas
            if (!state.focusSet.has(l.source.id) || !state.focusSet.has(l.target.id)) continue;
        }
        
        if (!l.source.x || !l.target.x) continue;
        
        const dimmed = isDimmed('link', l);
        const globalAlpha = dimmed ? 0.05 : 0.8;

        ctx.beginPath();
        ctx.moveTo(l.source.x, l.source.y);
        ctx.lineTo(l.target.x, l.target.y);

        const color = computeLinkColor(l);
        ctx.strokeStyle = color;
        ctx.lineWidth = (dimmed ? 1 : 2) / Math.sqrt(p.scale);
        ctx.globalAlpha = globalAlpha;

        if (useGlow && !dimmed) {
            ctx.shadowBlur = 8;
            ctx.shadowColor = color;
        } else {
            ctx.shadowBlur = 0;
        }
        ctx.stroke();
        
        // EMOJI SUR LE LIEN (si activé)
        if (state.showLinkTypes && p.scale > 0.6 && !dimmed) {
            const mx = (l.source.x + l.target.x) / 2;
            const my = (l.source.y + l.target.y) / 2;
            
            ctx.globalAlpha = 1; 
            ctx.shadowBlur = 0;
            
            // Petite bulle noire derrière l'emoji
            ctx.fillStyle = '#000'; 
            ctx.beginPath(); ctx.arc(mx, my, 9 / Math.sqrt(p.scale), 0, Math.PI*2); ctx.fill();

            ctx.strokeStyle = color;
            ctx.lineWidth = 1 / Math.sqrt(p.scale);
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.font = `${14 / Math.sqrt(p.scale)}px sans-serif`; 
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(LINK_KIND_EMOJI[l.kind] || '•', mx, my);
        }
    }

    // 2. DESSIN DES NOEUDS
    ctx.shadowBlur = 0;
    for (const n of state.nodes) {
        // --- FILTRE MODE FOCUS ---
        if (isFocus && !state.focusSet.has(n.id)) continue;
        
        const dimmed = isDimmed('node', n);
        const rad = nodeRadius(n); 
        
        ctx.globalAlpha = dimmed ? 0.1 : 1.0;

        ctx.beginPath();
        
        // Formes différentes selon le type
        if (isGroup(n)) {
            drawPolygon(ctx, n.x, n.y, rad * 1.2, 4); // Carré
        } else if (isCompany(n)) {
            drawPolygon(ctx, n.x, n.y, rad * 1.1, 6, Math.PI/2); // Hexagone
        } else {
            ctx.arc(n.x, n.y, rad, 0, Math.PI * 2); // Rond
        }

        ctx.fillStyle = n.color || '#9aa3ff';
        
        // Effet de sélection ou hover
        if (state.selection === n.id || state.hoverId === n.id) {
            ctx.shadowBlur = 30;
            ctx.shadowColor = n.color;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 4 / Math.sqrt(p.scale);
            ctx.stroke();
        } else {
            ctx.shadowBlur = 0;
            // Contour léger par défaut
            if(!dimmed && p.scale > 0.5) {
                ctx.strokeStyle = "rgba(255,255,255,0.4)";
                ctx.lineWidth = 1.5 / Math.sqrt(p.scale);
                ctx.stroke();
            }
        }
        ctx.fill();
        ctx.shadowBlur = 0;

        // --- ICONE INTERNE ---
        if (!dimmed && (p.scale > 0.4 || rad > 15)) {
            ctx.globalAlpha = 1; 
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.font = `${rad}px sans-serif`;
            ctx.textAlign = 'center'; 
            ctx.textBaseline = 'middle';
            ctx.fillText(NODE_ICONS[n.type] || '', n.x, n.y + (rad*0.05));
        }
    }

    // 3. LABELS (Noms)
    if (state.showLabels) {
        ctx.textAlign = 'center'; 
        ctx.textBaseline = 'middle';
        
        for (const n of state.nodes) {
            // --- FILTRE MODE FOCUS ---
            if (isFocus && !state.focusSet.has(n.id)) continue;

            const rad = nodeRadius(n);
            const dimmed = isDimmed('node', n);
            if (dimmed) continue;

            // On affiche le nom si c'est important, sélectionné, ou si on est assez zoomé
            const isImportant = (n.type === TYPES.COMPANY || n.type === TYPES.GROUP);
            const showName = (state.hoverId === n.id || state.selection === n.id) || (p.scale > 0.5 || isImportant);

            if (showName) {
                const fontSize = 13 / Math.sqrt(p.scale);
                ctx.font = `600 ${fontSize}px "Rajdhani", sans-serif`; 
                
                const label = n.name;
                const metrics = ctx.measureText(label);
                const textW = metrics.width;
                const textH = fontSize * 1.4;
                const padding = 6 / Math.sqrt(p.scale);
                const boxX = n.x - textW / 2 - padding;
                const boxY = n.y + rad + 6 / Math.sqrt(p.scale);

                // Fond du label
                ctx.globalAlpha = 0.9; 
                ctx.fillStyle = '#0a0c16'; 
                
                ctx.beginPath();
                if(ctx.roundRect) ctx.roundRect(boxX, boxY, textW + padding*2, textH + padding, 6);
                else ctx.rect(boxX, boxY, textW + padding*2, textH + padding);
                ctx.fill();
                
                // Bordure du label (couleur du nœud)
                ctx.strokeStyle = n.color;
                ctx.lineWidth = 1 / Math.sqrt(p.scale);
                ctx.stroke();

                // Texte
                ctx.globalAlpha = 1.0;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(label, n.x, boxY + textH/2 + padding/2);

                // Matricule (sous le nom, si très zoomé)
                if (p.scale > 1.2 && n.num) {
                    ctx.font = `${fontSize * 0.85}px "Rajdhani", sans-serif`;
                    ctx.fillStyle = '#cccccc'; 
                    ctx.fillText(`#${n.num}`, n.x, boxY + textH + fontSize);
                }
            }
        }
    }

    ctx.restore();
}

function drawGrid(w, h, p) {
    ctx.save();
    ctx.strokeStyle = "rgba(115, 251, 247, 0.08)"; 
    ctx.lineWidth = 1;
    
    // Grille qui bouge avec le pan/zoom
    const gridSize = 100 * p.scale; 
    const offsetX = (w/2 + p.x) % gridSize;
    const offsetY = (h/2 + p.y) % gridSize;

    ctx.beginPath();
    for (let x = offsetX; x < w; x += gridSize) {
        ctx.moveTo(x, 0); ctx.lineTo(x, h);
    }
    for (let y = offsetY; y < h; y += gridSize) {
        ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    
    ctx.stroke();
    ctx.restore();
}