// map/js/ui-modals.js

// Palette (Noir retiré pour visibilité sur fond sombre)
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

let activeTimeout = null; // Variable pour empêcher la fermeture prématurée lors du chaînage

function createModalPromise(setupFn) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('modal-overlay');
        const titleEl = document.getElementById('modal-title');
        const contentEl = document.getElementById('modal-content');
        const actionsEl = document.getElementById('modal-actions');
        const inputContainer = document.getElementById('modal-input-container');
        const colorContainer = document.getElementById('modal-color-picker');
        
        if(!overlay) { console.error("Modal Missing"); return resolve(null); }
        
        // FIX CRITIQUE : Si une fermeture est en cours (animation), on l'annule immédiatement !
        // Cela permet à la fenêtre suivante (Couleur) de s'afficher sans être écrasée.
        if (activeTimeout) {
            clearTimeout(activeTimeout);
            activeTimeout = null;
        }
        
        // On force l'affichage immédiat
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
        
        // Reset des zones de contenu
        if(inputContainer) inputContainer.style.display = 'none';
        if(colorContainer) colorContainer.style.display = 'none';
        actionsEl.innerHTML = '';
        
        // Fonction de fermeture avec animation
        const close = (val) => {
            overlay.classList.add('hidden');
            
            // On stocke le timeout pour pouvoir l'annuler si une autre modale s'ouvre tout de suite
            activeTimeout = setTimeout(() => { 
                overlay.style.display = 'none'; 
                activeTimeout = null;
            }, 200);
            
            resolve(val);
        };

        setupFn({ overlay, titleEl, contentEl, actionsEl, inputContainer, colorContainer, close });
    });
}

// 1. ALERT
export function customAlert(title, message) {
    return createModalPromise(({ titleEl, contentEl, actionsEl, close }) => {
        titleEl.innerText = title;
        contentEl.innerText = message;
        const btn = document.createElement('button');
        btn.className = 'btn-primary'; btn.innerText = "OK";
        btn.onclick = () => close(true);
        actionsEl.appendChild(btn);
    });
}

// 2. CONFIRM
export function customConfirm(title, message) {
    return createModalPromise(({ titleEl, contentEl, actionsEl, close }) => {
        titleEl.innerText = title;
        contentEl.innerText = message;
        const btnCancel = document.createElement('button');
        btnCancel.innerText = "Annuler"; btnCancel.className = "btn-text";
        btnCancel.onclick = () => close(false);
        const btnOk = document.createElement('button');
        btnOk.className = 'btn-primary'; btnOk.innerText = "Confirmer";
        btnOk.onclick = () => close(true);
        actionsEl.append(btnCancel, btnOk);
    });
}

// 3. PROMPT (Texte)
export function customPrompt(title, message, defaultValue = "") {
    return createModalPromise(({ titleEl, contentEl, actionsEl, inputContainer, close }) => {
        titleEl.innerText = title;
        contentEl.innerText = message;
        if(inputContainer) inputContainer.style.display = 'block';
        
        const input = document.getElementById('modal-input');
        if(input) {
            input.value = defaultValue;
            setTimeout(() => input.focus(), 100);
            input.onkeydown = (e) => { if(e.key === 'Enter') close(input.value); };
        }

        const btnCancel = document.createElement('button');
        btnCancel.innerText = "Annuler"; btnCancel.className = "btn-text";
        btnCancel.onclick = () => close(null);
        
        const btnOk = document.createElement('button');
        btnOk.className = 'btn-primary'; btnOk.innerText = "Valider";
        btnOk.onclick = () => close(input ? input.value : null);
        
        actionsEl.append(btnCancel, btnOk);
    });
}

// 4. COLOR PICKER
export function customColorPicker(title, defaultColor = "#ffffff") {
    return createModalPromise(({ titleEl, contentEl, actionsEl, colorContainer, close }) => {
        titleEl.innerText = title;
        contentEl.innerText = "Sélectionnez une couleur :";
        if(colorContainer) colorContainer.style.display = 'block';
        
        const swatchesDiv = document.getElementById('color-swatches');
        const customInput = document.getElementById('modal-color-input');
        const hexDisplay = document.getElementById('modal-color-hex');
        
        if(swatchesDiv) {
            swatchesDiv.innerHTML = '';
            const safeColor = (defaultColor && defaultColor.startsWith('#')) ? defaultColor : '#ffffff';
            
            if(customInput) customInput.value = safeColor;
            if(hexDisplay) hexDisplay.innerText = safeColor.toUpperCase();
            
            TACTICAL_COLORS.forEach(color => {
                const btn = document.createElement('div');
                btn.className = 'color-swatch-btn';
                btn.style.backgroundColor = color;
                btn.style.setProperty('--color', color);
                
                if(color.toLowerCase() === safeColor.toLowerCase()) btn.classList.add('active');
                
                btn.onclick = () => {
                    document.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    if(customInput) customInput.value = color;
                    if(hexDisplay) hexDisplay.innerText = color.toUpperCase();
                };
                swatchesDiv.appendChild(btn);
            });
            
            if(customInput) {
                customInput.oninput = (e) => {
                    if(hexDisplay) hexDisplay.innerText = e.target.value.toUpperCase();
                    document.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('active'));
                };
            }
        }

        const btnCancel = document.createElement('button');
        btnCancel.innerText = "Annuler"; btnCancel.className = "btn-text";
        btnCancel.onclick = () => close(null);
        
        const btnOk = document.createElement('button');
        btnOk.className = 'btn-primary'; btnOk.innerText = "Appliquer";
        btnOk.onclick = () => close(customInput ? customInput.value : defaultColor);
        
        actionsEl.append(btnCancel, btnOk);
    });
}