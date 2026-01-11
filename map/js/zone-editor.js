import { state } from './state.js';
import { renderZones, renderAll } from './render.js';
import { getMapPercentCoords } from './engine.js';
import { renderGroupsList, deselect } from './ui.js';

export function startDrawingZone(groupIndex) {
    state.drawingMode = true;
    state.drawingGroupIndex = groupIndex;
    state.tempPoints = [];
    
    document.body.classList.add('drawing-mode');
    document.getElementById('draw-hint').style.display = 'block';
    
    // On désélectionne tout pour éviter les conflits
    deselect(); 
    renderAll();
}

export function handleDrawingClick(e) {
    // Clic Gauche : Ajouter point
    if (e.button === 0) {
        const coords = getMapPercentCoords(e.clientX, e.clientY);
        state.tempPoints.push(coords);
        renderZones(); // Update visuel
    }
    // Clic Droit : Finir ou Annuler
    else if (e.button === 2) {
        e.preventDefault();
        finishDrawing();
    }
}

function finishDrawing() {
    if (state.tempPoints.length >= 3) {
        // Sauvegarder la zone
        const newZone = {
            name: "Nouveau Territoire",
            points: [...state.tempPoints] // Copie
        };
        state.groups[state.drawingGroupIndex].zones.push(newZone);
        alert("Zone créée avec succès !");
    } else if (state.tempPoints.length > 0) {
        alert("Annulé : Il faut au moins 3 points pour une zone.");
    }

    // Reset
    state.drawingMode = false;
    state.drawingGroupIndex = null;
    state.tempPoints = [];
    document.body.classList.remove('drawing-mode');
    document.getElementById('draw-hint').style.display = 'none';
    
    renderGroupsList(); // Mettre à jour les compteurs
    renderAll();
}