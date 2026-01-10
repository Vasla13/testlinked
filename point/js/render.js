import { state, isGroup, isCompany } from './state.js';
import { NODE_BASE_SIZE, DEG_SCALE, R_MIN, R_MAX, LINK_KIND_EMOJI, TYPES } from './constants.js';
import { computeLinkColor } from './utils.js';

const canvas = document.getElementById('graph');
const ctx = canvas.getContext('2d');

const degreeCache = new Map();

// Icônes plus grosses
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

// Fonction utilitaire pour dessiner un polygone régulier
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

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    
    // --- GRILLE DE FOND DYNAMIQUE (DESSINÉE) ---
    // Ajoute de la texture au fond vide
    drawGrid(w, h, p);

    ctx.translate(w / 2 + p.x, h / 2 + p.y);
    ctx.scale(p.scale, p.scale);

    const useGlow = (!state.performance && p.scale > 0.4);
    
    // --- GESTION DU FOCUS ---
    const focusId = state.hoverId || state.selection;
    const hasFocus = (focusId !== null);
    
    function isDimmed(objType, obj) {
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
        
        // EMOJI LIEN (Opaque)
        if (state.showLinkTypes && p.scale > 0.6 && !dimmed) {
            const mx = (l.source.x + l.target.x) / 2;
            const my = (l.source.y + l.target.y) / 2;
            
            ctx.globalAlpha = 1; // Force l'opacité
            ctx.shadowBlur = 0;
            
            // Fond noir rond derrière l'emoji
            ctx.fillStyle = '#000'; 
            ctx.beginPath(); ctx.arc(mx, my, 9 / Math.sqrt(p.scale), 0, Math.PI*2); ctx.fill();

            // Bordure colorée autour
            ctx.strokeStyle = color;
            ctx.lineWidth = 1 / Math.sqrt(p.scale);
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.font = `${14 / Math.sqrt(p.scale)}px sans-serif`; // Emoji un peu plus gros
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(LINK_KIND_EMOJI[l.kind] || '•', mx, my);
        }
    }

    // 2. DESSIN DES NOEUDS
    ctx.shadowBlur = 0;
    for (const n of state.nodes) {
        const dimmed = isDimmed('node', n);
        const rad = nodeRadius(n); // Défini ici pour usage ultérieur
        
        ctx.globalAlpha = dimmed ? 0.1 : 1.0;

        ctx.beginPath();
        
        if (isGroup(n)) {
            // GROUPE = LOSANGE (Diamond)
            // Plus stylé qu'un octogone
            drawPolygon(ctx, n.x, n.y, rad * 1.2, 4); // 4 cotés = losange
        } else if (isCompany(n)) {
            // ENTREPRISE = HEXAGONE (Tech Style)
            // Remplace le carré moche
            drawPolygon(ctx, n.x, n.y, rad * 1.1, 6, Math.PI/2); // 6 cotés
        } else {
            // PERSONNE = CERCLE
            ctx.arc(n.x, n.y, rad, 0, Math.PI * 2);
        }

        ctx.fillStyle = n.color || '#9aa3ff';
        
        if (state.selection === n.id || state.hoverId === n.id) {
            ctx.shadowBlur = 30;
            ctx.shadowColor = n.color;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 4 / Math.sqrt(p.scale);
            ctx.stroke();
        } else {
            ctx.shadowBlur = 0;
            if(!dimmed && p.scale > 0.5) {
                // Bordure Tech légère
                ctx.strokeStyle = "rgba(255,255,255,0.4)";
                ctx.lineWidth = 1.5 / Math.sqrt(p.scale);
                ctx.stroke();
            }
        }
        ctx.fill();
        ctx.shadowBlur = 0;

        // --- ICONE INTERNE (Opaque et grosse) ---
        if (!dimmed && (p.scale > 0.4 || rad > 15)) {
            ctx.globalAlpha = 1; // Force opacité max
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; // Ombre portée légère
            ctx.font = `${rad}px sans-serif`;
            ctx.textAlign = 'center'; 
            ctx.textBaseline = 'middle';
            ctx.fillText(NODE_ICONS[n.type] || '', n.x, n.y + (rad*0.05));
        }
    }

    // 3. LABELS
    if (state.showLabels) {
        ctx.textAlign = 'center'; 
        ctx.textBaseline = 'middle';
        
        for (const n of state.nodes) {
            const rad = nodeRadius(n); // Récupération du rayon pour placement
            const dimmed = isDimmed('node', n);
            if (dimmed) continue;

            const isImportant = (n.type === TYPES.COMPANY || n.type === TYPES.GROUP);
            const showName = (state.hoverId === n.id || state.selection === n.id) || (p.scale > 0.5 || isImportant);

            if (showName) {
                const fontSize = 13 / Math.sqrt(p.scale);
                ctx.font = `600 ${fontSize}px "Rajdhani", sans-serif`; // Police un peu plus grasse
                
                const label = n.name;
                const metrics = ctx.measureText(label);
                const textW = metrics.width;
                const textH = fontSize * 1.4;
                const padding = 6 / Math.sqrt(p.scale);
                const boxX = n.x - textW / 2 - padding;
                const boxY = n.y + rad + 6 / Math.sqrt(p.scale);

                // Fond plus opaque
                ctx.globalAlpha = 0.9; 
                ctx.fillStyle = '#0a0c16'; // Très sombre
                
                ctx.beginPath();
                if(ctx.roundRect) ctx.roundRect(boxX, boxY, textW + padding*2, textH + padding, 6);
                else ctx.rect(boxX, boxY, textW + padding*2, textH + padding);
                ctx.fill();
                
                ctx.strokeStyle = n.color;
                ctx.lineWidth = 1 / Math.sqrt(p.scale);
                ctx.stroke();

                ctx.globalAlpha = 1.0;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(label, n.x, boxY + textH/2 + padding/2);

                // Matricule
                if (p.scale > 1.2 && n.num) {
                    ctx.font = `${fontSize * 0.85}px "Rajdhani", sans-serif`;
                    ctx.fillStyle = '#cccccc'; // Plus clair
                    ctx.fillText(`#${n.num}`, n.x, boxY + textH + fontSize);
                }
            }
        }
    }

    ctx.restore();
}

// Nouvelle fonction pour dessiner une grille de fond (Effet 'Pas vide')
function drawGrid(w, h, p) {
    ctx.save();
    ctx.strokeStyle = "rgba(115, 251, 247, 0.08)"; // Cyan très léger
    ctx.lineWidth = 1;
    
    // Taille de la grille visuelle (fixe par rapport à l'écran, bouge avec le pan)
    const gridSize = 100 * p.scale; 
    
    // Offset pour que la grille bouge avec le pan (p.x, p.y)
    const offsetX = (w/2 + p.x) % gridSize;
    const offsetY = (h/2 + p.y) % gridSize;

    ctx.beginPath();
    
    // Lignes verticales
    for (let x = offsetX; x < w; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
    }
    // Lignes horizontales
    for (let y = offsetY; y < h; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
    }
    
    ctx.stroke();
    ctx.restore();
}