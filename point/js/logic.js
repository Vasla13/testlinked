import { state, nodeById, pushHistory } from './state.js';
import { restartSim } from './physics.js';
import { uid, randomPastel, hexToRgb, rgbToHex } from './utils.js';
import { TYPES, KINDS } from './constants.js';

// --- NOUVEAU : ALGORITHME HVT ---
export function calculateHVT() {
    const degrees = new Map();
    let maxDegree = 0;

    // 1. Initialisation
    state.nodes.forEach(n => degrees.set(n.id, 0));

    // 2. Comptage des connexions
    state.links.forEach(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        degrees.set(s, (degrees.get(s) || 0) + 1);
        degrees.set(t, (degrees.get(t) || 0) + 1);
    });

    // 3. Trouver le max pour normaliser
    for (let d of degrees.values()) {
        if (d > maxDegree) maxDegree = d;
    }

    // 4. Assigner le score HVT (0.0 à 1.0)
    state.nodes.forEach(n => {
        const d = degrees.get(n.id) || 0;
        n.hvtScore = (maxDegree > 0) ? (d / maxDegree) : 0;
    });
}

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
            let totalR = 0, totalG = 0, totalB = 0, totalWeight = 0;
            state.links.forEach(l => {
                const s = (typeof l.source === 'object') ? l.source : nodeById(l.source);
                const t = (typeof l.target === 'object') ? l.target : nodeById(l.target);
                if (!s || !t) return;
                let other = (s.id === n.id) ? t : ((t.id === n.id) ? s : null);
                if (!other) return;
                if (other.type !== TYPES.PERSON || other.color) { 
                    const weight = (nodeWeights.get(other.id) || 1); 
                    const rgb = hexToRgb(other.color || '#ffffff');
                    totalR += rgb.r * weight; totalG += rgb.g * weight; totalB += rgb.b * weight;
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

export function ensureNode(type, name) {
    let n = state.nodes.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!n) {
        pushHistory(); 
        const startX = (Math.random()-0.5)*50;
        const startY = (Math.random()-0.5)*50;
        n = { 
            id: uid(), name, type, 
            x: startX, y: startY, fx: startX, fy: startY, vx: 0, vy: 0, 
            color: (type === TYPES.PERSON ? '#ffffff' : randomPastel()) 
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

    const exists = state.links.find(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        return (s === A.id && t === B.id) || (s === B.id && t === A.id);
    });

    if (!exists) {
        pushHistory(); 
        state.links.push({ source: A.id, target: B.id, kind });
        if (kind === KINDS.PATRON) propagateOrgNums();
        
        if (A.fx !== undefined) A.fx = null; if (A.fy !== undefined) A.fy = null;
        if (B.fx !== undefined) B.fx = null; if (B.fy !== undefined) B.fy = null;

        updatePersonColors();
        restartSim();
        return true;
    }
    return false;
}

export function mergeNodes(sourceId, targetId) {
    if (sourceId === targetId) return;
    pushHistory(); 
    const linksToMove = state.links.filter(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        return s === sourceId || t === sourceId;
    });
    linksToMove.forEach(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        const otherId = (s === sourceId) ? t : s;
        if (otherId === targetId) return; 
        const exists = state.links.find(ex => {
            const es = (typeof ex.source === 'object') ? ex.source.id : ex.source;
            const et = (typeof ex.target === 'object') ? ex.target.id : ex.target;
            return (es === targetId && et === otherId) || (es === otherId && et === targetId);
        });
        if (!exists) {
            state.links.push({ source: targetId, target: otherId, kind: l.kind });
        }
    });
    state.links = state.links.filter(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        return s !== sourceId && t !== sourceId;
    });
    state.nodes = state.nodes.filter(n => n.id !== sourceId);
    updatePersonColors();
    restartSim();
}

export function propagateOrgNums() {
    for (const l of state.links) {
        if (l.kind !== KINDS.PATRON) continue;
        const srcId = (typeof l.source === 'object') ? l.source.id : l.source;
        const tgtId = (typeof l.target === 'object') ? l.target.id : l.target;
        const A = nodeById(srcId), B = nodeById(tgtId);
        if (!A || !B) continue;
        const person = (A.type === TYPES.PERSON) ? A : (B.type === TYPES.PERSON ? B : null);
        const org = (A.type !== TYPES.PERSON) ? A : (B.type !== TYPES.PERSON ? B : null);
        if (person && org && person.num) org.num = person.num;
    }
}

export function calculatePath(startId, endId) {
    if (!startId || !endId || startId === endId) return null;
    const queue = [[startId]];
    const visited = new Set([startId]);
    while (queue.length > 0) {
        const path = queue.shift();
        const node = path[path.length - 1];
        if (node === endId) {
            const pathNodes = new Set(path);
            const pathLinks = new Set();
            for (let i = 0; i < path.length - 1; i++) {
                const u = path[i];
                const v = path[i+1];
                const link = state.links.find(l => {
                    const s = (typeof l.source === 'object') ? l.source.id : l.source;
                    const t = (typeof l.target === 'object') ? l.target.id : l.target;
                    return (s === u && t === v) || (s === v && t === u);
                });
                if (link && link.kind !== KINDS.ENNEMI) { 
                    const s = (typeof link.source === 'object') ? link.source.id : link.source;
                    const t = (typeof link.target === 'object') ? link.target.id : link.target;
                    pathLinks.add(`${s}-${t}`);
                    pathLinks.add(`${t}-${s}`);
                }
            }
            return { pathNodes, pathLinks };
        }
        const neighbors = [];
        state.links.forEach(l => {
            if (l.kind === KINDS.ENNEMI) return;
            const s = (typeof l.source === 'object') ? l.source.id : l.source;
            const t = (typeof l.target === 'object') ? l.target.id : l.target;
            if (s === node && !visited.has(t)) neighbors.push(t);
            else if (t === node && !visited.has(s)) neighbors.push(s);
        });
        for (const neighbor of neighbors) {
            visited.add(neighbor);
            queue.push([...path, neighbor]);
        }
    }
    return null;
}

export function clearPath() {
    state.pathfinding.active = false;
    state.pathfinding.startId = null;
    state.pathfinding.pathNodes.clear();
    state.pathfinding.pathLinks.clear();
}