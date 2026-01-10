import { loadState, state, pushHistory } from './state.js';
import { restartSim } from './physics.js';
import { initUI, refreshLists } from './ui.js';
import { updatePersonColors } from './logic.js'; 

window.addEventListener('load', () => {
    initUI();
    const hasData = loadState();
    if (!hasData) {
        pushHistory();
        state.nodes = [];
    }
    updatePersonColors();
    refreshLists();
    restartSim();
});