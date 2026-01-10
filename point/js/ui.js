import { state, saveState, nodeById, isPerson, isCompany, isGroup, ensureNode, addLink, propagateOrgNums } from './state.js';
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
    
    // 1. ZOOM (Wheel)
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

    // 2. DRAG & DROP
    d3.select(canvas).call(d3.drag()
        .container(canvas)
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

    // 3. PANNING & HOVER
    let isPanning = false;
    let lastPan = { x: 0, y: 0 };

    canvas.addEventListener('mousedown', (e) => {
        const p = screenToWorld(e.offsetX, e.offsetY, canvas);
        const hit = getSimulation().find(p.x, p.y, 30);
        if (!hit) {
            isPanning = true;
            lastPan = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
            // Si on clique dans le vide, on désélectionne
            if (state.selection) {
                state.selection = null;
                renderEditor();
                draw();
            }
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isPanning) {
            const dx = e.clientX - lastPan.x;
            const dy = e.clientY - lastPan.y;
            lastPan = { x: e.clientX, y: e.clientY };
            state.view.x += dx;
            state.view.y += dy;
            draw();
            return; 
        }

        const p = screenToWorld(e.offsetX, e.offsetY, canvas);
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

    canvas.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            canvas.style.cursor = 'default';
        }
    });
    
    canvas.addEventListener('mouseleave', () => {
        isPanning = false;
        state.hoverId = null;
        draw();
    });

    // 4. BOUTONS GLOBAUX & BARRE D'OUTILS
    document.getElementById('btnRelayout').onclick = () => { 
        state.view = {x:0, y:0, scale: 0.5}; 
        restartSim(); 
    };

    document.getElementById('btnToggleSim').onclick = () => { 
        state.forceSimulation = !state.forceSimulation; 
        if(!state.forceSimulation) restartSim(); 
    };

    document.getElementById('btnClearAll').onclick = () => { 
        if(confirm('Attention : Voulez-vous vraiment tout effacer ?')) { 
            state.nodes=[]; 
            state.links=[]; 
            state.selection = null;
            state.nextId = 1;
            restartSim(); 
            refreshLists(); 
            renderEditor();
            saveState(); 
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
        if(found.length === 0) {
            res.innerHTML = '<span style="color:#666;">Aucun résultat</span>';
            return;
        }

        res.innerHTML = found.slice(0, 10).map(n => 
            `<span class="search-hit" data-id="${n.id}">${escapeHtml(n.name)}</span>`
        ).join(' · ');

        res.querySelectorAll('.search-hit').forEach(el => 
            el.onclick = () => {
                zoomToNode(+el.dataset.id);
                e.target.value = '';
                res.textContent = '';
            }
        );
    });

    // 6. IMPORT / EXPORT
    document.getElementById('btnExport').onclick = exportGraph;
    document.getElementById('fileImport').onchange = importGraph;
    document.getElementById('fileMerge').onchange = mergeGraph;
}

function createNode(type, baseName) {
    let name = baseName, i = 1;
    while(state.nodes.find(n => n.name === name)) {
        name = `${baseName} ${++i}`;
    }
    const n = ensureNode(type, name);
    selectNode(n.id);
    refreshLists();
    restartSim();
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

// --- GESTION DU PANNEAU DE DROITE ---
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

    // Génération du HTML (Avec les nouveaux boutons Focus et Centrer)
    ui.editorBody.innerHTML = `
        <div class="row hstack" style="margin-bottom:15px; gap:5px;">
            <button id="btnFocusNode" class="${state.focusMode ? 'primary' : ''}" style="flex:1; font-size:0.8rem;" title="Voir le point et ses voisins (2 niveaux)">
                ${state.focusMode ? '🔍 Voir Tout' : '🎯 Focus Voisins'}
            </button>
            <button id="btnCenterNode" style="flex:1; font-size:0.8rem;">📍 Centrer</button>
        </div>

        <div class="block">
            <h4>Propriétés</h4>
            <div class="row">
                <label style="width:50px;">Nom</label>
                <input id="edName" type="text" value="${escapeHtml(n.name)}" class="grow"/>
            </div>
            <div class="row" style="margin-top:5px;">
                <label style="width:50px;">Type</label>
                <select id="edType" class="grow">
                    <option value="person" ${n.type==='person'?'selected':''}>Personne</option>
                    <option value="group" ${n.type==='group'?'selected':''}>Groupuscule</option>
                    <option value="company" ${n.type==='company'?'selected':''}>Entreprise</option>
                </select>
            </div>
            <div class="row" style="margin-top:5px;">
                <label style="width:50px;">Couleur</label>
                <input id="edColor" type="color" value="${toColorInput(n.color)}" style="flex:0 0 40px;"/>
                <input id="edNum" type="text" value="${escapeHtml(n.num||'')}" placeholder="Matricule..." class="grow" style="margin-left:5px;"/>
            </div>
            <div class="row" style="margin-top:5px;">
                <textarea id="edNotes" class="notes-textarea" placeholder="Informations complémentaires...">${escapeHtml(n.notes||'')}</textarea>
            </div>
        </div>
        
        <div class="block" style="margin-top:10px;">
            <h4>Créer une connexion</h4>
            <div class="row hstack" style="gap:5px;">
               <input id="linkTarget" list="datalist-all" placeholder="Rechercher cible..." class="grow" style="min-width:0;"/>
               <select id="linkKind" style="width:110px;"></select>
            </div>
            <button id="btnAddLink" style="width:100%; margin-top:5px;">🔗 Ajouter le lien</button>
        </div>
        
        <div id="chipsLinks" class="chips" style="margin-top:10px;"></div>

        <div class="row" style="margin-top:20px; justify-content:center;">
            <button id="btnDelete" class="danger" style="width:100%;">Supprimer ce nœud</button>
        </div>
    `;

    // --- LOGIQUE FOCUS (PROFONDEUR 2) ---
    document.getElementById('btnFocusNode').onclick = () => {
        if (state.focusMode) {
            // On désactive
            state.focusMode = false;
            state.focusSet.clear();
        } else {
            // On active
            state.focusMode = true;
            state.focusSet.clear();
            
            // Niveau 0 : Soi-même
            state.focusSet.add(n.id);

            // Helper pour trouver les voisins d'un ID
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

            // Niveau 1 : Voisins directs
            const level1 = getNeighbors(n.id);
            level1.forEach(id => state.focusSet.add(id));

            // Niveau 2 : Voisins des voisins
            level1.forEach(l1Id => {
                const level2 = getNeighbors(l1Id);
                level2.forEach(id => state.focusSet.add(id));
            });
        }
        renderEditor(); // Met à jour le style du bouton
        draw();
    };

    // Bouton Centrer
    document.getElementById('btnCenterNode').onclick = () => {
        state.view.x = -n.x * state.view.scale;
        state.view.y = -n.y * state.view.scale;
        restartSim();
    };

    // Listeners classiques
    document.getElementById('edName').oninput = (e) => { 
        n.name = e.target.value; refreshLists(); draw(); 
    };
    document.getElementById('edType').onchange = (e) => { 
        n.type = e.target.value; restartSim(); draw(); refreshLists(); renderEditor(); 
    };
    document.getElementById('edColor').oninput = (e) => { n.color = e.target.value; draw(); };
    document.getElementById('edNum').oninput = (e) => { 
        n.num = e.target.value; 
        if(n.type === TYPES.PERSON) propagateOrgNums(); 
    };
    document.getElementById('edNotes').oninput = (e) => { n.notes = e.target.value; };

    document.getElementById('btnDelete').onclick = () => {
        if(confirm(`Supprimer définitivement "${n.name}" ?`)) {
            state.nodes = state.nodes.filter(x => x.id !== n.id);
            state.links = state.links.filter(l => l.source.id !== n.id && l.target.id !== n.id);
            state.selection = null;
            restartSim(); refreshLists(); renderEditor();
        }
    };

    // Remplissage de la Datalist pour la recherche de liens
    const allNames = state.nodes
        .filter(x => x.id !== n.id)
        .sort((a,b) => a.name.localeCompare(b.name));
    
    let dl = document.getElementById('datalist-all');
    if(!dl) { 
        dl = document.createElement('datalist'); 
        dl.id = 'datalist-all'; 
        document.body.appendChild(dl); 
    }
    dl.innerHTML = allNames.map(x => `<option value="${escapeHtml(x.name)}"></option>`).join('');

    // Remplissage des types de liens
    const selKind = document.getElementById('linkKind');
    const kinds = Object.values(KINDS); 
    selKind.innerHTML = kinds.map(k => `<option value="${k}">${kindToLabel(k)}</option>`).join('');

    // Création du lien
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

    // Affichage des liens existants (Chips)
    const chips = document.getElementById('chipsLinks');
    const myLinks = state.links.filter(l => l.source.id === n.id || l.target.id === n.id);
    
    if (myLinks.length === 0) {
        chips.innerHTML = '<span style="color:#666; font-style:italic; font-size:0.9em;">Aucune connexion</span>';
    } else {
        chips.innerHTML = myLinks.map(l => {
            const other = (l.source.id === n.id) ? l.target : l.source;
            return `
                <span class="chip" title="${kindToLabel(l.kind)} avec ${escapeHtml(other.name)}">
                    ${escapeHtml(other.name)} 
                    <small style="opacity:0.7">(${linkKindEmoji(l.kind)})</small> 
                    <span class="x" data-target-id="${other.id}">×</span>
                </span>`;
        }).join('');
    }

    // Suppression de liens
    chips.querySelectorAll('.x').forEach(x => {
        x.onclick = (e) => {
            const targetId = parseInt(e.target.dataset.targetId);
            state.links = state.links.filter(l => {
                const s = l.source.id;
                const t = l.target.id;
                const isTheLink = (s === n.id && t === targetId) || (s === targetId && t === n.id);
                return !isTheLink;
            });
            restartSim(); renderEditor();
        };
    });
}

export function updateLinkLegend() {
    const el = ui.linkLegend;
    if(!state.showLinkTypes) { el.innerHTML = ''; return; }
    
    const usedKinds = new Set(state.links.map(l => l.kind));
    if(usedKinds.size === 0) { el.innerHTML = ''; return; }

    const html = [];
    usedKinds.forEach(k => {
        html.push(`
            <div class="legend-item">
                <span class="legend-emoji">${linkKindEmoji(k)}</span>
                <span>${kindToLabel(k)}</span>
            </div>
        `);
    });
    el.innerHTML = html.join('');
}

function exportGraph() {
    const data = { 
        meta: { date: new Date().toISOString() },
        nodes: state.nodes.map(n => ({
            id: n.id, name: n.name, type: n.type, color: n.color, num: n.num, notes: n.notes,
            x: n.x, y: n.y 
        })), 
        links: state.links.map(l => ({
            source: l.source.id, 
            target: l.target.id, 
            kind: l.kind
        })) 
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const a = document.createElement('a'); 
    a.href = URL.createObjectURL(blob); 
    a.download = 'graph_neural_link.json';
    a.click();
}

function importGraph(e) {
    const f = e.target.files[0];
    if(!f) return;
    
    const r = new FileReader();
    r.onload = () => {
        try {
            const d = JSON.parse(r.result);
            state.nodes = d.nodes;
            state.links = d.links;
            const maxId = state.nodes.reduce((max, n) => Math.max(max, n.id), 0);
            state.nextId = maxId + 1;
            restartSim(); refreshLists();
            alert('Import réussi !');
        } catch(err) {
            console.error(err);
            alert('Erreur import JSON.');
        }
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
                    n.id = newId;
                    n.x = (Math.random()-0.5)*100;
                    n.y = (Math.random()-0.5)*100;
                    state.nodes.push(n);
                    addedNodes++;
                }
            });
            restartSim(); refreshLists();
            alert(`Fusion terminée : ${addedNodes} nœuds ajoutés.`);
        } catch(err) {
            console.error(err);
            alert('Erreur fusion.');
        }
    };
    r.readAsText(f);
}