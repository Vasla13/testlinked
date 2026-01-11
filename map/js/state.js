export const state = {
    // Liste des groupes de points
    groups: [],
    
    // État de la vue (Caméra)
    view: {
        x: 0,
        y: 0,
        scale: 1
    },
    
    // Interaction
    isDragging: false,
    lastMouse: { x: 0, y: 0 },
    
    // Sélection active
    selectedPoint: null, // { groupIndex: number, pointIndex: number }

    // Dimensions de l'image (pour calculs précis)
    mapWidth: 0,
    mapHeight: 0
};

export function setGroups(newGroups) {
    state.groups = newGroups;
}

// Fonction utilitaire pour sauvegarder
export function exportToJSON() {
    const data = { 
        meta: { date: new Date().toISOString() },
        groups: state.groups 
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'map_data_tactical.json';
    a.click();
}