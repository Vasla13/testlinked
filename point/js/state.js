import { restartSim } from './physics.js';

export const state = {
    nodes: [],
    links: [],
    nextId: 1,
    selection: null,
    hoverId: null,
    focusMode: false,
    focusSet: new Set(),
    hvtMode: false,
    pathfinding: { startId: null, active: false, pathNodes: new Set(), pathLinks: new Set() },
    activeFilter: 'ALL',
    globeMode: true,
    physicsSettings: {
        repulsion: 1200, gravity: 0.005, linkLength: 220, friction: 0.3, 
        collision: 50, enemyForce: 300, structureRepulsion: 0.1
    },
    history: [], tempLink: null, labelMode: 1, showLinkTypes: false, 
    performance: false, view: { x: 0, y: 0, scale: 0.8 }, forceSimulation: false,
    projectName: null // AJOUT DU NOM DU PROJET
};

const STORAGE_KEY = 'pointPageState_v13'; 

export function saveState() {
    try {
        const payload = {
            meta: { projectName: state.projectName }, // SAUVEGARDE DU NOM
            nodes: state.nodes.map(n => ({
                id: n.id, name: n.name, type: n.type, color: n.color, 
                num: n.num, notes: n.notes, x: n.x, y: n.y, fixed: n.fixed,
                linkedMapPointId: n.linkedMapPointId 
            })),
            links: state.links.map(l => ({
                source: (typeof l.source === 'object') ? l.source.id : l.source,
                target: (typeof l.target === 'object') ? l.target.id : l.target,
                kind: l.kind
            })),
            view: state.view, labelMode: state.labelMode, showLinkTypes: state.showLinkTypes,
            activeFilter: state.activeFilter, globeMode: state.globeMode,
            physicsSettings: state.physicsSettings, nextId: state.nextId
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
        if (data.activeFilter) state.activeFilter = data.activeFilter;
        if (typeof data.globeMode === 'boolean') state.globeMode = data.globeMode;
        if (data.physicsSettings) state.physicsSettings = { ...state.physicsSettings, ...data.physicsSettings };
        if (data.meta && data.meta.projectName) state.projectName = data.meta.projectName; // CHARGEMENT DU NOM
        state.pathfinding = { startId: null, active: false, pathNodes: new Set(), pathLinks: new Set() };
        state.hvtMode = false;
        return true;
    } catch (e) { return false; }
}

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
    restartSim();
}

export function nodeById(id) { return state.nodes.find(n => n.id === id); }
export function isPerson(n) { return n.type === 'person'; }
export function isGroup(n) { return n.type === 'group'; }
export function isCompany(n) { return n.type === 'company'; }