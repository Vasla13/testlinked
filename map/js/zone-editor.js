// map/js/zone-editor.js
import { state } from './state.js';
import { renderAll, getMapPercentCoords } from './render.js';
import { selectItem } from './ui.js';
// AJOUT : Import de l'alerte custom
import { customAlert } from './ui-modals.js';

export function startDrawingZone(groupIndex) {
    state.drawingMode = true;
    state.drawingGroupIndex = groupIndex;
    state.tempPoints = [];
    document.body.style.cursor = 'crosshair';
    
    // Désélectionner pour éviter la confusion visuelle
    if(state.selectedPoint || state.selectedZone) selectItem(null); 
    
    renderAll();
}

export function handleDrawingClick(e) {
    // Clic Gauche : Ajouter un point
    if (e.button === 0) {
        const coords = getMapPercentCoords(e.clientX, e.clientY);
        state.tempPoints.push(coords);
        renderAll();
    } 
    // Clic Droit : Finir le dessin
    else if (e.button === 2) {
        e.preventDefault();
        finishDrawing();
    }
}

async function finishDrawing() {
    if (state.tempPoints.length < 3) {
        // CORRECTION : Utilisation de customAlert au lieu de alert()
        await customAlert("ATTENTION", "Une zone tactique doit comporter au moins 3 points.");
        cancelDrawing();
        return;
    }

    const group = state.groups[state.drawingGroupIndex];
    if (group) {
        // Initialiser le tableau de zones s'il n'existe pas
        if(!group.zones) group.zones = [];
        
        group.zones.push({
            name: "Nouvelle Zone",
            points: [...state.tempPoints]
        });
        
        // Sélectionner automatiquement la nouvelle zone
        selectItem('zone', state.drawingGroupIndex, group.zones.length - 1);
    }

    cancelDrawing();
}

export function cancelDrawing() {
    state.drawingMode = false;
    state.drawingGroupIndex = null;
    state.tempPoints = [];
    document.body.style.cursor = 'default';
    renderAll();
}