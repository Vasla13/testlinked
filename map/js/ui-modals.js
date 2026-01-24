import { state, exportToJSON } from './state.js';

// Palette tactique (Noir retiré pour visibilité sur fond sombre)
const TACTICAL_COLORS = [
    "#73fbf7", // Cyan
    "#ff6b81", // Pink
    "#ffd400", // Yellow
    "#ffffff", // Blanc
    "#00ff00", // Vert
    "#ff0000", // Rouge
    "#bf00ff", // Violet
    "#ff8800", // Orange
    "#8892b0"  // Gris Bleu
];

let activeTimeout = null;

// Fonction interne pour gérer la promesse de la modale de façon générique
function createModalPromise(setupFn) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('modal-overlay');
        const titleEl = document.getElementById('modal-title');
        const contentEl = document.getElementById('modal-content');
        const actionsEl = document.getElementById('modal-actions');
        const inputContainer = document.getElementById('modal-input-container');
        const colorContainer = document.getElementById('modal-color-picker');
        
        if(!overlay) { console.error("Modal Missing"); return resolve(null); }
        
        // Si une fermeture est en cours, on l'annule pour enchaîner les modales
        if (activeTimeout) {
            clearTimeout(activeTimeout);
            activeTimeout = null;
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.remove('hidden');
        }

        // Reset display
        inputContainer.style.display = 'none';
        colorContainer.style.display = 'none';
        actionsEl.innerHTML = '';
        
        // Fonction de fermeture
        const close = (value) => {
            overlay.classList.add('hidden');
            // Délai pour laisser l'animation CSS se faire
            activeTimeout = setTimeout(() => {
                resolve(value);
                activeTimeout = null;
            }, 300);
        };

        // Exécution de la configuration spécifique (remplissage du contenu)
        setupFn({ titleEl, contentEl, actionsEl, inputContainer, colorContainer, close });
    });
}

// --- MODALES STANDARD ---

export function customAlert(title, msg) {
    return createModalPromise(({ titleEl, contentEl, actionsEl, close }) => {
        titleEl.innerText = title;
        contentEl.innerHTML = msg;
        
        const btn = document.createElement('button');
        btn.className = 'btn-modal-confirm'; // Utilise la classe du CSS
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
        
        // Gestion validation avec Entrée
        input.onkeydown = (e) => {
            if (e.key === 'Enter') close(input.value);
        };

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

// --- SÉLECTEUR DE COULEUR (Restauré) ---

export function customColorPicker(title, defaultColor = "#ffffff") {
    return createModalPromise(({ titleEl, contentEl, actionsEl, colorContainer, close }) => {
        titleEl.innerText = title;
        contentEl.innerHTML = "Sélectionnez une couleur de calque :";
        colorContainer.style.display = 'block';
        
        const swatchesDiv = document.getElementById('color-swatches');
        const customInput = document.getElementById('modal-color-input');
        const hexDisplay = document.getElementById('modal-color-hex');
        
        if (swatchesDiv) {
            swatchesDiv.innerHTML = '';
            // Génération des carrés de couleur
            TACTICAL_COLORS.forEach(color => {
                const btn = document.createElement('div');
                btn.className = 'color-swatch-btn';
                btn.style.backgroundColor = color;
                // Variable CSS pour le hover effect
                btn.style.setProperty('--color', color);
                
                if(color.toLowerCase() === defaultColor.toLowerCase()) btn.classList.add('active');
                
                btn.onclick = () => {
                    document.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    if(customInput) customInput.value = color;
                    if(hexDisplay) hexDisplay.innerText = color.toUpperCase();
                };
                swatchesDiv.appendChild(btn);
            });
            
            // Gestion de l'input couleur natif
            if(customInput) {
                customInput.value = defaultColor;
                if(hexDisplay) hexDisplay.innerText = defaultColor.toUpperCase();
                
                customInput.oninput = (e) => {
                    const val = e.target.value;
                    if(hexDisplay) hexDisplay.innerText = val.toUpperCase();
                    document.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('active'));
                };
            }
        }

        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn-modal-cancel';
        btnCancel.innerText = "ANNULER";
        btnCancel.onclick = () => close(null);
        
        const btnOk = document.createElement('button');
        btnOk.className = 'btn-modal-confirm';
        btnOk.innerText = "APPLIQUER";
        btnOk.onclick = () => close(customInput ? customInput.value : defaultColor);
        
        actionsEl.append(btnCancel, btnOk);
    });
}

// --- NOUVEAU : MENU DE SAUVEGARDE ---

export function openSaveOptionsModal() {
    // On utilise pas createModalPromise ici car la logique est très spécifique (chaînage manuel vers le prompt)
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    const actions = document.getElementById('modal-actions');
    const inputContainer = document.getElementById('modal-input-container');
    const colorPicker = document.getElementById('modal-color-picker');

    if(!overlay) return;
    
    // Reset si une animation était en cours
    if(activeTimeout) clearTimeout(activeTimeout);
    overlay.classList.remove('hidden');

    title.innerText = "OPTIONS DE SAUVEGARDE";
    inputContainer.style.display = 'none';
    colorPicker.style.display = 'none';
    
    // Contenu HTML du menu
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

    // Bouton Fermer unique
    actions.innerHTML = '';
    const btnClose = document.createElement('button');
    btnClose.className = 'btn-modal-cancel';
    btnClose.innerText = "FERMER";
    btnClose.onclick = () => {
        overlay.classList.add('hidden');
    };
    actions.appendChild(btnClose);

    // --- LOGIQUE BOUTON FICHIER ---
    document.getElementById('btnOptFile').onclick = async () => {
        // On ferme temporairement pour afficher le prompt propre
        overlay.classList.add('hidden');

        setTimeout(async () => {
            // Demande systématique du nom
            const defaultName = state.currentFileName || "mission_tactique";
            const newName = await customPrompt(
                "NOMMER LA SAUVEGARDE", 
                "Entrez le nom du fichier (sans extension) :", 
                defaultName
            );

            if(newName) {
                state.currentFileName = newName;
                exportToJSON(newName);
            } else {
                // Annulation : on ne fait rien
            }
        }, 300); // Petit délai pour laisser l'animation de fermeture se finir
    };

    // --- LOGIQUE BOUTON RAW ---
    document.getElementById('btnOptRaw').onclick = () => {
        const rawArea = document.getElementById('raw-data-area');
        const txt = document.getElementById('rawJsonOutput');
        
        // Génération du JSON
        const data = { 
            meta: { date: new Date().toISOString(), version: "2.5" },
            groups: state.groups,
            tacticalLinks: state.tacticalLinks
        };
        txt.value = JSON.stringify(data, null, 2);
        
        // UI Switch : On cache les boutons, on montre le text area
        rawArea.style.display = 'block';
        document.getElementById('btnOptFile').style.display = 'none';
        document.getElementById('btnOptRaw').style.display = 'none';
        
        // Auto-select
        txt.select();
    };
    
    // Copie presse-papier
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