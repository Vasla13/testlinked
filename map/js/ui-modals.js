import { state, exportToJSON, saveLocalState, pruneTacticalLinks } from './state.js';
import { renderGroupsList } from './ui.js'; // Nécessaire pour rafraîchir la liste après modif
import { renderAll } from './render.js';   // Nécessaire pour rafraîchir la carte

// Palette tactique
const TACTICAL_COLORS = [
    "#73fbf7", "#ff6b81", "#ffd400", "#ffffff", 
    "#00ff00", "#ff0000", "#bf00ff", "#ff8800", "#8892b0"
];

let activeTimeout = null;

function createModalPromise(setupFn) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('modal-overlay');
        const titleEl = document.getElementById('modal-title');
        const contentEl = document.getElementById('modal-content');
        const actionsEl = document.getElementById('modal-actions');
        const inputContainer = document.getElementById('modal-input-container');
        const colorContainer = document.getElementById('modal-color-picker');
        
        if(!overlay) { console.error("Modal Missing"); return resolve(null); }
        
        if (activeTimeout) {
            clearTimeout(activeTimeout);
            activeTimeout = null;
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.remove('hidden');
        }

        inputContainer.style.display = 'none';
        colorContainer.style.display = 'none';
        actionsEl.innerHTML = '';
        
        const close = (value) => {
            overlay.classList.add('hidden');
            activeTimeout = setTimeout(() => {
                resolve(value);
                activeTimeout = null;
            }, 300);
        };

        setupFn({ titleEl, contentEl, actionsEl, inputContainer, colorContainer, close });
    });
}

export function customAlert(title, msg) {
    return createModalPromise(({ titleEl, contentEl, actionsEl, close }) => {
        titleEl.innerText = title;
        contentEl.innerHTML = msg;
        const btn = document.createElement('button');
        btn.className = 'btn-modal-confirm';
        btn.innerText = "OK";
        btn.onclick = () => close(true);
        actionsEl.appendChild(btn);
    });
}

export function customConfirm(title, msg) {
    return createModalPromise(({ titleEl, contentEl, actionsEl, close }) => {
        titleEl.innerText = title;
        contentEl.innerHTML = msg;
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn-modal-cancel';
        btnCancel.innerText = "ANNULER";
        btnCancel.onclick = () => close(false);
        const btnOk = document.createElement('button');
        btnOk.className = 'btn-modal-confirm';
        btnOk.innerText = "CONFIRMER";
        btnOk.onclick = () => close(true);
        actionsEl.append(btnCancel, btnOk);
    });
}

export function customPrompt(title, msg, defaultValue = "") {
    return createModalPromise(({ titleEl, contentEl, actionsEl, inputContainer, close }) => {
        titleEl.innerText = title;
        contentEl.innerHTML = msg;
        inputContainer.style.display = 'block';
        const input = document.getElementById('modal-input');
        input.value = defaultValue;
        input.focus();
        input.onkeydown = (e) => { if (e.key === 'Enter') close(input.value); };
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn-modal-cancel';
        btnCancel.innerText = "ANNULER";
        btnCancel.onclick = () => close(null);
        const btnOk = document.createElement('button');
        btnOk.className = 'btn-modal-confirm';
        btnOk.innerText = "VALIDER";
        btnOk.onclick = () => close(input.value);
        actionsEl.append(btnCancel, btnOk);
    });
}

// --- ÉDITEUR DE GROUPE (NOUVEAU) ---
export function openGroupEditor(groupIndex) {
    const group = state.groups[groupIndex];
    if (!group) return;

    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    const actions = document.getElementById('modal-actions');
    const inputContainer = document.getElementById('modal-input-container');
    const colorPicker = document.getElementById('modal-color-picker');

    if(!overlay) return;
    if(activeTimeout) clearTimeout(activeTimeout);
    overlay.classList.remove('hidden');

    title.innerText = "ÉDITION CALQUE";
    inputContainer.style.display = 'block'; // On utilise l'input standard pour le nom
    colorPicker.style.display = 'block';  // On utilise le color picker standard
    
    // Pré-remplissage Nom
    const inputName = document.getElementById('modal-input');
    inputName.value = group.name;

    content.innerHTML = `<p style="font-size:0.9rem; color:#8892b0;">Modifier les propriétés du calque :</p>`;

    // --- SETUP COULEURS ---
    const swatchesDiv = document.getElementById('color-swatches');
    const customInput = document.getElementById('modal-color-input');
    const hexDisplay = document.getElementById('modal-color-hex');
    
    if (swatchesDiv) {
        swatchesDiv.innerHTML = '';
        TACTICAL_COLORS.forEach(color => {
            const btn = document.createElement('div');
            btn.className = 'color-swatch-btn';
            btn.style.backgroundColor = color;
            btn.style.setProperty('--color', color);
            
            if(color.toLowerCase() === group.color.toLowerCase()) btn.classList.add('active');
            
            btn.onclick = () => {
                document.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if(customInput) customInput.value = color;
                if(hexDisplay) hexDisplay.innerText = color.toUpperCase();
            };
            swatchesDiv.appendChild(btn);
        });
        
        if(customInput) {
            customInput.value = group.color;
            if(hexDisplay) hexDisplay.innerText = group.color.toUpperCase();
            customInput.oninput = (e) => {
                if(hexDisplay) hexDisplay.innerText = e.target.value.toUpperCase();
                document.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('active'));
            };
        }
    }

    // --- ACTIONS ---
    actions.innerHTML = '';

    // Bouton Supprimer (Rouge)
    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-modal-cancel';
    btnDelete.style.borderColor = 'var(--danger)';
    btnDelete.style.color = 'var(--danger)';
    btnDelete.innerText = "SUPPRIMER CALQUE";
    btnDelete.onclick = async () => {
        overlay.classList.add('hidden');
        setTimeout(async () => {
            if(await customConfirm("SUPPRESSION", `Supprimer "${group.name}" et tout son contenu ?`)) {
                const removedIds = group.points.map(p => p.id);
                state.groups.splice(groupIndex, 1);
                pruneTacticalLinks(removedIds);
                renderGroupsList();
                renderAll();
                saveLocalState();
            }
        }, 200);
    };

    // Bouton Annuler
    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn-modal-cancel';
    btnCancel.innerText = "ANNULER";
    btnCancel.onclick = () => { overlay.classList.add('hidden'); };

    // Bouton Valider
    const btnSave = document.createElement('button');
    btnSave.className = 'btn-modal-confirm';
    btnSave.innerText = "ENREGISTRER";
    btnSave.onclick = () => {
        // Sauvegarde Nom
        group.name = inputName.value || "Groupe Sans Nom";
        // Sauvegarde Couleur
        group.color = customInput ? customInput.value : group.color;
        
        renderGroupsList();
        renderAll();
        saveLocalState();
        overlay.classList.add('hidden');
    };

    actions.append(btnDelete, btnCancel, btnSave);
}


// --- MENU DE SAUVEGARDE (Inchangé mais inclus pour complétude) ---
export function openSaveOptionsModal() {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    const actions = document.getElementById('modal-actions');
    const inputContainer = document.getElementById('modal-input-container');
    const colorPicker = document.getElementById('modal-color-picker');

    if(!overlay) return;
    if(activeTimeout) clearTimeout(activeTimeout);
    overlay.classList.remove('hidden');

    title.innerText = "OPTIONS DE SAUVEGARDE";
    inputContainer.style.display = 'none';
    colorPicker.style.display = 'none';
    
    content.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
            <p style="font-size:0.9rem; color:#8892b0; margin-bottom:10px;">
                Choisissez une méthode de sauvegarde :
            </p>
            <button id="btnOptFile" class="action-btn" style="padding:15px; font-size:1rem; border-color:var(--accent-cyan); justify-content:center; display:flex; align-items:center; gap:10px;">
                💾 <span>TÉLÉCHARGER FICHIER JSON</span>
            </button>
            <div style="text-align:center; font-size:0.8rem; color:#666;">- OU -</div>
            <button id="btnOptRaw" class="file-btn" style="padding:15px; justify-content:center; display:flex; align-items:center; gap:10px;">
                📋 <span>COPIER LES DONNÉES BRUTES</span>
            </button>
        </div>

        <div id="raw-data-area" style="display:none; margin-top:15px;">
            <label style="color:var(--accent-orange)">JSON BRUT</label>
            <textarea id="rawJsonOutput" class="cyber-input" style="height:150px; font-size:0.7rem; color:var(--accent-orange); border-color:var(--accent-orange);"></textarea>
            <button id="btnCopyRaw" class="mini-btn" style="width:100%; margin-top:5px; padding:10px;">COPIER DANS LE PRESSE-PAPIER</button>
        </div>
    `;

    actions.innerHTML = '';
    const btnClose = document.createElement('button');
    btnClose.className = 'btn-modal-cancel';
    btnClose.innerText = "FERMER";
    btnClose.onclick = () => { overlay.classList.add('hidden'); };
    actions.appendChild(btnClose);

    document.getElementById('btnOptFile').onclick = async () => {
        overlay.classList.add('hidden');
        setTimeout(async () => {
            const defaultName = state.currentFileName || "mission_tactique";
            const newName = await customPrompt(
                "NOMMER LA SAUVEGARDE", 
                "Entrez le nom du fichier (sans extension) :", 
                defaultName
            );
            if(newName) {
                state.currentFileName = newName;
                exportToJSON(newName);
            }
        }, 300);
    };

    document.getElementById('btnOptRaw').onclick = () => {
        const rawArea = document.getElementById('raw-data-area');
        const txt = document.getElementById('rawJsonOutput');
        const data = { meta: { date: new Date().toISOString(), version: "2.5" }, groups: state.groups, tacticalLinks: state.tacticalLinks };
        txt.value = JSON.stringify(data, null, 2);
        rawArea.style.display = 'block';
        document.getElementById('btnOptFile').style.display = 'none';
        document.getElementById('btnOptRaw').style.display = 'none';
        txt.select();
    };
    
    document.getElementById('btnCopyRaw').onclick = () => {
        const txt = document.getElementById('rawJsonOutput');
        txt.select();
        navigator.clipboard.writeText(txt.value);
        const btn = document.getElementById('btnCopyRaw');
        const originalText = btn.innerText;
        btn.innerText = "✅ COPIÉ !";
        btn.style.background = "var(--accent-cyan)";
        btn.style.color = "#000";
        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.background = "";
            btn.style.color = "";
        }, 2000);
    };
}

// Fonction utilitaire pour le sélecteur de couleur simple (utilisé par openGroupEditor ou autre)
export function customColorPicker(title, defaultColor = "#ffffff") {
    // Note: Cette fonction reste dispo pour d'autres usages, mais openGroupEditor implémente sa propre version intégrée
    return createModalPromise(({ titleEl, contentEl, actionsEl, colorContainer, close }) => {
        titleEl.innerText = title;
        contentEl.innerHTML = "Sélectionnez une couleur :";
        colorContainer.style.display = 'block';
        // ... (Logique identique à openGroupEditor pour les couleurs, simplifiée ici pour ne pas dupliquer trop de code si non utilisé ailleurs)
        // Pour être sûr, on laisse l'implémentation complète si besoin :
        const swatchesDiv = document.getElementById('color-swatches');
        const customInput = document.getElementById('modal-color-input');
        if (swatchesDiv) {
            swatchesDiv.innerHTML = '';
            TACTICAL_COLORS.forEach(color => {
                const btn = document.createElement('div');
                btn.className = 'color-swatch-btn';
                btn.style.backgroundColor = color;
                btn.style.setProperty('--color', color);
                btn.onclick = () => {
                    if(customInput) customInput.value = color;
                    close(color);
                };
                swatchesDiv.appendChild(btn);
            });
        }
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn-modal-cancel';
        btnCancel.innerText = "ANNULER";
        btnCancel.onclick = () => close(null);
        actionsEl.appendChild(btnCancel);
    });
}
