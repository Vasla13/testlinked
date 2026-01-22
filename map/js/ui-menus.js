import { state, updateTacticalLink, removeTacticalLink, findPointById, saveLocalState } from './state.js';
import { renderAll, getMapPercentCoords } from './render.js';
import { customConfirm, customPrompt, customAlert } from './ui-modals.js';
import { percentageToGps } from './utils.js';
import { startDrawingCircle } from './zone-editor.js';

export function initContextMenu() {
    const menu = document.getElementById('context-menu');
    const viewport = document.getElementById('viewport'); 
    let lastClickPercent = { x: 0, y: 0 };

    if (!viewport || !menu) return;

    if (!document.getElementById('ctx-new-zone')) {
        const btn = document.createElement('li');
        btn.id = 'ctx-new-zone';
        btn.innerHTML = '⭕ Nouvelle Zone';
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

    document.getElementById('ctx-new-point').onclick = () => {
        menu.classList.remove('visible');
        openGpsPanelWithCoords(lastClickPercent);
    };

    const btnZone = document.getElementById('ctx-new-zone');
    if(btnZone) {
        btnZone.onclick = () => {
            menu.classList.remove('visible');
            if (state.groups.length === 0) {
                customAlert("ERREUR", "Créez d'abord un calque/groupe.");
                return;
            }
            startDrawingCircle(0);
        };
    }
    
    // SUPPRIME : Gestion du clic sur ctx-measure

    document.getElementById('ctx-cancel').onclick = () => menu.classList.remove('visible');
}

function openGpsPanelWithCoords(coords) {
    const gpsPanel = document.getElementById('gps-panel');
    const gpsCoords = percentageToGps(coords.x, coords.y);
    document.getElementById('gpsInputX').value = gpsCoords.x.toFixed(2);
    document.getElementById('gpsInputY').value = gpsCoords.y.toFixed(2);
    gpsPanel.style.display = 'block';
}

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

    document.getElementById('btnLinkColor').onclick = async () => { menu.remove(); const c = await customPrompt("COULEUR", "Hex ou Nom :"); if (c) { updateTacticalLink(link.id, { color: c }); saveLocalState(); renderAll(); } };
    document.getElementById('btnLinkType').onclick = async () => { menu.remove(); const t = await customPrompt("TYPE", "Label :"); if (t) { updateTacticalLink(link.id, { type: t }); saveLocalState(); renderAll(); } };
    document.getElementById('btnLinkDelete').onclick = async () => { menu.remove(); if (await customConfirm("SUPPRESSION", "Supprimer ?")) { removeTacticalLink(link.id); saveLocalState(); renderAll(); } };
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