import { loadState, state, pushHistory } from './state.js';
import { restartSim } from './physics.js';
import { initUI, refreshLists } from './ui.js';
import { updatePersonColors } from './logic.js'; 
import { resizeCanvas } from './render.js';

window.addEventListener('load', () => {
    // 1. Initialiser UI et Injection CSS
    initUI();

    // 2. Données
    const hasData = loadState();
    if (!hasData) {
        pushHistory();
        state.nodes = [];
    }
    updatePersonColors();
    refreshLists();
    
    // 3. Physique
    restartSim();

    // 4. Correction affichage resize
    const centerDiv = document.getElementById('center');
    if (centerDiv) {
        const observer = new ResizeObserver(() => requestAnimationFrame(() => resizeCanvas()));
        observer.observe(centerDiv);
    } else {
        resizeCanvas();
    }
    setTimeout(resizeCanvas, 100);
});