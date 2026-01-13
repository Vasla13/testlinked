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

// --- CORRECTION CRITIQUE ICI ---
// Convertit les coordonnées écran (Souris) en coordonnées Monde (Simulation)
export function screenToWorld(screenX, screenY, canvas, view) {
    // On utilise clientWidth/clientHeight pour avoir la taille d'affichage CSS réelle
    // C'est ça qui corrige le décalage du clic
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    
    return {
        x: (screenX - w / 2 - view.x) / view.scale,
        y: (screenY - h / 2 - view.y) / view.scale
    };
}

export function kindToLabel(kind) {
    return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function linkKindEmoji(kind) {
    const map = {
        ami: '💚', ennemi: '⚔️', relation: '🔹',
        employe: '💼', patron: '👑', membre: '🎗️',
        allie: '🤝', chef: '⭐'
    };
    return map[kind] || '🔗';
}

export function computeLinkColor(link) {
    const map = {
        ami: '#2ecc71', ennemi: '#e74c3c', relation: '#95a5a6',
        employe: '#f1c40f', patron: '#9b59b6', membre: '#3498db',
        allie: '#1abc9c', chef: '#e67e22'
    };
    return map[link.kind] || '#999';
}