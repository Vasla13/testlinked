import { state } from './state.js';
import { renderMarkers, deselect } from './engine.js';

const groupsList = document.getElementById('groups-list');
const sidebarRight = document.getElementById('sidebar-right');
const editorContent = document.getElementById('editor-content');

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
            renderMarkers(); // Redessine selon la visibilité
        };

        // Indicateur couleur
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        dot.style.color = group.color;
        dot.style.backgroundColor = group.color;

        // Nom
        const nameSpan = document.createElement('span');
        nameSpan.innerText = `${group.name} (${group.points.length})`;
        nameSpan.style.flex = '1';

        header.append(checkbox, dot, nameSpan);
        item.appendChild(header);
        
        // Clic sur le nom pour éditer le groupe (optionnel, à implémenter si besoin)
        // header.onclick = () => { ... }

        groupsList.appendChild(item);
    });
}

export function renderEditor() {
    if (!state.selectedPoint) {
        closeEditor();
        return;
    }
    
    sidebarRight.classList.add('active');
    
    const { groupIndex, pointIndex } = state.selectedPoint;
    const group = state.groups[groupIndex];
    const point = group.points[pointIndex];

    editorContent.innerHTML = `
        <label>NOM DU POINT</label>
        <input type="text" id="edName" value="${point.name}">
        
        <label>COORDONNÉES (%)</label>
        <div style="display:flex; gap:10px;">
            <input type="number" id="edX" value="${point.x.toFixed(2)}">
            <input type="number" id="edY" value="${point.y.toFixed(2)}">
        </div>

        <label>CALQUE (GROUPE)</label>
        <select id="edGroup">
             ${state.groups.map((g, i) => `<option value="${i}" ${i===groupIndex ? 'selected':''}>${g.name}</option>`).join('')}
        </select>
        
        <label style="margin-top:10px; color:var(--accent-cyan);">NOTES</label>
        <input type="text" id="edType" value="${point.type || 'Standard'}" placeholder="Type...">

        <button id="btnDelete" class="btn-danger">SUPPRIMER POSITION</button>
        <button id="btnClose" class="mini-btn" style="width:100%; margin-top:10px;">FERMER</button>
    `;

    // Events
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
        // Déplacer le point
        group.points.splice(pointIndex, 1);
        state.groups[newGIndex].points.push(point);
        
        // Mettre à jour la sélection vers le nouvel index
        state.selectedPoint = { groupIndex: newGIndex, pointIndex: state.groups[newGIndex].points.length - 1 };
        renderGroupsList();
        renderMarkers();
        renderEditor(); // Re-render pour update le select
    };

    document.getElementById('btnDelete').onclick = () => {
        if(confirm("Supprimer définitivement ce point ?")) {
            group.points.splice(pointIndex, 1);
            deselect();
            renderGroupsList();
        }
    };
    document.getElementById('btnClose').onclick = deselect;
}

export function closeEditor() {
    sidebarRight.classList.remove('active');
}