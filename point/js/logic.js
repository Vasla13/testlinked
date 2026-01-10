import { state, nodeById, pushHistory, isPerson } from './state.js';
import { restartSim } from './physics.js';
import { uid, randomPastel, hexToRgb, rgbToHex } from './utils.js';
import { TYPES, KINDS, PERSON_PERSON_KINDS, PERSON_ORG_KINDS, ORG_ORG_KINDS } from './constants.js';

// --- COULEURS (MIX PONDÉRÉ) ---
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

// --- ACTIONS ---
export function ensureNode(type, name) {
    let n = state.nodes.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!n) {
        pushHistory(); 
        const startX = (Math.random()-0.5)*50;
        const startY = (Math.random()-0.5)*50;
        n = { 
            id: uid(), 
            name, 
            type, 
            x: startX, y: startY, 
            fx: startX, fy: startY, // Figé au départ
            vx: 0, vy: 0, 
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
        // Fallbacks si aucun type n'est donné
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
        
        // Propagation Numéro
        if (kind === KINDS.PATRON) propagateOrgNums();
        
        // Libération physique
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

export function mergeNodes(sourceId, targetId) {
    if (sourceId === targetId) return;
    pushHistory(); 

    // Identifier les liens à déplacer
    const linksToMove = state.links.filter(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        return s === sourceId || t === sourceId;
    });

    // Créer les nouveaux liens
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

    // Supprimer l'ancien noeud
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
        const person = isPerson(A) ? A : (isPerson(B) ? B : null);
        const org = !isPerson(A) ? A : (!isPerson(B) ? B : null);
        if (person && org && person.num) org.num = person.num;
    }
}