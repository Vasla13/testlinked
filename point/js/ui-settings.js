import { state, pushHistory, scheduleSave, linkHasNode } from './state.js';
import { restartSim } from './physics.js'; // CORRECTION : Import depuis physics.js
import { calculateHVT } from './logic.js';
import { draw } from './render.js';
// On importe depuis ui.js les fonctions nécessaires
import { selectNode, renderEditor, updatePathfindingPanel, refreshLists, showCustomConfirm } from './ui.js';

let settingsPanel = null;
let contextMenu = null;

// --- GESTION DU PANNEAU REGLAGES ---
export function showSettings() {
    if (!settingsPanel) createSettingsPanel();
    updateSettingsUI();
    const isHidden = (settingsPanel.style.display === 'none');
    settingsPanel.style.display = isHidden ? 'block' : 'none';
}

function createSettingsPanel() {
    const existing = document.getElementById('settings-panel');
    if (existing) existing.remove();

    settingsPanel = document.createElement('div');
    settingsPanel.id = 'settings-panel';
    settingsPanel.style.display = 'none';
    
    const ICON_GLOBE = `<svg style="width:24px;height:24px;fill:currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`;

    settingsPanel.innerHTML = `
        <div class="settings-header">
            <h3>Paramètres Physique</h3>
            <div class="settings-close" id="btnCloseSettings">✕</div>
        </div>
        
        <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:6px; margin-bottom:15px; display:flex; align-items:center; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:10px; color:#fff; font-weight:bold;">
                ${ICON_GLOBE} <span>Mode Planète (Globe)</span>
            </div>
            <label class="hud-toggle">
                <input type="checkbox" id="chkGlobeInner"/>
                <div class="toggle-track"><div class="toggle-thumb"></div></div>
            </label>
        </div>

        <div class="setting-row"><label>Répulsion Globale <span id="val-repulsion" class="setting-val"></span></label><input type="range" id="sl-repulsion" min="100" max="5000" step="50"></div>
        <div class="setting-row"><label>Force Repousse Ennemis <span id="val-enemyForce" class="setting-val"></span></label><input type="range" id="sl-enemyForce" min="50" max="1000" step="10"></div>
        <div class="setting-row"><label>Force Repousse Entreprise <span id="val-structureRepulsion" class="setting-val"></span></label><input type="range" id="sl-structureRepulsion" min="0.01" max="0.5" step="0.01"></div>
        <div class="setting-row"><label>Gravité Centrale <span id="val-gravity" class="setting-val"></span></label><input type="range" id="sl-gravity" min="0" max="0.1" step="0.001"></div>
        <div class="setting-row"><label>Longueur Liens <span id="val-linkLength" class="setting-val"></span></label><input type="range" id="sl-linkLength" min="50" max="600" step="10"></div>
        <div class="setting-row"><label>Collision <span id="val-collision" class="setting-val"></span></label><input type="range" id="sl-collision" min="0" max="200" step="5"></div>
        <div class="setting-row"><label>Friction <span id="val-friction" class="setting-val"></span></label><input type="range" id="sl-friction" min="0.1" max="0.9" step="0.05"></div>
        
        <div class="settings-actions">
            <button class="primary" style="width:100%;" id="btnResetPhysics">Rétablir défaut</button>
        </div>
    `;
    document.body.appendChild(settingsPanel);

    // Listeners
    document.getElementById('btnCloseSettings').onclick = () => { settingsPanel.style.display = 'none'; };
    document.getElementById('chkGlobeInner').onchange = (e) => { state.globeMode = e.target.checked; restartSim(); scheduleSave(); };
    document.getElementById('btnResetPhysics').onclick = resetPhysicsDefaults;

    bindSlider('sl-repulsion', 'repulsion');
    bindSlider('sl-gravity', 'gravity');
    bindSlider('sl-linkLength', 'linkLength');
    bindSlider('sl-collision', 'collision');
    bindSlider('sl-friction', 'friction');
    bindSlider('sl-enemyForce', 'enemyForce');
    bindSlider('sl-structureRepulsion', 'structureRepulsion');
}

function bindSlider(id, key) {
    const sl = document.getElementById(id);
    if(sl) {
        sl.oninput = (e) => {
            state.physicsSettings[key] = parseFloat(e.target.value);
            updateSettingsUI();
            restartSim();
            scheduleSave();
        };
    }
}

function updateSettingsUI() {
    if(!settingsPanel) return;
    const S = state.physicsSettings;
    const updateVal = (id, key) => {
        const sl = document.getElementById(id);
        const val = document.getElementById(id.replace('sl-', 'val-'));
        if(sl && val && S[key] !== undefined) { 
            sl.value = S[key]; 
            val.innerText = S[key]; 
        }
    };
    
    updateVal('sl-repulsion', 'repulsion');
    updateVal('sl-gravity', 'gravity');
    updateVal('sl-linkLength', 'linkLength');
    updateVal('sl-collision', 'collision');
    updateVal('sl-friction', 'friction');
    updateVal('sl-enemyForce', 'enemyForce');
    updateVal('sl-structureRepulsion', 'structureRepulsion');
    
    const globe = document.getElementById('chkGlobeInner');
    if(globe) globe.checked = state.globeMode;
}

function resetPhysicsDefaults() {
    state.physicsSettings = { repulsion: 1200, gravity: 0.005, linkLength: 220, friction: 0.3, collision: 50, enemyForce: 300, structureRepulsion: 0.1 };
    state.globeMode = true;
    updateSettingsUI();
    restartSim();
    scheduleSave();
}

// --- GESTION DU CLIC DROIT (CONTEXT MENU) ---
export function showContextMenu(node, x, y) {
    if (!contextMenu) {
        contextMenu = document.createElement('div');
        contextMenu.id = 'context-menu';
        document.body.appendChild(contextMenu);
    }
    
    contextMenu.innerHTML = `
        <div class="ctx-item" data-action="link">🔗 Lier à...</div>
        <div class="ctx-item" data-action="source">🚩 Définir Source IA</div>
        <div class="ctx-item" data-action="color">🎨 Changer couleur</div>
        <div class="ctx-divider"></div>
        <div class="ctx-item danger" data-action="delete">🗑️ Supprimer</div>
    `;

    // Positionnement intelligent
    const menuW = 180, menuH = 160;
    let posX = x, posY = y;
    if (x + menuW > window.innerWidth) posX = x - menuW;
    if (y + menuH > window.innerHeight) posY = y - menuH;
    contextMenu.style.left = posX + 'px';
    contextMenu.style.top = posY + 'px';
    contextMenu.style.display = 'flex';

    // Event Delegation pour les clics
    contextMenu.onclick = (e) => {
        const action = e.target.getAttribute('data-action');
        if (!action) return;
        handleContextAction(action, node);
        hideContextMenu();
    };
}

export function hideContextMenu() {
    if (contextMenu) contextMenu.style.display = 'none';
}

function handleContextAction(action, n) {
    if (action === 'delete') {
        showCustomConfirm(`Supprimer "${n.name}" ?`, () => {
            pushHistory(); 
            state.nodes = state.nodes.filter(x => x.id !== n.id);
            state.links = state.links.filter(l => !linkHasNode(l, n.id));
            state.selection = null; restartSim(); refreshLists(); renderEditor(); updatePathfindingPanel();
            scheduleSave();
        });
    } else if (action === 'source') {
        state.pathfinding.startId = n.id;
        state.pathfinding.active = false;
        updatePathfindingPanel();
        draw();
    } else if (action === 'link') {
        selectNode(n.id);
        const details = document.querySelectorAll('details');
        if(details[2]) details[2].open = true; // Ouvre l'onglet Ajout
    } else if (action === 'color') {
        selectNode(n.id);
        setTimeout(() => { const col = document.getElementById('edColor'); if(col) col.click(); }, 100);
    }
}
