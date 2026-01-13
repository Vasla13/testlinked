import { state } from './state.js';
import { renderAll } from './render.js';
import { startDrawingZone } from './zone-editor.js';

const groupsList = document.getElementById('groups-list');
const sidebarRight = document.getElementById('sidebar-right');
const editorContent = document.getElementById('editor-content');
const chkLabels = document.getElementById('chkLabels');

export function initUI() {
    if(chkLabels) {
        chkLabels.addEventListener('change', (e) => {
            if(e.target.checked) document.body.classList.add('show-labels');
            else document.body.classList.remove('show-labels');
        });
        if(chkLabels.checked) document.body.classList.add('show-labels');
    }

    const btnMeasure = document.getElementById('btnMeasure');
    if(btnMeasure) {
        btnMeasure.onclick = () => {
            state.measuringMode = !state.measuringMode;
            state.measureStep = 0;
            state.measurePoints = [];
            btnMeasure.classList.toggle('active', state.measuringMode);
            document.body.style.cursor = state.measuringMode ? 'crosshair' : 'default';
            renderAll();
        };
    }
}

export function renderEditor() {
    if (state.selectedPoint) {
        sidebarRight.classList.add('active');
        renderPointEditor();
    } else if (state.selectedZone) {
        sidebarRight.classList.add('active');
        renderZoneEditor();
    } else {
        closeEditor();
    }
}

function renderPointEditor() {
    const { groupIndex, pointIndex } = state.selectedPoint;
    const group = state.groups[groupIndex];
    if(!group || !group.points[pointIndex]) { deselect(); return; }
    
    const point = group.points[pointIndex];
    const status = point.status || 'ACTIVE';

    // Ajout du champ NOTES et affichage de l'ID (lecture seule)
    editorContent.innerHTML = `
        <h3 style="color:${group.color}; border-bottom:1px solid ${group.color}">TACTICAL DATA</h3>
        
        <div style="font-size:0.7rem; color:#555; margin-bottom:5px;">ID: ${point.id}</div>

        <label>IDENTITY</label>
        <input type="text" id="edName" value="${point.name}">
        
        <label>NOTES</label>
        <textarea id="edNotes" class="notes-textarea" placeholder="R.A.S.">${point.notes || ''}</textarea>

        <label>COORDINATES</label>
        <div class="hstack">
            <input type="number" id="edX" value="${point.x.toFixed(2)}" step="0.1">
            <input type="number" id="edY" value="${point.y.toFixed(2)}" step="0.1">
        </div>

        <label>ICONOGRAPHY</label>
        <select id="edIcon">
            <option value="DEFAULT" ${point.iconType === 'DEFAULT' ? 'selected':''}>⚫ Standard</option>
            <option value="HQ" ${point.iconType === 'HQ' ? 'selected':''}>🏰 QG / Base</option>
            <option value="HOSTILE" ${point.iconType === 'HOSTILE' ? 'selected':''}>💀 Hostile</option>
            <option value="BUSINESS" ${point.iconType === 'BUSINESS' ? 'selected':''}>💰 Business</option>
            <option value="GARAGE" ${point.iconType === 'GARAGE' ? 'selected':''}>🚗 Garage</option>
            <option value="INFO" ${point.iconType === 'INFO' ? 'selected':''}>ℹ️ Info</option>
        </select>

        <label>STATUS</label>
        <div class="status-selector" style="display:flex; gap:5px; margin-bottom:10px;">
            <button class="mini-btn ${status === 'ACTIVE' ? 'active' : ''}" onclick="window.updateStatus('ACTIVE')">ON</button>
            <button class="mini-btn danger ${status === 'DANGER' ? 'active' : ''}" onclick="window.updateStatus('DANGER')">DANGER</button>
            <button class="mini-btn ${status === 'INACTIVE' ? 'active' : ''}" style="opacity:0.5;" onclick="window.updateStatus('INACTIVE')">OFF</button>
        </div>

        <label>LAYER</label>
        <select id="edGroup">
             ${state.groups.map((g, i) => `<option value="${i}" ${i===groupIndex ? 'selected':''}>${g.name}</option>`).join('')}
        </select>
        
        <div style="margin-top:20px; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">
            <label>ACTIONS TACTIQUES</label>
            <button id="btnLink" class="mini-btn">🔗 LIAISON</button>
            <button id="btnDelete" class="btn-danger full-width">SUPPRIMER</button>
            <button id="btnClose" class="full-width" style="margin-top:5px; border-color:#555; color:#aaa;">FERMER</button>
        </div>
    `;

    bindPointEvents(point, groupIndex, pointIndex);
}

window.updateStatus = (newStatus) => {
    if(state.selectedPoint) {
        const { groupIndex, pointIndex } = state.selectedPoint;
        state.groups[groupIndex].points[pointIndex].status = newStatus;
        renderAll();
        renderPointEditor();
    }
};

function bindPointEvents(point, groupIndex, pointIndex) {
    document.getElementById('edName').oninput = (e) => { point.name = e.target.value; renderAll(); };
    document.getElementById('edNotes').oninput = (e) => { point.notes = e.target.value; }; // Pas besoin de re-render
    document.getElementById('edIcon').onchange = (e) => { point.iconType = e.target.value; renderAll(); };

    const inpX = document.getElementById('edX');
    const inpY = document.getElementById('edY');
    const updateCoords = () => {
        point.x = parseFloat(inpX.value) || 0;
        point.y = parseFloat(inpY.value) || 0;
        renderAll();
    };
    inpX.oninput = updateCoords;
    inpY.oninput = updateCoords;

    document.getElementById('edGroup').onchange = (e) => {
        const newGIndex = parseInt(e.target.value);
        state.groups[groupIndex].points.splice(pointIndex, 1);
        state.groups[newGIndex].points.push(point);
        state.selectedPoint = { groupIndex: newGIndex, pointIndex: state.groups[newGIndex].points.length - 1 };
        renderGroupsList(); renderAll(); renderEditor();
    };
    
    // Création de lien : On stocke l'ID
    document.getElementById('btnLink').onclick = () => {
        state.linkingMode = true; 
        state.linkStartId = point.id; // STOCKE ID
        document.body.style.cursor = 'cell';
        document.getElementById('btnLink').innerText = "CIBLE ?";
    };

    document.getElementById('btnDelete').onclick = () => {
        if(confirm("Supprimer ce point ?")) {
            // Nettoyage des liens associés à ce point
            const pid = point.id;
            state.tacticalLinks = state.tacticalLinks.filter(l => l.from !== pid && l.to !== pid);
            
            state.groups[groupIndex].points.splice(pointIndex, 1);
            deselect();
            renderGroupsList(); renderAll();
        }
    };
    document.getElementById('btnClose').onclick = deselect;
}

function renderZoneEditor() {
    const { groupIndex, zoneIndex } = state.selectedZone;
    const group = state.groups[groupIndex];
    if(!group || !group.zones || !group.zones[zoneIndex]) { deselect(); return; }
    
    const zone = group.zones[zoneIndex];

    editorContent.innerHTML = `
        <h3 style="color:${group.color}; border-bottom:1px solid ${group.color}">ÉDITION ZONE</h3>
        <div style="font-size:0.7rem; color:#555; margin-bottom:5px;">ID: ${zone.id}</div>
        <label>NOM DE LA ZONE</label>
        <input type="text" id="edName" value="${zone.name || 'Zone sans nom'}">
        <div style="margin-top:20px;">
            <button id="btnDelete" class="btn-danger full-width">SUPPRIMER ZONE</button>
            <button id="btnClose" class="full-width" style="margin-top:5px;">FERMER</button>
        </div>
    `;
    
    document.getElementById('edName').oninput = (e) => { zone.name = e.target.value; }; 
    document.getElementById('btnDelete').onclick = () => {
        if(confirm("Supprimer cette zone ?")) {
            group.zones.splice(zoneIndex, 1);
            deselect(); renderGroupsList(); renderAll();
        }
    };
    document.getElementById('btnClose').onclick = deselect;
}

export function selectItem(type, gIndex, index) {
    // LOGIQUE DE LIAISON
    if(state.linkingMode && type === 'point') {
        const targetGroup = state.groups[gIndex];
        const targetPoint = targetGroup.points[index];
        
        if(state.linkStartId && targetPoint && targetPoint.id !== state.linkStartId) {
            if(!state.tacticalLinks) state.tacticalLinks = [];
            state.tacticalLinks.push({
                from: state.linkStartId,
                to: targetPoint.id,
                color: '#73fbf7'
            });
        }
        
        state.linkingMode = false;
        state.linkStartId = null;
        document.body.style.cursor = 'default';
        renderAll();
        renderEditor();
        return;
    }

    state.selectedPoint = null;
    state.selectedZone = null;

    if (type === 'point') {
        state.selectedPoint = { groupIndex: gIndex, pointIndex: index };
    } else if (type === 'zone') {
        state.selectedZone = { groupIndex: gIndex, zoneIndex: index };
    }
    renderAll();
    renderEditor();
}

export function deselect() {
    state.selectedPoint = null;
    state.selectedZone = null;
    renderAll();
    closeEditor();
}

export function closeEditor() { sidebarRight.classList.remove('active'); }

export function renderGroupsList() {
    groupsList.innerHTML = '';
    state.groups.forEach((group, idx) => {
        const item = document.createElement('div');
        item.className = 'group-item';
        const header = document.createElement('div');
        header.className = 'group-header';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = group.visible;
        checkbox.style.width = 'auto'; checkbox.style.margin = '0';
        checkbox.onclick = (e) => { e.stopPropagation(); group.visible = e.target.checked; renderAll(); };

        const dot = document.createElement('div');
        dot.className = 'color-dot';
        dot.style.color = group.color; dot.style.backgroundColor = group.color; dot.style.boxShadow = `0 0 8px ${group.color}`;

        const nameSpan = document.createElement('span');
        nameSpan.innerText = `${group.name} (${group.points.length})`;
        nameSpan.style.flex = '1'; nameSpan.style.fontSize = '0.9rem'; nameSpan.style.fontWeight = '500';

        const btnAdd = document.createElement('button');
        btnAdd.innerText = '+'; btnAdd.className = 'mini-btn'; btnAdd.style.width = '24px'; btnAdd.style.padding = '0';
        btnAdd.onclick = (e) => { e.stopPropagation(); if(confirm(`Créer zone pour "${group.name}" ?`)) startDrawingZone(idx); };

        header.append(checkbox, dot, nameSpan, btnAdd);
        item.appendChild(header);
        groupsList.appendChild(item);
    });
}