import { state } from './state.js';
import { KINDS, TYPES } from './constants.js';
import { nodeRadius, draw } from './render.js';

let simulation;

export function initPhysics() {
    simulation = d3.forceSimulation()
        .alphaDecay(0.01) // Ralenti un peu pour laisser le temps de se placer
        .velocityDecay(0.3) // Moins de friction pour que ça glisse mieux vers l'extérieur
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

    // 1. LIENS (Structure élastique)
    simulation.force("link", d3.forceLink(state.links)
        .id(d => d.id)
        .distance(l => {
            if (l.kind === KINDS.ENNEMI) return 0; 
            if (l.kind === KINDS.AFFILIATION) return 450; 
            if (l.kind === KINDS.PATRON) return 70;
            if (l.kind === KINDS.HAUT_GRADE) return 100;
            if (l.kind === KINDS.EMPLOYE) return 200; 
            return 220; // Un peu plus long pour aérer
        })
        .strength(l => {
            if (l.kind === KINDS.ENNEMI) return 0; 
            if (l.kind === KINDS.PATRON) return 1.0;
            return 0.25; 
        })
    );

    // 2. GRAVITÉ CENTRALE DOUCE (Le Juste Milieu)
    // Suffisant pour ramener les isolés, mais trop faible pour écraser le graphe
    simulation.force("gravityX", d3.forceX(0).strength(0.005));
    simulation.force("gravityY", d3.forceY(0).strength(0.005));


    // 3. FORCE DE HAINE (ENNEMIS) - Toujours violent
    const enemyRepulsion = (alpha) => {
        state.links.forEach(l => {
            if (l.kind !== KINDS.ENNEMI) return;
            const s = l.source; const t = l.target;
            if (!s.x || !t.x) return;

            const isBigS = (s.type === TYPES.COMPANY || s.type === TYPES.GROUP);
            const isBigT = (t.type === TYPES.COMPANY || t.type === TYPES.GROUP);
            
            let hateRadius = 900; 
            let forceMultiplier = 3.0;

            if (isBigS && isBigT) {
                hateRadius = 5000; // Toute la map
                forceMultiplier = 300.0; // Explosion
            } 
            else if (isBigS || isBigT) {
                hateRadius = 2500;
                forceMultiplier = 30.0;
            }

            let dx = t.x - s.x || (Math.random() - 0.5);
            let dy = t.y - s.y || (Math.random() - 0.5);
            let distSq = dx*dx + dy*dy; 
            const dist = Math.sqrt(distSq);
            
            if (dist < hateRadius) {
                const strength = (hateRadius - dist) / hateRadius; 
                const force = strength * alpha * forceMultiplier; 
                const fx = (dx / dist) * force; const fy = (dy / dist) * force;
                t.vx += fx; t.vy += fy;
                s.vx -= fx; s.vy -= fy;
            }
        });
    };
    simulation.force("enemyRepulsion", enemyRepulsion);

    // 4. CHARGE GLOBALE (Répulsion générale)
    // C'est ici qu'on règle l'espacement "entre-deux"
    simulation.force("charge", d3.forceManyBody()
        .strength(n => {
            let strength = -1200; // Assez fort pour bien écarter les nœuds
            if (n.type === TYPES.COMPANY) strength = -6000; 
            if (n.type === TYPES.GROUP) strength = -4000;
            
            // Plus un nœud a de liens, plus il repousse les autres pour faire de la place
            const degree = nodeDegree.get(n.id) || 0;
            strength -= (degree * 150); 
            
            return strength;
        })
        // On augmente la distance max pour que les points se sentent de plus loin
        // Cela évite l'effet "paquet compact" au centre
        .distanceMax(2000) 
        .distanceMin(50) 
    );

    // 5. COLLISION (Pour ne pas se marcher dessus)
    simulation.force("collide", d3.forceCollide()
        .radius(n => nodeRadius(n) + 50) // Marge confortable
        .iterations(2)
    );

    // 6. BARRIÈRE (GLOBE)
    // Assez large pour permettre l'expansion
    const worldRadius = 3800; 
    simulation.force("boundary", () => {
        if (!state.globeMode) return; 

        for (const n of state.nodes) {
            const d = Math.sqrt(n.x * n.x + n.y * n.y);
            if (d > worldRadius) {
                const excess = d - worldRadius;
                const angle = Math.atan2(n.y, n.x);
                n.vx -= Math.cos(angle) * (excess * 0.1); // Rebond très doux
                n.vy -= Math.sin(angle) * (excess * 0.1);
            }
        }
    });

    // 7. TERRITOIRE
    simulation.force("territory", () => {
        const structures = state.nodes.filter(n => n.type === TYPES.COMPANY || n.type === TYPES.GROUP);
        for (const struct of structures) {
            const territoryRadius = (struct.type === TYPES.COMPANY) ? 450 : 350; 
            for (const n of state.nodes) {
                if (n.id === struct.id || n.type === TYPES.COMPANY || n.type === TYPES.GROUP) continue;
                if (n.fx != null) continue;
                if (connectedPairs.has(`${n.id}-${struct.id}`)) continue;

                const dx = n.x - struct.x; const dy = n.y - struct.y;
                const distSq = dx*dx + dy*dy; 
                const minDistSq = territoryRadius * territoryRadius;

                if (distSq < minDistSq) {
                    const dist = Math.sqrt(distSq);
                    const push = (territoryRadius - dist) * 0.08; 
                    const angle = Math.atan2(dy, dx);
                    n.vx += Math.cos(angle) * push; n.vy += Math.sin(angle) * push;
                }
            }
        }
    });

    simulation.alpha(1).restart();
}

export function getSimulation() { return simulation; }