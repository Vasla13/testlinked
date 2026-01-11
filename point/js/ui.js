import { state, saveState, nodeById, isPerson, isCompany, isGroup, undo, pushHistory } from './state.js';
import { ensureNode, addLink as logicAddLink, mergeNodes, updatePersonColors, calculatePath, clearPath } from './logic.js';
import { renderEditorHTML, renderPathfindingSidebar } from './templates.js';
import { restartSim, getSimulation } from './physics.js';
import { draw, updateDegreeCache, resizeCanvas } from './render.js';
import { escapeHtml, clamp, screenToWorld, kindToLabel, linkKindEmoji, computeLinkColor } from './utils.js';
import { TYPES, KINDS, FILTERS } from './constants.js';
import { injectStyles } from './styles.js';
import { setupCanvasEvents } from './interaction.js';

// Références DOM
const ui = {
    listCompanies: document.getElementById('listCompanies'),
    listGroups: document.getElementById('listGroups'),
    listPeople: document.getElementById('listPeople'),
    editorTitle: document.getElementById('editorTitle'),
    editorBody: document.getElementById('editorBody'),
    linkLegend: document.getElementById('linkLegend'),
    pathfindingContainer: document.getElementById('pathfinding-ui')
};

// --- MODALES ---
let modalOverlay = null;
function createModal() {
    if (document.getElementById('custom-modal')) return;
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'custom-modal';
    modalOverlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 9999; display: none; align-items: center; justify-content: center;`;
    modalOverlay.innerHTML = `
        <div style="background: #1a1a2e; border: 1px solid var(--accent-cyan); padding: 20px; border-radius: 8px; min-width: 300px; text-align: center; box-shadow: 0 0 20px rgba(0,0,0,0.8);">
            <div id="modal-msg" style="margin-bottom: 20px; color: #fff; font-size: 1rem;"></div>
            <div id="modal-actions" style="display: flex; gap: 10px; justify-content: center;"></div>
        </div>`;
    document.body.appendChild(modalOverlay);
}

export function showCustomAlert(msg) {
    if(!modalOverlay) createModal();
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if(msgEl && actEl) {
        msgEl.innerText = msg;
        actEl.innerHTML = `<button onclick="document.getElementById('custom-modal').style.display='none'" class="primary">OK</button>`;
        modalOverlay.style.display = 'flex';
    }
}

export function showCustomConfirm(msg, onYes) {
    if(!modalOverlay) createModal();
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if(msgEl && actEl) {
        msgEl.innerText = msg;
        actEl.innerHTML = '';
        const btnNo = document.createElement('button'); btnNo.innerText = 'Non'; btnNo.onclick = () => { modalOverlay.style.display='none'; };
        const btnYes = document.createElement('button'); btnYes.className = 'primary danger'; btnYes.innerText = 'Oui'; btnYes.onclick = () => { modalOverlay.style.display='none'; onYes(); };
        actEl.appendChild(btnNo); actEl.appendChild(btnYes);
        modalOverlay.style.display = 'flex';
    }
}

// --- INIT ---
export function initUI() {
    createModal();
    injectStyles();
    createFilterBar();
    updatePathfindingPanel();

    const canvas = document.getElementById('graph');
    window.addEventListener('resize', resizeCanvas);
    
    document.addEventListener('keydown', (e) => { 
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { 
            e.preventDefault(); undo(); refreshLists(); 
            if (state.selection) renderEditor(); 
            draw(); 
        } 
    });

    setupCanvasEvents(canvas);
    setupHudButtons();
    
    document.getElementById('createPerson').onclick = () => createNode(TYPES.PERSON, 'Nouvelle personne');
    document.getElementById('createGroup').onclick = () => createNode(TYPES.GROUP, 'Nouveau groupe');
    document.getElementById('createCompany').onclick = () => createNode(TYPES.COMPANY, 'Nouvelle entreprise');

    setupSearch();

    document.getElementById('btnExport').onclick = exportGraph;
    document.getElementById('fileImport').onchange = importGraph;
    document.getElementById('fileMerge').onchange = mergeGraph;
    document.getElementById('btnClearAll').onclick = () => { 
        showCustomConfirm('Attention : Voulez-vous vraiment tout effacer ?', () => { 
            pushHistory(); state.nodes=[]; state.links=[]; state.selection = null; state.nextId = 1;
            restartSim(); refreshLists(); renderEditor(); saveState(); 
        });
    };
    
    // Expose zoomToNode globalement pour les onclick HTML (active links)
    window.zoomToNode = zoomToNode;
}

// --- HELPERS INIT ---
function setupHudButtons() {
    document.getElementById('btnRelayout').onclick = () => { state.view = {x:0, y:0, scale: 0.5}; restartSim(); };
    const btnSim = document.getElementById('btnToggleSim'); if (btnSim) btnSim.style.display = 'none';
    
    document.getElementById('chkPerf').onchange = (e) => { state.performance = e.target.checked; draw(); };
    document.getElementById('chkLinkTypes').onchange = (e) => { state.showLinkTypes = e.target.checked; updateLinkLegend(); draw(); };

    // BOUTON GLOBE
    const hud = document.getElementById('hud');
    // Vérification pour ne pas dupliquer si refresh
    if (!document.getElementById('chkGlobe')) {
        const lblGlobe = document.createElement('label');
        lblGlobe.title = "Restreindre à la planète";
        lblGlobe.style.cursor = "pointer";
        lblGlobe.innerHTML = `<input id="chkGlobe" type="checkbox" ${state.globeMode ? 'checked' : ''}/> 🌍 Globe`;
        lblGlobe.querySelector('input').onchange = (e) => {
            state.globeMode = e.target.checked;
            restartSim(); 
        };
        hud.insertBefore(lblGlobe, document.getElementById('chkLabels').parentNode);
    }

    const btnLabel = document.getElementById('chkLabels');
    if (btnLabel) {
        btnLabel.type = 'button'; btnLabel.style.width = "100px"; btnLabel.style.textAlign = "center";
        const updateLabelBtn = () => { const modes = ['❌ Aucun', '✨ Auto', '👁️ Toujours']; btnLabel.value = modes[state.labelMode]; btnLabel.innerText = modes[state.labelMode]; };
        updateLabelBtn();
        btnLabel.onclick = (e) => { e.preventDefault(); state.labelMode = (state.labelMode + 1) % 3; updateLabelBtn(); draw(); };
    }
}

function setupSearch() {
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        const res = document.getElementById('searchResult');
        if(!q) { res.textContent = ''; return; }
        const found = state.nodes.filter(n => n.name.toLowerCase().includes(q));
        if(found.length === 0) { res.innerHTML = '<span style="color:#666;">Aucun résultat</span>'; return; }
        res.innerHTML = found.slice(0, 10).map(n => `<span class="search-hit" data-id="${n.id}">${escapeHtml(n.name)}</span>`).join(' · ');
        res.querySelectorAll('.search-hit').forEach(el => el.onclick = () => { 
            zoomToNode(+el.dataset.id); 
            e.target.value = ''; 
            res.textContent = ''; 
        });
    });
}

function createFilterBar() {
    // Évite les doublons
    if(document.getElementById('filter-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'filter-bar';
    const buttons = [
        { id: FILTERS.ALL, label: '🌐 Global' },
        { id: FILTERS.BUSINESS, label: '💼 Business' },
        { id: FILTERS.ILLEGAL, label: '⚔️ Conflit' },
        { id: FILTERS.SOCIAL, label: '❤️ Social' }
    ];
    buttons.forEach(btn => {
        const b = document.createElement('button');
        b.className = `filter-btn ${state.activeFilter === btn.id ? 'active' : ''}`;
        b.innerText = btn.label;
        b.onclick = () => {
            state.activeFilter = btn.id;
            document.querySelectorAll('.filter-btn').forEach(el => el.classList.remove('active'));
            b.classList.add('active');
            draw();
        };
        bar.appendChild(b);
    });
    document.body.appendChild(bar);
}

// --- LOGIQUE ---
function createNode(type, baseName) {
    let name = baseName, i = 1;
    while(state.nodes.find(n => n.name === name)) { name = `${baseName} ${++i}`; }
    const n = ensureNode(type, name);
    zoomToNode(n.id); 
    // Ici on garde le restartSim car c'est une création, faut que ça bouge pour se placer
    restartSim(); 
}

export function addLink(a, b, kind) {
    const res = logicAddLink(a, b, kind);
    if(res) { refreshLists(); renderEditor(); }
    return res;
}

export function selectNode(id) {
    state.selection = id;
    renderEditor();
    updatePathfindingPanel();
    draw();
}

function zoomToNode(id) {
    const n = nodeById(id);
    if (!n) return;
    state.selection = id;
    
    // Zoom mathématique sans secousse
    state.view.scale = 1.6;
    state.view.x = -n.x * 1.6;
    state.view.y = -n.y * 1.6;
    
    // CORRECTION BUG 1 : On enlève restartSim() pour ne pas reset la physique
    // restartSim(); <--- SUPPRIMÉ
    
    renderEditor();
    updatePathfindingPanel();
    draw(); // On redessine juste
}

// --- PANNEAUX ---
export function updatePathfindingPanel() {
    const el = ui.pathfindingContainer;
    if(!el) return;
    const selectedNode = nodeById(state.selection);
    el.innerHTML = renderPathfindingSidebar(state, selectedNode);

    const btnStart = document.getElementById('btnPathStart');
    if(btnStart) btnStart.onclick = () => {
        if(!selectedNode) return;
        state.pathfinding.startId = selectedNode.id;
        state.pathfinding.active = false;
        updatePathfindingPanel();
        draw(); 
    };
    const btnCancel = document.getElementById('btnPathCancel');
    if(btnCancel) btnCancel.onclick = () => {
        state.pathfinding.startId = null;
        state.pathfinding.active = false;
        clearPath();
        draw();
        updatePathfindingPanel();
    };
    const btnCalc = document.getElementById('btnPathCalc');
    if(btnCalc) btnCalc.onclick = () => {
        if(!selectedNode || !state.pathfinding.startId) return;
        const result = calculatePath(state.pathfinding.startId, selectedNode.id);
        if (result) {
            state.pathfinding.pathNodes = result.pathNodes;
            state.pathfinding.pathLinks = result.pathLinks;
            state.pathfinding.active = true;
            draw();
            updatePathfindingPanel();
        } else {
            showCustomAlert("Aucune connexion trouvée (hors ennemis).");
        }
    };
}

export function renderEditor() {
    const n = nodeById(state.selection);
    if (!n) {
        ui.editorTitle.textContent = 'Aucune sélection';
        ui.editorBody.innerHTML = '<p style="padding:10px; opacity:0.6;">Cliquez sur un nœud pour afficher ses détails.</p>';
        ui.editorBody.classList.add('muted');
        return;
    }
    ui.editorTitle.textContent = n.name;
    ui.editorBody.classList.remove('muted');
    ui.editorBody.innerHTML = renderEditorHTML(n, state);
    setupEditorListeners(n);
    renderActiveLinks(n);
}

function setupEditorListeners(n) {
    const handleAdd = (inputId, selectId, targetType) => {
        const nameInput = document.getElementById(inputId);
        const kindSelect = document.getElementById(selectId);
        const name = nameInput.value.trim();
        const kind = kindSelect.value;
        if (!name) return;
        let target = state.nodes.find(x => x.name.toLowerCase() === name.toLowerCase());
        if (!target) {
            showCustomConfirm(`"${name}" n'existe pas. Créer nouveau ${targetType} ?`, () => {
                target = ensureNode(targetType, name);
                logicAddLink(n, target, kind);
                nameInput.value = '';
                renderEditor(); updatePathfindingPanel(); refreshLists();
            });
        } else {
            logicAddLink(n, target, kind);
            nameInput.value = '';
            renderEditor(); updatePathfindingPanel();
        }
    };
    document.getElementById('btnAddCompany').onclick = () => handleAdd('inpCompany', 'selKindCompany', TYPES.COMPANY);
    document.getElementById('btnAddGroup').onclick = () => handleAdd('inpGroup', 'selKindGroup', TYPES.GROUP);
    document.getElementById('btnAddPerson').onclick = () => handleAdd('inpPerson', 'selKindPerson', TYPES.PERSON);

    document.getElementById('btnMerge').onclick = () => {
        const targetName = document.getElementById('mergeTarget').value.trim();
        const target = state.nodes.find(x => x.name.toLowerCase() === targetName.toLowerCase());
        if (target) {
            if (target.id === n.id) { showCustomAlert("Impossible de fusionner avec soi-même."); return; }
            showCustomConfirm(`Fusionner "${n.name}" DANS "${target.name}" ?`, () => {
                mergeNodes(n.id, target.id); selectNode(target.id); 
            });
        } else { showCustomAlert("Cible introuvable."); }
    };

    document.getElementById('btnFocusNode').onclick = () => {
        if (state.focusMode) { state.focusMode = false; state.focusSet.clear(); } 
        else {
            state.focusMode = true; state.focusSet.clear(); state.focusSet.add(n.id);
            state.links.forEach(l => {
                const s = (typeof l.source === 'object') ? l.source.id : l.source;
                const t = (typeof l.target === 'object') ? l.target.id : l.target;
                if (s === n.id) state.focusSet.add(t);
                if (t === n.id) state.focusSet.add(s);
            });
        }
        renderEditor(); draw();
    };

    document.getElementById('btnCenterNode').onclick = () => { state.view.x = -n.x * state.view.scale; state.view.y = -n.y * state.view.scale; restartSim(); };
    document.getElementById('edName').oninput = (e) => { n.name = e.target.value; refreshLists(); draw(); };
    document.getElementById('edType').onchange = (e) => { n.type = e.target.value; updatePersonColors(); restartSim(); draw(); refreshLists(); renderEditor(); };
    const inpColor = document.getElementById('edColor');
    if (inpColor) inpColor.oninput = (e) => { n.color = e.target.value; updatePersonColors(); draw(); };
    document.getElementById('edNum').oninput = (e) => { n.num = e.target.value; };
    document.getElementById('edNotes').oninput = (e) => { n.notes = e.target.value; };
    document.getElementById('btnDelete').onclick = () => {
        showCustomConfirm(`Supprimer "${n.name}" ?`, () => {
            pushHistory(); state.nodes = state.nodes.filter(x => x.id !== n.id);
            state.links = state.links.filter(l => l.source.id !== n.id && l.target.id !== n.id);
            state.selection = null; restartSim(); refreshLists(); renderEditor(); updatePathfindingPanel();
        });
    };
}

function renderActiveLinks(n) {
    const chipsContainer = document.getElementById('chipsLinks');
    const myLinks = state.links.filter(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        return s === n.id || t === n.id;
    });

    if (myLinks.length === 0) {
        chipsContainer.innerHTML = '<div style="padding:10px; text-align:center; color:#666; font-style:italic; font-size:0.8rem;">Aucune connexion active</div>';
        return;
    }

    const groups = { [TYPES.COMPANY]: [], [TYPES.GROUP]: [], [TYPES.PERSON]: [] };
    myLinks.forEach(l => {
        const s = (typeof l.source === 'object') ? l.source : nodeById(l.source);
        const t = (typeof l.target === 'object') ? l.target : nodeById(l.target);
        if (!s || !t) return;
        const other = (s.id === n.id) ? t : s;
        groups[other.type].push({ link: l, other });
    });

    const renderGroup = (title, items) => {
        if (items.length === 0) return '';
        let html = `<div class="link-category">${title}</div>`;
        items.forEach(item => {
            const linkColor = computeLinkColor(item.link);
            const typeLabel = kindToLabel(item.link.kind);
            const emoji = linkKindEmoji(item.link.kind);
            
            // CORRECTION BUG 2 : window.zoomToNode au lieu de window.selectNode
            html += `
            <div class="chip" style="border-left-color: ${linkColor};">
                <div class="chip-content">
                    <span class="chip-name" onclick="window.zoomToNode(${item.other.id})">${escapeHtml(item.other.name)}</span>
                    <div class="chip-meta"><span class="chip-badge" style="color: ${linkColor};">${emoji} ${typeLabel}</span></div>
                </div>
                <div class="x" title="Supprimer le lien" data-s="${item.link.source.id||item.link.source}" data-t="${item.link.target.id||item.link.target}">×</div>
            </div>`;
        });
        return html;
    };

    chipsContainer.innerHTML = renderGroup('🏢 Entreprises', groups[TYPES.COMPANY]) + renderGroup('👥 Groupuscules', groups[TYPES.GROUP]) + renderGroup('👤 Personnes', groups[TYPES.PERSON]);
    
    chipsContainer.querySelectorAll('.x').forEach(x => {
        x.onclick = (e) => {
            pushHistory(); 
            const sId = parseInt(e.target.dataset.s);
            const tId = parseInt(e.target.dataset.t);
            state.links = state.links.filter(l => {
                const s = (typeof l.source === 'object') ? l.source.id : l.source;
                const t = (typeof l.target === 'object') ? l.target.id : l.target;
                return !((s === sId && t === tId) || (s === tId && t === sId));
            });
            updatePersonColors(); restartSim(); renderEditor(); updatePathfindingPanel();
        };
    });
}

// --- LEGEND & LISTS ---
export function updateLinkLegend() {
    const el = ui.linkLegend;
    if(!state.showLinkTypes) { el.innerHTML = ''; return; }
    const usedKinds = new Set(state.links.map(l => l.kind));
    if(usedKinds.size === 0) { el.innerHTML = ''; return; }
    const html = [];
    usedKinds.forEach(k => {
        html.push(`<div class="legend-item"><span class="legend-emoji">${linkKindEmoji(k)}</span><span>${kindToLabel(k)}</span></div>`);
    });
    el.innerHTML = html.join('');
}

export function refreshLists() {
    updateDegreeCache();
    const fill = (ul, arr) => {
        if(!ul) return;
        ul.innerHTML = '';
        arr.sort((a,b) => a.name.localeCompare(b.name)).forEach(n => {
            const li = document.createElement('li');
            li.innerHTML = `<div class="list-item"><span class="bullet" style="background:${n.color}"></span>${escapeHtml(n.name)}</div>`;
            li.onclick = () => zoomToNode(n.id);
            ul.appendChild(li);
        });
    };
    fill(ui.listCompanies, state.nodes.filter(isCompany));
    fill(ui.listGroups, state.nodes.filter(isGroup));
    fill(ui.listPeople, state.nodes.filter(isPerson));
    const fillDL = (id, arr) => {
        const el = document.getElementById(id);
        if(el) el.innerHTML = arr.map(n => `<option value="${escapeHtml(n.name)}"></option>`).join('');
    };
    fillDL('datalist-people', state.nodes.filter(isPerson));
    fillDL('datalist-groups', state.nodes.filter(isGroup));
    fillDL('datalist-companies', state.nodes.filter(isCompany));
    updateLinkLegend();
}

function exportGraph() {
    const data = { 
        meta: { date: new Date().toISOString() },
        nodes: state.nodes.map(n => ({ id: n.id, name: n.name, type: n.type, color: n.color, num: n.num, notes: n.notes, x: n.x, y: n.y })), 
        links: state.links.map(l => ({ source: (typeof l.source === 'object') ? l.source.id : l.source, target: (typeof l.target === 'object') ? l.target.id : l.target, kind: l.kind })) 
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'graph_neural_link.json'; a.click();
}

function importGraph(e) {
    const f = e.target.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = () => {
        try {
            const d = JSON.parse(r.result);
            state.nodes = d.nodes; state.links = d.links;
            const maxId = state.nodes.reduce((max, n) => Math.max(max, n.id), 0);
            state.nextId = maxId + 1;
            updatePersonColors();
            restartSim(); refreshLists(); showCustomAlert('Import réussi !');
        } catch(err) { console.error(err); showCustomAlert('Erreur import JSON.'); }
    };
    r.readAsText(f);
}

function mergeGraph(e) {
    const f = e.target.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = () => {
        try {
            const d = JSON.parse(r.result);
            let addedNodes = 0;
            d.nodes.forEach(n => {
                if(!state.nodes.find(x => x.name.toLowerCase() === n.name.toLowerCase())) {
                    const newId = state.nextId++;
                    n.id = newId; n.x = (Math.random()-0.5)*100; n.y = (Math.random()-0.5)*100;
                    state.nodes.push(n); addedNodes++;
                }
            });
            updatePersonColors();
            restartSim(); refreshLists(); showCustomAlert(`Fusion terminée : ${addedNodes} nœuds ajoutés.`);
        } catch(err) { console.error(err); showCustomAlert('Erreur fusion.'); }
    };
    r.readAsText(f);
}