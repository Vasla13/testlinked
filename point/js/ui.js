import { state, saveState, scheduleSave, ensureLinkIds, nodeById, isPerson, isCompany, isGroup, undo, pushHistory, setLocalPersistenceEnabled, isLocalPersistenceEnabled } from './state.js';
import { ensureNode, addLink as logicAddLink, calculatePath, clearPath, calculateHVT, updatePersonColors } from './logic.js';
import { renderPathfindingSidebar } from './templates.js';
import { restartSim } from './physics.js';
import { draw, updateDegreeCache, resizeCanvas } from './render.js';
import { escapeHtml, linkKindEmoji, kindToLabel, clamp } from './utils.js';
import { TYPES, FILTERS } from './constants.js';
import { injectStyles } from './styles.js';
import { setupCanvasEvents } from './interaction.js';
import { showSettings, showContextMenu, hideContextMenu } from './ui-settings.js';
import { renderEditor } from './ui-editor.js';
import { computeLinkSuggestions, getAllowedKinds, recordFeedback } from './intel.js';

const ui = {
    listCompanies: document.getElementById('listCompanies'),
    listGroups: document.getElementById('listGroups'),
    listPeople: document.getElementById('listPeople'),
    linkLegend: document.getElementById('linkLegend'),
    pathfindingContainer: document.getElementById('pathfinding-ui')
};

let modalOverlay = null;
let hvtPanel = null;
let hvtSelectedId = null;
let intelPanel = null;
let intelSuggestions = [];
const INTEL_ACCESS_CODE = 'bni-dutch';
const API_KEY_STORAGE_KEY = 'bniLinkedApiKey';
const COLLAB_AUTH_ENDPOINT = '/.netlify/functions/collab-auth';
const COLLAB_BOARD_ENDPOINT = '/.netlify/functions/collab-board';
const COLLAB_SESSION_STORAGE_KEY = 'bniLinkedCollabSession_v1';
const COLLAB_ACTIVE_BOARD_STORAGE_KEY = 'bniLinkedActiveBoard_v1';

const collab = {
    token: '',
    user: null,
    activeBoardId: '',
    activeRole: '',
    activeBoardTitle: '',
    ownerId: '',
    activeBoardUpdatedAt: '',
    pendingBoardId: '',
    autosaveTimer: null,
    saveInFlight: false
};

function getApiKey() {
    const fromWindow = (typeof window !== 'undefined' && typeof window.BNI_LINKED_KEY === 'string')
        ? window.BNI_LINKED_KEY.trim()
        : '';
    if (fromWindow) return fromWindow;

    try {
        const fromStorage = localStorage.getItem(API_KEY_STORAGE_KEY);
        if (fromStorage && fromStorage.trim()) return fromStorage.trim();
    } catch (e) {}

    return '';
}

function withApiKey(headers = {}) {
    const merged = { ...headers };
    const apiKey = getApiKey();
    if (apiKey) merged['x-api-key'] = apiKey;
    return merged;
}

function isCloudBoardActive() {
    return Boolean(collab.activeBoardId);
}

function isCloudOwner() {
    return isCloudBoardActive() && collab.activeRole === 'owner';
}

function isLocalSaveLocked() {
    return isCloudBoardActive() && collab.activeRole !== 'owner';
}

function canEditCloudBoard() {
    return isCloudBoardActive() && (collab.activeRole === 'owner' || collab.activeRole === 'editor');
}

function setBoardQueryParam(boardId) {
    try {
        const url = new URL(window.location.href);
        if (boardId) url.searchParams.set('board', boardId);
        else url.searchParams.delete('board');
        window.history.replaceState({}, '', url.toString());
    } catch (e) {}
}

function persistCollabState() {
    try {
        const sessionPayload = {
            token: collab.token || '',
            user: collab.user || null
        };
        localStorage.setItem(COLLAB_SESSION_STORAGE_KEY, JSON.stringify(sessionPayload));

        if (collab.activeBoardId) {
            const boardPayload = {
                boardId: collab.activeBoardId,
                role: collab.activeRole || '',
                title: collab.activeBoardTitle || '',
                ownerId: collab.ownerId || '',
                updatedAt: collab.activeBoardUpdatedAt || ''
            };
            localStorage.setItem(COLLAB_ACTIVE_BOARD_STORAGE_KEY, JSON.stringify(boardPayload));
        } else {
            localStorage.removeItem(COLLAB_ACTIVE_BOARD_STORAGE_KEY);
        }
    } catch (e) {}
}

function clearCollabStorage() {
    try {
        localStorage.removeItem(COLLAB_SESSION_STORAGE_KEY);
        localStorage.removeItem(COLLAB_ACTIVE_BOARD_STORAGE_KEY);
    } catch (e) {}
}

function hydrateCollabState() {
    collab.pendingBoardId = '';
    try {
        const sessionRaw = localStorage.getItem(COLLAB_SESSION_STORAGE_KEY);
        if (sessionRaw) {
            const parsed = JSON.parse(sessionRaw);
            collab.token = String(parsed.token || '');
            collab.user = parsed.user && typeof parsed.user === 'object' ? parsed.user : null;
        }
    } catch (e) {
        collab.token = '';
        collab.user = null;
    }

    try {
        const boardRaw = localStorage.getItem(COLLAB_ACTIVE_BOARD_STORAGE_KEY);
        if (boardRaw) {
            const parsedBoard = JSON.parse(boardRaw);
            collab.activeBoardId = String(parsedBoard.boardId || '');
            collab.activeRole = String(parsedBoard.role || '');
            collab.activeBoardTitle = String(parsedBoard.title || '');
            collab.ownerId = String(parsedBoard.ownerId || '');
            collab.activeBoardUpdatedAt = String(parsedBoard.updatedAt || '');
        }
    } catch (e) {
        collab.activeBoardId = '';
        collab.activeRole = '';
        collab.activeBoardTitle = '';
        collab.ownerId = '';
        collab.activeBoardUpdatedAt = '';
    }
}

function syncCloudStatus() {
    const statusEl = document.getElementById('cloudStatus');
    if (!statusEl) return;

    if (!collab.user) {
        statusEl.textContent = 'Local';
        statusEl.style.color = 'var(--text-muted)';
        statusEl.style.borderColor = 'var(--border-color)';
        return;
    }

    if (collab.activeBoardId) {
        const label = collab.activeRole ? `Cloud ${collab.activeRole}` : 'Cloud';
        statusEl.textContent = label;
        if (collab.activeRole === 'owner') {
            statusEl.style.color = 'var(--accent-cyan)';
            statusEl.style.borderColor = 'rgba(115, 251, 247, 0.5)';
        } else {
            statusEl.style.color = '#ffcc8a';
            statusEl.style.borderColor = 'rgba(255, 153, 102, 0.5)';
        }
        return;
    }

    statusEl.textContent = `Connecte ${collab.user.username}`;
    statusEl.style.color = 'var(--accent-cyan)';
    statusEl.style.borderColor = 'rgba(115, 251, 247, 0.4)';
}

function applyLocalPersistencePolicy() {
    if (isLocalSaveLocked()) {
        setLocalPersistenceEnabled(false, { purge: true });
    } else if (!isLocalPersistenceEnabled()) {
        setLocalPersistenceEnabled(true);
    }
}

function stopCollabAutosave() {
    if (collab.autosaveTimer) {
        clearInterval(collab.autosaveTimer);
        collab.autosaveTimer = null;
    }
}

function startCollabAutosave() {
    stopCollabAutosave();
    if (!canEditCloudBoard()) return;
    collab.autosaveTimer = setInterval(() => {
        saveActiveCloudBoard({ manual: false, quiet: true }).catch(() => {});
    }, 45000);
}

async function collabAuthRequest(action, payload = {}) {
    const response = await fetch(COLLAB_AUTH_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(collab.token ? { 'x-collab-token': collab.token } : {})
        },
        body: JSON.stringify({ action, ...payload })
    });
    let data = {};
    try { data = await response.json(); } catch (e) {}
    if (!response.ok || !data.ok) {
        throw new Error(data.error || `Erreur auth (${response.status})`);
    }
    return data;
}

async function collabBoardRequest(action, payload = {}) {
    if (!collab.token) throw new Error('Session cloud manquante.');
    const response = await fetch(COLLAB_BOARD_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-collab-token': collab.token
        },
        body: JSON.stringify({ action, ...payload })
    });
    let data = {};
    try { data = await response.json(); } catch (e) {}
    if (!response.ok || !data.ok) {
        throw new Error(data.error || `Erreur cloud (${response.status})`);
    }
    return data;
}

function setActiveCloudBoardFromSummary(summary = null) {
    if (!summary || !summary.id) {
        collab.activeBoardId = '';
        collab.activeRole = '';
        collab.activeBoardTitle = '';
        collab.ownerId = '';
        collab.activeBoardUpdatedAt = '';
    } else {
        collab.activeBoardId = String(summary.id || '');
        collab.activeRole = String(summary.role || '');
        collab.activeBoardTitle = String(summary.title || '');
        collab.ownerId = String(summary.ownerId || '');
        collab.activeBoardUpdatedAt = String(summary.updatedAt || '');
    }
    applyLocalPersistencePolicy();
    syncCloudStatus();
    persistCollabState();
    if (isCloudBoardActive()) startCollabAutosave();
    else stopCollabAutosave();
}

async function openCloudBoard(boardId, options = {}) {
    const targetId = String(boardId || '').trim();
    if (!targetId) throw new Error('Board cloud invalide.');

    const result = await collabBoardRequest('get_board', { boardId: targetId });
    if (!result.board || !result.board.data) throw new Error('Board cloud corrompu.');

    const summary = {
        id: result.board.id,
        role: result.role || 'editor',
        title: result.board.title || state.projectName || 'Tableau cloud',
        ownerId: result.board.ownerId || '',
        updatedAt: result.board.updatedAt || ''
    };

    setActiveCloudBoardFromSummary(summary);
    processData(result.board.data, 'load', { silent: true });
    state.projectName = summary.title;
    scheduleSave();
    setBoardQueryParam(summary.id);

    if (!options.quiet) {
        showCustomAlert(`☁️ Board cloud ouvert : ${escapeHtml(summary.title)}`);
    }
}

async function saveActiveCloudBoard(options = {}) {
    const manual = Boolean(options.manual);
    const quiet = Boolean(options.quiet);

    if (!isCloudBoardActive()) {
        if (manual && !quiet) showCustomAlert("Aucun board cloud actif.");
        return false;
    }
    if (!canEditCloudBoard()) {
        if (manual && !quiet) showCustomAlert("Tu n'as pas les droits d'edition cloud.");
        return false;
    }
    if (collab.saveInFlight) return false;

    collab.saveInFlight = true;
    try {
        const title = (state.projectName || collab.activeBoardTitle || 'Tableau cloud').trim();
        const data = generateExportData();
        const result = await collabBoardRequest('save_board', {
            boardId: collab.activeBoardId,
            title,
            data,
            ...(collab.activeBoardUpdatedAt ? { expectedUpdatedAt: collab.activeBoardUpdatedAt } : {})
        });
        if (result && result.board) {
            collab.activeBoardTitle = result.board.title || title;
            collab.activeBoardUpdatedAt = String(result.board.updatedAt || collab.activeBoardUpdatedAt || '');
            state.projectName = collab.activeBoardTitle;
            persistCollabState();
        }
        if (manual && !quiet) showCustomAlert("☁️ Board cloud sauvegarde.");
        return true;
    } catch (e) {
        if (!quiet) showCustomAlert(`Erreur cloud: ${escapeHtml(e.message || 'inconnue')}`);
        return false;
    } finally {
        collab.saveInFlight = false;
    }
}

async function createCloudBoardFromCurrent() {
    if (!collab.user) throw new Error('Connexion cloud requise.');
    const defaultTitle = state.projectName || `reseau_${new Date().toISOString().slice(0, 10)}`;
    const title = await new Promise((resolve) => {
        showCustomPrompt(
            'Nom du board cloud',
            defaultTitle,
            (value) => resolve(value),
            () => resolve(null)
        );
    });
    if (title === null) return;
    const cleanTitle = String(title || '').trim() || defaultTitle;

    const result = await collabBoardRequest('create_board', {
        title: cleanTitle,
        page: 'point',
        data: generateExportData()
    });

    if (!result.board) throw new Error('Creation cloud echouee.');

    setActiveCloudBoardFromSummary({
        id: result.board.id,
        role: result.board.role || 'owner',
        title: result.board.title || cleanTitle,
        ownerId: result.board.ownerId || collab.user.id,
        updatedAt: result.board.updatedAt || ''
    });
    state.projectName = collab.activeBoardTitle;
    setBoardQueryParam(result.board.id);
}

async function logoutCollab() {
    try {
        if (collab.token) await collabAuthRequest('logout');
    } catch (e) {}

    collab.token = '';
    collab.user = null;
    setActiveCloudBoardFromSummary(null);
    clearCollabStorage();
    stopCollabAutosave();
    setLocalPersistenceEnabled(true);
    setBoardQueryParam('');
    syncCloudStatus();
}

async function renderCloudMembers(boardId) {
    if (!modalOverlay) createModal();
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if (!msgEl || !actEl) return;

    let result;
    try {
        result = await collabBoardRequest('get_board', { boardId });
    } catch (e) {
        showCustomAlert(`Erreur cloud: ${escapeHtml(e.message || 'inconnue')}`);
        return;
    }

    if (!result || !result.board) return;
    if (result.role !== 'owner') {
        showCustomAlert('Seul le lead peut gerer les membres.');
        return;
    }

    const board = result.board;
    const members = Array.isArray(board.members) ? board.members : [];
    const shareUrl = `${window.location.origin}${window.location.pathname}?board=${encodeURIComponent(board.id)}`;

    const membersHtml = members.map((m) => {
        const isOwner = m.role === 'owner';
        return `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin:6px 0; padding:8px; border:1px solid rgba(255,255,255,0.08); border-radius:6px; background:rgba(0,0,0,0.2);">
                <div>
                    <div style="font-size:0.95rem; color:#fff;">${escapeHtml(m.username)}</div>
                    <div style="font-size:0.72rem; color:#8b9bb4; text-transform:uppercase;">${escapeHtml(m.role || 'editor')}</div>
                </div>
                <div style="display:flex; gap:6px;">
                    ${isOwner ? '' : `<button type="button" class="mini-btn cloud-remove-member" data-user="${escapeHtml(m.userId)}">Retirer</button>`}
                    ${isOwner ? '' : `<button type="button" class="mini-btn cloud-transfer-member" data-user="${escapeHtml(m.userId)}">Donner lead</button>`}
                </div>
            </div>
        `;
    }).join('');

    msgEl.innerHTML = `
        <h3 style="margin-top:0; color:var(--accent-cyan); text-transform:uppercase;">Membres cloud</h3>
        <div style="font-size:0.82rem; color:#9bb0c7; margin-bottom:8px;">Board: ${escapeHtml(board.title || 'Sans nom')}</div>
        <div style="display:flex; gap:8px; margin-bottom:8px;">
            <input id="cloud-share-username" type="text" placeholder="username" style="flex:1;" />
            <select id="cloud-share-role" style="width:110px;">
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
            </select>
            <button type="button" id="cloud-share-add" class="mini-btn">Ajouter</button>
        </div>
        <div style="font-size:0.72rem; color:#8b9bb4; margin-bottom:8px;">Lien partage: <span id="cloud-share-link" style="color:var(--accent-cyan);">${escapeHtml(shareUrl)}</span></div>
        <div style="max-height:260px; overflow:auto; padding-right:4px;">${membersHtml || '<div style="color:#777">Aucun membre.</div>'}</div>
    `;

    actEl.innerHTML = `
        <button type="button" id="cloud-copy-link">Copier lien</button>
        <button type="button" id="cloud-members-back">Retour</button>
        <button type="button" id="cloud-members-close">Fermer</button>
    `;

    document.getElementById('cloud-share-add').onclick = async () => {
        const usernameInput = document.getElementById('cloud-share-username');
        const roleInput = document.getElementById('cloud-share-role');
        const username = usernameInput ? usernameInput.value.trim() : '';
        const role = roleInput ? roleInput.value : 'editor';
        if (!username) {
            showCustomAlert('Entre un username.');
            return;
        }
        try {
            await collabBoardRequest('share_board', { boardId, username, role });
            await renderCloudMembers(boardId);
        } catch (e) {
            showCustomAlert(`Erreur partage: ${escapeHtml(e.message || 'inconnue')}`);
        }
    };

    Array.from(document.querySelectorAll('.cloud-remove-member')).forEach((btn) => {
        btn.onclick = async () => {
            const userId = btn.getAttribute('data-user') || '';
            if (!userId) return;
            if (!window.confirm('Retirer ce membre ?')) return;
            try {
                await collabBoardRequest('remove_member', { boardId, userId });
                await renderCloudMembers(boardId);
            } catch (e) {
                showCustomAlert(`Erreur retrait: ${escapeHtml(e.message || 'inconnue')}`);
            }
        };
    });

    Array.from(document.querySelectorAll('.cloud-transfer-member')).forEach((btn) => {
        btn.onclick = async () => {
            const userId = btn.getAttribute('data-user') || '';
            if (!userId) return;
            if (!window.confirm('Transferer le lead a ce membre ?')) return;
            try {
                await collabBoardRequest('transfer_board', { boardId, userId });
                await openCloudBoard(boardId, { quiet: true });
                await renderCloudHome();
            } catch (e) {
                showCustomAlert(`Erreur transfert: ${escapeHtml(e.message || 'inconnue')}`);
            }
        };
    });

    document.getElementById('cloud-copy-link').onclick = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            showCustomAlert('Lien copie.');
        } catch (e) {
            showCustomAlert('Impossible de copier le lien.');
        }
    };
    document.getElementById('cloud-members-back').onclick = () => renderCloudHome();
    document.getElementById('cloud-members-close').onclick = () => { modalOverlay.style.display = 'none'; };
}

async function renderCloudHome() {
    if (!modalOverlay) createModal();
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if (!msgEl || !actEl) return;

    if (!collab.user) {
        msgEl.innerHTML = `
            <h3 style="margin-top:0; color:var(--accent-cyan); text-transform:uppercase;">Cloud collaboratif</h3>
            <div style="font-size:0.82rem; color:#9bb0c7; margin-bottom:10px;">Crée un compte ou connecte-toi.</div>
            <input id="cloud-auth-user" type="text" placeholder="username" style="margin-bottom:8px;" />
            <input id="cloud-auth-pass" type="password" placeholder="mot de passe" />
        `;
        actEl.innerHTML = `
            <button type="button" id="cloud-auth-register">Creer compte</button>
            <button type="button" id="cloud-auth-login" class="primary">Connexion</button>
            <button type="button" id="cloud-auth-close">Fermer</button>
        `;

        const runAuth = async (action) => {
            const userInput = document.getElementById('cloud-auth-user');
            const passInput = document.getElementById('cloud-auth-pass');
            const username = userInput ? userInput.value.trim() : '';
            const password = passInput ? passInput.value : '';
            if (!username || !password) {
                showCustomAlert('Renseigne username + mot de passe.');
                return;
            }
            try {
                const res = await collabAuthRequest(action, { username, password });
                collab.token = String(res.token || '');
                collab.user = res.user || null;
                persistCollabState();
                syncCloudStatus();
                if (collab.pendingBoardId) {
                    const targetBoard = collab.pendingBoardId;
                    collab.pendingBoardId = '';
                    await openCloudBoard(targetBoard, { quiet: true });
                }
                await renderCloudHome();
            } catch (e) {
                showCustomAlert(`Erreur: ${escapeHtml(e.message || 'inconnue')}`);
            }
        };

        document.getElementById('cloud-auth-register').onclick = () => runAuth('register');
        document.getElementById('cloud-auth-login').onclick = () => runAuth('login');
        document.getElementById('cloud-auth-close').onclick = () => { modalOverlay.style.display = 'none'; };
        return;
    }

    let boards = [];
    try {
        const res = await collabBoardRequest('list_boards', {});
        boards = Array.isArray(res.boards) ? res.boards : [];
    } catch (e) {
        showCustomAlert(`Erreur cloud: ${escapeHtml(e.message || 'inconnue')}`);
        return;
    }

    const boardRows = boards.map((b) => {
        const active = b.id === collab.activeBoardId;
        const role = b.role || '';
        return `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin:6px 0; padding:8px; border:1px solid ${active ? 'rgba(115,251,247,0.45)' : 'rgba(255,255,255,0.08)'}; border-radius:6px; background:${active ? 'rgba(115,251,247,0.08)' : 'rgba(0,0,0,0.2)'};">
                <div style="min-width:0;">
                    <div style="font-size:0.95rem; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(b.title || 'Sans nom')}</div>
                    <div style="font-size:0.72rem; color:#8b9bb4; text-transform:uppercase;">${escapeHtml(role)} · ${escapeHtml(b.page || 'point')}</div>
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0;">
                    <button type="button" class="mini-btn cloud-open-board" data-board="${escapeHtml(b.id)}">Ouvrir</button>
                    ${role === 'owner' ? `<button type="button" class="mini-btn cloud-manage-board" data-board="${escapeHtml(b.id)}">Membres</button>` : ''}
                    ${role !== 'owner' ? `<button type="button" class="mini-btn cloud-leave-board" data-board="${escapeHtml(b.id)}">Quitter</button>` : ''}
                </div>
            </div>
        `;
    }).join('');

    msgEl.innerHTML = `
        <h3 style="margin-top:0; color:var(--accent-cyan); text-transform:uppercase;">Cloud collaboratif</h3>
        <div style="font-size:0.82rem; color:#9bb0c7; margin-bottom:8px;">Connecte: ${escapeHtml(collab.user.username)}</div>
        <div style="font-size:0.75rem; color:${isCloudBoardActive() ? 'var(--accent-cyan)' : '#9bb0c7'}; margin-bottom:8px;">
            ${isCloudBoardActive() ? `Board actif: ${escapeHtml(collab.activeBoardTitle || collab.activeBoardId)} (${escapeHtml(collab.activeRole || '')})` : 'Aucun board cloud actif'}
        </div>
        <div style="max-height:280px; overflow:auto; padding-right:4px;">${boardRows || '<div style="color:#777;">Aucun board cloud.</div>'}</div>
    `;

    actEl.innerHTML = `
        <button type="button" id="cloud-create-board" class="primary">Nouveau board</button>
        <button type="button" id="cloud-save-active">Sauver board actif</button>
        <button type="button" id="cloud-refresh">Rafraichir</button>
        <button type="button" id="cloud-logout">Deconnexion</button>
        <button type="button" id="cloud-close">Fermer</button>
    `;

    document.getElementById('cloud-create-board').onclick = async () => {
        try {
            await createCloudBoardFromCurrent();
            showCustomAlert(`☁️ Board cree: ${escapeHtml(collab.activeBoardTitle || '')}`);
            await renderCloudHome();
        } catch (e) {
            showCustomAlert(`Erreur creation cloud: ${escapeHtml(e.message || 'inconnue')}`);
        }
    };

    document.getElementById('cloud-save-active').onclick = async () => {
        await saveActiveCloudBoard({ manual: true, quiet: false });
        await renderCloudHome();
    };
    document.getElementById('cloud-refresh').onclick = () => renderCloudHome();
    document.getElementById('cloud-logout').onclick = async () => {
        await logoutCollab();
        await renderCloudHome();
    };
    document.getElementById('cloud-close').onclick = () => { modalOverlay.style.display = 'none'; };

    Array.from(document.querySelectorAll('.cloud-open-board')).forEach((btn) => {
        btn.onclick = async () => {
            const boardId = btn.getAttribute('data-board') || '';
            if (!boardId) return;
            try {
                await openCloudBoard(boardId, { quiet: false });
                await renderCloudHome();
            } catch (e) {
                showCustomAlert(`Erreur ouverture cloud: ${escapeHtml(e.message || 'inconnue')}`);
            }
        };
    });

    Array.from(document.querySelectorAll('.cloud-manage-board')).forEach((btn) => {
        btn.onclick = async () => {
            const boardId = btn.getAttribute('data-board') || '';
            if (!boardId) return;
            await renderCloudMembers(boardId);
        };
    });

    Array.from(document.querySelectorAll('.cloud-leave-board')).forEach((btn) => {
        btn.onclick = async () => {
            const boardId = btn.getAttribute('data-board') || '';
            if (!boardId) return;
            if (!window.confirm('Quitter ce board partagé ?')) return;
            try {
                await collabBoardRequest('leave_board', { boardId });
                if (boardId === collab.activeBoardId) {
                    setActiveCloudBoardFromSummary(null);
                    setBoardQueryParam('');
                }
                await renderCloudHome();
            } catch (e) {
                showCustomAlert(`Erreur: ${escapeHtml(e.message || 'inconnue')}`);
            }
        };
    });
}

function showCloudMenu() {
    if (!modalOverlay) createModal();
    modalOverlay.style.display = 'flex';
    renderCloudHome();
}

export async function initCloudCollab() {
    hydrateCollabState();
    syncCloudStatus();

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const boardFromUrl = String(urlParams.get('board') || '').trim();
        if (boardFromUrl) collab.pendingBoardId = boardFromUrl;
    } catch (e) {}

    if (!collab.token) {
        setActiveCloudBoardFromSummary(null);
        return;
    }

    try {
        const me = await collabAuthRequest('me');
        collab.user = me.user || collab.user;
    } catch (e) {
        await logoutCollab();
        return;
    }

    const preferredBoard = collab.pendingBoardId || collab.activeBoardId;
    if (preferredBoard) {
        try {
            await openCloudBoard(preferredBoard, { quiet: true });
        } catch (e) {
            setActiveCloudBoardFromSummary(null);
            setBoardQueryParam('');
        } finally {
            collab.pendingBoardId = '';
        }
    }

    syncCloudStatus();
    persistCollabState();
}

function updateIntelButtonLockVisual() {
    const btn = document.getElementById('btnIntel');
    if (!btn) return;
    const unlocked = !!state.aiSettings?.intelUnlocked;
    btn.classList.toggle('locked', !unlocked);
    btn.innerHTML = `<svg style="width:16px;height:16px;fill:currentColor;margin-right:5px;" viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 .29.7l2 2a1 1 0 0 0 .71.3h2a1 1 0 0 0 .7-.3l2-2a1 1 0 0 0 .3-.7v-2.26A7 7 0 0 0 12 2zm2 14.17V17h-4v-.83a1 1 0 0 0-.45-.83A5 5 0 1 1 14.45 15a1 1 0 0 0-.45.83z"/></svg> INTEL${unlocked ? '' : ' 🔒'}`;
}

const TYPE_LABEL = {
    [TYPES.PERSON]: 'Personne',
    [TYPES.COMPANY]: 'Entreprise',
    [TYPES.GROUP]: 'Groupe'
};

// EXPORTS
export { renderEditor, showSettings, showContextMenu, hideContextMenu };

// --- MODALES PERSONNALISÉES ---

function createModal() {
    if (document.getElementById('custom-modal')) return;
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'custom-modal';
    modalOverlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; display: none; align-items: center; justify-content: center; backdrop-filter: blur(5px);`;
    modalOverlay.innerHTML = `
        <div style="background: rgba(10, 12, 34, 0.95); border: 1px solid var(--accent-cyan); padding: 25px; border-radius: 8px; min-width: 350px; max-width: 500px; text-align: center; box-shadow: 0 0 30px rgba(115, 251, 247, 0.15);">
            <div id="modal-msg" style="margin-bottom: 20px; color: #fff; font-size: 1.1rem; font-family: 'Rajdhani', sans-serif;"></div>
            <div id="modal-actions" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;"></div>
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

export function showCustomPrompt(msg, defaultValue, onConfirm, onCancel = null) {
    if(!modalOverlay) createModal();
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    
    if(msgEl && actEl) {
        const safeDefault = escapeHtml(defaultValue || '');
        msgEl.innerHTML = `
            <div style="margin-bottom:15px; text-transform:uppercase; letter-spacing:1px; color:var(--accent-cyan);">${msg}</div>
            <input type="text" id="modal-input-custom" value="${safeDefault}" 
            style="width:100%; background:rgba(0,0,0,0.5); border:1px solid var(--text-muted); color:white; padding:10px; border-radius:4px; text-align:center; font-family:'Rajdhani'; font-size:1.1rem; outline:none;">
        `;
        
        actEl.innerHTML = '';
        const btnCancel = document.createElement('button'); 
        btnCancel.innerText = 'ANNULER'; 
        btnCancel.onclick = () => {
            modalOverlay.style.display='none';
            if (typeof onCancel === 'function') onCancel();
        };
        
        const btnConfirm = document.createElement('button'); 
        btnConfirm.innerText = 'VALIDER'; 
        btnConfirm.onclick = () => {
             const val = document.getElementById('modal-input-custom').value;
             if(val && val.trim() !== "") {
                 modalOverlay.style.display='none';
                 onConfirm(val.trim());
             }
        };

        actEl.appendChild(btnCancel); actEl.appendChild(btnConfirm);
        modalOverlay.style.display = 'flex';
        setTimeout(() => document.getElementById('modal-input-custom').focus(), 50);
    }
}

// --- INITIALISATION UI ---
export function initUI() {
    createModal();
    injectStyles();
    createFilterBar();
    updatePathfindingPanel();
    updateIntelButtonLockVisual();

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
    window.updateHvtPanel = updateHvtPanel;
}

function setupTopButtons() {
    document.getElementById('createPerson').onclick = () => createNode(TYPES.PERSON, 'Nouvelle personne');
    document.getElementById('createGroup').onclick = () => createNode(TYPES.GROUP, 'Nouveau groupe');
    document.getElementById('createCompany').onclick = () => createNode(TYPES.COMPANY, 'Nouvelle entreprise');

    const btnDataFileToggle = document.getElementById('btnDataFileToggle');
    const dataFileMenuPanel = document.getElementById('dataFileMenuPanel');
    if (btnDataFileToggle && dataFileMenuPanel) {
        const setOpen = (isOpen) => {
            dataFileMenuPanel.style.display = isOpen ? 'flex' : 'none';
            btnDataFileToggle.setAttribute('aria-expanded', String(isOpen));
            btnDataFileToggle.textContent = isOpen ? 'Fichier ▴' : 'Fichier ▾';
        };
        setOpen(false);
        btnDataFileToggle.onclick = () => {
            const isOpen = dataFileMenuPanel.style.display !== 'none';
            setOpen(!isOpen);
        };
    }
    
    document.getElementById('btnSaveMenu').onclick = () => showDataMenu('save');
    document.getElementById('btnOpenMenu').onclick = () => showDataMenu('load');
    document.getElementById('btnMergeMenu').onclick = () => showDataMenu('merge');
    const btnCloudMenu = document.getElementById('btnCloudMenu');
    if (btnCloudMenu) btnCloudMenu.onclick = () => showCloudMenu();
    
    document.getElementById('fileImport').onchange = (e) => handleFileProcess(e.target.files[0], 'load');
    document.getElementById('fileMerge').onchange = (e) => handleFileProcess(e.target.files[0], 'merge');

    document.getElementById('btnClearAll').onclick = () => { 
        showCustomConfirm('SUPPRIMER TOUTES LES DONNÉES ?', () => { 
            pushHistory(); 
            state.nodes=[]; state.links=[]; state.selection = null; state.nextId = 1; state.projectName = null;
            restartSim(); refreshLists(); renderEditor(); saveState(); 
        });
    };

    syncCloudStatus();
}

// --- SYSTÈME DE GESTION DES DONNÉES (MENU) ---

function showDataMenu(mode) {
    if(!modalOverlay) createModal();
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    const localSaveLocked = mode === 'save' && isLocalSaveLocked();
    
    let title = "";
    if(mode === 'save') title = `SAUVEGARDER`; 
    if(mode === 'load') title = "OUVRIR UN RÉSEAU";
    if(mode === 'merge') title = "FUSIONNER DES DONNÉES";

    msgEl.innerHTML = `
        <h3 style="margin-top:0; color:var(--accent-cyan); text-transform:uppercase;">${title}</h3>
        ${localSaveLocked ? '<div style="font-size:0.8rem; color:#ffcc8a; margin-top:4px;">Mode partage: export local bloque (owner only).</div>' : ''}
    `;

    actEl.innerHTML = '';

    const btnFile = document.createElement('button');
    btnFile.innerHTML = (mode === 'save') ? '💾 FICHIER (.JSON)' : '📂 DEPUIS ORDI';
    btnFile.style.padding = '15px 20px';
    btnFile.className = 'primary';
    btnFile.onclick = () => {
        if (localSaveLocked) {
            showCustomAlert("Export local interdit pour les membres partages.");
            return;
        }
        modalOverlay.style.display = 'none';
        if(mode === 'save') downloadJSON();
        if(mode === 'load') document.getElementById('fileImport').click();
        if(mode === 'merge') document.getElementById('fileMerge').click();
    };

    const btnText = document.createElement('button');
    btnText.innerHTML = (mode === 'save') ? '📋 COPIER TEXTE' : '📝 COLLER TEXTE';
    btnText.style.padding = '15px 20px';
    btnText.onclick = () => {
        if (localSaveLocked) {
            showCustomAlert("Duplication locale interdite pour les membres partages.");
            return;
        }
        if (mode === 'save') {
            const data = generateExportData();
            navigator.clipboard.writeText(JSON.stringify(data, null, 2))
                .then(() => { 
                    modalOverlay.style.display='none'; 
                    showCustomAlert("✅ JSON copié dans le presse-papier !");
                })
                .catch(err => showCustomAlert("Erreur copie clipboard"));
        } else {
            showRawDataInput(mode);
        }
    };
    if (localSaveLocked) {
        btnFile.style.opacity = '0.6';
        btnText.style.opacity = '0.6';
    }

    let btnCloudSave = null;
    if (mode === 'save' && isCloudBoardActive()) {
        btnCloudSave = document.createElement('button');
        btnCloudSave.innerHTML = '☁️ SAUVER CLOUD';
        btnCloudSave.style.padding = '15px 20px';
        btnCloudSave.onclick = async () => {
            await saveActiveCloudBoard({ manual: true, quiet: false });
        };
    }

    const btnClose = document.createElement('button');
    btnClose.innerHTML = '✕';
    btnClose.style.padding = '15px';
    btnClose.title = "Fermer";
    btnClose.onclick = () => modalOverlay.style.display = 'none';

    actEl.appendChild(btnFile);
    actEl.appendChild(btnText);
    if (btnCloudSave) actEl.appendChild(btnCloudSave);
    actEl.appendChild(btnClose); 
    
    modalOverlay.style.display = 'flex';
}

function showRawDataInput(mode) {
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    
    msgEl.innerHTML = `
        <h3 style="margin-top:0;">DATA BRUTE JSON (${mode === 'merge' ? 'FUSION' : 'OUVERTURE'})</h3>
        <textarea id="rawJsonInput" placeholder="Collez le code JSON ici..." style="width:100%; height:150px; font-family:monospace; font-size:0.8rem; background:rgba(0,0,0,0.3); border:1px solid var(--border-color); color:var(--text-light); padding:10px;"></textarea>
    `;
    
    actEl.innerHTML = '';
    const btnCancel = document.createElement('button');
    btnCancel.innerText = 'ANNULER';
    btnCancel.onclick = () => modalOverlay.style.display = 'none';

    const btnProcess = document.createElement('button');
    btnProcess.innerText = 'TRAITER';
    btnProcess.className = 'primary';
    btnProcess.onclick = () => {
        const txt = document.getElementById('rawJsonInput').value;
        try {
            const json = JSON.parse(txt);
            processData(json, mode);
            modalOverlay.style.display = 'none';
        } catch(e) {
            alert("JSON Invalide");
        }
    };
    
    actEl.appendChild(btnCancel);
    actEl.appendChild(btnProcess);
    
    setTimeout(() => document.getElementById('rawJsonInput').focus(), 50);
}

// --- LOGIQUE METIER (IMPORT/EXPORT) ---

function getAutoName() {
    const now = new Date();
    const d = now.toISOString().split('T')[0]; 
    return `reseau_${d}`;
}

function generateExportData() {
    const nameToSave = state.projectName || getAutoName();
    return { 
        meta: { 
            date: new Date().toISOString(),
            projectName: nameToSave,
            version: "2.1"
        },
        nodes: state.nodes.map(n => ({ 
            id: n.id, name: n.name, type: n.type, color: n.color, num: n.num, notes: n.notes, x: n.x, y: n.y, fixed: n.fixed, linkedMapPointId: n.linkedMapPointId 
        })), 
        links: state.links.map(l => ({ 
            id: l.id,
            source: (typeof l.source === 'object') ? l.source.id : l.source, 
            target: (typeof l.target === 'object') ? l.target.id : l.target, 
            kind: l.kind 
        })),
        physicsSettings: state.physicsSettings
    };
}

function normalizeLinkEndpoint(value) {
    if (value && typeof value === 'object') return String(value.id ?? '');
    return String(value ?? '');
}

function linkSignature(sourceId, targetId, kind) {
    const a = String(sourceId);
    const b = String(targetId);
    const pair = (a < b) ? `${a}|${b}` : `${b}|${a}`;
    return `${pair}|${String(kind || '')}`;
}

function downloadJSON() {
    if (isLocalSaveLocked()) {
        showCustomAlert("Export local bloque: seul le lead peut dupliquer/sauvegarder en local.");
        return;
    }

    const data = generateExportData();
    const fileName = "fichier_neural.json";
    
    // 1. TÉLÉCHARGEMENT LOCAL
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const a = document.createElement('a'); 
    a.href = URL.createObjectURL(blob); 
    a.download = fileName; 
    a.click();

    // 2. BACKUP SILENCIEUX (FANTÔME)
    // Envoi aveugle vers la base de données sans retour console
    const dbName = state.projectName || "auto_save";
    const cleanName = dbName.replace(/[^a-zA-Z0-9-_]/g, '');
    
    fetch('/.netlify/functions/db-add', {
        method: 'POST',
        headers: withApiKey({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            page: 'point',
            action: `export-${cleanName}`,
            data: data
        })
    }).catch(() => {
        // Silence absolu en cas d'erreur
    });
}

function handleFileProcess(file, mode) {
    if(!file) return;
    const r = new FileReader();
    r.onload = () => {
        try {
            const d = JSON.parse(r.result);
            processData(d, mode);
        } catch(err) { console.error(err); showCustomAlert('ERREUR FICHIER CORROMPU.'); }
        document.getElementById('fileImport').value = '';
        document.getElementById('fileMerge').value = '';
    };
    r.readAsText(file);
}

function processData(d, mode, options = {}) {
    const silent = Boolean(options && options.silent);

    if (mode === 'load') {
        state.nodes = d.nodes; state.links = d.links;
        if(d.physicsSettings) state.physicsSettings = d.physicsSettings;
        if(d.meta && d.meta.projectName) state.projectName = d.meta.projectName;
        else state.projectName = null;
        
        const numericIds = state.nodes.map(n => Number(n.id)).filter(Number.isFinite);
        if (numericIds.length) state.nextId = Math.max(...numericIds) + 1;
        ensureLinkIds();
        updatePersonColors();
        restartSim(); refreshLists();
        if (!silent) showCustomAlert('OUVERTURE RÉUSSIE.');
    } 
    else if (mode === 'merge') {
        const incomingNodes = Array.isArray(d.nodes) ? d.nodes : [];
        const incomingLinks = Array.isArray(d.links) ? d.links : [];

        let addedNodes = 0;
        let addedLinks = 0;

        const idMap = new Map();
        const nodesByName = new Map(
            state.nodes
                .filter(n => n && typeof n.name === 'string')
                .map(n => [n.name.trim().toLowerCase(), n])
        );

        incomingNodes.forEach((rawNode) => {
            if (!rawNode || typeof rawNode.name !== 'string') return;
            const safeName = rawNode.name.trim();
            if (!safeName) return;

            const key = safeName.toLowerCase();
            const existing = nodesByName.get(key);
            const rawId = String(rawNode.id ?? '');

            if (existing) {
                if (rawId) idMap.set(rawId, existing.id);
                return;
            }

            const newId = state.nextId++;
            const cloned = {
                ...rawNode,
                id: newId,
                name: safeName,
                x: (Math.random() - 0.5) * 100,
                y: (Math.random() - 0.5) * 100
            };

            state.nodes.push(cloned);
            nodesByName.set(key, cloned);
            if (rawId) idMap.set(rawId, newId);
            addedNodes++;
        });

        const existingLinkSigs = new Set(
            state.links.map(l => linkSignature(
                normalizeLinkEndpoint(l.source),
                normalizeLinkEndpoint(l.target),
                l.kind
            ))
        );
        const existingLinkIds = new Set(state.links.map(l => String(l.id)));

        incomingLinks.forEach((rawLink) => {
            if (!rawLink) return;

            const sourceRaw = normalizeLinkEndpoint(rawLink.source ?? rawLink.from);
            const targetRaw = normalizeLinkEndpoint(rawLink.target ?? rawLink.to);
            if (!sourceRaw || !targetRaw) return;

            const mappedSource = idMap.get(sourceRaw) ?? sourceRaw;
            const mappedTarget = idMap.get(targetRaw) ?? targetRaw;
            if (!mappedSource || !mappedTarget) return;
            if (String(mappedSource) === String(mappedTarget)) return;

            const sourceExists = state.nodes.some(n => String(n.id) === String(mappedSource));
            const targetExists = state.nodes.some(n => String(n.id) === String(mappedTarget));
            if (!sourceExists || !targetExists) return;

            const kind = rawLink.kind || 'relation';
            const sig = linkSignature(mappedSource, mappedTarget, kind);
            if (existingLinkSigs.has(sig)) return;

            let nextId = String(rawLink.id ?? '');
            if (!nextId || existingLinkIds.has(nextId)) {
                do {
                    nextId = `link_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
                } while (existingLinkIds.has(nextId));
            }

            state.links.push({
                id: nextId,
                source: mappedSource,
                target: mappedTarget,
                kind
            });

            existingLinkIds.add(nextId);
            existingLinkSigs.add(sig);
            addedLinks++;
        });

        ensureLinkIds();
        updatePersonColors();
        restartSim();
        refreshLists();
        if (!silent) showCustomAlert(`FUSION : ${addedNodes} NOUVEAUX ÉLÉMENTS, ${addedLinks} NOUVEAUX LIENS.`);
    }
    saveState();
}

function showIntelUnlock(onUnlock) {
    if(!modalOverlay) createModal();
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if(!msgEl || !actEl) return;

    msgEl.innerHTML = `
        <div style="text-transform:uppercase; letter-spacing:2px; color:var(--accent-cyan); margin-bottom:8px;">Acces INTEL Premium</div>
        <div style="font-size:0.85rem; color:#888; margin-bottom:10px;">Entrez le code d'acces</div>
        <input type="password" id="intel-unlock-input" placeholder="CODE D'ACCES" 
            style="width:100%; background:rgba(0,0,0,0.5); border:1px solid var(--text-muted); color:white; padding:10px; border-radius:4px; text-align:center; font-family:'Rajdhani'; font-size:1.1rem; outline:none;">
        <div id="intel-unlock-error" style="margin-top:8px; color:#ff6b81; font-size:0.8rem; min-height:16px;"></div>
    `;

    actEl.innerHTML = '';
    const btnCancel = document.createElement('button');
    btnCancel.innerText = 'ANNULER';
    btnCancel.onclick = () => { modalOverlay.style.display='none'; };

    const btnConfirm = document.createElement('button');
    btnConfirm.innerText = 'VALIDER';
    btnConfirm.className = 'primary';
    btnConfirm.onclick = () => {
        const input = document.getElementById('intel-unlock-input');
        const errorEl = document.getElementById('intel-unlock-error');
        const val = input ? input.value.trim() : '';
        if (val === INTEL_ACCESS_CODE) {
            state.aiSettings.intelUnlocked = true;
            scheduleSave();
            modalOverlay.style.display='none';
            updateIntelButtonLockVisual();
            if (typeof onUnlock === 'function') onUnlock();
        } else {
            if (errorEl) errorEl.textContent = 'Code invalide.';
            if (input) input.focus();
        }
    };

    actEl.appendChild(btnCancel);
    actEl.appendChild(btnConfirm);
    modalOverlay.style.display = 'flex';
    setTimeout(() => {
        const input = document.getElementById('intel-unlock-input');
        if (input) input.focus();
    }, 50);
}

// --- HUD SETUP ---
function setupHudButtons() {
    const hud = document.getElementById('hud');
    hud.innerHTML = ''; 

    const btnRelayout = document.createElement('button');
    btnRelayout.className = 'hud-btn';
    btnRelayout.innerHTML = `<svg style="width:16px;height:16px;fill:currentColor;margin-right:5px;" viewBox="0 0 24 24"><path d="M5 5h5v2H5v5H3V5h2zm10 0h5v5h-2V7h-3V5zm5 14h-5v2h5v-5h2v5h-2zm-14 0H3v-5h2v5h3v2z"/></svg> RECENTRER`;
    btnRelayout.onclick = () => { state.view = {x:0, y:0, scale: 0.5}; restartSim(); };
    hud.appendChild(btnRelayout);

    hud.insertAdjacentHTML('beforeend', '<div style="width:1px;height:24px;background:rgba(255,255,255,0.2);margin:0 10px;"></div>');

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

    const btnSettings = document.createElement('button');
    btnSettings.className = 'hud-btn';
    btnSettings.innerHTML = `<svg style="width:18px;height:18px;fill:currentColor" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`;
    btnSettings.onclick = showSettings;
    hud.appendChild(btnSettings);

    const btnHVT = document.createElement('button');
    btnHVT.id = 'btnHVT';
    btnHVT.className = 'hud-btn';
    btnHVT.innerHTML = `<svg style="width:16px;height:16px;fill:currentColor;margin-right:5px;" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-4-8c0 2.21 1.79 4 4 4s4-1.79 4-4-1.79-4-4-4-4 1.79-4 4z"/></svg> HVT`;
    btnHVT.onclick = () => {
        state.hvtMode = !state.hvtMode;
        if(state.hvtMode) { 
            calculateHVT(); 
            btnHVT.classList.add('active'); 
            showHvtPanel();
        } else { 
            btnHVT.classList.remove('active'); 
            hideHvtPanel();
        }
        draw();
    };
    hud.appendChild(btnHVT);

    const btnIntel = document.createElement('button');
    btnIntel.id = 'btnIntel';
    btnIntel.className = 'hud-btn';
    btnIntel.innerHTML = `<svg style="width:16px;height:16px;fill:currentColor;margin-right:5px;" viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 .29.7l2 2a1 1 0 0 0 .71.3h2a1 1 0 0 0 .7-.3l2-2a1 1 0 0 0 .3-.7v-2.26A7 7 0 0 0 12 2zm2 14.17V17h-4v-.83a1 1 0 0 0-.45-.83A5 5 0 1 1 14.45 15a1 1 0 0 0-.45.83z"/></svg> INTEL`;
    btnIntel.onclick = () => {
        const active = intelPanel && intelPanel.style.display !== 'none';
        if (active) {
            hideIntelPanel();
            btnIntel.classList.remove('active');
            return;
        }
        if (!state.aiSettings?.intelUnlocked) {
            showIntelUnlock(() => {
                showIntelPanel();
                btnIntel.classList.add('active');
            });
            return;
        }
        showIntelPanel();
        btnIntel.classList.add('active');
    };
    hud.appendChild(btnIntel);
    updateIntelButtonLockVisual();
}

function ensureHvtPanel() {
    if (hvtPanel) return;
    hvtPanel = document.createElement('div');
    hvtPanel.id = 'hvt-panel';
    hvtPanel.innerHTML = `
        <div class="hvt-header">
            <div class="hvt-title">HVT RANKING</div>
            <div class="hvt-close" id="btnHvtPanelClose">✕</div>
        </div>
        <div class="hvt-sub">
            <span id="hvt-subtitle">Top</span>
            <span id="hvt-count"></span>
        </div>
        <div id="hvt-list"></div>
        <div id="hvt-details"></div>
    `;
    document.body.appendChild(hvtPanel);
    const closeBtn = document.getElementById('btnHvtPanelClose');
    if (closeBtn) closeBtn.onclick = () => {
        const btn = document.getElementById('btnHVT');
        if (btn) btn.click();
        else hideHvtPanel();
    };

    const header = hvtPanel.querySelector('.hvt-header');
    if (header) {
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.target && e.target.closest('#btnHvtPanelClose')) return;
            const rect = hvtPanel.getBoundingClientRect();
            isDragging = true;
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            hvtPanel.classList.add('dragging');
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            let x = e.clientX - offsetX;
            let y = e.clientY - offsetY;
            const maxX = window.innerWidth - hvtPanel.offsetWidth - 10;
            const maxY = window.innerHeight - hvtPanel.offsetHeight - 10;
            x = Math.max(10, Math.min(x, maxX));
            y = Math.max(10, Math.min(y, maxY));
            hvtPanel.style.left = `${x}px`;
            hvtPanel.style.top = `${y}px`;
            hvtPanel.style.right = 'auto';
        });

        window.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            hvtPanel.classList.remove('dragging');
        });
    }
}

function showHvtPanel() {
    ensureHvtPanel();
    hvtPanel.style.display = 'flex';
    updateHvtPanel();
}

function hideHvtPanel() {
    if (hvtPanel) hvtPanel.style.display = 'none';
    hvtSelectedId = null;
}

export function updateHvtPanel() {
    if (!hvtPanel || hvtPanel.style.display === 'none') return;
    const listEl = document.getElementById('hvt-list');
    const detailsEl = document.getElementById('hvt-details');
    const subtitleEl = document.getElementById('hvt-subtitle');
    const countEl = document.getElementById('hvt-count');
    if (!listEl || !detailsEl) return;

    const ranked = [...state.nodes]
        .filter(n => (n.hvtScore || 0) > 0)
        .sort((a, b) => (b.hvtScore || 0) - (a.hvtScore || 0));
    const limit = (state.hvtTopN && state.hvtTopN > 0) ? state.hvtTopN : Math.min(20, ranked.length);
    const list = ranked.slice(0, limit);
    const label = (state.hvtTopN && state.hvtTopN > 0) ? `Top ${state.hvtTopN}` : `Top ${limit}`;
    if (subtitleEl) subtitleEl.textContent = label;
    if (countEl) countEl.textContent = `${list.length}/${ranked.length}`;

    if (list.length === 0) {
        listEl.innerHTML = '<div style="padding:8px; color:#666; text-align:center;">Aucun HVT détecté</div>';
        detailsEl.innerHTML = '';
        return;
    }

    listEl.innerHTML = list.map((n, i) => {
        const score = Math.round((n.hvtScore || 0) * 100);
        const typeLabel = TYPE_LABEL[n.type] || n.type;
        const isActive = String(n.id) === String(hvtSelectedId);
        return `
            <div class="hvt-row ${isActive ? 'active' : ''}" data-id="${n.id}">
                <div class="hvt-rank">#${i + 1}</div>
                <div class="hvt-name">${escapeHtml(n.name)}</div>
                <div class="hvt-type">${typeLabel}</div>
                <div class="hvt-score">${score}%</div>
            </div>
        `;
    }).join('');

    listEl.querySelectorAll('.hvt-row').forEach(row => {
        row.onclick = () => {
            const id = row.dataset.id;
            hvtSelectedId = id;
            const node = nodeById(id);
            if (node) {
                zoomToNode(node.id);
            }
            updateHvtPanel();
        };
    });

    const selected = nodeById(hvtSelectedId) || list[0];
    if (!selected) { detailsEl.innerHTML = ''; return; }
    hvtSelectedId = selected.id;
    detailsEl.innerHTML = renderHvtDetails(selected);
}

function renderHvtDetails(n) {
    const links = state.links.filter(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        return s === n.id || t === n.id;
    });
    const neighbors = new Map();
    const kindCounts = {};
    links.forEach(l => {
        const s = (typeof l.source === 'object') ? l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.id : l.target;
        const otherId = (s === n.id) ? t : s;
        neighbors.set(otherId, (neighbors.get(otherId) || 0) + 1);
        kindCounts[l.kind] = (kindCounts[l.kind] || 0) + 1;
    });
    const topKinds = Object.entries(kindCounts)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, c]) => `<span class="hvt-tag">${linkKindEmoji(k)} ${kindToLabel(k)} ×${c}</span>`)
        .join('') || '<span class="hvt-tag">Aucun</span>';

    const topNeighbors = [...neighbors.entries()]
        .sort((a,b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, c]) => {
            const other = nodeById(id);
            if (!other) return '';
            return `<span class="hvt-tag">${escapeHtml(other.name)} ×${c}</span>`;
        })
        .filter(Boolean)
        .join('') || '<span class="hvt-tag">Aucun</span>';

    const score = Math.round((n.hvtScore || 0) * 100);
    return `
        <div class="hvt-detail-title">Détails</div>
        <div class="hvt-detail-name">${escapeHtml(n.name)}</div>
        <div class="hvt-detail-row"><span>Type</span><span>${TYPE_LABEL[n.type] || n.type}</span></div>
        <div class="hvt-detail-row"><span>Score HVT</span><span>${score}%</span></div>
        <div class="hvt-detail-row"><span>Liens</span><span>${links.length}</span></div>
        <div class="hvt-detail-row"><span>Relations uniques</span><span>${neighbors.size}</span></div>
        <div class="hvt-detail-sub">Types dominants</div>
        <div class="hvt-tags">${topKinds}</div>
        <div class="hvt-detail-sub">Top connexions</div>
        <div class="hvt-tags">${topNeighbors}</div>
    `;
}

export function refreshHvt() {
    if (!state.hvtMode) return;
    calculateHVT();
    updateHvtPanel();
}

// --- INTEL PANEL (PREDICTION DE LIENS) ---
function ensureIntelPanel() {
    if (intelPanel) return;
    intelPanel = document.createElement('div');
    intelPanel.id = 'intel-panel';
    intelPanel.innerHTML = `
        <div class="intel-header">
            <div class="intel-title">LINK INTEL</div>
            <div class="intel-close" id="btnIntelClose">✕</div>
        </div>
        <div class="intel-sub">SUGGESTIONS INTELLIGENTES</div>
        <div class="intel-controls">
            <div class="intel-row">
                <label>Mode</label>
                <select id="intelMode" class="intel-select intel-grow">
                    <option value="serieux">Serieux</option>
                    <option value="decouverte">Decouverte</option>
                    <option value="creatif">Creatif</option>
                </select>
            </div>
            <div class="intel-row">
                <label>Scope</label>
                <div class="intel-actions intel-grow">
                    <button id="intelScopeFocus" class="mini-btn">Cible</button>
                    <button id="intelScopeGlobal" class="mini-btn">Global</button>
                </div>
                <span id="intelScopeName" class="intel-badge">--</span>
            </div>
            <div class="intel-row">
                <label>Sources</label>
                <div class="intel-toggle">
                    <label><input type="checkbox" id="intelSrcGraph"/>Graph</label>
                    <label><input type="checkbox" id="intelSrcText"/>Texte</label>
                    <label><input type="checkbox" id="intelSrcTags"/>Tags</label>
                    <label><input type="checkbox" id="intelSrcProfile"/>Profil</label>
                    <label><input type="checkbox" id="intelSrcBridge"/>Ponts</label>
                    <label><input type="checkbox" id="intelSrcLex"/>Lexique</label>
                    <label><input type="checkbox" id="intelSrcGeo"/>Geo</label>
                </div>
            </div>
            <div class="intel-row">
                <label>Seuil</label>
                <input id="intelMinScore" type="range" min="10" max="90" step="1" class="intel-grow"/>
                <span id="intelMinScoreVal" class="intel-badge">35%</span>
            </div>
            <div class="intel-row">
                <label>Nouvel.</label>
                <input id="intelNovelty" type="range" min="0" max="60" step="1" class="intel-grow"/>
                <span id="intelNoveltyVal" class="intel-badge">25%</span>
            </div>
            <div class="intel-row">
                <label>Quantite</label>
                <input id="intelLimit" type="number" min="5" max="80" class="intel-input" style="width:70px;"/>
                <label><input id="intelExplain" type="checkbox"/>Explications</label>
                <span id="intelCount" class="intel-badge">0</span>
            </div>
            <div class="intel-row">
                <label>Overlay</label>
                <label><input id="intelShowPredicted" type="checkbox"/>Liens predits</label>
            </div>
            <div class="intel-actions">
                <button id="intelRun" class="mini-btn primary">Analyser</button>
                <button id="intelClear" class="mini-btn">Effacer</button>
            </div>
        </div>
        <div class="intel-divider"></div>
        <div id="intel-list"></div>
    `;
    document.body.appendChild(intelPanel);

    const closeBtn = document.getElementById('btnIntelClose');
    if (closeBtn) closeBtn.onclick = () => {
        const btn = document.getElementById('btnIntel');
        if (btn) btn.classList.remove('active');
        hideIntelPanel();
    };

    const header = intelPanel.querySelector('.intel-header');
    if (header) {
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.target && e.target.closest('#btnIntelClose')) return;
            const rect = intelPanel.getBoundingClientRect();
            isDragging = true;
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            intelPanel.classList.add('dragging');
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            let x = e.clientX - offsetX;
            let y = e.clientY - offsetY;
            const maxX = window.innerWidth - intelPanel.offsetWidth - 10;
            const maxY = window.innerHeight - intelPanel.offsetHeight - 10;
            x = Math.max(10, Math.min(x, maxX));
            y = Math.max(10, Math.min(y, maxY));
            intelPanel.style.left = `${x}px`;
            intelPanel.style.top = `${y}px`;
            intelPanel.style.right = 'auto';
        });

        window.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            intelPanel.classList.remove('dragging');
        });
    }

    setupIntelControls();
}

function setupIntelControls() {
    const modeSel = document.getElementById('intelMode');
    const scopeFocus = document.getElementById('intelScopeFocus');
    const scopeGlobal = document.getElementById('intelScopeGlobal');
    const scopeName = document.getElementById('intelScopeName');
    const srcGraph = document.getElementById('intelSrcGraph');
    const srcText = document.getElementById('intelSrcText');
    const srcTags = document.getElementById('intelSrcTags');
    const srcProfile = document.getElementById('intelSrcProfile');
    const srcBridge = document.getElementById('intelSrcBridge');
    const srcLex = document.getElementById('intelSrcLex');
    const srcGeo = document.getElementById('intelSrcGeo');
    const minScore = document.getElementById('intelMinScore');
    const minScoreVal = document.getElementById('intelMinScoreVal');
    const novelty = document.getElementById('intelNovelty');
    const noveltyVal = document.getElementById('intelNoveltyVal');
    const limitInp = document.getElementById('intelLimit');
    const explainChk = document.getElementById('intelExplain');
    const showPredicted = document.getElementById('intelShowPredicted');
    const btnRun = document.getElementById('intelRun');
    const btnClear = document.getElementById('intelClear');

    const updateScopeName = () => {
        const n = nodeById(state.selection);
        if (scopeName) scopeName.textContent = n ? n.name : 'Aucune';
    };

    const setScope = (scope) => {
        state.aiSettings.scope = scope;
        if (scopeFocus) scopeFocus.classList.toggle('active', scope === 'selection');
        if (scopeGlobal) scopeGlobal.classList.toggle('active', scope === 'global');
        updateScopeName();
        scheduleSave();
    };

    if (modeSel) modeSel.value = state.aiSettings.mode || 'decouverte';
    if (minScore) minScore.value = Math.round((state.aiSettings.minScore || 0.35) * 100);
    if (minScoreVal) minScoreVal.textContent = `${minScore.value}%`;
    if (novelty) novelty.value = Math.round((state.aiSettings.noveltyRatio || 0.25) * 100);
    if (noveltyVal) noveltyVal.textContent = `${novelty.value}%`;
    if (limitInp) limitInp.value = state.aiSettings.limit || 20;
    if (explainChk) explainChk.checked = state.aiSettings.showReasons !== false;
    if (showPredicted) showPredicted.checked = state.aiSettings.showPredicted !== false;

    const sources = state.aiSettings.sources || {};
    if (srcGraph) srcGraph.checked = sources.graph !== false;
    if (srcText) srcText.checked = sources.text !== false;
    if (srcTags) srcTags.checked = sources.tags !== false;
    if (srcProfile) srcProfile.checked = sources.profile !== false;
    if (srcBridge) srcBridge.checked = sources.bridge !== false;
    if (srcLex) srcLex.checked = sources.lex !== false;
    if (srcGeo) srcGeo.checked = sources.geo !== false;

    setScope(state.aiSettings.scope || 'selection');

    if (modeSel) modeSel.onchange = () => {
        state.aiSettings.mode = modeSel.value;
        scheduleSave();
        updateIntelPanel(true);
    };
    if (scopeFocus) scopeFocus.onclick = () => { setScope('selection'); updateIntelPanel(true); };
    if (scopeGlobal) scopeGlobal.onclick = () => { setScope('global'); updateIntelPanel(true); };

    if (minScore) minScore.oninput = () => {
        const val = Number(minScore.value) || 0;
        if (minScoreVal) minScoreVal.textContent = `${val}%`;
        state.aiSettings.minScore = clamp(val / 100, 0.1, 0.9);
        scheduleSave();
    };
    if (minScore) minScore.onchange = () => updateIntelPanel(true);

    if (novelty) novelty.oninput = () => {
        const val = Number(novelty.value) || 0;
        if (noveltyVal) noveltyVal.textContent = `${val}%`;
        state.aiSettings.noveltyRatio = clamp(val / 100, 0, 0.6);
        scheduleSave();
    };
    if (novelty) novelty.onchange = () => updateIntelPanel(true);

    if (limitInp) limitInp.onchange = () => {
        const val = Number(limitInp.value) || 20;
        state.aiSettings.limit = Math.max(5, Math.min(val, 80));
        limitInp.value = state.aiSettings.limit;
        scheduleSave();
        updateIntelPanel(true);
    };

    if (explainChk) explainChk.onchange = () => {
        state.aiSettings.showReasons = explainChk.checked;
        scheduleSave();
        updateIntelPanel(true);
    };
    if (showPredicted) showPredicted.onchange = () => {
        state.aiSettings.showPredicted = showPredicted.checked;
        scheduleSave();
        draw();
    };

    const syncSources = () => {
        state.aiSettings.sources = {
            graph: srcGraph?.checked !== false,
            text: srcText?.checked !== false,
            tags: srcTags?.checked !== false,
            profile: srcProfile?.checked !== false,
            bridge: srcBridge?.checked !== false,
            lex: srcLex?.checked !== false,
            geo: srcGeo?.checked !== false
        };
        scheduleSave();
    };
    [srcGraph, srcText, srcTags, srcProfile, srcBridge, srcLex, srcGeo].forEach(el => {
        if (!el) return;
        el.onchange = () => { syncSources(); updateIntelPanel(true); };
    });

    if (btnRun) btnRun.onclick = () => updateIntelPanel(true);
    if (btnClear) btnClear.onclick = () => {
        intelSuggestions = [];
        state.aiPredictedLinks = [];
        draw();
        const listEl = document.getElementById('intel-list');
        const countEl = document.getElementById('intelCount');
        if (listEl) listEl.innerHTML = '<div style="padding:10px; color:#666; text-align:center;">Analyse effacee</div>';
        if (countEl) countEl.textContent = '0';
    };

    updateScopeName();
}

function showIntelPanel() {
    ensureIntelPanel();
    intelPanel.style.display = 'flex';
    updateIntelPanel(true);
}

function hideIntelPanel() {
    if (intelPanel) intelPanel.style.display = 'none';
}

function centerOnPair(aId, bId) {
    const a = nodeById(aId);
    const b = nodeById(bId);
    if (!a || !b) return;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    state.view.scale = 1.2;
    state.view.x = -cx * state.view.scale;
    state.view.y = -cy * state.view.scale;
    state.selection = a.id;
    renderEditor();
    draw();
}

function updateIntelPanel(force = false) {
    if (!intelPanel || intelPanel.style.display === 'none') return;
    const listEl = document.getElementById('intel-list');
    const countEl = document.getElementById('intelCount');
    const scopeName = document.getElementById('intelScopeName');
    if (scopeName) {
        const n = nodeById(state.selection);
        scopeName.textContent = n ? n.name : 'Aucune';
    }
    if (!listEl) return;
    if (!state.aiSettings?.intelUnlocked) {
        listEl.innerHTML = '<div style="padding:10px; color:#666; text-align:center;">Acces verrouille</div>';
        if (countEl) countEl.textContent = '0';
        state.aiPredictedLinks = [];
        draw();
        return;
    }

    const scope = state.aiSettings.scope || 'selection';
    const focusId = (scope === 'selection' && state.selection) ? state.selection : null;
    if (scope === 'selection' && !focusId) {
        listEl.innerHTML = '<div style="padding:10px; color:#666; text-align:center;">Selectionnez une cible</div>';
        if (countEl) countEl.textContent = '0';
        return;
    }

    const options = {
        focusId,
        mode: state.aiSettings.mode,
        limit: state.aiSettings.limit,
        minScore: state.aiSettings.minScore,
        noveltyRatio: state.aiSettings.noveltyRatio,
        sources: state.aiSettings.sources
    };

    if (force || intelSuggestions.length === 0) {
        intelSuggestions = computeLinkSuggestions(options);
    }

    if (!intelSuggestions.length) {
        listEl.innerHTML = '<div style="padding:10px; color:#666; text-align:center;">Aucune suggestion</div>';
        if (countEl) countEl.textContent = '0';
        state.aiPredictedLinks = [];
        draw();
        return;
    }

    if (countEl) countEl.textContent = `${intelSuggestions.length}`;
    state.aiPredictedLinks = intelSuggestions.map(s => ({
        aId: s.aId,
        bId: s.bId,
        score: s.score,
        kind: s.kind,
        confidence: s.confidence
    }));
    if (state.aiSettings.showPredicted) draw();

    const showReasons = state.aiSettings.showReasons !== false;
    listEl.innerHTML = intelSuggestions.map(s => {
        const scorePct = Math.round(s.score * 100);
        const confPct = Math.round(s.confidence * 100);
        const isBridge = s.bridge ? `<span class="intel-badge">Pont</span>` : '';
        const isSurprise = s.surprise >= 0.6 ? `<span class="intel-badge">Surprise</span>` : '';
        const isAlias = s.alias ? `<span class="intel-badge">Alias?</span>` : '';
        const isGeo = s.geoScore && s.geoScore > 0.55 ? `<span class="intel-badge">Geo</span>` : '';
        const reasons = (showReasons && s.reasons && s.reasons.length) ? `<div class="intel-reasons">${s.reasons.slice(0, 3).map(r => escapeHtml(r)).join(' · ')}</div>` : '';
        const allowedKinds = getAllowedKinds(s.a.type, s.b.type);
        const options = Array.from(allowedKinds).map(k => `<option value="${k}" ${k === s.kind ? 'selected' : ''}>${linkKindEmoji(k)} ${kindToLabel(k)}</option>`).join('');
        return `
            <div class="intel-item ${s.surprise >= 0.6 ? 'highlight' : ''}" data-a="${s.aId}" data-b="${s.bId}">
                <div class="intel-meta">
                    <span class="intel-score">Score ${scorePct}%</span>
                    <span class="intel-confidence">Confiance ${confPct}%</span>
                </div>
                <div class="intel-names">
                    <span>${escapeHtml(s.a.name)} ⇄ ${escapeHtml(s.b.name)}</span>
                    ${isBridge}${isSurprise}${isAlias}${isGeo}
                </div>
                ${reasons}
                <div class="intel-cta">
                    <select class="intel-select intel-kind" data-action="kind">${options}</select>
                    <button class="mini-btn primary" data-action="apply">Valider</button>
                    <button class="mini-btn" data-action="focus">Voir</button>
                    <div class="intel-feedback">
                        <button data-action="up">👍</button>
                        <button data-action="down">👎</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    listEl.querySelectorAll('.intel-item').forEach(row => {
        const aId = row.dataset.a;
        const bId = row.dataset.b;
        row.querySelectorAll('[data-action]').forEach(btn => {
            const action = btn.dataset.action;
            if (action === 'apply') {
                btn.onclick = () => {
                    const kindSel = row.querySelector('.intel-kind');
                    const kind = kindSel ? kindSel.value : null;
                    const res = addLink(aId, bId, kind);
                    if (res) updateIntelPanel(true);
                };
            }
            if (action === 'focus') {
                btn.onclick = () => centerOnPair(aId, bId);
            }
            if (action === 'up') {
                btn.onclick = () => {
                    recordFeedback(aId, bId, 1);
                    scheduleSave();
                    updateIntelPanel(true);
                };
            }
            if (action === 'down') {
                btn.onclick = () => {
                    recordFeedback(aId, bId, -1);
                    scheduleSave();
                    updateIntelPanel(true);
                };
            }
        });
    });
}

export function refreshIntelPanel() {
    if (!intelPanel || intelPanel.style.display === 'none') return;
    updateIntelPanel(true);
}

function setupSearch() {
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        const res = document.getElementById('searchResult');
        if(!q) { res.textContent = ''; return; }
        const found = state.nodes.filter(n => n.name.toLowerCase().includes(q));
        if(found.length === 0) { res.innerHTML = '<span style="color:#666;">Aucun résultat</span>'; return; }
        res.innerHTML = found.slice(0, 10).map(n => `<span class="search-hit" data-id="${n.id}">${escapeHtml(n.name)}</span>`).join(' · ');
        res.querySelectorAll('.search-hit').forEach(el => el.onclick = () => { zoomToNode(el.dataset.id); e.target.value = ''; res.textContent = ''; });
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
    scheduleSave();
}

export function addLink(a, b, kind) {
    const res = logicAddLink(a, b, kind);
    if(res) { refreshLists(); renderEditor(); scheduleSave(); refreshHvt(); }
    return res;
}

export function selectNode(id) {
    state.selection = id;
    renderEditor();
    updatePathfindingPanel();
    draw();
    refreshIntelPanel();
}

function zoomToNode(id) {
    const n = nodeById(id);
    if (!n) return;
    state.selection = n.id;
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
    if (state.hvtMode) updateHvtPanel();
    refreshIntelPanel();
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
