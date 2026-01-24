export const state = {
    groups: [],
    tacticalLinks: [],
    view: { x: 0, y: 0, scale: 0.5 },
    
    isDragging: false,
    lastMouse: { x: 0, y: 0 },
    selectedPoint: null, 
    selectedZone: null,

    drawingMode: false,
    drawingType: null,
    drawingGroupIndex: null,
    tempZone: null,
    tempPoints: [],
    
    isFreeMode: false,
    isFreeDrawing: false,
    drawingPending: false,
    
    drawOptions: { width: 2, style: 'solid' },
    
    draggingMarker: null, 

    measuringMode: false,
    measureStep: 0,
    measurePoints: [],
    
    linkingMode: false,
    linkStartId: null, 

    statusFilter: 'ALL',
    searchTerm: '',
    labelMode: 'auto',

    currentFileName: null,

    mapWidth: 0,
    mapHeight: 0
};

// --- HISTORIQUE ---
const history = [];
const MAX_HISTORY = 50; 

export function pushHistory() {
    const snapshot = JSON.stringify({
        groups: state.groups,
        tacticalLinks: state.tacticalLinks
    });
    if (history.length > 0 && history[history.length - 1] === snapshot) return;
    history.push(snapshot);
    if (history.length > MAX_HISTORY) history.shift();
}

export function undo() {
    if (history.length === 0) return false;
    try {
        const prevJSON = history.pop();
        const prevData = JSON.parse(prevJSON);
        state.groups = prevData.groups;
        state.tacticalLinks = prevData.tacticalLinks || [];
        return true;
    } catch (e) {
        console.error("Erreur Undo:", e);
        return false;
    }
}

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

export function addTacticalLink(idA, idB) {
    if (!idA || !idB || idA === idB) return false;
    const exists = state.tacticalLinks.find(l => 
        (l.from === idA && l.to === idB) || (l.from === idB && l.to === idA)
    );
    if (exists) return false;
    state.tacticalLinks.push({ id: generateID(), from: idA, to: idB, color: null, type: 'Standard' });
    return true;
}

export function removeTacticalLink(linkId) {
    state.tacticalLinks = state.tacticalLinks.filter(l => l.id !== linkId);
}

export function updateTacticalLink(linkId, newData) {
    const link = state.tacticalLinks.find(l => l.id === linkId);
    if (link) Object.assign(link, newData);
}

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
            if(!z.type) z.type = 'POLYGON'; 
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

// Helper pour récupérer les données proprement
export function getMapData() {
    return { 
        meta: { date: new Date().toISOString(), version: "2.5" },
        groups: state.groups,
        tacticalLinks: state.tacticalLinks
    };
}

export function exportToJSON(fileNameOverride) {
    const data = getMapData();
    
    let finalName = fileNameOverride;
    if (!finalName) {
         if (state.currentFileName) {
             finalName = state.currentFileName;
         } else {
             const now = new Date();
             const dateStr = now.toISOString().split('T')[0];
             const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
             finalName = `carte_tactique_${dateStr}_${timeStr}`;
         }
    }
    if (!finalName.endsWith('.json')) finalName += '.json';

    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}

export function saveLocalState() {
    const data = {
        groups: state.groups,
        tacticalLinks: state.tacticalLinks,
        currentFileName: state.currentFileName,
        meta: { date: new Date().toISOString(), savedBy: "AutoSave" }
    };
    try { localStorage.setItem('tacticalMapData', JSON.stringify(data)); } catch (e) {}
}

export function loadLocalState() {
    try {
        const json = localStorage.getItem('tacticalMapData');
        if (!json) return null;
        return JSON.parse(json);
    } catch (e) { return null; }
}