import { state, saveState, scheduleSave, ensureLinkIds, nodeById, isPerson, isCompany, isGroup, undo, pushHistory, setLocalPersistenceEnabled, isLocalPersistenceEnabled } from './state.js';
import { ensureNode, addLink as logicAddLink, calculatePath, clearPath, calculateHVT, updatePersonColors } from './logic.js';
import { renderPathfindingSidebar } from './templates.js';
import { restartSim } from './physics.js';
import { draw, updateDegreeCache, resizeCanvas } from './render.js';
import { escapeHtml, linkKindEmoji, kindToLabel, clamp, uid, sanitizeNodeColor, normalizePersonStatus } from './utils.js';
import { TYPES, FILTERS, FILTER_RULES, KINDS, PERSON_STATUS } from './constants.js';
import { injectStyles } from './styles.js';
import { setupCanvasEvents } from './interaction.js';
import { showSettings, showContextMenu, hideContextMenu } from './ui-settings.js';
import { renderEditor } from './ui-editor.js';
import { computeLinkSuggestions, getAllowedKinds } from './intel.js';
import { generateExportData, buildExportFilename, downloadExportData } from './data-transfer.js';

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
const POINT_LOCAL_CHANGE_EVENT = 'bni:point-local-change';
const ACTION_LOG_STORAGE_KEY = 'bniLinkedActionLog_v1';
const ACTION_LOG_MAX = 80;
const COLLAB_NODE_FIELDS = ['name', 'type', 'color', 'manualColor', 'personStatus', 'num', 'accountNumber', 'citizenNumber', 'linkedMapPointId', 'description', 'notes', 'x', 'y', 'fixed'];
const COLLAB_LINK_FIELDS = ['source', 'target', 'kind'];
const COLLAB_PRESENCE_HEARTBEAT_MS = 4200;
const COLLAB_PRESENCE_RETRY_MS = 2200;
const COLLAB_SESSION_HEARTBEAT_MS = 12000;
const COLLAB_SESSION_RETRY_MS = 5000;

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
    saveInFlight: false,
    lastSavedFingerprint: '',
    localChangeSeq: 0,
    lastSavedChangeSeq: 0,
    shadowData: null,
    suppressAutosave: 0,
    presence: [],
    presenceTimer: null,
    presenceLoopToken: 0,
    presenceInFlight: false,
    syncState: 'idle',
    syncLabel: 'Local',
    sessionTimer: null,
    sessionLoopToken: 0,
    sessionInFlight: false,
    homePanel: 'cloud'
};

const COLLAB_AUTOSAVE_DEBOUNCE_MS = 380;
const COLLAB_AUTOSAVE_RETRY_MS = 250;
const COLLAB_WATCH_TIMEOUT_MS = 3600;
const COLLAB_WATCH_RETRY_MIN_MS = 300;
const COLLAB_WATCH_RETRY_MAX_MS = 4000;

let actionLogs = [];
const INTEL_PRESETS = {
    quick: {
        mode: 'serieux',
        minScore: 0.5,
        noveltyRatio: 0.12,
        limit: 8,
        sources: { graph: true, text: true, tags: true, profile: true, bridge: false, lex: false, geo: false }
    },
    balanced: {
        mode: 'decouverte',
        minScore: 0.35,
        noveltyRatio: 0.25,
        limit: 12,
        sources: { graph: true, text: true, tags: true, profile: true, bridge: true, lex: true, geo: true }
    },
    wide: {
        mode: 'creatif',
        minScore: 0.24,
        noveltyRatio: 0.45,
        limit: 20,
        sources: { graph: true, text: true, tags: true, profile: true, bridge: true, lex: true, geo: true }
    }
};

function sanitizeLogText(value, fallback = '') {
    const compact = String(value || '').replace(/\s+/g, ' ').trim();
    if (!compact) return fallback;
    if (compact.length > 120) return `${compact.slice(0, 117)}...`;
    return compact;
}

function nodeTypeLabel(type) {
    if (type === TYPES.PERSON) return 'Personne';
    if (type === TYPES.GROUP) return 'Groupe';
    if (type === TYPES.COMPANY) return 'Entreprise';
    return 'Point';
}

function formatLogTime(ts) {
    const date = new Date(Number(ts) || Date.now());
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

function hydrateActionLogs() {
    try {
        const raw = localStorage.getItem(ACTION_LOG_STORAGE_KEY);
        if (!raw) {
            actionLogs = [];
            return;
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            actionLogs = [];
            return;
        }
        actionLogs = parsed
            .map((item) => ({
                text: sanitizeLogText(item?.text || ''),
                at: Number(item?.at) || Date.now()
            }))
            .filter((item) => Boolean(item.text))
            .slice(0, ACTION_LOG_MAX);
    } catch (e) {
        actionLogs = [];
    }
}

function persistActionLogs() {
    try {
        localStorage.setItem(ACTION_LOG_STORAGE_KEY, JSON.stringify(actionLogs.slice(0, ACTION_LOG_MAX)));
    } catch (e) {}
}

function renderActionLogs() {
    const list = document.getElementById('action-log-list');
    if (!list) return;

    if (!actionLogs.length) {
        list.innerHTML = '<div class="action-log-empty">En attente d\'actions...</div>';
        return;
    }

    list.innerHTML = actionLogs.slice(0, 10).map((entry) => `
        <div class="action-log-row">
            <span class="action-log-time">${escapeHtml(formatLogTime(entry.at))}</span>
            <span class="action-log-text">${escapeHtml(entry.text)}</span>
        </div>
    `).join('');
}

function resolveActionActor(preferred = '') {
    const collabName = sanitizeLogText(collab.user?.username || '', '');
    if (collabName) return collabName;
    const preferredName = sanitizeLogText(preferred, '');
    if (preferredName) return preferredName;
    const selected = nodeById(state.selection);
    const selectedName = sanitizeLogText(selected?.name || '', '');
    if (selectedName) return selectedName;
    return 'Operateur';
}

export function appendActionLog(message, options = {}) {
    const text = sanitizeLogText(message, '');
    if (!text) return false;

    const now = Date.now();
    const latest = actionLogs[0];
    const dedupeWindowMs = Math.max(400, Number(options?.dedupeWindowMs) || 1300);
    if (latest && latest.text === text && (now - Number(latest.at || 0)) < dedupeWindowMs) {
        return false;
    }

    actionLogs.unshift({ text, at: now });
    if (actionLogs.length > ACTION_LOG_MAX) actionLogs = actionLogs.slice(0, ACTION_LOG_MAX);
    persistActionLogs();
    renderActionLogs();
    return true;
}

export function logNodeAdded(nodeName, actor = '') {
    const cleanNode = sanitizeLogText(nodeName, 'Point');
    const cleanActor = resolveActionActor(actor);
    const detailText = `a ajoute le point ${cleanNode}`;
    return appendActionLog(`${cleanActor} ${detailText}`);
}

function logNodesConnected(sourceNode, targetNode, actor = '') {
    if (!sourceNode || !targetNode) return false;
    const cleanActor = resolveActionActor(actor);
    const sourceName = sanitizeLogText(sourceNode.name || '', 'Source');
    const targetName = sanitizeLogText(targetNode.name || '', 'Cible');
    const detailText = `a ajoute la liaison entre ${sourceName} et ${targetName}`;
    return appendActionLog(`${cleanActor} ${detailText}`);
}

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
    const currentSyncState = collab.syncState || (collab.user ? (isCloudBoardActive() ? 'live' : 'session') : 'local');
    if (!statusEl) {
        syncCloudLivePanels();
        return;
    }

    const renderStatus = (stateName, label, value = '') => {
        statusEl.dataset.state = stateName;
        if (!value) {
            statusEl.innerHTML = `<span class="cloud-status-solo">${escapeHtml(label)}</span>`;
            return;
        }
        statusEl.innerHTML = `
            <span class="cloud-status-label">${escapeHtml(label)}</span>
            <span class="cloud-status-value">${escapeHtml(String(value || '').toUpperCase())}</span>
        `;
    };

    if (!collab.user) {
        statusEl.dataset.syncState = 'local';
        renderStatus('local', 'Local');
        syncCloudLivePanels();
        return;
    }

    if (collab.activeBoardId) {
        const label = collab.activeRole === 'owner' ? 'Lead' : 'Board';
        const value = collab.activeBoardTitle || collab.activeRole || 'Cloud';
        statusEl.dataset.syncState = currentSyncState;
        renderStatus('board', label, value);
        syncCloudLivePanels();
        return;
    }

    statusEl.dataset.syncState = 'session';
    renderStatus('session', 'Session', collab.user.username);
    syncCloudLivePanels();
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

function collabTimeValue(value) {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

function cloneJson(value, fallback = null) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (e) {
        return fallback;
    }
}

function normalizeCloudNode(rawNode) {
    if (!rawNode || typeof rawNode !== 'object') return null;
    const id = rawNode.id ?? '';
    if (id === '') return null;
    return {
        id,
        name: String(rawNode.name || '').trim(),
        type: String(rawNode.type || TYPES.PERSON),
        color: sanitizeNodeColor(String(rawNode.color || '')),
        manualColor: Boolean(rawNode.manualColor),
        personStatus: normalizePersonStatus(rawNode.personStatus, rawNode.type || TYPES.PERSON),
        num: String(rawNode.num || ''),
        accountNumber: String(rawNode.accountNumber || ''),
        citizenNumber: String(rawNode.citizenNumber || ''),
        linkedMapPointId: String(rawNode.linkedMapPointId || ''),
        description: String(rawNode.description || rawNode.notes || ''),
        notes: String(rawNode.notes || rawNode.description || ''),
        x: Number(rawNode.x) || 0,
        y: Number(rawNode.y) || 0,
        fixed: Boolean(rawNode.fixed)
    };
}

function normalizeCloudLink(rawLink) {
    if (!rawLink || typeof rawLink !== 'object') return null;
    const id = rawLink.id ?? '';
    if (id === '') return null;
    const source = rawLink.source && typeof rawLink.source === 'object' ? rawLink.source.id : rawLink.source;
    const target = rawLink.target && typeof rawLink.target === 'object' ? rawLink.target.id : rawLink.target;
    const sourceId = String(source ?? '');
    const targetId = String(target ?? '');
    if (!sourceId || !targetId || sourceId === targetId) return null;
    return {
        id,
        source: sourceId,
        target: targetId,
        kind: String(rawLink.kind || 'relation')
    };
}

function normalizeCloudEntityMeta(rawMeta, fields, fallbackUpdatedAt = '', fallbackUser = '') {
    const meta = rawMeta && typeof rawMeta === 'object' ? rawMeta : {};
    const fieldTimes = {};
    fields.forEach((field) => {
        fieldTimes[field] = String(meta.fieldTimes?.[field] || meta[field] || fallbackUpdatedAt || '');
    });
    return {
        updatedAt: String(meta.updatedAt || fallbackUpdatedAt || ''),
        updatedBy: String(meta.updatedBy || fallbackUser || ''),
        fieldTimes
    };
}

function normalizeCloudDeletedEntries(list, fallbackUpdatedAt = '', fallbackUser = '') {
    const latest = new Map();
    const source = Array.isArray(list) ? list : [];
    source.forEach((row) => {
        const id = String(row?.id ?? '').trim();
        if (!id) return;
        const next = {
            id,
            deletedAt: String(row?.deletedAt || fallbackUpdatedAt || ''),
            deletedBy: String(row?.deletedBy || fallbackUser || '')
        };
        const prev = latest.get(id);
        if (!prev || collabTimeValue(next.deletedAt) >= collabTimeValue(prev.deletedAt)) {
            latest.set(id, next);
        }
    });
    return [...latest.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function normalizeCloudBoardData(rawData, options = {}) {
    const fallbackUpdatedAt = String(options.fallbackUpdatedAt || collab.activeBoardUpdatedAt || '');
    const fallbackUser = String(options.fallbackUser || collab.user?.username || '');
    const raw = rawData && typeof rawData === 'object' ? rawData : {};
    const nodes = (Array.isArray(raw.nodes) ? raw.nodes : [])
        .map((node) => {
            const normalized = normalizeCloudNode(node);
            if (!normalized) return null;
            return {
                ...normalized,
                _collab: normalizeCloudEntityMeta(node?._collab, COLLAB_NODE_FIELDS, fallbackUpdatedAt, fallbackUser)
            };
        })
        .filter(Boolean)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const links = (Array.isArray(raw.links) ? raw.links : [])
        .map((link) => {
            const normalized = normalizeCloudLink(link);
            if (!normalized) return null;
            return {
                ...normalized,
                _collab: normalizeCloudEntityMeta(link?._collab, COLLAB_LINK_FIELDS, fallbackUpdatedAt, fallbackUser)
            };
        })
        .filter(Boolean)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return {
        meta: raw.meta && typeof raw.meta === 'object' ? { ...raw.meta } : {},
        physicsSettings: raw.physicsSettings && typeof raw.physicsSettings === 'object'
            ? cloneJson(raw.physicsSettings, {})
            : {},
        nodes,
        links,
        deletedNodes: normalizeCloudDeletedEntries(raw.deletedNodes, fallbackUpdatedAt, fallbackUser),
        deletedLinks: normalizeCloudDeletedEntries(raw.deletedLinks, fallbackUpdatedAt, fallbackUser),
        _collab: normalizeCloudEntityMeta(raw._collab, ['physicsSettings'], fallbackUpdatedAt, fallbackUser)
    };
}

function buildCloudEntityMeta(currentEntity, shadowEntity, fields, nowIso, actor) {
    const shadowMeta = normalizeCloudEntityMeta(shadowEntity?._collab, fields, shadowEntity?._collab?.updatedAt || '', shadowEntity?._collab?.updatedBy || actor);
    const fieldTimes = {};
    let changed = !shadowEntity;

    fields.forEach((field) => {
        const nextValue = currentEntity ? currentEntity[field] : undefined;
        const prevValue = shadowEntity ? shadowEntity[field] : undefined;
        const sameValue = JSON.stringify(nextValue) === JSON.stringify(prevValue);
        if (!shadowEntity || !sameValue) {
            fieldTimes[field] = nowIso;
            changed = true;
        } else {
            fieldTimes[field] = String(shadowMeta.fieldTimes[field] || shadowMeta.updatedAt || nowIso);
        }
    });

    return {
        updatedAt: changed ? nowIso : String(shadowMeta.updatedAt || nowIso),
        updatedBy: changed ? actor : String(shadowMeta.updatedBy || actor),
        fieldTimes
    };
}

function buildCloudBoardPayload() {
    const plain = generateExportData();
    const shadow = normalizeCloudBoardData(collab.shadowData, {
        fallbackUpdatedAt: collab.activeBoardUpdatedAt || '',
        fallbackUser: collab.user?.username || ''
    });
    const nowIso = new Date().toISOString();
    const actor = sanitizeLogText(collab.user?.username || '', 'operateur');
    const shadowNodeMap = new Map(shadow.nodes.map((node) => [String(node.id), node]));
    const shadowLinkMap = new Map(shadow.links.map((link) => [String(link.id), link]));
    const currentNodes = plain.nodes.map((node) => normalizeCloudNode(node)).filter(Boolean);
    const currentLinks = plain.links.map((link) => normalizeCloudLink(link)).filter(Boolean);
    const currentNodeIds = new Set(currentNodes.map((node) => String(node.id)));
    const currentLinkIds = new Set(currentLinks.map((link) => String(link.id)));
    const deletedNodeMap = new Map((shadow.deletedNodes || []).map((entry) => [String(entry.id), entry]));
    const deletedLinkMap = new Map((shadow.deletedLinks || []).map((entry) => [String(entry.id), entry]));

    const nodes = currentNodes.map((node) => {
        deletedNodeMap.delete(String(node.id));
        return {
            ...node,
            _collab: buildCloudEntityMeta(node, shadowNodeMap.get(String(node.id)), COLLAB_NODE_FIELDS, nowIso, actor)
        };
    });

    shadow.nodes.forEach((node) => {
        const key = String(node.id);
        if (currentNodeIds.has(key)) return;
        deletedNodeMap.set(key, {
            id: node.id,
            deletedAt: nowIso,
            deletedBy: actor
        });
    });

    const links = currentLinks.map((link) => {
        deletedLinkMap.delete(String(link.id));
        return {
            ...link,
            _collab: buildCloudEntityMeta(link, shadowLinkMap.get(String(link.id)), COLLAB_LINK_FIELDS, nowIso, actor)
        };
    });

    shadow.links.forEach((link) => {
        const key = String(link.id);
        if (currentLinkIds.has(key)) return;
        deletedLinkMap.set(key, {
            id: link.id,
            deletedAt: nowIso,
            deletedBy: actor
        });
    });

    const currentPhysics = plain.physicsSettings && typeof plain.physicsSettings === 'object'
        ? cloneJson(plain.physicsSettings, {})
        : {};
    const shadowPhysics = shadow.physicsSettings && typeof shadow.physicsSettings === 'object'
        ? shadow.physicsSettings
        : {};
    const samePhysics = JSON.stringify(currentPhysics) === JSON.stringify(shadowPhysics);
    const shadowBoardMeta = normalizeCloudEntityMeta(shadow._collab, ['physicsSettings'], collab.activeBoardUpdatedAt || '', actor);

    return {
        meta: {
            ...(plain.meta || {}),
            projectName: state.projectName || plain.meta?.projectName || shadow.meta?.projectName || ''
        },
        physicsSettings: currentPhysics,
        nodes,
        links,
        deletedNodes: [...deletedNodeMap.values()].sort((a, b) => String(a.id).localeCompare(String(b.id))),
        deletedLinks: [...deletedLinkMap.values()].sort((a, b) => String(a.id).localeCompare(String(b.id))),
        _collab: {
            updatedAt: samePhysics ? String(shadowBoardMeta.updatedAt || nowIso) : nowIso,
            updatedBy: samePhysics ? String(shadowBoardMeta.updatedBy || actor) : actor,
            fieldTimes: {
                physicsSettings: samePhysics
                    ? String(shadowBoardMeta.fieldTimes.physicsSettings || shadowBoardMeta.updatedAt || nowIso)
                    : nowIso
            }
        }
    };
}

function extractPlainPointPayloadFromCloud(rawData) {
    const normalized = normalizeCloudBoardData(rawData, {
        fallbackUpdatedAt: collab.activeBoardUpdatedAt || '',
        fallbackUser: collab.user?.username || ''
    });
    const deletedNodeMap = new Map(normalized.deletedNodes.map((entry) => [String(entry.id), entry]));
    const nodes = normalized.nodes
        .filter((node) => {
            const tombstone = deletedNodeMap.get(String(node.id));
            if (!tombstone) return true;
            return collabTimeValue(node?._collab?.updatedAt) > collabTimeValue(tombstone.deletedAt);
        })
        .map((node) => ({
            id: node.id,
            name: node.name,
            type: node.type,
            color: node.color,
            manualColor: Boolean(node.manualColor),
            personStatus: normalizePersonStatus(node.personStatus, node.type),
            num: node.num,
            accountNumber: node.accountNumber,
            citizenNumber: node.citizenNumber,
            linkedMapPointId: String(node.linkedMapPointId || ''),
            description: node.description,
            notes: node.notes,
            x: node.x,
            y: node.y,
            fixed: node.fixed
        }));
    const nodeIds = new Set(nodes.map((node) => String(node.id)));
    const deletedLinkMap = new Map(normalized.deletedLinks.map((entry) => [String(entry.id), entry]));
    const linkSigs = new Set();
    const links = normalized.links
        .filter((link) => {
            const tombstone = deletedLinkMap.get(String(link.id));
            if (tombstone && collabTimeValue(link?._collab?.updatedAt) <= collabTimeValue(tombstone.deletedAt)) return false;
            return nodeIds.has(String(link.source)) && nodeIds.has(String(link.target));
        })
        .filter((link) => {
            const a = String(link.source);
            const b = String(link.target);
            const pair = a < b ? `${a}|${b}` : `${b}|${a}`;
            const sig = `${pair}|${String(link.kind || '')}`;
            if (linkSigs.has(sig)) return false;
            linkSigs.add(sig);
            return true;
        })
        .map((link) => ({
            id: link.id,
            source: link.source,
            target: link.target,
            kind: link.kind
        }));
    return {
        meta: normalized.meta && typeof normalized.meta === 'object' ? { ...normalized.meta } : {},
        physicsSettings: normalized.physicsSettings && typeof normalized.physicsSettings === 'object'
            ? cloneJson(normalized.physicsSettings, {})
            : {},
        nodes,
        links
    };
}

function setCloudShadowData(rawData) {
    collab.shadowData = normalizeCloudBoardData(rawData, {
        fallbackUpdatedAt: collab.activeBoardUpdatedAt || '',
        fallbackUser: collab.user?.username || ''
    });
}

function withoutCloudAutosave(fn) {
    collab.suppressAutosave += 1;
    try {
        return fn();
    } finally {
        collab.suppressAutosave = Math.max(0, collab.suppressAutosave - 1);
    }
}

function setCloudSyncState(nextState, label = '') {
    collab.syncState = nextState;
    collab.syncLabel = label || ({
        local: 'Local',
        session: 'Session cloud',
        live: 'Synchro live active',
        pending: 'Modifs locales en attente',
        saving: 'Enregistrement cloud...',
        syncing: 'Mise a jour distante...',
        merged: 'Fusion auto appliquee',
        error: 'Sync en attente'
    }[nextState] || 'Cloud');
    syncCloudStatus();
}

function updateCollabPresence(rawPresence = []) {
    const deduped = new Map();
    (Array.isArray(rawPresence) ? rawPresence : []).forEach((row) => {
        const userId = String(row?.userId || '').trim();
        if (!userId) return;
        deduped.set(userId, {
            userId,
            username: String(row?.username || 'operateur'),
            role: String(row?.role || ''),
            activeNodeId: String(row?.activeNodeId || ''),
            activeNodeName: String(row?.activeNodeName || ''),
            mode: String(row?.mode || 'editing'),
            lastAt: String(row?.lastAt || ''),
            isSelf: userId === String(collab.user?.id || '')
        });
    });
    collab.presence = [...deduped.values()].sort((a, b) => {
        if (a.isSelf && !b.isSelf) return -1;
        if (!a.isSelf && b.isSelf) return 1;
        return String(a.username || '').localeCompare(String(b.username || ''));
    });
    syncCloudStatus();
}

function renderCloudPresenceChips(entries = [], options = {}) {
    const includeSelf = Boolean(options.includeSelf);
    const visible = entries.filter((entry) => includeSelf || !entry.isSelf).slice(0, 4);
    if (!visible.length) return '';
    return visible.map((entry) => {
        const initials = String(entry.username || '?').slice(0, 2).toUpperCase();
        const label = entry.isSelf ? 'toi' : entry.username;
        const detail = entry.activeNodeName ? `Fiche ${entry.activeNodeName}` : (entry.mode === 'viewing' ? 'Lecture' : 'Edition');
        return `
            <div class="cloud-presence-pill${entry.isSelf ? ' is-self' : ''}">
                <span class="cloud-presence-avatar">${escapeHtml(initials)}</span>
                <span class="cloud-presence-copy">
                    <span class="cloud-presence-name">${escapeHtml(label)}</span>
                    <span class="cloud-presence-detail">${escapeHtml(detail)}</span>
                </span>
            </div>
        `;
    }).join('');
}

function syncCloudLivePanels() {
    const liveInfoEl = document.getElementById('cloudLiveInfo');
    const syncInfoEl = document.getElementById('cloudSyncInfo');
    const presenceEl = document.getElementById('cloudPresence');
    const modalSyncEl = document.getElementById('cloudModalSyncInfo');
    const modalPresenceEl = document.getElementById('cloudModalPresence');
    const otherUsers = collab.presence.filter((entry) => !entry.isSelf);
    const presenceLabel = otherUsers.length
        ? `${otherUsers.length} operateur${otherUsers.length > 1 ? 's' : ''} actif${otherUsers.length > 1 ? 's' : ''}`
        : (isCloudBoardActive() ? 'Aucun autre operateur detecte' : '');

    if (liveInfoEl) {
        liveInfoEl.hidden = !collab.user;
    }
    if (syncInfoEl) {
        syncInfoEl.textContent = collab.syncLabel || 'Cloud';
        syncInfoEl.dataset.state = collab.syncState || 'idle';
    }
    if (presenceEl) {
        presenceEl.innerHTML = isCloudBoardActive()
            ? (renderCloudPresenceChips(collab.presence, { includeSelf: false }) || `<div class="cloud-presence-empty">${escapeHtml(presenceLabel || 'Board prive')}</div>`)
            : '';
    }
    if (modalSyncEl) {
        modalSyncEl.textContent = collab.syncLabel || 'Cloud';
        modalSyncEl.className = isCloudBoardActive() ? 'cloud-status-active' : '';
        modalSyncEl.dataset.state = collab.syncState || 'idle';
    }
    if (modalPresenceEl) {
        modalPresenceEl.innerHTML = isCloudBoardActive()
            ? (renderCloudPresenceChips(collab.presence, { includeSelf: true }) || `<div class="cloud-presence-empty">${escapeHtml(presenceLabel || 'Board prive')}</div>`)
            : `<div class="cloud-presence-empty">Session cloud ouverte</div>`;
    }
}

function applyCloudBoardData(rawData, options = {}) {
    const quiet = Boolean(options.quiet);
    const plain = extractPlainPointPayloadFromCloud(rawData);
    withoutCloudAutosave(() => processData(plain, 'load', { silent: true }));
    setCloudShadowData(rawData);
    if (typeof options.projectName === 'string') {
        state.projectName = options.projectName;
    }
    captureCloudSavedState();
    if (state.selection && !nodeById(state.selection)) state.selection = null;
    renderEditor();
    updatePathfindingPanel();
    refreshHvt();
    draw();
    if (!quiet) {
        appendActionLog('sync live: board mis a jour');
    }
}

function fingerprintFromPointPayload(payload) {
    const normalizedMeta = payload?.meta && typeof payload.meta === 'object'
        ? { ...payload.meta, date: '' }
        : { date: '' };
    return JSON.stringify({
        ...payload,
        meta: normalizedMeta
    });
}

function captureCloudSavedState(changeSeq = collab.localChangeSeq) {
    const targetSeq = Math.max(0, Number(changeSeq) || 0);
    collab.lastSavedFingerprint = '';
    collab.lastSavedChangeSeq = Math.max(
        collab.lastSavedChangeSeq,
        Math.min(collab.localChangeSeq, targetSeq)
    );
    return collab.lastSavedChangeSeq;
}

function hasLocalCloudChanges() {
    if (!isCloudBoardActive()) return false;
    return collab.localChangeSeq !== collab.lastSavedChangeSeq;
}

function stopCollabAutosave() {
    if (collab.autosaveDebounceTimer) {
        clearTimeout(collab.autosaveDebounceTimer);
        collab.autosaveDebounceTimer = null;
    }
}

async function flushPendingCloudAutosave(boardId = collab.activeBoardId) {
    const targetBoardId = String(boardId || '').trim();
    if (!targetBoardId) return false;
    if (String(collab.activeBoardId || '') !== targetBoardId) return false;
    if (!canEditCloudBoard()) return false;

    let waitCount = 0;
    while (collab.saveInFlight && waitCount < 20) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        waitCount += 1;
    }

    const hadDebounce = Boolean(collab.autosaveDebounceTimer);
    const hasChanges = hasLocalCloudChanges();
    if (!hadDebounce && !hasChanges) return false;

    stopCollabAutosave();
    return saveActiveCloudBoard({ manual: false, quiet: true, force: true });
}

function queueCloudAutosave(delayMs = COLLAB_AUTOSAVE_DEBOUNCE_MS) {
    if (!isCloudBoardActive() || !canEditCloudBoard()) return;
    stopCollabAutosave();
    setCloudSyncState('pending');
    collab.autosaveDebounceTimer = setTimeout(() => {
        collab.autosaveDebounceTimer = null;
        saveActiveCloudBoard({ manual: false, quiet: true }).catch(() => {});
    }, Math.max(0, Number(delayMs) || 0));
}

function onPointLocalChange() {
    if (collab.suppressAutosave > 0) return;
    collab.localChangeSeq += 1;
    queueCloudAutosave();
}

function ensureCollabAutosaveListener() {
    if (collab.autosaveListenerBound) return;
    collab.autosaveListenerBound = true;
    window.addEventListener(POINT_LOCAL_CHANGE_EVENT, onPointLocalChange);
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
    collab.syncLoopToken += 1;
    collab.syncLoopRunning = false;
    collab.syncRetryMs = 0;
    if (collab.syncTimer) {
        clearTimeout(collab.syncTimer);
        collab.syncTimer = null;
    }
}

function stopCollabPresence() {
    collab.presenceLoopToken += 1;
    collab.presenceInFlight = false;
    if (collab.presenceTimer) {
        clearTimeout(collab.presenceTimer);
        collab.presenceTimer = null;
    }
}

function stopCollabSessionHeartbeat() {
    collab.sessionLoopToken += 1;
    collab.sessionInFlight = false;
    if (collab.sessionTimer) {
        clearTimeout(collab.sessionTimer);
        collab.sessionTimer = null;
    }
}

function scheduleNextSessionHeartbeat(loopToken, delayMs = COLLAB_SESSION_HEARTBEAT_MS) {
    if (collab.sessionLoopToken !== loopToken) return;
    if (collab.sessionTimer) clearTimeout(collab.sessionTimer);
    collab.sessionTimer = setTimeout(() => {
        collab.sessionTimer = null;
        runCollabSessionHeartbeat(loopToken).catch(() => {});
    }, Math.max(0, Number(delayMs) || 0));
}

async function runCollabSessionHeartbeat(loopToken = collab.sessionLoopToken) {
    if (collab.sessionLoopToken !== loopToken) return;
    if (!collab.token || !collab.user) return;
    if (collab.sessionInFlight) return;

    collab.sessionInFlight = true;
    try {
        const res = await collabAuthRequest('me');
        collab.user = res.user || collab.user;
        persistCollabState();
        syncCloudStatus();
        scheduleNextSessionHeartbeat(loopToken, COLLAB_SESSION_HEARTBEAT_MS);
    } catch (e) {
        if (collab.sessionLoopToken !== loopToken) return;
        const status = Number(e?.status || 0);
        if (status === 401 || status === 403) {
            await logoutCollab();
            return;
        }
        scheduleNextSessionHeartbeat(loopToken, COLLAB_SESSION_RETRY_MS);
    } finally {
        collab.sessionInFlight = false;
    }
}

function startCollabSessionHeartbeat() {
    stopCollabSessionHeartbeat();
    if (!collab.token || !collab.user) return;
    const loopToken = collab.sessionLoopToken + 1;
    collab.sessionLoopToken = loopToken;
    scheduleNextSessionHeartbeat(loopToken, 0);
}

function scheduleNextPresenceTick(loopToken, delayMs = COLLAB_PRESENCE_HEARTBEAT_MS) {
    if (collab.presenceLoopToken !== loopToken) return;
    if (collab.presenceTimer) clearTimeout(collab.presenceTimer);
    collab.presenceTimer = setTimeout(() => {
        collab.presenceTimer = null;
        touchCollabPresence(loopToken).catch(() => {});
    }, Math.max(0, Number(delayMs) || 0));
}

async function clearCollabPresence(boardId = collab.activeBoardId) {
    const targetBoardId = String(boardId || '').trim();
    if (!targetBoardId || !collab.token) return;
    try {
        await collabBoardRequest('clear_presence', { boardId: targetBoardId });
    } catch (e) {}
}

async function touchCollabPresence(loopToken = collab.presenceLoopToken, options = {}) {
    if (collab.presenceLoopToken !== loopToken && !options.force) return;
    if (!isCloudBoardActive() || !collab.user || !collab.token) return;
    if (collab.presenceInFlight && !options.force) return;

    collab.presenceInFlight = true;
    try {
        const selected = nodeById(state.selection);
        const response = await collabBoardRequest('touch_presence', {
            boardId: collab.activeBoardId,
            activeNodeId: state.selection || '',
            activeNodeName: selected?.name || '',
            mode: canEditCloudBoard() ? 'editing' : 'viewing'
        });
        updateCollabPresence(response?.presence || []);
        scheduleNextPresenceTick(loopToken, COLLAB_PRESENCE_HEARTBEAT_MS);
    } catch (e) {
        scheduleNextPresenceTick(loopToken, COLLAB_PRESENCE_RETRY_MS);
    } finally {
        collab.presenceInFlight = false;
    }
}

function startCollabPresence() {
    stopCollabPresence();
    if (!isCloudBoardActive() || !collab.user || !collab.token) {
        updateCollabPresence([]);
        return;
    }
    const loopToken = collab.presenceLoopToken + 1;
    collab.presenceLoopToken = loopToken;
    scheduleNextPresenceTick(loopToken, 0);
}

function scheduleNextWatchTick(loopToken, delayMs = 0) {
    if (collab.syncLoopToken !== loopToken) return;
    if (collab.syncTimer) clearTimeout(collab.syncTimer);
    collab.syncTimer = setTimeout(() => {
        collab.syncTimer = null;
        runCollabWatchLoop(loopToken).catch(() => {});
    }, Math.max(0, Number(delayMs) || 0));
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
        updateCollabPresence(watch?.presence || []);
        if (!collab.saveInFlight && !hasLocalCloudChanges()) {
            setCloudSyncState(canEditCloudBoard() ? 'live' : 'session', canEditCloudBoard() ? 'Synchro live active' : 'Lecture live active');
        }

        if (watch?.deleted || watch?.revoked) {
            setActiveCloudBoardFromSummary(null);
            setBoardQueryParam('');
            appendActionLog('cloud: board indisponible');
            collab.syncLoopRunning = false;
            return;
        }

        if (watch?.changed) {
            const watchedUpdatedAt = String(watch.updatedAt || '');
            if (!watchedUpdatedAt || watchedUpdatedAt !== String(collab.activeBoardUpdatedAt || '')) {
                setCloudSyncState('syncing');
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
            setCloudSyncState('error', 'Connexion live coupee');
            return;
        }

        collab.syncRetryMs = collab.syncRetryMs
            ? Math.min(COLLAB_WATCH_RETRY_MAX_MS, collab.syncRetryMs * 2)
            : COLLAB_WATCH_RETRY_MIN_MS;
        setCloudSyncState('error');
        scheduleNextWatchTick(loopToken, collab.syncRetryMs);
    }
}

async function syncActiveCloudBoard(options = {}) {
    const quiet = Boolean(options.quiet);
    if (!isCloudBoardActive() || !collab.user || !collab.token) return false;
    if (collab.syncInFlight) return false;
    if (collab.saveInFlight) return false;

    collab.syncInFlight = true;
    try {
        const result = await collabBoardRequest('get_board', { boardId: collab.activeBoardId });
        if (!result || !result.board || !result.board.data) return false;

        const remoteSummary = {
            id: result.board.id || collab.activeBoardId,
            role: result.role || collab.activeRole,
            title: result.board.title || collab.activeBoardTitle || state.projectName || 'Tableau cloud',
            ownerId: result.board.ownerId || collab.ownerId || '',
            updatedAt: result.board.updatedAt || collab.activeBoardUpdatedAt || ''
        };

        const remoteUpdatedAt = String(remoteSummary.updatedAt || '');
        const localUpdatedAt = String(collab.activeBoardUpdatedAt || '');
        if (!remoteUpdatedAt || remoteUpdatedAt === localUpdatedAt) return false;

        const localChanged = hasLocalCloudChanges();
        updateActiveBoardSummary(remoteSummary);
        updateCollabPresence(result?.presence || []);

        if (localChanged && canEditCloudBoard()) {
            const mergedSaved = await saveActiveCloudBoard({ manual: false, quiet: true, force: true });
            if (mergedSaved) setCloudSyncState('merged');
            return Boolean(mergedSaved);
        }

        applyCloudBoardData(result.board.data, { quiet, projectName: remoteSummary.title });
        setCloudSyncState('live');
        if (!quiet) {
            appendActionLog('sync live: board mis a jour');
        }
        return true;
    } catch (e) {
        setCloudSyncState('error');
        if (!quiet) showCustomAlert(`Erreur sync live: ${escapeHtml(e.message || 'inconnue')}`);
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
    setCloudSyncState(canEditCloudBoard() ? 'live' : 'session', canEditCloudBoard() ? 'Synchro live active' : 'Lecture live active');
    scheduleNextWatchTick(loopToken, 0);
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
        const err = new Error(data.error || `Erreur auth (${response.status})`);
        err.status = response.status;
        err.payload = data || {};
        throw err;
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
        const err = new Error(data.error || `Erreur cloud (${response.status})`);
        err.status = response.status;
        err.payload = data || {};
        throw err;
    }
    return data;
}

function setActiveCloudBoardFromSummary(summary = null) {
    const previousBoardId = String(collab.activeBoardId || '');
    if (!summary || !summary.id) {
        collab.activeBoardId = '';
        collab.activeRole = '';
        collab.activeBoardTitle = '';
        collab.ownerId = '';
        collab.activeBoardUpdatedAt = '';
        collab.lastSavedFingerprint = '';
        collab.localChangeSeq = 0;
        collab.lastSavedChangeSeq = 0;
        collab.shadowData = null;
        updateCollabPresence([]);
    } else {
        collab.activeBoardId = String(summary.id || '');
        collab.activeRole = String(summary.role || '');
        collab.activeBoardTitle = String(summary.title || '');
        collab.ownerId = String(summary.ownerId || '');
        collab.activeBoardUpdatedAt = String(summary.updatedAt || '');
    }
    if (previousBoardId && previousBoardId !== collab.activeBoardId) {
        clearCollabPresence(previousBoardId).catch(() => {});
    }
    applyLocalPersistencePolicy();
    syncCloudStatus();
    persistCollabState();
    if (isCloudBoardActive()) {
        startCollabAutosave();
        startCollabLiveSync();
        startCollabPresence();
    } else {
        stopCollabAutosave();
        stopCollabLiveSync();
        stopCollabPresence();
        setCloudSyncState(collab.user ? 'session' : 'local');
    }
}

async function openCloudBoard(boardId, options = {}) {
    const targetId = String(boardId || '').trim();
    if (!targetId) throw new Error('Board cloud invalide.');

    const result = await collabBoardRequest('get_board', { boardId: targetId });
    if (!result.board || !result.board.data) throw new Error('Board cloud corrompu.');
    if (String(result.board.page || 'point') !== 'point') {
        throw new Error('Ce board appartient au module Carte, pas au mode Reseau.');
    }

    const summary = {
        id: result.board.id,
        role: result.role || 'editor',
        title: result.board.title || state.projectName || 'Tableau cloud',
        ownerId: result.board.ownerId || '',
        updatedAt: result.board.updatedAt || ''
    };

    setActiveCloudBoardFromSummary(summary);
    updateCollabPresence(result?.presence || []);
    applyCloudBoardData(result.board.data, { quiet: true, projectName: summary.title });
    setBoardQueryParam(summary.id);
    setCloudSyncState(canEditCloudBoard() ? 'live' : 'session', canEditCloudBoard() ? 'Synchro live active' : 'Lecture live active');

    if (!options.quiet) {
        showCustomAlert(`☁️ Board cloud ouvert : ${escapeHtml(summary.title)}`);
    }
}

async function saveActiveCloudBoard(options = {}) {
    const manual = Boolean(options.manual);
    const quiet = Boolean(options.quiet);
    const force = Boolean(options.force);

    if (!isCloudBoardActive()) {
        if (manual && !quiet) showCustomAlert("Aucun board cloud actif.");
        return false;
    }
    if (!canEditCloudBoard()) {
        if (manual && !quiet) showCustomAlert("Tu n'as pas les droits d'edition cloud.");
        return false;
    }
    if (collab.saveInFlight) {
        if (!manual) queueCloudAutosave(COLLAB_AUTOSAVE_RETRY_MS);
        return false;
    }
    if (!force && !manual && !hasLocalCloudChanges()) {
        setCloudSyncState(canEditCloudBoard() ? 'live' : 'session', canEditCloudBoard() ? 'Synchronise' : 'Lecture live active');
        return true;
    }

    collab.saveInFlight = true;
    setCloudSyncState('saving');
    try {
        const title = (state.projectName || collab.activeBoardTitle || 'Tableau cloud').trim();
        const plainData = generateExportData();
        const data = buildCloudBoardPayload();
        const localFingerprint = fingerprintFromPointPayload(plainData);
        const savedChangeSeq = collab.localChangeSeq;
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
            updateCollabPresence(result?.presence || []);
            if (result.board.data) {
                setCloudShadowData(result.board.data);
                const serverPlain = extractPlainPointPayloadFromCloud(result.board.data);
                const serverFingerprint = fingerprintFromPointPayload(serverPlain);
                const shouldApplyServerData = serverFingerprint !== localFingerprint;
                if (shouldApplyServerData) {
                    applyCloudBoardData(result.board.data, { quiet: true, projectName: collab.activeBoardTitle });
                } else {
                    collab.lastSavedFingerprint = serverFingerprint;
                    captureCloudSavedState(savedChangeSeq);
                }
            } else {
                collab.lastSavedFingerprint = localFingerprint;
                captureCloudSavedState(savedChangeSeq);
            }
        }
        setCloudSyncState(result?.mergedConflict ? 'merged' : 'live', result?.mergedConflict ? 'Fusion auto appliquee' : 'Synchronise');
        if (manual && !quiet) showCustomAlert("☁️ Board cloud sauvegarde.");
        return true;
    } catch (e) {
        setCloudSyncState('error');
        if (!quiet) showCustomAlert(`Erreur cloud: ${escapeHtml(e.message || 'inconnue')}`);
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
        data: buildCloudBoardPayload()
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
    updateCollabPresence(result?.presence || []);
    if (result.board.data) setCloudShadowData(result.board.data);
    captureCloudSavedState();
    setBoardQueryParam(result.board.id);
    setCloudSyncState('live', 'Synchro live active');
}

async function logoutCollab() {
    try {
        await clearCollabPresence(collab.activeBoardId);
        if (collab.token) await collabAuthRequest('logout');
    } catch (e) {}

    collab.token = '';
    collab.user = null;
    setActiveCloudBoardFromSummary(null);
    clearCollabStorage();
    stopCollabAutosave();
    stopCollabLiveSync();
    stopCollabPresence();
    stopCollabSessionHeartbeat();
    setLocalPersistenceEnabled(true);
    setBoardQueryParam('');
    setCloudSyncState('local');
}

async function renderCloudMembers(boardId) {
    if (!modalOverlay) createModal();
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if (!msgEl || !actEl) return;

    await flushPendingCloudAutosave(boardId).catch(() => {});

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
    const onlineUsers = new Set(Array.isArray(result.onlineUsers) ? result.onlineUsers.map((id) => String(id)) : []);
    const presenceByUser = new Map(
        (Array.isArray(result.presence) ? result.presence : []).map((entry) => [String(entry.userId || ''), entry])
    );
    const shareUrl = `${window.location.origin}${window.location.pathname}?board=${encodeURIComponent(board.id)}`;

    const membersHtml = members.map((m) => {
        const isOwner = m.role === 'owner';
        const presence = presenceByUser.get(String(m.userId || ''));
        const isOnline = onlineUsers.has(String(m.userId || ''));
        const statusLabel = presence
            ? (presence.activeNodeName ? `En ligne · ${presence.activeNodeName}` : 'En ligne sur ce board')
            : (isOnline ? 'En ligne sur le site' : 'Hors ligne');
        return `
            <div class="cloud-member-row">
                <div class="cloud-row-main">
                    <div class="cloud-row-title">${escapeHtml(m.username)}</div>
                    <div class="cloud-row-sub">${escapeHtml(m.role || 'editor')}</div>
                    <div class="cloud-member-status ${isOnline ? 'is-online' : 'is-offline'}">${escapeHtml(statusLabel)}</div>
                </div>
                <div class="cloud-row-actions">
                    ${isOwner ? '' : `<button type="button" class="mini-btn cloud-remove-member" data-user="${escapeHtml(m.userId)}">Retirer</button>`}
                    ${isOwner ? '' : `<button type="button" class="mini-btn cloud-transfer-member" data-user="${escapeHtml(m.userId)}">Donner lead</button>`}
                </div>
            </div>
        `;
    }).join('');

    msgEl.innerHTML = `
        <div class="modal-tool">
            <div class="cloud-board-manage-head">
                <div>
                    <h3 class="modal-tool-title">Gestion du board</h3>
                    <div class="modal-note">Board: ${escapeHtml(board.title || 'Sans nom')}</div>
                </div>
                <div class="cloud-row-actions">
                    <button type="button" id="cloud-rename-board" class="mini-btn">Renommer</button>
                    <button type="button" id="cloud-delete-board" class="mini-btn">Supprimer</button>
                </div>
            </div>
            <div class="cloud-inline-form">
                <input id="cloud-share-username" type="text" placeholder="username" class="modal-input-standalone" />
                <select id="cloud-share-role" class="compact-select cloud-inline-select">
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                    <option value="owner">Owner</option>
                </select>
                <button type="button" id="cloud-share-add" class="mini-btn">Ajouter</button>
            </div>
            <div class="cloud-share-line">
                <span>Lien partage: <span id="cloud-share-link" class="cloud-share-link">${escapeHtml(shareUrl)}</span></span>
                <button type="button" id="cloud-copy-link" class="mini-btn">Copier</button>
            </div>
            <div class="cloud-scroll">${membersHtml || '<div class="modal-empty-state">Aucun membre.</div>'}</div>
        </div>
    `;

    actEl.innerHTML = `
        <button type="button" id="cloud-members-back">Retour</button>
        <button type="button" id="cloud-members-close">Fermer</button>
    `;

    document.getElementById('cloud-rename-board').onclick = async () => {
        const defaultTitle = String(board.title || 'Board cloud');
        const nextTitleRaw = await new Promise((resolve) => {
            showCustomPrompt(
                'Renommer le board',
                defaultTitle,
                (value) => resolve(value),
                () => resolve(null)
            );
        });
        if (nextTitleRaw === null) return;

        const nextTitle = String(nextTitleRaw || '').trim();
        if (!nextTitle || nextTitle === defaultTitle) return;

        try {
            await collabBoardRequest('rename_board', { boardId, title: nextTitle });
            if (String(collab.activeBoardId) === String(boardId)) {
                collab.activeBoardTitle = nextTitle;
                state.projectName = nextTitle;
                persistCollabState();
                syncCloudStatus();
            }
            await renderCloudMembers(boardId);
        } catch (e) {
            showCustomAlert(`Erreur renommage: ${escapeHtml(e.message || 'inconnue')}`);
        }
    };

    document.getElementById('cloud-delete-board').onclick = () => {
        showCustomConfirm('Supprimer ce board cloud ?', async () => {
            try {
                await collabBoardRequest('delete_board', { boardId });
                if (String(boardId) === String(collab.activeBoardId)) {
                    setActiveCloudBoardFromSummary(null);
                    setBoardQueryParam('');
                }
                await renderCloudHome();
            } catch (e) {
                showCustomAlert(`Erreur suppression: ${escapeHtml(e.message || 'inconnue')}`);
            }
        });
    };

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
            showCustomConfirm('Retirer ce membre ?', async () => {
                try {
                    await collabBoardRequest('remove_member', { boardId, userId });
                    await renderCloudMembers(boardId);
                } catch (e) {
                    showCustomAlert(`Erreur retrait: ${escapeHtml(e.message || 'inconnue')}`);
                }
            });
        };
    });

    Array.from(document.querySelectorAll('.cloud-transfer-member')).forEach((btn) => {
        btn.onclick = async () => {
            const userId = btn.getAttribute('data-user') || '';
            if (!userId) return;
            showCustomConfirm('Transferer le lead a ce membre ?', async () => {
                try {
                    await collabBoardRequest('transfer_board', { boardId, userId });
                    await openCloudBoard(boardId, { quiet: true });
                    await renderCloudHome();
                } catch (e) {
                    showCustomAlert(`Erreur transfert: ${escapeHtml(e.message || 'inconnue')}`);
                }
            });
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
    setModalMode('cloud');
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if (!msgEl || !actEl) return;

    await flushPendingCloudAutosave(collab.activeBoardId).catch(() => {});

    if (!collab.user) {
        msgEl.innerHTML = `
            <div class="modal-tool cloud-auth-shell">
                <h3 class="modal-tool-title">Cloud collaboratif</h3>
                <div class="modal-note">Cree un compte ou connecte-toi.</div>
                <input id="cloud-auth-user" type="text" placeholder="username" class="modal-input-standalone" />
                <input id="cloud-auth-pass" type="password" placeholder="mot de passe" class="modal-input-standalone" />
            </div>
        `;
        actEl.innerHTML = `
            <button type="button" id="cloud-auth-register">Creer un compte</button>
            <button type="button" id="cloud-auth-login" class="primary">Se connecter</button>
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
                startCollabSessionHeartbeat();
                setCloudSyncState('session', 'Session cloud ouverte');
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
            <div class="cloud-board-row ${active ? 'is-active' : ''}">
                <div class="cloud-row-main">
                    <div class="cloud-row-title">${escapeHtml(b.title || 'Sans nom')}</div>
                    <div class="cloud-row-sub">${escapeHtml(role)} · ${escapeHtml(b.page || 'point')}</div>
                </div>
                <div class="cloud-row-actions">
                    <button type="button" class="mini-btn cloud-open-board" data-board="${escapeHtml(b.id)}">Ouvrir</button>
                    ${role === 'owner' ? `<button type="button" class="mini-btn cloud-manage-board" data-board="${escapeHtml(b.id)}">Gerer</button>` : ''}
                    ${role !== 'owner' ? `<button type="button" class="mini-btn cloud-leave-board" data-board="${escapeHtml(b.id)}">Quitter</button>` : ''}
                </div>
            </div>
        `;
    }).join('');

    const localSaveLocked = isLocalSaveLocked();
    const localPanel = collab.homePanel === 'local' ? 'local' : 'cloud';
    const localRows = `
        <div class="cloud-board-row cloud-board-row-local is-active">
            <div class="cloud-row-main">
                <div class="cloud-row-title">${escapeHtml(state.projectName || 'Session locale')}</div>
                <div class="cloud-row-sub">local · point</div>
            </div>
            <div class="cloud-local-badge">Actions locales</div>
        </div>
        <div class="cloud-local-panel">
            ${localSaveLocked ? '<div class="cloud-local-note">Mode partage: les exports locaux sont bloques pour les membres non lead.</div>' : ''}
            <div class="cloud-local-grid">
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
                <button type="button" class="data-hub-card data-hub-card-local" data-local-action="open-text">
                    <span class="data-hub-card-title">Coller JSON</span>
                    <span class="data-hub-card-meta">Texte</span>
                </button>
                <button type="button" class="data-hub-card data-hub-card-local" data-local-action="merge-file">
                    <span class="data-hub-card-title">Fusionner</span>
                    <span class="data-hub-card-meta">Fichier</span>
                </button>
                <button type="button" class="data-hub-card data-hub-card-local" data-local-action="merge-text">
                    <span class="data-hub-card-title">Fusion texte</span>
                    <span class="data-hub-card-meta">JSON</span>
                </button>
                <button type="button" class="data-hub-card data-hub-card-danger" data-local-action="reset-all">
                    <span class="data-hub-card-title">Reset</span>
                </button>
            </div>
        </div>
    `;
    const panelBody = localPanel === 'local'
        ? localRows
        : (boardRows || '<div class="modal-empty-state">Aucun board cloud.</div>');

    msgEl.innerHTML = `
        <div class="cloud-home-head">
            <div class="cloud-home-tab-group">
                <button type="button" id="cloud-home-tab-cloud" class="cloud-home-tab cloud-home-word ${localPanel === 'cloud' ? 'is-active' : ''}">cloud</button>
                <button type="button" id="cloud-home-tab-local" class="cloud-home-tab cloud-home-word cloud-home-word-alt ${localPanel === 'local' ? 'is-active' : ''}">local</button>
            </div>
            <button type="button" id="cloud-modal-close-x" class="mini-btn cloud-close-btn">×</button>
        </div>
        <div class="cloud-column cloud-panel-shell">${panelBody}</div>
        <div class="cloud-status-bar">
            <span>Connecte: ${escapeHtml(collab.user.username)}</span>
            <span id="cloudModalSyncInfo" class="${isCloudBoardActive() ? 'cloud-status-active' : ''}">
                ${isCloudBoardActive() ? `Board actif: ${escapeHtml(collab.activeBoardTitle || collab.activeBoardId)} (${escapeHtml(collab.activeRole || '')})` : 'Aucun board cloud actif'}
            </span>
        </div>
    `;

    actEl.innerHTML = localPanel === 'cloud'
        ? `
            <button type="button" id="cloud-create-board" class="primary">Nouveau</button>
            <button type="button" id="cloud-save-active">Sauver</button>
            <button type="button" id="cloud-logout">Deconnexion</button>
        `
        : `<button type="button" id="cloud-logout">Deconnexion</button>`;

    const runLockedLocalAction = () => {
        showCustomAlert('Export local interdit pour les membres partages.');
    };

    const createBtn = document.getElementById('cloud-create-board');
    if (createBtn) {
        createBtn.onclick = async () => {
            try {
                await createCloudBoardFromCurrent();
                showCustomAlert(`Board cree: ${escapeHtml(collab.activeBoardTitle || '')}`);
                await renderCloudHome();
            } catch (e) {
                showCustomAlert(`Erreur creation cloud: ${escapeHtml(e.message || 'inconnue')}`);
            }
        };
    }

    const saveBtn = document.getElementById('cloud-save-active');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            await saveActiveCloudBoard({ manual: true, quiet: false });
            await renderCloudHome();
        };
    }
    const logoutBtn = document.getElementById('cloud-logout');
    logoutBtn.onclick = async () => {
        await logoutCollab();
        await renderCloudHome();
    };
    if (saveBtn && (!isCloudBoardActive() || !canEditCloudBoard())) {
        saveBtn.disabled = true;
        saveBtn.title = isCloudBoardActive() ? 'Droits insuffisants' : 'Aucun board actif';
    }
    const closeX = document.getElementById('cloud-modal-close-x');
    if (closeX) closeX.onclick = () => { modalOverlay.style.display = 'none'; };
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
        btn.onclick = () => {
            const action = btn.getAttribute('data-local-action') || '';

            if (action === 'save-file') {
                if (localSaveLocked) return runLockedLocalAction();
                modalOverlay.style.display = 'none';
                downloadJSON();
                return;
            }
            if (action === 'save-text') {
                if (localSaveLocked) return runLockedLocalAction();
                const data = generateExportData();
                navigator.clipboard.writeText(JSON.stringify(data, null, 2))
                    .then(() => {
                        modalOverlay.style.display = 'none';
                        showCustomAlert('JSON copie dans le presse-papier.');
                    })
                    .catch(() => showCustomAlert('Erreur copie clipboard'));
                return;
            }
            if (action === 'open-file') {
                modalOverlay.style.display = 'none';
                document.getElementById('fileImport')?.click();
                return;
            }
            if (action === 'open-text') {
                showRawDataInput('load');
                return;
            }
            if (action === 'merge-file') {
                modalOverlay.style.display = 'none';
                document.getElementById('fileMerge')?.click();
                return;
            }
            if (action === 'merge-text') {
                showRawDataInput('merge');
                return;
            }
            if (action === 'reset-all') {
                modalOverlay.style.display = 'none';
                resetAllPointData();
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
            showCustomConfirm('Quitter ce board partage ?', async () => {
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
            });
        };
    });

    syncCloudLivePanels();
}

function showCloudMenu() {
    if (!modalOverlay) createModal();
    setModalMode('cloud');
    collab.homePanel = 'cloud';
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
        startCollabSessionHeartbeat();
        setCloudSyncState(collab.activeBoardId ? 'live' : 'session');
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

const LINK_GUIDE_SECTIONS = [
    {
        title: 'Personne <> Personne',
        subtitle: 'Relations directes entre deux individus.',
        items: [
            { kind: KINDS.FAMILLE, when: 'Parent, enfant, frere, soeur, cousin ou foyer.' },
            { kind: KINDS.COUPLE, when: 'Relation officielle ou vie de couple stable.' },
            { kind: KINDS.AMOUR, when: 'Relation sentimentale floue, liaison ou crush connu.' },
            { kind: KINDS.AMI, when: 'Lien amical clair, proche, sorties ensemble.' },
            { kind: KINDS.COLLEGUE, when: 'Ils bossent ensemble au meme niveau.' },
            { kind: KINDS.CONNAISSANCE, when: 'Ils se connaissent mais sans lien fort confirme.' },
            { kind: KINDS.RIVAL, when: 'Concurrence, tension, conflit froid ou lutte d influence.' },
            { kind: KINDS.ENNEMI, when: 'Hostilite ouverte, menace, guerre ou vendetta.' }
        ]
    },
    {
        title: 'Personne <> Organisation',
        subtitle: 'Entre une personne et une entreprise ou un groupe.',
        items: [
            { kind: KINDS.PATRON, when: 'La personne dirige ou possede la structure.' },
            { kind: KINDS.HAUT_GRADE, when: 'Cadre haut place, chef interne, bras droit, lieutenant.' },
            { kind: KINDS.EMPLOYE, when: 'Travaille pour la structure sans etre dirigeant.' },
            { kind: KINDS.MEMBRE, when: 'Appartient au groupe, gang, club ou organisation.' },
            { kind: KINDS.AFFILIATION, when: 'Lien de proximite, soutien, contact regulier sans appartenance nette.' },
            { kind: KINDS.PARTENAIRE, when: 'Business ou alliance ponctuelle avec la structure.' },
            { kind: KINDS.ENNEMI, when: 'La personne s oppose a la structure ou la cible.' }
        ]
    },
    {
        title: 'Organisation <> Organisation',
        subtitle: 'Entreprises, groupes et institutions entre eux.',
        items: [
            { kind: KINDS.PARTENAIRE, when: 'Alliance, deal, accord, cooperation ou business commun.' },
            { kind: KINDS.AFFILIATION, when: 'Rattachement, tutelle, reseau commun ou proximite durable.' },
            { kind: KINDS.RIVAL, when: 'Concurrence, guerre de territoire, lutte economique.' },
            { kind: KINDS.ENNEMI, when: 'Conflit ouvert, operations contre l autre structure.' }
        ]
    },
    {
        title: 'Lien generique',
        subtitle: 'Quand tu sais qu il y a un lien mais pas encore sa vraie nature.',
        items: [
            { kind: KINDS.RELATION, when: 'Utilise-le comme lien temporaire, puis remplace-le plus tard par le bon type.' }
        ]
    }
];

function renderLinkGuideMarkup() {
    const sections = LINK_GUIDE_SECTIONS.map((section) => `
        <section class="link-guide-section">
            <div class="link-guide-section-head">
                <div class="link-guide-section-title">${escapeHtml(section.title)}</div>
                <div class="link-guide-section-subtitle">${escapeHtml(section.subtitle)}</div>
            </div>
            <div class="link-guide-grid">
                ${section.items.map((item) => `
                    <article class="link-guide-card">
                        <div class="link-guide-card-head">
                            <span class="link-guide-emoji">${escapeHtml(linkKindEmoji(item.kind))}</span>
                            <span class="link-guide-kind">${escapeHtml(kindToLabel(item.kind))}</span>
                        </div>
                        <div class="link-guide-when">${escapeHtml(item.when)}</div>
                    </article>
                `).join('')}
            </div>
        </section>
    `).join('');

    return `
        <div class="link-guide-shell">
            <div class="link-guide-topline">Aide liaison</div>
            <h3 class="link-guide-title">Comment choisir le bon type de lien</h3>
            <p class="link-guide-intro">
                Choisis le lien le plus precis possible. Si tu hesites, commence par <strong>${escapeHtml(kindToLabel(KINDS.RELATION))}</strong>
                puis remplace-le des que tu as une info plus fiable.
            </p>
            <div class="link-guide-tips">
                <div class="link-guide-tip">Patron / Haut grade / Employe servent a poser la hierarchie dans une structure.</div>
                <div class="link-guide-tip">Membre / Affiliation servent quand le lien existe mais que le role exact reste flou.</div>
                <div class="link-guide-tip">Rival et Ennemi ne veulent pas dire la meme chose: Rival = tension, Ennemi = conflit ouvert.</div>
            </div>
            ${sections}
        </div>
    `;
}

function showLinkGuide() {
    if (!modalOverlay) createModal();
    setModalMode('info');
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if (!msgEl || !actEl) return;

    msgEl.innerHTML = renderLinkGuideMarkup();
    actEl.innerHTML = '<button id="btn-link-guide-close" class="grow">Fermer</button>';

    const closeBtn = document.getElementById('btn-link-guide-close');
    if (closeBtn) closeBtn.onclick = () => { modalOverlay.style.display = 'none'; };

    modalOverlay.style.display = 'flex';
    if (closeBtn) closeBtn.focus();
}

// EXPORTS
export { renderEditor, showSettings, showContextMenu, hideContextMenu };

// --- MODALES PERSONNALISÉES ---

function setModalMode(mode = 'default') {
    if (!modalOverlay) createModal();
    if (!modalOverlay) return;
    modalOverlay.setAttribute('data-mode', String(mode || 'default'));
}

function createModal() {
    if (document.getElementById('custom-modal')) return;

    if (!document.getElementById('custom-modal-style')) {
        const style = document.createElement('style');
        style.id = 'custom-modal-style';
        style.textContent = `
            #custom-modal {
                position: fixed;
                inset: 0;
                z-index: 9999;
                display: none;
                align-items: center;
                justify-content: center;
                background: rgba(0, 0, 0, 0.68);
                backdrop-filter: blur(4px);
            }
            #custom-modal .modal-card {
                background: rgba(5, 10, 28, 0.96);
                border: 1px solid rgba(115, 251, 247, 0.68);
                width: min(560px, calc(100vw - 32px));
                min-height: 180px;
                padding: 20px;
                box-shadow: 0 0 0 1px rgba(115, 251, 247, 0.18), 0 20px 40px rgba(0,0,0,0.6);
            }
            #custom-modal #modal-msg {
                margin-bottom: 14px;
                color: #fff;
                font-size: 1.02rem;
                text-align: left;
            }
            #custom-modal #modal-actions {
                display: flex;
                gap: 10px;
                justify-content: flex-start;
                flex-wrap: wrap;
            }
            #custom-modal[data-mode="cloud"] .modal-card {
                width: min(980px, calc(100vw - 290px));
                min-height: 510px;
                padding: 20px 20px 18px;
            }
            #custom-modal[data-mode="create"] .modal-card {
                width: min(920px, calc(100vw - 140px));
                min-height: 0;
                padding: 16px 18px 14px;
                overflow: visible;
            }
            #custom-modal[data-mode="create"] #modal-msg {
                margin-bottom: 10px;
            }
            #custom-modal[data-mode="create"] #modal-actions {
                display: none;
            }
            #custom-modal[data-mode="search"] .modal-card {
                width: min(700px, calc(100vw - 300px));
                min-height: 320px;
            }
            #custom-modal[data-mode="info"] .modal-card {
                width: min(980px, calc(100vw - 40px));
                min-height: 0;
                max-height: calc(100vh - 44px);
                padding: 18px 20px 16px;
                overflow: hidden;
            }
            #custom-modal[data-mode="datahub"] .modal-card {
                width: min(860px, calc(100vw - 32px));
                min-height: 420px;
            }
            #custom-modal[data-mode="aihub"] .modal-card {
                width: min(980px, calc(100vw - 18px));
                min-height: 520px;
                padding: 0;
                overflow: hidden;
                border-radius: 18px;
                background:
                    linear-gradient(180deg, rgba(2, 10, 30, 0.98), rgba(1, 7, 20, 0.98)),
                    radial-gradient(circle at top right, rgba(102, 243, 255, 0.08), transparent 30%);
                border: 1px solid rgba(37, 196, 255, 0.54);
                box-shadow:
                    0 0 0 1px rgba(37, 196, 255, 0.1),
                    0 24px 90px rgba(0, 0, 0, 0.68);
                clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px));
            }
            #custom-modal[data-mode="aihub"] #modal-msg {
                margin-bottom: 0;
            }
            #custom-modal[data-mode="aihub"] #modal-actions {
                display: none;
            }
            #custom-modal[data-mode="alert"] .modal-card,
            #custom-modal[data-mode="prompt"] .modal-card,
            #custom-modal[data-mode="confirm"] .modal-card {
                width: min(560px, calc(100vw - 28px));
                min-height: 170px;
            }
            #custom-modal[data-mode="info"] #modal-msg {
                margin-bottom: 12px;
                max-height: calc(100vh - 170px);
                overflow-y: auto;
                padding-right: 6px;
            }
            .link-guide-shell {
                display: flex;
                flex-direction: column;
                gap: 14px;
            }
            .link-guide-topline {
                color: #7ec8d5;
                font-size: 0.72rem;
                letter-spacing: 2px;
                text-transform: uppercase;
            }
            .link-guide-title {
                margin: 0;
                color: #fff;
                font-size: 1.5rem;
                letter-spacing: 0.03em;
            }
            .link-guide-intro {
                margin: 0;
                color: #b6c7df;
                line-height: 1.55;
            }
            .link-guide-tips {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 10px;
            }
            .link-guide-tip {
                padding: 10px 12px;
                border: 1px solid rgba(115, 251, 247, 0.16);
                background: rgba(7, 18, 39, 0.82);
                color: #a9bbd5;
                line-height: 1.45;
                border-radius: 10px;
            }
            .link-guide-section {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .link-guide-section-head {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .link-guide-section-title {
                color: #e7f6ff;
                font-size: 1rem;
                letter-spacing: 0.04em;
                text-transform: uppercase;
            }
            .link-guide-section-subtitle {
                color: #7f95b0;
                font-size: 0.84rem;
                line-height: 1.45;
            }
            .link-guide-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
            }
            .link-guide-card {
                padding: 12px 14px;
                border: 1px solid rgba(115, 251, 247, 0.16);
                background: linear-gradient(180deg, rgba(7, 18, 39, 0.9), rgba(4, 11, 24, 0.9));
                border-radius: 12px;
                box-shadow: inset 0 0 0 1px rgba(115, 251, 247, 0.04);
            }
            .link-guide-card-head {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 6px;
            }
            .link-guide-emoji {
                font-size: 1.1rem;
                line-height: 1;
            }
            .link-guide-kind {
                color: #f0fbff;
                font-weight: 700;
                letter-spacing: 0.03em;
                text-transform: uppercase;
            }
            .link-guide-when {
                color: #a7bbd4;
                line-height: 1.5;
            }
            @media (max-width: 900px) {
                #custom-modal[data-mode="cloud"] .modal-card,
                #custom-modal[data-mode="datahub"] .modal-card,
                #custom-modal[data-mode="create"] .modal-card,
                #custom-modal[data-mode="search"] .modal-card,
                #custom-modal[data-mode="aihub"] .modal-card,
                #custom-modal[data-mode="info"] .modal-card {
                    width: calc(100vw - 18px);
                    min-height: 260px;
                }
                #custom-modal[data-mode="create"] .modal-card {
                    padding: 12px;
                }
                .link-guide-tips,
                .link-guide-grid {
                    grid-template-columns: 1fr;
                }
            }
        `;
        document.head.appendChild(style);
    }

    modalOverlay = document.createElement('div');
    modalOverlay.id = 'custom-modal';
    modalOverlay.setAttribute('data-mode', 'default');
    modalOverlay.innerHTML = `
        <div class="modal-card">
            <div id="modal-msg"></div>
            <div id="modal-actions"></div>
        </div>`;
    document.body.appendChild(modalOverlay);
}

export function showCustomAlert(msg) {
    if(!modalOverlay) createModal();
    setModalMode('alert');
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
    setModalMode('confirm');
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
    setModalMode('prompt');
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');

    if(msgEl && actEl) {
        const safeDefault = escapeHtml(defaultValue || '');
        msgEl.innerHTML = `
            <div class="modal-tool">
                <div class="modal-tool-title">${msg}</div>
                <input type="text" id="modal-input-custom" value="${safeDefault}" class="modal-input-standalone modal-input-center">
            </div>
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
    updatePathfindingPanel();
    updateIntelButtonLockVisual();

    const canvas = document.getElementById('graph');
    window.addEventListener('resize', resizeCanvas);

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault(); undo(); saveState(); refreshLists();
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
    setupQuickActions();

    window.zoomToNode = zoomToNode;
    window.updateHvtPanel = updateHvtPanel;
}

function resetAllPointData() {
    showCustomConfirm('SUPPRIMER TOUTES LES DONNÉES ?', () => {
        pushHistory();
        state.nodes = [];
        state.links = [];
        state.selection = null;
        state.nextId = 1;
        state.projectName = null;
        restartSim();
        refreshLists();
        renderEditor();
        saveState();
    });
}

function openDataHubModal() {
    if (!modalOverlay) createModal();
    setModalMode('datahub');
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if (!msgEl || !actEl) return;

    const localSaveLocked = isLocalSaveLocked();
    const cloudSummary = isCloudBoardActive()
        ? `${collab.activeBoardTitle || collab.activeBoardId} · ${collab.activeRole || 'cloud'}`
        : (collab.user ? 'Session cloud ouverte' : 'Cloud non connecte');
    const localSummary = localSaveLocked ? 'Local verrouille' : 'Local actif';

    msgEl.innerHTML = `
        <div class="modal-tool data-hub">
            <div class="data-hub-head">
                <h3 class="modal-tool-title">Fichier</h3>
            </div>

            <div class="data-hub-panels">
                <div class="data-hub-section data-hub-section-local">
                    <div class="data-hub-kicker">Local</div>
                    <div class="data-hub-grid">
                        <button type="button" class="data-hub-card data-hub-card-local" data-action="open-file">
                            <span class="data-hub-card-title">Ouvrir</span>
                            <span class="data-hub-card-meta">JSON</span>
                        </button>
                        <button type="button" class="data-hub-card data-hub-card-local ${localSaveLocked ? 'is-disabled-visual' : ''}" data-action="save-file">
                            <span class="data-hub-card-title">Sauvegarder</span>
                            <span class="data-hub-card-meta">JSON</span>
                        </button>
                    </div>
                </div>

                <div class="data-hub-section data-hub-section-cloud">
                    <div class="data-hub-kicker">Cloud</div>
                    <div class="data-hub-grid ${isCloudBoardActive() ? '' : 'data-hub-grid-single'}">
                        <button type="button" class="data-hub-card data-hub-card-cloud" data-action="cloud-open">
                            <span class="data-hub-card-title">${collab.user ? 'Boards' : 'Se connecter'}</span>
                            <span class="data-hub-card-meta">${isCloudBoardActive() ? escapeHtml(collab.activeRole || 'actif') : 'cloud'}</span>
                        </button>
                        ${isCloudBoardActive() ? `
                            <button type="button" class="data-hub-card data-hub-card-cloud" data-action="cloud-save">
                                <span class="data-hub-card-title">Synchroniser</span>
                                <span class="data-hub-card-meta">board</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>

            <details class="data-hub-advanced">
                <summary class="data-hub-summary">Options avancees</summary>
                <div class="data-hub-advanced-grid">
                    <button type="button" class="data-hub-card data-hub-card-local ${localSaveLocked ? 'is-disabled-visual' : ''}" data-action="save-text">
                        <span class="data-hub-card-title">Copier JSON</span>
                    </button>
                    <button type="button" class="data-hub-card data-hub-card-local" data-action="open-text">
                        <span class="data-hub-card-title">Coller JSON</span>
                    </button>
                    <button type="button" class="data-hub-card data-hub-card-local" data-action="merge-file">
                        <span class="data-hub-card-title">Fusionner</span>
                    </button>
                    <button type="button" class="data-hub-card data-hub-card-local" data-action="merge-text">
                        <span class="data-hub-card-title">Fusion texte</span>
                    </button>
                    <button type="button" class="data-hub-card data-hub-card-danger" data-action="reset-all">
                        <span class="data-hub-card-title">Reset</span>
                    </button>
                </div>
            </details>

            <div class="data-hub-status">
                <span class="data-hub-status-pill data-hub-status-pill-local"><strong>${escapeHtml(localSummary)}</strong></span>
                <span class="data-hub-status-pill data-hub-status-pill-cloud">${escapeHtml(cloudSummary)}</span>
                <span class="data-hub-status-pill data-hub-status-pill-sync">${escapeHtml(collab.syncLabel || 'Local')}</span>
            </div>
        </div>
    `;

    actEl.innerHTML = '<button type="button" id="data-hub-close">Fermer</button>';

    const runLockedLocalAction = () => {
        showCustomAlert('Export local interdit pour les membres partages.');
    };

    Array.from(msgEl.querySelectorAll('[data-action]')).forEach((btn) => {
        btn.onclick = () => {
            const action = btn.getAttribute('data-action') || '';

            if (action === 'save-file') {
                if (localSaveLocked) return runLockedLocalAction();
                modalOverlay.style.display = 'none';
                downloadJSON();
                return;
            }
            if (action === 'save-text') {
                if (localSaveLocked) return runLockedLocalAction();
                const data = generateExportData();
                navigator.clipboard.writeText(JSON.stringify(data, null, 2))
                    .then(() => {
                        modalOverlay.style.display = 'none';
                        showCustomAlert('JSON copie dans le presse-papier.');
                    })
                    .catch(() => showCustomAlert('Erreur copie clipboard'));
                return;
            }
            if (action === 'open-file') {
                modalOverlay.style.display = 'none';
                document.getElementById('fileImport')?.click();
                return;
            }
            if (action === 'open-text') {
                showRawDataInput('load');
                return;
            }
            if (action === 'merge-file') {
                modalOverlay.style.display = 'none';
                document.getElementById('fileMerge')?.click();
                return;
            }
            if (action === 'merge-text') {
                showRawDataInput('merge');
                return;
            }
            if (action === 'cloud-open') {
                showCloudMenu();
                return;
            }
            if (action === 'cloud-save') {
                if (!isCloudBoardActive()) {
                    showCloudMenu();
                    return;
                }
                saveActiveCloudBoard({ manual: true, quiet: false }).catch(() => {});
                return;
            }
            if (action === 'reset-all') {
                modalOverlay.style.display = 'none';
                resetAllPointData();
            }
        };
    });

    const closeBtn = document.getElementById('data-hub-close');
    if (closeBtn) closeBtn.onclick = () => { modalOverlay.style.display = 'none'; };
    modalOverlay.style.display = 'flex';
}

function setupTopButtons() {
    document.getElementById('createPerson').onclick = () => createNode(TYPES.PERSON, 'Nouvelle personne', { actor: collab.user?.username || '' });
    document.getElementById('createGroup').onclick = () => createNode(TYPES.GROUP, 'Nouveau groupe', { actor: collab.user?.username || '' });
    document.getElementById('createCompany').onclick = () => createNode(TYPES.COMPANY, 'Nouvelle entreprise', { actor: collab.user?.username || '' });

    const btnDataFileToggle = document.getElementById('btnDataFileToggle');
    if (btnDataFileToggle) btnDataFileToggle.onclick = () => showCloudMenu();

    document.getElementById('fileImport').onchange = (e) => handleFileProcess(e.target.files[0], 'load');
    document.getElementById('fileMerge').onchange = (e) => handleFileProcess(e.target.files[0], 'merge');

    syncCloudStatus();
}

function setupQuickActions() {
    const btnQuickSearch = document.getElementById('btnQuickSearch');
    if (btnQuickSearch) btnQuickSearch.onclick = () => openQuickSearchModal();

    const btnQuickCreate = document.getElementById('btnQuickCreate');
    if (btnQuickCreate) btnQuickCreate.onclick = () => openQuickCreateModal();

    const btnQuickIntel = document.getElementById('btnQuickIntel');
    if (btnQuickIntel) btnQuickIntel.onclick = () => openOperatorIAMode();
}

function openQuickSearchModal() {
    if (!modalOverlay) createModal();
    setModalMode('search');
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if (!msgEl || !actEl) return;

    const people = state.nodes
        .filter((node) => node.type === TYPES.PERSON)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    msgEl.innerHTML = `
        <div class="modal-tool">
            <h3 class="modal-tool-title">Recherche</h3>
            <input id="quick-search-input" type="text" placeholder="Rechercher une personne..." class="modal-input-standalone modal-search-input">
            <div id="quick-search-results" class="modal-search-results"></div>
        </div>
    `;

    const resultsEl = document.getElementById('quick-search-results');
    const inputEl = document.getElementById('quick-search-input');

    const renderResults = () => {
        if (!resultsEl) return;
        const query = String(inputEl?.value || '').trim().toLowerCase();
        const filtered = people.filter((node) => String(node.name || '').toLowerCase().includes(query));
        resultsEl.innerHTML = filtered.map((node) => `
            <button type="button" class="mini-btn quick-search-hit" data-id="${escapeHtml(String(node.id))}">
                <span class="quick-search-name">${escapeHtml(node.name || 'Sans nom')}</span>
                <span class="quick-search-meta">${escapeHtml(node.citizenNumber || '')}</span>
            </button>
        `).join('') || '<div class="modal-empty-state">Aucun resultat</div>';

        Array.from(resultsEl.querySelectorAll('.quick-search-hit')).forEach((btn) => {
            btn.onclick = () => {
                const nodeId = btn.getAttribute('data-id') || '';
                modalOverlay.style.display = 'none';
                if (nodeId) zoomToNode(nodeId);
            };
        });
    };

    if (inputEl) inputEl.oninput = renderResults;
    renderResults();

    actEl.innerHTML = '<button type="button" id="quick-search-close">Fermer</button>';
    const closeBtn = document.getElementById('quick-search-close');
    if (closeBtn) closeBtn.onclick = () => { modalOverlay.style.display = 'none'; };

    modalOverlay.style.display = 'flex';
    if (inputEl) inputEl.focus();
}

function openQuickCreateModal() {
    if (!modalOverlay) createModal();
    setModalMode('create');
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if (!msgEl || !actEl) return;

    const prefilledSourceNode = nodeById(state.selection);
    const searchableNodes = [...state.nodes]
        .filter((node) => String(node?.name || '').trim())
        .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));

    msgEl.innerHTML = `
        <div class="quick-create-shell">
            <div class="quick-create-head">
                <h3 class="quick-create-title">Creer</h3>
                <button type="button" id="quick-create-close" class="mini-btn quick-create-close-top">Fermer</button>
            </div>
            <div class="quick-create-tabs" role="tablist" aria-label="Creation rapide">
                <button type="button" class="quick-create-tab active" data-create-tab="link" aria-selected="true">Nouvelle liaison</button>
                <button type="button" class="quick-create-tab" data-create-tab="node" aria-selected="false">Nouvelle fiche</button>
            </div>
            <div class="quick-create-panels">
                <section class="quick-create-block quick-create-panel" data-panel="link">
                    <div class="quick-create-block-head">Relier deux fiches</div>
                    <div class="quick-create-link-flow">
                        <div class="quick-create-field-stack">
                            <label class="quick-create-field-label" for="quick-link-source">Source</label>
                            <input id="quick-link-source" type="text" value="${escapeHtml(prefilledSourceNode?.name || '')}" placeholder="Nom de la fiche" class="quick-create-target-input" />
                            <div id="quick-link-source-result" class="quick-create-search-result" hidden></div>
                        </div>
                        <div class="quick-create-link-arrow" aria-hidden="true">&rarr;</div>
                        <div class="quick-create-field-stack">
                            <label class="quick-create-field-label" for="quick-link-target">Cible</label>
                            <input id="quick-link-target" type="text" placeholder="Nom de la fiche" class="quick-create-target-input" />
                            <div id="quick-link-target-result" class="quick-create-search-result" hidden></div>
                        </div>
                    </div>
                    <div class="flex-row-force quick-create-kind-row">
                        <label class="quick-create-kind-label" for="quick-link-kind">Lien</label>
                        <select id="quick-link-kind" class="flex-grow-input"></select>
                    </div>
                    <div id="quick-link-context" class="quick-create-context"></div>
                    <button type="button" id="quick-link-apply" class="mini-btn primary quick-create-panel-action">Lier</button>
                </section>

                <section class="quick-create-block quick-create-panel is-hidden" data-panel="node">
                    <div class="quick-create-block-head">Creer une nouvelle fiche</div>
                    <div class="quick-create-node-row">
                        <button type="button" class="mini-btn quick-create-node-btn active" data-create-type="${TYPES.PERSON}">Personne</button>
                        <button type="button" class="mini-btn quick-create-node-btn" data-create-type="${TYPES.GROUP}">Groupe</button>
                        <button type="button" class="mini-btn quick-create-node-btn" data-create-type="${TYPES.COMPANY}">Entreprise</button>
                    </div>
                    <div class="quick-create-field-stack">
                        <label class="quick-create-field-label" for="quick-create-node-name">Nom</label>
                        <input id="quick-create-node-name" type="text" placeholder="Nom de la fiche" class="quick-create-target-input" />
                    </div>
                    <div id="quick-create-node-context" class="quick-create-context"></div>
                    <button type="button" id="quick-create-node-apply" class="mini-btn primary quick-create-panel-action">Creer la fiche</button>
                </section>
            </div>
        </div>
    `;

    actEl.innerHTML = '';

    const actorName = collab.user?.username || '';
    let draftTargetType = TYPES.PERSON;
    const nodeContextEl = document.getElementById('quick-create-node-context');
    const nodeInput = document.getElementById('quick-create-node-name');
    const nodeApplyBtn = document.getElementById('quick-create-node-apply');
    const linkSourceInput = document.getElementById('quick-link-source');
    const linkSourceResultEl = document.getElementById('quick-link-source-result');
    const linkContextEl = document.getElementById('quick-link-context');
    const linkTargetInput = document.getElementById('quick-link-target');
    const linkTargetResultEl = document.getElementById('quick-link-target-result');
    const linkKindSelect = document.getElementById('quick-link-kind');
    const linkApplyBtn = document.getElementById('quick-link-apply');
    const tabButtons = Array.from(document.querySelectorAll('.quick-create-tab'));
    const panelEls = Array.from(document.querySelectorAll('.quick-create-panel'));
    const linkDraftTypes = {
        source: TYPES.PERSON,
        target: TYPES.PERSON
    };
    const linkCreateState = {
        source: false,
        target: false
    };

    const defaultBaseName = () => (
        draftTargetType === TYPES.COMPANY
            ? 'Nouvelle entreprise'
            : (draftTargetType === TYPES.GROUP ? 'Nouveau groupe' : 'Nouvelle personne')
    );

    const findNodeByName = (value) => {
        const targetName = String(value || '').trim().toLowerCase();
        if (!targetName) return null;
        return state.nodes.find((node) => String(node.name || '').trim().toLowerCase() === targetName) || null;
    };

    const normalizeNodeName = (value) => String(value || '').replace(/\s+/g, ' ').trim();

    const getLinkDraftType = (field) => linkDraftTypes[field] || TYPES.PERSON;
    const setLinkDraftType = (field, type) => {
        if (!Object.prototype.hasOwnProperty.call(linkDraftTypes, field)) return;
        linkDraftTypes[field] = TYPE_LABEL[type] ? type : TYPES.PERSON;
    };

    const getLinkEndpoint = (field) => {
        const input = field === 'source' ? linkSourceInput : linkTargetInput;
        const name = normalizeNodeName(input?.value);
        if (!name) return null;
        const existingNode = findNodeByName(name);
        if (existingNode) {
            return {
                mode: 'existing',
                name: existingNode.name,
                type: existingNode.type,
                node: existingNode,
                id: existingNode.id
            };
        }
        return {
            mode: 'draft',
            name,
            type: getLinkDraftType(field),
            node: null,
            id: ''
        };
    };

    const resolveLinkSource = () => {
        const endpoint = getLinkEndpoint('source');
        return endpoint?.mode === 'existing' ? endpoint.node : null;
    };
    const resolveLinkTarget = () => {
        const endpoint = getLinkEndpoint('target');
        return endpoint?.mode === 'existing' ? endpoint.node : null;
    };
    const isDraftEndpoint = (endpoint) => endpoint?.mode === 'draft' && Boolean(endpoint?.name);
    const formatTypeLabelLower = (type) => String(TYPE_LABEL[type] || 'Fiche').toLowerCase();

    const hideLinkResults = (resultsEl) => {
        if (!resultsEl) return;
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
    };

    const queryLinkNodes = (query, options = {}) => {
        const normalizedQuery = String(query || '').trim().toLowerCase();
        const excludeIds = new Set((options.excludeIds || []).map((value) => String(value)));
        if (!normalizedQuery) return [];
        return searchableNodes
            .filter((node) => String(node?.name || '').toLowerCase().includes(normalizedQuery))
            .filter((node) => !excludeIds.has(String(node?.id || '')))
            .slice(0, 8);
    };

    const renderLinkResults = (resultsEl, field, query, nodes, onPick) => {
        if (!resultsEl) return;
        const cleanQuery = normalizeNodeName(query);
        if (!cleanQuery) {
            linkCreateState[field] = false;
            hideLinkResults(resultsEl);
            return;
        }

        const exactMatch = findNodeByName(cleanQuery);
        if (exactMatch) linkCreateState[field] = false;
        const draftType = getLinkDraftType(field);
        const createExpanded = !exactMatch && !!linkCreateState[field];
        const existingHits = nodes.map((node) => `
            <button
                type="button"
                class="quick-create-search-hit"
                data-id="${escapeHtml(String(node.id || ''))}"
                title="${escapeHtml(TYPE_LABEL[node.type] || node.type || '')}"
            >${escapeHtml(String(node.name || 'Sans nom'))}
            </button>
        `).join('');
        const createMarkup = exactMatch ? '' : `
            <div class="quick-create-search-create-wrap ${createExpanded ? 'is-active' : ''}">
                <button type="button" class="quick-create-search-hit quick-create-search-hit-create" data-create-field="${escapeHtml(field)}">
                    Ou creer "${escapeHtml(cleanQuery)}"
                </button>
                ${createExpanded ? `
                    <span class="quick-create-search-create-label">Type</span>
                    <div class="quick-create-type-switch" role="group" aria-label="Type de creation">
                        ${[TYPES.PERSON, TYPES.GROUP, TYPES.COMPANY].map((type) => `
                            <button
                                type="button"
                                class="quick-create-type-chip ${draftType === type ? 'active' : ''}"
                                data-create-field-type="${escapeHtml(field)}"
                                data-type="${escapeHtml(type)}"
                            >${escapeHtml(TYPE_LABEL[type] || type)}</button>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
        const existingMarkup = (existingHits && !createExpanded) ? `<div class="quick-create-search-list">${existingHits}</div>` : '';
        const emptyMarkup = (!existingHits && !createMarkup)
            ? '<span class="quick-create-search-empty">Aucun resultat</span>'
            : '';

        resultsEl.hidden = false;
        resultsEl.innerHTML = `${existingMarkup}${createMarkup}${emptyMarkup}`;

        Array.from(resultsEl.querySelectorAll('.quick-create-search-hit')).forEach((btn) => {
            btn.onmousedown = (event) => {
                event.preventDefault();
            };
            btn.onclick = () => {
                const createField = btn.getAttribute('data-create-field') || '';
                if (createField) {
                    const input = createField === 'source' ? linkSourceInput : linkTargetInput;
                    if (input) input.value = cleanQuery;
                    linkCreateState[createField] = !linkCreateState[createField];
                    renderLinkResults(resultsEl, createField, cleanQuery, nodes, onPick);
                    updateLinkState();
                    return;
                }
                const nodeId = btn.getAttribute('data-id') || '';
                const pickedNode = state.nodes.find((node) => String(node.id) === String(nodeId)) || null;
                if (pickedNode) {
                    linkCreateState[field] = false;
                    if (typeof onPick === 'function') onPick(pickedNode);
                }
            };
        });

        Array.from(resultsEl.querySelectorAll('.quick-create-type-chip')).forEach((btn) => {
            btn.onmousedown = (event) => {
                event.preventDefault();
                event.stopPropagation();
            };
            btn.onclick = () => {
                const fieldName = btn.getAttribute('data-create-field-type') || '';
                const nextType = btn.getAttribute('data-type') || TYPES.PERSON;
                if (!fieldName) return;
                setLinkDraftType(fieldName, nextType);
                renderLinkResults(resultsEl, fieldName, cleanQuery, nodes, onPick);
                updateLinkState();
            };
        });
    };

    const setLinkKindPlaceholder = (label = 'Choisir source et cible') => {
        if (!linkKindSelect) return;
        linkKindSelect.innerHTML = `<option value="">${escapeHtml(label)}</option>`;
        linkKindSelect.disabled = true;
    };

    const updateKindOptions = () => {
        if (!linkKindSelect) return;
        const source = getLinkEndpoint('source');
        const target = getLinkEndpoint('target');
        const currentKind = String(linkKindSelect.value || '').trim();
        if (!source || !target) {
            setLinkKindPlaceholder();
            return;
        }
        if (
            (source.id && target.id && String(source.id) === String(target.id))
            || source.name.toLowerCase() === target.name.toLowerCase()
        ) {
            setLinkKindPlaceholder('Source et cible identiques');
            return;
        }
        const allowedKinds = Array.from(getAllowedKinds(source.type, target.type));
        linkKindSelect.innerHTML = Array.from(allowedKinds).map((kind) => `
            <option value="${kind}">${linkKindEmoji(kind)} ${kindToLabel(kind)}</option>
        `).join('');
        linkKindSelect.disabled = false;
        if (allowedKinds.includes(currentKind)) {
            linkKindSelect.value = currentKind;
        } else if (allowedKinds.length) {
            linkKindSelect.value = allowedKinds[0];
        }
    };

    const setActiveCreateTab = (tab) => {
        const nextTab = tab === 'link' ? 'link' : 'node';
        tabButtons.forEach((btn) => {
            const isActive = btn.getAttribute('data-create-tab') === nextTab;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        panelEls.forEach((panel) => {
            panel.classList.toggle('is-hidden', panel.getAttribute('data-panel') !== nextTab);
        });
        if (nextTab === 'link') {
            linkSourceInput?.focus();
        } else {
            nodeInput?.focus();
        }
    };

    const updateNodeState = () => {
        const typedName = String(nodeInput?.value || '').trim();
        const existingNode = typedName
            ? state.nodes.find((node) => String(node.name || '').trim().toLowerCase() === typedName.toLowerCase())
            : null;
        Array.from(document.querySelectorAll('.quick-create-node-btn')).forEach((btn) => {
            const isActive = btn.getAttribute('data-create-type') === draftTargetType;
            btn.classList.toggle('active', isActive);
        });

        if (nodeContextEl) {
            if (existingNode) {
                nodeContextEl.textContent = 'Cette fiche existe deja. Le bouton ouvrira directement cette fiche.';
            } else {
                nodeContextEl.textContent = `Creer une nouvelle ${TYPE_LABEL[draftTargetType] || 'fiche'}.`;
            }
        }

        if (nodeApplyBtn) {
            nodeApplyBtn.textContent = existingNode ? 'Ouvrir la fiche' : 'Creer la fiche';
        }
    };

    const updateLinkState = () => {
        const source = getLinkEndpoint('source');
        const target = getLinkEndpoint('target');
        const sameEndpoint = Boolean(source && target && (
            (source.id && target.id && String(source.id) === String(target.id))
            || source.name.toLowerCase() === target.name.toLowerCase()
        ));
        const usesDraft = isDraftEndpoint(source) || isDraftEndpoint(target);

        if (linkContextEl) {
            if (source && target && !sameEndpoint) {
                if (isDraftEndpoint(source) && isDraftEndpoint(target)) {
                    linkContextEl.textContent = `Creer ${source.name} comme ${formatTypeLabelLower(source.type)} et ${target.name} comme ${formatTypeLabelLower(target.type)}, puis ajouter la liaison.`;
                } else if (isDraftEndpoint(source)) {
                    linkContextEl.textContent = `Creer ${source.name} comme ${formatTypeLabelLower(source.type)} puis le lier a ${target.name}.`;
                } else if (isDraftEndpoint(target)) {
                    linkContextEl.textContent = `Creer ${target.name} comme ${formatTypeLabelLower(target.type)} puis le lier a ${source.name}.`;
                } else {
                    linkContextEl.textContent = `Relier ${source.name} vers ${target.name}.`;
                }
            } else if (source && target) {
                linkContextEl.textContent = 'Choisis deux fiches differentes.';
            } else if (source) {
                linkContextEl.textContent = isDraftEndpoint(source)
                    ? `La source sera creee comme ${formatTypeLabelLower(source.type)}. Choisis maintenant la cible.`
                    : 'Choisis maintenant la cible.';
            } else if (target) {
                linkContextEl.textContent = isDraftEndpoint(target)
                    ? `La cible sera creee comme ${formatTypeLabelLower(target.type)}. Choisis maintenant la source.`
                    : 'Choisis maintenant la source.';
            } else {
                linkContextEl.textContent = 'Tape un nom. Si la fiche n existe pas, elle pourra etre creee ici puis liee directement.';
            }
        }

        if (linkApplyBtn) {
            const ready = source && target && !sameEndpoint;
            linkApplyBtn.textContent = !ready ? 'Choisir source et cible' : (usesDraft ? 'Creer et lier' : 'Lier');
            linkApplyBtn.disabled = !ready;
        }

        updateKindOptions();
    };

    Array.from(document.querySelectorAll('.quick-create-node-btn')).forEach((btn) => {
        btn.onclick = () => {
            draftTargetType = btn.getAttribute('data-create-type') || TYPES.PERSON;
            updateNodeState();
        };
    });
    tabButtons.forEach((btn) => {
        btn.onclick = () => setActiveCreateTab(btn.getAttribute('data-create-tab') || 'node');
    });

    if (nodeInput) {
        nodeInput.oninput = () => updateNodeState();
        nodeInput.onkeydown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                nodeApplyBtn?.click();
            }
        };
    }

    if (linkSourceInput) {
        linkSourceInput.oninput = () => {
            linkCreateState.source = false;
            renderLinkResults(
                linkSourceResultEl,
                'source',
                linkSourceInput.value,
                queryLinkNodes(linkSourceInput.value, {
                    excludeIds: [resolveLinkTarget()?.id].filter(Boolean)
                }),
                (pickedNode) => {
                    linkSourceInput.value = pickedNode.name;
                    hideLinkResults(linkSourceResultEl);
                    updateLinkState();
                    linkTargetInput?.focus();
                }
            );
            updateLinkState();
        };
        linkSourceInput.onfocus = () => {
            renderLinkResults(
                linkSourceResultEl,
                'source',
                linkSourceInput.value,
                queryLinkNodes(linkSourceInput.value, {
                    excludeIds: [resolveLinkTarget()?.id].filter(Boolean)
                }),
                (pickedNode) => {
                    linkSourceInput.value = pickedNode.name;
                    hideLinkResults(linkSourceResultEl);
                    updateLinkState();
                    linkTargetInput?.focus();
                }
            );
        };
        linkSourceInput.onblur = () => {
            window.setTimeout(() => hideLinkResults(linkSourceResultEl), 120);
        };
        linkSourceInput.onkeydown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                if (getLinkEndpoint('source')) linkTargetInput?.focus();
            }
        };
    }

    if (linkTargetInput) {
        linkTargetInput.oninput = () => {
            linkCreateState.target = false;
            renderLinkResults(
                linkTargetResultEl,
                'target',
                linkTargetInput.value,
                queryLinkNodes(linkTargetInput.value, {
                    excludeIds: [resolveLinkSource()?.id].filter(Boolean)
                }),
                (pickedNode) => {
                    linkTargetInput.value = pickedNode.name;
                    hideLinkResults(linkTargetResultEl);
                    updateLinkState();
                }
            );
            updateLinkState();
        };
        linkTargetInput.onfocus = () => {
            renderLinkResults(
                linkTargetResultEl,
                'target',
                linkTargetInput.value,
                queryLinkNodes(linkTargetInput.value, {
                    excludeIds: [resolveLinkSource()?.id].filter(Boolean)
                }),
                (pickedNode) => {
                    linkTargetInput.value = pickedNode.name;
                    hideLinkResults(linkTargetResultEl);
                    updateLinkState();
                }
            );
        };
        linkTargetInput.onblur = () => {
            window.setTimeout(() => hideLinkResults(linkTargetResultEl), 120);
        };
        linkTargetInput.onkeydown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                linkApplyBtn?.click();
            }
        };
    }

    if (nodeApplyBtn) {
        nodeApplyBtn.onclick = () => {
            const typedName = String(nodeInput?.value || '').trim();
            const finalName = typedName || defaultBaseName();
            const existingTarget = state.nodes.find((node) => String(node.name || '').trim().toLowerCase() === finalName.toLowerCase()) || null;

            if (existingTarget) {
                modalOverlay.style.display = 'none';
                zoomToNode(existingTarget.id);
                return;
            }

            const targetNode = ensureNode(draftTargetType, finalName);
            logNodeAdded(targetNode.name, actorName);
            refreshLists();
            restartSim();
            scheduleSave();

            modalOverlay.style.display = 'none';
            zoomToNode(targetNode.id);
        };
    }

    if (linkApplyBtn) {
        linkApplyBtn.onclick = () => {
            const sourceEndpoint = getLinkEndpoint('source');
            const targetEndpoint = getLinkEndpoint('target');

            if (!sourceEndpoint || !targetEndpoint) {
                showCustomAlert('Choisis une source et une cible.');
                return;
            }

            if (
                (sourceEndpoint.id && targetEndpoint.id && String(sourceEndpoint.id) === String(targetEndpoint.id))
                || sourceEndpoint.name.toLowerCase() === targetEndpoint.name.toLowerCase()
            ) {
                showCustomAlert('Source et cible identiques.');
                return;
            }

            const createdNodes = [];
            const resolveEndpointNode = (endpoint) => {
                if (endpoint?.mode === 'existing' && endpoint.node) {
                    return endpoint.node;
                }
                const alreadyExisting = findNodeByName(endpoint?.name);
                if (alreadyExisting) return alreadyExisting;
                const createdNode = ensureNode(endpoint?.type || TYPES.PERSON, endpoint?.name || defaultBaseName());
                createdNodes.push(createdNode);
                return createdNode;
            };

            const sourceNode = resolveEndpointNode(sourceEndpoint);
            const targetNode = resolveEndpointNode(targetEndpoint);

            createdNodes.forEach((node) => logNodeAdded(node.name, actorName));
            if (createdNodes.length) {
                refreshLists();
                restartSim();
            }

            const created = addLink(sourceNode.id, targetNode.id, String(linkKindSelect?.value || '').trim() || null, { actor: actorName });
            if (!created) {
                if (createdNodes.length) scheduleSave();
                showCustomAlert('Lien deja existant ou invalide.');
                return;
            }

            hideLinkResults(linkSourceResultEl);
            hideLinkResults(linkTargetResultEl);
            modalOverlay.style.display = 'none';
            zoomToNode(sourceNode.id);
        };
    }

    const closeBtn = document.getElementById('quick-create-close');
    if (closeBtn) closeBtn.onclick = () => { modalOverlay.style.display = 'none'; };

    updateNodeState();
    updateLinkState();
    setActiveCreateTab('link');

    modalOverlay.style.display = 'flex';
    linkSourceInput?.focus();
}

function openHvtAssistant() {
    state.hvtMode = true;
    calculateHVT();
    showHvtPanel();
    const btnHVT = document.getElementById('btnHVT');
    if (btnHVT) btnHVT.classList.add('active');
}

function openIntelAssistant(scope = 'selection') {
    state.aiSettings.intelUnlocked = true;
    state.aiSettings.scope = (scope === 'selection' && state.selection) ? 'selection' : 'global';
    scheduleSave();

    showIntelPanel();
    const btnIntel = document.getElementById('btnIntel');
    if (btnIntel) btnIntel.classList.add('active');
    updateIntelButtonLockVisual();

    const badgeEl = document.getElementById('quickIntelBadge');
    if (badgeEl) badgeEl.textContent = '0';
}

function openOperatorIAMode() {
    if (!modalOverlay) createModal();
    setModalMode('aihub');
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if (!msgEl || !actEl) return;

    msgEl.innerHTML = `
        <div class="ai-hub">
            <div class="ai-hub-head">
                <div class="ai-hub-copy">
                    <div class="ai-hub-kicker">Operateur IA</div>
                    <div class="ai-hub-title">Choisis un assistant</div>
                </div>
                <button type="button" class="ai-hub-close" id="ai-hub-close">Fermer</button>
            </div>
            <div class="ai-hub-grid">
                <button type="button" class="ai-hub-card" data-ai-open="intel-global">
                    <span class="ai-hub-card-corner ai-hub-card-corner-tl" aria-hidden="true"></span>
                    <span class="ai-hub-card-corner ai-hub-card-corner-br" aria-hidden="true"></span>
                    <span class="ai-hub-card-icon" aria-hidden="true">
                        <svg viewBox="0 0 120 120" role="presentation">
                            <g fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round" transform="translate(25 26) scale(2.85)">
                                <g transform="rotate(38 12 12)">
                                    <path d="M9 17H7A5 5 0 0 1 7 7h2"/>
                                    <path d="M15 7h2a5 5 0 1 1 0 10h-2"/>
                                    <path d="M8.5 12h7"/>
                                </g>
                            </g>
                            <path d="m81 20 3.4 9.3L94 32.7l-9.3 3.4L81 45.4l-3.4-9.3-9.3-3.4 9.3-3.4L81 20Z" fill="currentColor"/>
                            <path d="m44 60 5.4 2-3 2.9 6.3 2.3" fill="none" stroke="currentColor" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    <span class="ai-hub-card-title">Prediction IA</span>
                    <span class="ai-hub-card-desc">Cherche des liaisons utiles sur l'ensemble du graphe.</span>
                </button>
                <button type="button" class="ai-hub-card" data-ai-open="hvt">
                    <span class="ai-hub-card-corner ai-hub-card-corner-tl" aria-hidden="true"></span>
                    <span class="ai-hub-card-corner ai-hub-card-corner-br" aria-hidden="true"></span>
                    <span class="ai-hub-card-icon" aria-hidden="true">
                        <svg viewBox="0 0 120 120" role="presentation">
                            <circle cx="60" cy="50" r="10" fill="currentColor"/>
                            <circle cx="35" cy="28" r="5.8" fill="currentColor"/>
                            <circle cx="92" cy="24" r="5.8" fill="currentColor"/>
                            <circle cx="100" cy="76" r="5.8" fill="currentColor"/>
                            <circle cx="40" cy="82" r="5.8" fill="currentColor"/>
                            <circle cx="30" cy="60" r="5.8" fill="currentColor"/>
                            <path d="M60 50 35 28M60 50 92 24M60 50 100 76M60 50 40 82M60 50 30 60" fill="none" stroke="currentColor" stroke-width="4.8" stroke-linecap="round"/>
                        </svg>
                    </span>
                    <span class="ai-hub-card-title">Cible importante</span>
                    <span class="ai-hub-card-desc">Affiche directement le classement HVT.</span>
                </button>
            </div>
        </div>
    `;

    actEl.innerHTML = '';

    const closeBtn = document.getElementById('ai-hub-close');
    if (closeBtn) closeBtn.onclick = () => { modalOverlay.style.display = 'none'; };

    Array.from(document.querySelectorAll('[data-ai-open]')).forEach((btn) => {
        btn.onclick = () => {
            const action = btn.getAttribute('data-ai-open') || '';
            modalOverlay.style.display = 'none';
            if (action === 'hvt') {
                openHvtAssistant();
                return;
            }
            if (action === 'intel-global') {
                openIntelAssistant('global');
                return;
            }
        };
    });

    modalOverlay.style.display = 'flex';
}

// --- SYSTÈME DE GESTION DES DONNÉES (MENU) ---

function showDataMenu(mode) {
    if(!modalOverlay) createModal();
    setModalMode('default');
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if (!msgEl || !actEl) return;

    const localSaveLocked = mode === 'save' && isLocalSaveLocked();
    let storageMode = 'local';

    let title = "";
    if(mode === 'save') title = `SAUVEGARDER`;
    if(mode === 'load') title = "OUVRIR UN RÉSEAU";
    if(mode === 'merge') title = "FUSIONNER DES DONNÉES";

    const renderMenu = () => {
        const isLocalMode = storageMode === 'local';
        const isCloudMode = storageMode === 'cloud';
        const localModeInfo = `
            <div class="modal-note">
                Les fichiers doivent etre partages via Discord.<br>
                Impossible de sauvegarder en ville depuis la tablette, copiez et transpetez le texte brute.
            </div>
        `;

        msgEl.innerHTML = `
            <div class="modal-tool">
                <h3 class="modal-tool-title">${title}</h3>
                <div class="modal-segment">
                    <button type="button" id="data-mode-local" class="${isLocalMode ? 'primary ' : ''}modal-segment-btn">Sauvegarde locale</button>
                    <button type="button" id="data-mode-cloud" class="${isCloudMode ? 'primary ' : ''}modal-segment-btn">Sauvegarde cloud</button>
                </div>
                ${isLocalMode ? localModeInfo : '<div class="modal-note">Le mode cloud utilise les boards et les droits de compte.</div>'}
                ${localSaveLocked && isLocalMode ? '<div class="modal-note modal-note-warning">Mode partage: export local bloque (owner only).</div>' : ''}
            </div>
        `;

        actEl.innerHTML = '';

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = 'Fermer';
        closeBtn.onclick = () => { modalOverlay.style.display = 'none'; };

        if (isCloudMode) {
            const cloudBtn = document.createElement('button');
            cloudBtn.className = 'primary';
            cloudBtn.innerHTML = 'Ouvrir menu cloud';
            cloudBtn.onclick = () => showCloudMenu();

            if (mode === 'save' && isCloudBoardActive()) {
                const saveCloudBtn = document.createElement('button');
                saveCloudBtn.className = 'primary';
                saveCloudBtn.innerHTML = 'Sauver board cloud';
                saveCloudBtn.onclick = async () => {
                    await saveActiveCloudBoard({ manual: true, quiet: false });
                };
                actEl.appendChild(saveCloudBtn);
            }

            actEl.appendChild(cloudBtn);
            actEl.appendChild(closeBtn);
        } else {
            const btnFile = document.createElement('button');
            btnFile.innerHTML = (mode === 'save') ? 'Fichier (.json)' : 'Depuis ordi';
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
            btnText.innerHTML = (mode === 'save') ? 'Copier texte' : 'Coller texte';
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
                            showCustomAlert("JSON copie dans le presse-papier.");
                        })
                        .catch(() => showCustomAlert("Erreur copie clipboard"));
                } else {
                    showRawDataInput(mode);
                }
            };

            if (localSaveLocked) {
                btnFile.classList.add('is-disabled-visual');
                btnText.classList.add('is-disabled-visual');
            }

            actEl.appendChild(btnFile);
            actEl.appendChild(btnText);
            actEl.appendChild(closeBtn);
        }

        const localModeBtn = document.getElementById('data-mode-local');
        const cloudModeBtn = document.getElementById('data-mode-cloud');
        if (localModeBtn) {
            localModeBtn.onclick = () => {
                storageMode = 'local';
                renderMenu();
            };
        }
        if (cloudModeBtn) {
            cloudModeBtn.onclick = () => {
                storageMode = 'cloud';
                renderMenu();
            };
        }
    };

    renderMenu();
    modalOverlay.style.display = 'flex';
}

function showRawDataInput(mode) {
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');

    msgEl.innerHTML = `
        <div class="modal-tool">
            <h3 class="modal-tool-title">DATA BRUTE JSON (${mode === 'merge' ? 'FUSION' : 'OUVERTURE'})</h3>
            <textarea id="rawJsonInput" placeholder="Collez le code JSON ici..." class="modal-raw-input"></textarea>
        </div>
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

function normalizeMergeText(value) {
    return String(value ?? '').trim().toLowerCase();
}

function pushIndexedNode(map, key, node) {
    if (!key) return;
    let bucket = map.get(key);
    if (!bucket) {
        bucket = new Set();
        map.set(key, bucket);
    }
    bucket.add(node);
}

function getUniqueIndexedNode(map, key) {
    const bucket = map.get(key);
    if (!bucket || bucket.size !== 1) return null;
    return bucket.values().next().value || null;
}

function normalizeImportedNode(rawNode, fallbackId = `node_${uid()}`) {
    const source = rawNode && typeof rawNode === 'object' ? rawNode : {};
    const type = [TYPES.PERSON, TYPES.GROUP, TYPES.COMPANY].includes(source.type) ? source.type : TYPES.PERSON;
    const x = Number(source.x);
    const y = Number(source.y);
    const rawDescription = typeof source.description === 'string' ? source.description : String(source.notes || '');
    const rawNotes = typeof source.notes === 'string' ? source.notes : String(source.description || '');

    return {
        ...source,
        id: String(source.id ?? fallbackId),
        name: String(source.name || '').trim() || 'Sans nom',
        type,
        color: (typeof source.color === 'string' && source.color.trim())
            ? sanitizeNodeColor(source.color.trim())
            : (type === TYPES.PERSON ? '#ffffff' : '#cfd8e3'),
        manualColor: Boolean(source.manualColor),
        personStatus: normalizePersonStatus(source.personStatus, type),
        num: typeof source.num === 'string' ? source.num : String(source.num ?? ''),
        accountNumber: typeof source.accountNumber === 'string' ? source.accountNumber : '',
        citizenNumber: typeof source.citizenNumber === 'string' ? source.citizenNumber : '',
        linkedMapPointId: typeof source.linkedMapPointId === 'string' ? source.linkedMapPointId : String(source.linkedMapPointId ?? ''),
        description: rawDescription,
        notes: rawNotes,
        x: Number.isFinite(x) ? x : (Math.random() - 0.5) * 100,
        y: Number.isFinite(y) ? y : (Math.random() - 0.5) * 100,
        fixed: Boolean(source.fixed)
    };
}

function normalizeImportedLink(rawLink) {
    if (!rawLink || typeof rawLink !== 'object') return null;
    const source = normalizeLinkEndpoint(rawLink.source ?? rawLink.from);
    const target = normalizeLinkEndpoint(rawLink.target ?? rawLink.to);
    if (!source || !target || source === target) return null;

    return {
        id: String(rawLink.id || `link_${uid()}`),
        source,
        target,
        kind: String(rawLink.kind || 'relation')
    };
}

function indexNodeForMerge(indexes, node) {
    if (!node || typeof node !== 'object') return;
    pushIndexedNode(indexes.byId, normalizeMergeText(node.id), node);
    pushIndexedNode(indexes.byCitizenNumber, normalizeMergeText(node.citizenNumber), node);
    pushIndexedNode(indexes.byAccountNumber, normalizeMergeText(node.accountNumber), node);
    pushIndexedNode(indexes.byNum, normalizeMergeText(node.num), node);
    pushIndexedNode(indexes.byNameType, `${normalizeMergeText(node.type)}|${normalizeMergeText(node.name)}`, node);
}

function buildNodeMergeIndexes(nodes) {
    const indexes = {
        byId: new Map(),
        byCitizenNumber: new Map(),
        byAccountNumber: new Map(),
        byNum: new Map(),
        byNameType: new Map()
    };

    nodes.forEach((node) => indexNodeForMerge(indexes, node));
    return indexes;
}

function findMergeTarget(indexes, node) {
    const exactId = getUniqueIndexedNode(indexes.byId, normalizeMergeText(node.id));
    if (exactId) return exactId;

    const citizenMatch = getUniqueIndexedNode(indexes.byCitizenNumber, normalizeMergeText(node.citizenNumber));
    if (citizenMatch) return citizenMatch;

    const accountMatch = getUniqueIndexedNode(indexes.byAccountNumber, normalizeMergeText(node.accountNumber));
    if (accountMatch) return accountMatch;

    const numMatch = getUniqueIndexedNode(indexes.byNum, normalizeMergeText(node.num));
    if (numMatch) return numMatch;

    if (String(node.type || '') !== TYPES.PERSON) {
        return getUniqueIndexedNode(indexes.byNameType, `${normalizeMergeText(node.type)}|${normalizeMergeText(node.name)}`);
    }

    return null;
}

function mergeImportedNodeIntoExisting(existingNode, incomingNode) {
    if (!existingNode || !incomingNode) return false;

    let changed = false;
    const fillBlank = (field) => {
        const current = String(existingNode[field] ?? '').trim();
        const next = String(incomingNode[field] ?? '').trim();
        if (!current && next) {
            existingNode[field] = incomingNode[field];
            changed = true;
        }
    };

    fillBlank('accountNumber');
    fillBlank('citizenNumber');
    fillBlank('num');
    fillBlank('linkedMapPointId');
    fillBlank('description');
    fillBlank('notes');

    if ((!existingNode.color || existingNode.color === '#ffffff' || existingNode.color === '#cfd8e3') && incomingNode.color && existingNode.color !== incomingNode.color) {
        existingNode.color = incomingNode.color;
        changed = true;
    }

    if (!String(existingNode.name || '').trim() && String(incomingNode.name || '').trim()) {
        existingNode.name = incomingNode.name;
        changed = true;
    }

    if (!existingNode.type && incomingNode.type) {
        existingNode.type = incomingNode.type;
        changed = true;
    }

    if (existingNode.type === TYPES.PERSON && incomingNode.type === TYPES.PERSON) {
        const currentStatus = normalizePersonStatus(existingNode.personStatus, existingNode.type);
        const incomingStatus = normalizePersonStatus(incomingNode.personStatus, incomingNode.type);
        const currentPriority = currentStatus === PERSON_STATUS.DECEASED ? 2 : (currentStatus === PERSON_STATUS.MISSING ? 1 : 0);
        const incomingPriority = incomingStatus === PERSON_STATUS.DECEASED ? 2 : (incomingStatus === PERSON_STATUS.MISSING ? 1 : 0);
        if (incomingPriority > currentPriority) {
            existingNode.personStatus = incomingStatus;
            changed = true;
        }
    }

    return changed;
}

function downloadJSON() {
    if (isLocalSaveLocked()) {
        showCustomAlert("Export local bloque: seul le lead peut dupliquer/sauvegarder en local.");
        return;
    }

    const data = generateExportData();
    const fileName = buildExportFilename();
    downloadExportData(data, fileName);
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
        if (!d || !Array.isArray(d.nodes) || !Array.isArray(d.links)) {
            if (!silent) showCustomAlert('FORMAT DE FICHIER INVALIDE.');
            return false;
        }

        if (!silent && (state.nodes.length || state.links.length)) {
            pushHistory();
        }

        const usedNodeIds = new Set();
        state.nodes = d.nodes.map((rawNode, index) => {
            const node = normalizeImportedNode(rawNode, `node_${uid()}_${index}`);
            while (!node.id || usedNodeIds.has(String(node.id))) {
                node.id = `node_${uid()}_${index}`;
            }
            usedNodeIds.add(String(node.id));
            return node;
        });

        const validNodeIds = new Set(state.nodes.map((node) => String(node.id)));
        const linkIds = new Set();
        const linkSigs = new Set();
        state.links = d.links
            .map((rawLink) => normalizeImportedLink(rawLink))
            .filter((link) => {
                if (!link) return false;
                if (!validNodeIds.has(String(link.source)) || !validNodeIds.has(String(link.target))) return false;

                const sig = linkSignature(link.source, link.target, link.kind);
                if (linkSigs.has(sig)) return false;

                while (!link.id || linkIds.has(String(link.id))) {
                    link.id = `link_${uid()}`;
                }

                linkIds.add(String(link.id));
                linkSigs.add(sig);
                return true;
            });

        if (d.physicsSettings) state.physicsSettings = d.physicsSettings;
        if (d.meta && d.meta.projectName) state.projectName = d.meta.projectName;
        else state.projectName = null;

        const numericIds = state.nodes.map(n => Number(n.id)).filter(Number.isFinite);
        if (numericIds.length) state.nextId = Math.max(...numericIds) + 1;
        ensureLinkIds();
        updatePersonColors();
        restartSim(); refreshLists();
        if (!silent) showCustomAlert('OUVERTURE RÉUSSIE.');
    }
    else if (mode === 'merge') {
        const incomingNodes = Array.isArray(d?.nodes) ? d.nodes : [];
        const incomingLinks = Array.isArray(d?.links) ? d.links : [];

        let addedNodes = 0;
        let enrichedNodes = 0;
        let addedLinks = 0;

        const idMap = new Map();
        const mergeIndexes = buildNodeMergeIndexes(state.nodes);

        if (!silent && (incomingNodes.length || incomingLinks.length)) {
            pushHistory();
        }

        incomingNodes.forEach((rawNode, index) => {
            const rawId = String(rawNode?.id ?? '');
            const normalizedNode = normalizeImportedNode(rawNode, `node_${uid()}_${index}`);
            const existing = findMergeTarget(mergeIndexes, normalizedNode);

            if (existing) {
                if (rawId) idMap.set(rawId, existing.id);
                if (mergeImportedNodeIntoExisting(existing, normalizedNode)) {
                    indexNodeForMerge(mergeIndexes, existing);
                    enrichedNodes++;
                }
                return;
            }

            while (!normalizedNode.id || getUniqueIndexedNode(mergeIndexes.byId, normalizeMergeText(normalizedNode.id)) || state.nodes.some((node) => String(node.id) === String(normalizedNode.id))) {
                normalizedNode.id = `node_${uid()}_${index}`;
            }

            state.nodes.push(normalizedNode);
            indexNodeForMerge(mergeIndexes, normalizedNode);
            if (rawId) idMap.set(rawId, normalizedNode.id);
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
                    nextId = `link_${uid()}`;
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
        if (!state.projectName && d?.meta?.projectName) {
            state.projectName = d.meta.projectName;
        }
        if (!silent) {
            showCustomAlert(`FUSION : ${addedNodes} NOUVEAUX ÉLÉMENTS, ${enrichedNodes} FICHES ENRICHIES, ${addedLinks} NOUVEAUX LIENS.`);
        }
    }
    saveState();
    return true;
}

function showIntelUnlock(onUnlock) {
    if(!modalOverlay) createModal();
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if(!msgEl || !actEl) return;

    msgEl.innerHTML = `
        <div class="modal-tool">
            <div class="modal-tool-title">Acces INTEL Premium</div>
            <div class="modal-note">Entrez le code d'acces</div>
            <input type="password" id="intel-unlock-input" placeholder="CODE D'ACCES" class="modal-input-standalone modal-input-center">
            <div id="intel-unlock-error" class="intel-unlock-error"></div>
        </div>
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
    if (!hud) return;
    hud.hidden = false;
    hud.innerHTML = '';

    const labelModes = [
        { value: 1, short: 'Auto', title: 'Mode normal' },
        { value: 2, short: 'Tous', title: 'Toujours afficher tous les noms' },
        { value: 0, short: 'Off', title: 'Masquer tous les noms' }
    ];
    const filterModes = [
        { value: FILTERS.ALL, short: 'Global' },
        { value: FILTERS.BUSINESS, short: 'Business' },
        { value: FILTERS.ILLEGAL, short: 'Conflit' },
        { value: FILTERS.SOCIAL, short: 'Social' }
    ];

    const title = document.createElement('div');
    title.className = 'hud-panel-title';
    title.textContent = 'Affichage';
    hud.appendChild(title);

    const btnLabels = document.createElement('button');
    btnLabels.className = 'hud-btn hud-mode-btn';
    const updateLabelBtn = () => {
        const current = labelModes.find((entry) => entry.value === state.labelMode) || labelModes[0];
        btnLabels.innerHTML = `<span>Noms · ${current.short}</span>`;
        btnLabels.title = current.title;
        btnLabels.classList.toggle('active', state.labelMode !== 1);
        btnLabels.classList.toggle('is-off', state.labelMode === 0);
    };
    updateLabelBtn();
    btnLabels.onclick = () => {
        const currentIndex = labelModes.findIndex((entry) => entry.value === state.labelMode);
        const next = labelModes[(currentIndex + 1 + labelModes.length) % labelModes.length] || labelModes[0];
        state.labelMode = next.value;
        updateLabelBtn();
        draw();
        scheduleSave();
    };
    hud.appendChild(btnLabels);

    const btnLinkTypes = document.createElement('button');
    btnLinkTypes.className = 'hud-btn hud-mode-btn';
    const updateLinkTypesBtn = () => {
        btnLinkTypes.innerHTML = `<span>Liens · ${state.showLinkTypes ? 'Types' : 'Base'}</span>`;
        btnLinkTypes.classList.toggle('active', !!state.showLinkTypes);
    };
    updateLinkTypesBtn();
    btnLinkTypes.onclick = () => {
        state.showLinkTypes = !state.showLinkTypes;
        updateLinkTypesBtn();
        updateLinkLegend();
        draw();
        scheduleSave();
    };
    hud.appendChild(btnLinkTypes);

    const btnFilterMode = document.createElement('button');
    btnFilterMode.className = 'hud-btn hud-mode-btn';
    const updateFilterBtn = () => {
        const current = filterModes.find((entry) => entry.value === state.activeFilter) || filterModes[0];
        btnFilterMode.innerHTML = `<span>Filtre · ${current.short}</span>`;
        btnFilterMode.classList.toggle('active', state.activeFilter !== FILTERS.ALL);
    };
    updateFilterBtn();
    btnFilterMode.onclick = () => {
        const currentIndex = filterModes.findIndex((entry) => entry.value === state.activeFilter);
        const next = filterModes[(currentIndex + 1 + filterModes.length) % filterModes.length] || filterModes[0];
        state.activeFilter = next.value;
        updateFilterBtn();
        updateLinkLegend();
        draw();
        scheduleSave();
    };
    hud.appendChild(btnFilterMode);

    const btnInfo = document.createElement('button');
    btnInfo.className = 'hud-btn hud-mode-btn';
    btnInfo.innerHTML = '<span>Info · Liens</span>';
    btnInfo.title = 'Ouvrir l aide sur les types de liens';
    btnInfo.onclick = () => showLinkGuide();
    hud.appendChild(btnInfo);
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
            <div>
                <div class="intel-title">LINK INTEL</div>
                <div class="intel-sub">Suggestions de liens prêtes a valider</div>
            </div>
            <div class="intel-close" id="btnIntelClose">✕</div>
        </div>
        <div class="intel-toolbar">
            <div class="intel-toolbar-row">
                <div class="intel-toolbar-label">Portee</div>
                <div class="intel-preset-group intel-grow">
                    <button id="intelScopeFocus" class="mini-btn">Cible active</button>
                    <button id="intelScopeGlobal" class="mini-btn">Reseau</button>
                </div>
                <span id="intelScopeName" class="intel-badge">--</span>
            </div>
            <div class="intel-toolbar-row">
                <div class="intel-toolbar-label">Preset</div>
                <div class="intel-preset-group intel-grow">
                    <button id="intelPresetQuick" class="mini-btn intel-preset-btn">Rapide</button>
                    <button id="intelPresetBalanced" class="mini-btn intel-preset-btn">Equilibre</button>
                    <button id="intelPresetWide" class="mini-btn intel-preset-btn">Large</button>
                </div>
            </div>
            <div class="intel-toolbar-row intel-toolbar-row-actions">
                <label class="intel-simple-toggle"><input id="intelShowPredicted" type="checkbox"/>Overlay</label>
                <label class="intel-simple-toggle"><input id="intelExplain" type="checkbox"/>Explications</label>
                <span id="intelCount" class="intel-badge">0</span>
                <button id="intelRun" class="mini-btn primary">Analyser</button>
                <button id="intelClear" class="mini-btn">Effacer</button>
            </div>
        </div>
        <details class="intel-advanced">
            <summary>Reglages avances</summary>
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
                    <input id="intelLimit" type="number" min="5" max="80" class="intel-input intel-limit-input"/>
                </div>
                <div class="intel-row intel-row-sources">
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
            </div>
        </details>
        <div id="intel-list" class="intel-results"></div>
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
    const presetQuick = document.getElementById('intelPresetQuick');
    const presetBalanced = document.getElementById('intelPresetBalanced');
    const presetWide = document.getElementById('intelPresetWide');
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

    if (!state.aiSettings.preset) state.aiSettings.preset = 'balanced';

    const syncPresetButtons = () => {
        const current = String(state.aiSettings.preset || '');
        if (presetQuick) presetQuick.classList.toggle('active', current === 'quick');
        if (presetBalanced) presetBalanced.classList.toggle('active', current === 'balanced');
        if (presetWide) presetWide.classList.toggle('active', current === 'wide');
    };

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

    const syncControlsFromState = () => {
        if (modeSel) modeSel.value = state.aiSettings.mode || 'decouverte';
        if (minScore) minScore.value = Math.round((state.aiSettings.minScore || 0.35) * 100);
        if (minScoreVal && minScore) minScoreVal.textContent = `${minScore.value}%`;
        if (novelty) novelty.value = Math.round((state.aiSettings.noveltyRatio || 0.25) * 100);
        if (noveltyVal && novelty) noveltyVal.textContent = `${novelty.value}%`;
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
        syncPresetButtons();
    };

    const applyPreset = (presetName) => {
        const preset = INTEL_PRESETS[presetName];
        if (!preset) return;
        state.aiSettings.preset = presetName;
        state.aiSettings.mode = preset.mode;
        state.aiSettings.minScore = preset.minScore;
        state.aiSettings.noveltyRatio = preset.noveltyRatio;
        state.aiSettings.limit = preset.limit;
        state.aiSettings.sources = { ...preset.sources };
        syncControlsFromState();
        scheduleSave();
        updateIntelPanel(true);
    };

    syncControlsFromState();

    if (modeSel) modeSel.onchange = () => {
        state.aiSettings.mode = modeSel.value;
        state.aiSettings.preset = 'custom';
        syncPresetButtons();
        scheduleSave();
        updateIntelPanel(true);
    };
    if (scopeFocus) scopeFocus.onclick = () => { setScope('selection'); updateIntelPanel(true); };
    if (scopeGlobal) scopeGlobal.onclick = () => { setScope('global'); updateIntelPanel(true); };
    if (presetQuick) presetQuick.onclick = () => applyPreset('quick');
    if (presetBalanced) presetBalanced.onclick = () => applyPreset('balanced');
    if (presetWide) presetWide.onclick = () => applyPreset('wide');

    if (minScore) minScore.oninput = () => {
        const val = Number(minScore.value) || 0;
        if (minScoreVal) minScoreVal.textContent = `${val}%`;
        state.aiSettings.minScore = clamp(val / 100, 0.1, 0.9);
        state.aiSettings.preset = 'custom';
        syncPresetButtons();
        scheduleSave();
    };
    if (minScore) minScore.onchange = () => updateIntelPanel(true);

    if (novelty) novelty.oninput = () => {
        const val = Number(novelty.value) || 0;
        if (noveltyVal) noveltyVal.textContent = `${val}%`;
        state.aiSettings.noveltyRatio = clamp(val / 100, 0, 0.6);
        state.aiSettings.preset = 'custom';
        syncPresetButtons();
        scheduleSave();
    };
    if (novelty) novelty.onchange = () => updateIntelPanel(true);

    if (limitInp) limitInp.onchange = () => {
        const val = Number(limitInp.value) || 20;
        state.aiSettings.limit = Math.max(5, Math.min(val, 80));
        limitInp.value = state.aiSettings.limit;
        state.aiSettings.preset = 'custom';
        syncPresetButtons();
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
        el.onchange = () => {
            state.aiSettings.preset = 'custom';
            syncPresetButtons();
            syncSources();
            updateIntelPanel(true);
        };
    });

    if (btnRun) btnRun.onclick = () => updateIntelPanel(true);
    if (btnClear) btnClear.onclick = () => {
        intelSuggestions = [];
        state.aiPredictedLinks = [];
        draw();
        const listEl = document.getElementById('intel-list');
        const countEl = document.getElementById('intelCount');
        if (listEl) listEl.innerHTML = '<div class="intel-empty-state">Analyse effacee</div>';
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
        listEl.innerHTML = '<div class="intel-empty-state">Acces verrouille</div>';
        if (countEl) countEl.textContent = '0';
        state.aiPredictedLinks = [];
        draw();
        return;
    }

    const scope = state.aiSettings.scope || 'selection';
    const focusId = (scope === 'selection' && state.selection) ? state.selection : null;
    if (scope === 'selection' && !focusId) {
        listEl.innerHTML = '<div class="intel-empty-state">Selectionne une fiche ou passe en mode reseau.</div>';
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
        listEl.innerHTML = '<div class="intel-empty-state">Aucune suggestion utile pour ce filtre.</div>';
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
        const hasMissing = s.aStatus === PERSON_STATUS.MISSING || s.bStatus === PERSON_STATUS.MISSING;
        const hasDeceased = s.aStatus === PERSON_STATUS.DECEASED || s.bStatus === PERSON_STATUS.DECEASED;
        const statusBadges = [
            hasMissing ? `<span class="intel-badge">Disparu</span>` : '',
            hasDeceased ? `<span class="intel-badge">Mort</span>` : ''
        ].join('');
        const reasons = (showReasons && s.reasons && s.reasons.length) ? `<div class="intel-reasons">${s.reasons.slice(0, 3).map(r => escapeHtml(r)).join(' · ')}</div>` : '';
        const allowedKinds = getAllowedKinds(s.a.type, s.b.type);
        const options = Array.from(allowedKinds).map(k => `<option value="${k}" ${k === s.kind ? 'selected' : ''}>${linkKindEmoji(k)} ${kindToLabel(k)}</option>`).join('');
        return `
            <div class="intel-item ${s.surprise >= 0.6 ? 'highlight' : ''}" data-a="${s.aId}" data-b="${s.bId}">
                <div class="intel-card-top">
                    <div class="intel-meta">
                        <span class="intel-score">Score ${scorePct}%</span>
                        <span class="intel-confidence">Confiance ${confPct}%</span>
                    </div>
                    <div class="intel-badges">${isBridge}${isSurprise}${isAlias}${isGeo}${statusBadges}</div>
                </div>
                <div class="intel-names">
                    <span class="intel-name-pair">${escapeHtml(s.a.name)} ⇄ ${escapeHtml(s.b.name)}</span>
                </div>
                ${reasons}
                <div class="intel-cta">
                    <select class="intel-select intel-kind" data-action="kind">${options}</select>
                    <button class="mini-btn primary intel-connect-btn" data-action="apply">Connecter</button>
                    <button class="mini-btn" data-action="focus">Voir</button>
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
        });
        row.onclick = () => centerOnPair(aId, bId);
        row.querySelectorAll('button, select').forEach((control) => {
            control.addEventListener('click', (event) => event.stopPropagation());
        });
    });
}

export function refreshIntelPanel() {
    if (!intelPanel || intelPanel.style.display === 'none') return;
    updateIntelPanel(true);
}

function normalizeSearchText(value) {
    return String(value ?? '').trim().toLowerCase();
}

function normalizeSearchPhone(value) {
    return String(value ?? '').replace(/\D+/g, '');
}

function findSearchMatches(query) {
    const normalizedQuery = normalizeSearchText(query);
    const normalizedPhoneQuery = normalizeSearchPhone(query);

    return state.nodes
        .map((node) => {
            const name = normalizeSearchText(node?.name || '');
            const phone = String(node?.num || '').trim();
            const normalizedPhone = normalizeSearchPhone(phone);
            const nameStarts = normalizedQuery ? name.startsWith(normalizedQuery) : false;
            const nameMatch = normalizedQuery ? name.includes(normalizedQuery) : false;
            const phoneStarts = normalizedPhoneQuery ? normalizedPhone.startsWith(normalizedPhoneQuery) : false;
            const phoneMatch = normalizedPhoneQuery ? normalizedPhone.includes(normalizedPhoneQuery) : false;

            if (!nameMatch && !phoneMatch) return null;

            let score = 0;
            if (nameStarts) score += 40;
            else if (nameMatch) score += 20;
            if (phoneStarts) score += 35;
            else if (phoneMatch) score += 15;

            return { node, score };
        })
        .filter(Boolean)
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return String(a.node?.name || '').localeCompare(String(b.node?.name || ''), 'fr', { sensitivity: 'base' });
        })
        .slice(0, 10)
        .map((entry) => entry.node);
}

function setupSearch() {
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const q = String(e.target.value || '').trim();
        const res = document.getElementById('searchResult');
        if(!q) { res.textContent = ''; return; }
        const found = findSearchMatches(q);
        if(found.length === 0) { res.innerHTML = '<span style="color:#666;">Aucun résultat</span>'; return; }
        res.innerHTML = found.map((n) => {
            const phone = String(n.num || '').trim();
            const label = phone ? `${escapeHtml(n.name)} · ${escapeHtml(phone)}` : escapeHtml(n.name);
            return `<span class="search-hit" data-id="${n.id}" title="${escapeHtml(phone || n.name)}">${label}</span>`;
        }).join(' · ');
        res.querySelectorAll('.search-hit').forEach(el => el.onclick = () => { zoomToNode(el.dataset.id); e.target.value = ''; res.textContent = ''; });
    });
}

function createNode(type, baseName, options = {}) {
    let name = baseName, i = 1;
    while(state.nodes.find(n => n.name === name)) { name = `${baseName} ${++i}`; }
    const n = ensureNode(type, name);
    logNodeAdded(n.name, options.actor);
    zoomToNode(n.id); restartSim();
    scheduleSave();
}

function resolveNodeForAction(ref) {
    if (!ref) return null;
    const id = (typeof ref === 'object') ? ref.id : ref;
    return nodeById(id);
}

export function addLink(a, b, kind, options = {}) {
    const res = logicAddLink(a, b, kind);
    if (res) {
        const sourceNode = resolveNodeForAction(a);
        const targetNode = resolveNodeForAction(b);
        logNodesConnected(sourceNode, targetNode, options.actor);
        refreshLists();
        renderEditor();
        scheduleSave();
        refreshHvt();
    }
    return res;
}

export function selectNode(id) {
    state.selection = id;
    renderEditor();
    updatePathfindingPanel();
    draw();
    refreshIntelPanel();
    if (isCloudBoardActive() && collab.user) {
        touchCollabPresence(collab.presenceLoopToken, { force: true }).catch(() => {});
    }
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
    if (isCloudBoardActive() && collab.user) {
        touchCollabPresence(collab.presenceLoopToken, { force: true }).catch(() => {});
    }
}

export function updateLinkLegend() {
    const el = ui.linkLegend;
    if(!state.showLinkTypes) { el.innerHTML = ''; return; }
    const allowedKinds = FILTER_RULES[state.activeFilter];
    const usedKinds = new Set(
        state.links
            .filter((link) => !allowedKinds || allowedKinds.has(link.kind))
            .map((link) => link.kind)
    );
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
