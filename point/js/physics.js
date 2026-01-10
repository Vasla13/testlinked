import { state } from './state.js';
import { KINDS, TYPES } from './constants.js';
import { nodeRadius, draw } from './render.js';

let simulation;

export function initPhysics() {
    simulation = d3.forceSimulation()
        .alphaDecay(0.02)     // Ralentissement naturel
        .velocityDecay(0.3)   // Friction (0.3 = assez élevé pour éviter que ça parte dans tous les sens)
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

    // 1. LIENS (Ressorts)
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
            if (l.kind === KINDS.AFFILIATION) return 0.05; // Très souple
            if (l.kind === KINDS.PATRON) return 1.5;       // Très fort
            return 0.3;
        })
    );

    // 2. REPULSION (Charges électriques)
    simulation.force("charge", d3.forceManyBody()
        .strength(n => {
            let strength = -400; // Base pour tout le monde
            
            // Les structures repoussent fort
            if (n.type === TYPES.COMPANY) strength = -1200;
            if (n.type === TYPES.GROUP) strength = -900;
            
            // Répulsion dynamique : plus on a de liens, plus on fait le vide autour de soi
            const degree = nodeDegree.get(n.id) || 0;
            strength -= (degree * 100); 

            return strength;
        })
        .distanceMax(2000) // On arrête de calculer la répulsion si trop loin (optimisation)
    );

    // 3. ANTI-COLLISION (Évite que les bulles se chevauchent)
    simulation.force("collide", d3.forceCollide()
        .radius(n => nodeRadius(n) + 20)
        .iterations(3)
    );

    // 4. BARRIÈRE ÉLASTIQUE (Empêche les points de se barrer)
    // Rayon dynamique : Base 600px + 10px par point existant
    const worldRadius = 600 + (state.nodes.length * 10);

    simulation.force("boundary", () => {
        for (const n of state.nodes) {
            // Distance du centre (0,0)
            const d = Math.sqrt(n.x * n.x + n.y * n.y);
            
            // Si le point est hors du cercle autorisé
            if (d > worldRadius) {
                const excess = d - worldRadius; // De combien il dépasse
                const angle = Math.atan2(n.y, n.x);
                
                // Force de rappel : "Ressort" qui tire vers le centre
                // 0.05 * excess = plus il est loin, plus ça tire fort.
                const pullBack = excess * 0.05; 

                n.vx -= Math.cos(angle) * pullBack;
                n.vy -= Math.sin(angle) * pullBack;
            }
        }
    });

    // 5. GRAVITÉ CENTRALE (Douce, pour garder tout le monde groupé)
    simulation.force("center", d3.forceCenter(0, 0).strength(0.08));
    
    simulation.alpha(1).restart();
}

export function getSimulation() { return simulation; }