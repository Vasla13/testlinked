import { state } from './state.js';
import { renderAll, getMapPercentCoords } from './render.js';
import { updateTransform } from './engine.js';
import { percentageToGps } from './utils.js';
import { customAlert } from './ui-modals.js';

const ALERTS_ENDPOINT = '/.netlify/functions/alerts';
const ALERT_REFRESH_EVENT_KEY = 'bniAlertRefresh_v1';
const ALERT_POLL_MS = 6000;
const COLLAB_SESSION_STORAGE_KEY = 'bniLinkedCollabSession_v1';
const MAP_ALERT_SEEN_STORAGE_KEY = 'bniMapAlertSeen_v2';
const MAP_ALERT_CLICK_EVENT = 'bni:map-alert-click';
let alertRefreshStarted = false;
const alertUiState = {
    activeBannerKey: '',
    clickListenerBound: false,
};

function escapeText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getAlertBanner() {
    return document.getElementById('map-alert-banner');
}

function getPickerOverlay() {
    return document.getElementById('alert-picker-overlay');
}

function getAlertKey(alert) {
    if (!alert || typeof alert !== 'object') return '';
    const gpsX = Number.isFinite(Number(alert.gpsX)) ? Number(alert.gpsX).toFixed(2) : '';
    const gpsY = Number.isFinite(Number(alert.gpsY)) ? Number(alert.gpsY).toFixed(2) : '';
    return [
        String(alert.id || ''),
        String(alert.updatedAt || ''),
        String(alert.title || ''),
        gpsX,
        gpsY
    ].join('::');
}

function readSeenAlertKey() {
    try {
        return String(localStorage.getItem(MAP_ALERT_SEEN_STORAGE_KEY) || '');
    } catch (e) {
        return '';
    }
}

function markAlertSeen(alert) {
    const alertKey = getAlertKey(alert);
    if (!alertKey) return;
    try {
        localStorage.setItem(MAP_ALERT_SEEN_STORAGE_KEY, alertKey);
    } catch (e) {}
}

function isAlertNewForViewer(alert) {
    const alertKey = getAlertKey(alert);
    return Boolean(alertKey) && alertKey !== readSeenAlertKey();
}

function readViewerSession() {
    try {
        const raw = localStorage.getItem(COLLAB_SESSION_STORAGE_KEY);
        if (!raw) return { token: '', user: null };
        const parsed = JSON.parse(raw);
        return {
            token: String(parsed?.token || ''),
            user: parsed?.user && typeof parsed.user === 'object' ? parsed.user : null
        };
    } catch (e) {
        return { token: '', user: null };
    }
}

function sanitizeZonePoints(rawPoints) {
    if (!Array.isArray(rawPoints)) return [];
    return rawPoints
        .map((point) => {
            if (!point || typeof point !== 'object') return null;
            const x = Number(point.x);
            const y = Number(point.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
            return {
                x: Number(x.toFixed(4)),
                y: Number(y.toFixed(4)),
            };
        })
        .filter(Boolean);
}

function sanitizeAlert(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const zonePoints = sanitizeZonePoints(raw.zonePoints);
    const alert = {
        id: String(raw.id || ''),
        title: String(raw.title || ''),
        description: String(raw.description || ''),
        gpsX: Number(raw.gpsX),
        gpsY: Number(raw.gpsY),
        xPercent: Number(raw.xPercent),
        yPercent: Number(raw.yPercent),
        radius: Number(raw.radius || 2.6),
        shapeType: raw.shapeType === 'zone' && zonePoints.length >= 3 ? 'zone' : 'circle',
        zonePoints,
        active: raw.active !== false,
        updatedAt: String(raw.updatedAt || ''),
    };
    if (!Number.isFinite(alert.xPercent) || !Number.isFinite(alert.yPercent)) return null;
    if (!Number.isFinite(alert.gpsX) || !Number.isFinite(alert.gpsY)) return null;
    return alert;
}

function focusAlert(alert, attempt = 0) {
    const viewport = document.getElementById('viewport');
    if (!viewport || !state.mapWidth || !state.mapHeight) {
        if (attempt < 12) {
            window.setTimeout(() => focusAlert(alert, attempt + 1), 180);
        }
        return;
    }

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    let focusX = alert.xPercent;
    let focusY = alert.yPercent;
    let scale = 2.4;

    if (alert.shapeType === 'zone' && alert.zonePoints.length >= 3) {
        const xs = alert.zonePoints.map((point) => point.x);
        const ys = alert.zonePoints.map((point) => point.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        focusX = (minX + maxX) / 2;
        focusY = (minY + maxY) / 2;

        const widthPx = Math.max(80, ((maxX - minX) / 100) * state.mapWidth);
        const heightPx = Math.max(80, ((maxY - minY) / 100) * state.mapHeight);
        const fitScale = Math.min(
            (viewportWidth - 120) / widthPx,
            (viewportHeight - 120) / heightPx
        );
        scale = Math.min(2.2, Math.max(0.8, fitScale));
    }

    state.view.scale = scale;
    state.view.x = (viewportWidth / 2) - (focusX * state.mapWidth / 100) * scale;
    state.view.y = (viewportHeight / 2) - (focusY * state.mapHeight / 100) * scale;
    updateTransform();
}

function renderAlertBanner(alert) {
    const banner = getAlertBanner();
    if (!banner) return;
    const alertKey = getAlertKey(alert);

    if (!alert || !alertKey || alertUiState.activeBannerKey !== alertKey) {
        banner.hidden = true;
        banner.innerHTML = '';
        return;
    }

    banner.hidden = false;
    banner.innerHTML = `
        <div class="map-alert-kicker">Alerte BNI</div>
        <div class="map-alert-title">${escapeText(alert.title)}</div>
        <div class="map-alert-desc">${escapeText(alert.description)}</div>
        <div class="map-alert-meta">GPS ${alert.gpsX.toFixed(2)} / ${alert.gpsY.toFixed(2)}</div>
        <button type="button" id="map-alert-dismiss" class="mini-btn">Fermer</button>
    `;

    const dismissBtn = document.getElementById('map-alert-dismiss');
    if (dismissBtn) {
        dismissBtn.onclick = () => {
            alertUiState.activeBannerKey = '';
            markAlertSeen(alert);
            banner.hidden = true;
        };
    }
}

async function openAlertDetails(alert) {
    if (!alert) return;
    await customAlert(
        'ALERTE BNI',
        `
            <div class="map-alert-kicker">Zone signalee</div>
            <div class="map-alert-title">${escapeText(alert.title || 'Alerte')}</div>
            <div class="map-alert-desc">${escapeText(alert.description || 'Aucune precision')}</div>
            <div class="map-alert-meta">GPS ${alert.gpsX.toFixed(2)} / ${alert.gpsY.toFixed(2)}</div>
        `
    );
}

function bindAlertClickListener() {
    if (alertUiState.clickListenerBound) return;
    alertUiState.clickListenerBound = true;

    window.addEventListener(MAP_ALERT_CLICK_EVENT, (event) => {
        const alert = event?.detail?.alert || state.activeAlert;
        openAlertDetails(alert).catch(() => {});
    });
}

async function fetchAlertById(id) {
    const session = readViewerSession();
    const response = await fetch(`${ALERTS_ENDPOINT}?id=${encodeURIComponent(id)}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
            ...(session.token ? { 'x-collab-token': session.token } : {})
        }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
        throw new Error(data.error || `Erreur alerte (${response.status})`);
    }
    return sanitizeAlert(data.alert);
}

async function fetchCurrentAlert() {
    const session = readViewerSession();
    const response = await fetch(`${ALERTS_ENDPOINT}?t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
            ...(session.token ? { 'x-collab-token': session.token } : {})
        }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
        throw new Error(data.error || `Erreur alerte (${response.status})`);
    }
    return sanitizeAlert(data.alert);
}

async function refreshMapAlert(options = {}) {
    const params = new URLSearchParams(window.location.search);
    const alertId = String(params.get('alert') || '').trim();
    const shouldFocus = Boolean(options.focus) || (Boolean(alertId) && Boolean(options.initialLoad));

    try {
        const alert = alertId ? await fetchAlertById(alertId) : await fetchCurrentAlert();
        state.activeAlert = alert;
        const alertKey = getAlertKey(alert);

        if (!alert || !alertKey) {
            alertUiState.activeBannerKey = '';
        } else if (alertUiState.activeBannerKey && alertUiState.activeBannerKey === alertKey) {
            // Keep current banner visible until user closes it.
        } else if (options.initialLoad && isAlertNewForViewer(alert)) {
            alertUiState.activeBannerKey = alertKey;
            markAlertSeen(alert);
        } else {
            alertUiState.activeBannerKey = '';
        }

        renderAlertBanner(alert);
        renderAll();
        if (alert && shouldFocus) {
            focusAlert(alert);
        }
    } catch (error) {
        console.error('[ALERT MAP]', error);
        state.activeAlert = null;
        renderAlertBanner(null);
        renderAll();
        if (alertId && !options.silent) {
            await customAlert('ALERTE', 'Alerte indisponible.');
        }
    }
}

function startAlertRefreshLoop() {
    if (alertRefreshStarted) return;
    alertRefreshStarted = true;
    bindAlertClickListener();

    window.setInterval(() => {
        refreshMapAlert({ silent: true }).catch(() => {});
    }, ALERT_POLL_MS);

    window.addEventListener('storage', (event) => {
        if (event.key === ALERT_REFRESH_EVENT_KEY) {
            refreshMapAlert({ silent: true }).catch(() => {});
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            refreshMapAlert({ silent: true }).catch(() => {});
        }
    });
}

export async function loadAlertFromUrl() {
    await refreshMapAlert({ focus: false, initialLoad: true });
    startAlertRefreshLoop();
}

export function initAlertPickerMode() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pickAlert') !== '1') return;

    const overlay = getPickerOverlay();
    if (!overlay) return;

    document.body.classList.add('alert-picker-mode');
    overlay.hidden = false;
    overlay.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();

        const coords = getMapPercentCoords(event.clientX, event.clientY);
        const gps = percentageToGps(coords.x, coords.y);
        const payload = {
            xPercent: Number(coords.x.toFixed(4)),
            yPercent: Number(coords.y.toFixed(4)),
            gpsX: Number(gps.x.toFixed(2)),
            gpsY: Number(gps.y.toFixed(2)),
        };

        try {
            if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ type: 'bni-alert-location', payload }, window.location.origin);
            }
        } catch (e) {}

        overlay.innerHTML = `
            <div class="alert-picker-card alert-picker-card-done">
                <span class="alert-picker-kicker">Position envoyee</span>
                <strong>Retour au panneau admin.</strong>
            </div>
        `;

        window.setTimeout(() => {
            try {
                window.close();
            } catch (e) {}
        }, 280);
    };
}
