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
    
    // --- REPULSION ADAPTATIVE (Demande Discord) ---
    // On calcule le nombre de liens pour chaque nœud (degré)
    // Plus un nœud a de liens, plus il doit repousser les autres pour faire de la place
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
            // --- DISTANCES HIERARCHIQUES ---
            // Patron/Haut gradé : TRÈS proche (collé à l'entreprise)
            if (l.kind === KINDS.PATRON) return 40;
            if (l.kind === KINDS.HAUT_GRADE) return 55;

            // Famille/Amour : Proche
            if (l.kind === KINDS.FAMILLE) return 60;
            if (l.kind === KINDS.AMOUR) return 50;

            // Affiliation (Groupe <-> Entreprise) : Plus souple et loin
            if (l.kind === KINDS.AFFILIATION) return 380;

            // Employé / Membre / Ami : Standard
            if (l.kind === KINDS.EMPLOYE) return 180;
            
            return 130;
        })
        .strength(l => {
            // Souplesse des liens
            if (l.kind === KINDS.AFFILIATION) return 0.1; // Très mou (évite collisions rigides)
            if (l.kind === KINDS.PATRON) return 1.5;      // Très rigide (ne lâche pas l'entreprise)
            if (l.kind === KINDS.AMOUR) return 0.9;
            return 0.3;
        })
    );

    simulation.force("charge", d3.forceManyBody()
        .strength(n => {
            // Base de répulsion
            let base = -300;
            
            // Les structures repoussent beaucoup plus par défaut
            if (n.type === TYPES.COMPANY) base = -1000;
            if (n.type === TYPES.GROUP) base = -700;

            // Ajout proportionnel au nombre de liens :
            // "force de répulsion sur les point non relié a lui proportionnel au nombre de point relié a lui"
            const degree = nodeDegree.get(n.id) || 0;
            const degreeFactor = -80; // Chaque lien ajoute -80 de répulsion

            return base + (degree * degreeFactor);
        })
        .distanceMax(1600) // Rayon d'action augmenté pour les grosses structures
    );

    simulation.force("collide", d3.forceCollide()
        .radius(n => nodeRadius(n) + 15) // Marge de collision
        .iterations(2)
    );

    simulation.force("center", d3.forceCenter(0, 0).strength(0.04));
    
    // Réchauffe la simulation
    simulation.alpha(1).restart();
}

export function getSimulation() { return simulation; }