import { state } from './state.js';
import { renderAll, getMapPercentCoords } from './render.js'; 
import { ICONS } from './constants.js';
import { percentageToGps } from './utils.js';

const groupsList = document.getElementById('groups-list');
const sidebarRight = document.getElementById('sidebar-right');
const editorContent = document.getElementById('editor-content');
const chkLabels = document.getElementById('chkLabels');
const btnMeasure = document.getElementById('btnMeasure');
const searchInput = document.getElementById('searchInput');

// Nouveaux éléments Mobile
const btnMobileMenu = document.getElementById('btnMobileMenu');
const sidebarLeft = document.getElementById('sidebar-left');
const sidebarOverlay = document.getElementById('sidebar-overlay');

// ... (Gardez le code MODALES et MENU CONTEXTUEL inchangé) ...
// --- 1. MODALES CUSTOM --- (Copier le bloc précédent)
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalContent = document.getElementById('modal-content');
const modalInputContainer = document.getElementById('modal-input-container');
const modalInput = document.getElementById('modal-input');
const modalActions = document.getElementById('modal-actions');

function showModal(title, text, type = 'alert') {
    return new Promise((resolve) => {
        if(!modalOverlay) {
            if(type === 'confirm') return resolve(confirm(text));
            if(type === 'prompt') return resolve(prompt(text));
            return resolve(alert(text));
        }
        modalTitle.innerText = title;
        modalContent.innerHTML = text;
        modalInputContainer.style.display = 'none';
        modalActions.innerHTML = '';
        modalOverlay.classList.remove('hidden');
        modalOverlay.style.display = 'flex';

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
        } else if (type === 'confirm') {
            btnCancel.onclick = () => { closeModal(); resolve(false); };
            btnConfirm.onclick = () => { closeModal(); resolve(true); };
            modalActions.append(btnCancel, btnConfirm);
        } else if (type === 'prompt') {
            modalInputContainer.style.display = 'block';
            modalInput.value = '';
            btnCancel.onclick = () => { closeModal(); resolve(null); };
            btnConfirm.onclick = () => { closeModal(); resolve(modalInput.value); };
            modalActions.append(btnCancel, btnConfirm);
            modalInput.onkeydown = (e) => { if(e.key === 'Enter') btnConfirm.click(); }
        }
    });
}
function closeModal() {
    modalOverlay.classList.add('hidden');
    setTimeout(() => { modalOverlay.style.display = 'none'; }, 200);
}
export async function customAlert(title, msg) { return showModal(title, msg, 'alert'); }
export async function customConfirm(title, msg) { return showModal(title, msg, 'confirm'); }
export async function customPrompt(title, msg) { return showModal(title, msg, 'prompt'); }

// --- 2. MENU CONTEXTUEL (Gardez le bloc précédent) ---
export function initContextMenu() {
    const menu = document.getElementById('context-menu');
    const viewport = document.getElementById('viewport'); 
    const btnNew = document.getElementById('ctx-new-point');
    const btnMeasure = document.getElementById('ctx-measure');
    const btnCancel = document.getElementById('ctx-cancel');
    let lastClickPercent = { x: 0, y: 0 };

    if (!viewport || !menu) return;

    viewport.addEventListener('contextmenu', (e) => {
        e.preventDefault(); 
        if(state.drawingMode) return; 
        lastClickPercent = getMapPercentCoords(e.clientX, e.clientY);
        let x = e.clientX; let y = e.clientY;
        if (x + 230 > window.innerWidth) x -= 230;
        if (y + 150 > window.innerHeight) y -= 150;
        menu.style.left = `${x}px`; menu.style.top = `${y}px`;
        menu.classList.add('visible');
    });
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target)) menu.classList.remove('visible');
    });
    if(btnNew) btnNew.onclick = () => {
        menu.classList.remove('visible');
        openGpsPanelWithCoords(lastClickPercent.x, lastClickPercent.y);
    };
    if(btnMeasure) btnMeasure.onclick = () => {
        menu.classList.remove('visible');
        startMeasurementAt(lastClickPercent);
    };
    if(btnCancel) btnCancel.onclick = () => { menu.classList.remove('visible'); };
}

function openGpsPanelWithCoords(xPercent, yPercent) {
    const gpsPanel = document.getElementById('gps-panel');
    const inpX = document.getElementById('gpsInputX');
    const inpY = document.getElementById('gpsInputY');
    const inpName = document.getElementById('gpsName');
    
    // Fermer le menu mobile si ouvert (UX)
    if(sidebarLeft) sidebarLeft.classList.remove('mobile-active');
    if(sidebarOverlay) sidebarOverlay.classList.remove('active');

    if(gpsPanel) {
        gpsPanel.style.display = 'block';
        const gpsCoords = percentageToGps(xPercent, yPercent);
        if(inpX) inpX.value = gpsCoords.x.toFixed(2);
        if(inpY) inpY.value = gpsCoords.y.toFixed(2);
        if(inpName) { inpName.value = ''; setTimeout(() => inpName.focus(), 100); }
    }
}

function startMeasurementAt(coords) {
    const btnMeasure = document.getElementById('btnMeasure');
    state.measuringMode = true;
    state.measureStep = 1; 
    state.measurePoints = [coords, coords]; 
    if(btnMeasure) btnMeasure.classList.add('active');
    document.body.style.cursor = 'crosshair';
    renderAll();
}


// --- 3. INITIALISATION UI (Modifié pour Mobile) ---
export function initUI() {
    initContextMenu(); 

    // LOGIQUE MOBILE MENU
    if(btnMobileMenu && sidebarLeft) {
        btnMobileMenu.onclick = () => {
            sidebarLeft.classList.toggle('mobile-active');
            if(sidebarOverlay) sidebarOverlay.classList.toggle('active');
        };
    }

    // Fermeture via Overlay
    if(sidebarOverlay) {
        sidebarOverlay.onclick = () => {
            sidebarLeft.classList.remove('mobile-active');
            sidebarOverlay.classList.remove('active');
        };
    }

    // Recherche
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.searchTerm = e.target.value.toLowerCase();
            renderGroupsList();
        });
    }

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
            renderAll();
        };
    }
}

// ... (Le reste du fichier: renderGroupsList, selectItem, renderEditor reste identique à la version précédente) ...
export function renderGroupsList() {
    groupsList.innerHTML = '';
    const term = state.searchTerm || "";
    state.groups.forEach((group, gIdx) => {
        const matchingPoints = group.points.filter(p => p.name.toLowerCase().includes(term) || (p.type && p.type.toLowerCase().includes(term)));
        if (term !== "" && matchingPoints.length === 0) return;

        const item = document.createElement('div');
        item.className = 'group-item';
        const header = document.createElement('div');
        header.className = 'group-header';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = group.visible;
        checkbox.onclick = (e) => { e.stopPropagation(); group.visible = e.target.checked; renderAll(); };
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        dot.style.color = group.color; dot.style.backgroundColor = group.color;
        const nameSpan = document.createElement('span');
        const count = term !== "" ? matchingPoints.length : group.points.length;
        nameSpan.innerText = `${group.name} (${count})`;
        nameSpan.style.flex = '1';
        header.append(checkbox, dot, nameSpan);
        item.appendChild(header);

        if (term !== "") {
            const subList = document.createElement('div');
            subList.style.paddingLeft = '30px'; subList.style.fontSize = '0.85rem'; subList.style.paddingBottom = '5px';
            matchingPoints.forEach(p => {
                const pRow = document.createElement('div');
                pRow.innerText = `• ${p.name}`;
                pRow.style.cursor = 'pointer'; pRow.style.color = '#8892b0'; pRow.style.padding = '2px 0';
                pRow.onclick = () => {
                    const realIndex = group.points.indexOf(p);
                    selectPoint(gIdx, realIndex);
                    // Sur mobile, on ferme le menu après sélection pour voir la map
                    if(window.innerWidth <= 768) {
                        sidebarLeft.classList.remove('mobile-active');
                        sidebarOverlay.classList.remove('active');
                    }
                    import('./engine.js').then(eng => {
                         state.view.scale = 3.0;
                         if(state.mapWidth) {
                             state.view.x = (window.innerWidth/2) - (p.x * state.mapWidth/100)*3.0;
                             state.view.y = (window.innerHeight/2) - (p.y * state.mapHeight/100)*3.0;
                             eng.updateTransform();
                         }
                    });
                };
                subList.appendChild(pRow);
            });
            item.appendChild(subList);
        }
        groupsList.appendChild(item);
    });
}

export function deselect() { state.selectedPoint = null; state.selectedZone = null; renderAll(); closeEditor(); }
export function selectItem(type, gIndex, index) { 
    if(state.linkingMode && type === 'point') return;
    if (type === 'point') { state.selectedPoint = { groupIndex: gIndex, pointIndex: index }; state.selectedZone = null; } 
    else if (type === 'zone') { state.selectedZone = { groupIndex: gIndex, zoneIndex: index }; state.selectedPoint = null; } 
    else { state.selectedPoint = null; state.selectedZone = null; }
    renderAll(); renderEditor(); 
}
export function selectPoint(groupIndex, pointIndex) { selectItem('point', groupIndex, pointIndex); }

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
        <div class="editor-section">
            <div class="editor-section-title">IDENTIFICATION</div>
            <div style="margin-bottom:10px;"><input type="text" id="edName" value="${point.name}" class="cyber-input" style="font-weight:bold; font-size:1.1rem; color:var(--accent-cyan);"></div>
            <div class="editor-row"><div class="editor-col"><input type="text" id="edType" value="${point.type || ''}" placeholder="Affiliation" class="cyber-input"></div></div>
        </div>
        <div class="editor-section" style="border-left-color: var(--accent-orange);">
            <div class="editor-section-title" style="color:var(--accent-orange);">CLASSIFICATION</div>
            <div class="editor-row"><div class="editor-col"><select id="edIcon" class="cyber-input">${iconOptions}</select></div></div>
            <div style="margin-top:10px;"><select id="edGroup" class="cyber-input">${state.groups.map((g, i) => `<option value="${i}" ${i===groupIndex ? 'selected':''}>${g.name}</option>`).join('')}</select></div>
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

    // Bindings
    document.getElementById('edName').oninput = (e) => { point.name = e.target.value; renderAll(); };
    document.getElementById('edIcon').onchange = (e) => { point.iconType = e.target.value; renderAll(); };
    document.getElementById('edType').oninput = (e) => { point.type = e.target.value; };
    document.getElementById('edNotes').oninput = (e) => { point.notes = e.target.value; };
    const inpX = document.getElementById('edX'); const inpY = document.getElementById('edY');
    const updateCoords = () => { point.x = parseFloat(inpX.value)||0; point.y = parseFloat(inpY.value)||0; renderAll(); };
    inpX.oninput = updateCoords; inpY.oninput = updateCoords;
    const selGroup = document.getElementById('edGroup');
    selGroup.onchange = (e) => {
        const newGIndex = parseInt(e.target.value);
        group.points.splice(pointIndex, 1);
        state.groups[newGIndex].points.push(point);
        state.selectedPoint = { groupIndex: newGIndex, pointIndex: state.groups[newGIndex].points.length - 1 };
        renderGroupsList(); renderAll(); renderEditor();
    };
    document.getElementById('btnCopyCoords').onclick = () => {
        const gps = percentageToGps(point.x, point.y);
        navigator.clipboard.writeText(`${gps.x.toFixed(2)}, ${gps.y.toFixed(2)}`);
    };
    document.getElementById('btnDelete').onclick = async () => {
        if(await customConfirm("SUPPRESSION", "Supprimer ?")) {
            group.points.splice(pointIndex, 1); deselect(); renderGroupsList();
        }
    };
    document.getElementById('btnClose').onclick = deselect;
}

export function closeEditor() { sidebarRight.classList.remove('active'); }