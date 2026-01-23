import { loadState, state, pushHistory } from './state.js';
import { restartSim } from './physics.js';
import { initUI, refreshLists, selectNode } from './ui.js'; 
import { updatePersonColors } from './logic.js'; 
import { resizeCanvas, draw } from './render.js';

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

    // --- FIX NAVIGATION RETOUR (Map -> Point) ---
    const params = new URLSearchParams(window.location.search);
    const focusId = params.get('focus');
    
    if (focusId) {
        // Recherche : Soit ID direct, soit ID map lié
        const targetNode = state.nodes.find(n => n.id === focusId || n.linkedMapPointId === focusId);

        if (targetNode) {
            console.log("🕸️ Retour Map détecté. Cible :", targetNode.name);

            // 1. Centrage Physique (La caméra se déplace)
            state.view.x = -targetNode.x * state.view.scale;
            state.view.y = -targetNode.y * state.view.scale;
            restartSim();

            // 2. Sélection SIMPLE (Sans cacher les autres)
            state.selection = targetNode.id;
            
            // CORRECTION ICI : On désactive le mode Focus pour tout voir
            state.focusMode = false; 
            state.focusSet.clear();
            
            // On ouvre le panneau latéral de la cible
            selectNode(targetNode.id);
            draw();

            // 3. Effet Visuel (Target Locked)
            const rightPanel = document.getElementById('right');
            if(rightPanel) {
                rightPanel.classList.remove('target-locked');
                void rightPanel.offsetWidth; // Reset animation
                rightPanel.classList.add('target-locked');
            }
            
            // 4. Notification
            const notif = document.createElement('div');
            notif.className = 'target-notification';
            notif.innerHTML = `LIAISON RÉTABLIE<br><span style="font-size:0.8em; color:white;">${targetNode.name}</span>`;
            document.body.appendChild(notif);
            setTimeout(() => notif.remove(), 3000);
        }
    }
});