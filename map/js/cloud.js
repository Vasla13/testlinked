import {
    state,
    getMapData,
    exportToJSON,
    setGroups,
    saveLocalState,
    setLocalPersistenceEnabled,
    isLocalPersistenceEnabled
} from './state.js';
import { renderGroupsList } from './ui-list.js';
import { renderAll } from './render.js';
import { customAlert, customConfirm, customPrompt } from './ui-modals.js';
import { escapeHtml } from './utils.js';
import {
    parseJsonSafe as parseStoredJsonSafe,
    readResponseSafe as readCollabResponseSafe,
    endpointHintMessage as getEndpointHintMessage,
    updateBoardQueryParam,
    createStoredCollabStateBridge,
    buildCollabAuthRequester,
    buildCollabBoardRequester,
    stopNamedTimer,
    queueNamedTimer,
    stopRetriableLoop,
    scheduleRetriableLoop
} from '../../shared/js/collab-browser.mjs';
import {
    MAP_SHARED_SNAPSHOT_STORAGE_KEY,
    clearSharedMapSnapshot,
    writeSharedMapSnapshot
} from '../../shared/js/map-link-contract.mjs';
import {
    normalizeMapBoardPayload as normalizeSharedMapBoardPayload,
    normalizeOptionalMapBoardPayload as normalizeSharedOptionalMapBoardPayload,
    mergeMapBoardPayload as mergeSharedMapBoardPayload
} from '../../shared/js/map-board.mjs';

const COLLAB_AUTH_ENDPOINT = '/.netlify/functions/collab-auth';
const COLLAB_BOARD_ENDPOINT = '/.netlify/functions/collab-board';
const COLLAB_SESSION_STORAGE_KEY = 'bniLinkedCollabSession_v1';
const COLLAB_ACTIVE_BOARD_STORAGE_KEY = 'bniLinkedMapActiveBoard_v1';
const MAP_LOCAL_CHANGE_EVENT = 'bni:map-local-change';

const collab = {
    token: '',
    user: null,
    activeBoardId: '',
    activeRole: '',
    activeBoardTitle: '',
    ownerId: '',
    activeBoardUpdatedAt: '',
    pendingBoardId: '',
    autosaveDebounceTimer: null,
    syncTimer: null,
    syncLoopToken: 0,
    syncRetryMs: 0,
    syncLoopRunning: false,
    autosaveListenerBound: false,
    syncInFlight: false,
    lastSavedFingerprint: '',
    shadowData: null,
    saveInFlight: false,
    homePanel: 'cloud'
};

const COLLAB_AUTOSAVE_DEBOUNCE_MS = 700;
const COLLAB_AUTOSAVE_RETRY_MS = 250;
const COLLAB_WATCH_TIMEOUT_MS = 7000;
const COLLAB_WATCH_RETRY_MIN_MS = 500;
const COLLAB_WATCH_RETRY_MAX_MS = 4000;
const collabStorage = createStoredCollabStateBridge({
    sessionStorageKey: COLLAB_SESSION_STORAGE_KEY,
    boardStorageKey: COLLAB_ACTIVE_BOARD_STORAGE_KEY,
    extraClearKeys: [MAP_SHARED_SNAPSHOT_STORAGE_KEY]
});
const sharedCollabAuthRequest = buildCollabAuthRequester({
    endpoint: COLLAB_AUTH_ENDPOINT,
    getToken: () => collab.token,
    allowGetFallback: true
});
const sharedCollabBoardRequest = buildCollabBoardRequester({
    endpoint: COLLAB_BOARD_ENDPOINT,
    getToken: () => collab.token
});

function parseJsonSafe(value) {
    return parseStoredJsonSafe(value, null);
}

async function readResponseSafe(response) {
    return readCollabResponseSafe(response, {});
}

function endpointHintMessage(statusCode, domain) {
    return getEndpointHintMessage(statusCode, domain);
}

function setBoardQueryParam(boardId) {
    updateBoardQueryParam(boardId);
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
    collabStorage.persist(collab);
}

function clearCollabStorage() {
    collabStorage.clear();
}

function syncSharedMapSnapshot(payload = null) {
    if (!collab.activeBoardId || !payload || !Array.isArray(payload.groups)) {
        clearSharedMapSnapshot();
        return;
    }

    writeSharedMapSnapshot(localStorage, {
        boardId: collab.activeBoardId,
        updatedAt: collab.activeBoardUpdatedAt || '',
        data: payload
    });
}

function hydrateCollabState() {
    collabStorage.hydrate(collab);
}

function syncCloudStatus() {
    const statusEl = document.getElementById('cloudStatus');
    const metaEl = document.getElementById('cloudStatusMeta');
    if (!statusEl) return;

    const setStatus = (label, stateKey, meta) => {
        statusEl.textContent = label;
        statusEl.dataset.state = stateKey;
        if (metaEl) {
            metaEl.textContent = meta;
            metaEl.dataset.state = stateKey;
        }
    };

    if (!collab.user) {
        setStatus('Local', 'local', 'Hors ligne');
        return;
    }

    if (collab.activeBoardId) {
        const role = collab.activeRole || 'editor';
        const stateKey = role === 'owner' ? 'cloud-lead' : 'cloud-member';
        const label = role === 'owner' ? 'Cloud lead' : 'Cloud membre';
        const meta = collab.activeBoardTitle || collab.activeBoardId || 'Board actif';
        setStatus(label, stateKey, meta);
        return;
    }

    setStatus('Session cloud', 'session', collab.user.username || 'Connecte');
}

function applyLocalPersistencePolicy() {
    if (isLocalSaveLocked()) {
        setLocalPersistenceEnabled(false, { purge: true });
    } else if (!isLocalPersistenceEnabled()) {
        setLocalPersistenceEnabled(true);
    }
}

function updateActiveBoardSummary(summary = null) {
    if (!summary || !summary.id) return;
    collab.activeBoardId = String(summary.id || collab.activeBoardId || '');
    collab.activeRole = String(summary.role || collab.activeRole || '');
    collab.activeBoardTitle = String(summary.title || collab.activeBoardTitle || '');
    collab.ownerId = String(summary.ownerId || collab.ownerId || '');
    collab.activeBoardUpdatedAt = String(summary.updatedAt || collab.activeBoardUpdatedAt || '');
    syncCloudStatus();
    persistCollabState();
}

function cloneJsonSafe(value, fallback) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (e) {
        return fallback;
    }
}

function getCloudMapPayload() {
    return {
        groups: cloneJsonSafe(state.groups || [], []),
        tacticalLinks: cloneJsonSafe(state.tacticalLinks || [], [])
    };
}

function computeCloudFingerprint() {
    try {
        if (!isCloudBoardActive()) return '';
        return JSON.stringify(normalizeSharedMapBoardPayload(getCloudMapPayload()));
    } catch (e) {
        return '';
    }
}

function captureCloudSavedFingerprint() {
    const fp = computeCloudFingerprint();
    collab.lastSavedFingerprint = fp;
    return fp;
}

function hasLocalCloudChanges() {
    if (!isCloudBoardActive()) return false;
    const current = computeCloudFingerprint();
    return Boolean(current) && current !== String(collab.lastSavedFingerprint || '');
}

function stopCollabAutosave() {
    stopNamedTimer(collab, 'autosaveDebounceTimer');
}

function queueCloudAutosave(delayMs = COLLAB_AUTOSAVE_DEBOUNCE_MS) {
    if (!isCloudBoardActive() || !canEditCloudBoard()) return;
    stopCollabAutosave();
    queueNamedTimer(collab, 'autosaveDebounceTimer', () => {
        saveActiveCloudBoard({ manual: false, quiet: true }).catch(() => {});
    }, delayMs);
}

function onMapLocalChange() {
    if (isCloudBoardActive()) {
        syncSharedMapSnapshot(getCloudMapPayload());
    }
    queueCloudAutosave();
}

function ensureCollabAutosaveListener() {
    if (collab.autosaveListenerBound) return;
    collab.autosaveListenerBound = true;
    window.addEventListener(MAP_LOCAL_CHANGE_EVENT, onMapLocalChange);
}

function startCollabAutosave() {
    ensureCollabAutosaveListener();
    if (!isCloudBoardActive() || !canEditCloudBoard()) {
        stopCollabAutosave();
        return;
    }
    queueCloudAutosave(COLLAB_AUTOSAVE_RETRY_MS);
}

function stopCollabLiveSync() {
    stopRetriableLoop(collab, {
        timerKey: 'syncTimer',
        tokenKey: 'syncLoopToken',
        runningKey: 'syncLoopRunning',
        retryKey: 'syncRetryMs'
    });
}

function scheduleNextWatchTick(loopToken, delayMs = 0) {
    scheduleRetriableLoop(collab, {
        timerKey: 'syncTimer',
        tokenKey: 'syncLoopToken'
    }, loopToken, delayMs, () => {
        runCollabWatchLoop(loopToken).catch(() => {});
    });
}

async function runCollabWatchLoop(loopToken) {
    if (collab.syncLoopToken !== loopToken) return;
    if (!isCloudBoardActive() || !collab.user || !collab.token) {
        collab.syncLoopRunning = false;
        return;
    }

    try {
        const watch = await collabBoardRequest('watch_board', {
            boardId: collab.activeBoardId,
            sinceUpdatedAt: String(collab.activeBoardUpdatedAt || ''),
            timeoutMs: COLLAB_WATCH_TIMEOUT_MS
        });

        if (collab.syncLoopToken !== loopToken) return;
        collab.syncRetryMs = COLLAB_WATCH_RETRY_MIN_MS;

        if (watch?.deleted || watch?.revoked) {
            setActiveCloudBoardFromSummary(null);
            setBoardQueryParam('');
            collab.syncLoopRunning = false;
            return;
        }

        if (watch?.changed) {
            const watchedUpdatedAt = String(watch.updatedAt || '');
            if (!watchedUpdatedAt || watchedUpdatedAt !== String(collab.activeBoardUpdatedAt || '')) {
                await syncActiveCloudBoard({ quiet: true });
            }
        }

        scheduleNextWatchTick(loopToken, 0);
    } catch (e) {
        if (collab.syncLoopToken !== loopToken) return;
        const status = Number(e?.status || 0);
        if (status === 401 || status === 403 || status === 404) {
            collab.syncLoopRunning = false;
            stopCollabLiveSync();
            return;
        }

        collab.syncRetryMs = collab.syncRetryMs
            ? Math.min(COLLAB_WATCH_RETRY_MAX_MS, collab.syncRetryMs * 2)
            : COLLAB_WATCH_RETRY_MIN_MS;
        scheduleNextWatchTick(loopToken, collab.syncRetryMs);
    }
}

function normalizeOptionalMapBoardData(rawData) {
    try {
        return normalizeSharedOptionalMapBoardPayload(rawData);
    } catch (e) {
        return { groups: [], tacticalLinks: [] };
    }
}

function setCloudShadowData(rawData) {
    collab.shadowData = cloneJsonSafe(
        normalizeOptionalMapBoardData(rawData),
        { groups: [], tacticalLinks: [] }
    );
    return collab.shadowData;
}

function mergeMapBoardData(remoteRaw, localRaw, baseRaw = null) {
    return normalizeSharedMapBoardPayload(
        mergeSharedMapBoardPayload(remoteRaw, localRaw, baseRaw)
    );
}

async function syncActiveCloudBoard(options = {}) {
    const quiet = Boolean(options.quiet);
    const allowDuringSave = Boolean(options.allowDuringSave);
    if (!isCloudBoardActive() || !collab.user || !collab.token) return false;
    if (collab.syncInFlight) return false;
    if (collab.saveInFlight && !allowDuringSave) return false;

    collab.syncInFlight = true;
    try {
        const result = await collabBoardRequest('get_board', { boardId: collab.activeBoardId });
        if (!result || !result.board || !result.board.data) return false;

        const remoteSummary = {
            id: result.board.id || collab.activeBoardId,
            role: result.role || collab.activeRole,
            title: result.board.title || collab.activeBoardTitle || state.currentFileName || 'Carte cloud',
            ownerId: result.board.ownerId || collab.ownerId || '',
            updatedAt: result.board.updatedAt || collab.activeBoardUpdatedAt || ''
        };

        const remoteUpdatedAt = String(remoteSummary.updatedAt || '');
        const localUpdatedAt = String(collab.activeBoardUpdatedAt || '');
        if (!remoteUpdatedAt || remoteUpdatedAt === localUpdatedAt) return false;

        const localChanged = hasLocalCloudChanges();
        updateActiveBoardSummary(remoteSummary);

        if (localChanged && canEditCloudBoard()) {
            const localSnapshot = getCloudMapPayload();
            const mergedPayload = mergeMapBoardData(result.board.data, localSnapshot, collab.shadowData);
            setCloudShadowData(result.board.data);
            applyCloudMapData(mergedPayload);
            state.currentFileName = remoteSummary.title;
            const mergedSaved = await saveActiveCloudBoard({ manual: false, quiet: true, force: true });
            if (!mergedSaved) return false;
            captureCloudSavedFingerprint();
            return true;
        }

        applyCloudMapData(result.board.data);
        setCloudShadowData(result.board.data);
        state.currentFileName = remoteSummary.title;
        captureCloudSavedFingerprint();
        return true;
    } catch (e) {
        if (!quiet) await customAlert('ERREUR CLOUD', escapeHtml(e.message || 'Erreur sync live.'));
        return false;
    } finally {
        collab.syncInFlight = false;
    }
}

function startCollabLiveSync() {
    stopCollabLiveSync();
    if (!isCloudBoardActive() || !collab.user || !collab.token) return;
    const loopToken = collab.syncLoopToken + 1;
    collab.syncLoopToken = loopToken;
    collab.syncLoopRunning = true;
    collab.syncRetryMs = COLLAB_WATCH_RETRY_MIN_MS;
    scheduleNextWatchTick(loopToken, 0);
}

async function collabAuthRequest(action, payload = {}) {
    return sharedCollabAuthRequest(action, payload);
}

async function collabBoardRequest(action, payload = {}) {
    return sharedCollabBoardRequest(action, payload);
}

function setActiveCloudBoardFromSummary(summary = null) {
    if (!summary || !summary.id) {
        collab.activeBoardId = '';
        collab.activeRole = '';
        collab.activeBoardTitle = '';
        collab.ownerId = '';
        collab.activeBoardUpdatedAt = '';
        collab.lastSavedFingerprint = '';
        collab.shadowData = null;
        syncSharedMapSnapshot(null);
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
    if (isCloudBoardActive()) {
        startCollabAutosave();
        startCollabLiveSync();
    } else {
        stopCollabAutosave();
        stopCollabLiveSync();
    }
}

function normalizeMapBoardData(rawData) {
    if (!rawData || typeof rawData !== 'object') {
        throw new Error('Board cloud map invalide.');
    }
    if (!Array.isArray(rawData.groups)) {
        throw new Error('Le board cloud ne contient pas de groupes.');
    }
    return normalizeSharedMapBoardPayload(rawData);
}

function applyCloudMapData(rawData) {
    const normalized = normalizeMapBoardData(rawData);
    state.tacticalLinks = normalized.tacticalLinks;
    setGroups(normalized.groups);
    state.tacticalLinks = normalized.tacticalLinks;
    renderGroupsList();
    renderAll();
    saveLocalState();
    syncSharedMapSnapshot(normalized);
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
        ownerId: result.board.ownerId || '',
        updatedAt: result.board.updatedAt || ''
    };

    setActiveCloudBoardFromSummary(summary);
    applyCloudMapData(result.board.data);
    setCloudShadowData(result.board.data);
    state.currentFileName = summary.title;
    captureCloudSavedFingerprint();
    setBoardQueryParam(summary.id);

    if (!options.quiet) {
        await customAlert('CLOUD', `☁️ Board ouvert : ${escapeHtml(summary.title)}`);
    }
}

export async function saveActiveCloudBoard(options = {}) {
    const manual = Boolean(options.manual);
    const quiet = Boolean(options.quiet);
    const force = Boolean(options.force);

    if (!isCloudBoardActive()) {
        if (manual && !quiet) await customAlert('CLOUD', 'Aucun board cloud actif.');
        return false;
    }

    if (!canEditCloudBoard()) {
        if (manual && !quiet) await customAlert('CLOUD', "Tu n'as pas les droits d'edition cloud.");
        return false;
    }

    if (collab.saveInFlight) {
        if (!manual) queueCloudAutosave(COLLAB_AUTOSAVE_RETRY_MS);
        return false;
    }
    if (!force && !manual && !hasLocalCloudChanges()) return true;
    collab.saveInFlight = true;

    try {
        const title = (state.currentFileName || collab.activeBoardTitle || 'Carte cloud').trim();
        const payload = normalizeMapBoardData(getCloudMapPayload());
        const localFingerprint = JSON.stringify(payload);
        const result = await collabBoardRequest('save_board', {
            boardId: collab.activeBoardId,
            title,
            data: payload,
            ...(collab.shadowData ? { baseData: cloneJsonSafe(collab.shadowData, null) } : {}),
            ...(collab.activeBoardUpdatedAt ? { expectedUpdatedAt: collab.activeBoardUpdatedAt } : {})
        });

        if (result?.board) {
            collab.activeBoardTitle = String(result.board.title || title);
            collab.activeBoardUpdatedAt = String(result.board.updatedAt || collab.activeBoardUpdatedAt || '');
            state.currentFileName = collab.activeBoardTitle;
            persistCollabState();
            syncCloudStatus();

            if (result.board.data) {
                const serverPayload = normalizeMapBoardData(result.board.data);
                const serverFingerprint = JSON.stringify(serverPayload);
                collab.lastSavedFingerprint = serverFingerprint;
                setCloudShadowData(serverPayload);

                if (serverFingerprint !== localFingerprint) {
                    applyCloudMapData(serverPayload);
                } else {
                    syncSharedMapSnapshot(serverPayload);
                }
            } else {
                collab.lastSavedFingerprint = localFingerprint;
                setCloudShadowData(payload);
                syncSharedMapSnapshot(payload);
            }
        }

        if (manual && !quiet) {
            await customAlert(
                'CLOUD',
                result?.mergedConflict ? '☁️ Board cloud sauvegarde avec fusion auto.' : '☁️ Board cloud sauvegarde.'
            );
        }
        return true;
    } catch (e) {
        if (e && Number(e.status) === 409) {
            await syncActiveCloudBoard({ quiet: true, allowDuringSave: true });
            queueCloudAutosave(25);
            if (!quiet) await customAlert('CLOUD', 'Conflit detecte. Sync live appliquee automatiquement.');
            return false;
        }
        if (!quiet) await customAlert('ERREUR CLOUD', escapeHtml(e.message || 'Erreur inconnue.'));
        return false;
    } finally {
        collab.saveInFlight = false;
        if (!manual && hasLocalCloudChanges()) {
            queueCloudAutosave(COLLAB_AUTOSAVE_RETRY_MS);
        }
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
    const payload = normalizeMapBoardData(getCloudMapPayload());
    const result = await collabBoardRequest('create_board', {
        title,
        page: 'map',
        data: payload
    });

    if (!result.board) throw new Error('Creation cloud echouee.');

    setActiveCloudBoardFromSummary({
        id: result.board.id,
        role: result.board.role || 'owner',
        title: result.board.title || title,
        ownerId: result.board.ownerId || collab.user.id,
        updatedAt: result.board.updatedAt || ''
    });

    state.currentFileName = collab.activeBoardTitle;
    setCloudShadowData(result.board.data || payload);
    captureCloudSavedFingerprint();
    syncSharedMapSnapshot(payload);
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
    stopCollabLiveSync();
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

async function saveLocalMapSnapshot() {
    if (isLocalSaveLocked()) {
        await customAlert('ACCES', 'Export local bloque sur ce board cloud.');
        return;
    }

    closeCloudModal();
    window.setTimeout(async () => {
        const exported = exportToJSON();
        if (!exported) {
            await customAlert('ACCES', 'Export local bloque sur ce board cloud.');
        }
    }, 40);
}

async function copyLocalMapSnapshot() {
    if (isLocalSaveLocked()) {
        await customAlert('ACCES', 'Export local bloque sur ce board cloud.');
        return;
    }

    try {
        await navigator.clipboard.writeText(JSON.stringify(getMapData(), null, 2));
        closeCloudModal();
        await customAlert('LOCAL', 'JSON copie.');
    } catch (e) {
        await customAlert('ERREUR', 'Impossible de copier le JSON.');
    }
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
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin:6px 0; padding:10px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(0,0,0,0.24);">
                <div style="min-width:0; display:flex; flex-direction:column; gap:4px;">
                    <div style="font-size:0.95rem; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(member.username)}</div>
                    <div style="font-size:0.72rem; color:#8b9bb4; text-transform:uppercase;">${escapeHtml(member.role || 'editor')}</div>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                    ${isOwner ? '' : `<button type="button" class="mini-btn cloud-remove-member" data-user="${escapeHtml(member.userId)}">Retirer</button>`}
                    ${isOwner ? '' : `<button type="button" class="mini-btn cloud-transfer-member" data-user="${escapeHtml(member.userId)}">Donner lead</button>`}
                </div>
            </div>
        `;
    }).join('');

    openCloudModal(
        'GESTION BOARD',
        `
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:10px;">
                <div>
                    <div style="font-size:1rem; color:#fff; text-transform:uppercase; letter-spacing:1px;">Gestion du board</div>
                    <div style="font-size:0.8rem; color:#9bb0c7; margin-top:4px;">Board: ${escapeHtml(board.title || 'Sans nom')}</div>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                    <button type="button" id="cloud-rename-board" class="mini-btn">Renommer</button>
                    <button type="button" id="cloud-delete-board" class="mini-btn">Supprimer</button>
                </div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:8px;">
                <input id="cloud-share-username" type="text" placeholder="username" style="flex:1 1 180px;" />
                <select id="cloud-share-role" style="width:120px; margin-bottom:0;">
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                </select>
                <button type="button" id="cloud-share-add" class="mini-btn">Ajouter</button>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; font-size:0.72rem; color:#8b9bb4; margin-bottom:8px;">
                <span>Lien partage: <span id="cloud-share-link" style="color:var(--accent-cyan); word-break:break-all;">${escapeHtml(shareUrl)}</span></span>
                <button type="button" id="cloud-copy-link" class="mini-btn">Copier</button>
            </div>
            <div style="max-height:260px; overflow:auto; padding-right:4px;">${membersHtml || '<div style="color:#777">Aucun membre.</div>'}</div>
        `,
        `
            <button type="button" id="cloud-members-back" class="btn-modal-cancel">Retour</button>
            <button type="button" id="cloud-members-close" class="btn-modal-confirm">Fermer</button>
        `
    );

    const renameBtn = document.getElementById('cloud-rename-board');
    if (renameBtn) {
        renameBtn.onclick = async () => {
            const defaultTitle = String(board.title || 'Board cloud');
            const nextTitleRaw = await customPrompt('RENOMMER BOARD', 'Nouveau nom du board :', defaultTitle);
            if (nextTitleRaw === null) return;

            const nextTitle = String(nextTitleRaw || '').trim();
            if (!nextTitle || nextTitle === defaultTitle) return;

            try {
                await collabBoardRequest('rename_board', { boardId, title: nextTitle });
                if (String(collab.activeBoardId) === String(boardId)) {
                    collab.activeBoardTitle = nextTitle;
                    state.currentFileName = nextTitle;
                    persistCollabState();
                    syncCloudStatus();
                }
                await renderCloudMembers(boardId);
            } catch (e) {
                await customAlert('ERREUR CLOUD', escapeHtml(e.message || 'Erreur inconnue.'));
            }
        };
    }

    const deleteBtn = document.getElementById('cloud-delete-board');
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            const confirmed = await customConfirm('CLOUD', 'Supprimer ce board cloud ?');
            if (!confirmed) return;

            try {
                await collabBoardRequest('delete_board', { boardId });
                if (String(boardId) === String(collab.activeBoardId)) {
                    setActiveCloudBoardFromSummary(null);
                    state.currentFileName = null;
                    setBoardQueryParam('');
                }
                await renderCloudHome();
            } catch (e) {
                await customAlert('ERREUR CLOUD', escapeHtml(e.message || 'Erreur inconnue.'));
            }
        };
    }

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

    const localSaveLocked = isLocalSaveLocked();
    const localPanel = collab.homePanel === 'local' ? 'local' : 'cloud';
    const boardRows = boards.map((board) => {
        const active = board.id === collab.activeBoardId;
        const role = String(board.role || '');

        return `
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin:6px 0; padding:10px; border:1px solid ${active ? 'rgba(115,251,247,0.45)' : 'rgba(255,255,255,0.08)'}; border-radius:10px; background:${active ? 'rgba(115,251,247,0.08)' : 'rgba(0,0,0,0.2)'};">
                <div style="min-width:0; display:flex; flex-direction:column; gap:4px;">
                    <div style="font-size:0.95rem; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(board.title || 'Sans nom')}</div>
                    <div style="font-size:0.72rem; color:#8b9bb4; text-transform:uppercase;">${escapeHtml(role)} · MAP</div>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; flex-shrink:0;">
                    <button type="button" class="mini-btn cloud-open-board" data-board="${escapeHtml(board.id)}">Ouvrir</button>
                    ${role === 'owner' ? `<button type="button" class="mini-btn cloud-manage-board" data-board="${escapeHtml(board.id)}">Gerer</button>` : ''}
                    ${role !== 'owner' ? `<button type="button" class="mini-btn cloud-leave-board" data-board="${escapeHtml(board.id)}">Quitter</button>` : ''}
                </div>
            </div>
        `;
    }).join('');

    const localRows = `
        <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin:6px 0 10px; padding:10px; border:1px solid rgba(115,251,247,0.34); border-radius:10px; background:rgba(115,251,247,0.08);">
            <div style="min-width:0; display:flex; flex-direction:column; gap:4px;">
                <div style="font-size:0.95rem; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(state.currentFileName || 'Session locale')}</div>
                <div style="font-size:0.72rem; color:#8b9bb4; text-transform:uppercase;">local · map</div>
            </div>
            <div style="align-self:center; padding:6px 10px; border:1px solid rgba(115,251,247,0.18); border-radius:999px; background:rgba(115,251,247,0.08); color:var(--accent-cyan); font-size:0.7rem; letter-spacing:1.2px; text-transform:uppercase; white-space:nowrap;">Actions locales</div>
        </div>
        ${localSaveLocked ? '<div style="margin:0 0 8px; padding:10px 12px; border-radius:10px; border:1px dashed rgba(255, 204, 138, 0.18); background:rgba(3, 10, 24, 0.6); color:#ffd8a4; font-size:0.74rem; line-height:1.45;">Mode partage: les exports locaux sont bloques pour les membres non lead.</div>' : ''}
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px;">
            <button type="button" class="data-hub-card data-hub-card-local" data-local-action="open-file">
                <span class="data-hub-card-title">Ouvrir</span>
                <span class="data-hub-card-meta">JSON</span>
            </button>
            <button type="button" class="data-hub-card data-hub-card-local ${localSaveLocked ? 'is-disabled-visual' : ''}" data-local-action="save-file">
                <span class="data-hub-card-title">Sauvegarder</span>
                <span class="data-hub-card-meta">JSON</span>
            </button>
            <button type="button" class="data-hub-card data-hub-card-local ${localSaveLocked ? 'is-disabled-visual' : ''}" data-local-action="save-text">
                <span class="data-hub-card-title">Copier JSON</span>
                <span class="data-hub-card-meta">Texte</span>
            </button>
            <button type="button" class="data-hub-card data-hub-card-local" data-local-action="merge-file">
                <span class="data-hub-card-title">Fusionner</span>
                <span class="data-hub-card-meta">Fichier</span>
            </button>
            <button type="button" class="data-hub-card data-hub-card-danger" data-local-action="reset-all">
                <span class="data-hub-card-title">Reset</span>
            </button>
        </div>
    `;
    const panelBody = localPanel === 'local'
        ? localRows
        : (boardRows || '<div style="padding:18px 0; color:#8b9bb4;">Aucun board map cloud.</div>');

    openCloudModal(
        'CLOUD COLLABORATIF',
        `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; padding-bottom:10px; border-bottom:2px solid rgba(115,251,247,0.32);">
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button type="button" id="cloud-home-tab-cloud" class="mini-btn" style="opacity:${localPanel === 'cloud' ? '1' : '0.58'};">Cloud</button>
                    <button type="button" id="cloud-home-tab-local" class="mini-btn" style="opacity:${localPanel === 'local' ? '1' : '0.58'};">Local</button>
                </div>
                <button type="button" id="cloud-modal-close-x" class="mini-btn" style="min-width:38px;">×</button>
            </div>
            <div style="max-height:320px; overflow:auto; padding-right:4px;">${panelBody}</div>
            <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-top:10px; color:#9bb0c7; font-size:0.82rem;">
                <span>Connecte: ${escapeHtml(collab.user.username || '')}</span>
                <span style="color:${isCloudBoardActive() ? 'var(--accent-cyan)' : '#9bb0c7'};">
                ${isCloudBoardActive() ? `Board actif: ${escapeHtml(collab.activeBoardTitle || collab.activeBoardId)} (${escapeHtml(collab.activeRole || '')})` : 'Aucun board cloud actif'}
                </span>
            </div>
        `,
        localPanel === 'cloud'
            ? `
                <button type="button" id="cloud-create-board" class="btn-modal-confirm">Nouveau</button>
                <button type="button" id="cloud-save-active" class="btn-modal-cancel">Sauver</button>
                <button type="button" id="cloud-logout" class="btn-modal-cancel">Deconnexion</button>
            `
            : `<button type="button" id="cloud-logout" class="btn-modal-cancel">Deconnexion</button>`
    );

    const saveActiveBtn = document.getElementById('cloud-save-active');
    if (saveActiveBtn && (!isCloudBoardActive() || !canEditCloudBoard())) {
        saveActiveBtn.disabled = true;
        saveActiveBtn.style.opacity = '0.45';
        saveActiveBtn.title = isCloudBoardActive() ? 'Droits insuffisants' : 'Aucun board actif';
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

    const logoutBtn = document.getElementById('cloud-logout');
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            await logoutCollab();
            await renderCloudHome();
        };
    }

    const closeBtn = document.getElementById('cloud-modal-close-x');
    if (closeBtn) closeBtn.onclick = () => closeCloudModal();

    const tabCloud = document.getElementById('cloud-home-tab-cloud');
    if (tabCloud) {
        tabCloud.onclick = () => {
            collab.homePanel = 'cloud';
            renderCloudHome().catch(() => {});
        };
    }

    const tabLocal = document.getElementById('cloud-home-tab-local');
    if (tabLocal) {
        tabLocal.onclick = () => {
            collab.homePanel = 'local';
            renderCloudHome().catch(() => {});
        };
    }

    Array.from(document.querySelectorAll('[data-local-action]')).forEach((btn) => {
        btn.onclick = async () => {
            const action = btn.getAttribute('data-local-action') || '';

            if (action === 'open-file') {
                closeCloudModal();
                window.setTimeout(() => {
                    document.getElementById('fileImport')?.click();
                }, 40);
                return;
            }
            if (action === 'save-file') {
                await saveLocalMapSnapshot();
                return;
            }
            if (action === 'save-text') {
                await copyLocalMapSnapshot();
                return;
            }
            if (action === 'merge-file') {
                closeCloudModal();
                window.setTimeout(() => {
                    document.getElementById('fileMerge')?.click();
                }, 40);
                return;
            }
            if (action === 'reset-all') {
                closeCloudModal();
                window.setTimeout(() => {
                    document.getElementById('btnResetMap')?.click();
                }, 40);
            }
        };
    });

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
    collab.homePanel = 'cloud';
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
