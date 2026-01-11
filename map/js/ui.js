import { state } from './state.js';
import { renderAll } from './render.js';
import { leafletToPct } from './engine.js';

const groupsList = document.getElementById('groups-list');
const sidebarRight = document.getElementById('sidebar-right');
const editorContent = document.getElementById('editor-content');

// --- LISTE DES GROUPES ---
export function renderGroupsList() {
    groupsList.innerHTML = '';
    state.groups.forEach((group, idx) => {
        const item = document.createElement('div');
        item.className = 'group-item';
        
        item.innerHTML = `
            <div class="group-header">
                <input type="checkbox" class="vis-check" ${group.visible ? 'checked' : ''}>
                <div class="color-dot" style="background:${group.color}; box-shadow:0 0 5px ${group.color}"></div>
                <span style="flex:1; font-weight:bold; font-size:0.9rem;">${group.name}</span>
                
                <div style="display:flex; gap:5px;">
                    <button class="mini-btn btn-add-route" title="Tracer Route">⚡</button>
                    <button class="mini-btn btn-add-zone" title="Dessiner Zone">⬠</button>
                </div>
            </div>
            <div style="font-size:0.65rem; color:#666; padding-left:28px; padding-bottom:5px;">
                ${group.points.length} Pts · ${group.zones ? group.zones.length : 0} Zones · ${group.routes ? group.routes.length : 0} Routes
            </div>
        `;

        // Events
        item.querySelector('.vis-check').onclick = (e) => { e.stopPropagation(); group.visible = e.target.checked; renderAll(); };
        
        // Bouton ZONE
        item.querySelector('.btn-add-zone').onclick = (e) => {
            e.stopPropagation();
            startDrawing(idx, 'zone');
        };

        // Bouton ROUTE
        item.querySelector('.btn-add-route').onclick = (e) => {
            e.stopPropagation();
            startDrawing(idx, 'route');
        };

        groupsList.appendChild(item);
    });
}

// --- LOGIQUE DE DESSIN ---
function startDrawing(groupIndex, type) {
    state.drawingMode = true;
    state.drawingType = type;
    state.drawingGroupIndex = groupIndex;
    state.tempPoints = [];
    
    // Curseur spécial
    document.getElementById('map-world').style.cursor = 'crosshair';
    deselect();
    alert(`MODE DESSIN ACTIVÉ (${type.toUpperCase()})\n• Clic Gauche : Placer point\n• Clic Droit : Terminer`);
}

// Cette fonction doit être appelée depuis engine.js lors des clics map
export function handleMapClick(latlng, isRightClick) {
    if (!state.drawingMode) return false; // On ne fait rien si pas en mode dessin

    if (isRightClick) {
        // Finir le dessin
        if (state.tempPoints.length >= 2) {
            const group = state.groups[state.drawingGroupIndex];
            const newItem = { name: (state.drawingType === 'zone' ? "Nouvelle Zone" : "Trajet"), points: [...state.tempPoints] };
            
            if (state.drawingType === 'zone') group.zones.push(newItem);
            else group.routes.push(newItem);
            
            renderGroupsList();
        }
        // Reset
        state.drawingMode = false;
        state.tempPoints = [];
        document.getElementById('map-world').style.cursor = '';
        renderAll();
        return true; // Stop propagation
    } else {
        // Ajouter point
        state.tempPoints.push(leafletToPct(latlng));
        renderAll(); // Affiche le trait temporaire
        return true;
    }
}


// --- SELECTION & EDITION ---
export function selectItem(type, gIndex, itemIndex) {
    state.selectedItem = { type, groupIndex: gIndex, itemIndex };
    renderAll(); renderEditor();
}

export function deselect() {
    state.selectedItem = null;
    renderAll();
    sidebarRight.classList.remove('active');
}

export function renderEditor() {
    if (!state.selectedItem) { sidebarRight.classList.remove('active'); return; }
    sidebarRight.classList.add('active');

    const { type, groupIndex, itemIndex } = state.selectedItem;
    const group = state.groups[groupIndex];
    
    let data;
    if (type === 'point') data = group.points[itemIndex];
    else if (type === 'zone') data = group.zones[itemIndex];
    else if (type === 'route') data = group.routes[itemIndex];

    if (!data) return;

    let title = "ÉLÉMENT";
    if(type === 'point') title = "📍 POSITION";
    if(type === 'zone') title = "⬠ TERRITOIRE";
    if(type === 'route') title = "⚡ ITINÉRAIRE";

    editorContent.innerHTML = `
        <div style="color:var(--accent-cyan); font-size:0.8rem; margin-bottom:10px; font-weight:bold;">${title}</div>
        
        <label>NOM</label>
        <input type="text" id="edName" value="${data.name}">
        
        <label>CALQUE</label>
        <select id="edGroup">${state.groups.map((g, i) => `<option value="${i}" ${i===groupIndex?'selected':''}>${g.name}</option>`).join('')}</select>

        ${type === 'point' ? `
        <div style="display:flex; gap:10px;">
            <input type="number" id="edX" value="${data.x.toFixed(2)}"><input type="number" id="edY" value="${data.y.toFixed(2)}">
        </div>` : `<div style="font-size:0.7rem; color:#666; margin-bottom:10px;">Forme géométrique (${data.points.length} points)</div>`}

        <button id="btnDelete" class="btn-danger">SUPPRIMER</button>
        <button id="btnClose" class="mini-btn" style="width:100%; margin-top:10px;">FERMER</button>
    `;

    // Events simples
    document.getElementById('edName').oninput = (e) => { data.name = e.target.value; renderAll(); };
    document.getElementById('btnDelete').onclick = () => {
        if(confirm("Supprimer ?")) {
            if(type==='point') group.points.splice(itemIndex, 1);
            else if(type==='zone') group.zones.splice(itemIndex, 1);
            else group.routes.splice(itemIndex, 1);
            deselect(); renderGroupsList();
        }
    };
    document.getElementById('btnClose').onclick = deselect;
    
    // Changement de groupe (Logic de transfert simplifiée)
    document.getElementById('edGroup').onchange = (e) => {
        const newIdx = parseInt(e.target.value);
        if(newIdx === groupIndex) return;
        
        // Remove from old
        if(type==='point') group.points.splice(itemIndex, 1);
        else if(type==='zone') group.zones.splice(itemIndex, 1);
        else group.routes.splice(itemIndex, 1);
        
        // Add to new
        const newGrp = state.groups[newIdx];
        if(type==='point') { newGrp.points.push(data); state.selectedItem = {type, groupIndex: newIdx, itemIndex: newGrp.points.length-1}; }
        else if(type==='zone') { newGrp.zones.push(data); state.selectedItem = {type, groupIndex: newIdx, itemIndex: newGrp.zones.length-1}; }
        else { newGrp.routes.push(data); state.selectedItem = {type, groupIndex: newIdx, itemIndex: newGrp.routes.length-1}; }
        
        renderGroupsList(); renderAll(); renderEditor();
    };
}