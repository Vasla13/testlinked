export const state = {
    groups: [],
    tacticalLinks: [], // Format: { from: "id_point_A", to: "id_point_B", color: "..." }
    view: { x: 0, y: 0, scale: 0.5 },
    
    // Interaction
    isDragging: false,
    lastMouse: { x: 0, y: 0 },
    
    // Sélection
    selectedPoint: null, // { groupIndex, pointIndex } (pour l'édition rapide)
    selectedZone: null,

    // Outils
    drawingMode: false,
    drawingGroupIndex: null,
    tempPoints: [],
    measuringMode: false,
    measureStep: 0,
    measurePoints: [],
    
    linkingMode: false,
    linkStartId: null, // On stocke l'ID maintenant, plus l'index

    statusFilter: 'ALL',
    mapWidth: 0,
    mapHeight: 0
};

// Générateur d'ID unique simple
export function generateID() {
    return 'id_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Recherche un point par son ID unique
export function findPointById(id) {
    for (const group of state.groups) {
        const p = group.points.find(pt => pt.id === id);
        if (p) return p;
    }
    return null;
}

export function setGroups(newGroups) { 
    // MIGRATION AUTOMATIQUE : On s'assure que tout le monde a un ID
    newGroups.forEach(g => {
        if(!g.zones) g.zones = [];
        g.points.forEach(p => {
            if(!p.id) p.id = generateID();
            if(!p.iconType) p.iconType = "DEFAULT";
            if(!p.status) p.status = "ACTIVE";
        });
        g.zones.forEach(z => {
            if(!z.id) z.id = generateID();
        });
    });
    state.groups = newGroups; 
}

export function exportToJSON() {
    const data = { 
        meta: { date: new Date().toISOString(), version: "2.0" },
        groups: state.groups,
        tacticalLinks: state.tacticalLinks
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tactical_map_data_v2.json';
    a.click();
}