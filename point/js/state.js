import { TYPES, KINDS, PERSON_PERSON_KINDS, PERSON_ORG_KINDS, ORG_ORG_KINDS } from './constants.js';
import { uid, randomPastel } from './utils.js';
import { restartSim } from './physics.js';

export const state = {
    nodes: [],
    links: [],
    nextId: 1,
    selection: null,
    hoverId: null,
    
    // --- MODE FOCUS & PATHFINDING ---
    focusMode: false,
    focusSet: new Set(),
    
    pathMode: false,
    pathPath: new Set(),
    pathLinks: new Set(),
    // --------------------------------

    // --- UNDO HISTORY ---
    history: [], 
    // --------------------

    // --- DRAG & DROP CREATION ---
    tempLink: null,
    // ----------------------------

    // 0 = Off, 1 = Auto (Zoom), 2 = Always On
    labelMode: 1, 
    
    showLinkTypes: false,
    performance: false,
    view: { x: 0, y: 0, scale: 0.8 },
    forceSimulation: false
};

const STORAGE_KEY = 'pointPageState_v6';

// --- UTILITAIRES COULEURS ---
function hexToRgb(hex) {
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
}

// --- COULEURS AUTOMATIQUES (MIX PONDÉRÉ) ---
export function updatePersonColors() {
    const nodeWeights = new Map();
    state.links.forEach(l => {
        const sId = (typeof l.source === 'object') ? l.source.id : l.source;
        const tId = (typeof l.target === 'object') ? l.target.id : l.target;
        nodeWeights.set(sId, (nodeWeights.get(sId) || 0) + 1);
        nodeWeights.set(tId, (nodeWeights.get(tId) || 0) + 1);
    });

    state.nodes.forEach(n => {
        if (n.type === TYPES.PERSON) {
            let totalR = 0, totalG = 0, totalB = 0;
            let totalWeight = 0;

            state.links.forEach(l => {
                const s = (typeof l.source === 'object') ? l.source : nodeById(l.source);
                const t = (typeof l.target === 'object') ? l.target : nodeById(l.target);
                if (!s || !t) return;

                let other = (s.id === n.id) ? t : ((t.id === n.id) ? s : null);
                if (!other) return;

                if (other.type !== TYPES.PERSON || other.color) { 
                    const weight = (nodeWeights.get(other.id) || 1); 
                    const rgb = hexToRgb(other.color || '#ffffff');
                    
                    totalR += rgb.r * weight;
                    totalG += rgb.g * weight;
                    totalB += rgb.b * weight;
                    totalWeight += weight;
                }
            });

            if (totalWeight > 0) {
                n.color = rgbToHex(totalR / totalWeight, totalG / totalWeight, totalB / totalWeight);
            } else {
                n.color = '#ffffff'; 
            }
        }
    });
}

// --- FUSION DE NOEUDS ---
export function mergeNodes(sourceId, targetId) {
    if (sourceId === targetId) return;
    const source = nodeById(sourceId);
    const target = nodeById(targetId);
    if (!source || !target) return;

    pushHistory(); 

    // 1. Identifier les liens à déplacer
    const linksToMove = state.links.filter(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        return s === sourceId || t === sourceId;
    });

    // 2. Créer les nouveaux liens sur la cible
    linksToMove.forEach(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        const otherId = (s === sourceId) ? t : s;

        if (otherId === targetId) return; // On évite de créer un lien Cible-Cible

        // Vérifier si la cible est déjà connectée à "other"
        const exists = state.links.find(ex => {
            const es = (typeof ex.source === 'object') ? ex.source.id : ex.source;
            const et = (typeof ex.target === 'object') ? ex.target.id : ex.target;
            return (es === targetId && et === otherId) || (es === otherId && et === targetId);
        });

        if (!exists) {
            state.links.push({ source: targetId, target: otherId, kind: l.kind });
        }
    });

    // 3. Supprimer le noeud source et ses vieux liens
    state.links = state.links.filter(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        return s !== sourceId && t !== sourceId;
    });
    state.nodes = state.nodes.filter(n => n.id !== sourceId);

    // 4. Update
    updatePersonColors();
    restartSim();
}

// --- GESTION HISTORIQUE ---
export function pushHistory() {
    if (state.history.length > 50) state.history.shift();
    const snapshot = {
        nodes: state.nodes.map(n => ({...n})), 
        links: state.links.map(l => ({
            source: (typeof l.source === 'object') ? l.source.id : l.source,
            target: (typeof l.target === 'object') ? l.target.id : l.target,
            kind: l.kind
        })),
        nextId: state.nextId
    };
    state.history.push(JSON.stringify(snapshot));
}

export function undo() {
    if (state.history.length === 0) return;
    const prevJSON = state.history.pop();
    const prev = JSON.parse(prevJSON);
    state.nodes = prev.nodes;
    state.links = prev.links;
    state.nextId = prev.nextId;
    updatePersonColors();
    restartSim();
}

export function saveState() {
    try {
        const payload = {
            nodes: state.nodes.map(n => ({
                id: n.id, name: n.name, type: n.type, color: n.color, num: n.num, notes: n.notes,
                x: n.x, y: n.y, fixed: n.fixed 
            })),
            links: state.links.map(l => ({
                source: (typeof l.source === 'object') ? l.source.id : l.source,
                target: (typeof l.target === 'object') ? l.target.id : l.target,
                kind: l.kind
            })),
            view: state.view,
            labelMode: state.labelMode, 
            showLinkTypes: state.showLinkTypes,
            nextId: state.nextId
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) { console.error("Save error", e); }
}

export function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (data.nodes) state.nodes = data.nodes;
        if (data.links) state.links = data.links;
        if (data.view) state.view = data.view;
        if (data.nextId) state.nextId = data.nextId;
        
        if (typeof data.labelMode === 'number') state.labelMode = data.labelMode;
        else if (typeof data.showLabels === 'boolean') state.labelMode = data.showLabels ? 1 : 0;
        
        updatePersonColors();
        return true;
    } catch (e) { return false; }
}

export function nodeById(id) { return state.nodes.find(n => n.id === id); }
export function isPerson(n) { return n.type === TYPES.PERSON; }
export function isGroup(n) { return n.type === TYPES.GROUP; }
export function isCompany(n) { return n.type === TYPES.COMPANY; }

export function ensureNode(type, name, init = {}) {
    let n = state.nodes.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!n) {
        pushHistory(); 
        const startX = (Math.random()-0.5)*50;
        const startY = (Math.random()-0.5)*50;
        n = { 
            id: uid(), 
            name, 
            type, 
            x: startX, 
            y: startY, 
            fx: startX, fy: startY,
            vx: 0, vy: 0, 
            color: (type === TYPES.PERSON ? '#ffffff' : (init.color || randomPastel())) 
        };
        state.nodes.push(n);
    }
    return n;
}

export function addLink(a, b, kind) {
    const A = (typeof a === 'object') ? a : nodeById(a);
    const B = (typeof b === 'object') ? b : nodeById(b);
    if (!A || !B || A.id === B.id) return false;

    if (!kind) {
        if (A.type === TYPES.PERSON && B.type === TYPES.PERSON) kind = KINDS.AMI;
        else if (A.type === TYPES.COMPANY || B.type === TYPES.COMPANY) kind = KINDS.EMPLOYE;
        else if (A.type === TYPES.GROUP || B.type === TYPES.GROUP) kind = KINDS.MEMBRE;
        else kind = KINDS.RELATION;
    }

    let allowed = false;
    if (A.type === TYPES.PERSON && B.type === TYPES.PERSON && PERSON_PERSON_KINDS.has(kind)) allowed = true;
    else if (((A.type === TYPES.PERSON && B.type !== TYPES.PERSON) || (A.type !== TYPES.PERSON && B.type === TYPES.PERSON)) && PERSON_ORG_KINDS.has(kind)) allowed = true;
    else if (A.type !== TYPES.PERSON && B.type !== TYPES.PERSON && ORG_ORG_KINDS.has(kind)) allowed = true;
    
    if (!allowed) return false;

    const exists = state.links.find(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        return (s === A.id && t === B.id) || (s === B.id && t === A.id);
    });

    if (!exists) {
        pushHistory(); 
        state.links.push({ source: A.id, target: B.id, kind });
        if (kind === KINDS.PATRON) propagateOrgNums();
        
        if (A.fx !== undefined) A.fx = null;
        if (A.fy !== undefined) A.fy = null;
        if (B.fx !== undefined) B.fx = null;
        if (B.fy !== undefined) B.fy = null;

        updatePersonColors();
        restartSim();
        return true;
    }
    return false;
}

export function propagateOrgNums() {
    for (const l of state.links) {
        if (l.kind !== KINDS.PATRON) continue;
        const srcId = (typeof l.source === 'object') ? l.source.id : l.source;
        const tgtId = (typeof l.target === 'object') ? l.target.id : l.target;
        const A = nodeById(srcId), B = nodeById(tgtId);
        if (!A || !B) continue;
        const person = isPerson(A) ? A : (isPerson(B) ? B : null);
        const org = !isPerson(A) ? A : (!isPerson(B) ? B : null);
        if (person && org && person.num) org.num = person.num;
    }
}