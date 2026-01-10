import { state } from './state.js';
import { KINDS, TYPES } from './constants.js';
import { nodeRadius, draw } from './render.js';

let simulation;

export function initPhysics() {
    simulation = d3.forceSimulation()
        .alphaDecay(0.015)     
        .velocityDecay(0.4)    
        .on("tick", ticked);
}

function ticked() {
    if (state.forceSimulation) return; 
    draw();
}

export function restartSim() {
    if (!simulation) initPhysics();

    simulation.nodes(state.nodes);
    
    const nodeDegree = new Map();
    const connectedPairs = new Set();

    state.nodes.forEach(n => nodeDegree.set(n.id, 0));
    state.links.forEach(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        nodeDegree.set(s, (nodeDegree.get(s) || 0) + 1);
        nodeDegree.set(t, (nodeDegree.get(t) || 0) + 1);
        connectedPairs.add(`${s}-${t}`);
        connectedPairs.add(`${t}-${s}`);
    });

    // --- FORCES ---

    // A. LIENS
    simulation.force("link", d3.forceLink(state.links)
        .id(d => d.id)
        .distance(l => {
            // ENNEMIS = TRÈS LOIN
            if (l.kind === KINDS.ENNEMI) return 1200; 
            if (l.kind === KINDS.AFFILIATION) return 500; 
            if (l.kind === KINDS.PATRON) return 60;
            if (l.kind === KINDS.HAUT_GRADE) return 90;
            if (l.kind === KINDS.EMPLOYE) return 250; 
            return 200;
        })
        .strength(l => {
            if (l.kind === KINDS.ENNEMI) return 1.0; 
            if (l.kind === KINDS.PATRON) return 1.2;
            return 0.2; 
        })
    );

    // B. CHARGE (RÉPULSION FORTE)
    simulation.force("charge", d3.forceManyBody()
        .strength(n => {
            let strength = -800; 
            if (n.type === TYPES.COMPANY) strength = -4000; 
            if (n.type === TYPES.GROUP) strength = -2500;
            const degree = nodeDegree.get(n.id) || 0;
            strength -= (degree * 200); 
            return strength;
        })
        .distanceMax(1500) 
        .distanceMin(50) 
    );

    // C. COLLISION
    simulation.force("collide", d3.forceCollide()
        .radius(n => nodeRadius(n) + 40)
        .iterations(4)
    );

    // D. BARRIÈRE (LARGE)
    const worldRadius = 2500;
    simulation.force("boundary", () => {
        for (const n of state.nodes) {
            const d = Math.sqrt(n.x * n.x + n.y * n.y);
            if (d > worldRadius) {
                const excess = d - worldRadius;
                const angle = Math.atan2(n.y, n.x);
                n.vx -= Math.cos(angle) * (excess * 0.2);
                n.vy -= Math.sin(angle) * (excess * 0.2);
            }
        }
    });

    // E. TERRITOIRE
    simulation.force("territory", () => {
        const structures = state.nodes.filter(n => n.type === TYPES.COMPANY || n.type === TYPES.GROUP);
        for (const struct of structures) {
            const territoryRadius = (struct.type === TYPES.COMPANY) ? 400 : 300; 
            for (const n of state.nodes) {
                if (n.id === struct.id || n.type === TYPES.COMPANY || n.type === TYPES.GROUP) continue;
                if (n.fx != null) continue;
                if (connectedPairs.has(`${n.id}-${struct.id}`)) continue;

                const dx = n.x - struct.x;
                const dy = n.y - struct.y;
                const distSq = dx*dx + dy*dy; 
                const minDistSq = territoryRadius * territoryRadius;

                if (distSq < minDistSq) {
                    const dist = Math.sqrt(distSq);
                    const push = (territoryRadius - dist) * 0.1;
                    const angle = Math.atan2(dy, dx);
                    n.vx += Math.cos(angle) * push;
                    n.vy += Math.sin(angle) * push;
                }
            }
        }
    });

    // F. PAS DE CENTRE (Anti-Planète)
    simulation.force("center", null);
    
    simulation.alpha(1).restart();
}

export function getSimulation() { return simulation; }