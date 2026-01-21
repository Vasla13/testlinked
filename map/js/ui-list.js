// map/js/ui-list.js
import { state } from './state.js';
import { handlePointClick } from './ui.js'; // On importe l'action de clic
import { renderAll } from './render.js';

export function renderGroupsList() {
    const groupsList = document.getElementById('groups-list');
    if (!groupsList) return;

    groupsList.innerHTML = '';
    const term = state.searchTerm || "";

    state.groups.forEach((group, gIdx) => {
        // Filtrage
        const matchingPoints = group.points.filter(p => 
            p.name.toLowerCase().includes(term) || (p.type && p.type.toLowerCase().includes(term))
        );
        
        if (term !== "" && matchingPoints.length === 0) return;

        // Création de l'élément Groupe
        const item = document.createElement('div');
        item.className = 'group-item';
        
        const header = document.createElement('div');
        header.className = 'group-header';
        
        // Checkbox visibilité
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = group.visible;
        checkbox.onclick = (e) => { 
            e.stopPropagation(); 
            group.visible = e.target.checked; 
            renderAll(); 
        };
        
        // Point de couleur
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        dot.style.cssText = `color:${group.color}; background-color:${group.color};`;
        
        // Nom du groupe
        const nameSpan = document.createElement('span');
        const count = term !== "" ? matchingPoints.length : group.points.length;
        nameSpan.innerText = `${group.name} (${count})`;
        nameSpan.style.flex = '1';
        
        header.append(checkbox, dot, nameSpan);
        item.appendChild(header);

        // Sous-liste des points (affichée si recherche active)
        if (term !== "") {
            const subList = document.createElement('div');
            subList.style.paddingLeft = '30px'; 
            matchingPoints.forEach(p => {
                const pRow = document.createElement('div');
                pRow.innerText = `• ${p.name}`;
                pRow.style.cssText = 'cursor:pointer; color:#8892b0; padding:2px 0; font-size:0.85rem;';
                
                pRow.onclick = () => {
                    const realIndex = group.points.indexOf(p);
                    handlePointClick(gIdx, realIndex); // Appel au gestionnaire central
                    
                    // Zoom automatique (Lazy load engine)
                    import('./engine.js').then(eng => {
                         state.view.scale = 3.0;
                         if(state.mapWidth) {
                            state.view.x = (window.innerWidth/2) - (p.x * state.mapWidth/100)*3.0;
                            state.view.y = (window.innerHeight/2) - (p.y * state.mapHeight/100)*3.0;
                            eng.updateTransform();
                         }
                    });
                };
                subList.appendChild(pRow);
            });
            item.appendChild(subList);
        }
        groupsList.appendChild(item);
    });
}