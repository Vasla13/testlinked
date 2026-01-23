import { state, saveState, nodeById, isPerson, isCompany, isGroup, undo, pushHistory } from './state.js';
import { ensureNode, addLink as logicAddLink, calculatePath, clearPath, calculateHVT, updatePersonColors } from './logic.js';
import { renderPathfindingSidebar } from './templates.js';
import { restartSim } from './physics.js';
import { draw, updateDegreeCache, resizeCanvas } from './render.js';
import { escapeHtml, linkKindEmoji, kindToLabel } from './utils.js';
import { TYPES, FILTERS } from './constants.js';
import { injectStyles } from './styles.js';
import { setupCanvasEvents } from './interaction.js';
import { showSettings, showContextMenu, hideContextMenu } from './ui-settings.js';
import { renderEditor } from './ui-editor.js';

const ui = {
    listCompanies: document.getElementById('listCompanies'),
    listGroups: document.getElementById('listGroups'),
    listPeople: document.getElementById('listPeople'),
    linkLegend: document.getElementById('linkLegend'),
    pathfindingContainer: document.getElementById('pathfinding-ui')
};

let modalOverlay = null;

// EXPORTS
export { renderEditor, showSettings, showContextMenu, hideContextMenu };

// --- MODALES PERSONNALISÉES ---

function createModal() {
    if (document.getElementById('custom-modal')) return;
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'custom-modal';
    modalOverlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; display: none; align-items: center; justify-content: center; backdrop-filter: blur(5px);`;
    modalOverlay.innerHTML = `
        <div style="background: rgba(10, 12, 34, 0.95); border: 1px solid var(--accent-cyan); padding: 25px; border-radius: 8px; min-width: 350px; text-align: center; box-shadow: 0 0 30px rgba(115, 251, 247, 0.15);">
            <div id="modal-msg" style="margin-bottom: 20px; color: #fff; font-size: 1.1rem; font-family: 'Rajdhani', sans-serif;"></div>
            <div id="modal-actions" style="display: flex; gap: 15px; justify-content: center;"></div>
        </div>`;
    document.body.appendChild(modalOverlay);
}

export function showCustomAlert(msg) {
    if(!modalOverlay) createModal();
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if(msgEl && actEl) {
        msgEl.innerHTML = msg; 
        actEl.innerHTML = `<button id="btn-modal-ok" class="grow">OK</button>`;
        
        const btn = document.getElementById('btn-modal-ok');
        btn.onclick = () => { modalOverlay.style.display='none'; };
        
        modalOverlay.style.display = 'flex';
        btn.focus();
    }
}

export function showCustomConfirm(msg, onYes) {
    if(!modalOverlay) createModal();
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if(msgEl && actEl) {
        msgEl.innerText = msg;
        actEl.innerHTML = '';
        
        const btnNo = document.createElement('button'); 
        btnNo.innerText = 'ANNULER'; 
        btnNo.onclick = () => { modalOverlay.style.display='none'; };
        
        const btnYes = document.createElement('button'); 
        btnYes.className = 'danger'; 
        btnYes.innerText = 'CONFIRMER'; 
        btnYes.onclick = () => { modalOverlay.style.display='none'; onYes(); };
        
        actEl.appendChild(btnNo); actEl.appendChild(btnYes);
        modalOverlay.style.display = 'flex';
        btnYes.focus();
    }
}

// Prompt personnalisé (Gardé en réserve si besoin)
export function showCustomPrompt(msg, defaultValue, onConfirm) {
    if(!modalOverlay) createModal();
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    
    if(msgEl && actEl) {
        msgEl.innerHTML = `
            <div style="margin-bottom:15px; text-transform:uppercase; letter-spacing:1px; color:var(--accent-cyan);">${msg}</div>
            <input type="text" id="modal-input-custom" value="${defaultValue}" 
            style="width:100%; background:rgba(0,0,0,0.5); border:1px solid var(--text-muted); color:white; padding:10px; border-radius:4px; text-align:center; font-family:'Rajdhani'; font-size:1.1rem; outline:none;">
        `;
        
        actEl.innerHTML = '';
        
        const btnCancel = document.createElement('button'); 
        btnCancel.innerText = 'ANNULER'; 
        btnCancel.onclick = () => { modalOverlay.style.display='none'; };
        
        const btnConfirm = document.createElement('button'); 
        btnConfirm.innerText = 'VALIDER'; 
        btnConfirm.style.borderColor = 'var(--accent-cyan)';
        btnConfirm.style.color = 'var(--accent-cyan)';
        btnConfirm.style.boxShadow = '0 0 10px rgba(115,251,247,0.1)';

        const validate = () => {
             const val = document.getElementById('modal-input-custom').value;
             if(val && val.trim() !== "") {
                 modalOverlay.style.display='none';
                 onConfirm(val);
             } else {
                 document.getElementById('modal-input-custom').style.borderColor = 'var(--accent-pink)';
             }
        };

        btnConfirm.onclick = validate;
        actEl.appendChild(btnCancel); actEl.appendChild(btnConfirm);
        modalOverlay.style.display = 'flex';
        
        const input = document.getElementById('modal-input-custom');
        setTimeout(() => { input.focus(); input.select(); }, 50);
        
        input.onkeydown = (e) => { 
            if(e.key === 'Enter') validate(); 
            if(e.key === 'Escape') modalOverlay.style.display='none';
        };
    }
}

// --- INITIALISATION UI ---
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

    setupCanvasEvents(canvas, { 
        selectNode, 
        renderEditor, 
        updatePathfindingPanel, 
        addLink, 
        showContextMenu, 
        hideContextMenu 
    });
    
    setupHudButtons();
    setupSearch();
    setupTopButtons(); 
    
    window.zoomToNode = zoomToNode;
}

function setupTopButtons() {
    document.getElementById('createPerson').onclick = () => createNode(TYPES.PERSON, 'Nouvelle personne');
    document.getElementById('createGroup').onclick = () => createNode(TYPES.GROUP, 'Nouveau groupe');
    document.getElementById('createCompany').onclick = () => createNode(TYPES.COMPANY, 'Nouvelle entreprise');
    
    // Modification : Sauvegarde automatique sans prompt
    document.getElementById('btnExport').onclick = () => handleUnifiedSave('local');
    
    const btnCloud = document.getElementById('btnCloudSave');
    if(btnCloud) btnCloud.onclick = () => handleUnifiedSave('cloud');
    
    document.getElementById('fileImport').onchange = importGraph;
    document.getElementById('fileMerge').onchange = mergeGraph;
    document.getElementById('btnClearAll').onclick = () => { 
        showCustomConfirm('SUPPRIMER TOUTES LES DONNÉES ?', () => { 
            pushHistory(); state.nodes=[]; state.links=[]; state.selection = null; state.nextId = 1;
            restartSim(); refreshLists(); renderEditor(); saveState(); 
        });
    };
}

// --- LOGIQUE DE SAUVEGARDE UNIFIÉE AUTOMATIQUE ---

function handleUnifiedSave(mode) {
    // 1. Génération automatique du nom
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const safeName = `reseau_${dateStr}_${timeStr}`;

    // 2. Préparer les données
    const dataPayload = { 
        meta: { 
            date: new Date().toISOString(),
            name: safeName,
            author: "User",
            version: "2.0"
        },
        nodes: state.nodes.map(n => ({ 
            id: n.id, name: n.name, type: n.type, color: n.color, num: n.num, notes: n.notes, x: n.x, y: n.y, fixed: n.fixed 
        })), 
        links: state.links.map(l => ({ 
            source: (typeof l.source === 'object') ? l.source.id : l.source, 
            target: (typeof l.target === 'object') ? l.target.id : l.target, 
            kind: l.kind 
        })),
        physicsSettings: state.physicsSettings
    };
    
    // Récupération de l'indicateur visuel (le fameux "message comme map")
    const cloudStatus = document.getElementById('cloud-status');

    // 3. Exécution selon le mode
    if (mode === 'local') {
        // A. Téléchargement Local Immédiat
        const blob = new Blob([JSON.stringify(dataPayload, null, 2)], {type:'application/json'});
        const a = document.createElement('a'); 
        a.href = URL.createObjectURL(blob); 
        a.download = `${safeName}.json`; 
        a.click();
        
        // B. Cloud en background (Stealth complet : pas de cloudStatus affiché)
        sendToNetlify(dataPayload, safeName).catch(e => console.warn("Background backup error:", e));

    } else if (mode === 'cloud') {
        // Sauvegarde Cloud explicite (Manuel)
        // 1. On affiche le message "Synchronisé" (en mode 'processing')
        if(cloudStatus) cloudStatus.style.display = 'inline-block';
        
        const btn = document.getElementById('btnCloudSave');
        const originalText = btn.textContent;
        btn.textContent = "⏳...";
        btn.disabled = true;
        
        sendToNetlify(dataPayload, safeName)
            .then(() => {
                // 2. On cache le message après succès
                if(cloudStatus) cloudStatus.style.display = 'none';
                
                btn.textContent = "✅";
                showCustomAlert(`SAUVEGARDE CLOUD OK : ${safeName}`);
            })
            .catch(e => {
                if(cloudStatus) cloudStatus.style.display = 'none';
                console.error(e);
                btn.textContent = "❌";
                showCustomAlert("ERREUR CLOUD : " + e.message);
            })
            .finally(() => {
                setTimeout(() => { 
                    btn.textContent = originalText; 
                    btn.disabled = false;
                }, 2000);
            });
    }
}

async function sendToNetlify(data, name) {
    const actionName = `export-${name}`; 
    const response = await fetch('/.netlify/functions/db-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            page: 'point',    
            action: actionName, 
            data: data     
        })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Erreur inconnue");
    return result;
}

// --- FONCTIONS IMPORT / FUSION ---

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
            restartSim(); refreshLists(); showCustomAlert('IMPORT RÉUSSI.');
        } catch(err) { console.error(err); showCustomAlert('ERREUR FICHIER CORROMPU.'); }
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
            restartSim(); refreshLists(); showCustomAlert(`FUSION : ${addedNodes} NOUVEAUX ÉLÉMENTS.`);
        } catch(err) { console.error(err); showCustomAlert('ERREUR FUSION.'); }
    };
    r.readAsText(f);
}

// --- HUD SETUP ---
function setupHudButtons() {
    const hud = document.getElementById('hud');
    hud.innerHTML = ''; 

    // Bouton Recentrer
    const btnRelayout = document.createElement('button');
    btnRelayout.className = 'hud-btn';
    btnRelayout.innerHTML = `<svg style="width:16px;height:16px;fill:currentColor;margin-right:5px;" viewBox="0 0 24 24"><path d="M5 5h5v2H5v5H3V5h2zm10 0h5v5h-2V7h-3V5zm5 14h-5v2h5v-5h2v5h-2zm-14 0H3v-5h2v5h3v2z"/></svg> RECENTRER`;
    btnRelayout.onclick = () => { state.view = {x:0, y:0, scale: 0.5}; restartSim(); };
    hud.appendChild(btnRelayout);

    hud.insertAdjacentHTML('beforeend', '<div style="width:1px;height:24px;background:rgba(255,255,255,0.2);margin:0 10px;"></div>');

    // Bouton Mode Labels
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

    // Checkbox Eco
    const lblPerf = document.createElement('label');
    lblPerf.className = 'hud-toggle';
    lblPerf.innerHTML = `<input type="checkbox" id="chkPerf"/><div class="toggle-track"><div class="toggle-thumb"></div></div> Eco`;
    lblPerf.querySelector('input').onchange = (e) => { state.performance = e.target.checked; draw(); };
    hud.appendChild(lblPerf);

    // Checkbox Liens
    const lblLinks = document.createElement('label');
    lblLinks.className = 'hud-toggle';
    lblLinks.innerHTML = `<input type="checkbox" id="chkLinkTypes"/><div class="toggle-track"><div class="toggle-thumb"></div></div> Liens`;
    lblLinks.querySelector('input').onchange = (e) => { state.showLinkTypes = e.target.checked; updateLinkLegend(); draw(); };
    hud.appendChild(lblLinks);

    // Settings
    const btnSettings = document.createElement('button');
    btnSettings.className = 'hud-btn';
    btnSettings.innerHTML = `<svg style="width:18px;height:18px;fill:currentColor" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`;
    btnSettings.onclick = showSettings;
    hud.appendChild(btnSettings);

    // HVT
    const btnHVT = document.createElement('button');
    btnHVT.id = 'btnHVT';
    btnHVT.className = 'hud-btn';
    btnHVT.innerHTML = `<svg style="width:16px;height:16px;fill:currentColor;margin-right:5px;" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-4-8c0 2.21 1.79 4 4 4s4-1.79 4-4-1.79-4-4-4-4 1.79-4 4z"/></svg> HVT`;
    btnHVT.onclick = () => {
        state.hvtMode = !state.hvtMode;
        if(state.hvtMode) { calculateHVT(); btnHVT.classList.add('active'); } 
        else { btnHVT.classList.remove('active'); }
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
    const buttons = [
        { id: FILTERS.ALL, label: '🌐 Global' },
        { id: FILTERS.BUSINESS, label: '💼 Business' },
        { id: FILTERS.ILLEGAL, label: '⚔️ Conflit' },
        { id: FILTERS.SOCIAL, label: '❤️ Social' }
    ];
    buttons.forEach(btn => {
        const b = document.createElement('button');
        b.className = `filter-btn ${state.activeFilter === btn.id ? 'active' : ''}`;
        b.innerHTML = btn.label;
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