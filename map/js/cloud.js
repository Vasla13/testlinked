import {
    state,
    generateID,
    getMapData,
    setGroups,
    saveLocalState,
    setLocalPersistenceEnabled,
    isLocalPersistenceEnabled
} from './state.js';
import { renderGroupsList } from './ui-list.js';
import { renderAll } from './render.js';
import { customAlert, customConfirm, customPrompt } from './ui-modals.js';
import { escapeHtml } from './utils.js';

const COLLAB_AUTH_ENDPOINT = '/.netlify/functions/collab-auth';
const COLLAB_BOARD_ENDPOINT = '/.netlify/functions/collab-board';
const COLLAB_SESSION_STORAGE_KEY = 'bniLinkedCollabSession_v1';
const COLLAB_ACTIVE_BOARD_STORAGE_KEY = 'bniLinkedMapActiveBoard_v1';

const collab = {
    token: '',
    user: null,
    activeBoardId: '',
    activeRole: '',
    activeBoardTitle: '',
    ownerId: '',
    pendingBoardId: '',
    autosaveTimer: null,
    saveInFlight: false
};

function parseJsonSafe(value) {
    try {
        return JSON.parse(value);
    } catch (e) {
        return null;
    }
}

async function readResponseSafe(response) {
    try {
        return await response.json();
    } catch (e) {
        return {};
    }
}

function endpointHintMessage(statusCode, domain) {
    if (statusCode === 404 || statusCode === 405) {
        return `${domain} indisponible (${statusCode}). Lance le site avec "npx netlify dev".`;
    }
    return '';
}

function setBoardQueryParam(boardId) {
    try {
        const url = new URL(window.location.href);
        if (boardId) url.searchParams.set('board', boardId);
        else url.searchParams.delete('board');
        window.history.replaceState({}, '', url.toString());
    } catch (e) {}
}

function isCloudBoardActive() {
    return Boolean(collab.activeBoardId);
}

function isCloudOwner() {
    return isCloudBoardActive() && collab.activeRole === 'owner';
}

export function isLocalSaveLocked() {
    return isCloudBoardActive() && collab.activeRole !== 'owner';
}

export function canEditCloudBoard() {
    return isCloudBoardActive() && (collab.activeRole === 'owner' || collab.activeRole === 'editor');
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
                ownerId: collab.ownerId || ''
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
        const parsed = parseJsonSafe(sessionRaw || '{}');
        collab.token = String(parsed?.token || '');
        collab.user = parsed?.user && typeof parsed.user === 'object' ? parsed.user : null;
    } catch (e) {
        collab.token = '';
        collab.user = null;
    }

    try {
        const boardRaw = localStorage.getItem(COLLAB_ACTIVE_BOARD_STORAGE_KEY);
        const parsed = parseJsonSafe(boardRaw || '{}');
        collab.activeBoardId = String(parsed?.boardId || '');
        collab.activeRole = String(parsed?.role || '');
        collab.activeBoardTitle = String(parsed?.title || '');
        collab.ownerId = String(parsed?.ownerId || '');
    } catch (e) {
        collab.activeBoardId = '';
        collab.activeRole = '';
        collab.activeBoardTitle = '';
        collab.ownerId = '';
    }
}

function syncCloudStatus() {
    const statusEl = document.getElementById('cloudStatus');
    if (!statusEl) return;

    if (!collab.user) {
        statusEl.textContent = 'Local';
        statusEl.style.color = 'var(--text-dim)';
        statusEl.style.borderColor = 'var(--border-color)';
        return;
    }

    if (collab.activeBoardId) {
        const role = collab.activeRole || 'editor';
        statusEl.textContent = `Cloud ${role}`;
        if (role === 'owner') {
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
    const postResponse = await fetch(COLLAB_AUTH_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(collab.token ? { 'x-collab-token': collab.token } : {})
        },
        body: JSON.stringify({ action, ...payload })
    });

    let response = postResponse;
    let data = await readResponseSafe(postResponse);
    if ((!response.ok || !data.ok) && response.status === 405 && (action === 'me' || action === 'logout')) {
        const url = new URL(COLLAB_AUTH_ENDPOINT, window.location.origin);
        url.searchParams.set('action', action);
        if (collab.token) url.searchParams.set('token', collab.token);
        response = await fetch(url.toString(), { method: 'GET' });
        data = await readResponseSafe(response);
    }

    if (!response.ok || !data.ok) {
        const hint = endpointHintMessage(response.status, 'Auth');
        throw new Error(hint || data.error || `Erreur auth (${response.status})`);
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

    const data = await readResponseSafe(response);
    if (!response.ok || !data.ok) {
        const hint = endpointHintMessage(response.status, 'Cloud');
        throw new Error(hint || data.error || `Erreur cloud (${response.status})`);
    }
    return data;
}

function setActiveCloudBoardFromSummary(summary = null) {
    if (!summary || !summary.id) {
        collab.activeBoardId = '';
        collab.activeRole = '';
        collab.activeBoardTitle = '';
        collab.ownerId = '';
    } else {
        collab.activeBoardId = String(summary.id || '');
        collab.activeRole = String(summary.role || '');
        collab.activeBoardTitle = String(summary.title || '');
        collab.ownerId = String(summary.ownerId || '');
    }

    applyLocalPersistencePolicy();
    syncCloudStatus();
    persistCollabState();
    if (isCloudBoardActive()) startCollabAutosave();
    else stopCollabAutosave();
}

function normalizeMapBoardData(rawData) {
    if (!rawData || typeof rawData !== 'object') {
        throw new Error('Board cloud map invalide.');
    }
    if (!Array.isArray(rawData.groups)) {
        throw new Error('Le board cloud ne contient pas de groupes.');
    }

    const groups = rawData.groups.map((group) => {
        const safeGroup = group && typeof group === 'object' ? { ...group } : {};
        if (!Array.isArray(safeGroup.points)) safeGroup.points = [];
        if (!Array.isArray(safeGroup.zones)) safeGroup.zones = [];
        return safeGroup;
    });

    const linksRaw = Array.isArray(rawData.tacticalLinks) ? rawData.tacticalLinks : [];
    const tacticalLinks = linksRaw
        .map((link) => {
            const from = String(link?.from || link?.source || '').trim();
            const to = String(link?.to || link?.target || '').trim();
            if (!from || !to || from === to) return null;
            return {
                id: String(link?.id || generateID()),
                from,
                to,
                color: link?.color || null,
                type: String(link?.type || 'Standard')
            };
        })
        .filter(Boolean);

    return { groups, tacticalLinks };
}

function applyCloudMapData(rawData) {
    const normalized = normalizeMapBoardData(rawData);
    state.tacticalLinks = normalized.tacticalLinks;
    setGroups(normalized.groups);
    state.tacticalLinks = normalized.tacticalLinks;
    renderGroupsList();
    renderAll();
    saveLocalState();
}

async function openCloudBoard(boardId, options = {}) {
    const targetId = String(boardId || '').trim();
    if (!targetId) throw new Error('Board cloud invalide.');

    const result = await collabBoardRequest('get_board', { boardId: targetId });
    if (!result.board || !result.board.data) throw new Error('Board cloud corrompu.');

    const boardPage = String(result.board.page || 'point');
    if (boardPage !== 'map') {
        throw new Error('Ce board appartient au module Reseau, pas a la carte tactique.');
    }

    const summary = {
        id: result.board.id,
        role: result.role || 'editor',
        title: result.board.title || state.currentFileName || 'Carte cloud',
        ownerId: result.board.ownerId || ''
    };

    setActiveCloudBoardFromSummary(summary);
    applyCloudMapData(result.board.data);
    state.currentFileName = summary.title;
    setBoardQueryParam(summary.id);

    if (!options.quiet) {
        await customAlert('CLOUD', `☁️ Board ouvert : ${escapeHtml(summary.title)}`);
    }
}

export async function saveActiveCloudBoard(options = {}) {
    const manual = Boolean(options.manual);
    const quiet = Boolean(options.quiet);

    if (!isCloudBoardActive()) {
        if (manual && !quiet) await customAlert('CLOUD', 'Aucun board cloud actif.');
        return false;
    }

    if (!canEditCloudBoard()) {
        if (manual && !quiet) await customAlert('CLOUD', "Tu n'as pas les droits d'edition cloud.");
        return false;
    }

    if (collab.saveInFlight) return false;
    collab.saveInFlight = true;

    try {
        const title = (state.currentFileName || collab.activeBoardTitle || 'Carte cloud').trim();
        const result = await collabBoardRequest('save_board', {
            boardId: collab.activeBoardId,
            title,
            data: getMapData()
        });

        if (result?.board) {
            collab.activeBoardTitle = String(result.board.title || title);
            state.currentFileName = collab.activeBoardTitle;
            persistCollabState();
            syncCloudStatus();
        }

        if (manual && !quiet) await customAlert('CLOUD', '☁️ Board cloud sauvegarde.');
        return true;
    } catch (e) {
        if (!quiet) await customAlert('ERREUR CLOUD', escapeHtml(e.message || 'Erreur inconnue.'));
        return false;
    } finally {
        collab.saveInFlight = false;
    }
}

async function createCloudBoardFromCurrent() {
    if (!collab.user) throw new Error('Connexion cloud requise.');

    const defaultTitle = state.currentFileName || `map_${new Date().toISOString().slice(0, 10)}`;
    const titleRaw = await customPrompt(
        'NOUVEAU BOARD CLOUD',
        'Entrez le nom du board cloud :',
        defaultTitle
    );
    if (titleRaw === null) return false;

    const title = String(titleRaw || '').trim() || defaultTitle;
    const result = await collabBoardRequest('create_board', {
        title,
        page: 'map',
        data: getMapData()
    });

    if (!result.board) throw new Error('Creation cloud echouee.');

    setActiveCloudBoardFromSummary({
        id: result.board.id,
        role: result.board.role || 'owner',
        title: result.board.title || title,
        ownerId: result.board.ownerId || collab.user.id
    });

    state.currentFileName = collab.activeBoardTitle;
    setBoardQueryParam(result.board.id);
    return true;
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

function getCloudModalElements() {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const contentEl = document.getElementById('modal-content');
    const actionsEl = document.getElementById('modal-actions');
    const inputContainer = document.getElementById('modal-input-container');
    const colorContainer = document.getElementById('modal-color-picker');
    if (!overlay || !titleEl || !contentEl || !actionsEl || !inputContainer || !colorContainer) {
        return null;
    }
    return { overlay, titleEl, contentEl, actionsEl, inputContainer, colorContainer };
}

function openCloudModal(title, contentHtml, actionsHtml) {
    const modal = getCloudModalElements();
    if (!modal) return null;

    modal.overlay.classList.remove('hidden');
    modal.titleEl.innerText = title;
    modal.inputContainer.style.display = 'none';
    modal.colorContainer.style.display = 'none';
    modal.contentEl.innerHTML = contentHtml;
    modal.actionsEl.innerHTML = actionsHtml;
    modal.actionsEl.classList.add('cloud-actions');
    return modal;
}

function closeCloudModal() {
    const modal = getCloudModalElements();
    if (!modal) return;
    modal.actionsEl.classList.remove('cloud-actions');
    modal.overlay.classList.add('hidden');
}

async function renderCloudMembers(boardId) {
    let result;
    try {
        result = await collabBoardRequest('get_board', { boardId });
    } catch (e) {
        await customAlert('ERREUR CLOUD', escapeHtml(e.message || 'Erreur inconnue.'));
        return;
    }

    if (!result?.board) return;
    if (result.role !== 'owner') {
        await customAlert('CLOUD', 'Seul le lead peut gerer les membres.');
        return;
    }

    const board = result.board;
    const members = Array.isArray(board.members) ? board.members : [];
    const shareUrl = `${window.location.origin}${window.location.pathname}?board=${encodeURIComponent(board.id)}`;

    const membersHtml = members.map((member) => {
        const isOwner = member.role === 'owner';
        return `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin:6px 0; padding:8px; border:1px solid rgba(255,255,255,0.08); background:rgba(0,0,0,0.2);">
                <div>
                    <div style="font-size:0.95rem; color:#fff;">${escapeHtml(member.username)}</div>
                    <div style="font-size:0.72rem; color:#8b9bb4; text-transform:uppercase;">${escapeHtml(member.role || 'editor')}</div>
                </div>
                <div style="display:flex; gap:6px;">
                    ${isOwner ? '' : `<button type="button" class="mini-btn cloud-remove-member" data-user="${escapeHtml(member.userId)}">Retirer</button>`}
                    ${isOwner ? '' : `<button type="button" class="mini-btn cloud-transfer-member" data-user="${escapeHtml(member.userId)}">Donner lead</button>`}
                </div>
            </div>
        `;
    }).join('');

    openCloudModal(
        'MEMBRES CLOUD',
        `
            <div style="font-size:0.82rem; color:#9bb0c7; margin-bottom:10px;">Board: ${escapeHtml(board.title || 'Sans nom')}</div>
            <div style="display:flex; gap:8px; margin-bottom:8px;">
                <input id="cloud-share-username" type="text" placeholder="username" style="flex:1;" />
                <select id="cloud-share-role" style="width:120px; margin-bottom:0;">
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                </select>
                <button type="button" id="cloud-share-add" class="mini-btn">Ajouter</button>
            </div>
            <div style="font-size:0.72rem; color:#8b9bb4; margin-bottom:8px;">Lien partage: <span id="cloud-share-link" style="color:var(--accent-cyan);">${escapeHtml(shareUrl)}</span></div>
            <div style="max-height:260px; overflow:auto; padding-right:4px;">${membersHtml || '<div style="color:#777">Aucun membre.</div>'}</div>
        `,
        `
            <button type="button" id="cloud-copy-link" class="btn-modal-cancel">Copier lien</button>
            <button type="button" id="cloud-members-back" class="btn-modal-cancel">Retour</button>
            <button type="button" id="cloud-members-close" class="btn-modal-confirm">Fermer</button>
        `
    );

    const shareAdd = document.getElementById('cloud-share-add');
    if (shareAdd) {
        shareAdd.onclick = async () => {
            const usernameEl = document.getElementById('cloud-share-username');
            const roleEl = document.getElementById('cloud-share-role');
            const username = String(usernameEl?.value || '').trim();
            const role = String(roleEl?.value || 'editor');

            if (!username) {
                await customAlert('CLOUD', 'Entre un username.');
                return;
            }

            try {
                await collabBoardRequest('share_board', { boardId, username, role });
                await renderCloudMembers(boardId);
            } catch (e) {
                await customAlert('ERREUR CLOUD', escapeHtml(e.message || 'Erreur inconnue.'));
            }
        };
    }

    Array.from(document.querySelectorAll('.cloud-remove-member')).forEach((btn) => {
        btn.onclick = async () => {
            const userId = btn.getAttribute('data-user') || '';
            if (!userId) return;

            const confirmed = await customConfirm('CLOUD', 'Retirer ce membre du board ?');
            if (!confirmed) return;

            try {
                await collabBoardRequest('remove_member', { boardId, userId });
                await renderCloudMembers(boardId);
            } catch (e) {
                await customAlert('ERREUR CLOUD', escapeHtml(e.message || 'Erreur inconnue.'));
            }
        };
    });

    Array.from(document.querySelectorAll('.cloud-transfer-member')).forEach((btn) => {
        btn.onclick = async () => {
            const userId = btn.getAttribute('data-user') || '';
            if (!userId) return;

            const confirmed = await customConfirm('CLOUD', 'Donner le lead a ce membre ?');
            if (!confirmed) return;

            try {
                await collabBoardRequest('transfer_board', { boardId, userId });
                await openCloudBoard(boardId, { quiet: true });
                await renderCloudHome();
            } catch (e) {
                await customAlert('ERREUR CLOUD', escapeHtml(e.message || 'Erreur inconnue.'));
            }
        };
    });

    const copyLinkBtn = document.getElementById('cloud-copy-link');
    if (copyLinkBtn) {
        copyLinkBtn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(shareUrl);
                await customAlert('CLOUD', 'Lien copie.');
            } catch (e) {
                await customAlert('ERREUR CLOUD', 'Impossible de copier le lien.');
            }
        };
    }

    const backBtn = document.getElementById('cloud-members-back');
    if (backBtn) backBtn.onclick = () => { renderCloudHome().catch(() => {}); };

    const closeBtn = document.getElementById('cloud-members-close');
    if (closeBtn) closeBtn.onclick = () => closeCloudModal();
}

async function renderCloudHome() {
    if (!collab.user) {
        openCloudModal(
            'CLOUD COLLABORATIF',
            `
                <div style="font-size:0.82rem; color:#9bb0c7; margin-bottom:10px;">Crée un compte ou connecte-toi pour partager la carte.</div>
                <input id="cloud-auth-user" type="text" placeholder="username" style="margin-bottom:8px;" />
                <input id="cloud-auth-pass" type="password" placeholder="mot de passe" style="margin-bottom:0;" />
            `,
            `
                <button type="button" id="cloud-auth-register" class="btn-modal-cancel">Creer compte</button>
                <button type="button" id="cloud-auth-login" class="btn-modal-confirm">Connexion</button>
                <button type="button" id="cloud-auth-close" class="btn-modal-cancel">Fermer</button>
            `
        );

        const runAuth = async (action) => {
            const userEl = document.getElementById('cloud-auth-user');
            const passEl = document.getElementById('cloud-auth-pass');
            const username = String(userEl?.value || '').trim();
            const password = String(passEl?.value || '');

            if (!username || !password) {
                await customAlert('AUTH', 'Renseigne username + mot de passe.');
                return;
            }

            try {
                const res = await collabAuthRequest(action, { username, password });
                collab.token = String(res.token || '');
                collab.user = res.user || null;
                persistCollabState();
                syncCloudStatus();

                if (collab.pendingBoardId) {
                    const pendingId = collab.pendingBoardId;
                    collab.pendingBoardId = '';
                    try {
                        await openCloudBoard(pendingId, { quiet: true });
                    } catch (e) {
                        await customAlert('ERREUR CLOUD', escapeHtml(e.message || "Impossible d'ouvrir le board."));
                    }
                }

                await renderCloudHome();
            } catch (e) {
                await customAlert('ERREUR AUTH', escapeHtml(e.message || 'Erreur inconnue.'));
            }
        };

        const registerBtn = document.getElementById('cloud-auth-register');
        if (registerBtn) registerBtn.onclick = () => { runAuth('register').catch(() => {}); };

        const loginBtn = document.getElementById('cloud-auth-login');
        if (loginBtn) loginBtn.onclick = () => { runAuth('login').catch(() => {}); };

        const closeBtn = document.getElementById('cloud-auth-close');
        if (closeBtn) closeBtn.onclick = () => closeCloudModal();
        return;
    }

    let boards = [];
    try {
        const res = await collabBoardRequest('list_boards', {});
        const allBoards = Array.isArray(res.boards) ? res.boards : [];
        boards = allBoards.filter((board) => String(board.page || 'point') === 'map');
    } catch (e) {
        await customAlert('ERREUR CLOUD', escapeHtml(e.message || 'Erreur inconnue.'));
        return;
    }

    const boardRows = boards.map((board) => {
        const active = board.id === collab.activeBoardId;
        const role = String(board.role || '');

        return `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin:6px 0; padding:8px; border:1px solid ${active ? 'rgba(115,251,247,0.45)' : 'rgba(255,255,255,0.08)'}; background:${active ? 'rgba(115,251,247,0.08)' : 'rgba(0,0,0,0.2)'};">
                <div style="min-width:0;">
                    <div style="font-size:0.95rem; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(board.title || 'Sans nom')}</div>
                    <div style="font-size:0.72rem; color:#8b9bb4; text-transform:uppercase;">${escapeHtml(role)} · MAP</div>
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0;">
                    <button type="button" class="mini-btn cloud-open-board" data-board="${escapeHtml(board.id)}">Ouvrir</button>
                    ${role === 'owner' ? `<button type="button" class="mini-btn cloud-manage-board" data-board="${escapeHtml(board.id)}">Membres</button>` : ''}
                    ${role !== 'owner' ? `<button type="button" class="mini-btn cloud-leave-board" data-board="${escapeHtml(board.id)}">Quitter</button>` : ''}
                </div>
            </div>
        `;
    }).join('');

    openCloudModal(
        'CLOUD COLLABORATIF',
        `
            <div style="font-size:0.82rem; color:#9bb0c7; margin-bottom:6px;">Connecte: ${escapeHtml(collab.user.username || '')}</div>
            <div style="font-size:0.75rem; color:${isCloudBoardActive() ? 'var(--accent-cyan)' : '#9bb0c7'}; margin-bottom:8px;">
                ${isCloudBoardActive() ? `Board actif: ${escapeHtml(collab.activeBoardTitle || collab.activeBoardId)} (${escapeHtml(collab.activeRole || '')})` : 'Aucun board cloud actif'}
            </div>
            <div style="max-height:280px; overflow:auto; padding-right:4px;">${boardRows || '<div style="color:#777;">Aucun board map cloud.</div>'}</div>
        `,
        `
            <button type="button" id="cloud-create-board" class="btn-modal-confirm">Nouveau board</button>
            <button type="button" id="cloud-save-active" class="btn-modal-cancel">Sauver board actif</button>
            <button type="button" id="cloud-refresh" class="btn-modal-cancel">Rafraichir</button>
            <button type="button" id="cloud-logout" class="btn-modal-cancel">Deconnexion</button>
            <button type="button" id="cloud-close" class="btn-modal-cancel">Fermer</button>
        `
    );

    const saveActiveBtn = document.getElementById('cloud-save-active');
    if (saveActiveBtn && !canEditCloudBoard()) {
        saveActiveBtn.disabled = true;
        saveActiveBtn.style.opacity = '0.45';
        saveActiveBtn.title = 'Droits insuffisants';
    }

    const createBtn = document.getElementById('cloud-create-board');
    if (createBtn) {
        createBtn.onclick = async () => {
            try {
                const created = await createCloudBoardFromCurrent();
                if (created) {
                    await customAlert('CLOUD', `☁️ Board cree: ${escapeHtml(collab.activeBoardTitle || '')}`);
                }
                await renderCloudHome();
            } catch (e) {
                await customAlert('ERREUR CLOUD', escapeHtml(e.message || 'Erreur inconnue.'));
            }
        };
    }

    if (saveActiveBtn) {
        saveActiveBtn.onclick = async () => {
            await saveActiveCloudBoard({ manual: true, quiet: false });
            await renderCloudHome();
        };
    }

    const refreshBtn = document.getElementById('cloud-refresh');
    if (refreshBtn) refreshBtn.onclick = () => { renderCloudHome().catch(() => {}); };

    const logoutBtn = document.getElementById('cloud-logout');
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            await logoutCollab();
            await renderCloudHome();
        };
    }

    const closeBtn = document.getElementById('cloud-close');
    if (closeBtn) closeBtn.onclick = () => closeCloudModal();

    Array.from(document.querySelectorAll('.cloud-open-board')).forEach((btn) => {
        btn.onclick = async () => {
            const boardId = btn.getAttribute('data-board') || '';
            if (!boardId) return;
            try {
                await openCloudBoard(boardId, { quiet: false });
                await renderCloudHome();
            } catch (e) {
                await customAlert('ERREUR CLOUD', escapeHtml(e.message || 'Erreur inconnue.'));
            }
        };
    });

    Array.from(document.querySelectorAll('.cloud-manage-board')).forEach((btn) => {
        btn.onclick = () => {
            const boardId = btn.getAttribute('data-board') || '';
            if (!boardId) return;
            renderCloudMembers(boardId).catch(() => {});
        };
    });

    Array.from(document.querySelectorAll('.cloud-leave-board')).forEach((btn) => {
        btn.onclick = async () => {
            const boardId = btn.getAttribute('data-board') || '';
            if (!boardId) return;

            const confirmed = await customConfirm('CLOUD', 'Quitter ce board partage ?');
            if (!confirmed) return;

            try {
                await collabBoardRequest('leave_board', { boardId });
                if (boardId === collab.activeBoardId) {
                    setActiveCloudBoardFromSummary(null);
                    setBoardQueryParam('');
                }
                await renderCloudHome();
            } catch (e) {
                await customAlert('ERREUR CLOUD', escapeHtml(e.message || 'Erreur inconnue.'));
            }
        };
    });
}

export function openCloudMenu() {
    const modal = getCloudModalElements();
    if (!modal) return;
    modal.overlay.classList.remove('hidden');
    renderCloudHome().catch(() => {});
}

export function getCloudSaveModalOptions() {
    return {
        cloudActive: isCloudBoardActive(),
        cloudEditable: canEditCloudBoard(),
        localExportLocked: isLocalSaveLocked(),
        boardTitle: collab.activeBoardTitle || collab.activeBoardId || '',
        onSaveCloud: async () => saveActiveCloudBoard({ manual: true, quiet: false })
    };
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
    } else {
        applyLocalPersistencePolicy();
    }

    syncCloudStatus();
    persistCollabState();
}
