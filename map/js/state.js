export const state = {
    groups: [],
    tacticalLinks: [], // Format: { id: "uid", from: "id_A", to: "id_B", color: "#fff", type: "standard" }
    view: { x: 0, y: 0, scale: 0.5 },
    
    // Interaction
    isDragging: false,
    lastMouse: { x: 0, y: 0 },
    
    // Sélection
    selectedPoint: null, // { groupIndex, pointIndex }
    selectedZone: null,

    // Outils
    drawingMode: false,
    drawingGroupIndex: null,
    tempPoints: [],
    
    measuringMode: false,
    measureStep: 0,
    measurePoints: [],
    
    // --- NOUVEAU : MODE LIAISON ---
    linkingMode: false,
    linkStartId: null, 

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

// --- GESTION DES LIENS TACTIQUES ---

export function addTacticalLink(idA, idB) {
    if (!idA || !idB || idA === idB) return false;

    // Vérifier si le lien existe déjà (dans un sens ou l'autre)
    const exists = state.tacticalLinks.find(l => 
        (l.from === idA && l.to === idB) || (l.from === idB && l.to === idA)
    );
    if (exists) return false;

    state.tacticalLinks.push({
        id: generateID(),
        from: idA,
        to: idB,
        color: '#ffffff',
        type: 'Standard'
    });
    return true;
}

export function removeTacticalLink(linkId) {
    state.tacticalLinks = state.tacticalLinks.filter(l => l.id !== linkId);
}

export function updateTacticalLink(linkId, newData) {
    const link = state.tacticalLinks.find(l => l.id === linkId);
    if (link) {
        Object.assign(link, newData);
    }
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
    
    // Migration liens (ajout ID si manquant)
    if(state.tacticalLinks) {
        state.tacticalLinks.forEach(l => {
            if(!l.id) l.id = generateID();
            if(!l.type) l.type = 'Standard';
        });
    }
}

export function exportToJSON() {
    const data = { 
        meta: { date: new Date().toISOString(), version: "2.1" },
        groups: state.groups,
        tacticalLinks: state.tacticalLinks
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tactical_map_data_v2.json';
    a.click();
}