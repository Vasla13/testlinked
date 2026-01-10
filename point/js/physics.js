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
    
    // --- 1. PRÉPARATION ---
    const nodeDegree = new Map();
    const connectedPairs = new Set();

    state.nodes.forEach(n => nodeDegree.set(n.id, 0));
    
    state.links.forEach(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        
        nodeDegree.set(s, (nodeDegree.get(s) || 0) + 1);
        nodeDegree.set(t, (nodeDegree.get(t) || 0) + 1);

        // On stocke les connexions sous forme de chaîne "ID-ID"
        // On s'assure que ce sont des Strings pour éviter les bugs type nombre vs string
        connectedPairs.add(`${s}-${t}`);
        connectedPairs.add(`${t}-${s}`);
    });

    // --- 2. FORCES ---

    // A. LIENS
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
            if (l.kind === KINDS.AFFILIATION) return 0.05; 
            if (l.kind === KINDS.PATRON) return 1.5;
            return 0.3;
        })
    );

    // B. CHARGE (Répulsion globale)
    simulation.force("charge", d3.forceManyBody()
        .strength(n => {
            let strength = -400;
            if (n.type === TYPES.COMPANY) strength = -1500; 
            if (n.type === TYPES.GROUP) strength = -1000;
            const degree = nodeDegree.get(n.id) || 0;
            strength -= (degree * 100); 
            return strength;
        })
        .distanceMax(2500)
    );

    // C. COLLISION
    simulation.force("collide", d3.forceCollide()
        .radius(n => nodeRadius(n) + 20)
        .iterations(3)
    );

    // D. BARRIÈRE (Limite du monde)
    const worldRadius = 800 + (state.nodes.length * 12);
    simulation.force("boundary", () => {
        for (const n of state.nodes) {
            const d = Math.sqrt(n.x * n.x + n.y * n.y);
            if (d > worldRadius) {
                const excess = d - worldRadius;
                const angle = Math.atan2(n.y, n.x);
                const pullBack = excess * 0.08; 
                n.vx -= Math.cos(angle) * pullBack;
                n.vy -= Math.sin(angle) * pullBack;
            }
        }
    });

    // E. TERRITOIRE (Zone interdite aux non-membres)
    simulation.force("territory", () => {
        const structures = state.nodes.filter(n => n.type === TYPES.COMPANY || n.type === TYPES.GROUP);
        const alpha = 0.5; 

        for (const struct of structures) {
            const territoryRadius = (struct.type === TYPES.COMPANY) ? 280 : 200; 

            for (const n of state.nodes) {
                // 1. On ignore soi-même et les autres structures
                if (n.id === struct.id || n.type === TYPES.COMPANY || n.type === TYPES.GROUP) continue;
                
                // 2. CORRECTION CRITIQUE : Si le nœud est tenu par la souris (drag), on le laisse entrer !
                // fx est défini quand D3 drag est actif
                if (n.fx != null || n.fy != null) continue;

                // 3. Si connecté, on ignore (droit d'entrée)
                if (connectedPairs.has(`${n.id}-${struct.id}`)) continue;

                // 4. Calcul distance
                const dx = n.x - struct.x;
                const dy = n.y - struct.y;
                const distSq = dx*dx + dy*dy; 
                const minDistSq = territoryRadius * territoryRadius;

                // 5. Ejection si trop près
                if (distSq < minDistSq) {
                    const dist = Math.sqrt(distSq);
                    const l = (territoryRadius - dist) / (dist || 1) * alpha;
                    n.vx += dx * l;
                    n.vy += dy * l;
                }
            }
        }
    });

    simulation.force("center", d3.forceCenter(0, 0).strength(0.05));
    
    simulation.alpha(1).restart();
}

export function getSimulation() { return simulation; }