import { state } from './state.js';
import { renderAll } from './render.js'; 
import { ICONS } from './constants.js';

const groupsList = document.getElementById('groups-list');
const sidebarRight = document.getElementById('sidebar-right');
const editorContent = document.getElementById('editor-content');
const chkLabels = document.getElementById('chkLabels');
const btnMeasure = document.getElementById('btnMeasure');

// --- SYSTÈME DE MODALES CUSTOM ---
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalContent = document.getElementById('modal-content');
const modalInputContainer = document.getElementById('modal-input-container');
const modalInput = document.getElementById('modal-input');
const modalActions = document.getElementById('modal-actions');

function showModal(title, text, type = 'alert') {
    return new Promise((resolve) => {
        // Reset
        modalTitle.innerText = title;
        modalContent.innerHTML = text; // Permet le HTML
        modalInputContainer.style.display = 'none';
        modalActions.innerHTML = '';
        modalOverlay.classList.remove('hidden');
        modalOverlay.style.display = 'flex'; // Force flex

        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn-modal-cancel';
        btnCancel.innerText = 'ANNULER';
        
        const btnConfirm = document.createElement('button');
        btnConfirm.className = 'btn-modal-confirm';
        btnConfirm.innerText = 'CONFIRMER';

        if (type === 'alert') {
            btnConfirm.innerText = 'OK';
            btnConfirm.onclick = () => { closeModal(); resolve(true); };
            modalActions.appendChild(btnConfirm);
            btnConfirm.focus();
        } 
        else if (type === 'confirm') {
            btnCancel.onclick = () => { closeModal(); resolve(false); };
            btnConfirm.onclick = () => { closeModal(); resolve(true); };
            modalActions.append(btnCancel, btnConfirm);
            btnConfirm.focus();
        }
        else if (type === 'prompt') {
            modalInputContainer.style.display = 'block';
            modalInput.value = '';
            btnCancel.onclick = () => { closeModal(); resolve(null); };
            btnConfirm.onclick = () => { closeModal(); resolve(modalInput.value); };
            modalActions.append(btnCancel, btnConfirm);
            setTimeout(() => modalInput.focus(), 100);
            
            // Valider avec Entrée
            modalInput.onkeydown = (e) => {
                if(e.key === 'Enter') btnConfirm.click();
            }
        }
    });
}

function closeModal() {
    modalOverlay.classList.add('hidden');
    setTimeout(() => { modalOverlay.style.display = 'none'; }, 200);
}

// Export des fonctions simplifiées pour le reste de l'app
export async function customAlert(title, msg) { return showModal(title, msg, 'alert'); }
export async function customConfirm(title, msg) { return showModal(title, msg, 'confirm'); }
export async function customPrompt(title, msg) { return showModal(title, msg, 'prompt'); }


// --- INITIALISATION UI ---
export function initUI() {
    if(chkLabels) {
        chkLabels.addEventListener('change', (e) => {
            if(e.target.checked) document.body.classList.add('show-labels');
            else document.body.classList.remove('show-labels');
        });
        if(chkLabels.checked) document.body.classList.add('show-labels');
    }
    if(btnMeasure) {
        btnMeasure.onclick = () => {
            state.measuringMode = !state.measuringMode;
            state.measureStep = 0;
            state.measurePoints = [];
            if(state.measuringMode) btnMeasure.classList.add('active');
            else btnMeasure.classList.remove('active');
            document.body.style.cursor = state.measuringMode ? 'crosshair' : 'default';
            renderAll();
        };
    }
}

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
        dot.style.color = group.color; dot.style.backgroundColor = group.color;

        const nameSpan = document.createElement('span');
        nameSpan.innerText = `${group.name} (${group.points.length})`;
        nameSpan.style.flex = '1';

        header.append(checkbox, dot, nameSpan);
        item.appendChild(header);
        groupsList.appendChild(item);
    });
}

export function deselect() {
    state.selectedPoint = null;
    state.selectedZone = null;
    renderAll();
    closeEditor();
}

export function selectItem(type, gIndex, index) {
    if(state.linkingMode && type === 'point') return;
    if (type === 'point') {
        state.selectedPoint = { groupIndex: gIndex, pointIndex: index };
        state.selectedZone = null;
    } else if (type === 'zone') {
        state.selectedZone = { groupIndex: gIndex, zoneIndex: index };
        state.selectedPoint = null;
    }
    renderAll();
    renderEditor();
}

export function selectPoint(groupIndex, pointIndex) {
    selectItem('point', groupIndex, pointIndex);
}

export function renderEditor() {
    if (!state.selectedPoint) { closeEditor(); return; }
    
    sidebarRight.classList.add('active');
    const { groupIndex, pointIndex } = state.selectedPoint;
    const group = state.groups[groupIndex];
    if (!group || !group.points[pointIndex]) { deselect(); return; }
    const point = group.points[pointIndex];

    let iconOptions = '';
    for (const [key, val] of Object.entries(ICONS)) {
        const isSelected = (point.iconType === key) ? 'selected' : '';
        iconOptions += `<option value="${key}" ${isSelected}>${key}</option>`;
    }

    editorContent.innerHTML = `
        <div style="margin-bottom:15px; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
            <label style="color:var(--accent-cyan);">IDENTIFICATION</label>
            <input type="text" id="edName" value="${point.name}" style="font-weight:bold; font-size:1rem;">
        </div>
        <div style="margin-bottom:10px;">
            <label>TYPE / ICÔNE</label>
            <select id="edIcon">${iconOptions}</select>
        </div>
        <div style="margin-bottom:10px;">
            <label>AFFILIATION</label>
            <input type="text" id="edType" value="${point.type || ''}" placeholder="Ex: Ballas, LSPD...">
        </div>
        <div style="margin-bottom:10px;">
            <label>NOTES</label>
            <textarea id="edNotes" placeholder="Détails tactiques...">${point.notes || ''}</textarea>
        </div>
        <div style="margin-bottom:10px;">
            <label>CALQUE</label>
            <select id="edGroup">
                 ${state.groups.map((g, i) => `<option value="${i}" ${i===groupIndex ? 'selected':''}>${g.name}</option>`).join('')}
            </select>
        </div>
        <div style="margin-top:20px; border-top:1px solid var(--border-color); padding-top:15px;">
            <button id="btnDelete" class="btn-danger">SUPPRIMER POSITION</button>
            <button id="btnClose" class="mini-btn" style="width:100%; margin-top:10px;">FERMER</button>
        </div>
    `;

    document.getElementById('edName').oninput = (e) => { point.name = e.target.value; renderAll(); };
    document.getElementById('edIcon').onchange = (e) => { point.iconType = e.target.value; renderAll(); };
    document.getElementById('edType').oninput = (e) => { point.type = e.target.value; };
    document.getElementById('edNotes').oninput = (e) => { point.notes = e.target.value; };

    const selGroup = document.getElementById('edGroup');
    selGroup.onchange = (e) => {
        const newGIndex = parseInt(e.target.value);
        group.points.splice(pointIndex, 1);
        state.groups[newGIndex].points.push(point);
        state.selectedPoint = { groupIndex: newGIndex, pointIndex: state.groups[newGIndex].points.length - 1 };
        renderGroupsList(); renderAll(); renderEditor();
    };

    // UTILISATION DE LA NOUVELLE MODALE "customConfirm"
    document.getElementById('btnDelete').onclick = async () => {
        const ok = await customConfirm("SUPPRESSION", "Voulez-vous vraiment supprimer ce point tactique ?<br>Cette action est irréversible.");
        if(ok) {
            group.points.splice(pointIndex, 1);
            deselect(); renderGroupsList();
        }
    };
    document.getElementById('btnClose').onclick = deselect;
}

export function closeEditor() {
    sidebarRight.classList.remove('active');
}