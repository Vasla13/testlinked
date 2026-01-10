import { state } from './state.js';
import { LINK_KIND_EMOJI, LINK_KIND_COLOR, KINDS } from './constants.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function uid() { return state.nextId++; }

export function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const th = x => Math.round(255 * x).toString(16).padStart(2, '0');
    return `#${th(f(0))}${th(f(8))}${th(f(4))}`;
}

export function randomPastel() { return hslToHex(Math.floor(Math.random() * 360), 60, 65); }
export function escapeHtml(s) { return (s||'').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export function toColorInput(hex) {
    if (/^#[0-9a-f]{3}$/i.test(hex)) { return '#' + hex.slice(1).split('').map(c => c + c).join(''); }
    return hex || '#ffffff';
}

export function kindToLabel(k) {
    const map = {
        [KINDS.PATRON]: 'Patron', [KINDS.HAUT_GRADE]: 'Haut gradé', [KINDS.EMPLOYE]: 'Employé',
        [KINDS.MEMBRE]: 'Membre', [KINDS.AFFILIATION]: 'Affiliation', [KINDS.AMOUR]: 'Amour',
        [KINDS.AMI]: 'Ami', [KINDS.FAMILLE]: 'Famille', [KINDS.PARTENAIRE]: 'Partenaire'
    };
    return map[k] || k || '';
}

export function linkKindEmoji(kind) { return LINK_KIND_EMOJI[kind] || '•'; }
export function linkKindColor(kind) { return LINK_KIND_COLOR[kind] || '#5b6280'; }
export function computeLinkColor(l) { return linkKindColor(l.kind); }

export function screenToWorld(px, py, canvas) {
    const p = state.view;
    const r = window.devicePixelRatio || 1;
    const w = canvas.width / r, h = canvas.height / r;
    return { x: (px - w / 2 - p.x) / p.scale, y: (py - h / 2 - p.y) / p.scale };
}

export function worldToScreen(x, y, canvas) {
    const p = state.view;
    const r = window.devicePixelRatio || 1;
    const w = canvas.width / r, h = canvas.height / r;
    return { x: (x * p.scale) + (w / 2 + p.x), y: (y * p.scale) + (h / 2 + p.y) };
}