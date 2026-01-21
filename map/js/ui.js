// map/js/ui.js
import { state, addTacticalLink } from './state.js';
import { renderAll } from './render.js'; 
import { renderEditor, closeEditor } from './ui-editor.js';
import { customAlert } from './ui-modals.js';
import { renderGroupsList } from './ui-list.js'; 
import { initContextMenu, handleLinkClick, handleLinkHover, handleLinkOut, moveTooltip } from './ui-menus.js';

export { handleLinkClick, handleLinkHover, handleLinkOut, moveTooltip };

export function initUI() {
    initContextMenu(); 
    
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

    const btnMeasure = document.getElementById('btnMeasure');
    if(btnMeasure) {
        btnMeasure.onclick = () => {
            state.measuringMode = !state.measuringMode;
            state.measureStep = 0;
            state.measurePoints = [];
            
            if(state.measuringMode) btnMeasure.classList.add('active');
            else btnMeasure.classList.remove('active');
            
            renderAll();
        };
    }

    const chkLabels = document.getElementById('chkLabels');
    if(chkLabels) {
        chkLabels.addEventListener('change', (e) => {
            if(e.target.checked) document.body.classList.add('show-labels');
            else document.body.classList.remove('show-labels');
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

// AJOUT : Rétro-compatibilité pour éviter de casser d'autres scripts
export function selectPoint(gIndex, pIndex) {
    selectItem('point', gIndex, pIndex);
}

export function deselect() { 
    state.selectedPoint = null; 
    state.selectedZone = null; 
    renderAll(); 
    closeEditor(); 
}

export { renderGroupsList };