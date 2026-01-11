import { state, saveState, nodeById, isPerson, isCompany, isGroup, undo, pushHistory } from './state.js';
import { ensureNode, addLink as logicAddLink, mergeNodes, updatePersonColors, calculatePath, clearPath, calculateHVT } from './logic.js';
import { renderEditorHTML, renderPathfindingSidebar } from './templates.js';
import { restartSim, getSimulation } from './physics.js';
import { draw, updateDegreeCache, resizeCanvas } from './render.js';
import { escapeHtml, toColorInput, kindToLabel, linkKindEmoji, computeLinkColor } from './utils.js';
import { TYPES, KINDS, FILTERS } from './constants.js';
import { injectStyles } from './styles.js';
import { setupCanvasEvents } from './interaction.js';

const ui = {
    listCompanies: document.getElementById('listCompanies'),
    listGroups: document.getElementById('listGroups'),
    listPeople: document.getElementById('listPeople'),
    editorTitle: document.getElementById('editorTitle'),
    editorBody: document.getElementById('editorBody'),
    linkLegend: document.getElementById('linkLegend'),
    pathfindingContainer: document.getElementById('pathfinding-ui')
};

// --- MODALES & MENUS ---
let modalOverlay = null;
let contextMenu = null;
let settingsPanel = null;

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

function createContextMenu() {
    if (document.getElementById('context-menu')) return;
    contextMenu = document.createElement('div');
    contextMenu.id = 'context-menu';
    document.body.appendChild(contextMenu);
}

// --- PANNEAU DE REGLAGES (AVEC GLOBE & NOUVEAUX SLIDERS) ---
function createSettingsPanel() {
    // Suppression préventive pour éviter les doublons buggés
    const existing = document.getElementById('settings-panel');
    if (existing) existing.remove();

    settingsPanel = document.createElement('div');
    settingsPanel.id = 'settings-panel';
    settingsPanel.style.display = 'none'; // Caché par défaut
    
    // ICONE SVG GLOBE
    const ICON_GLOBE = `<svg style="width:24px;height:24px;fill:currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`;

    settingsPanel.innerHTML = `
        <div class="settings-header">
            <h3>Paramètres Physique</h3>
            <div class="settings-close" onclick="document.getElementById('settings-panel').style.display='none'">✕</div>
        </div>
        
        <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:6px; margin-bottom:15px; display:flex; align-items:center; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:10px; color:#fff; font-weight:bold;">
                ${ICON_GLOBE} <span>Mode Planète (Globe)</span>
            </div>
            <label class="hud-toggle">
                <input type="checkbox" id="chkGlobeInner" ${state.globeMode ? 'checked' : ''}/>
                <div class="toggle-track"><div class="toggle-thumb"></div></div>
            </label>
        </div>

        <div class="setting-row">
            <label>Répulsion Globale <span id="val-repulsion" class="setting-val"></span></label>
            <input type="range" id="sl-repulsion" min="100" max="5000" step="50">
        </div>
        <div class="setting-row">
            <label>Force Repousse Ennemis <span id="val-enemyForce" class="setting-val"></span></label>
            <input type="range" id="sl-enemyForce" min="50" max="1000" step="10" title="Violence de l'éloignement des ennemis">
        </div>
        <div class="setting-row">
            <label>Force Repousse Entreprise <span id="val-structureRepulsion" class="setting-val"></span></label>
            <input type="range" id="sl-structureRepulsion" min="0.01" max="0.5" step="0.01" title="Force qui éloigne les non-membres des structures">
        </div>
        <div class="setting-row">
            <label>Gravité Centrale <span id="val-gravity" class="setting-val"></span></label>
            <input type="range" id="sl-gravity" min="0" max="0.1" step="0.001">
        </div>
        <div class="setting-row">
            <label>Longueur Liens <span id="val-linkLength" class="setting-val"></span></label>
            <input type="range" id="sl-linkLength" min="50" max="600" step="10">
        </div>
        <div class="setting-row">
            <label>Collision (Espace) <span id="val-collision" class="setting-val"></span></label>
            <input type="range" id="sl-collision" min="0" max="200" step="5">
        </div>
        <div class="setting-row">
            <label>Friction (0=Glace) <span id="val-friction" class="setting-val"></span></label>
            <input type="range" id="sl-friction" min="0.1" max="0.9" step="0.05">
        </div>
        
        <div class="settings-actions">
            <button class="primary" style="width:100%;" onclick="window.resetPhysicsDefaults()">Rétablir défaut</button>
        </div>
    `;
    document.body.appendChild(settingsPanel);

    // GESTION DU GLOBE
    document.getElementById('chkGlobeInner').onchange = (e) => {
        state.globeMode = e.target.checked;
        restartSim();
    };

    // GESTION DES SLIDERS
    const bindSlider = (id, key) => {
        const sl = document.getElementById(id);
        const val = document.getElementById(id.replace('sl-', 'val-'));
        
        // Initialisation sécure
        if(!state.physicsSettings) state.physicsSettings = { repulsion: 1200, gravity: 0.005, linkLength: 220, friction: 0.3, collision: 50, enemyForce: 300, structureRepulsion: 0.1 };
        if(state.physicsSettings[key] === undefined) state.physicsSettings[key] = (key === 'enemyForce' ? 300 : 0.1);

        sl.value = state.physicsSettings[key];
        val.innerText = state.physicsSettings[key];
        
        sl.oninput = (e) => {
            const v = parseFloat(e.target.value);
            state.physicsSettings[key] = v;
            val.innerText = v;
            restartSim(); 
        };
    };

    window.updateSettingsUI = () => {
        bindSlider('sl-repulsion', 'repulsion');
        bindSlider('sl-gravity', 'gravity');
        bindSlider('sl-linkLength', 'linkLength');
        bindSlider('sl-collision', 'collision');
        bindSlider('sl-friction', 'friction');
        // Nouveaux
        bindSlider('sl-enemyForce', 'enemyForce');
        bindSlider('sl-structureRepulsion', 'structureRepulsion');
        
        // Sync Globe
        const chkGlobe = document.getElementById('chkGlobeInner');
        if(chkGlobe) chkGlobe.checked = state.globeMode;
    };

    window.resetPhysicsDefaults = () => {
        state.physicsSettings = { repulsion: 1200, gravity: 0.005, linkLength: 220, friction: 0.3, collision: 50, enemyForce: 300, structureRepulsion: 0.1 };
        state.globeMode = true;
        window.updateSettingsUI();
        restartSim();
    };
}

export function showSettings() {
    // Si le panneau n'existe pas ou a été supprimé, on le recrée
    if(!document.getElementById('settings-panel')) createSettingsPanel();
    
    // On met à jour les valeurs
    window.updateSettingsUI();
    
    // On l'affiche
    const panel = document.getElementById('settings-panel');
    panel.style.display = (panel.style.display === 'none' ? 'block' : 'none');
}

export function showContextMenu(node, x, y) {
    if(!contextMenu) createContextMenu();
    contextMenu.innerHTML = `
        <div class="ctx-item" onclick="window.menuAction('link', ${node.id})">🔗 Lier à...</div>
        <div class="ctx-item" onclick="window.menuAction('source', ${node.id})">🚩 Définir Source IA</div>
        <div class="ctx-item" onclick="window.menuAction('color', ${node.id})">🎨 Changer couleur</div>
        <div class="ctx-divider"></div>
        <div class="ctx-item danger" onclick="window.menuAction('delete', ${node.id})">🗑️ Supprimer</div>
    `;
    const menuWidth = 180; const menuHeight = 160;
    let posX = x; let posY = y;
    if (x + menuWidth > window.innerWidth) posX = x - menuWidth;
    if (y + menuHeight > window.innerHeight) posY = y - menuHeight;
    contextMenu.style.left = posX + 'px'; contextMenu.style.top = posY + 'px';
    contextMenu.style.display = 'flex';

    window.menuAction = (action, id) => {
        const n = nodeById(id);
        if(!n) return;
        hideContextMenu();
        if (action === 'delete') {
            showCustomConfirm(`Supprimer "${n.name}" ?`, () => {
                pushHistory(); state.nodes = state.nodes.filter(x => x.id !== n.id);
                state.links = state.links.filter(l => l.source.id !== n.id && l.target.id !== n.id);
                state.selection = null; restartSim(); refreshLists(); renderEditor(); updatePathfindingPanel();
            });
        }
        else if (action === 'source') {
            state.pathfinding.startId = n.id; state.pathfinding.active = false; updatePathfindingPanel(); draw();
        }
        else if (action === 'link') {
            selectNode(n.id); const details = document.querySelectorAll('details'); if(details[2]) details[2].open = true;
        }
        else if (action === 'color') {
            selectNode(n.id); setTimeout(() => { const col = document.getElementById('edColor'); if(col) col.click(); }, 100);
        }
    };
}

export function hideContextMenu() {
    if(contextMenu) contextMenu.style.display = 'none';
}

export function initUI() {
    createModal();
    createContextMenu();
    createSettingsPanel();
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

    setupCanvasEvents(canvas, { selectNode, renderEditor, updatePathfindingPanel, addLink, showContextMenu, hideContextMenu });
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
    
    window.zoomToNode = zoomToNode;
}

// --- HUD ENTIEREMENT REFAIT AVEC SVG & SWITCHES ---
function setupHudButtons() {
    const hud = document.getElementById('hud');
    
    // SVG ICONS DEFINITIONS
    const ICON_FOCUS = `<svg class="icon-svg" viewBox="0 0 24 24"><path d="M5 5h5v2H5v5H3V5h2zm10 0h5v5h-2V7h-3V5zm5 14h-5v2h5v-5h2v5h-2zm-14 0H3v-5h2v5h3v2z"/></svg>`;
    const ICON_SETTINGS = `<svg class="icon-svg" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`;
    const ICON_TARGET = `<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-4-8c0 2.21 1.79 4 4 4s4-1.79 4-4-1.79-4-4-4-4 1.79-4 4z"/></svg>`;

    // On vide le HUD pour le reconstruire proprement
    hud.innerHTML = '';

    // 1. Bouton Recentre
    const btnRelayout = document.createElement('button');
    btnRelayout.className = 'hud-btn';
    btnRelayout.innerHTML = `${ICON_FOCUS} Recentrer`;
    btnRelayout.onclick = () => { state.view = {x:0, y:0, scale: 0.5}; restartSim(); };
    hud.appendChild(btnRelayout);

    // 2. Séparateur
    hud.insertAdjacentHTML('beforeend', '<div class="hud-sep"></div>');

    // 3. (Globe a été déplacé dans Settings)

    // 4. Labels Mode (Bouton Cycle)
    const btnLabels = document.createElement('button');
    btnLabels.className = 'hud-btn';
    const updateLabelBtn = () => { 
        const modes = ['Non', 'Auto', 'Oui'];
        btnLabels.innerHTML = `<span>📝 ${modes[state.labelMode]}</span>`; 
        btnLabels.classList.toggle('active', state.labelMode > 0);
    };
    updateLabelBtn();
    btnLabels.onclick = () => { state.labelMode = (state.labelMode + 1) % 3; updateLabelBtn(); draw(); };
    hud.appendChild(btnLabels);

    // 5. Toggles (Eco, Liens)
    const lblPerf = document.createElement('label');
    lblPerf.className = 'hud-toggle';
    lblPerf.innerHTML = `<input type="checkbox" id="chkPerf"/><div class="toggle-track"><div class="toggle-thumb"></div></div> Eco`;
    lblPerf.querySelector('input').onchange = (e) => { state.performance = e.target.checked; draw(); };
    hud.appendChild(lblPerf);

    const lblLinks = document.createElement('label');
    lblLinks.className = 'hud-toggle';
    lblLinks.innerHTML = `<input type="checkbox" id="chkLinkTypes"/><div class="toggle-track"><div class="toggle-thumb"></div></div> Liens`;
    lblLinks.querySelector('input').onchange = (e) => { state.showLinkTypes = e.target.checked; updateLinkLegend(); draw(); };
    hud.appendChild(lblLinks);

    // 6. Settings
    const btnSettings = document.createElement('button');
    btnSettings.className = 'hud-btn';
    btnSettings.innerHTML = ICON_SETTINGS;
    btnSettings.title = "Paramètres Physique";
    btnSettings.onclick = showSettings;
    hud.appendChild(btnSettings);

    // 7. HVT Button
    const btnHVT = document.createElement('button');
    btnHVT.id = 'btnHVT';
    btnHVT.className = 'hud-btn';
    btnHVT.innerHTML = `${ICON_TARGET} HVT`;
    btnHVT.title = "Scanner High Value Targets";
    btnHVT.onclick = () => {
        state.hvtMode = !state.hvtMode;
        if(state.hvtMode) {
            calculateHVT();
            btnHVT.classList.add('active');
        } else {
            btnHVT.classList.remove('active');
        }
        draw();
    };
    hud.appendChild(btnHVT);
}

function setupSearch() {
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        const res = document.getElementById('searchResult');
        if(!q) { res.textContent = ''; return; }
        const found = state.nodes.filter(n => n.name.toLowerCase().includes(q));
        if(found.length === 0) { res.innerHTML = '<span style="color:#666;">Aucun résultat</span>'; return; }
        res.innerHTML = found.slice(0, 10).map(n => `<span class="search-hit" data-id="${n.id}">${escapeHtml(n.name)}</span>`).join(' · ');
        res.querySelectorAll('.search-hit').forEach(el => el.onclick = () => { zoomToNode(+el.dataset.id); e.target.value = ''; res.textContent = ''; });
    });
}

function createFilterBar() {
    if(document.getElementById('filter-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'filter-bar';
    const buttons = [ { id: FILTERS.ALL, label: '🌐 Global' }, { id: FILTERS.BUSINESS, label: '💼 Business' }, { id: FILTERS.ILLEGAL, label: '⚔️ Conflit' }, { id: FILTERS.SOCIAL, label: '❤️ Social' } ];
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

function createNode(type, baseName) {
    let name = baseName, i = 1;
    while(state.nodes.find(n => n.name === name)) { name = `${baseName} ${++i}`; }
    const n = ensureNode(type, name);
    zoomToNode(n.id); restartSim(); 
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
    state.view.scale = 1.6;
    state.view.x = -n.x * 1.6;
    state.view.y = -n.y * 1.6;
    renderEditor();
    updatePathfindingPanel();
    draw();
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

export function updateLinkLegend() {
    const el = ui.linkLegend;
    if(!state.showLinkTypes) { el.innerHTML = ''; return; }
    const usedKinds = new Set(state.links.map(l => l.kind));
    if(usedKinds.size === 0) { el.innerHTML = ''; return; }
    const html = [];
    usedKinds.forEach(k => { html.push(`<div class="legend-item"><span class="legend-emoji">${linkKindEmoji(k)}</span><span>${kindToLabel(k)}</span></div>`); });
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
        links: state.links.map(l => ({ source: (typeof l.source === 'object') ? l.source.id : l.source, target: (typeof l.target === 'object') ? l.target.id : l.target, kind: l.kind })),
        physicsSettings: state.physicsSettings
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
            if(d.physicsSettings) state.physicsSettings = d.physicsSettings;
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
    
    window.selectNode = selectNode;
}