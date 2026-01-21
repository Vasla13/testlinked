// --- SYSTÈME DE MODALES SUR MESURE ---

// Palette de couleurs tactiques prédéfinies
const TACTICAL_COLORS = [
    "#73fbf7", // Cyan (Alliés)
    "#ff6b81", // Pink (Hostiles)
    "#ffd400", // Yellow (Neutres)
    "#ffffff", // Blanc
    "#00ff00", // Vert
    "#ff0000", // Rouge Vif
    "#bf00ff", // Violet
    "#ff8800", // Orange
    "#8892b0", // Gris Bleu
    "#000000"  // Noir
];

// Fonction utilitaire pour gérer les Promesses de modale
function createModalPromise(setupFn) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('modal-overlay');
        const titleEl = document.getElementById('modal-title');
        const contentEl = document.getElementById('modal-content');
        const actionsEl = document.getElementById('modal-actions');
        const inputContainer = document.getElementById('modal-input-container');
        const colorContainer = document.getElementById('modal-color-picker');
        
        // Reset
        overlay.classList.remove('hidden');
        inputContainer.style.display = 'none';
        colorContainer.style.display = 'none';
        actionsEl.innerHTML = '';
        
        // Fonction de fermeture
        const close = (val) => {
            overlay.classList.add('hidden');
            resolve(val);
        };

        // Configuration spécifique (titre, contenu, boutons)
        setupFn({ overlay, titleEl, contentEl, actionsEl, inputContainer, colorContainer, close });
    });
}

// 1. ALERT (Info simple)
export function customAlert(title, message) {
    return createModalPromise(({ titleEl, contentEl, actionsEl, close }) => {
        titleEl.innerText = title;
        contentEl.innerText = message;
        
        const btnOk = document.createElement('button');
        btnOk.className = 'btn-primary';
        btnOk.innerText = "OK";
        btnOk.onclick = () => close(true);
        actionsEl.appendChild(btnOk);
    });
}

// 2. CONFIRM (Oui/Non)
export function customConfirm(title, message) {
    return createModalPromise(({ titleEl, contentEl, actionsEl, close }) => {
        titleEl.innerText = title;
        contentEl.innerText = message;
        
        const btnCancel = document.createElement('button');
        btnCancel.innerText = "Annuler";
        btnCancel.className = "btn-text";
        btnCancel.onclick = () => close(false);
        
        const btnOk = document.createElement('button');
        btnOk.className = 'btn-primary';
        btnOk.innerText = "Confirmer";
        btnOk.onclick = () => close(true);
        
        actionsEl.append(btnCancel, btnOk);
    });
}

// 3. PROMPT (Saisie texte)
export function customPrompt(title, message, defaultValue = "") {
    return createModalPromise(({ titleEl, contentEl, actionsEl, inputContainer, close }) => {
        titleEl.innerText = title;
        contentEl.innerText = message;
        inputContainer.style.display = 'block';
        
        const input = document.getElementById('modal-input');
        input.value = defaultValue;
        input.focus();
        
        // Validation avec touche Entrée
        input.onkeydown = (e) => {
            if(e.key === 'Enter') close(input.value);
            if(e.key === 'Escape') close(null);
        };

        const btnCancel = document.createElement('button');
        btnCancel.innerText = "Annuler";
        btnCancel.className = "btn-text";
        btnCancel.onclick = () => close(null);
        
        const btnOk = document.createElement('button');
        btnOk.className = 'btn-primary';
        btnOk.innerText = "Valider";
        btnOk.onclick = () => close(input.value);
        
        actionsEl.append(btnCancel, btnOk);
    });
}

// 4. COLOR PICKER (Choix couleur visuel)
export function customColorPicker(title, defaultColor = "#ffffff") {
    return createModalPromise(({ titleEl, contentEl, actionsEl, colorContainer, close }) => {
        titleEl.innerText = title;
        contentEl.innerText = "Sélectionnez une couleur :";
        colorContainer.style.display = 'block';
        
        const swatchesDiv = document.getElementById('color-swatches');
        swatchesDiv.innerHTML = ''; // Nettoyage
        
        const customInput = document.getElementById('modal-color-input');
        const hexDisplay = document.getElementById('modal-color-hex');
        
        // Initialisation Custom Input
        customInput.value = defaultColor.length === 7 ? defaultColor : '#ffffff';
        hexDisplay.innerText = customInput.value.toUpperCase();
        
        let selectedColor = customInput.value;

        // Génération des pastilles
        TACTICAL_COLORS.forEach(color => {
            const btn = document.createElement('div');
            btn.className = 'color-swatch-btn';
            btn.style.backgroundColor = color;
            btn.style.setProperty('--color', color); // Pour l'effet glow
            
            btn.onclick = () => {
                selectedColor = color;
                customInput.value = color;
                hexDisplay.innerText = color.toUpperCase();
                // Feedback visuel
                document.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
            
            if(color.toLowerCase() === defaultColor.toLowerCase()) {
                btn.classList.add('active');
            }
            
            swatchesDiv.appendChild(btn);
        });

        // Gestion Input Couleur Custom
        customInput.oninput = (e) => {
            selectedColor = e.target.value;
            hexDisplay.innerText = selectedColor.toUpperCase();
            document.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('active'));
        };

        const btnCancel = document.createElement('button');
        btnCancel.innerText = "Annuler";
        btnCancel.className = "btn-text";
        btnCancel.onclick = () => close(null);
        
        const btnOk = document.createElement('button');
        btnOk.className = 'btn-primary';
        btnOk.innerText = "Appliquer";
        btnOk.onclick = () => close(selectedColor);
        
        actionsEl.append(btnCancel, btnOk);
    });
}