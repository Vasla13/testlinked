import { state } from './state.js';
import { KINDS, TYPES } from './constants.js';
import { nodeRadius, draw } from './render.js';
import { clamp } from './utils.js';

let simulation;

export function initPhysics() {
    simulation = d3.forceSimulation()
        .alphaDecay(0.01) 
        .velocityDecay(state.physicsSettings.friction) 
        .on("tick", ticked);
}

function ticked() {
    if (state.forceSimulation) return; 
    draw();
}

export function restartSim() {
    if (!simulation) initPhysics();
    
    // MAJ de la friction depuis les réglages
    simulation.velocityDecay(state.physicsSettings.friction);

    simulation.nodes(state.nodes);
    
    const nodeDegree = new Map();
    const connectedPairs = new Set();
    let maxDegree = 0;

    state.nodes.forEach(n => nodeDegree.set(n.id, 0));
    state.links.forEach(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        nodeDegree.set(s, (nodeDegree.get(s) || 0) + 1);
        nodeDegree.set(t, (nodeDegree.get(t) || 0) + 1);
        connectedPairs.add(`${s}-${t}`);
        connectedPairs.add(`${t}-${s}`);
    });
    nodeDegree.forEach(v => { if (v > maxDegree) maxDegree = v; });

    const S = state.physicsSettings; // Raccourci pour accéder aux sliders
    const nodeCount = state.nodes.length || 1;
    const linkCount = state.links.filter(l => l.kind !== KINDS.ENNEMI).length;
    const avgDegree = (nodeCount > 0) ? (2 * linkCount) / nodeCount : 0;
    const densityBoost = clamp((avgDegree - 3) / 8, 0, 1.5);
    const adaptiveCollision = S.collision * (1 + densityBoost);
    const adaptiveRepulsion = S.repulsion * (1 + densityBoost * 0.7);

    // 1. LIENS
    simulation.force("link", d3.forceLink(state.links)
        .id(d => d.id)
        .distance(l => {
            if (l.kind === KINDS.ENNEMI) return 0; 
            
            // Slider: Link Length
            const base = S.linkLength;
            if (l.kind === KINDS.AFFILIATION) return base * 2.0; 
            if (l.kind === KINDS.PATRON) return base * 0.3;
            if (l.kind === KINDS.HAUT_GRADE) return base * 0.5;
            if (l.kind === KINDS.EMPLOYE) return base * 0.9; 
            return base; 
        })
        .strength(l => {
            if (l.kind === KINDS.ENNEMI) return 0; 
            if (l.kind === KINDS.PATRON) return 1.0;
            return 0.25; 
        })
    );

    // 2. GRAVITÉ CENTRALE (Slider: Gravity)
    simulation.force("gravityX", d3.forceX(0).strength(S.gravity));
    simulation.force("gravityY", d3.forceY(0).strength(S.gravity));

    // 3. ENNEMIS (Utilise le NOUVEAU Slider: enemyForce)
    const enemyRepulsion = (alpha) => {
        state.links.forEach(l => {
            if (l.kind !== KINDS.ENNEMI) return;
            const s = l.source; const t = l.target;
            if (!s.x || !t.x) return;

            const isBigS = (s.type === TYPES.COMPANY || s.type === TYPES.GROUP);
            const isBigT = (t.type === TYPES.COMPANY || t.type === TYPES.GROUP);
            
            let hateRadius = 900; 
            
            // Le slider définit la "Force de base", on l'amplifie selon la taille
            let forceMultiplier = S.enemyForce / 50; // Normalisation (ex: 300 / 50 = 6)

            if (isBigS && isBigT) { 
                hateRadius = 5000; // Guerre totale
                forceMultiplier *= 10; // Très violent
            } 
            else if (isBigS || isBigT) { 
                hateRadius = 2500; 
                forceMultiplier *= 2;
            }

            let dx = t.x - s.x || (Math.random() - 0.5);
            let dy = t.y - s.y || (Math.random() - 0.5);
            let distSq = dx*dx + dy*dy; 
            const dist = Math.sqrt(distSq);
            
            if (dist < hateRadius) {
                const strength = (hateRadius - dist) / hateRadius; 
                const force = strength * alpha * forceMultiplier; 
                const fx = (dx / dist) * force; const fy = (dy / dist) * force;
                t.vx += fx; t.vy += fy; s.vx -= fx; s.vy -= fy;
            }
        });
    };
    simulation.force("enemyRepulsion", enemyRepulsion);

    // 4. CHARGE GLOBALE (Slider: Repulsion)
    simulation.force("charge", d3.forceManyBody()
        .strength(n => {
            let strength = -adaptiveRepulsion; 
            if (n.type === TYPES.COMPANY) strength *= 5; 
            if (n.type === TYPES.GROUP) strength *= 3;
            const degree = nodeDegree.get(n.id) || 0;
            strength -= (degree * 150); 
            return strength;
        })
        .distanceMax(2000) 
        .distanceMin(50) 
    );

    // 5. COLLISION (Slider: Collision)
    simulation.force("collide", d3.forceCollide()
        .radius(n => nodeRadius(n) + adaptiveCollision) 
        .iterations(2)
    );

    // 6. BARRIÈRE (Gérée par l'état Globe)
    const worldRadius = 3800; 
    simulation.force("boundary", () => {
        if (!state.globeMode) return; 
        for (const n of state.nodes) {
            const d = Math.sqrt(n.x * n.x + n.y * n.y);
            if (d > worldRadius) {
                const excess = d - worldRadius;
                const angle = Math.atan2(n.y, n.x);
                n.vx -= Math.cos(angle) * (excess * 0.1); 
                n.vy -= Math.sin(angle) * (excess * 0.1);
            }
        }
    });

    // 7. TERRITOIRE (Utilise le NOUVEAU Slider: structureRepulsion)
    simulation.force("territory", () => {
        const structures = state.nodes.filter(n => n.type === TYPES.COMPANY || n.type === TYPES.GROUP);
        for (const struct of structures) {
            const territoryRadius = (struct.type === TYPES.COMPANY) ? 450 : 350; 
            for (const n of state.nodes) {
                if (n.id === struct.id || n.type === TYPES.COMPANY || n.type === TYPES.GROUP) continue;
                if (n.fx != null) continue;
                if (connectedPairs.has(`${n.id}-${struct.id}`)) continue; // Si connecté, le lien gère la distance

                const dx = n.x - struct.x; const dy = n.y - struct.y;
                const distSq = dx*dx + dy*dy; 
                const minDistSq = territoryRadius * territoryRadius;

                if (distSq < minDistSq) {
                    const dist = Math.sqrt(distSq);
                    // Ici on utilise le slider "Force Repousse Entreprise"
                    const push = (territoryRadius - dist) * S.structureRepulsion; 
                    
                    const angle = Math.atan2(dy, dx);
                    n.vx += Math.cos(angle) * push; n.vy += Math.sin(angle) * push;
                }
            }
        }
    });

    // 8. HUB HVT (ramener les noyaux vers le centre sans les coller)
    simulation.force("hub", (alpha) => {
        if (!state.nodes.length) return;
        const hubs = state.nodes
            .map(n => {
                const degree = nodeDegree.get(n.id) || 0;
                const fallback = (maxDegree > 0) ? (degree / maxDegree) : 0;
                const score = (typeof n.hvtScore === 'number') ? n.hvtScore : fallback;
                return { n, score };
            })
            .filter(h => h.score > 0.55)
            .sort((a, b) => b.score - a.score)
            .slice(0, 18);

        const pullStrength = 0.08;
        const repelRadius = 420;
        const repelStrength = 0.12;

        hubs.forEach(h => {
            const n = h.n;
            const s = h.score * alpha * pullStrength;
            n.vx += (-n.x) * s;
            n.vy += (-n.y) * s;
        });

        for (let i = 0; i < hubs.length; i++) {
            for (let j = i + 1; j < hubs.length; j++) {
                const a = hubs[i].n;
                const b = hubs[j].n;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                if (dist < repelRadius) {
                    const force = ((repelRadius - dist) / repelRadius) * repelStrength * alpha;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;
                    a.vx -= fx; a.vy -= fy;
                    b.vx += fx; b.vy += fy;
                }
            }
        }
    });

    simulation.alpha(1).restart();
}

export function getSimulation() { return simulation; }
