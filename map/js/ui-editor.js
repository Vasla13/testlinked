import { state } from './state.js';
import { ICONS } from './constants.js';
import { customConfirm, customAlert } from './ui-modals.js';
// CORRECTION : On importe aussi gpsToPercentage pour la conversion inverse
import { percentageToGps, gpsToPercentage } from './utils.js';
import { renderAll } from './render.js';
import { renderGroupsList } from './ui-list.js';
import { deselect } from './ui.js';

const sidebarRight = document.getElementById('sidebar-right');
const editorContent = document.getElementById('editor-content');

export function renderEditor() {
    // Cas 1 : Point sélectionné
    if (state.selectedPoint) {
        renderPointEditor();
        return;
    }
    // Cas 2 : Zone sélectionnée
    if (state.selectedZone) {
        renderZoneEditor();
        return;
    }
    closeEditor();
}

// --- EDITEUR ZONE ---
function renderZoneEditor() {
    sidebarRight.classList.add('active');
    const { groupIndex, zoneIndex } = state.selectedZone;
    const group = state.groups[groupIndex];
    if (!group || !group.zones[zoneIndex]) { deselect(); return; }
    
    const zone = group.zones[zoneIndex];
    const isCircle = (zone.type === 'CIRCLE');

    // CONVERSION : On calcule les coordonnées GPS pour l'affichage
    // (zone.cx/cy sont en %, on veut afficher des mètres)
    const gpsCoords = percentageToGps(zone.cx || 0, zone.cy || 0);

    // Options pour changer de groupe
    const groupOptions = state.groups.map((g, i) => 
        `<option value="${i}" ${i===groupIndex ? 'selected':''}>${g.name}</option>`
    ).join('');

    editorContent.innerHTML = `
        <div class="editor-section" style="border-left-color: ${group.color};">
            <div class="editor-section-title">ZONE TACTIQUE (${isCircle ? 'CERCLE' : 'POLYGONE'})</div>
            <div style="margin-bottom:10px;">
                <input type="text" id="ezName" value="${zone.name}" class="cyber-input" style="font-weight:bold; color:${group.color};">
            </div>
        </div>

        ${isCircle ? `
        <div class="editor-section" style="border-left-color: #fff;">
            <div class="editor-section-title">GÉOMÉTRIE (GPS)</div>
            <div class="editor-row">
                <div class="editor-col"><label>Rayon (Visuel)</label><input type="number" id="ezR" value="${(zone.r||0).toFixed(2)}" step="0.1" class="cyber-input"></div>
            </div>
            <div class="editor-row" style="margin-top:5px;">
                <div class="editor-col"><label>X</label><input type="number" id="ezX" value="${gpsCoords.x.toFixed(2)}" step="1" class="cyber-input"></div>
                <div class="editor-col"><label>Y</label><input type="number" id="ezY" value="${gpsCoords.y.toFixed(2)}" step="1" class="cyber-input"></div>
            </div>
        </div>
        ` : `
        <div class="editor-section">
            <div class="editor-section-title">GÉOMÉTRIE</div>
            <p style="font-size:0.8rem; color:#888;">Forme libre (${zone.points.length} points).<br>Déplacez la zone à la souris.</p>
        </div>
        `}

        <div class="editor-section" style="border-left-color: var(--accent-orange);">
            <div class="editor-section-title">GROUPE</div>
            <select id="ezGroup" class="cyber-input">${groupOptions}</select>
        </div>

        <div style="margin-top:20px;">
            <button id="btnDeleteZone" class="btn-delete-zone">SUPPRIMER ZONE</button>
            <button id="btnClose" class="btn-close-editor">FERMER</button>
        </div>
    `;

    // Listeners Zone
    document.getElementById('ezName').oninput = (e) => { zone.name = e.target.value; renderAll(); };
    document.getElementById('ezGroup').onchange = (e) => {
        const newG = parseInt(e.target.value);
        group.zones.splice(zoneIndex, 1);
        state.groups[newG].zones.push(zone);
        state.selectedZone = { groupIndex: newG, zoneIndex: state.groups[newG].zones.length - 1 };
        renderGroupsList(); renderAll(); renderEditor();
    };

    if(isCircle) {
        const inpR = document.getElementById('ezR');
        const inpX = document.getElementById('ezX');
        const inpY = document.getElementById('ezY');
        
        const update = () => {
            // Rayon reste en % pour l'instant (visuel)
            zone.r = parseFloat(inpR.value) || 0;
            
            // CONVERSION INVERSE : L'utilisateur tape du GPS, on stocke du %
            const valX = parseFloat(inpX.value) || 0;
            const valY = parseFloat(inpY.value) || 0;
            
            const percentCoords = gpsToPercentage(valX, valY);
            zone.cx = percentCoords.x;
            zone.cy = percentCoords.y;
            
            renderAll();
        };
        inpR.oninput = update;
        inpX.oninput = update;
        inpY.oninput = update;
    }

    document.getElementById('btnDeleteZone').onclick = async () => {
        if(await customConfirm("SUPPRESSION", "Supprimer cette zone ?")) {
            group.zones.splice(zoneIndex, 1);
            deselect();
        }
    };
    document.getElementById('btnClose').onclick = deselect;
}

// --- EDITEUR POINT (Inchangé mais inclus pour cohérence) ---
function renderPointEditor() {
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
                <button id="btnCopyId" class="mini-btn" style="font-size:0.7rem; padding: 2px 6px;">ID</button>
            </div>
            <div style="margin-bottom:10px;">
                <input type="text" id="edName" value="${point.name}" class="cyber-input" style="font-weight:bold; font-size:1.1rem; color:var(--accent-cyan);">
            </div>
            <div class="editor-row">
                <div class="editor-col"><input type="text" id="edType" value="${point.type || ''}" placeholder="Affiliation" class="cyber-input"></div>
            </div>
        </div>
        
        <div class="editor-section" style="border-left-color: #fff;">
            <div class="editor-section-title">ACTIONS TACTIQUES</div>
            <button id="btnLinkPoint" class="mini-btn" style="width:100%; padding:10px; margin-bottom:5px; background:rgba(255,255,255,0.1); border:1px dashed #fff;">
                🔗 CRÉER UNE LIAISON
            </button>
        </div>

        <div class="editor-section" style="border-left-color: var(--accent-orange);">
            <div class="editor-section-title">CLASSIFICATION</div>
            <div class="editor-row">
                <div class="editor-col"><select id="edIcon" class="cyber-input">${iconOptions}</select></div>
            </div>
            <div style="margin-top:10px;">
                <label style="font-size:0.8rem; color:#888;">Groupe</label>
                <select id="edGroup" class="cyber-input">${groupOptions}</select>
            </div>
        </div>

        <div class="editor-section" style="border-left-color: #fff;">
            <div class="editor-section-title">POSITION</div>
            <div class="editor-row">
                <div class="editor-col"><input type="number" id="edX" value="${point.x.toFixed(2)}" step="0.1" class="cyber-input"></div>
                <div class="editor-col"><input type="number" id="edY" value="${point.y.toFixed(2)}" step="0.1" class="cyber-input"></div>
            </div>
            <button id="btnCopyCoords" class="btn-close-editor" style="margin-top:5px;">COPIER CORDS (GTA)</button>
        </div>

        <div class="editor-section" style="border-left-color: var(--accent-pink);">
            <div class="editor-section-title">INTEL</div>
            <textarea id="edNotes" class="cyber-input" placeholder="Notes...">${point.notes || ''}</textarea>
        </div>

        <div style="margin-top:10px;">
            <button id="btnDelete" class="btn-delete-zone">SUPPRIMER POINT</button>
            <button id="btnClose" class="btn-close-editor">FERMER</button>
        </div>
    `;

    document.getElementById('edName').oninput = (e) => { point.name = e.target.value; renderAll(); };
    document.getElementById('edIcon').onchange = (e) => { point.iconType = e.target.value; renderAll(); };
    document.getElementById('edType').oninput = (e) => { point.type = e.target.value; };
    document.getElementById('edNotes').oninput = (e) => { point.notes = e.target.value; };
    const updateCoords = () => { point.x = parseFloat(document.getElementById('edX').value)||0; point.y = parseFloat(document.getElementById('edY').value)||0; renderAll(); };
    document.getElementById('edX').oninput = updateCoords;
    document.getElementById('edY').oninput = updateCoords;
    document.getElementById('edGroup').onchange = (e) => {
        const newGIndex = parseInt(e.target.value);
        group.points.splice(pointIndex, 1);
        state.groups[newGIndex].points.push(point);
        state.selectedPoint = { groupIndex: newGIndex, pointIndex: state.groups[newGIndex].points.length - 1 };
        renderGroupsList(); renderAll(); renderEditor();
    };
    document.getElementById('btnLinkPoint').onclick = () => {
        state.linkingMode = true; state.linkStartId = point.id; closeEditor();
        customAlert("MODE LIAISON", "Cliquez sur un second point."); document.body.style.cursor = 'crosshair';
    };
    document.getElementById('btnCopyId').onclick = () => navigator.clipboard.writeText(point.id);
    document.getElementById('btnCopyCoords').onclick = () => { const gps = percentageToGps(point.x, point.y); navigator.clipboard.writeText(`${gps.x.toFixed(2)}, ${gps.y.toFixed(2)}`); };
    document.getElementById('btnDelete').onclick = async () => { if(await customConfirm("SUPPRESSION", "Supprimer ?")) { group.points.splice(pointIndex, 1); deselect(); renderGroupsList(); } };
    document.getElementById('btnClose').onclick = deselect;
}

export function closeEditor() { sidebarRight.classList.remove('active'); }