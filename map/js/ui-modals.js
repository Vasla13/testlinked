// map/js/ui-modals.js

const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalContent = document.getElementById('modal-content');
const modalInputContainer = document.getElementById('modal-input-container');
const modalInput = document.getElementById('modal-input');
const modalActions = document.getElementById('modal-actions');

export function showModal(title, text, type = 'alert') {
    return new Promise((resolve) => {
        if(!modalOverlay) {
            // Fallback si le HTML n'est pas prêt
            if(type === 'confirm') return resolve(confirm(text));
            if(type === 'prompt') return resolve(prompt(text));
            return resolve(alert(text));
        }

        modalTitle.innerText = title;
        modalContent.innerHTML = text;
        modalInputContainer.style.display = 'none';
        modalActions.innerHTML = '';
        
        modalOverlay.classList.remove('hidden');
        modalOverlay.style.display = 'flex';

        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn-modal-cancel';
        btnCancel.innerText = 'ANNULER';
        
        const btnConfirm = document.createElement('button');
        btnConfirm.className = 'btn-modal-confirm';
        btnConfirm.innerText = 'CONFIRMER';

        function close() {
            modalOverlay.classList.add('hidden');
            setTimeout(() => { modalOverlay.style.display = 'none'; }, 200);
        }

        if (type === 'alert') {
            btnConfirm.innerText = 'OK';
            btnConfirm.onclick = () => { close(); resolve(true); };
            modalActions.appendChild(btnConfirm);
        } else if (type === 'confirm') {
            btnCancel.onclick = () => { close(); resolve(false); };
            btnConfirm.onclick = () => { close(); resolve(true); };
            modalActions.append(btnCancel, btnConfirm);
        } else if (type === 'prompt') {
            modalInputContainer.style.display = 'block';
            modalInput.value = '';
            btnCancel.onclick = () => { close(); resolve(null); };
            btnConfirm.onclick = () => { close(); resolve(modalInput.value); };
            modalActions.append(btnCancel, btnConfirm);
            
            modalInput.onkeydown = (e) => { if(e.key === 'Enter') btnConfirm.click(); }
            setTimeout(() => modalInput.focus(), 100);
        }
    });
}

export async function customAlert(title, msg) { return showModal(title, msg, 'alert'); }
export async function customConfirm(title, msg) { return showModal(title, msg, 'confirm'); }
export async function customPrompt(title, msg) { return showModal(title, msg, 'prompt'); }