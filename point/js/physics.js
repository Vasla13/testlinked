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
    if (state.forceSimulation) return; // Pause
    draw();
}

export function restartSim() {
    if (!simulation) initPhysics();

    simulation.nodes(state.nodes);
    
    // 1. Calcul du nombre de liens par noeud (Degré)
    // Plus un noeud est connecté, plus il doit avoir d'espace autour de lui
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
            // Distances hiérarchiques
            if (l.kind === KINDS.AFFILIATION) return 400; // Très loin pour les groupes affiliés
            if (l.kind === KINDS.PATRON) return 50;       // Patron collé à la boite
            if (l.kind === KINDS.HAUT_GRADE) return 70;   // Cadre proche
            if (l.kind === KINDS.FAMILLE) return 60;
            if (l.kind === KINDS.AMOUR) return 50;
            if (l.kind === KINDS.EMPLOYE) return 180;     // Employé standard
            return 140;
        })
        .strength(l => {
            if (l.kind === KINDS.AFFILIATION) return 0.1; // Lien souple
            if (l.kind === KINDS.PATRON) return 1.2;      // Lien rigide
            return 0.3;
        })
    );

    simulation.force("charge", d3.forceManyBody()
        .strength(n => {
            // Force de base
            let strength = -400;
            
            if (n.type === TYPES.COMPANY) strength = -1200;
            if (n.type === TYPES.GROUP) strength = -900;

            // BONUS REPULSION : Proportionnel au nombre de liens
            // Chaque connexion ajoute -100 de répulsion.
            // Une entreprise avec 10 employés aura -1200 + (-100 * 10) = -2200 de force
            // Cela "nettoie" la zone autour d'elle.
            const degree = nodeDegree.get(n.id) || 0;
            strength -= (degree * 120); 

            return strength;
        })
        .distanceMax(2000) // Augmenté pour que la répulsion agisse de loin
    );

    simulation.force("collide", d3.forceCollide()
        .radius(n => nodeRadius(n) + 20) // Marge de sécurité entre les points
        .iterations(3)
    );

    simulation.force("center", d3.forceCenter(0, 0).strength(0.04));
    
    simulation.alpha(1).restart();
}

export function getSimulation() { return simulation; }