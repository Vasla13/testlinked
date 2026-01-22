import { state, updateTacticalLink, removeTacticalLink, findPointById, saveLocalState } from './state.js';
import { renderAll, getMapPercentCoords } from './render.js';
import { customConfirm, customPrompt, customAlert } from './ui-modals.js';
import { percentageToGps } from './utils.js';
// AJOUT : Import de startDrawingFree
import { startDrawingCircle, startDrawingFree } from './zone-editor.js';

export function initContextMenu() {
    const menu = document.getElementById('context-menu');
    const viewport = document.getElementById('viewport'); 
    let lastClickPercent = { x: 0, y: 0 };

    if (!viewport || !menu) return;

    // --- GESTION DE L'OUVERTURE (CLIC DROIT) ---
    viewport.addEventListener('contextmenu', (e) => {
        e.preventDefault(); 
        if(state.drawingMode) return; 
        
        lastClickPercent = getMapPercentCoords(e.clientX, e.clientY);
        
        // Calcul pour que le menu ne sorte pas de l'écran
        let x = e.clientX, y = e.clientY;
        if (x + 230 > window.innerWidth) x -= 230;
        if (y + 150 > window.innerHeight) y -= 150;
        
        menu.style.left = `${x}px`; menu.style.top = `${y}px`;
        menu.classList.add('visible');
    });

    // Fermeture au clic ailleurs
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target)) menu.classList.remove('visible');
    });

    // --- BOUTON 1 : NOUVEAU POINT ---
    const btnPoint = document.getElementById('ctx-new-point');
    if(btnPoint) {
        btnPoint.onclick = () => {
            menu.classList.remove('visible');
            openGpsPanelWithCoords(lastClickPercent);
        };
    }

    // --- BOUTON 2 : NOUVELLE ZONE (CERCLE) ---
    const btnZone = document.getElementById('ctx-new-zone');
    if(btnZone) {
        btnZone.onclick = () => {
            menu.classList.remove('visible');
            if (state.groups.length === 0) {
                customAlert("ERREUR", "Créez d'abord un calque/groupe.");
                return;
            }
            // Lance le mode Cercle sur le premier groupe (ou modifier pour choisir)
            startDrawingCircle(0);
        };
    }

    // --- BOUTON 3 : DESSIN LIBRE (NOUVEAU) ---
    const btnFree = document.getElementById('ctx-new-free-zone');
    if(btnFree) {
        btnFree.onclick = () => {
            menu.classList.remove('visible');
            if (state.groups.length === 0) {
                customAlert("ERREUR", "Créez d'abord un calque/groupe.");
                return;
            }
            // Lance le mode Dessin Libre sur le premier groupe
            startDrawingFree(0);
        };
    }
    
    // --- BOUTON ANNULER ---
    const btnCancel = document.getElementById('ctx-cancel');
    if(btnCancel) {
        btnCancel.onclick = () => menu.classList.remove('visible');
    }
}

function openGpsPanelWithCoords(coords) {
    const gpsPanel = document.getElementById('gps-panel');
    const gpsCoords = percentageToGps(coords.x, coords.y);
    
    const inputX = document.getElementById('gpsInputX');
    const inputY = document.getElementById('gpsInputY');
    
    if(inputX) inputX.value = gpsCoords.x.toFixed(2);
    if(inputY) inputY.value = gpsCoords.y.toFixed(2);
    
    if(gpsPanel) gpsPanel.style.display = 'block';
}

export function handleLinkClick(e, link) {
    // Création dynamique du menu pour le lien
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

    // Actions du menu lien
    document.getElementById('btnLinkColor').onclick = async () => { 
        menu.remove(); 
        const c = await customPrompt("COULEUR", "Hex ou Nom :"); 
        if (c) { updateTacticalLink(link.id, { color: c }); saveLocalState(); renderAll(); } 
    };
    
    document.getElementById('btnLinkType').onclick = async () => { 
        menu.remove(); 
        const t = await customPrompt("TYPE", "Label :"); 
        if (t) { updateTacticalLink(link.id, { type: t }); saveLocalState(); renderAll(); } 
    };
    
    document.getElementById('btnLinkDelete').onclick = async () => { 
        menu.remove(); 
        if (await customConfirm("SUPPRESSION", "Supprimer ?")) { 
            removeTacticalLink(link.id); saveLocalState(); renderAll(); 
        } 
    };
    
    document.getElementById('btnLinkClose').onclick = () => menu.remove();
    
    // Fermeture automatique si on clique ailleurs
    setTimeout(() => { 
        const c = (ev) => { 
            if (!menu.contains(ev.target)) { 
                menu.remove(); 
                document.removeEventListener('click', c); 
            } 
        }; 
        document.addEventListener('click', c); 
    }, 100);
}

// --- TOOLTIPS DES LIENS ---
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