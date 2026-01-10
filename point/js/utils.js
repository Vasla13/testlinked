import { KINDS } from './constants.js';

export function uid() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function randomPastel() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 80%)`;
}

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

// Nettoyage couleur pour input HTML
export function safeHex(color) {
    if (!color || typeof color !== 'string') return '#000000';
    // Format #RGB
    if (/^#[0-9A-F]{3}$/i.test(color)) return color;
    // Format #RRGGBB
    if (/^#[0-9A-F]{6}$/i.test(color)) return color;
    // Nettoyage format bâtard
    if (color.length > 7 && color.startsWith('#')) return color.substring(0, 7);
    return '#000000';
}

export function toColorInput(hex) {
    return safeHex(hex);
}

// Conversion Hex -> RGB pour le mixage
export function hexToRgb(hex) {
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
}

export function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
}

export function screenToWorld(sx, sy, canvas, view) {
    // Si view n'est pas fourni, on assume qu'on est en coordonnées brutes (ou géré ailleurs)
    // Mais pour le zoom souris, on a besoin de la vue (x, y, scale)
    if (!view) return { x: sx, y: sy };
    return {
        x: (sx - canvas.width / 2 - view.x) / view.scale,
        y: (sy - canvas.height / 2 - view.y) / view.scale
    };
}

// Fonction pour convertir les coordonnée Monde -> Écran (utile pour le zoom curseur)
export function worldToScreen(wx, wy, canvas, view) {
    if (!view) return { x: wx, y: wy };
    return {
        x: wx * view.scale + view.x + canvas.width / 2,
        y: wy * view.scale + view.y + canvas.height / 2
    };
}

export function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function kindToLabel(kind) {
    if (!kind) return 'Lien';
    return kind.charAt(0).toUpperCase() + kind.slice(1).replace('_', ' ');
}

export function linkKindEmoji(kind) {
    const map = {
        [KINDS.PATRON]: '👑', 
        [KINDS.EMPLOYE]: '💼', 
        [KINDS.COLLEGUE]: '🤝', 
        [KINDS.PARTENAIRE]: '🤝',
        [KINDS.FAMILLE]: '🏠', 
        [KINDS.COUPLE]: '❤️', 
        [KINDS.AMOUR]: '❤️',
        [KINDS.AMI]: '🍻', 
        [KINDS.ENNEMI]: '⚔️',
        [KINDS.RIVAL]: '⚡',
        [KINDS.CONNAISSANCE]: '👋', 
        [KINDS.AFFILIATION]: '🏴', 
        [KINDS.MEMBRE]: '👤'
    };
    return map[kind] || '•';
}

// CELLE QUI MANQUAIT :
export function computeLinkColor(l) {
    const k = l.kind;
    switch (k) {
        case KINDS.PATRON: return '#ff4444';      // Rouge clair
        case KINDS.EMPLOYE: return '#44ff44';     // Vert clair
        case KINDS.COLLEGUE: return '#4444ff';    // Bleu
        case KINDS.PARTENAIRE: return '#00aaff';  // Cyan foncé
        case KINDS.AFFILIATION: return '#ffff00'; // Jaune
        case KINDS.MEMBRE: return '#00ff00';      // Vert
        case KINDS.FAMILLE: return '#ff00ff';     // Magenta
        case KINDS.AMOUR: 
        case KINDS.COUPLE: return '#ff69b4';      // Rose
        case KINDS.AMI: return '#00ffff';         // Cyan
        case KINDS.ENNEMI: 
        case KINDS.RIVAL: return '#ffffff';       // Blanc
        default: return '#888888';
    }
}