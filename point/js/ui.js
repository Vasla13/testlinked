import { state, saveState, nodeById, isPerson, isCompany, isGroup, ensureNode, addLink, propagateOrgNums, undo, pushHistory, updatePersonColors, mergeNodes } from './state.js';
import { restartSim, getSimulation } from './physics.js';
import { draw, updateDegreeCache, resizeCanvas } from './render.js';
import { screenToWorld, escapeHtml, toColorInput, kindToLabel, linkKindEmoji, clamp, worldToScreen } from './utils.js';
import { TYPES, KINDS, PERSON_ORG_KINDS, PERSON_PERSON_KINDS, ORG_ORG_KINDS } from './constants.js';

const ui = {
    listCompanies: document.getElementById('listCompanies'),
    listGroups: document.getElementById('listGroups'),
    listPeople: document.getElementById('listPeople'),
    editorTitle: document.getElementById('editorTitle'),
    editorBody: document.getElementById('editorBody'),
    linkLegend: document.getElementById('linkLegend'),
};

function safeHex(color) {
    if (!color || typeof color !== 'string') return '#000000';
    if (/^#[0-9A-F]{3}$/i.test(color)) return color;
    if (/^#[0-9A-F]{6}$/i.test(color)) return color;
    if (color.length > 7 && color.startsWith('#')) return color.substring(0, 7);
    return '#000000';
}

// --- MODAL SYSTEM ---
let modalOverlay = null;
function createModal() {
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'custom-modal';
    modalOverlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 9999; display: none; align-items: center; justify-content: center;`;
    modalOverlay.innerHTML = `<div style="background: #1a1a2e; border: 1px solid var(--accent-cyan); padding: 20px; border-radius: 8px; min-width: 300px; text-align: center; box-shadow: 0 0 20px rgba(0,0,0,0.8);"><div id="modal-msg" style="margin-bottom: 20px; color: #fff; font-size: 1rem;"></div><div id="modal-actions" style="display: flex; gap: 10px; justify-content: center;"></div></div>`;
    document.body.appendChild(modalOverlay);
}
function showCustomAlert(msg) {
    if(!modalOverlay) createModal();
    document.getElementById('modal-msg').innerText = msg;
    document.getElementById('modal-actions').innerHTML = `<button onclick="document.getElementById('custom-modal').style.display='none'" class="primary">OK</button>`;
    modalOverlay.style.display = 'flex';
}
function showCustomConfirm(msg, onYes) {
    if(!modalOverlay) createModal();
    document.getElementById('modal-msg').innerText = msg;
    const actions = document.getElementById('modal-actions');
    actions.innerHTML = '';
    const btnYes = document.createElement('button'); btnYes.className = 'primary danger'; btnYes.innerText = 'Oui'; btnYes.onclick = () => { modalOverlay.style.display='none'; onYes(); };
    const btnNo = document.createElement('button'); btnNo.innerText = 'Non'; btnNo.onclick = () => { modalOverlay.style.display='none'; };
    actions.appendChild(btnNo); actions.appendChild(btnYes);
    modalOverlay.style.display = 'flex';
}

export function initUI() {
    createModal();

    // --- CSS RENFORCÉ (Layout Fixe) ---
    const style = document.createElement('style');
    style.innerHTML = `
        .editor { width: 380px !important; }
        #editorBody { max-height: calc(100vh - 180px); overflow-y: auto; padding-right: 5px; }
        #editorBody::-webkit-scrollbar { width: 5px; }
        #editorBody::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
        
        details { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; margin-bottom: 8px; padding: 5px; }
        summary { cursor: pointer; font-weight: bold; font-size: 0.85rem; color: var(--accent-cyan); padding: 4px 0; list-style: none; display: flex; align-items: center; justify-content: space-between; }
        summary::after { content: '+'; font-size: 1rem; font-weight: bold; }
        details[open] summary::after { content: '-'; }
        
        .flex-row-force {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            width: 100% !important;
            gap: 5px !important;
        }
        .flex-grow-input { flex: 1 1 auto !important; min-width: 0 !important; width: 100% !important; }
        .compact-select { flex: 0 0 100px !important; width: 100px !important; font-size: 0.75rem !important; padding: 2px !important; }
        .mini-btn { flex: 0 0 30px !important; width: 30px !important; padding: 0 !important; text-align: center !important; justify-content: center !important; }

        .link-category { margin-top: 10px; margin-bottom: 5px; font-size: 0.75rem; color: #888; text-transform: uppercase; border-bottom: 1px solid #333; }
        .chip { cursor: pointer; transition: background 0.2s; display:inline-flex; align-items:center; gap:4px; max-width:100%; overflow:hidden; }
        .chip:hover { background: rgba(255,255,255,0.15); }
        .chip-name { text-decoration: underline; text-decoration-color: rgba(255,255,255,0.3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    `;
    document.head.appendChild(style);

    const canvas = document.getElementById('graph');
    window.addEventListener('resize', resizeCanvas);
    
    const btnLabel = document.getElementById('chkLabels');
    if (btnLabel) {
        btnLabel.type = 'button';
        btnLabel.style.width = "100px";
        btnLabel.style.textAlign = "center";
        const updateLabelBtn = () => {
            const modes = ['❌ Aucun', '✨ Auto', '👁️ Toujours'];
            btnLabel.value = modes[state.labelMode];
            btnLabel.innerText = modes[state.labelMode];
        };
        updateLabelBtn();
        btnLabel.onclick = (e) => { e.preventDefault(); state.labelMode = (state.labelMode + 1) % 3; updateLabelBtn(); draw(); };
    }

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault(); undo(); refreshLists(); if (state.selection) renderEditor(); draw();
        }
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const m = screenToWorld(e.offsetX, e.offsetY, canvas);
        const before = worldToScreen(m.x, m.y, canvas);
        const delta = clamp((e.deltaY < 0 ? 1.1 : 0.9), 0.2, 5);
        state.view.scale = clamp(state.view.scale * delta, 0.1, 4.0);
        const after = worldToScreen(m.x, m.y, canvas);
        state.view.x += (before.x - after.x);
        state.view.y += (before.y - after.y);
        draw();
    }, { passive: false });

    let isPanning = false, lastPan = { x: 0, y: 0 }, dragLinkSource = null;

    canvas.addEventListener('mousedown', (e) => {
        const p = screenToWorld(e.offsetX, e.offsetY, canvas);
        const hit = getSimulation().find(p.x, p.y, 30); 
        if (e.shiftKey && hit) {
            dragLinkSource = hit;
            state.tempLink = { x1: hit.x, y1: hit.y, x2: hit.x, y2: hit.y };
            draw(); e.stopImmediatePropagation(); return;
        }
        if (!hit) {
            isPanning = true; lastPan = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
            if (state.selection) { state.selection = null; renderEditor(); draw(); }
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const p = screenToWorld(e.offsetX, e.offsetY, canvas);
        if (dragLinkSource) { state.tempLink.x2 = p.x; state.tempLink.y2 = p.y; draw(); return; }
        if (isPanning) {
            const dx = e.clientX - lastPan.x; const dy = e.clientY - lastPan.y;
            lastPan = { x: e.clientX, y: e.clientY };
            state.view.x += dx; state.view.y += dy; draw(); return; 
        }
        const hit = getSimulation().find(p.x, p.y, 25);
        if (hit) { if (state.hoverId !== hit.id) { state.hoverId = hit.id; canvas.style.cursor = 'pointer'; draw(); } } 
        else { if (state.hoverId !== null) { state.hoverId = null; canvas.style.cursor = 'default'; draw(); } }
    });

    canvas.addEventListener('mouseup', (e) => {
        const p = screenToWorld(e.offsetX, e.offsetY, canvas);
        if (dragLinkSource) {
            const hit = getSimulation().find(p.x, p.y, 40); 
            if (hit && hit.id !== dragLinkSource.id) {
                const success = addLink(dragLinkSource, hit, null); 
                if (success) selectNode(dragLinkSource.id);
            }
            dragLinkSource = null; state.tempLink = null; draw(); return;
        }
        if (isPanning) { isPanning = false; canvas.style.cursor = 'default'; }
    });
    
    canvas.addEventListener('mouseleave', () => { isPanning = false; state.hoverId = null; dragLinkSource = null; state.tempLink = null; draw(); });

    d3.select(canvas).call(d3.drag().container(canvas).filter(event => !event.shiftKey).subject(e => {
        const p = screenToWorld(e.sourceEvent.offsetX, e.sourceEvent.offsetY, canvas);
        return getSimulation().find(p.x, p.y, 30);
    }).on("start", e => {
        if (!e.active) getSimulation().alphaTarget(0.3).restart();
        e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; selectNode(e.subject.id); 
    }).on("drag", e => {
        const p = screenToWorld(e.sourceEvent.offsetX, e.sourceEvent.offsetY, canvas);
        e.subject.fx = p.x; e.subject.fy = p.y;
    }).on("end", e => {
        if (!e.active) getSimulation().alphaTarget(0);
        e.subject.fx = null; e.subject.fy = null; saveState(); 
    }));

    document.getElementById('btnRelayout').onclick = () => { state.view = {x:0, y:0, scale: 0.5}; restartSim(); };
    const btnSim = document.getElementById('btnToggleSim'); if (btnSim) btnSim.style.display = 'none';

    document.getElementById('btnClearAll').onclick = () => { 
        showCustomConfirm('Attention : Voulez-vous vraiment tout effacer ?', () => { 
            pushHistory(); state.nodes=[]; state.links=[]; state.selection = null; state.nextId = 1;
            restartSim(); refreshLists(); renderEditor(); saveState(); 
        });
    };
    document.getElementById('chkLabels').onchange = (e) => { state.showLabels = e.target.checked; draw(); };
    document.getElementById('chkPerf').onchange = (e) => { state.performance = e.target.checked; draw(); };
    document.getElementById('chkLinkTypes').onchange = (e) => { state.showLinkTypes = e.target.checked; updateLinkLegend(); draw(); };

    document.getElementById('createPerson').onclick = () => createNode(TYPES.PERSON, 'Nouvelle personne');
    document.getElementById('createGroup').onclick = () => createNode(TYPES.GROUP, 'Nouveau groupe');
    document.getElementById('createCompany').onclick = () => createNode(TYPES.COMPANY, 'Nouvelle entreprise');

    document.getElementById('searchInput').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        const res = document.getElementById('searchResult');
        if(!q) { res.textContent = ''; return; }
        const found = state.nodes.filter(n => n.name.toLowerCase().includes(q));
        if(found.length === 0) { res.innerHTML = '<span style="color:#666;">Aucun résultat</span>'; return; }
        res.innerHTML = found.slice(0, 10).map(n => `<span class="search-hit" data-id="${n.id}">${escapeHtml(n.name)}</span>`).join(' · ');
        res.querySelectorAll('.search-hit').forEach(el => el.onclick = () => { zoomToNode(+el.dataset.id); e.target.value = ''; res.textContent = ''; });
    });

    document.getElementById('btnExport').onclick = exportGraph;
    document.getElementById('fileImport').onchange = importGraph;
    document.getElementById('fileMerge').onchange = mergeGraph;
}

function createNode(type, baseName) {
    let name = baseName, i = 1;
    while(state.nodes.find(n => n.name === name)) { name = `${baseName} ${++i}`; }
    const n = ensureNode(type, name);
    zoomToNode(n.id); refreshLists(); restartSim();
}

export function selectNode(id) {
    state.selection = id;
    renderEditor();
    draw();
}

function zoomToNode(id) {
    const n = nodeById(id);
    if (!n) return;
    state.selection = id;
    state.view.scale = 1.6;
    state.view.x = -n.x * 1.6;
    state.view.y = -n.y * 1.6;
    restartSim();
    renderEditor();
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

    let colorInputHtml = '';
    if (n.type === 'person') {
        colorInputHtml = `<div style="font-size:0.8rem; padding-top:10px; color:#aaa;">Auto (Mix)</div>`;
    } else {
        colorInputHtml = `<input id="edColor" type="color" value="${safeHex(n.color)}" style="height:38px; width:100%;"/>`;
    }

    const getOptionsFor = (targetType) => {
        let validKinds = [];
        const sourceType = n.type;
        if (sourceType === TYPES.PERSON && targetType === TYPES.PERSON) validKinds = PERSON_PERSON_KINDS;
        else if (sourceType !== TYPES.PERSON && targetType !== TYPES.PERSON) validKinds = ORG_ORG_KINDS;
        else validKinds = PERSON_ORG_KINDS;
        return Array.from(validKinds).map(k => `<option value="${k}">${kindToLabel(k)}</option>`).join('');
    };

    ui.editorBody.innerHTML = `
        <div class="flex-row-force" style="margin-bottom:15px;">
            <button id="btnFocusNode" class="${state.focusMode ? 'primary' : ''}" style="flex:1; font-size:0.8rem;">
                ${state.focusMode ? '🔍 Tout' : '🎯 Focus'}
            </button>
            <button id="btnCenterNode" style="flex:1; font-size:0.8rem;">📍 Centrer</button>
            <button id="btnDelete" class="danger" style="flex:0 0 auto; width:40px; font-size:0.8rem;">🗑️</button>
        </div>

        <details open>
            <summary>Propriétés</summary>
            <div class="row">
                <label>Nom</label>
                <input id="edName" type="text" value="${escapeHtml(n.name)}"/>
            </div>
            
            <div class="flex-row-force">
                <div style="flex:1;">
                    <label style="font-size:0.8rem; opacity:0.7;">Type</label>
                    <select id="edType" style="width:100%;">
                        <option value="person" ${n.type==='person'?'selected':''}>Personne</option>
                        <option value="group" ${n.type==='group'?'selected':''}>Groupuscule</option>
                        <option value="company" ${n.type==='company'?'selected':''}>Entreprise</option>
                    </select>
                </div>
                <div style="flex:1;">
                    <label style="font-size:0.8rem; opacity:0.7;">Couleur</label>
                    ${colorInputHtml}
                </div>
            </div>

            <div class="row" style="margin-top:5px;">
                <label>Téléphone</label>
                <input id="edNum" type="text" value="${escapeHtml(n.num||'')}"/>
            </div>
        </details>

        <details open>
            <summary>Informations</summary>
            <textarea id="edNotes" class="notes-textarea" placeholder="Notes..." style="min-height:80px;">${escapeHtml(n.notes||'')}</textarea>
        </details>
        
        <details open>
            <summary>Ajouter / Créer relation</summary>
            
            <div style="margin-bottom:8px;">
                <label style="font-size:0.8rem; color:#aaa;">Entreprise</label>
                <div class="flex-row-force">
                    <input id="inpCompany" list="datalist-companies" placeholder="Nom..." class="flex-grow-input" />
                    <select id="selKindCompany" class="compact-select">${getOptionsFor(TYPES.COMPANY)}</select>
                    <button id="btnAddCompany" class="primary mini-btn">+</button>
                </div>
            </div>

            <div style="margin-bottom:8px;">
                <label style="font-size:0.8rem; color:#aaa;">Groupuscule</label>
                <div class="flex-row-force">
                    <input id="inpGroup" list="datalist-groups" placeholder="Nom..." class="flex-grow-input" />
                    <select id="selKindGroup" class="compact-select">${getOptionsFor(TYPES.GROUP)}</select>
                    <button id="btnAddGroup" class="primary mini-btn">+</button>
                </div>
            </div>

            <div style="margin-bottom:8px;">
                <label style="font-size:0.8rem; color:#aaa;">Personnel</label>
                <div class="flex-row-force">
                    <input id="inpPerson" list="datalist-people" placeholder="Nom..." class="flex-grow-input" />
                    <select id="selKindPerson" class="compact-select">${getOptionsFor(TYPES.PERSON)}</select>
                    <button id="btnAddPerson" class="primary mini-btn">+</button>
                </div>
            </div>
        </details>

        <details>
            <summary style="color:#ff5555;">Zone de Danger (Fusion)</summary>
            <div style="font-size:0.75rem; color:#aaa; margin-bottom:5px;">
                Fusionner <b>${escapeHtml(n.name)}</b> dans un autre point (ce point disparaîtra).
            </div>
            <div class="flex-row-force">
               <input id="mergeTarget" list="datalist-all" placeholder="Vers qui fusionner ?" class="flex-grow-input" />
               <button id="btnMerge" class="primary danger" style="padding:0 10px;">Fusionner</button>
            </div>
        </details>

        <details open>
            <summary>Liens Actifs</summary>
            <div id="chipsLinks"></div>
        </details>
    `;

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
                addLink(n, target, kind);
                nameInput.value = '';
                renderEditor();
            });
        } else {
            addLink(n, target, kind);
            nameInput.value = '';
            renderEditor();
        }
    };

    document.getElementById('btnAddCompany').onclick = () => handleAdd('inpCompany', 'selKindCompany', TYPES.COMPANY);
    document.getElementById('btnAddGroup').onclick = () => handleAdd('inpGroup', 'selKindGroup', TYPES.GROUP);
    document.getElementById('btnAddPerson').onclick = () => handleAdd('inpPerson', 'selKindPerson', TYPES.PERSON);

    document.getElementById('btnMerge').onclick = () => {
        const targetName = document.getElementById('mergeTarget').value.trim();
        const target = state.nodes.find(x => x.name.toLowerCase() === targetName.toLowerCase());
        
        if (target) {
            if (target.id === n.id) {
                showCustomAlert("Impossible de fusionner avec soi-même.");
                return;
            }
            showCustomConfirm(`Fusionner "${n.name}" DANS "${target.name}" ?\n"${n.name}" sera supprimé et ses liens transférés.`, () => {
                mergeNodes(n.id, target.id);
                selectNode(target.id); 
            });
        } else {
            showCustomAlert("Cible de fusion introuvable.");
        }
    };

    document.getElementById('btnFocusNode').onclick = () => {
        if (state.focusMode) {
            state.focusMode = false; state.focusSet.clear();
        } else {
            state.focusMode = true; state.focusSet.clear(); state.focusSet.add(n.id);
            const getNeighbors = (targetId) => {
                const neighbors = [];
                state.links.forEach(l => {
                    const s = (typeof l.source === 'object') ? l.source.id : l.source;
                    const t = (typeof l.target === 'object') ? l.target.id : l.target;
                    if (s === targetId) neighbors.push(t);
                    if (t === targetId) neighbors.push(s);
                });
                return neighbors;
            };
            const level1 = getNeighbors(n.id);
            level1.forEach(id => state.focusSet.add(id));
            level1.forEach(l1Id => {
                const level2 = getNeighbors(l1Id);
                level2.forEach(id => state.focusSet.add(id));
            });
        }
        renderEditor(); draw();
    };

    document.getElementById('btnCenterNode').onclick = () => { state.view.x = -n.x * state.view.scale; state.view.y = -n.y * state.view.scale; restartSim(); };

    document.getElementById('edName').oninput = (e) => { n.name = e.target.value; refreshLists(); draw(); };
    document.getElementById('edType').onchange = (e) => { n.type = e.target.value; updatePersonColors(); restartSim(); draw(); refreshLists(); renderEditor(); };
    
    const inpColor = document.getElementById('edColor');
    if (inpColor) {
        inpColor.oninput = (e) => { 
            n.color = e.target.value; 
            updatePersonColors();
            draw(); 
        };
    }

    document.getElementById('edNum').oninput = (e) => { n.num = e.target.value; if(n.type === TYPES.PERSON) propagateOrgNums(); };
    document.getElementById('edNotes').oninput = (e) => { n.notes = e.target.value; };

    document.getElementById('btnDelete').onclick = () => {
        showCustomConfirm(`Supprimer "${n.name}" ?`, () => {
            pushHistory(); 
            state.nodes = state.nodes.filter(x => x.id !== n.id);
            state.links = state.links.filter(l => l.source.id !== n.id && l.target.id !== n.id);
            state.selection = null;
            restartSim(); refreshLists(); renderEditor();
        });
    };

    // --- LIENS ACTIFS GROUPÉS ---
    const chipsContainer = document.getElementById('chipsLinks');
    
    const myLinks = state.links.filter(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        return s === n.id || t === n.id;
    });

    if (myLinks.length === 0) {
        chipsContainer.innerHTML = '<span style="color:#666; font-style:italic; font-size:0.8rem;">Aucune connexion</span>';
    } else {
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
                html += `
                <span class="chip" title="${kindToLabel(item.link.kind)}">
                    <span class="chip-name" onclick="window.selectNode(${item.other.id})">${escapeHtml(item.other.name)}</span>
                    <small style="opacity:0.7; margin-left:3px;">(${linkKindEmoji(item.link.kind)})</small> 
                    <span class="x" data-s="${item.link.source.id||item.link.source}" data-t="${item.link.target.id||item.link.target}">×</span>
                </span>`;
            });
            return html;
        };

        chipsContainer.innerHTML = 
            renderGroup('Entreprises', groups[TYPES.COMPANY]) +
            renderGroup('Groupuscules', groups[TYPES.GROUP]) +
            renderGroup('Personnes', groups[TYPES.PERSON]);
            
        window.selectNode = selectNode; 
    }

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
            updatePersonColors();
            restartSim(); renderEditor();
        };
    });
    
    // Pour la fusion, on a besoin de la datalist complete
    const allNames = state.nodes.filter(x => x.id !== n.id).sort((a,b) => a.name.localeCompare(b.name));
    let dl = document.getElementById('datalist-all');
    if(!dl) { dl = document.createElement('datalist'); dl.id = 'datalist-all'; document.body.appendChild(dl); }
    dl.innerHTML = allNames.map(x => `<option value="${escapeHtml(x.name)}"></option>`).join('');

    updateLinkLegend();
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