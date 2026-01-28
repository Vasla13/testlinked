import { state, nodeById, pushHistory, saveState, linkHasNode } from './state.js'; // AJOUT saveState
import { ensureNode, addLink, mergeNodes, updatePersonColors } from './logic.js';
import { renderEditorHTML } from './templates.js';
import { restartSim } from './physics.js';
import { draw } from './render.js';
import { refreshLists, updatePathfindingPanel, selectNode, showCustomConfirm, showCustomAlert } from './ui.js';
import { escapeHtml, kindToLabel, linkKindEmoji, computeLinkColor } from './utils.js';
import { TYPES } from './constants.js';

const ui = {
    editorTitle: document.getElementById('editorTitle'),
    editorBody: document.getElementById('editorBody')
};

export function renderEditor() {
    const n = nodeById(state.selection);
    updatePathfindingPanel();

    if (!n) {
        ui.editorTitle.style.display = 'block';
        ui.editorTitle.textContent = 'SÉLECTIONNEZ UN NŒUD';
        ui.editorBody.innerHTML = '<div style="padding:20px; text-align:center; opacity:0.5; font-style:italic;">Cliquez sur un élément du graphe pour voir ses détails.</div>';
        return;
    }
    
    ui.editorTitle.style.display = 'none';
    ui.editorBody.innerHTML = renderEditorHTML(n, state);
    
    // --- BOUTON CROSS-MODULE INTELLIGENT ---
    const targetId = n.linkedMapPointId ? n.linkedMapPointId : n.id;
    const isLinked = !!n.linkedMapPointId;
    
    const btnCrossModule = document.createElement('button');
    btnCrossModule.className = 'primary';
    btnCrossModule.style.width = '100%';
    btnCrossModule.style.marginTop = '0px';
    btnCrossModule.style.marginBottom = '15px';
    
    if(isLinked) {
        btnCrossModule.style.background = 'rgba(115, 251, 247, 0.15)';
        btnCrossModule.style.border = '1px solid #73fbf7';
        btnCrossModule.style.color = '#73fbf7';
        btnCrossModule.innerHTML = `🛰️ LOCALISER TACTIQUE <span style="font-size:0.8em; opacity:0.8;">[LIÉ]</span>`;
        btnCrossModule.style.boxShadow = '0 0 10px rgba(115, 251, 247, 0.2)';
    } else {
        btnCrossModule.style.background = 'rgba(255, 255, 255, 0.05)';
        btnCrossModule.style.border = '1px dashed #555';
        btnCrossModule.style.color = '#888';
        btnCrossModule.innerHTML = `🛰️ LOCALISER TACTIQUE <span style="font-size:0.8em; opacity:0.6;">[AUTO]</span>`;
    }
    
    btnCrossModule.style.fontWeight = 'bold';
    btnCrossModule.style.textTransform = 'uppercase';
    
    btnCrossModule.onclick = () => {
        window.location.href = `../map/index.html?focus=${encodeURIComponent(targetId)}`;
    };

    ui.editorBody.insertBefore(btnCrossModule, ui.editorBody.firstChild);

    const dl = document.getElementById('datalist-all');
    if(dl) {
        dl.innerHTML = state.nodes
            .filter(x => x.id !== n.id)
            .map(x => `<option value="${escapeHtml(x.name)}">`)
            .join('');
    }

    setupEditorListeners(n);
    renderActiveLinks(n);
}

function setupEditorListeners(n) {
    document.getElementById('btnCenterNode').onclick = () => { state.view.x = -n.x * state.view.scale; state.view.y = -n.y * state.view.scale; restartSim(); };
    
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

    document.getElementById('btnDelete').onclick = () => {
        showCustomConfirm(`Supprimer "${n.name}" ?`, () => {
            pushHistory(); 
            state.nodes = state.nodes.filter(x => x.id !== n.id);
            state.links = state.links.filter(l => !linkHasNode(l, n.id));
            state.selection = null; restartSim(); refreshLists(); renderEditor(); updatePathfindingPanel();
        });
    };

    document.getElementById('edName').oninput = (e) => { n.name = e.target.value; refreshLists(); draw(); };
    document.getElementById('edType').onchange = (e) => { n.type = e.target.value; updatePersonColors(); restartSim(); draw(); refreshLists(); renderEditor(); };
    const inpColor = document.getElementById('edColor');
    if(inpColor) inpColor.oninput = (e) => { n.color = e.target.value; updatePersonColors(); draw(); };
    const inpNum = document.getElementById('edNum');
    if(inpNum) inpNum.oninput = (e) => { n.num = e.target.value; };
    document.getElementById('edNotes').oninput = (e) => { n.notes = e.target.value; };

    // --- FIX : SAUVEGARDE IMMÉDIATE LORS DE LA VALIDATION ---
    const btnValMap = document.getElementById('btnValidateMapId');
    const inpMapId = document.getElementById('edMapId');
    
    if(btnValMap && inpMapId) {
        btnValMap.onclick = () => {
            n.linkedMapPointId = inpMapId.value.trim();
            saveState(); // <--- SAUVEGARDE FORCÉE ICI
            renderEditor(); 
            showCustomAlert("LIAISON ENREGISTRÉE");
        };
        inpMapId.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') btnValMap.click();
        });
    }

    // Création Liens
    const bindAdd = (type, btnId, inpId, selId) => {
        const btn = document.getElementById(btnId);
        if(!btn) return;
        btn.onclick = () => {
            const nameInput = document.getElementById(inpId);
            const kindSelect = document.getElementById(selId);
            const name = nameInput.value.trim();
            const kind = kindSelect.value;
            if (!name) return;
            let target = state.nodes.find(x => x.name.toLowerCase() === name.toLowerCase());
            if (!target) {
                showCustomConfirm(`"${name}" n'existe pas. Créer ?`, () => {
                    target = ensureNode(type, name); addLink(n, target, kind);
                    nameInput.value = ''; renderEditor(); updatePathfindingPanel(); refreshLists();
                });
            } else {
                addLink(n, target, kind); nameInput.value = ''; renderEditor(); updatePathfindingPanel();
            }
        };
    };
    bindAdd(TYPES.COMPANY, 'btnAddCompany', 'inpCompany', 'selKindCompany');
    bindAdd(TYPES.GROUP, 'btnAddGroup', 'inpGroup', 'selKindGroup');
    bindAdd(TYPES.PERSON, 'btnAddPerson', 'inpPerson', 'selKindPerson');

    document.getElementById('btnMerge').onclick = () => {
        const targetName = document.getElementById('mergeTarget').value.trim();
        const target = state.nodes.find(x => x.name.toLowerCase() === targetName.toLowerCase());
        if (target && target.id !== n.id) {
            showCustomConfirm(`Fusionner "${n.name}" DANS "${target.name}" ?`, () => { mergeNodes(n.id, target.id); selectNode(target.id); });
        } else { showCustomAlert("Cible invalide."); }
    };

    document.getElementById('btnExportRP').onclick = () => {
        const typeLabel = n.type === TYPES.PERSON ? "Individu" : (n.type === TYPES.COMPANY ? "Entreprise" : "Organisation");
        const relations = [];
        state.links.forEach(l => {
            const s = (typeof l.source === 'object') ? l.source : nodeById(l.source);
            const t = (typeof l.target === 'object') ? l.target : nodeById(l.target);
            if (!s || !t) return;
            if (s.id === n.id || t.id === n.id) {
                const other = (s.id === n.id) ? t : s;
                const kind = kindToLabel(l.kind).toUpperCase();
                const emoji = linkKindEmoji(l.kind);
                relations.push(`- ${emoji} [${kind}] ${other.name}`);
            }
        });
        const report = `📂 DOSSIER : ${n.name.toUpperCase()}\n================================\n🆔 ${typeLabel} ${n.num ? '| 📞 ' + n.num : ''}\n📝 NOTES :\n${n.notes || 'R.A.S'}\n--------------------------------\n🔗 RÉSEAU (${relations.length}) :\n${relations.length > 0 ? relations.join('\n') : "Aucun lien connu."}\n================================`.trim();
        navigator.clipboard.writeText(report).then(() => { showCustomAlert("✅ Dossier copié !"); });
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
    
    chipsContainer.onclick = (e) => {
        if(e.target.classList.contains('x')) {
            pushHistory();
            const sId = e.target.dataset.s;
            const tId = e.target.dataset.t;
            state.links = state.links.filter(l => {
                const s = (typeof l.source === 'object') ? String(l.source.id) : String(l.source);
                const t = (typeof l.target === 'object') ? String(l.target.id) : String(l.target);
                const sKey = String(sId);
                const tKey = String(tId);
                return !((s === sKey && t === tKey) || (s === tKey && t === sKey));
            });
            updatePersonColors(); restartSim(); renderEditor(); updatePathfindingPanel();
        }
    };
}
