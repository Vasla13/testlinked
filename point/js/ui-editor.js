import { state, nodeById, pushHistory, saveState, scheduleSave, linkHasNode } from './state.js'; // AJOUT saveState
import { ensureNode, mergeNodes, updatePersonColors } from './logic.js';
import { renderEditorHTML } from './templates.js';
import { restartSim } from './physics.js';
import { draw, updateDegreeCache } from './render.js';
import { addLink as addUILink, logNodeAdded, refreshLists, updatePathfindingPanel, selectNode, showCustomConfirm, showCustomAlert, showCustomPrompt, refreshHvt } from './ui.js';
import { escapeHtml, kindToLabel, linkKindEmoji, computeLinkColor } from './utils.js';
import { TYPES, KINDS, KIND_LABELS, PERSON_PERSON_KINDS, PERSON_ORG_KINDS, ORG_ORG_KINDS } from './constants.js';

const ui = {
    editorTitle: document.getElementById('editorTitle'),
    editorBody: document.getElementById('editorBody')
};

const editorDragState = {
    initialized: false,
    dragging: false,
    offsetX: 0,
    offsetY: 0
};
let editorAdvancedOpen = false;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function getAllowedKindsForTarget(sourceType, targetType) {
    let base;
    if (sourceType === TYPES.PERSON && targetType === TYPES.PERSON) base = PERSON_PERSON_KINDS;
    else if (sourceType === TYPES.PERSON || targetType === TYPES.PERSON) base = PERSON_ORG_KINDS;
    else base = ORG_ORG_KINDS;
    const allowed = new Set(base);
    allowed.add(KINDS.RELATION);
    return allowed;
}

function buildKindOptions(allowedKinds, selected = '') {
    return Object.keys(KIND_LABELS)
        .filter((kind) => !allowedKinds || allowedKinds.has(kind))
        .map((kind) => `<option value="${kind}" ${kind === selected ? 'selected' : ''}>${linkKindEmoji(kind)} ${kindToLabel(kind)}</option>`)
        .join('');
}

function normalizeNodeLookupName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function isCompactLayout() {
    return window.matchMedia('(max-width: 900px)').matches;
}

function resetEditorPosition(editorPanel) {
    if (!editorPanel) return;
    editorPanel.style.left = '50%';
    editorPanel.style.top = '50%';
    editorPanel.style.transform = 'translate(-50%, -50%)';
    editorPanel.dataset.freePosition = '0';
}

function clampEditorInViewport(editorPanel = document.getElementById('editor')) {
    if (!editorPanel || isCompactLayout()) return;
    if (editorPanel.style.display === 'none') return;

    const rightPanel = document.getElementById('right');
    if (!rightPanel) return;

    const containerRect = rightPanel.getBoundingClientRect();
    const maxX = Math.max(8, containerRect.width - editorPanel.offsetWidth - 8);
    const maxY = Math.max(8, containerRect.height - editorPanel.offsetHeight - 8);

    if (editorPanel.dataset.freePosition === '1') {
        const currentLeft = Number.parseFloat(editorPanel.style.left || '8');
        const currentTop = Number.parseFloat(editorPanel.style.top || '8');
        editorPanel.style.left = `${clamp(currentLeft, 8, maxX)}px`;
        editorPanel.style.top = `${clamp(currentTop, 8, maxY)}px`;
        editorPanel.style.transform = 'none';
        return;
    }

    const panelRect = editorPanel.getBoundingClientRect();
    const overflowTop = panelRect.top - containerRect.top - 8;
    const overflowBottom = containerRect.bottom - panelRect.bottom - 8;

    if (overflowTop >= 0 && overflowBottom >= 0) return;

    const centeredLeft = Math.max(8, (containerRect.width - editorPanel.offsetWidth) / 2);
    const centeredTop = clamp((containerRect.height - editorPanel.offsetHeight) / 2, 8, maxY);
    editorPanel.style.left = `${centeredLeft}px`;
    editorPanel.style.top = `${centeredTop}px`;
    editorPanel.style.transform = 'none';
    editorPanel.dataset.freePosition = '1';
}

function ensureEditorDrag() {
    if (editorDragState.initialized) return;
    editorDragState.initialized = true;

    const editorPanel = document.getElementById('editor');
    const dragHandle = document.getElementById('editorDragHandle');
    const rightPanel = document.getElementById('right');
    if (!editorPanel || !dragHandle || !rightPanel) return;

    dragHandle.addEventListener('dblclick', () => {
        if (isCompactLayout()) return;
        resetEditorPosition(editorPanel);
        requestAnimationFrame(() => clampEditorInViewport(editorPanel));
    });

    dragHandle.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        if (isCompactLayout()) return;
        if (editorPanel.style.display === 'none') return;

        const panelRect = editorPanel.getBoundingClientRect();
        const containerRect = rightPanel.getBoundingClientRect();

        if (editorPanel.dataset.freePosition !== '1') {
            editorPanel.style.left = `${panelRect.left - containerRect.left}px`;
            editorPanel.style.top = `${panelRect.top - containerRect.top}px`;
            editorPanel.style.transform = 'none';
            editorPanel.dataset.freePosition = '1';
        }

        const currentRect = editorPanel.getBoundingClientRect();
        editorDragState.dragging = true;
        editorDragState.offsetX = event.clientX - currentRect.left;
        editorDragState.offsetY = event.clientY - currentRect.top;
        editorPanel.classList.add('dragging');
        event.preventDefault();
    });

    window.addEventListener('mousemove', (event) => {
        if (!editorDragState.dragging) return;
        if (isCompactLayout()) return;

        const containerRect = rightPanel.getBoundingClientRect();
        let x = event.clientX - containerRect.left - editorDragState.offsetX;
        let y = event.clientY - containerRect.top - editorDragState.offsetY;
        const maxX = Math.max(8, containerRect.width - editorPanel.offsetWidth - 8);
        const maxY = Math.max(8, containerRect.height - editorPanel.offsetHeight - 8);

        x = clamp(x, 8, maxX);
        y = clamp(y, 8, maxY);

        editorPanel.style.left = `${x}px`;
        editorPanel.style.top = `${y}px`;
        editorPanel.style.transform = 'none';
        editorPanel.dataset.freePosition = '1';
    });

    window.addEventListener('mouseup', () => {
        if (!editorDragState.dragging) return;
        editorDragState.dragging = false;
        editorPanel.classList.remove('dragging');
    });

    window.addEventListener('resize', () => {
        if (isCompactLayout()) {
            editorDragState.dragging = false;
            editorPanel.classList.remove('dragging');
            editorPanel.style.left = '';
            editorPanel.style.top = '';
            editorPanel.style.transform = '';
            editorPanel.dataset.freePosition = '0';
            return;
        }
        clampEditorInViewport(editorPanel);
    });
}

export function renderEditor() {
    ensureEditorDrag();
    const n = nodeById(state.selection);
    updatePathfindingPanel();
    const editorPanel = document.getElementById('editor');

    if (!n) {
        if (editorPanel) editorPanel.style.display = 'none';
        ui.editorTitle.style.display = 'none';
        ui.editorBody.innerHTML = '';
        return;
    }
    if (editorPanel) editorPanel.style.display = 'block';

    ui.editorTitle.style.display = 'none';
    ui.editorBody.innerHTML = renderEditorHTML(n, state);

    const dl = document.getElementById('datalist-all');
    if(dl) {
        dl.innerHTML = state.nodes
            .filter(x => x.id !== n.id)
            .map(x => `<option value="${escapeHtml(x.name)}">`)
            .join('');
    }

    setupEditorListeners(n);
    renderActiveLinks(n);
    requestAnimationFrame(() => clampEditorInViewport(editorPanel));
}

function setupEditorListeners(n) {
    let editHistoryArmed = false;
    let editHistoryTimer = null;
    const queueHistory = () => {
        if (!editHistoryArmed) {
            pushHistory();
            editHistoryArmed = true;
        }
        if (editHistoryTimer) clearTimeout(editHistoryTimer);
        editHistoryTimer = setTimeout(() => { editHistoryArmed = false; }, 800);
    };

    const advancedPanel = document.getElementById('editorAdvanced');
    const btnToggleEdit = document.getElementById('btnToggleEdit');
    const btnToggleEditSecondary = document.getElementById('btnToggleEditSecondary');
    const syncAdvancedButtons = () => {
        const isOpen = !!advancedPanel?.classList.contains('open');
        if (btnToggleEdit) btnToggleEdit.textContent = isOpen ? 'Fermer' : 'Modifier';
        if (btnToggleEditSecondary) btnToggleEditSecondary.textContent = isOpen ? 'Fermer' : 'Options';
    };
    if (advancedPanel && editorAdvancedOpen) advancedPanel.classList.add('open');
    syncAdvancedButtons();
    const toggleAdvanced = () => {
        if (!advancedPanel) return;
        advancedPanel.classList.toggle('open');
        editorAdvancedOpen = advancedPanel.classList.contains('open');
        syncAdvancedButtons();
        const editorPanel = document.getElementById('editor');
        requestAnimationFrame(() => clampEditorInViewport(editorPanel));
        setTimeout(() => clampEditorInViewport(editorPanel), 40);
    };
    if (btnToggleEdit) btnToggleEdit.onclick = toggleAdvanced;
    if (btnToggleEditSecondary) btnToggleEditSecondary.onclick = toggleAdvanced;

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
            scheduleSave();
            refreshHvt();
        });
    };

    const syncEditorNameDisplays = (nextName) => {
        const safeName = String(nextName || '').trim();
        const headName = document.querySelector('.editor-sheet-name');
        if (headName) headName.textContent = safeName || 'Sans nom';
        const quickName = document.getElementById('edQuickName');
        if (quickName && quickName.value !== safeName) quickName.value = safeName;
        const fullName = document.getElementById('edName');
        if (fullName && fullName.value !== safeName) fullName.value = safeName;
    };

    const applyNodeName = (nextName) => {
        queueHistory();
        n.name = String(nextName || '').replace(/\s+/g, ' ').trim();
        syncEditorNameDisplays(n.name);
        refreshLists();
        draw();
        scheduleSave();
    };

    const splitIdentity = (name) => {
        const raw = String(name || '').trim().replace(/\s+/g, ' ');
        if (!raw) return { first: '', last: '' };
        const parts = raw.split(' ');
        if (parts.length === 1) return { first: parts[0], last: '' };
        return {
            first: parts.slice(0, -1).join(' '),
            last: parts.slice(-1).join('')
        };
    };

    const edFirstName = document.getElementById('edFirstName');
    const edLastName = document.getElementById('edLastName');
    const edQuickName = document.getElementById('edQuickName');
    const syncIdentityInputs = (nameValue) => {
        const parts = splitIdentity(nameValue);
        if (edFirstName && edFirstName.value !== parts.first) edFirstName.value = parts.first;
        if (edLastName && edLastName.value !== parts.last) edLastName.value = parts.last;
    };

    document.getElementById('edName').oninput = (e) => {
        applyNodeName(e.target.value);
        syncIdentityInputs(e.target.value);
    };
    if (edQuickName) {
        edQuickName.oninput = (e) => {
            applyNodeName(e.target.value);
        };
    }
    if (edFirstName || edLastName) {
        const updateIdentityName = () => {
            const first = String(edFirstName?.value || '').trim();
            const last = String(edLastName?.value || '').trim();
            applyNodeName([first, last].filter(Boolean).join(' '));
        };
        if (edFirstName) edFirstName.oninput = updateIdentityName;
        if (edLastName) edLastName.oninput = updateIdentityName;
    }
    document.getElementById('edType').onchange = (e) => { queueHistory(); n.type = e.target.value; updatePersonColors(); restartSim(); draw(); refreshLists(); renderEditor(); scheduleSave(); };
    const inpColor = document.getElementById('edColor');
    if(inpColor) inpColor.oninput = (e) => { queueHistory(); n.color = e.target.value; updatePersonColors(); draw(); scheduleSave(); };
    const inpNum = document.getElementById('edNum');
    if(inpNum) inpNum.oninput = (e) => { queueHistory(); n.num = e.target.value; scheduleSave(); };
    const inpAccountNumber = document.getElementById('edAccountNumber');
    if (inpAccountNumber) {
        inpAccountNumber.oninput = (e) => { queueHistory(); n.accountNumber = e.target.value; scheduleSave(); };
    }
    const inpCitizenNumber = document.getElementById('edCitizenNumber');
    if (inpCitizenNumber) {
        inpCitizenNumber.oninput = (e) => { queueHistory(); n.citizenNumber = e.target.value; scheduleSave(); };
    }
    const inpDescription = document.getElementById('edDescription');
    if (inpDescription) {
        inpDescription.oninput = (e) => {
            queueHistory();
            n.description = e.target.value;
            n.notes = e.target.value;
            scheduleSave();
        };
    }

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

    const btnOpenMapLink = document.getElementById('btnOpenMapLink');
    if (btnOpenMapLink) {
        btnOpenMapLink.onclick = () => {
            const targetId = (n.linkedMapPointId || n.id || '').trim();
            if (!targetId) return;
            window.location.href = `../map/index.html?focus=${encodeURIComponent(targetId)}`;
        };
    }

    const linkNameInput = document.getElementById('editorLinkName');
    const linkTypeSelect = document.getElementById('editorLinkType');
    const linkKindSelect = document.getElementById('editorLinkKind');
    const linkHint = document.getElementById('editorLinkHint');
    const btnAddLinkQuick = document.getElementById('btnAddLinkQuick');
    const mergeInput = document.getElementById('mergeTarget');
    const btnMerge = document.getElementById('btnMerge');
    const btnMergeApply = document.getElementById('btnMergeApply');

    const resolveQuickLinkTarget = () => {
        const rawName = normalizeNodeLookupName(linkNameInput?.value || '');
        if (!rawName) return null;
        return state.nodes.find((item) => normalizeNodeLookupName(item.name || '') === rawName) || null;
    };

    const syncQuickLinkComposer = () => {
        if (!linkTypeSelect || !linkKindSelect) return;
        const target = resolveQuickLinkTarget();
        const targetType = target ? target.type : String(linkTypeSelect.value || TYPES.PERSON);
        const selectedKind = String(linkKindSelect.value || '');
        linkTypeSelect.value = targetType;
        linkTypeSelect.disabled = !!target;
        linkKindSelect.innerHTML = buildKindOptions(getAllowedKindsForTarget(n.type, targetType), selectedKind);
        if (linkHint) {
            linkHint.textContent = target
                ? `${target.name} existe deja. Son type est verrouille automatiquement.`
                : `Si la fiche n'existe pas, elle sera creee comme ${targetType === TYPES.COMPANY ? 'entreprise' : (targetType === TYPES.GROUP ? 'groupe' : 'personne')}.`;
        }
    };

    const submitQuickLink = () => {
        const name = String(linkNameInput?.value || '').trim();
        const kind = String(linkKindSelect?.value || '').trim();
        const selectedType = String(linkTypeSelect?.value || TYPES.PERSON);
        if (!name) {
            showCustomAlert('Renseigne le nom de la fiche a lier.');
            return;
        }

        let target = resolveQuickLinkTarget();
        if (!target) {
            target = ensureNode(selectedType, name);
            logNodeAdded(target.name, n.name);
        }

        if (String(target.id) === String(n.id)) {
            showCustomAlert('Impossible de lier une fiche a elle-meme.');
            return;
        }

        const added = addUILink(n.id, target.id, kind, { actor: n.name });
        if (!added) {
            showCustomAlert('Lien deja existant ou invalide.');
            return;
        }

        editorAdvancedOpen = true;
        if (linkNameInput) linkNameInput.value = '';
        requestAnimationFrame(() => {
            const reopened = document.getElementById('editorAdvanced');
            if (reopened) reopened.classList.add('open');
            document.getElementById('editorLinkName')?.focus();
        });
    };

    if (linkNameInput) {
        linkNameInput.oninput = () => syncQuickLinkComposer();
        linkNameInput.onkeydown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                submitQuickLink();
            }
        };
    }
    if (linkTypeSelect) linkTypeSelect.onchange = () => syncQuickLinkComposer();
    if (btnAddLinkQuick) btnAddLinkQuick.onclick = submitQuickLink;
    syncQuickLinkComposer();

    const runMerge = (targetName) => {
        const normalizedTarget = normalizeNodeLookupName(targetName);
        const target = state.nodes.find((item) => normalizeNodeLookupName(item.name || '') === normalizedTarget);
        if (target && target.id !== n.id) {
            showCustomConfirm(`Fusionner "${n.name}" DANS "${target.name}" ?`, () => {
                mergeNodes(n.id, target.id);
                selectNode(target.id);
                scheduleSave();
                refreshHvt();
            });
        } else {
            showCustomAlert("Cible invalide.");
        }
    };

    const submitMergeTarget = () => {
        const targetNameRaw = mergeInput ? mergeInput.value.trim() : '';
        if (!targetNameRaw) {
            showCustomAlert('Choisis une fiche pour la fusion.');
            mergeInput?.focus();
            return;
        }
        runMerge(targetNameRaw);
    };

    if (mergeInput) {
        mergeInput.onkeydown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                submitMergeTarget();
            }
        };
    }

    if (btnMergeApply) btnMergeApply.onclick = submitMergeTarget;

    if (btnMerge) {
        btnMerge.onclick = () => {
            const targetNameRaw = mergeInput ? mergeInput.value.trim() : '';
            if (targetNameRaw) {
                submitMergeTarget();
                return;
            }
            editorAdvancedOpen = true;
            requestAnimationFrame(() => {
                const reopened = document.getElementById('editorAdvanced');
                if (reopened) {
                    reopened.classList.add('open');
                    syncAdvancedButtons();
                    clampEditorInViewport(document.getElementById('editor'));
                }
                document.getElementById('mergeTarget')?.focus();
            });
        };
    }

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
        const reportDescription = n.description || n.notes || 'R.A.S';
        const report = `📂 DOSSIER : ${n.name.toUpperCase()}\n================================\n🆔 ${typeLabel} ${n.num ? '| 📞 ' + n.num : ''}\n🧾 COMPTE : ${n.accountNumber || 'N/A'}\n🪪 CITOYEN : ${n.citizenNumber || 'N/A'}\n📝 DESCRIPTION :\n${reportDescription}\n--------------------------------\n🔗 RÉSEAU (${relations.length}) :\n${relations.length > 0 ? relations.join('\n') : "Aucun lien connu."}\n================================`.trim();
        navigator.clipboard.writeText(report).then(() => { showCustomAlert("✅ Dossier copié !"); });
    };
}

function renderActiveLinks(n) {
    const chipsContainer = document.getElementById('chipsLinks');
    let activeSelect = null;
    let activeBadge = null;
    let outsideHandler = null;
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

    const getAllowedKinds = (sourceType, targetType) => {
        let base;
        if (sourceType === TYPES.PERSON && targetType === TYPES.PERSON) base = PERSON_PERSON_KINDS;
        else if (sourceType === TYPES.PERSON || targetType === TYPES.PERSON) base = PERSON_ORG_KINDS;
        else base = ORG_ORG_KINDS;
        const allowed = new Set(base);
        allowed.add(KINDS.RELATION);
        return allowed;
    };

    const renderGroup = (title, items) => {
        if (items.length === 0) return '';
        let html = `<div class="link-category">${title}</div>`;
        items.forEach(item => {
            const linkColor = computeLinkColor(item.link);
            const typeLabel = kindToLabel(item.link.kind);
            const emoji = linkKindEmoji(item.link.kind);
            html += `
            <div class="chip" data-link-id="${item.link.id}" style="border-left-color: ${linkColor};">
                <div class="chip-content">
                    <span class="chip-name" data-node-id="${escapeHtml(String(item.other.id))}">${escapeHtml(item.other.name)}</span>
                    <div class="chip-meta"><span class="chip-badge" data-link-id="${item.link.id}" style="color: ${linkColor};">${emoji} ${typeLabel}</span></div>
                </div>
                <div class="x" title="Supprimer le lien" data-id="${item.link.id}">×</div>
            </div>`;
        });
        return html;
    };

    chipsContainer.innerHTML = `
        <div class="sheet-links-columns">
            <div class="sheet-links-col">
                ${renderGroup('ENTREPRISES', groups[TYPES.COMPANY])}
                ${renderGroup('GROUPUSCULES', groups[TYPES.GROUP])}
            </div>
            <div class="sheet-links-col">
                ${renderGroup('PERSONNES', groups[TYPES.PERSON])}
            </div>
        </div>
    `;

    const closeActiveSelect = () => {
        if (!activeSelect) return;
        const badge = activeBadge;
        const linkId = badge?.dataset.linkId;
        const link = linkId ? state.links.find(l => String(l.id) === String(linkId)) : null;
        if (badge && link) {
            badge.textContent = `${linkKindEmoji(link.kind)} ${kindToLabel(link.kind)}`;
        } else {
            renderEditor();
        }
        activeSelect = null;
        activeBadge = null;
        if (outsideHandler) {
            document.removeEventListener('click', outsideHandler);
            outsideHandler = null;
        }
    };

    chipsContainer.onclick = (e) => {
        const nodeName = e.target.closest('.chip-name[data-node-id]');
        if (nodeName) {
            const nodeId = nodeName.dataset.nodeId;
            if (nodeId) window.zoomToNode(nodeId);
            return;
        }

        const delBtn = e.target.closest('.x');
        if(delBtn) {
            pushHistory();
            const linkId = delBtn.dataset.id;
            state.links = state.links.filter(l => String(l.id) !== String(linkId));
            updatePersonColors(); updateDegreeCache(); restartSim(); renderEditor(); updatePathfindingPanel(); draw(); scheduleSave(); refreshHvt();
            return;
        }

        if (activeSelect && activeSelect.contains(e.target)) return;

        const badge = e.target.closest('.chip-badge');
        if (badge) {
            e.preventDefault();
            e.stopPropagation();
            if (activeBadge && badge === activeBadge) return;
            closeActiveSelect();

            const linkId = badge.dataset.linkId || badge.closest('.chip')?.dataset.linkId;
            const link = state.links.find(l => String(l.id) === String(linkId));
            if (!link) return;

            const s = (typeof link.source === 'object') ? link.source : nodeById(link.source);
            const t = (typeof link.target === 'object') ? link.target : nodeById(link.target);
            if (!s || !t) return;
            const other = (s.id === n.id) ? t : s;

            const allowedKinds = getAllowedKinds(n.type, other.type);
            const kindsForUi = new Set(allowedKinds);
            if (link.kind) kindsForUi.add(link.kind);
            const options = Object.keys(KIND_LABELS)
                .filter(k => kindsForUi.has(k))
                .map(k => `<option value="${k}">${linkKindEmoji(k)} ${kindToLabel(k)}</option>`)
                .join('');

            const select = document.createElement('select');
            select.className = 'compact-select';
            select.style.fontSize = '0.7rem';
            select.style.padding = '2px 6px';
            select.innerHTML = options;
            select.value = link.kind;

            badge.textContent = '';
            badge.appendChild(select);
            activeSelect = select;
            activeBadge = badge;

            const applyChange = () => {
                const nextKind = select.value;
                if (nextKind && nextKind !== link.kind) {
                    pushHistory();
                    link.kind = nextKind;
                    updatePersonColors();
                    restartSim();
                    updatePathfindingPanel();
                    scheduleSave();
                    refreshHvt();
                }
                renderEditor();
            };

            select.onchange = applyChange;
            select.onblur = () => {};
            select.onkeydown = (ev) => {
                if (ev.key === 'Enter') applyChange();
                if (ev.key === 'Escape') renderEditor();
            };
            select.focus();

            outsideHandler = (ev) => {
                if (activeBadge && activeBadge.contains(ev.target)) return;
                closeActiveSelect();
            };
            setTimeout(() => {
                document.addEventListener('click', outsideHandler);
            }, 0);
        }
    };
}
