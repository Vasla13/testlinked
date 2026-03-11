import { state, nodeById, pushHistory, scheduleSave, linkHasNode } from './state.js';
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

function nodeTypeLabel(type) {
    if (type === TYPES.COMPANY) return 'Entreprise';
    if (type === TYPES.GROUP) return 'Groupe';
    return 'Personne';
}

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

function getAutocompleteMatches(query, excludedIds = [], limit = 7) {
    const normalizedQuery = normalizeNodeLookupName(query);
    if (!normalizedQuery) return [];

    const excluded = new Set(excludedIds.map((id) => String(id)));
    return state.nodes
        .filter((item) => item && !excluded.has(String(item.id)))
        .map((item) => {
            const name = String(item.name || '').trim();
            const normalizedName = normalizeNodeLookupName(name);
            if (!normalizedName) return null;
            const starts = normalizedName.startsWith(normalizedQuery);
            const index = normalizedName.indexOf(normalizedQuery);
            if (index < 0) return null;
            return { item, starts, index };
        })
        .filter(Boolean)
        .sort((a, b) => {
            if (a.starts !== b.starts) return a.starts ? -1 : 1;
            if (a.index !== b.index) return a.index - b.index;
            return String(a.item.name || '').localeCompare(String(b.item.name || ''), 'fr', { sensitivity: 'base' });
        })
        .slice(0, limit)
        .map((entry) => entry.item);
}

function attachEditorAutocomplete({ input, resultsEl, excludedIds = [], onPick, onInputChange, onSubmit }) {
    if (!input || !resultsEl) {
        return {
            hide: () => {},
            refresh: () => {}
        };
    }

    let matches = [];
    let activeIndex = -1;
    let hideTimer = null;

    const clearHideTimer = () => {
        if (!hideTimer) return;
        clearTimeout(hideTimer);
        hideTimer = null;
    };

    const hide = () => {
        clearHideTimer();
        matches = [];
        activeIndex = -1;
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
    };

    const setActiveIndex = (nextIndex) => {
        activeIndex = nextIndex;
        Array.from(resultsEl.querySelectorAll('[data-autocomplete-index]')).forEach((button) => {
            button.classList.toggle('active', Number(button.getAttribute('data-autocomplete-index')) === activeIndex);
        });
    };

    const pickNode = (node, { focusInput = true } = {}) => {
        if (!node) return;
        input.value = String(node.name || '');
        hide();
        if (typeof onPick === 'function') onPick(node);
        if (focusInput) input.focus();
    };

    const render = () => {
        clearHideTimer();
        const query = String(input.value || '').trim();
        if (typeof onInputChange === 'function') onInputChange(query);
        if (!query) {
            hide();
            return;
        }

        matches = getAutocompleteMatches(query, excludedIds);
        activeIndex = -1;

        if (!matches.length) {
            hide();
            return;
        }

        resultsEl.hidden = false;
        resultsEl.innerHTML = matches.map((node, index) => `
            <button
                type="button"
                class="editor-autocomplete-hit"
                data-autocomplete-id="${escapeHtml(String(node.id || ''))}"
                data-autocomplete-index="${index}"
            >
                <span class="editor-autocomplete-name">${escapeHtml(String(node.name || 'Sans nom'))}</span>
                <span class="editor-autocomplete-type">${escapeHtml(nodeTypeLabel(node.type))}</span>
            </button>
        `).join('');

        Array.from(resultsEl.querySelectorAll('[data-autocomplete-id]')).forEach((button) => {
            button.onmousedown = (event) => {
                event.preventDefault();
                clearHideTimer();
            };
            button.onmouseenter = () => {
                setActiveIndex(Number(button.getAttribute('data-autocomplete-index')));
            };
            button.onclick = () => {
                const id = button.getAttribute('data-autocomplete-id') || '';
                const node = matches.find((entry) => String(entry.id) === String(id)) || null;
                pickNode(node);
            };
        });
    };

    input.addEventListener('input', render);
    input.addEventListener('focus', () => {
        if (String(input.value || '').trim()) render();
    });
    input.addEventListener('blur', () => {
        clearHideTimer();
        hideTimer = setTimeout(hide, 120);
    });
    input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!matches.length) {
                render();
                if (!matches.length) return;
            }
            const nextIndex = Math.min(activeIndex + 1, matches.length - 1);
            setActiveIndex(nextIndex < 0 ? 0 : nextIndex);
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!matches.length) {
                render();
                if (!matches.length) return;
            }
            if (!matches.length) return;
            const nextIndex = activeIndex <= 0 ? 0 : activeIndex - 1;
            setActiveIndex(nextIndex);
            return;
        }
        if (event.key === 'Escape') {
            hide();
            return;
        }
        if (event.key === 'Tab' && activeIndex >= 0 && matches[activeIndex]) {
            event.preventDefault();
            pickNode(matches[activeIndex], { focusInput: false });
            return;
        }
        if (event.key === 'Enter') {
            if (activeIndex >= 0 && matches[activeIndex]) {
                event.preventDefault();
                pickNode(matches[activeIndex]);
                return;
            }
            if (typeof onSubmit === 'function') {
                event.preventDefault();
                onSubmit();
            }
        }
    });

    hide();

    return {
        hide,
        refresh: render
    };
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
    ui.editorBody.querySelectorAll('input:not([type="color"]), textarea').forEach((field) => {
        field.setAttribute('autocomplete', 'off');
        field.setAttribute('autocorrect', 'off');
        field.setAttribute('autocapitalize', 'off');
        field.setAttribute('spellcheck', 'false');
    });

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
    const btnMergeLaunch = document.getElementById('btnMergeLaunch');
    const syncAdvancedButtons = () => {
        const isOpen = !!advancedPanel?.classList.contains('open');
        if (btnToggleEdit) btnToggleEdit.textContent = isOpen ? 'Fermer' : 'Modifier';
    };
    if (advancedPanel && editorAdvancedOpen) advancedPanel.classList.add('open');
    syncAdvancedButtons();
    const setAdvancedOpen = (isOpen) => {
        if (!advancedPanel) return;
        advancedPanel.classList.toggle('open', !!isOpen);
        editorAdvancedOpen = advancedPanel.classList.contains('open');
        syncAdvancedButtons();
        const editorPanel = document.getElementById('editor');
        requestAnimationFrame(() => clampEditorInViewport(editorPanel));
        setTimeout(() => clampEditorInViewport(editorPanel), 40);
    };
    const toggleAdvanced = () => setAdvancedOpen(!advancedPanel?.classList.contains('open'));
    if (btnToggleEdit) btnToggleEdit.onclick = toggleAdvanced;

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

    const syncEditorPhoneDisplays = (nextPhone) => {
        const safePhone = String(nextPhone || '').trim();
        const quickPhone = document.getElementById('edQuickNum');
        if (quickPhone && quickPhone.value !== safePhone) quickPhone.value = safePhone;
        const fullPhone = document.getElementById('edNum');
        if (fullPhone && fullPhone.value !== safePhone) fullPhone.value = safePhone;
    };

    const syncMetaDisplays = () => {
        const accountValue = String(n.accountNumber || '').trim();
        const citizenValue = String(n.citizenNumber || '').trim();

        const quickAccount = document.getElementById('edQuickAccountNumber');
        const fullAccount = document.getElementById('edAccountNumber');
        const quickCitizen = document.getElementById('edQuickCitizenNumber');
        const fullCitizen = document.getElementById('edCitizenNumber');

        if (quickAccount && quickAccount.value !== accountValue) quickAccount.value = accountValue;
        if (fullAccount && fullAccount.value !== accountValue) fullAccount.value = accountValue;
        if (quickCitizen && quickCitizen.value !== citizenValue) quickCitizen.value = citizenValue;
        if (fullCitizen && fullCitizen.value !== citizenValue) fullCitizen.value = citizenValue;
    };

    const applyNodeName = (nextName) => {
        queueHistory();
        n.name = String(nextName || '').replace(/\s+/g, ' ').trim();
        syncEditorNameDisplays(n.name);
        refreshLists();
        draw();
        scheduleSave();
    };

    const applyNodePhone = (nextPhone) => {
        queueHistory();
        n.num = String(nextPhone || '').trim();
        syncEditorPhoneDisplays(n.num);
        scheduleSave();
    };

    document.getElementById('edName').oninput = (e) => {
        applyNodeName(e.target.value);
    };
    const edQuickName = document.getElementById('edQuickName');
    if (edQuickName) edQuickName.oninput = (e) => applyNodeName(e.target.value);
    const edQuickNum = document.getElementById('edQuickNum');
    if (edQuickNum) edQuickNum.oninput = (e) => applyNodePhone(e.target.value);
    document.getElementById('edType').onchange = (e) => { queueHistory(); n.type = e.target.value; updatePersonColors(); restartSim(); draw(); refreshLists(); renderEditor(); scheduleSave(); };
    const inpColor = document.getElementById('edColor');
    if(inpColor) inpColor.oninput = (e) => { queueHistory(); n.color = e.target.value; updatePersonColors(); draw(); scheduleSave(); };
    const inpNum = document.getElementById('edNum');
    if(inpNum) inpNum.oninput = (e) => { applyNodePhone(e.target.value); };
    const inpAccountNumber = document.getElementById('edAccountNumber');
    const inpQuickAccountNumber = document.getElementById('edQuickAccountNumber');
    if (inpAccountNumber) {
        inpAccountNumber.oninput = (e) => {
            queueHistory();
            n.accountNumber = e.target.value;
            syncMetaDisplays();
            scheduleSave();
        };
    }
    if (inpQuickAccountNumber) {
        inpQuickAccountNumber.oninput = (e) => {
            queueHistory();
            n.accountNumber = e.target.value;
            syncMetaDisplays();
            scheduleSave();
        };
    }
    const inpCitizenNumber = document.getElementById('edCitizenNumber');
    const inpQuickCitizenNumber = document.getElementById('edQuickCitizenNumber');
    if (inpCitizenNumber) {
        inpCitizenNumber.oninput = (e) => {
            queueHistory();
            n.citizenNumber = e.target.value;
            syncMetaDisplays();
            scheduleSave();
        };
    }
    if (inpQuickCitizenNumber) {
        inpQuickCitizenNumber.oninput = (e) => {
            queueHistory();
            n.citizenNumber = e.target.value;
            syncMetaDisplays();
            scheduleSave();
        };
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

    const linkNameInput = document.getElementById('editorLinkName');
    const linkTypeSelect = document.getElementById('editorLinkType');
    const linkKindSelect = document.getElementById('editorLinkKind');
    const linkHint = document.getElementById('editorLinkHint');
    const btnAddLinkQuick = document.getElementById('btnAddLinkQuick');
    const linkNameResults = document.getElementById('editorLinkNameResults');
    const mergeInput = document.getElementById('mergeTarget');
    const mergeResults = document.getElementById('mergeTargetResults');
    const btnMergeApply = document.getElementById('btnMergeApply');
    const mergeSection = document.getElementById('editorMergeSection');

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

        if (linkNameInput) linkNameInput.value = '';
        linkAutocomplete.hide();
        requestAnimationFrame(() => {
            document.getElementById('editorLinkName')?.focus();
        });
    };

    const linkAutocomplete = attachEditorAutocomplete({
        input: linkNameInput,
        resultsEl: linkNameResults,
        excludedIds: [n.id],
        onPick: () => syncQuickLinkComposer(),
        onInputChange: () => syncQuickLinkComposer(),
        onSubmit: submitQuickLink
    });
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

    const mergeAutocomplete = attachEditorAutocomplete({
        input: mergeInput,
        resultsEl: mergeResults,
        excludedIds: [n.id],
        onSubmit: submitMergeTarget
    });

    if (btnMergeLaunch) {
        btnMergeLaunch.onclick = () => {
            setAdvancedOpen(true);
            requestAnimationFrame(() => {
                mergeSection?.scrollIntoView({ block: 'nearest' });
                mergeInput?.focus();
                mergeInput?.select();
            });
        };
    }

    if (btnMergeApply) btnMergeApply.onclick = () => {
        mergeAutocomplete.hide();
        submitMergeTarget();
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
        const reportDescription = n.description || n.notes || 'R.A.S';
        const report = `📂 DOSSIER : ${n.name.toUpperCase()}\n================================\n🆔 ${typeLabel} ${n.num ? '| 📞 ' + n.num : ''}\n🧾 COMPTE : ${n.accountNumber || 'N/A'}\n🪪 CITOYEN : ${n.citizenNumber || 'N/A'}\n📝 DESCRIPTION :\n${reportDescription}\n--------------------------------\n🔗 RÉSEAU (${relations.length}) :\n${relations.length > 0 ? relations.join('\n') : "Aucun lien connu."}\n================================`.trim();
        navigator.clipboard.writeText(report).then(() => { showCustomAlert("✅ Dossier copié !"); });
    };
}

function renderActiveLinks(n) {
    const chipsContainer = document.getElementById('chipsLinks');
    const linksCount = document.getElementById('editorLinksCount');
    let activeSelect = null;
    let activeBadge = null;
    let outsideHandler = null;
    const myLinks = state.links.filter(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        return s === n.id || t === n.id;
    });

    if (linksCount) linksCount.textContent = String(myLinks.length);

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
        const cards = items.map((item) => {
            const linkColor = computeLinkColor(item.link);
            const typeLabel = kindToLabel(item.link.kind);
            const emoji = linkKindEmoji(item.link.kind);
            return `
            <div class="chip" data-link-id="${item.link.id}" style="border-left-color: ${linkColor};">
                <div class="chip-content">
                    <span class="chip-name" data-node-id="${escapeHtml(String(item.other.id))}">${escapeHtml(item.other.name)}</span>
                    <div class="chip-meta"><span class="chip-badge" data-link-id="${item.link.id}" style="color: ${linkColor};">${emoji} ${typeLabel}</span></div>
                </div>
                <div class="x" title="Supprimer le lien" data-id="${item.link.id}">×</div>
            </div>`;
        }).join('');

        return `
            <section class="link-group-section">
                <div class="link-group-head">
                    <div class="link-category">${title}</div>
                    <div class="link-group-count">${items.length}</div>
                </div>
                <div class="link-grid">${cards}</div>
            </section>
        `;
    };

    chipsContainer.innerHTML = `
        ${renderGroup('PERSONNES', groups[TYPES.PERSON])}
        ${renderGroup('ENTREPRISES', groups[TYPES.COMPANY])}
        ${renderGroup('GROUPES', groups[TYPES.GROUP])}
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
