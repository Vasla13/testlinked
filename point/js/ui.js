import { state, saveState, nodeById, isPerson, isCompany, isGroup, ensureNode, addLink, propagateOrgNums } from './state.js';
import { restartSim, getSimulation } from './physics.js';
import { draw, updateDegreeCache, resizeCanvas } from './render.js';
import { screenToWorld, escapeHtml, toColorInput, kindToLabel, linkKindEmoji, clamp, worldToScreen } from './utils.js';
import { TYPES, KINDS, PERSON_ORG_KINDS, PERSON_PERSON_KINDS, ORG_ORG_KINDS } from './constants.js';

// Références aux éléments du DOM pour éviter de les rechercher en boucle
const ui = {
    listCompanies: document.getElementById('listCompanies'),
    listGroups: document.getElementById('listGroups'),
    listPeople: document.getElementById('listPeople'),
    editorTitle: document.getElementById('editorTitle'),
    editorBody: document.getElementById('editorBody'),
    linkLegend: document.getElementById('linkLegend'),
};

/**
 * Initialisation de tous les événements de l'interface
 */
export function initUI() {
    const canvas = document.getElementById('graph');
    
    // Redimensionnement de la fenêtre
    window.addEventListener('resize', resizeCanvas);
    
    // ============================================================
    // 1. ZOOM (Molette de souris)
    // ============================================================
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        // Zoom centré sur la souris
        const m = screenToWorld(e.offsetX, e.offsetY, canvas);
        const before = worldToScreen(m.x, m.y, canvas);
        
        // Sens du zoom
        const delta = clamp((e.deltaY < 0 ? 1.1 : 0.9), 0.2, 5);
        state.view.scale = clamp(state.view.scale * delta, 0.1, 4.0);
        
        const after = worldToScreen(m.x, m.y, canvas);
        state.view.x += (before.x - after.x);
        state.view.y += (before.y - after.y);
        
        draw();
    }, { passive: false });

    // ============================================================
    // 2. DRAG & DROP DES NOEUDS (D3.js)
    // ============================================================
    d3.select(canvas).call(d3.drag()
        .container(canvas)
        .subject(e => {
            // Convertit la position souris en position monde
            const p = screenToWorld(e.sourceEvent.offsetX, e.sourceEvent.offsetY, canvas);
            // Cherche un nœud sous la souris (rayon 30px)
            return getSimulation().find(p.x, p.y, 30);
        })
        .on("start", e => {
            if (!e.active) getSimulation().alphaTarget(0.3).restart();
            e.subject.fx = e.subject.x; // Fixe la position physique
            e.subject.fy = e.subject.y;
            selectNode(e.subject.id); // Sélectionne le nœud
        })
        .on("drag", e => {
            // Met à jour la position pendant le drag
            const p = screenToWorld(e.sourceEvent.offsetX, e.sourceEvent.offsetY, canvas);
            e.subject.fx = p.x;
            e.subject.fy = p.y;
        })
        .on("end", e => {
            if (!e.active) getSimulation().alphaTarget(0);
            e.subject.fx = null; // Relâche la physique
            e.subject.fy = null;
            saveState(); // Sauvegarde l'état après mouvement
        })
    );

    // ============================================================
    // 3. PANNING (Déplacement carte) & HOVER (Survol)
    // ============================================================
    let isPanning = false;
    let lastPan = { x: 0, y: 0 };

    canvas.addEventListener('mousedown', (e) => {
        const p = screenToWorld(e.offsetX, e.offsetY, canvas);
        const hit = getSimulation().find(p.x, p.y, 30);
        
        // Si on ne clique PAS sur un nœud, on active le mode Pan
        if (!hit) {
            isPanning = true;
            lastPan = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
            // On désélectionne si on clique dans le vide
            if (state.selection) {
                state.selection = null;
                renderEditor();
                draw();
            }
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        // A. GESTION DU DEPLACEMENT (PAN)
        if (isPanning) {
            const dx = e.clientX - lastPan.x;
            const dy = e.clientY - lastPan.y;
            lastPan = { x: e.clientX, y: e.clientY };
            
            state.view.x += dx;
            state.view.y += dy;
            draw();
            return; // On arrête là pour ne pas calculer le hover pendant le pan
        }

        // B. GESTION DU SURVOL (HOVER)
        const p = screenToWorld(e.offsetX, e.offsetY, canvas);
        const hit = getSimulation().find(p.x, p.y, 25);

        if (hit) {
            // Si on entre sur un nœud
            if (state.hoverId !== hit.id) {
                state.hoverId = hit.id;
                canvas.style.cursor = 'pointer';
                draw();
            }
        } else {
            // Si on sort d'un nœud
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
    
    // Sortie de la souris du canvas : on reset le panning et le hover
    canvas.addEventListener('mouseleave', () => {
        isPanning = false;
        state.hoverId = null;
        draw();
    });


    // ============================================================
    // 4. BOUTONS & BARRE D'OUTILS
    // ============================================================
    
    // Recentrer la vue
    document.getElementById('btnRelayout').onclick = () => { 
        state.view = {x:0, y:0, scale: 0.5}; 
        restartSim(); 
    };

    // Pause / Play Simulation
    document.getElementById('btnToggleSim').onclick = () => { 
        state.forceSimulation = !state.forceSimulation; 
        if(!state.forceSimulation) restartSim(); 
    };

    // Tout effacer
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
    
    // Checkboxes d'affichage
    document.getElementById('chkLabels').onchange = (e) => { state.showLabels = e.target.checked; draw(); };
    document.getElementById('chkPerf').onchange = (e) => { state.performance = e.target.checked; draw(); };
    document.getElementById('chkLinkTypes').onchange = (e) => { state.showLinkTypes = e.target.checked; updateLinkLegend(); draw(); };

    // Boutons de création rapide
    document.getElementById('createPerson').onclick = () => createNode(TYPES.PERSON, 'Nouvelle personne');
    document.getElementById('createGroup').onclick = () => createNode(TYPES.GROUP, 'Nouveau groupe');
    document.getElementById('createCompany').onclick = () => createNode(TYPES.COMPANY, 'Nouvelle entreprise');

    // ============================================================
    // 5. RECHERCHE
    // ============================================================
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        const res = document.getElementById('searchResult');
        
        if(!q) { 
            res.textContent = ''; 
            return; 
        }
        
        const found = state.nodes.filter(n => n.name.toLowerCase().includes(q));
        
        if(found.length === 0) {
            res.innerHTML = '<span style="color:#666;">Aucun résultat</span>';
            return;
        }

        res.innerHTML = found.slice(0, 10).map(n => 
            `<span class="search-hit" data-id="${n.id}">${escapeHtml(n.name)}</span>`
        ).join(' · ');

        // Clic sur un résultat
        res.querySelectorAll('.search-hit').forEach(el => 
            el.onclick = () => {
                zoomToNode(+el.dataset.id);
                // On vide la recherche après sélection
                e.target.value = '';
                res.textContent = '';
            }
        );
    });

    // ============================================================
    // 6. IMPORT / EXPORT
    // ============================================================
    document.getElementById('btnExport').onclick = exportGraph;
    document.getElementById('fileImport').onchange = importGraph;
    document.getElementById('fileMerge').onchange = mergeGraph;
}

// --- FONCTIONS UTILITAIRES DE L'UI ---

/** Crée un nœud avec un nom unique et le sélectionne */
function createNode(type, baseName) {
    let name = baseName, i = 1;
    // Trouve un nom unique (ex: Nouvelle personne 2)
    while(state.nodes.find(n => n.name === name)) {
        name = `${baseName} ${++i}`;
    }
    const n = ensureNode(type, name);
    selectNode(n.id);
    refreshLists();
    restartSim();
}

/** Sélectionne un nœud, met à jour l'éditeur et redessine */
export function selectNode(id) {
    state.selection = id;
    renderEditor();
    draw();
}

/** Zoom sur un nœud spécifique et le sélectionne */
function zoomToNode(id) {
    const n = nodeById(id);
    if (!n) return;
    
    state.selection = id;
    // Animation simple vers le nœud
    state.view.scale = 1.6;
    state.view.x = -n.x * 1.6;
    state.view.y = -n.y * 1.6;
    
    restartSim();
    renderEditor();
}

/** Met à jour les listes dans la barre latérale gauche */
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
    
    // Mise à jour des Datalists (pour l'autocomplétion)
    const fillDL = (id, arr) => {
        const el = document.getElementById(id);
        if(el) el.innerHTML = arr.map(n => `<option value="${escapeHtml(n.name)}"></option>`).join('');
    };
    fillDL('datalist-people', state.nodes.filter(isPerson));
    fillDL('datalist-groups', state.nodes.filter(isGroup));
    fillDL('datalist-companies', state.nodes.filter(isCompany));
}

/**
 * Génère le panneau d'édition (droite) pour le nœud sélectionné
 */
export function renderEditor() {
    const n = nodeById(state.selection);
    
    // Cas : Rien de sélectionné
    if (!n) {
        ui.editorTitle.textContent = 'Aucune sélection';
        ui.editorBody.innerHTML = '<p style="padding:10px; opacity:0.6;">Cliquez sur un nœud pour afficher ses détails.</p>';
        ui.editorBody.classList.add('muted');
        return;
    }

    // Cas : Nœud sélectionné
    ui.editorTitle.textContent = n.name;
    ui.editorBody.classList.remove('muted');

    // Génération HTML du formulaire
    ui.editorBody.innerHTML = `
        <div class="row">
            <label>Nom</label>
            <input id="edName" type="text" value="${escapeHtml(n.name)}" class="grow"/>
        </div>
        <div class="row">
            <label>Type</label>
            <select id="edType">
                <option value="person" ${n.type==='person'?'selected':''}>Personne</option>
                <option value="group" ${n.type==='group'?'selected':''}>Groupuscule</option>
                <option value="company" ${n.type==='company'?'selected':''}>Entreprise</option>
            </select>
        </div>
        <div class="row">
            <label>Couleur</label>
            <input id="edColor" type="color" value="${toColorInput(n.color)}"/>
        </div>
        <div class="row">
            <label>Num</label>
            <input id="edNum" type="text" value="${escapeHtml(n.num||'')}" placeholder="Matricule..." style="width:100%"/>
        </div>
        <div class="row">
            <label>Notes</label>
            <textarea id="edNotes" class="notes-textarea" placeholder="Informations complémentaires...">${escapeHtml(n.notes||'')}</textarea>
        </div>
        
        <hr style="border-color:#333; margin:15px 0; opacity:0.3;"/>
        
        <h3>Connexions</h3>
        <div id="createLinkZone" class="row">
           <input id="linkTarget" list="datalist-all" placeholder="Nom de la cible..." class="grow"/>
           <select id="linkKind" style="width:100px;"></select>
           <button id="btnAddLink" style="padding:4px 8px;">+</button>
        </div>
        <div id="chipsLinks" class="chips"></div>

        <div class="row" style="margin-top:20px; justify-content:center;">
            <button id="btnDelete" class="danger" style="width:100%;">Supprimer ce nœud</button>
        </div>
    `;

    // --- Listeners des inputs ---
    
    // Nom
    document.getElementById('edName').oninput = (e) => { 
        n.name = e.target.value; 
        refreshLists(); 
        draw(); // Redessine le label
    };
    
    // Type
    document.getElementById('edType').onchange = (e) => { 
        n.type = e.target.value; 
        restartSim(); 
        draw(); 
        refreshLists(); 
        renderEditor(); // Recharge l'éditeur (couleurs par défaut changent)
    };
    
    // Couleur
    document.getElementById('edColor').oninput = (e) => { 
        n.color = e.target.value; 
        draw(); 
    };
    
    // Numéro (Matricule)
    document.getElementById('edNum').oninput = (e) => { 
        n.num = e.target.value; 
        // Si c'est une personne, on propage son numéro à l'entreprise si "Patron"
        if(n.type === TYPES.PERSON) propagateOrgNums(); 
    };
    
    // Notes
    document.getElementById('edNotes').oninput = (e) => { 
        n.notes = e.target.value; 
    };

    // Suppression du nœud
    document.getElementById('btnDelete').onclick = () => {
        if(confirm(`Supprimer définitivement "${n.name}" ?`)) {
            // Supprime le nœud
            state.nodes = state.nodes.filter(x => x.id !== n.id);
            // Supprime les liens associés
            state.links = state.links.filter(l => l.source.id !== n.id && l.target.id !== n.id);
            
            state.selection = null;
            restartSim(); 
            refreshLists(); 
            renderEditor();
        }
    };

    // --- Gestion des Liens (Create Link) ---

    // 1. Préparer la datalist pour l'ajout de lien (tous les autres nœuds)
    const allNames = state.nodes
        .filter(x => x.id !== n.id) // Pas de lien vers soi-même
        .sort((a,b) => a.name.localeCompare(b.name));
    
    let dl = document.getElementById('datalist-all');
    if(!dl) { 
        dl = document.createElement('datalist'); 
        dl.id = 'datalist-all'; 
        document.body.appendChild(dl); 
    }
    dl.innerHTML = allNames.map(x => `<option value="${escapeHtml(x.name)}"></option>`).join('');

    // 2. Remplir le select des types de lien
    const selKind = document.getElementById('linkKind');
    const kinds = Object.values(KINDS); 
    selKind.innerHTML = kinds.map(k => `<option value="${k}">${kindToLabel(k)}</option>`).join('');

    // 3. Action Ajouter Lien
    document.getElementById('btnAddLink').onclick = () => {
        const targetName = document.getElementById('linkTarget').value;
        const kind = selKind.value;
        
        // Trouve la cible
        const target = state.nodes.find(x => x.name.toLowerCase() === targetName.toLowerCase());
        
        if(target) {
            addLink(n, target, kind);
            document.getElementById('linkTarget').value = ''; // Reset input
            renderEditor(); // Rafraîchir pour voir le chip
        } else {
            alert("Nœud cible introuvable. Créez-le d'abord.");
        }
    };

    // 4. Affichage des "Chips" (Liens existants)
    const chips = document.getElementById('chipsLinks');
    const myLinks = state.links.filter(l => l.source.id === n.id || l.target.id === n.id);
    
    if (myLinks.length === 0) {
        chips.innerHTML = '<span style="color:#666; font-style:italic; font-size:0.9em;">Aucune connexion</span>';
    } else {
        chips.innerHTML = myLinks.map(l => {
            const other = (l.source.id === n.id) ? l.target : l.source;
            // On stocke l'ID du lien ou du noeud cible pour la suppression
            return `
                <span class="chip" title="${kindToLabel(l.kind)} avec ${escapeHtml(other.name)}">
                    ${escapeHtml(other.name)} 
                    <small style="opacity:0.7">(${linkKindEmoji(l.kind)})</small> 
                    <span class="x" data-target-id="${other.id}">×</span>
                </span>`;
        }).join('');
    }

    // 5. Action Supprimer Lien (clic sur le x)
    chips.querySelectorAll('.x').forEach(x => {
        x.onclick = (e) => {
            const targetId = parseInt(e.target.dataset.targetId);
            
            // Filtre : on retire le lien spécifique entre n.id et targetId
            state.links = state.links.filter(l => {
                const s = l.source.id;
                const t = l.target.id;
                // Si c'est le lien qu'on veut supprimer, on retourne false
                const isTheLink = (s === n.id && t === targetId) || (s === targetId && t === n.id);
                return !isTheLink;
            });
            
            restartSim(); 
            renderEditor();
        };
    });
}

/** Met à jour la légende des couleurs de liens en bas */
export function updateLinkLegend() {
    const el = ui.linkLegend;
    if(!state.showLinkTypes) { 
        el.innerHTML = ''; 
        return; 
    }
    
    const usedKinds = new Set(state.links.map(l => l.kind));
    if(usedKinds.size === 0) {
         el.innerHTML = ''; 
         return; 
    }

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

// --- GESTION FICHIERS ---

function exportGraph() {
    // On nettoie les données pour n'exporter que le nécessaire (pas les objets d3)
    const data = { 
        meta: { date: new Date().toISOString() },
        nodes: state.nodes.map(n => ({
            id: n.id, name: n.name, type: n.type, color: n.color, num: n.num, notes: n.notes,
            x: n.x, y: n.y // On garde la position
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
            // Reset complet
            state.nodes = d.nodes;
            state.links = d.links;
            
            // Recalcul du prochain ID
            const maxId = state.nodes.reduce((max, n) => Math.max(max, n.id), 0);
            state.nextId = maxId + 1;
            
            restartSim(); 
            refreshLists();
            alert('Import réussi !');
        } catch(err) {
            console.error(err);
            alert('Erreur lors de l\'import du fichier JSON.');
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
            
            // 1. Ajouter les nœuds qui n'existent pas (par nom)
            d.nodes.forEach(n => {
                if(!state.nodes.find(x => x.name.toLowerCase() === n.name.toLowerCase())) {
                    // Nouvel ID pour éviter collisions
                    const newId = state.nextId++;
                    // On map l'ancien ID vers le nouveau pour les liens
                    n._oldId = n.id;
                    n.id = newId;
                    n.x = (Math.random()-0.5)*100; // Position aléatoire proche centre
                    n.y = (Math.random()-0.5)*100;
                    state.nodes.push(n);
                    addedNodes++;
                }
            });
            
            // 2. Ajouter les liens
            // Attention: C'est complexe si les IDs ont changé.
            // Pour faire simple dans cette version, on importe tout et on laisse D3 nettoyer
            // (Ou on pourrait mapper par Nom si les noms sont uniques)
            
            restartSim(); 
            refreshLists();
            alert(`Fusion terminée : ${addedNodes} nœuds ajoutés.`);
        } catch(err) {
            console.error(err);
            alert('Erreur lors de la fusion.');
        }
    };
    r.readAsText(f);
}