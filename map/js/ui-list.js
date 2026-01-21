import { state } from './state.js';
import { handlePointClick } from './ui.js';
import { renderAll } from './render.js';
import { customPrompt, customColorPicker, customConfirm } from './ui-modals.js'; // AJOUT : customConfirm

export function renderGroupsList() {
    const groupsList = document.getElementById('groups-list');
    if (!groupsList) return;

    groupsList.innerHTML = '';
    const term = state.searchTerm || "";

    state.groups.forEach((group, gIdx) => {
        const matchingPoints = group.points.filter(p => 
            p.name.toLowerCase().includes(term) || (p.type && p.type.toLowerCase().includes(term))
        );
        
        if (term !== "" && matchingPoints.length === 0) return;

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
        
        // 1. Bouton Modification (Engrenage)
        const btnEdit = document.createElement('button');
        btnEdit.className = 'mini-btn'; 
        btnEdit.innerHTML = '⚙️';
        btnEdit.title = "Modifier le calque";
        btnEdit.style.marginLeft = '5px';
        btnEdit.style.padding = '0 5px';
        
        btnEdit.onclick = async (e) => {
            e.stopPropagation();
            
            // Nom
            const newName = await customPrompt("MODIFIER CALQUE", "Nom du calque :", group.name);
            if(newName === null) return;

            // Couleur
            const newColor = await customColorPicker("COULEUR DU CALQUE", group.color);
            if(newColor === null) return;

            if(newName.trim() !== "") group.name = newName.trim();
            group.color = newColor;

            renderGroupsList();
            renderAll();
        };

        // 2. AJOUT : Bouton Suppression (Poubelle)
        const btnDelete = document.createElement('button');
        btnDelete.className = 'mini-btn';
        btnDelete.innerHTML = '🗑️';
        btnDelete.title = "Supprimer le calque";
        btnDelete.style.marginLeft = '5px';
        btnDelete.style.padding = '0 5px';
        btnDelete.style.color = '#ff6b81'; // Rouge clair pour l'alerte visuelle

        btnDelete.onclick = async (e) => {
            e.stopPropagation();
            
            const pointCount = group.points.length;
            const msg = pointCount > 0 
                ? `Attention, ce calque contient ${pointCount} points.\nTout sera supprimé définitivement.`
                : `Supprimer le calque "${group.name}" ?`;

            if(await customConfirm("SUPPRESSION", msg)) {
                // Suppression du groupe
                state.groups.splice(gIdx, 1);
                
                // Si plus aucun groupe, on en recrée un par défaut pour éviter les bugs
                if (state.groups.length === 0) {
                    state.groups.push({ name: "Défaut", color: "#ffffff", visible: true, points: [], zones: [] });
                }

                renderGroupsList();
                renderAll();
            }
        };

        header.append(checkbox, dot, nameSpan, btnEdit, btnDelete);
        item.appendChild(header);

        if (term !== "") {
            const subList = document.createElement('div');
            subList.style.paddingLeft = '30px'; 
            matchingPoints.forEach(p => {
                const pRow = document.createElement('div');
                pRow.innerText = `• ${p.name}`;
                pRow.style.cssText = 'cursor:pointer; color:#8892b0; padding:2px 0; font-size:0.85rem;';
                
                pRow.onclick = () => {
                    const realIndex = group.points.indexOf(p);
                    handlePointClick(gIdx, realIndex);
                    
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