import { state, updateTacticalLink, removeTacticalLink, findPointById } from './state.js';
import { renderAll, getMapPercentCoords } from './render.js';
import { customConfirm, customPrompt, customAlert } from './ui-modals.js';
import { percentageToGps } from './utils.js';
// IMPORT : Fonction de création de cercle
import { startDrawingCircle } from './zone-editor.js';

// --- MENU CONTEXTUEL (Clic Droit Map) ---
export function initContextMenu() {
    const menu = document.getElementById('context-menu');
    const viewport = document.getElementById('viewport'); 
    let lastClickPercent = { x: 0, y: 0 };

    if (!viewport || !menu) return;

    // Ajouter le bouton Zone s'il n'existe pas dans le HTML
    // (Ou assurez-vous de l'ajouter manuellement dans index.html)
    // Ici, on va l'injecter dynamiquement si besoin ou utiliser un bouton existant
    if (!document.getElementById('ctx-new-zone')) {
        const btn = document.createElement('li');
        btn.id = 'ctx-new-zone';
        btn.innerHTML = '⭕ Nouvelle Zone';
        // Insérer après "Nouveau Point"
        const ref = document.getElementById('ctx-new-point');
        if(ref && ref.parentNode) ref.parentNode.insertBefore(btn, ref.nextSibling);
    }

    viewport.addEventListener('contextmenu', (e) => {
        e.preventDefault(); 
        if(state.drawingMode) return; 
        
        lastClickPercent = getMapPercentCoords(e.clientX, e.clientY);
        
        let x = e.clientX, y = e.clientY;
        if (x + 230 > window.innerWidth) x -= 230;
        if (y + 150 > window.innerHeight) y -= 150;
        
        menu.style.left = `${x}px`; menu.style.top = `${y}px`;
        menu.classList.add('visible');
    });

    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target)) menu.classList.remove('visible');
    });

    // Actions
    document.getElementById('ctx-new-point').onclick = () => {
        menu.classList.remove('visible');
        openGpsPanelWithCoords(lastClickPercent);
    };

    // --- NOUVEAU : CRÉATION ZONE ---
    const btnZone = document.getElementById('ctx-new-zone');
    if(btnZone) {
        btnZone.onclick = () => {
            menu.classList.remove('visible');
            // On choisit le groupe 0 par défaut ou le premier visible
            if (state.groups.length === 0) {
                customAlert("ERREUR", "Créez d'abord un calque/groupe.");
                return;
            }
            // On lance le mode dessin sur le groupe 0 (l'utilisateur pourra changer après)
            startDrawingCircle(0);
        };
    }
    
    document.getElementById('ctx-measure').onclick = () => {
        menu.classList.remove('visible');
        startMeasurementAt(lastClickPercent);
    };
    document.getElementById('ctx-cancel').onclick = () => menu.classList.remove('visible');
}

// Helpers
function openGpsPanelWithCoords(coords) {
    const gpsPanel = document.getElementById('gps-panel');
    const gpsCoords = percentageToGps(coords.x, coords.y);
    document.getElementById('gpsInputX').value = gpsCoords.x.toFixed(2);
    document.getElementById('gpsInputY').value = gpsCoords.y.toFixed(2);
    gpsPanel.style.display = 'block';
}

function startMeasurementAt(coords) {
    state.measuringMode = true;
    state.measureStep = 1; 
    state.measurePoints = [coords, coords]; 
    const btnMeasure = document.getElementById('btnMeasure');
    if(btnMeasure) btnMeasure.classList.add('active');
    document.body.style.cursor = 'crosshair';
    renderAll();
}


// --- MENU LIENS & TOOLTIPS (Inchangé) ---
export function handleLinkClick(e, link) {
    const menu = document.createElement('div');
    menu.className = 'link-menu';
    menu.style.left = `${e.clientX}px`; menu.style.top = `${e.clientY}px`;
    menu.innerHTML = `
        <div class="link-menu-title">Lien Tactique</div>
        <button id="btnLinkColor">🎨 Changer Couleur</button>
        <button id="btnLinkType">📝 Changer Type</button>
        <div class="separator-h"></div>
        <button id="btnLinkDelete" style="color:var(--danger)">🗑️ Supprimer</button>
        <button id="btnLinkClose">Annuler</button>
    `;
    document.body.appendChild(menu);

    document.getElementById('btnLinkColor').onclick = async () => { menu.remove(); const c = await customPrompt("COULEUR", "Hex ou Nom :"); if (c) { updateTacticalLink(link.id, { color: c }); renderAll(); } };
    document.getElementById('btnLinkType').onclick = async () => { menu.remove(); const t = await customPrompt("TYPE", "Label :"); if (t) { updateTacticalLink(link.id, { type: t }); renderAll(); } };
    document.getElementById('btnLinkDelete').onclick = async () => { menu.remove(); if (await customConfirm("SUPPRESSION", "Supprimer ?")) { removeTacticalLink(link.id); renderAll(); } };
    document.getElementById('btnLinkClose').onclick = () => menu.remove();
    setTimeout(() => { const c = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', c); } }; document.addEventListener('click', c); }, 100);
}

let tooltipEl = null;
export function handleLinkHover(e, link) {
    if (!tooltipEl) { tooltipEl = document.createElement('div'); tooltipEl.className = 'link-tooltip'; document.body.appendChild(tooltipEl); }
    const p1 = findPointById(link.from); const p2 = findPointById(link.to);
    tooltipEl.innerHTML = `<strong>${link.type || 'Lien'}</strong><br>${p1?.name || '?'} ↔ ${p2?.name || '?'}`;
    tooltipEl.style.display = 'block'; moveTooltip(e);
}
export function handleLinkOut() { if (tooltipEl) tooltipEl.style.display = 'none'; }
export function moveTooltip(e) { if (tooltipEl && tooltipEl.style.display === 'block') { tooltipEl.style.left = (e.clientX + 15) + 'px'; tooltipEl.style.top = (e.clientY + 15) + 'px'; } }