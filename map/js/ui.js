import { state, addTacticalLink, saveLocalState } from './state.js';
import { renderAll } from './render.js'; 
import { renderEditor, closeEditor } from './ui-editor.js';
import { customAlert } from './ui-modals.js';
import { renderGroupsList } from './ui-list.js'; 
import { initContextMenu, handleLinkClick, handleLinkHover, handleLinkOut, moveTooltip } from './ui-menus.js';
import { handleMapMouseDown, handleMapMouseMove, handleMapMouseUp } from './zone-editor.js';

export { handleLinkClick, handleLinkHover, handleLinkOut, moveTooltip };

export function initUI() {
    initContextMenu(); 
    
    const viewport = document.getElementById('viewport');
    if (viewport) {
        viewport.addEventListener('mousedown', (e) => handleMapMouseDown(e));
        window.addEventListener('mousemove', (e) => handleMapMouseMove(e));
        window.addEventListener('mouseup', (e) => handleMapMouseUp(e));
    }

    const btnMobileMenu = document.getElementById('btnMobileMenu');
    const sidebarLeft = document.getElementById('sidebar-left');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if(btnMobileMenu && sidebarLeft) {
        btnMobileMenu.onclick = () => {
            sidebarLeft.classList.toggle('mobile-active');
            if(sidebarOverlay) sidebarOverlay.classList.toggle('active');
        };
    }
    if(sidebarOverlay) {
        sidebarOverlay.onclick = () => {
            sidebarLeft.classList.remove('mobile-active');
            sidebarOverlay.classList.remove('active');
        };
    }

    const searchInput = document.getElementById('searchInput');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.searchTerm = e.target.value.toLowerCase();
            renderGroupsList();
        });
    }

    // SUPPRIME : Gestion du bouton mesure (btnMeasure) car l'élément est retiré du HTML

    const chkLabels = document.getElementById('chkLabels');
    if(chkLabels) {
        chkLabels.addEventListener('change', (e) => {
            document.body.classList.toggle('show-labels', e.target.checked);
        });
        if(chkLabels.checked) document.body.classList.add('show-labels');
    }
}

export function handlePointClick(gIndex, pIndex) {
    const group = state.groups[gIndex];
    const point = group.points[pIndex];
    
    if (state.linkingMode) {
        if (state.linkStartId && state.linkStartId !== point.id) {
            const success = addTacticalLink(state.linkStartId, point.id);
            if (success) {
                customAlert("SUCCÈS", "Lien tactique créé.");
                saveLocalState();
            } else {
                customAlert("INFO", "Ce lien existe déjà ou est invalide.");
            }
            state.linkingMode = false;
            state.linkStartId = null;
            document.body.style.cursor = 'default';
            renderAll();
        }
        return;
    }
    selectItem('point', gIndex, pIndex);
}

export function selectItem(type, gIndex, index) { 
    if (type === 'point') { 
        state.selectedPoint = { groupIndex: gIndex, pointIndex: index }; 
        state.selectedZone = null; 
    } else if (type === 'zone') { 
        state.selectedZone = { groupIndex: gIndex, zoneIndex: index }; 
        state.selectedPoint = null; 
    } else { 
        state.selectedPoint = null; 
        state.selectedZone = null; 
    }
    renderAll(); 
    renderEditor(); 
}

export function selectPoint(gIndex, pIndex) { selectItem('point', gIndex, pIndex); }

export function deselect() { 
    state.selectedPoint = null; 
    state.selectedZone = null; 
    renderAll(); 
    closeEditor(); 
}

export { renderGroupsList };