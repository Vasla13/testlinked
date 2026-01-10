import { state } from './state.js';
import { KINDS, TYPES } from './constants.js';
import { nodeRadius, draw } from './render.js';

let simulation;

export function initPhysics() {
    simulation = d3.forceSimulation()
        .alphaDecay(0.02)
        .velocityDecay(0.3)
        .on("tick", ticked);
}

function ticked() {
    if (state.forceSimulation) return; 
    draw();
}

export function restartSim() {
    if (!simulation) initPhysics();

    simulation.nodes(state.nodes);
    
    // Calcul du degré pour la répulsion
    const nodeDegree = new Map();
    state.nodes.forEach(n => nodeDegree.set(n.id, 0));
    state.links.forEach(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        nodeDegree.set(s, (nodeDegree.get(s) || 0) + 1);
        nodeDegree.set(t, (nodeDegree.get(t) || 0) + 1);
    });

    simulation.force("link", d3.forceLink(state.links)
        .id(d => d.id)
        .distance(l => {
            if (l.kind === KINDS.AFFILIATION) return 400;
            if (l.kind === KINDS.PATRON) return 50;
            if (l.kind === KINDS.HAUT_GRADE) return 70;
            if (l.kind === KINDS.FAMILLE) return 60;
            if (l.kind === KINDS.AMOUR) return 50;
            if (l.kind === KINDS.EMPLOYE) return 180;
            return 140;
        })
        .strength(l => {
            if (l.kind === KINDS.AFFILIATION) return 0.1; 
            if (l.kind === KINDS.PATRON) return 1.2;
            return 0.3;
        })
    );

    simulation.force("charge", d3.forceManyBody()
        .strength(n => {
            let strength = -400;
            if (n.type === TYPES.COMPANY) strength = -1200;
            if (n.type === TYPES.GROUP) strength = -900;
            
            // Répulsion dynamique
            const degree = nodeDegree.get(n.id) || 0;
            strength -= (degree * 120); 

            return strength;
        })
        .distanceMax(2000)
    );

    simulation.force("collide", d3.forceCollide()
        .radius(n => nodeRadius(n) + 20)
        .iterations(3)
    );

    // --- NOUVEAU : Force de confinement (Limite de distance) ---
    // Le rayon autorisé dépend du nombre de nœuds pour éviter l'étouffement
    // Base 1200 + 15 pixels par nœud supplémentaire
    const worldRadius = 1200 + (state.nodes.length * 15);
    
    simulation.force("boundary", () => {
        for (const n of state.nodes) {
            const dist = Math.sqrt(n.x * n.x + n.y * n.y);
            if (dist > worldRadius) {
                // Si le point dépasse la limite, on le repousse vers le centre (0,0)
                // Plus il est loin, plus la force est grande
                const angle = Math.atan2(n.y, n.x);
                const strength = 0.5; // Force de rappel
                n.vx -= Math.cos(angle) * strength;
                n.vy -= Math.sin(angle) * strength;
            }
        }
    });
    // -----------------------------------------------------------

    simulation.force("center", d3.forceCenter(0, 0).strength(0.04));
    
    simulation.alpha(1).restart();
}

export function getSimulation() { return simulation; }