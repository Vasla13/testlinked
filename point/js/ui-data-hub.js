export function openPointDataHubModal(options = {}) {
    const {
        ensureModal = () => {},
        setModalMode = () => {},
        getModalOverlay = () => null,
        collab = {},
        escapeHtml = (value) => String(value || ''),
        isLocalSaveLocked = () => false,
        isCloudBoardActive = () => false,
        showCloudMenu = () => {},
        saveActiveCloudBoard = () => Promise.resolve(),
        downloadJSON = () => {},
        generateExportData = () => ({}),
        showCustomAlert = () => {},
        showRawDataInput = () => {},
        triggerFileInput = () => {},
        resetAllPointData = () => {},
    } = options;

    ensureModal();
    setModalMode('datahub');

    const modalOverlay = getModalOverlay();
    const msgEl = document.getElementById('modal-msg');
    const actEl = document.getElementById('modal-actions');
    if (!modalOverlay || !msgEl || !actEl) return;

    const localSaveBlocked = Boolean(isLocalSaveLocked());
    const cloudSummary = isCloudBoardActive()
        ? `${collab.activeBoardTitle || collab.activeBoardId} · ${collab.activeRole || 'cloud'}`
        : (collab.user ? 'Session cloud ouverte' : 'Cloud non connecte');
    const localSummary = localSaveBlocked ? 'Local verrouille' : 'Local actif';

    msgEl.innerHTML = `
        <div class="modal-tool data-hub">
            <div class="data-hub-head">
                <h3 class="modal-tool-title">Donnees</h3>
                <div class="modal-note">Choisis clairement entre local et cloud. Les actions avancees restent disponibles en dessous.</div>
            </div>

            <div class="data-hub-panels">
                <div class="data-hub-section data-hub-section-local">
                    <div class="data-hub-kicker">Local</div>
                    <div class="data-hub-grid">
                        <button type="button" class="data-hub-card data-hub-card-local" data-action="open-file">
                            <span class="data-hub-card-title">Ouvrir</span>
                            <span class="data-hub-card-meta">JSON</span>
                        </button>
                        <button type="button" class="data-hub-card data-hub-card-local ${localSaveBlocked ? 'is-disabled-visual' : ''}" data-action="save-file">
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
                    <button type="button" class="data-hub-card data-hub-card-local ${localSaveBlocked ? 'is-disabled-visual' : ''}" data-action="save-text">
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
                if (localSaveBlocked) return runLockedLocalAction();
                modalOverlay.style.display = 'none';
                downloadJSON();
                return;
            }
            if (action === 'save-text') {
                if (localSaveBlocked) return runLockedLocalAction();
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
                triggerFileInput('fileImport');
                return;
            }
            if (action === 'open-text') {
                showRawDataInput('load');
                return;
            }
            if (action === 'merge-file') {
                modalOverlay.style.display = 'none';
                triggerFileInput('fileMerge');
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
    if (closeBtn) closeBtn.onclick = () => {
        modalOverlay.style.display = 'none';
    };

    modalOverlay.style.display = 'flex';
}
