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
    
    simulation.force("link", d3.forceLink(state.links)
        .id(d => d.id)
        .distance(l => {
            if (l.kind === KINDS.AFFILIATION) return 350;
            if (l.kind === KINDS.PATRON) return 90;
            if (l.kind === KINDS.EMPLOYE) return 200;
            if (l.kind === KINDS.FAMILLE) return 80;
            return 130;
        })
        .strength(l => {
            if (l.kind === KINDS.AFFILIATION) return 0.05;
            if (l.kind === KINDS.AMOUR) return 0.9;
            return 0.3;
        })
    );

    simulation.force("charge", d3.forceManyBody()
        .strength(n => {
            if (n.type === TYPES.COMPANY) return -1400;
            if (n.type === TYPES.GROUP) return -900;
            return -300;
        })
        .distanceMax(1200)
    );

    simulation.force("collide", d3.forceCollide()
        .radius(n => nodeRadius(n) + 10)
        .iterations(2)
    );

    simulation.force("center", d3.forceCenter(0, 0).strength(0.03));
    
    // Réchauffe la simulation
    simulation.alpha(1).restart();
}

export function getSimulation() { return simulation; }