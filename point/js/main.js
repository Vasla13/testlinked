import { loadState, state, pushHistory } from './state.js';
import { restartSim } from './physics.js';
import { initUI, refreshLists } from './ui.js';
import { updatePersonColors } from './logic.js'; // Important de mettre à jour les couleurs au chargement

window.addEventListener('load', () => {
    // 1. Initialiser l'UI
    initUI();

    // 2. Charger les données
    const hasData = loadState();
    if (!hasData) {
        // Données par défaut si vide
        pushHistory();
        state.nodes = [];
    }

    // 3. Calculer les couleurs initiales (mix)
    updatePersonColors();

    // 4. Lancer la simu et l'affichage
    refreshLists();
    restartSim();
});