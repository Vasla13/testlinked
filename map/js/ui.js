import { state } from './state.js';
// On importe le rendu depuis render.js maintenant
import { renderAll, renderMarkers } from './render.js'; 
import { startDrawingZone } from './zone-editor.js';

const groupsList = document.getElementById('groups-list');
const sidebarRight = document.getElementById('sidebar-right');
const editorContent = document.getElementById('editor-content');
const chkLabels = document.getElementById('chkLabels');

export function initUI() {
    // Gestion du toggle Noms
    if(chkLabels) {
        chkLabels.addEventListener('change', (e) => {
            if(e.target.checked) document.body.classList.add('show-labels');
            else document.body.classList.remove('show-labels');
        });
        // Init state
        if(chkLabels.checked) document.body.classList.add('show-labels');
    }
}

// --- FONCTIONS DE SÉLECTION (MANQUANTES PRÉCÉDEMMENT) ---

export function selectItem(type, gIndex, index) {
    // Reset
    state.selectedPoint = null;
    state.selectedZone = null;

    if (type === 'point') {
        state.selectedPoint = { groupIndex: gIndex, pointIndex: index };
    } else if (type === 'zone') {
        state.selectedZone = { groupIndex: gIndex, zoneIndex: index };
    }

    // Mise à jour visuelle (Cercles, surbrillance...)
    renderAll();
    // Ouverture panneau
    renderEditor();
}

export function deselect() {
    state.selectedPoint = null;
    state.selectedZone = null;
    renderAll();
    closeEditor();
}

// --- RENDU UI ---

export function renderGroupsList() {
    groupsList.innerHTML = '';

    state.groups.forEach((group, idx) => {
        const item = document.createElement('div');
        item.className = 'group-item';
        
        // Header du groupe
        const header = document.createElement('div');
        header.className = 'group-header';
        
        // Checkbox Visibilité
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = group.visible;
        checkbox.style.width = 'auto'; checkbox.style.margin = '0';
        checkbox.onclick = (e) => {
            e.stopPropagation();
            group.visible = e.target.checked;
            renderAll(); // Redessine tout (zones + points)
        };

        // Indicateur couleur
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        dot.style.color = group.color;
        dot.style.backgroundColor = group.color;
        dot.style.boxShadow = `0 0 8px ${group.color}`;

        // Nom
        const nameSpan = document.createElement('span');
        nameSpan.innerText = `${group.name} (${group.points.length})`;
        nameSpan.style.flex = '1';
        nameSpan.style.fontSize = '0.9rem';
        nameSpan.style.fontWeight = '500';

        // Bouton Ajout rapide (+)
        const btnAdd = document.createElement('button');
        btnAdd.innerText = '+';
        btnAdd.className = 'mini-btn';
        btnAdd.style.width = '24px';
        btnAdd.style.padding = '0';
        btnAdd.title = "Ajouter une zone à ce groupe";
        btnAdd.onclick = (e) => {
            e.stopPropagation();
            if(confirm(`Dessiner une zone pour "${group.name}" ? (Clic gauche pour tracer, Clic droit pour finir)`)) {
                startDrawingZone(idx);
            }
        };

        header.append(checkbox, dot, nameSpan, btnAdd);
        item.appendChild(header);
        groupsList.appendChild(item);
    });
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
    // Sécurité si le point a été supprimé entre temps
    if(!group || !group.points[pointIndex]) { deselect(); return; }
    
    const point = group.points[pointIndex];

    editorContent.innerHTML = `
        <h3 style="color:${group.color}; border-bottom:1px solid ${group.color}">ÉDITION POINT</h3>
        
        <label>NOM</label>
        <input type="text" id="edName" value="${point.name}">
        
        <label>COORDONNÉES (%)</label>
        <div class="hstack">
            <input type="number" id="edX" value="${point.x.toFixed(2)}" step="0.1">
            <input type="number" id="edY" value="${point.y.toFixed(2)}" step="0.1">
        </div>

        <label>GROUPE D'APPARTENANCE</label>
        <select id="edGroup">
             ${state.groups.map((g, i) => `<option value="${i}" ${i===groupIndex ? 'selected':''}>${g.name}</option>`).join('')}
        </select>
        
        <div style="margin-top:20px;">
            <button id="btnDelete" class="btn-danger full-width">SUPPRIMER</button>
            <button id="btnClose" class="full-width" style="margin-top:5px; border-color:#555; color:#aaa;">FERMER</button>
        </div>
    `;

    bindPointEvents(point, groupIndex, pointIndex);
}

function renderZoneEditor() {
    const { groupIndex, zoneIndex } = state.selectedZone;
    const group = state.groups[groupIndex];
    // Les zones sont stockées dans .zones (nouveau standard) ou .points (ancien standard JSON si mélangé)
    // Ici on suppose que le render.js utilise group.zones pour l'index zoneIndex
    if(!group || !group.zones || !group.zones[zoneIndex]) { deselect(); return; }
    
    const zone = group.zones[zoneIndex];

    editorContent.innerHTML = `
        <h3 style="color:${group.color}; border-bottom:1px solid ${group.color}">ÉDITION ZONE</h3>
        <label>NOM DE LA ZONE</label>
        <input type="text" id="edName" value="${zone.name || 'Zone sans nom'}">
        
        <div style="margin-top:20px;">
            <button id="btnDelete" class="btn-danger full-width">SUPPRIMER ZONE</button>
            <button id="btnClose" class="full-width" style="margin-top:5px;">FERMER</button>
        </div>
    `;
    
    // Events Zone
    const inpName = document.getElementById('edName');
    inpName.oninput = (e) => { zone.name = e.target.value; }; 

    document.getElementById('btnDelete').onclick = () => {
        if(confirm("Supprimer cette zone ?")) {
            group.zones.splice(zoneIndex, 1);
            deselect();
            renderGroupsList();
            renderAll();
        }
    };
    document.getElementById('btnClose').onclick = deselect;
}

function bindPointEvents(point, groupIndex, pointIndex) {
    const inpName = document.getElementById('edName');
    inpName.oninput = (e) => { point.name = e.target.value; renderMarkers(); };

    const inpX = document.getElementById('edX');
    const inpY = document.getElementById('edY');
    const updateCoords = () => {
        point.x = parseFloat(inpX.value) || 0;
        point.y = parseFloat(inpY.value) || 0;
        renderMarkers();
    };
    inpX.oninput = updateCoords;
    inpY.oninput = updateCoords;

    const selGroup = document.getElementById('edGroup');
    selGroup.onchange = (e) => {
        const newGIndex = parseInt(e.target.value);
        // On retire du groupe actuel
        state.groups[groupIndex].points.splice(pointIndex, 1);
        // On ajoute au nouveau
        state.groups[newGIndex].points.push(point);
        
        // On met à jour la sélection
        state.selectedPoint = { groupIndex: newGIndex, pointIndex: state.groups[newGIndex].points.length - 1 };
        
        renderGroupsList();
        renderAll();
        renderEditor(); // Re-render pour mettre à jour le select
    };

    document.getElementById('btnDelete').onclick = () => {
        if(confirm("Supprimer ce point ?")) {
            state.groups[groupIndex].points.splice(pointIndex, 1);
            deselect();
            renderGroupsList();
        }
    };
    document.getElementById('btnClose').onclick = deselect;
}

export function closeEditor() {
    sidebarRight.classList.remove('active');
}