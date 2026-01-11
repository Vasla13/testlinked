export const state = {
    groups: [],
    view: { x: 0, y: 0, scale: 1 },
    selectedItem: null, // { type: 'point' | 'zone' | 'route', groupIndex, itemIndex }
    lastRightClickPos: null,
    
    // État Dessin
    drawingMode: false,     // true si on dessine
    drawingType: null,      // 'zone' ou 'route' <--- NOUVEAU
    drawingGroupIndex: null,
    tempPoints: [],

    mapWidth: 0,
    mapHeight: 0
};

// Fonction de mise à jour des groupes pour s'assurer que 'routes' existe
export function setGroups(newGroups) {
    newGroups.forEach(g => {
        if (!g.points) g.points = [];
        if (!g.zones) g.zones = [];
        if (!g.routes) g.routes = []; // <--- NOUVEAU
    });
    state.groups = newGroups;
}

export function exportToJSON() {
    const data = { groups: state.groups };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'map_data_tactical.json';
    a.click();
}