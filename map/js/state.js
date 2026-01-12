export const state = {
    groups: [],
    
    // NOUVEAU : Liens tactiques (lignes entre points)
    tacticalLinks: [], // { from: {g, p}, to: {g, p}, color: string }

    view: { x: 0, y: 0, scale: 0.5 },
    
    // Interaction
    isDragging: false,
    lastMouse: { x: 0, y: 0 },
    
    // Sélection
    selectedPoint: null,
    selectedZone: null,

    // Outils Édition Zone
    drawingMode: false,
    drawingGroupIndex: null,
    tempPoints: [],
    
    // NOUVEAU : Outil de mesure (Règle)
    measuringMode: false,
    measureStep: 0, // 0: inactif, 1: premier point posé, 2: terminé
    measurePoints: [], // [ {x,y}, {x,y} ]

    // NOUVEAU : Mode liaison
    linkingMode: false,
    linkStart: null,

    // NOUVEAU : Filtres
    statusFilter: 'ALL', // 'ALL', 'ACTIVE', 'DANGER', 'INACTIVE'
    
    mapWidth: 0,
    mapHeight: 0
};

export function setGroups(newGroups) { state.groups = newGroups; }

export function exportToJSON() {
    const data = { 
        meta: { date: new Date().toISOString() },
        groups: state.groups,
        tacticalLinks: state.tacticalLinks // Sauvegarde des liens
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tactical_map_data.json';
    a.click();
}