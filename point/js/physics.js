import { state } from './state.js';
import { KINDS, TYPES } from './constants.js';
import { nodeRadius, draw } from './render.js';

let simulation;

export function initPhysics() {
    simulation = d3.forceSimulation()
        .alphaDecay(0.02)      
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

    // 1. LIENS
    simulation.force("link", d3.forceLink(state.links)
        .id(d => d.id)
        .distance(l => {
            if (l.kind === KINDS.ENNEMI) return 0;
            if (l.kind === KINDS.AFFILIATION) return 500; 
            if (l.kind === KINDS.PATRON) return 60;
            if (l.kind === KINDS.HAUT_GRADE) return 90;
            if (l.kind === KINDS.EMPLOYE) return 250; 
            return 200;
        })
        .strength(l => {
            if (l.kind === KINDS.ENNEMI) return 0; 
            if (l.kind === KINDS.PATRON) return 1.2;
            return 0.2; 
        })
    );

    // 2. FORCE DE HAINE (VERSION EXTRÊME)
    const enemyRepulsion = (alpha) => {
        state.links.forEach(l => {
            if (l.kind !== KINDS.ENNEMI) return;
            
            const s = l.source; 
            const t = l.target;
            if (!s.x || !t.x) return;

            const isBigS = (s.type === TYPES.COMPANY || s.type === TYPES.GROUP);
            const isBigT = (t.type === TYPES.COMPANY || t.type === TYPES.GROUP);
            
            // Configuration de la violence de la répulsion
            let hateRadius = 800; 
            let forceMultiplier = 2.0;

            if (isBigS && isBigT) {
                // CAS : ENTREPRISE CONTRE ENTREPRISE
                hateRadius = 5000; // Rayon infini (toute la map)
                forceMultiplier = 300.0; // FORCE NUCLÉAIRE : Elles vont voler aux opposés
            } 
            else if (isBigS || isBigT) {
                // CAS : INDIVIDU CONTRE ENTREPRISE
                hateRadius = 2000;
                forceMultiplier = 20.0; // Forte répulsion
            }

            // Ajout d'un petit bruit aléatoire (jitter) pour éviter le blocage parfait
            // si deux points sont exactement l'un sur l'autre (0,0)
            let dx = t.x - s.x || (Math.random() - 0.5);
            let dy = t.y - s.y || (Math.random() - 0.5);
            
            let distSq = dx*dx + dy*dy; 
            const dist = Math.sqrt(distSq);
            
            if (dist < hateRadius) {
                // Calcul linéaire de la force
                // Plus c'est proche, plus c'est fort (proche de 1.0)
                const strength = (hateRadius - dist) / hateRadius; 
                
                // Formule physique : Force vectorielle
                const force = strength * alpha * forceMultiplier; 

                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                // Application
                t.vx += fx; t.vy += fy;
                s.vx -= fx; s.vy -= fy;
            }
        });
    };
    simulation.force("enemyRepulsion", enemyRepulsion);

    // 3. CHARGE GLOBALE
    simulation.force("charge", d3.forceManyBody()
        .strength(n => {
            let strength = -800; 
            if (n.type === TYPES.COMPANY) strength = -5000; 
            if (n.type === TYPES.GROUP) strength = -3000;
            const degree = nodeDegree.get(n.id) || 0;
            strength -= (degree * 200); 
            return strength;
        })
        .distanceMax(2000) 
        .distanceMin(50) 
    );

    // 4. COLLISION
    simulation.force("collide", d3.forceCollide()
        .radius(n => nodeRadius(n) + 40)
        .iterations(4)
    );

    // 5. BARRIÈRE (Pour les empêcher de partir à l'infini)
    // On agrandit un peu le monde pour laisser la place à la guerre
    const worldRadius = 4000; 
    simulation.force("boundary", () => {
        if (!state.globeMode) return; 

        for (const n of state.nodes) {
            const d = Math.sqrt(n.x * n.x + n.y * n.y);
            if (d > worldRadius) {
                const excess = d - worldRadius;
                const angle = Math.atan2(n.y, n.x);
                // Rebond un peu plus rigide
                n.vx -= Math.cos(angle) * (excess * 0.5);
                n.vy -= Math.sin(angle) * (excess * 0.5);
            }
        }
    });

    // 6. TERRITOIRE
    simulation.force("territory", () => {
        const structures = state.nodes.filter(n => n.type === TYPES.COMPANY || n.type === TYPES.GROUP);
        for (const struct of structures) {
            const territoryRadius = (struct.type === TYPES.COMPANY) ? 400 : 300; 
            for (const n of state.nodes) {
                if (n.id === struct.id || n.type === TYPES.COMPANY || n.type === TYPES.GROUP) continue;
                if (n.fx != null) continue;
                if (connectedPairs.has(`${n.id}-${struct.id}`)) continue;

                const dx = n.x - struct.x; const dy = n.y - struct.y;
                const distSq = dx*dx + dy*dy; 
                const minDistSq = territoryRadius * territoryRadius;

                if (distSq < minDistSq) {
                    const dist = Math.sqrt(distSq);
                    const push = (territoryRadius - dist) * 0.1;
                    const angle = Math.atan2(dy, dx);
                    n.vx += Math.cos(angle) * push; n.vy += Math.sin(angle) * push;
                }
            }
        }
    });

    simulation.force("center", null);
    simulation.alpha(1).restart();
}

export function getSimulation() { return simulation; }