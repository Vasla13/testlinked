import { TYPES, KINDS, PERSON_PERSON_KINDS, PERSON_ORG_KINDS, ORG_ORG_KINDS } from './constants.js';
import { uid, randomPastel } from './utils.js';
import { restartSim } from './physics.js';

export const state = {
    nodes: [],
    links: [],
    nextId: 1,
    selection: null,
    hoverId: null, // <--- NOUVEAU : Pour l'effet de survol
    showLabels: true,
    showLinkTypes: false,
    performance: false,
    view: { x: 0, y: 0, scale: 0.8 },
    forceSimulation: false
};

const STORAGE_KEY = 'pointPageState_v2';

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
            showLabels: state.showLabels,
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
        if (typeof data.showLabels === 'boolean') state.showLabels = data.showLabels;
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
        n = { id: uid(), name, type, x: (Math.random()-0.5)*50, y: (Math.random()-0.5)*50, vx: 0, vy: 0, color: (type === TYPES.PERSON ? '#ffffff' : (init.color || randomPastel())) };
        state.nodes.push(n);
    }
    return n;
}

export function addLink(a, b, kind) {
    const A = (typeof a === 'object') ? a : nodeById(a);
    const B = (typeof b === 'object') ? b : nodeById(b);
    if (!A || !B || A.id === B.id) return;

    let allowed = false;
    if (A.type === TYPES.PERSON && B.type === TYPES.PERSON && PERSON_PERSON_KINDS.has(kind)) allowed = true;
    else if (((A.type === TYPES.PERSON && B.type !== TYPES.PERSON) || (A.type !== TYPES.PERSON && B.type === TYPES.PERSON)) && PERSON_ORG_KINDS.has(kind)) allowed = true;
    else if (A.type !== TYPES.PERSON && B.type !== TYPES.PERSON && ORG_ORG_KINDS.has(kind)) allowed = true;
    
    if (!allowed) return;

    const exists = state.links.find(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        return (s === A.id && t === B.id) || (s === B.id && t === A.id);
    });

    if (!exists) {
        state.links.push({ source: A.id, target: B.id, kind });
        if (kind === KINDS.PATRON) propagateOrgNums();
        restartSim();
    }
}

export function propagateOrgNums() {
    for (const l of state.links) {
        if (l.kind !== KINDS.PATRON) continue;
        const srcId = (typeof l.source === 'object') ? l.source.id : l.source;
        const tgtId = (typeof l.target === 'object') ? l.target.id : l.target;
        const A = nodeById(srcId), B = nodeById(tgtId);
        if (!A || !B) continue;
        const person = isPerson(A) ? A : B;
        const org = !isPerson(A) ? A : B;
        if (person && org && person.num) org.num = person.num;
    }
}