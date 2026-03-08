import { gpsToPercentage, percentageToGps } from '../map/js/utils.js';

const STAFF_CODE = 'staff';
const ALERTS_ENDPOINT = '/.netlify/functions/alerts';
const ALERT_REFRESH_EVENT_KEY = 'bniAlertRefresh_v1';
const DEFAULT_RADIUS = 2.6;

const dom = {
    accessOverlay: document.getElementById('staff-access-overlay'),
    accessInput: document.getElementById('staff-access-input'),
    accessError: document.getElementById('staff-access-error'),
    accessSubmit: document.getElementById('staff-access-submit'),
    homeBtn: document.getElementById('btnStaffHome'),
    publishBtn: document.getElementById('btnPublishAlert'),
    deleteBtn: document.getElementById('btnDeleteAlert'),
    lockBtn: document.getElementById('btnLockStaff'),
    clearBtn: document.getElementById('btnClearDraft'),
    useMapBtn: document.getElementById('btnUseMapSelection'),
    startZoneBtn: document.getElementById('btnStartZoneDraw'),
    openPickerBtn: document.getElementById('btnOpenPickerMap'),
    finishZoneBtn: document.getElementById('btnFinishZoneDraw'),
    cancelZoneBtn: document.getElementById('btnCancelZoneDraw'),
    radius: document.getElementById('alertRadius'),
    radiusValue: document.getElementById('alertRadiusValue'),
    drawStatus: document.getElementById('staffDrawStatus'),
    statusState: document.getElementById('staffAlertState'),
    statusCoords: document.getElementById('staffAlertCoords'),
    statusAudience: document.getElementById('staffAlertAudience'),
    statusMessage: document.getElementById('staffStatusMessage'),
    gpsPreview: document.getElementById('staffGpsPreview'),
    percentPreview: document.getElementById('staffPercentPreview'),
    alertMode: document.getElementById('staffAlertMode'),
    selectionMode: document.getElementById('staffSelectionMode'),
    audienceMode: document.getElementById('staffAudienceMode'),
    title: document.getElementById('alertTitle'),
    description: document.getElementById('alertDescription'),
    gpsX: document.getElementById('alertGpsX'),
    gpsY: document.getElementById('alertGpsY'),
    active: document.getElementById('alertActive'),
    audienceAllBtn: document.getElementById('btnAudienceAll'),
    audienceWhitelistBtn: document.getElementById('btnAudienceWhitelist'),
    whitelistPanel: document.getElementById('staffWhitelistPanel'),
    whitelistInput: document.getElementById('staffWhitelistInput'),
    whitelistAddBtn: document.getElementById('btnAddWhitelistUser'),
    whitelistSuggestions: document.getElementById('staffWhitelistSuggestions'),
    whitelistList: document.getElementById('staffWhitelistList'),
    viewport: document.getElementById('viewport'),
    mapWorld: document.getElementById('map-world'),
    mapImage: document.getElementById('map-image'),
    alertLayer: document.getElementById('staff-alert-layer'),
    mapBanner: document.getElementById('staff-map-banner'),
    coords: document.getElementById('coords-display'),
    resetView: document.getElementById('btnResetView'),
    toggleSelection: document.getElementById('btnToggleSelection'),
};

const state = {
    unlocked: false,
    currentAlert: null,
    selection: null,
    drawMode: false,
    drawDraftPoints: [],
    drawBackupSelection: null,
    mapWidth: 0,
    mapHeight: 0,
    view: { x: 0, y: 0, scale: 0.5 },
    pointer: {
        active: false,
        moved: false,
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
    },
    mapSelectionEnabled: true,
    audienceMode: 'all',
    allowedUsers: [],
    userDirectory: [],
    pickerWindow: null,
};

function escapeText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeAudienceUsername(value) {
    const raw = String(value || '').trim().toLowerCase();
    const clean = raw.replace(/[^a-z0-9._-]/g, '');
    return clean.length >= 3 ? clean : '';
}

function sanitizeAllowedUsers(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const clean = [];
    list.forEach((value) => {
        const username = normalizeAudienceUsername(value);
        if (!username || seen.has(username)) return;
        seen.add(username);
        clean.push(username);
    });
    return clean;
}

function audienceSummary() {
    if (state.audienceMode !== 'whitelist') return 'Tous';
    if (!state.allowedUsers.length) return 'Whitelist vide';
    return `${state.allowedUsers.length} user${state.allowedUsers.length > 1 ? 's' : ''}`;
}

function renderWhitelistSuggestions() {
    if (!dom.whitelistSuggestions) return;
    const query = normalizeAudienceUsername(dom.whitelistInput?.value || '');
    const visible = state.userDirectory
        .filter((username) => !query || username.includes(query))
        .filter((username) => !state.allowedUsers.includes(username))
        .slice(0, 10);

    dom.whitelistSuggestions.innerHTML = visible.map((username) => `
        <button type="button" class="staff-whitelist-suggestion" data-user="${escapeText(username)}">${escapeText(username)}</button>
    `).join('') || '<div class="staff-whitelist-empty">Aucune suggestion</div>';

    Array.from(dom.whitelistSuggestions.querySelectorAll('[data-user]')).forEach((button) => {
        button.onclick = () => {
            const username = button.getAttribute('data-user') || '';
            addWhitelistUser(username);
        };
    });
}

function renderWhitelistList() {
    if (!dom.whitelistList) return;
    dom.whitelistList.innerHTML = state.allowedUsers.map((username) => `
        <div class="staff-whitelist-chip">
            <span>${escapeText(username)}</span>
            <button type="button" data-remove-user="${escapeText(username)}">×</button>
        </div>
    `).join('') || '<div class="staff-whitelist-empty">Aucun utilisateur ajoute</div>';

    Array.from(dom.whitelistList.querySelectorAll('[data-remove-user]')).forEach((button) => {
        button.onclick = () => {
            const username = button.getAttribute('data-remove-user') || '';
            state.allowedUsers = state.allowedUsers.filter((entry) => entry !== username);
            renderAudienceUi();
        };
    });
}

function renderAudienceUi() {
    if (dom.audienceMode) {
        dom.audienceMode.textContent = state.audienceMode === 'whitelist' ? 'Whitelist' : 'Tous';
    }
    if (dom.statusAudience) {
        dom.statusAudience.textContent = audienceSummary();
    }
    dom.audienceAllBtn?.classList.toggle('is-active', state.audienceMode === 'all');
    dom.audienceWhitelistBtn?.classList.toggle('is-active', state.audienceMode === 'whitelist');
    if (dom.whitelistPanel) {
        dom.whitelistPanel.hidden = state.audienceMode !== 'whitelist';
    }
    renderWhitelistSuggestions();
    renderWhitelistList();
}

function addWhitelistUser(value) {
    const username = normalizeAudienceUsername(value);
    if (!username) {
        setStatusMessage('Username invalide.', 'warn');
        return;
    }
    if (!state.allowedUsers.includes(username)) {
        state.allowedUsers = [...state.allowedUsers, username];
    }
    if (dom.whitelistInput) dom.whitelistInput.value = '';
    renderAudienceUi();
}

async function loadUserDirectory() {
    try {
        const data = await requestAdmin('list_users');
        state.userDirectory = Array.isArray(data.users) ? sanitizeAllowedUsers(data.users) : [];
        renderAudienceUi();
    } catch (error) {
        state.userDirectory = [];
        renderAudienceUi();
    }
}

function clampRadius(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_RADIUS;
    return Math.min(12, Math.max(0.8, num));
}

function getCurrentRadius() {
    return clampRadius(dom.radius?.value || state.selection?.radius || state.currentAlert?.radius || DEFAULT_RADIUS);
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

function computePolygonCenter(points) {
    const clean = sanitizeZonePoints(points);
    if (clean.length === 0) return { x: 50, y: 50 };

    let area = 0;
    let cx = 0;
    let cy = 0;

    for (let i = 0; i < clean.length; i += 1) {
        const current = clean[i];
        const next = clean[(i + 1) % clean.length];
        const cross = current.x * next.y - next.x * current.y;
        area += cross;
        cx += (current.x + next.x) * cross;
        cy += (current.y + next.y) * cross;
    }

    if (Math.abs(area) < 0.0001) {
        const sum = clean.reduce((acc, point) => ({
            x: acc.x + point.x,
            y: acc.y + point.y,
        }), { x: 0, y: 0 });
        return {
            x: Number((sum.x / clean.length).toFixed(4)),
            y: Number((sum.y / clean.length).toFixed(4)),
        };
    }

    const factor = 1 / (3 * area);
    return {
        x: Number((cx * factor).toFixed(4)),
        y: Number((cy * factor).toFixed(4)),
    };
}

function getZoneBounds(points) {
    const clean = sanitizeZonePoints(points);
    if (!clean.length) return null;
    const xs = clean.map((point) => point.x);
    const ys = clean.map((point) => point.y);
    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
    };
}

function cloneSelection(selection) {
    if (!selection) return null;
    const zonePoints = sanitizeZonePoints(selection.zonePoints);
    const shapeType = selection.shapeType === 'zone' && zonePoints.length >= 3 ? 'zone' : 'circle';
    return {
        shapeType,
        xPercent: Number(selection.xPercent),
        yPercent: Number(selection.yPercent),
        gpsX: Number(selection.gpsX),
        gpsY: Number(selection.gpsY),
        radius: clampRadius(selection.radius),
        zonePoints: shapeType === 'zone' ? zonePoints : [],
    };
}

function buildCircleSelectionFromPercent(xPercent, yPercent, radius = getCurrentRadius()) {
    const gps = percentageToGps(xPercent, yPercent);
    return {
        shapeType: 'circle',
        xPercent: Number(Number(xPercent).toFixed(4)),
        yPercent: Number(Number(yPercent).toFixed(4)),
        gpsX: Number(gps.x.toFixed(2)),
        gpsY: Number(gps.y.toFixed(2)),
        radius: clampRadius(radius),
        zonePoints: [],
    };
}

function buildCircleSelectionFromGps(gpsX, gpsY, radius = getCurrentRadius()) {
    const percent = gpsToPercentage(gpsX, gpsY);
    return {
        shapeType: 'circle',
        xPercent: Number(percent.x.toFixed(4)),
        yPercent: Number(percent.y.toFixed(4)),
        gpsX: Number(Number(gpsX).toFixed(2)),
        gpsY: Number(Number(gpsY).toFixed(2)),
        radius: clampRadius(radius),
        zonePoints: [],
    };
}

function buildZoneSelection(points, radius = getCurrentRadius()) {
    const zonePoints = sanitizeZonePoints(points);
    if (zonePoints.length < 3) return null;
    const center = computePolygonCenter(zonePoints);
    const gps = percentageToGps(center.x, center.y);
    return {
        shapeType: 'zone',
        xPercent: Number(center.x.toFixed(4)),
        yPercent: Number(center.y.toFixed(4)),
        gpsX: Number(gps.x.toFixed(2)),
        gpsY: Number(gps.y.toFixed(2)),
        radius: clampRadius(radius),
        zonePoints,
    };
}

function sanitizePickerPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;

    const xPercent = Number(payload.xPercent);
    const yPercent = Number(payload.yPercent);
    const gpsX = Number(payload.gpsX);
    const gpsY = Number(payload.gpsY);

    if (!Number.isFinite(xPercent) || !Number.isFinite(yPercent)) return null;
    if (!Number.isFinite(gpsX) || !Number.isFinite(gpsY)) return null;

    return {
        xPercent: Number(xPercent.toFixed(4)),
        yPercent: Number(yPercent.toFixed(4)),
        gpsX: Number(gpsX.toFixed(2)),
        gpsY: Number(gpsY.toFixed(2)),
    };
}

function updateRadiusUi(radius = getCurrentRadius()) {
    const value = clampRadius(radius);
    if (dom.radius) dom.radius.value = String(value);
    if (dom.radiusValue) dom.radiusValue.textContent = value.toFixed(1);
}

function setStatusMessage(text, stateName = 'idle') {
    if (!dom.statusMessage) return;
    dom.statusMessage.textContent = text;
    dom.statusMessage.dataset.state = stateName;
}

function setDrawStatus(text, mode = 'circle') {
    if (!dom.drawStatus) return;
    dom.drawStatus.textContent = text;
    dom.drawStatus.dataset.mode = mode;
}

function notifyPublicAlertRefresh() {
    try {
        localStorage.setItem(ALERT_REFRESH_EVENT_KEY, String(Date.now()));
    } catch (e) {}
}

function setLockState(locked) {
    state.unlocked = !locked;
    if (!dom.accessOverlay) return;
    dom.accessOverlay.classList.toggle('is-hidden', !locked);
}

function refreshModeControls() {
    const selection = state.selection;
    const isZoneSelection = selection?.shapeType === 'zone';

    dom.useMapBtn?.classList.toggle('is-active', !state.drawMode && !isZoneSelection);
    dom.startZoneBtn?.classList.toggle('is-active', state.drawMode || isZoneSelection);

    if (dom.finishZoneBtn) {
        dom.finishZoneBtn.disabled = !state.drawMode || state.drawDraftPoints.length < 3;
        dom.finishZoneBtn.hidden = !state.drawMode;
    }
    if (dom.cancelZoneBtn) {
        dom.cancelZoneBtn.disabled = !state.drawMode;
        dom.cancelZoneBtn.hidden = !state.drawMode;
    }

    if (!state.mapSelectionEnabled) {
        setDrawStatus('Selection en pause. Reactive le bouton du HUD pour modifier la carte.', 'circle');
        return;
    }

    if (state.drawMode) {
        const count = state.drawDraftPoints.length;
        setDrawStatus(`Mode dessin. ${count} point${count > 1 ? 's' : ''}. Clique pour tracer, puis valide pour fermer la zone.`, 'zone');
        return;
    }

    if (isZoneSelection) {
        setDrawStatus(`Zone validee. ${selection.zonePoints.length} points enregistres.`, 'zone');
        return;
    }

    setDrawStatus('Mode cercle. Clique sur la carte pour placer l’alerte.', 'circle');
}

function renderSelection() {
    if (!dom.alertLayer) return;
    dom.alertLayer.innerHTML = '';

    if (state.drawDraftPoints.length > 0) {
        const draft = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        draft.setAttribute('points', state.drawDraftPoints.map((point) => `${point.x},${point.y}`).join(' '));
        draft.setAttribute('fill', 'none');
        draft.setAttribute('stroke', '#ff4d67');
        draft.setAttribute('stroke-width', '0.18');
        draft.setAttribute('stroke-dasharray', '0.5 0.26');
        draft.setAttribute('class', 'staff-alert-draft');
        dom.alertLayer.appendChild(draft);
    }

    const selection = state.selection;
    if (!selection) return;

    if (selection.shapeType === 'zone' && selection.zonePoints.length >= 3) {
        const zone = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        zone.setAttribute('points', selection.zonePoints.map((point) => `${point.x},${point.y}`).join(' '));
        zone.setAttribute('fill', '#ff4d67');
        zone.setAttribute('fill-opacity', '0.16');
        zone.setAttribute('stroke', '#ff4d67');
        zone.setAttribute('stroke-width', '0.18');
        zone.setAttribute('class', 'staff-alert-zone');
        dom.alertLayer.appendChild(zone);
        return;
    }

    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('cx', selection.xPercent);
    ring.setAttribute('cy', selection.yPercent);
    ring.setAttribute('r', String(selection.radius || DEFAULT_RADIUS));
    ring.setAttribute('fill', '#ff4d67');
    ring.setAttribute('fill-opacity', '0.14');
    ring.setAttribute('stroke', '#ff4d67');
    ring.setAttribute('stroke-width', '0.18');
    ring.setAttribute('class', 'staff-alert-ring');
    dom.alertLayer.appendChild(ring);
}

function refreshStatusCards() {
    const selection = state.selection;
    const current = state.currentAlert;

    if (dom.statusState) {
        if (!state.unlocked) dom.statusState.textContent = 'Verrouille';
        else if (!current) dom.statusState.textContent = 'Brouillon';
        else dom.statusState.textContent = current.active === false ? 'Inactive' : 'Active';
    }
    if (dom.statusAudience) {
        dom.statusAudience.textContent = audienceSummary();
    }

    const coordsLabel = selection
        ? `${selection.gpsX.toFixed(2)} / ${selection.gpsY.toFixed(2)}`
        : '--';
    const percentLabel = selection
        ? `${selection.xPercent.toFixed(2)} / ${selection.yPercent.toFixed(2)}`
        : '--';

    if (dom.statusCoords) dom.statusCoords.textContent = coordsLabel;
    if (dom.gpsPreview) dom.gpsPreview.textContent = coordsLabel;
    if (dom.percentPreview) dom.percentPreview.textContent = percentLabel;

    if (dom.selectionMode) {
        if (!state.mapSelectionEnabled) dom.selectionMode.textContent = 'Pause';
        else if (state.drawMode) dom.selectionMode.textContent = `Dessin ${state.drawDraftPoints.length}`;
        else if (selection?.shapeType === 'zone') dom.selectionMode.textContent = 'Zone';
        else dom.selectionMode.textContent = 'Cercle';
    }
    if (dom.deleteBtn) {
        dom.deleteBtn.disabled = !current;
    }

    refreshModeControls();
}

function renderBanner() {
    if (!dom.mapBanner) return;

    const title = String(dom.title?.value || state.currentAlert?.title || '').trim();
    const description = String(dom.description?.value || state.currentAlert?.description || '').trim();
    const selection = state.selection;

    if (!title && !description && !selection && state.drawDraftPoints.length === 0) {
        dom.mapBanner.hidden = true;
        dom.mapBanner.innerHTML = '';
        return;
    }

    let meta = 'Clique sur la carte pour choisir la position';
    if (selection?.shapeType === 'zone') {
        meta = `Zone ${selection.zonePoints.length} points • GPS ${selection.gpsX.toFixed(2)} / ${selection.gpsY.toFixed(2)}`;
    } else if (selection) {
        meta = `GPS ${selection.gpsX.toFixed(2)} / ${selection.gpsY.toFixed(2)} • Rayon ${selection.radius.toFixed(1)}`;
    } else if (state.drawDraftPoints.length > 0) {
        meta = `Dessin en cours • ${state.drawDraftPoints.length} points`;
    }

    dom.mapBanner.hidden = false;
    dom.mapBanner.innerHTML = `
        <div class="staff-map-banner-kicker">Alerte en preparation</div>
        <div class="staff-map-banner-title">${escapeText(title || 'Alerte sans titre')}</div>
        <div class="staff-map-banner-desc">${escapeText(description || 'Ajoute une description visible sur la home.')}</div>
        <div class="staff-map-banner-meta">${escapeText(meta)}</div>
    `;
}

function setSelection(selection, options = {}) {
    if (!selection) {
        state.selection = null;
        if (options.resetDraft !== false) {
            state.drawMode = false;
            state.drawDraftPoints = [];
            state.drawBackupSelection = null;
        }
        renderSelection();
        renderBanner();
        refreshStatusCards();
        return;
    }

    state.selection = cloneSelection(selection);
    if (options.resetDraft !== false) {
        state.drawMode = false;
        state.drawDraftPoints = [];
        state.drawBackupSelection = null;
    }

    if (options.syncForm !== false) {
        if (dom.gpsX) dom.gpsX.value = state.selection.gpsX.toFixed(2);
        if (dom.gpsY) dom.gpsY.value = state.selection.gpsY.toFixed(2);
    }

    updateRadiusUi(state.selection.radius);
    renderSelection();
    renderBanner();
    refreshStatusCards();
}

function applyPickerSelection(payload) {
    const safePayload = sanitizePickerPayload(payload);
    if (!safePayload) {
        setStatusMessage('Position recue invalide.', 'warn');
        return;
    }

    setSelection({
        shapeType: 'circle',
        xPercent: safePayload.xPercent,
        yPercent: safePayload.yPercent,
        gpsX: safePayload.gpsX,
        gpsY: safePayload.gpsY,
        radius: getCurrentRadius(),
        zonePoints: [],
    }, {
        syncForm: true,
        resetDraft: true,
    });

    focusSelection();
    setStatusMessage('Position recue depuis la carte dediee.', 'ok');
}

function finalizeZoneDraft(options = {}) {
    if (state.drawDraftPoints.length < 3) {
        if (!options.silent) {
            setStatusMessage('Trace au moins 3 points pour valider la zone.', 'warn');
        }
        return false;
    }

    const nextSelection = buildZoneSelection(state.drawDraftPoints, getCurrentRadius());
    if (!nextSelection) {
        if (!options.silent) {
            setStatusMessage('Zone invalide.', 'error');
        }
        return false;
    }

    setSelection(nextSelection, {
        syncForm: true,
        resetDraft: true,
    });

    if (!options.silent) {
        setStatusMessage('Zone validee.', 'ok');
    }
    return true;
}

function readDraftAlert() {
    const title = String(dom.title?.value || '').trim();
    const description = String(dom.description?.value || '').trim();

    if (!title) throw new Error('Titre requis.');
    if (!description) throw new Error('Description requise.');

    if (state.drawMode && !finalizeZoneDraft({ silent: true })) {
        throw new Error('Valide d’abord la zone dessinee.');
    }

    let selection = cloneSelection(state.selection);
    if (!selection) {
        const gpsX = Number(dom.gpsX?.value);
        const gpsY = Number(dom.gpsY?.value);
        if (!Number.isFinite(gpsX) || !Number.isFinite(gpsY)) {
            throw new Error('Coordonnees GPS invalides.');
        }
        selection = buildCircleSelectionFromGps(gpsX, gpsY, getCurrentRadius());
    }

    const radius = getCurrentRadius();
    if (selection.shapeType !== 'zone') {
        selection.radius = radius;
    }

    const visibilityMode = state.audienceMode === 'whitelist' ? 'whitelist' : 'all';
    const allowedUsers = visibilityMode === 'whitelist' ? sanitizeAllowedUsers(state.allowedUsers) : [];
    if (visibilityMode === 'whitelist' && allowedUsers.length === 0) {
        throw new Error('Ajoute au moins un utilisateur dans la whitelist.');
    }

    return {
        id: state.currentAlert?.id || '',
        title,
        description,
        gpsX: Number(selection.gpsX.toFixed(2)),
        gpsY: Number(selection.gpsY.toFixed(2)),
        xPercent: Number(selection.xPercent.toFixed(4)),
        yPercent: Number(selection.yPercent.toFixed(4)),
        radius,
        shapeType: selection.shapeType === 'zone' ? 'zone' : 'circle',
        zonePoints: selection.shapeType === 'zone'
            ? selection.zonePoints.map((point) => ({ x: point.x, y: point.y }))
            : [],
        visibilityMode,
        allowedUsers,
        active: Boolean(dom.active?.checked),
    };
}

function fillForm(alert) {
    if (!dom.title || !dom.description || !dom.gpsX || !dom.gpsY || !dom.active) return;

    state.drawMode = false;
    state.drawDraftPoints = [];
    state.drawBackupSelection = null;

    if (!alert) {
        dom.title.value = '';
        dom.description.value = '';
        dom.gpsX.value = '';
        dom.gpsY.value = '';
        dom.active.checked = true;
        state.audienceMode = 'all';
        state.allowedUsers = [];
        if (dom.alertMode) dom.alertMode.textContent = 'Brouillon';
        if (dom.publishBtn) dom.publishBtn.textContent = 'Enregistrer';
        updateRadiusUi(DEFAULT_RADIUS);
        setSelection(null, { syncForm: false, resetDraft: true });
        renderAudienceUi();
        scheduleMapView(false);
        return;
    }

    dom.title.value = String(alert.title || '');
    dom.description.value = String(alert.description || '');
    dom.gpsX.value = Number(alert.gpsX).toFixed(2);
    dom.gpsY.value = Number(alert.gpsY).toFixed(2);
    dom.active.checked = alert.active !== false;
    state.audienceMode = alert.visibilityMode === 'whitelist' ? 'whitelist' : 'all';
    state.allowedUsers = sanitizeAllowedUsers(alert.allowedUsers);
    if (dom.alertMode) dom.alertMode.textContent = alert.active === false ? 'Inactive' : 'Active';
    if (dom.publishBtn) dom.publishBtn.textContent = 'Mettre a jour';
    updateRadiusUi(alert.radius || DEFAULT_RADIUS);
    renderAudienceUi();

    setSelection({
        shapeType: alert.shapeType === 'zone' ? 'zone' : 'circle',
        xPercent: alert.xPercent,
        yPercent: alert.yPercent,
        gpsX: alert.gpsX,
        gpsY: alert.gpsY,
        radius: alert.radius || DEFAULT_RADIUS,
        zonePoints: alert.zonePoints || [],
    }, { resetDraft: true });
    scheduleMapView(true);
}

function syncMapFrame() {
    if (!dom.mapWorld || !state.mapWidth || !state.mapHeight) return false;

    dom.mapWorld.style.width = `${state.mapWidth}px`;
    dom.mapWorld.style.height = `${state.mapHeight}px`;

    if (dom.mapImage) {
        dom.mapImage.style.width = '100%';
        dom.mapImage.style.height = '100%';
    }

    if (dom.alertLayer) {
        dom.alertLayer.style.width = '100%';
        dom.alertLayer.style.height = '100%';
    }

    return true;
}

function updateTransform() {
    if (!dom.mapWorld || !syncMapFrame()) return;
    dom.mapWorld.style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.scale})`;
}

function centerMap() {
    if (!dom.viewport || !state.mapWidth || !state.mapHeight) return false;
    const viewportWidth = dom.viewport.clientWidth;
    const viewportHeight = dom.viewport.clientHeight;
    if (viewportWidth < 40 || viewportHeight < 40) return false;
    const scale = Math.min(viewportWidth / state.mapWidth, viewportHeight / state.mapHeight);
    state.view.scale = scale || 0.45;
    state.view.x = (viewportWidth - state.mapWidth * state.view.scale) / 2;
    state.view.y = (viewportHeight - state.mapHeight * state.view.scale) / 2;
    updateTransform();
    return true;
}

function focusSelection() {
    const selection = state.selection;
    if (!selection || !dom.viewport || !state.mapWidth || !state.mapHeight) return false;

    const viewportWidth = dom.viewport.clientWidth;
    const viewportHeight = dom.viewport.clientHeight;
    if (viewportWidth < 40 || viewportHeight < 40) return false;

    let focusX = selection.xPercent;
    let focusY = selection.yPercent;
    let scale = 2.35;

    if (selection.shapeType === 'zone' && selection.zonePoints.length >= 3) {
        const bounds = getZoneBounds(selection.zonePoints);
        if (bounds) {
            focusX = (bounds.minX + bounds.maxX) / 2;
            focusY = (bounds.minY + bounds.maxY) / 2;
            const widthPx = Math.max(80, ((bounds.maxX - bounds.minX) / 100) * state.mapWidth);
            const heightPx = Math.max(80, ((bounds.maxY - bounds.minY) / 100) * state.mapHeight);
            const fitScale = Math.min(
                (viewportWidth - 120) / widthPx,
                (viewportHeight - 120) / heightPx
            );
            scale = Math.min(2.2, Math.max(0.8, fitScale));
        }
    }

    state.view.scale = scale;
    state.view.x = (viewportWidth / 2) - (focusX * state.mapWidth / 100) * scale;
    state.view.y = (viewportHeight / 2) - (focusY * state.mapHeight / 100) * scale;
    updateTransform();
    return true;
}

function scheduleMapView(preferFocus = true, attempt = 0) {
    if (!state.mapWidth || !state.mapHeight) {
        if (attempt < 12) {
            window.setTimeout(() => scheduleMapView(preferFocus, attempt + 1), 120);
        }
        return;
    }

    const viewportWidth = dom.viewport?.clientWidth || 0;
    const viewportHeight = dom.viewport?.clientHeight || 0;
    if (viewportWidth < 40 || viewportHeight < 40) {
        if (attempt < 12) {
            requestAnimationFrame(() => scheduleMapView(preferFocus, attempt + 1));
        }
        return;
    }

    syncMapFrame();
    const applied = preferFocus && state.selection ? focusSelection() : centerMap();
    if (!applied && attempt < 12) {
        requestAnimationFrame(() => scheduleMapView(preferFocus, attempt + 1));
    }
}

function getMapPercentCoords(clientX, clientY) {
    const rect = dom.mapWorld.getBoundingClientRect();
    return {
        x: ((clientX - rect.left) / rect.width) * 100,
        y: ((clientY - rect.top) / rect.height) * 100,
    };
}

function updateHudCoords(event) {
    if (!dom.coords || !state.mapWidth) return;
    const coords = getMapPercentCoords(event.clientX, event.clientY);
    const gps = percentageToGps(coords.x, coords.y);
    dom.coords.textContent = `GPS: ${gps.x.toFixed(2)} | ${gps.y.toFixed(2)}`;
}

function requestAdmin(action, payload = {}) {
    return fetch(ALERTS_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-staff-code': STAFF_CODE,
        },
        body: JSON.stringify({ action, accessCode: STAFF_CODE, ...payload }),
    }).then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) {
            throw new Error(data.error || `Erreur alerte (${response.status})`);
        }
        return data;
    });
}

function openPickerMapWindow() {
    if (!state.unlocked) {
        setStatusMessage('Deverrouille la console avant d’ouvrir la carte dediee.', 'warn');
        return;
    }

    const picker = window.open(
        '../map/index.html?pickAlert=1',
        'bni-alert-picker',
        'width=1480,height=940,resizable=yes,scrollbars=no'
    );

    if (!picker) {
        setStatusMessage('Popup bloquee. Autorise les fenetres puis reessaie.', 'error');
        return;
    }

    state.pickerWindow = picker;
    try {
        picker.focus();
    } catch (e) {}
    setStatusMessage('Carte dediee ouverte. Clique sur la carte pour rapatrier la position.', 'ok');
}

function handlePickerMessage(event) {
    if (event.origin !== window.location.origin) return;
    const data = event.data && typeof event.data === 'object' ? event.data : null;
    if (!data || data.type !== 'bni-alert-location') return;

    applyPickerSelection(data.payload);
    state.pickerWindow = null;
}

async function loadCurrentAlert() {
    const data = await requestAdmin('get-admin');
    state.currentAlert = data.alert || null;
    fillForm(state.currentAlert);
    refreshStatusCards();
    if (state.currentAlert) {
        setStatusMessage(state.currentAlert.active === false ? 'Alerte chargee en brouillon.' : 'Alerte active chargee.', state.currentAlert.active === false ? 'warn' : 'ok');
    } else {
        setStatusMessage('Aucune alerte enregistree. Cree une nouvelle alerte.', 'idle');
    }
}

async function saveAlert() {
    try {
        const payload = readDraftAlert();
        const data = await requestAdmin('upsert', { alert: payload });
        state.currentAlert = data.alert || null;
        fillForm(state.currentAlert);
        refreshStatusCards();
        notifyPublicAlertRefresh();
        setStatusMessage(state.currentAlert?.active === false ? 'Alerte sauvegardee en brouillon.' : 'Alerte publiee.', 'ok');
    } catch (error) {
        setStatusMessage(error.message || 'Impossible de publier l’alerte.', 'error');
    }
}

async function toggleAlert() {
    if (!state.currentAlert) {
        setStatusMessage('Aucune alerte a activer ou desactiver.', 'warn');
        return;
    }

    try {
        const payload = readDraftAlert();
        payload.id = state.currentAlert.id;
        payload.active = !Boolean(state.currentAlert.active);
        const data = await requestAdmin('upsert', { alert: payload });
        state.currentAlert = data.alert || null;
        fillForm(state.currentAlert);
        refreshStatusCards();
        notifyPublicAlertRefresh();
        setStatusMessage(state.currentAlert?.active === false ? 'Alerte desactivee.' : 'Alerte activee.', 'ok');
    } catch (error) {
        setStatusMessage(error.message || 'Impossible de changer l’etat de l’alerte.', 'error');
    }
}

async function deleteAlert() {
    if (!state.currentAlert) {
        setStatusMessage('Aucune alerte a supprimer.', 'warn');
        return;
    }
    if (!window.confirm('Supprimer l’alerte courante ?')) return;

    try {
        await requestAdmin('delete');
        state.currentAlert = null;
        fillForm(null);
        refreshStatusCards();
        notifyPublicAlertRefresh();
        setStatusMessage('Alerte supprimee.', 'ok');
    } catch (error) {
        setStatusMessage(error.message || 'Suppression impossible.', 'error');
    }
}

function clearDraft() {
    state.currentAlert = null;
    state.drawMode = false;
    state.drawDraftPoints = [];
    state.drawBackupSelection = null;
    fillForm(null);
    refreshStatusCards();
    renderBanner();
    setStatusMessage('Brouillon vide. L’alerte live reste inchangée tant que tu ne republies pas.', 'warn');
}

function updateSelectionFromGpsInputs() {
    const gpsX = Number(dom.gpsX?.value);
    const gpsY = Number(dom.gpsY?.value);
    if (!Number.isFinite(gpsX) || !Number.isFinite(gpsY)) return;

    setSelection(buildCircleSelectionFromGps(gpsX, gpsY, getCurrentRadius()), {
        syncForm: false,
        resetDraft: true,
    });
}

function activateCircleMode() {
    state.drawMode = false;
    state.drawDraftPoints = [];
    state.drawBackupSelection = null;

    const gpsX = Number(dom.gpsX?.value);
    const gpsY = Number(dom.gpsY?.value);

    if (Number.isFinite(gpsX) && Number.isFinite(gpsY)) {
        setSelection(buildCircleSelectionFromGps(gpsX, gpsY, getCurrentRadius()), {
            syncForm: true,
            resetDraft: true,
        });
    } else if (state.selection?.shapeType === 'zone') {
        setSelection(buildCircleSelectionFromPercent(state.selection.xPercent, state.selection.yPercent, getCurrentRadius()), {
            syncForm: true,
            resetDraft: true,
        });
    } else {
        renderSelection();
        renderBanner();
        refreshStatusCards();
    }

    setStatusMessage('Mode cercle actif.', 'ok');
}

function beginZoneDraw() {
    state.drawMode = true;
    state.drawBackupSelection = cloneSelection(state.selection);
    state.drawDraftPoints = state.selection?.shapeType === 'zone'
        ? sanitizeZonePoints(state.selection.zonePoints)
        : [];
    state.selection = null;
    renderSelection();
    renderBanner();
    refreshStatusCards();
    setStatusMessage('Mode dessin actif. Clique pour poser des points, puis valide la zone.', 'ok');
}

function cancelZoneDraw() {
    const restore = cloneSelection(state.drawBackupSelection);
    state.drawMode = false;
    state.drawDraftPoints = [];
    state.drawBackupSelection = null;

    if (restore) {
        setSelection(restore, { syncForm: true, resetDraft: true });
    } else {
        renderSelection();
        renderBanner();
        refreshStatusCards();
    }

    setStatusMessage('Dessin annule.', 'warn');
}

function choosePositionOnMap(event) {
    if (!state.mapSelectionEnabled) return;

    const coords = getMapPercentCoords(event.clientX, event.clientY);

    if (state.drawMode) {
        state.drawDraftPoints.push({
            x: Number(coords.x.toFixed(4)),
            y: Number(coords.y.toFixed(4)),
        });
        renderSelection();
        renderBanner();
        refreshStatusCards();
        setStatusMessage(`Point ${state.drawDraftPoints.length} ajoute.`, 'ok');
        return;
    }

    setSelection(buildCircleSelectionFromPercent(coords.x, coords.y, getCurrentRadius()), {
        syncForm: true,
        resetDraft: true,
    });
    setStatusMessage('Position mise a jour depuis la carte.', 'ok');
}

function initMap() {
    if (dom.mapImage?.complete && dom.mapImage.naturalWidth > 0 && dom.mapImage.naturalHeight > 0) {
        state.mapWidth = dom.mapImage.naturalWidth;
        state.mapHeight = dom.mapImage.naturalHeight;
        syncMapFrame();
        scheduleMapView(Boolean(state.selection));
    } else if (dom.mapImage) {
        dom.mapImage.onload = () => {
            state.mapWidth = dom.mapImage.naturalWidth;
            state.mapHeight = dom.mapImage.naturalHeight;
            syncMapFrame();
            scheduleMapView(Boolean(state.selection));
        };
    }

    dom.viewport?.addEventListener('wheel', (event) => {
        event.preventDefault();
        const delta = event.deltaY > 0 ? -1 : 1;
        const nextScale = state.view.scale * (1 + delta * 0.1);
        if (nextScale < 0.08 || nextScale > 7) return;

        const rect = dom.viewport.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        state.view.x = mouseX - (mouseX - state.view.x) * (nextScale / state.view.scale);
        state.view.y = mouseY - (mouseY - state.view.y) * (nextScale / state.view.scale);
        state.view.scale = nextScale;
        updateTransform();
    }, { passive: false });

    dom.viewport?.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        state.pointer.active = true;
        state.pointer.moved = false;
        state.pointer.startX = event.clientX;
        state.pointer.startY = event.clientY;
        state.pointer.lastX = event.clientX;
        state.pointer.lastY = event.clientY;
    });

    window.addEventListener('mousemove', (event) => {
        updateHudCoords(event);
        if (!state.pointer.active) return;

        const deltaX = event.clientX - state.pointer.lastX;
        const deltaY = event.clientY - state.pointer.lastY;
        const totalX = Math.abs(event.clientX - state.pointer.startX);
        const totalY = Math.abs(event.clientY - state.pointer.startY);

        if (totalX > 4 || totalY > 4) {
            state.pointer.moved = true;
        }

        if (state.pointer.moved) {
            state.view.x += deltaX;
            state.view.y += deltaY;
            updateTransform();
        }

        state.pointer.lastX = event.clientX;
        state.pointer.lastY = event.clientY;
    });

    window.addEventListener('mouseup', (event) => {
        if (!state.pointer.active) return;
        const moved = state.pointer.moved;
        state.pointer.active = false;

        if (!moved && dom.viewport?.contains(event.target)) {
            choosePositionOnMap(event);
        }
    });
}

function unlockConsole() {
    setLockState(false);
    if (dom.accessInput) dom.accessInput.value = '';
    if (dom.accessError) dom.accessError.textContent = '';
    loadCurrentAlert().catch((error) => {
        setStatusMessage(error.message || 'Impossible de charger les alertes.', 'error');
    });
    loadUserDirectory().catch(() => {});
    scheduleMapView(Boolean(state.selection));
}

function lockConsole() {
    setLockState(true);
    setStatusMessage('Console verrouillee.', 'idle');
}

function bindEvents() {
    dom.homeBtn?.addEventListener('click', () => {
        window.location.href = '../index.html';
    });

    dom.accessSubmit?.addEventListener('click', () => {
        const code = String(dom.accessInput?.value || '').trim();
        if (code !== STAFF_CODE) {
            if (dom.accessError) dom.accessError.textContent = 'Code incorrect.';
            return;
        }
        unlockConsole();
    });

    dom.accessInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') dom.accessSubmit?.click();
    });

    dom.publishBtn?.addEventListener('click', saveAlert);
    dom.deleteBtn?.addEventListener('click', deleteAlert);
    dom.lockBtn?.addEventListener('click', lockConsole);
    dom.clearBtn?.addEventListener('click', clearDraft);
    dom.useMapBtn?.addEventListener('click', activateCircleMode);
    dom.startZoneBtn?.addEventListener('click', beginZoneDraw);
    dom.openPickerBtn?.addEventListener('click', openPickerMapWindow);
    dom.finishZoneBtn?.addEventListener('click', () => {
        if (finalizeZoneDraft({ silent: false })) {
            focusSelection();
        }
    });
    dom.cancelZoneBtn?.addEventListener('click', cancelZoneDraw);

    dom.radius?.addEventListener('input', () => {
        const radius = getCurrentRadius();
        updateRadiusUi(radius);
        if (state.selection?.shapeType !== 'zone') {
            const base = state.selection
                ? cloneSelection(state.selection)
                : (() => {
                    const gpsX = Number(dom.gpsX?.value);
                    const gpsY = Number(dom.gpsY?.value);
                    return Number.isFinite(gpsX) && Number.isFinite(gpsY)
                        ? buildCircleSelectionFromGps(gpsX, gpsY, radius)
                        : null;
                })();
            if (base) {
                setSelection({
                    ...base,
                    radius,
                    shapeType: 'circle',
                    zonePoints: [],
                }, { syncForm: false, resetDraft: false });
            } else {
                refreshStatusCards();
            }
        } else {
            renderBanner();
            refreshStatusCards();
        }
    });

    dom.resetView?.addEventListener('click', centerMap);
    dom.toggleSelection?.addEventListener('click', () => {
        state.mapSelectionEnabled = !state.mapSelectionEnabled;
        dom.toggleSelection.classList.toggle('active', state.mapSelectionEnabled);
        dom.toggleSelection.textContent = state.mapSelectionEnabled ? 'Selection carte' : 'Selection pause';
        refreshStatusCards();
    });

    dom.title?.addEventListener('input', renderBanner);
    dom.description?.addEventListener('input', renderBanner);
    dom.gpsX?.addEventListener('input', updateSelectionFromGpsInputs);
    dom.gpsY?.addEventListener('input', updateSelectionFromGpsInputs);
    dom.active?.addEventListener('change', () => {
        if (dom.alertMode) dom.alertMode.textContent = dom.active.checked ? 'Active' : 'Inactive';
    });
    dom.audienceAllBtn?.addEventListener('click', () => {
        state.audienceMode = 'all';
        renderAudienceUi();
    });
    dom.audienceWhitelistBtn?.addEventListener('click', () => {
        state.audienceMode = 'whitelist';
        renderAudienceUi();
    });
    dom.whitelistAddBtn?.addEventListener('click', () => addWhitelistUser(dom.whitelistInput?.value || ''));
    dom.whitelistInput?.addEventListener('input', () => renderWhitelistSuggestions());
    dom.whitelistInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            addWhitelistUser(dom.whitelistInput?.value || '');
        }
    });

    window.addEventListener('resize', () => {
        scheduleMapView(Boolean(state.selection));
    });

    window.addEventListener('message', handlePickerMessage);

    window.addEventListener('load', () => {
        scheduleMapView(Boolean(state.selection));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    updateRadiusUi(DEFAULT_RADIUS);
    bindEvents();
    initMap();
    renderAudienceUi();
    refreshStatusCards();
    renderBanner();
    if (dom.accessInput) dom.accessInput.focus();
});
