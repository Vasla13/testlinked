import { loadState, state, pushHistory } from './state.js';
import { restartSim } from './physics.js';
import { initUI, refreshLists } from './ui.js';
import { updatePersonColors } from './logic.js'; 
import { resizeCanvas } from './render.js';

window.addEventListener('load', () => {
    // 1. UI et Données
    initUI();
    const hasData = loadState();
    if (!hasData) {
        pushHistory();
        state.nodes = [];
    }
    updatePersonColors();
    refreshLists();
    
    // 2. Initialisation Canvas & Physique
    restartSim();

    // 3. SOLUTION BUG AFFICHAGE : ResizeObserver
    // Cela surveille le conteneur principal. Si sa taille change (F5, zoom, chargement CSS),
    // on force le redimensionnement du canvas.
    const centerDiv = document.getElementById('center');
    if (centerDiv) {
        const observer = new ResizeObserver(() => {
            requestAnimationFrame(() => {
                resizeCanvas();
            });
        });
        observer.observe(centerDiv);
    } else {
        // Fallback si pas d'observer
        resizeCanvas();
    }
    
    // 4. Force un resize après un court délai pour être sûr que le CSS est chargé
    setTimeout(resizeCanvas, 100);
});