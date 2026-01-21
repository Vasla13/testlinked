export const state = {
    groups: [],
    tacticalLinks: [],
    view: { x: 0, y: 0, scale: 0.5 },
    
    // Interaction Map
    isDragging: false,
    lastMouse: { x: 0, y: 0 },
    
    // Sélection
    selectedPoint: null, // { groupIndex, pointIndex }
    selectedZone: null,  // { groupIndex, zoneIndex }

    // Outils & Modes
    drawingMode: false,      // Mode création
    drawingType: null,       // 'CIRCLE' ou 'POLYGON'
    drawingGroupIndex: null,
    tempZone: null,          // Données temporaires pendant la création
    tempPoints: [],          // Legacy (Polygone)
    
    draggingItem: null,      // { type: 'zone'|'point', groupIndex, index, startX, startY }

    measuringMode: false,
    measureStep: 0,
    measurePoints: [],
    
    linkingMode: false,
    linkStartId: null, 

    statusFilter: 'ALL',
    searchTerm: '',
    mapWidth: 0,
    mapHeight: 0
};

export function generateID() {
    return 'id_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

export function findPointById(id) {
    for (const group of state.groups) {
        const p = group.points.find(pt => pt.id === id);
        if (p) return p;
    }
    return null;
}

// --- LIENS TACTIQUES ---
export function addTacticalLink(idA, idB) {
    if (!idA || !idB || idA === idB) return false;
    const exists = state.tacticalLinks.find(l => 
        (l.from === idA && l.to === idB) || (l.from === idB && l.to === idA)
    );
    if (exists) return false;

    state.tacticalLinks.push({
        id: generateID(),
        from: idA, to: idB,
        color: '#ffffff', type: 'Standard'
    });
    return true;
}

export function removeTacticalLink(linkId) {
    state.tacticalLinks = state.tacticalLinks.filter(l => l.id !== linkId);
}

export function updateTacticalLink(linkId, newData) {
    const link = state.tacticalLinks.find(l => l.id === linkId);
    if (link) Object.assign(link, newData);
}

// --- INITIALISATION DONNÉES ---
export function setGroups(newGroups) { 
    newGroups.forEach(g => {
        if(!g.zones) g.zones = [];
        g.points.forEach(p => {
            if(!p.id) p.id = generateID();
            if(!p.iconType) p.iconType = "DEFAULT";
            if(!p.status) p.status = "ACTIVE";
        });
        g.zones.forEach(z => {
            if(!z.id) z.id = generateID();
            if(!z.type) z.type = 'POLYGON'; // Compatibilité ancienne version
        });
    });
    state.groups = newGroups; 
    
    if(state.tacticalLinks) {
        state.tacticalLinks.forEach(l => {
            if(!l.id) l.id = generateID();
            if(!l.type) l.type = 'Standard';
        });
    }
}

export function exportToJSON() {
    const data = { 
        meta: { date: new Date().toISOString(), version: "2.2" },
        groups: state.groups,
        tacticalLinks: state.tacticalLinks
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tactical_map_data_v2.2.json';
    a.click();
}