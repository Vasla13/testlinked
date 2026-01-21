// map/js/ui-editor.js
import { state } from './state.js';
import { ICONS } from './constants.js';
import { customConfirm, customAlert } from './ui-modals.js';
import { percentageToGps } from './utils.js';
import { renderAll } from './render.js';
// CORRECTION : renderGroupsList vient de ui-list.js, deselect vient de ui.js
import { renderGroupsList } from './ui-list.js';
import { deselect } from './ui.js';

const sidebarRight = document.getElementById('sidebar-right');
const editorContent = document.getElementById('editor-content');

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

    const groupOptions = state.groups.map((g, i) => 
        `<option value="${i}" ${i===groupIndex ? 'selected':''}>${g.name}</option>`
    ).join('');

    editorContent.innerHTML = `
        <div class="editor-section">
            <div class="editor-section-title" style="display:flex; justify-content:space-between; align-items:center;">
                <span>IDENTIFICATION</span>
                <button id="btnCopyId" class="mini-btn" style="font-size:0.7rem; border:1px solid var(--accent-cyan); color:var(--accent-cyan); padding: 2px 6px;">COPIER ID</button>
            </div>
            <div style="margin-bottom:10px;">
                <input type="text" id="edName" value="${point.name}" class="cyber-input" style="font-weight:bold; font-size:1.1rem; color:var(--accent-cyan);">
            </div>
            <div class="editor-row">
                <div class="editor-col"><input type="text" id="edType" value="${point.type || ''}" placeholder="Affiliation" class="cyber-input"></div>
            </div>
        </div>
        
        <div class="editor-section" style="border-left-color: #fff;">
            <div class="editor-section-title" style="color:#fff;">ACTIONS TACTIQUES</div>
            <button id="btnLinkPoint" class="mini-btn" style="width:100%; padding:10px; margin-bottom:5px; background:rgba(255,255,255,0.1); border:1px dashed #fff;">
                🔗 CRÉER UNE LIAISON
            </button>
        </div>

        <div class="editor-section" style="border-left-color: var(--accent-orange);">
            <div class="editor-section-title" style="color:var(--accent-orange);">CLASSIFICATION</div>
            <div class="editor-row">
                <div class="editor-col"><select id="edIcon" class="cyber-input">${iconOptions}</select></div>
            </div>
            <div style="margin-top:10px;">
                <label style="font-size:0.8rem; color:#888;">Groupe</label>
                <select id="edGroup" class="cyber-input">${groupOptions}</select>
            </div>
        </div>

        <div class="editor-section" style="border-left-color: #fff;">
            <div class="editor-section-title" style="color:#fff;">POSITION</div>
            <div class="editor-row">
                <div class="editor-col"><input type="number" id="edX" value="${point.x.toFixed(2)}" step="0.1" class="cyber-input"></div>
                <div class="editor-col"><input type="number" id="edY" value="${point.y.toFixed(2)}" step="0.1" class="cyber-input"></div>
            </div>
            <button id="btnCopyCoords" class="btn-close-editor" style="margin-top:5px;">COPIER CORDS (GTA)</button>
        </div>

        <div class="editor-section" style="border-left-color: var(--accent-pink);">
            <div class="editor-section-title" style="color:var(--accent-pink);">INTEL</div>
            <textarea id="edNotes" class="cyber-input" placeholder="Notes...">${point.notes || ''}</textarea>
        </div>

        <div style="margin-top:10px;">
            <button id="btnDelete" class="btn-delete-zone">SUPPRIMER</button>
            <button id="btnClose" class="btn-close-editor">FERMER</button>
        </div>
    `;

    setupEditorListeners(point, group, groupIndex, pointIndex);
}

function setupEditorListeners(point, group, groupIndex, pointIndex) {
    document.getElementById('edName').oninput = (e) => { point.name = e.target.value; renderAll(); };
    document.getElementById('edIcon').onchange = (e) => { point.iconType = e.target.value; renderAll(); };
    document.getElementById('edType').oninput = (e) => { point.type = e.target.value; };
    document.getElementById('edNotes').oninput = (e) => { point.notes = e.target.value; };

    const updateCoords = () => { 
        point.x = parseFloat(document.getElementById('edX').value)||0; 
        point.y = parseFloat(document.getElementById('edY').value)||0; 
        renderAll(); 
    };
    document.getElementById('edX').oninput = updateCoords;
    document.getElementById('edY').oninput = updateCoords;

    document.getElementById('edGroup').onchange = (e) => {
        const newGIndex = parseInt(e.target.value);
        group.points.splice(pointIndex, 1);
        state.groups[newGIndex].points.push(point);
        state.selectedPoint = { groupIndex: newGIndex, pointIndex: state.groups[newGIndex].points.length - 1 };
        renderGroupsList(); 
        renderAll(); 
        renderEditor();
    };

    document.getElementById('btnLinkPoint').onclick = () => {
        state.linkingMode = true;
        state.linkStartId = point.id;
        closeEditor();
        customAlert("MODE LIAISON ACTIF", "Cliquez maintenant sur un second point pour créer le lien.");
        document.body.style.cursor = 'crosshair';
    };

    document.getElementById('btnCopyId').onclick = () => {
        navigator.clipboard.writeText(point.id).then(() => {
            const btn = document.getElementById('btnCopyId');
            btn.innerText = "COPIÉ";
            setTimeout(() => btn.innerText = "COPIER ID", 1000);
        });
    };

    document.getElementById('btnCopyCoords').onclick = () => {
        const gps = percentageToGps(point.x, point.y);
        navigator.clipboard.writeText(`${gps.x.toFixed(2)}, ${gps.y.toFixed(2)}`);
    };

    document.getElementById('btnDelete').onclick = async () => {
        if(await customConfirm("SUPPRESSION", "Supprimer ce point définitivement ?")) {
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