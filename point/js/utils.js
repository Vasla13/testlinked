import { LINK_KIND_EMOJI, KINDS } from './constants.js';

// Normalise un ID (objet D3 ou valeur primitive) en string
export function getId(value) {
    if (value && typeof value === 'object') return String(value.id);
    return String(value ?? '');
}

// Génère un ID unique
export function uid() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Sécurise l'affichage HTML
export function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function safeHex(color) {
    if (!color) return '#ffffff';
    if (/^#[0-9A-F]{6}$/i.test(color)) return color;
    return '#ffffff';
}

export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

export function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
}

export function randomPastel() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 80%)`;
}

// Math helpers
export function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

// Convertit les coordonnées écran (Souris) en coordonnées Monde (Simulation)
export function screenToWorld(screenX, screenY, canvas, view) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    
    return {
        x: (screenX - w / 2 - view.x) / view.scale,
        y: (screenY - h / 2 - view.y) / view.scale
    };
}

export function kindToLabel(kind) {
    if (!kind) return 'Lien';
    return kind.charAt(0).toUpperCase() + kind.slice(1);
}

// CORRECTION : Utilise maintenant la source de vérité dans constants.js
export function linkKindEmoji(kind) {
    return LINK_KIND_EMOJI[kind] || '🔗';
}

// CORRECTION : Liste complète des couleurs pour tous les types (KINDS)
export function computeLinkColor(link) {
    const map = {
        [KINDS.PATRON]: '#9b59b6',      // Violet
        [KINDS.HAUT_GRADE]: '#f39c12',  // Or
        [KINDS.EMPLOYE]: '#f1c40f',     // Jaune
        [KINDS.COLLEGUE]: '#e67e22',    // Orange
        [KINDS.PARTENAIRE]: '#1abc9c',  // Turquoise
        
        [KINDS.FAMILLE]: '#8e44ad',     // Violet Foncé
        [KINDS.COUPLE]: '#e84393',      // Rose Foncé
        [KINDS.AMOUR]: '#fd79a8',       // Rose Clair
        [KINDS.AMI]: '#2ecc71',         // Vert
        [KINDS.CONNAISSANCE]: '#bdc3c7', // Gris Clair
        
        [KINDS.ENNEMI]: '#e74c3c',      // Rouge
        [KINDS.RIVAL]: '#d35400',       // Orange Foncé
        
        [KINDS.AFFILIATION]: '#3498db', // Bleu
        [KINDS.MEMBRE]: '#2980b9',      // Bleu Foncé
        [KINDS.RELATION]: '#95a5a6'     // Gris
    };
    return map[link.kind] || '#999';
}
