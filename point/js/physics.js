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

    // 1. LIENS (Constraintes élastiques)
    simulation.force("link", d3.forceLink(state.links)
        .id(d => d.id)
        .distance(l => {
            if (l.kind === KINDS.ENNEMI) return 0; // On gère la distance manuellement
            if (l.kind === KINDS.AFFILIATION) return 500; 
            if (l.kind === KINDS.PATRON) return 60;
            if (l.kind === KINDS.HAUT_GRADE) return 90;
            if (l.kind === KINDS.EMPLOYE) return 250; 
            return 200;
        })
        .strength(l => {
            // Force nulle pour les ennemis (pas d'élastique)
            if (l.kind === KINDS.ENNEMI) return 0; 
            if (l.kind === KINDS.PATRON) return 1.2;
            return 0.2; 
        })
    );

    // 2. FORCE DE HAINE DYNAMIQUE (Grosse modif ici)
    const enemyRepulsion = (alpha) => {
        state.links.forEach(l => {
            if (l.kind !== KINDS.ENNEMI) return;
            
            const s = l.source; 
            const t = l.target;
            if (!s.x || !t.x) return;

            // Détection si c'est des "Gros" (Entreprises ou Groupes)
            const isBigS = (s.type === TYPES.COMPANY || s.type === TYPES.GROUP);
            const isBigT = (t.type === TYPES.COMPANY || t.type === TYPES.GROUP);
            
            // Calcul du rayon d'influence de la haine
            let hateRadius = 800; // Base pour des humains
            let forceMultiplier = 2.0; // Force de base

            // Si deux gros s'affrontent (ex: Atelis vs Cerberus)
            if (isBigS && isBigT) {
                hateRadius = 2500; // Ils se repoussent de TRES loin (toute la map quasiment)
                forceMultiplier = 20.0; // Poussée ultra violente
            } 
            // Si un gros contre un petit
            else if (isBigS || isBigT) {
                hateRadius = 1500;
                forceMultiplier = 8.0;
            }

            const dx = t.x - s.x;
            const dy = t.y - s.y;
            let distSq = dx*dx + dy*dy; 
            if(distSq === 0) distSq = 0.1;
            const dist = Math.sqrt(distSq);
            
            if (dist < hateRadius) {
                // Plus ils sont proches, plus ça pousse fort (linéaire)
                const strength = (hateRadius - dist) / hateRadius; 
                const force = strength * alpha * forceMultiplier; 

                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                // Application de la force
                t.vx += fx; t.vy += fy;
                s.vx -= fx; s.vy -= fy;
            }
        });
    };
    simulation.force("enemyRepulsion", enemyRepulsion);

    // 3. CHARGE GLOBALE (Gravité inverse)
    simulation.force("charge", d3.forceManyBody()
        .strength(n => {
            let strength = -800; 
            // Les entreprises se repoussent naturellement plus fort
            if (n.type === TYPES.COMPANY) strength = -5000; 
            if (n.type === TYPES.GROUP) strength = -3000;
            const degree = nodeDegree.get(n.id) || 0;
            strength -= (degree * 200); 
            return strength;
        })
        .distanceMax(2000) 
        .distanceMin(50) 
    );

    // 4. COLLISION (Anti-chevauchement)
    simulation.force("collide", d3.forceCollide()
        .radius(n => nodeRadius(n) + 40)
        .iterations(4)
    );

    // 5. BARRIÈRE (Pour ne pas qu'ils partent à l'infini si Globe activé)
    const worldRadius = 3500; // Un peu plus large pour laisser la place aux guerres
    simulation.force("boundary", () => {
        if (!state.globeMode) return; 

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

    // 6. TERRITOIRE (Les membres tournent autour de leur chef)
    simulation.force("territory", () => {
        const structures = state.nodes.filter(n => n.type === TYPES.COMPANY || n.type === TYPES.GROUP);
        for (const struct of structures) {
            const territoryRadius = (struct.type === TYPES.COMPANY) ? 400 : 300; 
            for (const n of state.nodes) {
                if (n.id === struct.id || n.type === TYPES.COMPANY || n.type === TYPES.GROUP) continue;
                if (n.fx != null) continue;
                if (connectedPairs.has(`${n.id}-${struct.id}`)) continue; // Si lié, géré par le lien

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