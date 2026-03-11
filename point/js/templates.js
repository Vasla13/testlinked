import { TYPES, KINDS, KIND_LABELS, PERSON_PERSON_KINDS, PERSON_ORG_KINDS, ORG_ORG_KINDS } from './constants.js';
import { escapeHtml, safeHex, linkKindEmoji, kindToLabel } from './utils.js';

// Génère les options pour les listes déroulantes de liens
function getAllowedKinds(sourceType, targetType) {
    let base;
    if (sourceType === TYPES.PERSON && targetType === TYPES.PERSON) base = PERSON_PERSON_KINDS;
    else if (sourceType === TYPES.PERSON || targetType === TYPES.PERSON) base = PERSON_ORG_KINDS;
    else base = ORG_ORG_KINDS;
    const allowed = new Set(base);
    allowed.add(KINDS.RELATION);
    return allowed;
}

function getLinkOptions(allowedKinds) {
    return Object.keys(KIND_LABELS)
        .filter(k => !allowedKinds || allowedKinds.has(k))
        .map(k => `<option value="${k}">${linkKindEmoji(k)} ${kindToLabel(k)}</option>`)
        .join('');
}

// =============================================================================
// --- 1. BARRE LATÉRALE GAUCHE (PATHFINDING / IA) ---
// =============================================================================
export function renderPathfindingSidebar(state, selectedNode) {
    if (!state.pathfinding.startId) {
        if (selectedNode) {
            return `
                <div class="pf-card">
                    <div class="pf-card-head">
                        <span class="pf-card-kicker">LIAISON IA</span>
                        <span class="pf-card-led"></span>
                    </div>
                    <div class="pf-node-box pf-node-box-active">
                        <span class="pf-node-label">Candidat source</span>
                        <span class="pf-node-value">${escapeHtml(selectedNode.name)}</span>
                    </div>
                    <button id="btnPathStart" class="primary pf-action-btn" type="button">
                        Choisir source
                    </button>
                </div>
            `;
        } else {
            return `
                <div class="pf-empty-card">
                    <div class="pf-empty-icon">ANT</div>
                    <div class="pf-empty-text">En attente de signal...</div>
                </div>
            `;
        }
    }

    const startNode = state.nodes.find(n => n.id === state.pathfinding.startId);
    const startName = startNode ? escapeHtml(startNode.name) : "ERR_UNKNOWN";
    const targetNode = (selectedNode && selectedNode.id !== state.pathfinding.startId) ? selectedNode : null;
    const hasTarget = !!targetNode;

    let statusDisplay = '';
    if (state.pathfinding.active) {
        statusDisplay = `<div class="pf-status pf-status-active">Liaison active</div>`;
    } else if (hasTarget) {
        statusDisplay = `<button id="btnPathCalc" class="pf-action-btn pf-action-btn-alt" type="button">Connecter</button>`;
    } else {
        statusDisplay = `<div class="pf-status pf-status-idle">En attente de cible...</div>`;
    }

    return `
        <div class="pf-card">
            <div class="pf-card-head">
                <span class="pf-card-kicker">LIAISON IA</span>
                <span class="pf-card-led ${state.pathfinding.active ? 'is-active' : ''}"></span>
            </div>
            <div class="pf-node-grid">
                <div class="pf-node-box pf-node-box-active">
                    <span class="pf-node-label">Source</span>
                    <span class="pf-node-value">${startName}</span>
                </div>
                <div class="pf-node-box ${hasTarget ? 'pf-node-box-target' : ''}">
                    <span class="pf-node-label">Cible</span>
                    <span class="pf-node-value">${targetNode ? escapeHtml(targetNode.name) : 'Selectionner...'}</span>
                </div>
            </div>
            <div class="pf-status-wrap">
                ${statusDisplay}
            </div>
            <button id="btnPathCancel" class="pf-cancel-btn" type="button">Annuler la sequence</button>
        </div>
    `;
}

// =============================================================================
// --- 2. BARRE LATÉRALE DROITE (ÉDITEUR) ---
// =============================================================================
export function renderEditorHTML(n, state) {
    const kindsForPerson = getAllowedKinds(n.type, TYPES.PERSON);

    // Options Type
    const typeOptions = `
        <option value="${TYPES.PERSON}" ${n.type===TYPES.PERSON?'selected':''}>Personne</option>
        <option value="${TYPES.GROUP}" ${n.type===TYPES.GROUP?'selected':''}>Groupe</option>
        <option value="${TYPES.COMPANY}" ${n.type===TYPES.COMPANY?'selected':''}>Entreprise</option>
    `;

    const typeLabel = n.type === TYPES.PERSON
        ? 'personne'
        : (n.type === TYPES.COMPANY ? 'entreprise' : 'groupe');
    const identifier = n.id || '----------';

    return `
    <div class="editor-panel-layout">
        <div class="editor-side-rail">
            <div class="editor-side-group">
                <button id="btnFocusNode" class="mini-btn ${state.focusMode ? 'active' : ''}">${state.focusMode ? 'tout voir' : 'Focus'}</button>
                <button id="btnCenterNode" class="mini-btn">centrer</button>
            </div>
            <div class="editor-side-group editor-side-group-bottom">
                <button id="btnToggleEdit" type="button" class="mini-btn">Modifier</button>
                <button id="btnMergeLaunch" type="button" class="mini-btn">Fusion</button>
                <button id="btnDelete" class="mini-btn danger" type="button">Supprimer</button>
            </div>
        </div>

        <div class="editor-main-card">
            <div class="editor-sheet">
                <div class="editor-sheet-head">
                    <div class="editor-sheet-name">${escapeHtml(n.name)}</div>
                    <div class="editor-sheet-type">${escapeHtml(typeLabel)}</div>
                    <div class="editor-sheet-id">${escapeHtml(identifier)}</div>
                </div>

                <div class="editor-priority-grid">
                    <div class="editor-quick-field editor-priority-field">
                        <label>Nom</label>
                        <input id="edQuickName" type="text" value="${escapeHtml(n.name)}" placeholder="Nom de la fiche">
                    </div>
                    <div class="editor-quick-field editor-priority-field">
                        <label>Téléphone</label>
                        <input id="edQuickNum" type="text" value="${escapeHtml(n.num || '')}" placeholder="555-...">
                    </div>
                </div>

                <div class="editor-sheet-note">
                    <label class="editor-section-label" for="edDescription">Description</label>
                    <textarea id="edDescription" rows="3" placeholder="Description / note">${escapeHtml(n.description || n.notes || '')}</textarea>
                </div>

                <div class="editor-meta-strip">
                    <div class="editor-meta-pill">
                        <span>Compte bancaire</span>
                        <input
                            id="edQuickAccountNumber"
                            type="text"
                            value="${escapeHtml(n.accountNumber || '')}"
                            placeholder="Non renseigne"
                        >
                    </div>
                    <div class="editor-meta-pill">
                        <span>Numéro social</span>
                        <input
                            id="edQuickCitizenNumber"
                            type="text"
                            value="${escapeHtml(n.citizenNumber || '')}"
                            placeholder="Non renseigne"
                        >
                    </div>
                </div>

                <div class="editor-links-head">
                    <span>LIENS ACTIFS</span>
                    <span id="editorLinksCount" class="editor-links-count">0</span>
                </div>

                <div id="chipsLinks"></div>

                <div class="editor-link-strip">
                    <div class="editor-inline-title">Ajouter une relation</div>
                    <div class="editor-link-composer">
                        <div class="editor-autocomplete-field flex-grow-input">
                            <input id="editorLinkName" type="text" autocomplete="off" spellcheck="false" placeholder="Nom de la fiche a lier" class="flex-grow-input">
                            <div id="editorLinkNameResults" class="editor-autocomplete-results" hidden></div>
                        </div>
                        <select id="editorLinkType" class="compact-select editor-compact-select">
                            <option value="${TYPES.PERSON}">Personne</option>
                            <option value="${TYPES.GROUP}">Groupe</option>
                            <option value="${TYPES.COMPANY}">Entreprise</option>
                        </select>
                    </div>
                    <div class="editor-link-composer">
                        <select id="editorLinkKind" class="flex-grow-input">${getLinkOptions(kindsForPerson)}</select>
                        <button id="btnAddLinkQuick" class="mini-btn primary" type="button">Ajouter</button>
                    </div>
                    <div id="editorLinkHint" class="editor-link-hint">Si la fiche existe deja, son type est repris automatiquement.</div>
                </div>

                <div id="editorAdvanced" class="editor-advanced">
                    <div class="editor-adv-section">
                        <div class="editor-adv-title">Fiche</div>
                        <div class="editor-adv-primary-row">
                            <div class="editor-adv-field editor-adv-field-name">
                                <label>Nom complet</label>
                                <input id="edName" type="text" value="${escapeHtml(n.name)}" class="editor-name-input">
                            </div>
                            <div class="editor-adv-field">
                                <label>Type</label>
                                <select id="edType">${typeOptions}</select>
                            </div>
                            <div class="editor-adv-field editor-adv-field-color">
                                <label>Couleur</label>
                                <input type="color" id="edColor" value="${safeHex(n.color)}" class="editor-color-input">
                            </div>
                        </div>

                        <div class="editor-adv-grid editor-adv-grid-identity">
                            <div>
                                <label>Téléphone</label>
                                <input type="text" id="edNum" value="${escapeHtml(n.num || '')}" placeholder="555-...">
                            </div>
                            <div>
                                <label>Numéro de compte</label>
                                <input type="text" id="edAccountNumber" value="${escapeHtml(n.accountNumber || '')}" placeholder="ACC-...">
                            </div>
                            <div>
                                <label>Numéro citoyen</label>
                                <input type="text" id="edCitizenNumber" value="${escapeHtml(n.citizenNumber || '')}" placeholder="CIT-...">
                            </div>
                        </div>
                    </div>

                    <div id="editorMergeSection" class="editor-adv-section">
                        <div class="editor-adv-title">Fusionner cette fiche</div>
                        <div class="editor-adv-row editor-merge-row">
                            <div class="editor-autocomplete-field flex-grow-input">
                                <input id="mergeTarget" type="text" autocomplete="off" spellcheck="false" placeholder="Vers qui fusionner ?" class="flex-grow-input">
                                <div id="mergeTargetResults" class="editor-autocomplete-results" hidden></div>
                            </div>
                            <button id="btnMergeApply" class="mini-btn primary" type="button">Fusionner</button>
                        </div>
                        <div class="editor-link-hint">La fiche actuelle sera fusionnee dans la cible choisie.</div>
                    </div>

                    <div class="editor-adv-row editor-adv-row-utility">
                        <button id="btnExportRP" class="mini-btn" type="button">Dossier</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
}
