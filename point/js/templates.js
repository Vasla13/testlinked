import { TYPES, KIND_LABELS } from './constants.js';
import { escapeHtml, safeHex } from './utils.js';

// Génère les options pour les listes déroulantes de liens
function getLinkOptions() {
    return Object.entries(KIND_LABELS).map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
}

// =============================================================================
// --- 1. BARRE LATÉRALE GAUCHE (PATHFINDING / IA) ---
// =============================================================================
export function renderPathfindingSidebar(state, selectedNode) {
    const cyan = 'var(--accent-cyan)';
    const pink = 'var(--accent-pink)';
    
    const renderDataBox = (label, value, color, isActive, icon) => `
        <div style="
            flex: 1;
            background: ${isActive ? `rgba(${color === cyan ? '115, 251, 247' : '255, 107, 129'}, 0.1)` : 'rgba(0,0,0,0.3)'};
            border: 1px solid ${isActive ? color : 'rgba(255,255,255,0.1)'};
            border-radius: 4px;
            padding: 8px;
            display: flex; flex-direction: column; justify-content: center;
            box-shadow: ${isActive ? `0 0 10px rgba(${color === cyan ? '115, 251, 247' : '255, 107, 129'}, 0.15)` : 'none'};
            transition: all 0.3s ease;
        ">
            <div style="font-size:0.65rem; color:${color}; text-transform:uppercase; letter-spacing:1px; margin-bottom:2px; opacity:0.8;">
                ${label}
            </div>
            <div style="font-size:0.9rem; font-weight:bold; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${icon} ${value}
            </div>
        </div>
    `;

    // CAS 1 : Aucune source définie
    if (!state.pathfinding.startId) {
        if (selectedNode) {
            return `
                <div style="display:flex; flex-direction:column; gap:10px; padding:10px; border:1px solid rgba(255,255,255,0.1); border-radius:8px; background:rgba(10, 15, 30, 0.6);">
                    <div style="color:${cyan}; font-size:0.8rem; text-transform:uppercase; letter-spacing:2px; border-bottom:1px solid rgba(115,251,247,0.2); padding-bottom:5px; margin-bottom:5px;">
                        /// SYSTÈME DE TRAÇAGE
                    </div>
                    ${renderDataBox('Candidat Source', escapeHtml(selectedNode.name), cyan, true, '👤')}
                    <button id="btnPathStart" class="primary" style="width:100%; margin-top:5px; padding:10px; border: 1px solid ${cyan}; color: ${cyan}; font-weight:bold; letter-spacing:1px;">
                        [ INITIALISER SOURCE ]
                    </button>
                </div>
            `;
        } else {
            return `
                <div style="padding:12px; text-align:center; border:1px dashed rgba(255,255,255,0.15); border-radius:6px; color:#666; font-style:italic; background:rgba(0,0,0,0.15);">
                    <div style="font-size:0.8rem; display:flex; align-items:center; justify-content:center; gap:6px;">
                        <span style="font-size:1rem; opacity:0.7;">📡</span> 
                        <span>En attente de signal...</span>
                    </div>
                </div>
            `;
        }
    }

    // CAS 2 : Source définie
    const startNode = state.nodes.find(n => n.id === state.pathfinding.startId);
    const startName = startNode ? escapeHtml(startNode.name) : "ERR_UNKNOWN";
    const targetNode = (selectedNode && selectedNode.id !== state.pathfinding.startId) ? selectedNode : null;
    const hasTarget = !!targetNode;

    let statusDisplay = '';
    if (state.pathfinding.active) {
        statusDisplay = `<div style="margin-top:10px; padding:8px; background:rgba(0, 255, 0, 0.1); border:1px solid #00ff00; border-radius:4px; text-align:center; color:#00ff00; font-weight:bold; font-size:0.8rem;">✅ Liaison Établie</div>`;
    } else if (hasTarget) {
         statusDisplay = `<button id="btnPathCalc" style="width:100%; margin-top:10px; padding:10px; border: 1px solid ${pink}; color: ${pink}; font-weight:bold; background:rgba(255,107,129,0.1);">⚡ CALCULER ROUTE</button>`;
    } else {
        statusDisplay = `<div style="margin-top:10px; padding:8px; text-align:center; color:#666; font-size:0.75rem; font-style:italic;">En attente de cible...</div>`;
    }

    return `
        <div style="border:1px solid rgba(115, 251, 247, 0.3); border-radius:6px; overflow:hidden; background:rgba(5,7,10,0.4); backdrop-filter:blur(5px);">
            <div style="background: linear-gradient(90deg, rgba(115, 251, 247, 0.1), transparent); padding: 6px 10px; border-bottom:1px solid rgba(115, 251, 247, 0.2); display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.75rem; color:${cyan}; font-weight:bold; letter-spacing:2px;">/// NET.LINK</span>
                <span style="width:6px; height:6px; background:${state.pathfinding.active ? '#0f0' : '#f00'}; border-radius:50%; box-shadow:0 0 5px currentColor;"></span>
            </div>
            <div style="padding:12px; display:flex; flex-direction:column; gap:10px;">
                ${renderDataBox('Source (A)', startName, cyan, true, '🚩')}
                ${renderDataBox('Destination (B)', targetNode ? escapeHtml(targetNode.name) : 'Sélectionner...', pink, hasTarget, '🎯')}
                ${statusDisplay}
                <button id="btnPathCancel" style="width:100%; margin-top:5px; padding:6px; background:transparent; border:1px solid #444; color:#888; font-size:0.7rem; border-radius:4px; cursor:pointer;">✖ Annuler séquence</button>
            </div>
        </div>
    `;
}

// =============================================================================
// --- 2. BARRE LATÉRALE DROITE (ÉDITEUR) ---
// =============================================================================
export function renderEditorHTML(n, state) {
    const isP = (n.type === TYPES.PERSON);
    
    // Options Type
    const typeOptions = `
        <option value="${TYPES.PERSON}" ${n.type===TYPES.PERSON?'selected':''}>Personne</option>
        <option value="${TYPES.GROUP}" ${n.type===TYPES.GROUP?'selected':''}>Groupe</option>
        <option value="${TYPES.COMPANY}" ${n.type===TYPES.COMPANY?'selected':''}>Entreprise</option>
    `;

    // --- LOGIQUE VISUELLE LIAISON ---
    const isLinked = !!n.linkedMapPointId;
    const inputBorder = isLinked ? '1px solid #73fbf7' : '1px solid #333';
    const inputColor = isLinked ? '#73fbf7' : 'var(--accent-orange)';
    // Bouton de validation : Vert/Coche si lié, Gris/Flèche si pas lié
    const btnStyle = isLinked 
        ? 'background:rgba(115,251,247,0.2); color:#73fbf7; border:1px solid #73fbf7;' 
        : 'background:rgba(255,255,255,0.05); color:#888; border:1px solid #444;';
    const btnIcon = isLinked ? '✔' : 'OK';

    return `
    <h3 style="margin:0 0 10px 0; color:var(--accent-cyan); text-transform:uppercase; letter-spacing:1px; border-bottom:1px solid var(--border-color); padding-bottom:5px;">
        ${escapeHtml(n.name)}
    </h3>

    <div style="display:flex; gap:5px; margin-bottom:15px;">
        <button id="btnFocusNode" class="mini-btn ${state.focusMode ? 'active' : ''}" style="flex:1;">
            ${state.focusMode ? '🔍 Tout voir' : '🎯 Focus'}
        </button>
        <button id="btnCenterNode" class="mini-btn" style="flex:1;">📍 Centrer</button>
        <button id="btnDelete" class="mini-btn danger" style="width:40px;">🗑️</button>
    </div>

    <div style="border:1px solid var(--border-color); border-radius:8px; padding:10px; background:rgba(0,0,0,0.2); margin-bottom:10px;">
        <div style="font-size:0.75rem; color:#73fbf7; margin-bottom:5px; font-weight:bold;">PROPRIÉTÉS</div>
        
        <div style="margin-bottom:8px;">
            <label style="font-size:0.7rem; color:#888;">Nom</label>
            <input type="text" id="edName" value="${escapeHtml(n.name)}" style="font-weight:bold;">
        </div>

        <div class="flex-row-force" style="gap:10px; margin-bottom:8px;">
            <div style="flex:1;">
                <label style="font-size:0.7rem; color:#888;">Type</label>
                <select id="edType">${typeOptions}</select>
            </div>
            <div style="width:60px;">
                <label style="font-size:0.7rem; color:#888;">Couleur</label>
                <input type="color" id="edColor" value="${safeHex(n.color)}" style="height:38px; padding:0; cursor:pointer;">
            </div>
        </div>

        ${isP ? `
        <div>
            <label style="font-size:0.7rem; color:#888;">Téléphone</label>
            <input type="text" id="edNum" value="${escapeHtml(n.num || '')}" placeholder="555-...">
        </div>` : ''}

        <div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.1);">
             <label style="font-size:0.7rem; color:#aaa; display:flex; justify-content:space-between;">
                <span>ID LIAISON TACTIQUE (MAP)</span>
                ${isLinked ? '<span style="color:#73fbf7; font-weight:bold;">[ ACTIF ]</span>' : ''}
             </label>
             <div class="flex-row-force" style="gap:5px;">
                 <input type="text" id="edMapId" 
                        value="${escapeHtml(n.linkedMapPointId || '')}" 
                        placeholder="Coller l'ID ici..." 
                        class="flex-grow-input" 
                        style="font-size:0.8rem; font-family:monospace; color:${inputColor}; border:${inputBorder};">
                 
                 <button id="btnValidateMapId" class="mini-btn" style="width:auto; padding:0 10px; font-weight:bold; ${btnStyle}" title="Valider la liaison">
                    ${btnIcon}
                 </button>
             </div>
             ${isLinked ? `<div style="font-size:0.65rem; color:#555; margin-top:2px;">Cible verrouillée : ${n.linkedMapPointId}</div>` : ''}
        </div>
    </div>

    <div style="border:1px solid var(--border-color); border-radius:8px; padding:10px; background:rgba(0,0,0,0.2); margin-bottom:10px;">
        <div style="font-size:0.75rem; color:#73fbf7; margin-bottom:5px; font-weight:bold;">INFORMATIONS</div>
        <textarea id="edNotes" rows="3" placeholder="Notes..." style="background:rgba(0,0,0,0.3); font-size:0.85rem;">${escapeHtml(n.notes || '')}</textarea>
    </div>

    <div style="border:1px solid var(--border-color); border-radius:8px; padding:10px; background:rgba(0,0,0,0.2); margin-bottom:10px;">
        <div style="font-size:0.75rem; color:#73fbf7; margin-bottom:5px; font-weight:bold;">AJOUTER RELATION</div>
        
        <div style="margin-bottom:6px;">
            <div class="flex-row-force">
                <input id="inpCompany" list="datalist-companies" placeholder="Entreprise..." class="flex-grow-input" style="font-size:0.85rem;">
                <select id="selKindCompany" class="compact-select" style="width:90px;">${getLinkOptions()}</select>
                <button id="btnAddCompany" class="mini-btn primary" style="width:30px;">+</button>
            </div>
        </div>

        <div style="margin-bottom:6px;">
            <div class="flex-row-force">
                <input id="inpGroup" list="datalist-groups" placeholder="Groupe..." class="flex-grow-input" style="font-size:0.85rem;">
                <select id="selKindGroup" class="compact-select" style="width:90px;">${getLinkOptions()}</select>
                <button id="btnAddGroup" class="mini-btn primary" style="width:30px;">+</button>
            </div>
        </div>

        <div>
            <div class="flex-row-force">
                <input id="inpPerson" list="datalist-people" placeholder="Personne..." class="flex-grow-input" style="font-size:0.85rem;">
                <select id="selKindPerson" class="compact-select" style="width:90px;">${getLinkOptions()}</select>
                <button id="btnAddPerson" class="mini-btn primary" style="width:30px;">+</button>
            </div>
        </div>
    </div>

    <details style="background:rgba(255, 0, 0, 0.05); border-color:rgba(255,0,0,0.2);">
        <summary style="color:#ff5555; font-size:0.75rem;">ZONE DE DANGER (FUSION)</summary>
        <div style="padding-top:10px;">
            <div class="flex-row-force">
               <input id="mergeTarget" list="datalist-all" placeholder="Vers qui fusionner ?" class="flex-grow-input" style="border-color:#ff5555;">
               <button id="btnMerge" class="mini-btn danger" style="width:40px;">⚗️</button>
            </div>
        </div>
    </details>

    <div style="margin-top:15px;">
        <div style="font-size:0.75rem; color:#73fbf7; margin-bottom:5px; font-weight:bold;">LIENS ACTIFS</div>
        <div id="chipsLinks"></div>
    </div>

    <div style="margin-top:20px; text-align:center;">
        <button id="btnExportRP" style="font-size:0.8rem; background:transparent; border:1px dashed #444; color:#888; width:100%;">
            📄 Copier Dossier 
        </button>
    </div>

    <datalist id="datalist-all"></datalist>
    `;
}