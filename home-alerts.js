const ALERTS_ENDPOINT = '/.netlify/functions/alerts';
const DISMISS_STORAGE_KEY = 'bniAlertDismissed_v1';
const ALERT_REFRESH_EVENT_KEY = 'bniAlertRefresh_v1';
const ALERT_REFRESH_CHANNEL = 'bni-alert-refresh';
const ALERT_POLL_MS = 6000;
const COLLAB_SESSION_STORAGE_KEY = 'bniLinkedCollabSession_v1';

let currentAlert = null;

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

function signature(alert) {
    if (!alert) return '';
    return `${String(alert.id || '')}:${String(alert.updatedAt || '')}`;
}

function getDismissedSignature() {
    try {
        return sessionStorage.getItem(DISMISS_STORAGE_KEY) || '';
    } catch (e) {
        return '';
    }
}

function setDismissedSignature(value) {
    try {
        if (value) sessionStorage.setItem(DISMISS_STORAGE_KEY, value);
        else sessionStorage.removeItem(DISMISS_STORAGE_KEY);
    } catch (e) {}
}

function waitForHomeReady(callback) {
    if (!document.body.classList.contains('app-loading')) {
        callback();
        return;
    }

    const timer = window.setInterval(() => {
        if (!document.body.classList.contains('app-loading')) {
            window.clearInterval(timer);
            callback();
        }
    }, 160);
}

function injectPopup() {
    if (document.getElementById('site-alert-popup')) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
        <div id="site-alert-popup" class="site-alert-popup" hidden>
            <button id="site-alert-close" class="site-alert-close" type="button" aria-label="Fermer">×</button>
            <div class="site-alert-kicker">Alerte BNI</div>
            <div id="site-alert-title" class="site-alert-title"></div>
            <div id="site-alert-desc" class="site-alert-desc"></div>
            <div id="site-alert-meta" class="site-alert-meta"></div>
            <button id="site-alert-open" class="site-alert-open" type="button">Voir sur carte</button>
        </div>
    `;

    document.body.appendChild(wrapper);

    const popup = document.getElementById('site-alert-popup');
    const closeBtn = document.getElementById('site-alert-close');
    const openBtn = document.getElementById('site-alert-open');

    const openAlert = () => {
        if (!currentAlert) return;
        const alertId = String(currentAlert.id || '').trim();
        window.location.href = alertId ? `./map/?alert=${encodeURIComponent(alertId)}` : './map/';
    };

    closeBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!currentAlert) return;
        setDismissedSignature(signature(currentAlert));
        renderPopup();
    });

    openBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        openAlert();
    });

    popup?.addEventListener('click', openAlert);
}

function renderPopup() {
    const popup = document.getElementById('site-alert-popup');
    const title = document.getElementById('site-alert-title');
    const desc = document.getElementById('site-alert-desc');
    const meta = document.getElementById('site-alert-meta');
    if (!popup || !title || !desc || !meta) return;

    if (!currentAlert || !currentAlert.active || getDismissedSignature() === signature(currentAlert)) {
        popup.hidden = true;
        return;
    }

    title.textContent = String(currentAlert.title || 'Alerte BNI');
    desc.textContent = String(currentAlert.description || '');
    meta.textContent = `GPS ${Number(currentAlert.gpsX || 0).toFixed(2)} / ${Number(currentAlert.gpsY || 0).toFixed(2)}`;
    popup.hidden = false;
}

async function fetchPublicAlert() {
    const cacheBust = `t=${Date.now()}`;
    const session = readViewerSession();
    const response = await fetch(`${ALERTS_ENDPOINT}?${cacheBust}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache',
            ...(session.token ? { 'x-collab-token': session.token } : {})
        }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
        throw new Error(data.error || `Erreur alerte (${response.status})`);
    }
    return data.alert || null;
}

async function refreshAlert() {
    try {
        const nextAlert = await fetchPublicAlert();
        const previousSignature = signature(currentAlert);
        currentAlert = nextAlert;
        const nextSignature = signature(nextAlert);
        if (nextSignature && previousSignature !== nextSignature && getDismissedSignature() !== nextSignature) {
            setDismissedSignature('');
        }
        renderPopup();
    } catch (error) {
        console.error('[HOME ALERT]', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    injectPopup();

    waitForHomeReady(() => {
        refreshAlert();
        window.setInterval(refreshAlert, ALERT_POLL_MS);
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            refreshAlert();
        }
    });

    window.addEventListener('pageshow', () => {
        refreshAlert();
    });

    window.addEventListener('storage', (event) => {
        if (event.key === ALERT_REFRESH_EVENT_KEY) {
            refreshAlert();
        }
    });

    try {
        if (typeof BroadcastChannel === 'function') {
            const channel = new BroadcastChannel(ALERT_REFRESH_CHANNEL);
            channel.onmessage = () => {
                refreshAlert();
            };
        }
    } catch (e) {}
});
