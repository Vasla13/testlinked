import { state, loadState, saveState } from './state.js';
import { initPhysics, restartSim } from './physics.js';
import { initUI, refreshLists, renderEditor } from './ui.js';
import { resizeCanvas } from './render.js';

console.log("System Start...");

// Chargement
loadState();

// Init Modules
initPhysics();
initUI();

// Lancement
resizeCanvas();
refreshLists();
renderEditor();
restartSim();

// Sauvegarde auto
window.addEventListener('beforeunload', saveState);

// Auto-save periodique (5s)
setInterval(saveState, 5000);