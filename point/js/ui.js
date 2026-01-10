import { state, saveState, nodeById, isPerson, isCompany, isGroup, ensureNode, addLink, propagateOrgNums, undo, pushHistory, updatePersonColors } from './state.js';
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

export function initUI() {
    const canvas = document.getElementById('graph');
    window.addEventListener('resize', resizeCanvas);
    
    // --- GESTION DU CLAVIER (CTRL+Z) ---
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            undo();
            refreshLists();
            if (state.selection) renderEditor(); 
            draw();
        }
    });

    // 1. ZOOM
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

    // 2. LOGIQUE SOURIS (Création Lien + Pan)
    let isPanning = false;
    let lastPan = { x: 0, y: 0 };
    let dragLinkSource = null;

    canvas.addEventListener('mousedown', (e) => {
        const p = screenToWorld(e.offsetX, e.offsetY, canvas);
        const hit = getSimulation().find(p.x, p.y, 30); 

        // SHIFT + CLICK : Création de lien (PRIORITAIRE)
        if (e.shiftKey && hit) {
            dragLinkSource = hit;
            state.tempLink = { x1: hit.x, y1: hit.y, x2: hit.x, y2: hit.y };
            draw();
            e.stopImmediatePropagation();
            return;
        }

        if (!hit) {
            isPanning = true;
            lastPan = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
            if (state.selection) {
                state.selection = null;
                renderEditor();
                draw();
            }
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const p = screenToWorld(e.offsetX, e.offsetY, canvas);

        if (dragLinkSource) {
            state.tempLink.x2 = p.x;
            state.tempLink.y2 = p.y;
            draw();
            return;
        }

        if (isPanning) {
            const dx = e.clientX - lastPan.x;
            const dy = e.clientY - lastPan.y;
            lastPan = { x: e.clientX, y: e.clientY };
            state.view.x += dx;
            state.view.y += dy;
            draw();
            return; 
        }

        const hit = getSimulation().find(p.x, p.y, 25);
        if (hit) {
            if (state.hoverId !== hit.id) {
                state.hoverId = hit.id;
                canvas.style.cursor = 'pointer';
                draw();
            }
        } else {
            if (state.hoverId !== null) {
                state.hoverId = null;
                canvas.style.cursor = 'default';
                draw();
            }
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        const p = screenToWorld(e.offsetX, e.offsetY, canvas);
        
        if (dragLinkSource) {
            const hit = getSimulation().find(p.x, p.y, 40); 
            if (hit && hit.id !== dragLinkSource.id) {
                const success = addLink(dragLinkSource, hit, null); 
                if (success) {
                    selectNode(dragLinkSource.id);
                }
            }
            dragLinkSource = null;
            state.tempLink = null;
            draw();
            return;
        }

        if (isPanning) {
            isPanning = false;
            canvas.style.cursor = 'default';
        }
    });
    
    canvas.addEventListener('mouseleave', () => {
        isPanning = false;
        state.hoverId = null;
        dragLinkSource = null;
        state.tempLink = null;
        draw();
    });

    // 3. DRAG & DROP DES NOEUDS
    d3.select(canvas).call(d3.drag()
        .container(canvas)
        .filter(event => !event.shiftKey) 
        .subject(e => {
            const p = screenToWorld(e.sourceEvent.offsetX, e.sourceEvent.offsetY, canvas);
            return getSimulation().find(p.x, p.y, 30);
        })
        .on("start", e => {
            if (!e.active) getSimulation().alphaTarget(0.3).restart();
            e.subject.fx = e.subject.x; 
            e.subject.fy = e.subject.y;
            selectNode(e.subject.id); 
        })
        .on("drag", e => {
            const p = screenToWorld(e.sourceEvent.offsetX, e.sourceEvent.offsetY, canvas);
            e.subject.fx = p.x;
            e.subject.fy = p.y;
        })
        .on("end", e => {
            if (!e.active) getSimulation().alphaTarget(0);
            e.subject.fx = null; 
            e.subject.fy = null;
            saveState(); 
        })
    );

    // 4. BOUTONS UI
    document.getElementById('btnRelayout').onclick = () => { state.view = {x:0, y:0, scale: 0.5}; restartSim(); };
    
    const btnSim = document.getElementById('btnToggleSim');
    if (btnSim) btnSim.style.display = 'none';

    document.getElementById('btnClearAll').onclick = () => { 
        if(confirm('Attention : Voulez-vous vraiment tout effacer ?')) { 
            pushHistory();
            state.nodes=[]; state.links=[]; state.selection = null; state.nextId = 1;
            restartSim(); refreshLists(); renderEditor(); saveState(); 
        }
    };
    document.getElementById('chkLabels').onchange = (e) => { state.showLabels = e.target.checked; draw(); };
    document.getElementById('chkPerf').onchange = (e) => { state.performance = e.target.checked; draw(); };
    document.getElementById('chkLinkTypes').onchange = (e) => { state.showLinkTypes = e.target.checked; updateLinkLegend(); draw(); };

    document.getElementById('createPerson').onclick = () => createNode(TYPES.PERSON, 'Nouvelle personne');
    document.getElementById('createGroup').onclick = () => createNode(TYPES.GROUP, 'Nouveau groupe');
    document.getElementById('createCompany').onclick = () => createNode(TYPES.COMPANY, 'Nouvelle entreprise');

    // 5. RECHERCHE
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        const res = document.getElementById('searchResult');
        if(!q) { res.textContent = ''; return; }
        const found = state.nodes.filter(n => n.name.toLowerCase().includes(q));
        if(found.length === 0) { res.innerHTML = '<span style="color:#666;">Aucun résultat</span>'; return; }
        res.innerHTML = found.slice(0, 10).map(n => `<span class="search-hit" data-id="${n.id}">${escapeHtml(n.name)}</span>`).join(' · ');
        res.querySelectorAll('.search-hit').forEach(el => el.onclick = () => { zoomToNode(+el.dataset.id); e.target.value = ''; res.textContent = ''; });
    });

    // 6. IMPORT/EXPORT
    document.getElementById('btnExport').onclick = exportGraph;
    document.getElementById('fileImport').onchange = importGraph;
    document.getElementById('fileMerge').onchange = mergeGraph;
}

function createNode(type, baseName) {
    let name = baseName, i = 1;
    while(state.nodes.find(n => n.name === name)) { name = `${baseName} ${++i}`; }
    const n = ensureNode(type, name);
    // CORRECTION ZOOM DIRECT
    zoomToNode(n.id);
    refreshLists(); restartSim();
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
        colorInputHtml = `<div style="font-size:0.8rem; padding-top:10px; color:#aaa;">Auto (via Entreprise)</div>`;
    } else {
        colorInputHtml = `<input id="edColor" type="color" value="${toColorInput(n.color)}" style="height:38px; width:100%;"/>`;
    }

    ui.editorBody.innerHTML = `
        <div class="row hstack" style="margin-bottom:15px; gap:5px;">
            <button id="btnFocusNode" class="${state.focusMode ? 'primary' : ''}" style="flex:1; font-size:0.8rem;">
                ${state.focusMode ? '🔍 Voir Tout' : '🎯 Focus'}
            </button>
            <button id="btnCenterNode" style="flex:1; font-size:0.8rem;">📍 Centrer</button>
            <button id="btnDelete" class="danger" style="flex:0 0 auto; font-size:0.8rem;">🗑️</button>
        </div>

        <div class="block">
            <div class="row">
                <label>Nom</label>
                <input id="edName" type="text" value="${escapeHtml(n.name)}"/>
            </div>
            <div class="row hstack">
                <div class="grow">
                    <label style="font-size:0.8rem; opacity:0.7;">Type</label>
                    <select id="edType" style="width:100%;">
                        <option value="person" ${n.type==='person'?'selected':''}>Personne</option>
                        <option value="group" ${n.type==='group'?'selected':''}>Groupuscule</option>
                        <option value="company" ${n.type==='company'?'selected':''}>Entreprise</option>
                    </select>
                </div>
                <div>
                    <label style="font-size:0.8rem; opacity:0.7;">Couleur</label>
                    ${colorInputHtml}
                </div>
            </div>
            <div class="row">
                <label>Num / Matricule</label>
                <input id="edNum" type="text" value="${escapeHtml(n.num||'')}"/>
            </div>
            <div class="row">
                <textarea id="edNotes" class="notes-textarea" placeholder="Informations...">${escapeHtml(n.notes||'')}</textarea>
            </div>
        </div>
        
        <h4 style="margin: 15px 0 5px 0; color:var(--accent-cyan); border-top:1px solid #333; padding-top:10px;">Création Rapide</h4>

        <div style="margin-bottom:8px;">
            <label style="font-size:0.8rem; color:#aaa;">Entreprise</label>
            <div class="row hstack" style="gap:5px;">
                <input id="inpCompany" list="datalist-companies" placeholder="Nom entreprise..." class="grow" style="min-width:0;"/>
                <button id="btnLinkCompanyAff" style="font-size:0.75rem; padding:4px 8px;">Affiliation</button>
                <button id="btnLinkCompanyVal" class="primary" style="font-size:0.75rem; padding:4px 8px;">Valider</button>
            </div>
        </div>

        <div style="margin-bottom:8px;">
            <label style="font-size:0.8rem; color:#aaa;">Groupuscule</label>
            <div class="row hstack" style="gap:5px;">
                <input id="inpGroup" list="datalist-groups" placeholder="Nom groupe..." class="grow" style="min-width:0;"/>
                <button id="btnLinkGroupAff" style="font-size:0.75rem; padding:4px 8px;">Affiliation</button>
                <button id="btnLinkGroupVal" class="primary" style="font-size:0.75rem; padding:4px 8px;">Valider</button>
            </div>
        </div>

        <div style="margin-bottom:15px;">
            <label style="font-size:0.8rem; color:#aaa;">Personnel</label>
            <div class="row hstack" style="gap:5px;">
                <input id="inpPerson" list="datalist-people" placeholder="Nom personne..." class="grow" style="min-width:0;"/>
                <button id="btnLinkPersonEmp" style="font-size:0.75rem; padding:4px 8px;">Employé</button>
                <button id="btnLinkPersonVal" class="primary" style="font-size:0.75rem; padding:4px 8px;">Valider</button>
            </div>
        </div>

        <h4 style="margin: 0 0 5px 0; color:var(--accent-cyan); border-top:1px solid #333; padding-top:10px;">Connexion Manuelle</h4>
        <div class="row hstack" style="gap:5px; margin-bottom:15px;">
           <input id="linkTarget" list="datalist-all" placeholder="Rechercher cible..." class="grow" style="min-width:0;"/>
           <select id="linkKind" style="width:110px;"></select>
        </div>
        <button id="btnAddLink" style="width:100%; margin-bottom:15px;">🔗 Ajouter le lien</button>
        <h4 style="margin: 0 0 5px 0; color:var(--text-muted);">Tous les liens</h4>
        <div id="chipsLinks" class="chips"></div>
    `;

    // --- LOGIQUE BOUTONS RAPIDES ---
    const tryAddLink = (inputId, defaultKind) => {
        const targetName = document.getElementById(inputId).value;
        const target = state.nodes.find(x => x.name.toLowerCase() === targetName.toLowerCase());
        if(target) {
            addLink(n, target, defaultKind);
            document.getElementById(inputId).value = '';
            renderEditor();
        } else {
            alert("Cible introuvable.");
        }
    };

    document.getElementById('btnLinkCompanyAff').onclick = () => tryAddLink('inpCompany', KINDS.AFFILIATION);
    document.getElementById('btnLinkCompanyVal').onclick = () => tryAddLink('inpCompany', KINDS.PARTENAIRE);
    document.getElementById('btnLinkGroupAff').onclick = () => tryAddLink('inpGroup', KINDS.AFFILIATION);
    document.getElementById('btnLinkGroupVal').onclick = () => tryAddLink('inpGroup', KINDS.MEMBRE);
    document.getElementById('btnLinkPersonEmp').onclick = () => tryAddLink('inpPerson', KINDS.EMPLOYE);
    document.getElementById('btnLinkPersonVal').onclick = () => tryAddLink('inpPerson', KINDS.AMI);

    // --- LOGIQUE CONNEXION MANUELLE ---
    // On doit remplir la datalist "Tous"
    const allNames = state.nodes.filter(x => x.id !== n.id).sort((a,b) => a.name.localeCompare(b.name));
    let dl = document.getElementById('datalist-all');
    if(!dl) { 
        dl = document.createElement('datalist'); dl.id = 'datalist-all'; document.body.appendChild(dl); 
    }
    dl.innerHTML = allNames.map(x => `<option value="${escapeHtml(x.name)}"></option>`).join('');

    // Remplissage select types
    const selKind = document.getElementById('linkKind');
    const kinds = Object.values(KINDS); 
    selKind.innerHTML = kinds.map(k => `<option value="${k}">${kindToLabel(k)}</option>`).join('');

    document.getElementById('btnAddLink').onclick = () => {
        const targetName = document.getElementById('linkTarget').value;
        const kind = selKind.value;
        const target = state.nodes.find(x => x.name.toLowerCase() === targetName.toLowerCase());
        if(target) {
            addLink(n, target, kind);
            document.getElementById('linkTarget').value = ''; 
            renderEditor(); 
        } else {
            alert("Nœud cible introuvable.");
        }
    };

    // --- RESTE DU CODE ---

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
    
    // Si c'est une entreprise/groupe, on permet de changer la couleur
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
        if(confirm(`Supprimer "${n.name}" ?`)) {
            pushHistory(); 
            state.nodes = state.nodes.filter(x => x.id !== n.id);
            state.links = state.links.filter(l => l.source.id !== n.id && l.target.id !== n.id);
            state.selection = null;
            restartSim(); refreshLists(); renderEditor();
        }
    };

    const chips = document.getElementById('chipsLinks');
    const myLinks = state.links.filter(l => l.source.id === n.id || l.target.id === n.id);
    if (myLinks.length === 0) {
        chips.innerHTML = '<span style="color:#666; font-style:italic; font-size:0.8rem;">Aucune connexion</span>';
    } else {
        chips.innerHTML = myLinks.map(l => {
            const other = (l.source.id === n.id) ? l.target : l.source;
            return `<span class="chip" title="${kindToLabel(l.kind)}">${escapeHtml(other.name)} <small>(${linkKindEmoji(l.kind)})</small> <span class="x" data-target-id="${other.id}">×</span></span>`;
        }).join('');
    }

    chips.querySelectorAll('.x').forEach(x => {
        x.onclick = (e) => {
            pushHistory(); 
            const targetId = parseInt(e.target.dataset.targetId);
            state.links = state.links.filter(l => {
                const s = l.source.id;
                const t = l.target.id;
                const isTheLink = (s === n.id && t === targetId) || (s === targetId && t === n.id);
                return !isTheLink;
            });
            updatePersonColors();
            restartSim(); renderEditor();
        };
    });
}

function exportGraph() {
    const data = { 
        meta: { date: new Date().toISOString() },
        nodes: state.nodes.map(n => ({ id: n.id, name: n.name, type: n.type, color: n.color, num: n.num, notes: n.notes, x: n.x, y: n.y })), 
        links: state.links.map(l => ({ source: l.source.id, target: l.target.id, kind: l.kind })) 
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
            restartSim(); refreshLists(); alert('Import réussi !');
        } catch(err) { console.error(err); alert('Erreur import JSON.'); }
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
            restartSim(); refreshLists(); alert(`Fusion terminée : ${addedNodes} nœuds ajoutés.`);
        } catch(err) { console.error(err); alert('Erreur fusion.'); }
    };
    r.readAsText(f);
}