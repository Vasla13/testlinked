// map/js/ui-menus.js
import { state, updateTacticalLink, removeTacticalLink, findPointById } from './state.js';
import { renderAll, getMapPercentCoords } from './render.js';
import { customConfirm, customPrompt } from './ui-modals.js';
import { percentageToGps } from './utils.js';

// --- MENU CONTEXTUEL (Clic Droit Map) ---
export function initContextMenu() {
    const menu = document.getElementById('context-menu');
    const viewport = document.getElementById('viewport'); 
    let lastClickPercent = { x: 0, y: 0 };

    if (!viewport || !menu) return;

    viewport.addEventListener('contextmenu', (e) => {
        e.preventDefault(); 
        if(state.drawingMode) return; 
        
        lastClickPercent = getMapPercentCoords(e.clientX, e.clientY);
        
        // Positionnement intelligent (évite de sortir de l'écran)
        let x = e.clientX, y = e.clientY;
        if (x + 230 > window.innerWidth) x -= 230;
        if (y + 150 > window.innerHeight) y -= 150;
        
        menu.style.left = `${x}px`; 
        menu.style.top = `${y}px`;
        menu.classList.add('visible');
    });

    // Fermeture au clic ailleurs
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target)) menu.classList.remove('visible');
    });

    // Actions du menu
    document.getElementById('ctx-new-point').onclick = () => {
        menu.classList.remove('visible');
        openGpsPanelWithCoords(lastClickPercent);
    };
    
    document.getElementById('ctx-measure').onclick = () => {
        menu.classList.remove('visible');
        startMeasurementAt(lastClickPercent);
    };
    
    document.getElementById('ctx-cancel').onclick = () => menu.classList.remove('visible');
}

// Helpers internes au menu
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


// --- MENU LIENS (Clic Gauche Lien) ---
export function handleLinkClick(e, link) {
    // Création DOM du menu
    const menu = document.createElement('div');
    menu.className = 'link-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    
    menu.innerHTML = `
        <div class="link-menu-title">Lien Tactique</div>
        <button id="btnLinkColor">🎨 Changer Couleur</button>
        <button id="btnLinkType">📝 Changer Type</button>
        <div class="separator-h"></div>
        <button id="btnLinkDelete" style="color:var(--danger)">🗑️ Supprimer</button>
        <button id="btnLinkClose">Annuler</button>
    `;
    document.body.appendChild(menu);

    // Handlers
    document.getElementById('btnLinkColor').onclick = async () => {
        menu.remove();
        const color = await customPrompt("COULEUR", "Code Hex (ex: #ff0000) ou Nom :");
        if (color) { updateTacticalLink(link.id, { color }); renderAll(); }
    };

    document.getElementById('btnLinkType').onclick = async () => {
        menu.remove();
        const type = await customPrompt("TYPE", "Label du lien (ex: Patrouille, Vue...) :");
        if (type) { updateTacticalLink(link.id, { type }); renderAll(); }
    };

    document.getElementById('btnLinkDelete').onclick = async () => {
        menu.remove();
        if (await customConfirm("SUPPRESSION", "Supprimer ce lien ?")) {
            removeTacticalLink(link.id);
            renderAll();
        }
    };

    document.getElementById('btnLinkClose').onclick = () => menu.remove();
    
    // Auto-close
    setTimeout(() => {
        const closeFn = (ev) => {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('click', closeFn);
            }
        };
        document.addEventListener('click', closeFn);
    }, 100);
}


// --- TOOLTIPS (Survol Lien) ---
let tooltipEl = null;

export function handleLinkHover(e, link) {
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'link-tooltip';
        document.body.appendChild(tooltipEl);
    }
    const p1 = findPointById(link.from);
    const p2 = findPointById(link.to);
    
    tooltipEl.innerHTML = `<strong>${link.type || 'Lien'}</strong><br>${p1?.name || '?'} ↔ ${p2?.name || '?'}`;
    tooltipEl.style.display = 'block';
    moveTooltip(e);
}

export function handleLinkOut() {
    if (tooltipEl) tooltipEl.style.display = 'none';
}

export function moveTooltip(e) {
    if (tooltipEl && tooltipEl.style.display === 'block') {
        tooltipEl.style.left = (e.clientX + 15) + 'px';
        tooltipEl.style.top = (e.clientY + 15) + 'px';
    }
}