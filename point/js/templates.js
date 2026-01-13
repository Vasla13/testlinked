import { TYPES, KIND_LABELS } from './constants.js';
import { escapeHtml, safeHex } from './utils.js';

// Génère les options pour les listes déroulantes de liens
function getLinkOptions() {
    return Object.entries(KIND_LABELS).map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
}

// =============================================================================
// --- 1. BARRE LATÉRALE GAUCHE (PATHFINDING / IA) ---
// C'est cette partie qui manquait (environ 100 lignes)
// =============================================================================
export function renderPathfindingSidebar(state, selectedNode) {
    const cyan = 'var(--accent-cyan)';
    const pink = 'var(--accent-pink)';
    const bgPanel = 'rgba(10, 15, 30, 0.6)';
    
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
                <div style="display:flex; flex-direction:column; gap:10px; padding:10px; border:1px solid rgba(255,255,255,0.1); border-radius:8px; background:${bgPanel};">
                    <div style="color:${cyan}; font-size:0.8rem; text-transform:uppercase; letter-spacing:2px; border-bottom:1px solid rgba(115,251,247,0.2); padding-bottom:5px; margin-bottom:5px;">
                        /// SYSTÈME DE TRAÇAGE
                    </div>
                    ${renderDataBox('Candidat Source', escapeHtml(selectedNode.name), cyan, true, '👤')}
                    <button id="btnPathStart" class="primary" style="
                        width:100%; margin-top:5px; padding:10px;
                        background: linear-gradient(90deg, rgba(115,251,247,0.1), rgba(115,251,247,0.2));
                        border: 1px solid ${cyan}; color: ${cyan};
                        font-weight:bold; letter-spacing:1px;
                        clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
                        transition: all 0.2s; cursor: pointer;
                    ">
                        [ INITIALISER SOURCE ]
                    </button>
                </div>
            `;
        } else {
            return `
                <div style="
                    padding:25px; text-align:center; border:1px dashed rgba(255,255,255,0.2); 
                    border-radius:8px; color:#666; font-style:italic; background:rgba(0,0,0,0.2);
                ">
                    <div style="font-size:1.5rem; margin-bottom:10px; opacity:0.5;">📡</div>
                    <div>En attente de signal...</div>
                    <div style="font-size:0.75rem; margin-top:5px;">Sélectionnez une entité sur la carte.</div>
                </div>
            `;
        }
    }

    // CAS 2 : Source définie, en attente de cible ou calcul
    const startNode = state.nodes.find(n => n.id === state.pathfinding.startId);
    const startName = startNode ? escapeHtml(startNode.name) : "ERR_UNKNOWN";
    const targetNode = (selectedNode && selectedNode.id !== state.pathfinding.startId) ? selectedNode : null;
    const hasTarget = !!targetNode;

    let statusDisplay = '';
    
    if (state.pathfinding.active) {
        statusDisplay = `
            <div style="
                margin-top:10px; padding:8px; background:rgba(0, 255, 0, 0.1); 
                border:1px solid #00ff00; border-radius:4px; text-align:center;
                color:#00ff00; font-weight:bold; font-size:0.8rem; letter-spacing:1px;
                box-shadow: 0 0 15px rgba(0,255,0,0.1); text-transform:uppercase;
            ">
                ✅ Liaison Établie
            </div>`;
    } else if (hasTarget) {
         statusDisplay = `
            <button id="btnPathCalc" style="
                width:100%; margin-top:10px; padding:10px;
                background: linear-gradient(90deg, rgba(255,107,129,0.1), rgba(255,107,129,0.2));
                border: 1px solid ${pink}; color: ${pink};
                font-weight:bold; letter-spacing:1px; text-transform:uppercase;
                clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
                cursor: pointer; transition: all 0.2s;
            " onmouseover="this.style.background='${pink}'; this.style.color='#000';" onmouseout="this.style.background='rgba(255,107,129,0.1)'; this.style.color='${pink}';">
                ⚡ CALCULER ROUTE
            </button>`;
    } else {
        statusDisplay = `
            <div style="margin-top:10px; padding:8px; border:1px solid rgba(255,255,255,0.1); border-radius:4px; text-align:center; color:#666; font-size:0.75rem; font-style:italic;">
                En attente de cible...
            </div>`;
    }

    return `
        <div style="border:1px solid rgba(115, 251, 247, 0.3); border-radius:6px; overflow:hidden; background:rgba(5,7,10,0.4); backdrop-filter:blur(5px);">
            <div style="
                background: linear-gradient(90deg, rgba(115, 251, 247, 0.1), transparent);
                padding: 6px 10px; border-bottom:1px solid rgba(115, 251, 247, 0.2);
                display:flex; justify-content:space-between; align-items:center;
            ">
                <span style="font-size:0.75rem; color:${cyan}; font-weight:bold; letter-spacing:2px;">/// NET.LINK</span>
                <span style="width:6px; height:6px; background:${state.pathfinding.active ? '#0f0' : '#f00'}; border-radius:50%; box-shadow:0 0 5px currentColor;"></span>
            </div>

            <div style="padding:12px; display:flex; flex-direction:column; gap:10px;">
                ${renderDataBox('Source (A)', startName, cyan, true, '🚩')}
                <div style="display:flex; align-items:center; justify-content:center; opacity:0.6;">
                    <div style="height:20px; width:1px; background:linear-gradient(to bottom, ${cyan}, ${pink});"></div>
                    <div style="font-size:0.8rem; color:#fff; margin:0 5px;">▼</div>
                    <div style="height:20px; width:1px; background:linear-gradient(to bottom, ${cyan}, ${pink});"></div>
                </div>
                ${renderDataBox('Destination (B)', targetNode ? escapeHtml(targetNode.name) : 'Sélectionner...', pink, hasTarget, '🎯')}
                ${statusDisplay}
                <button id="btnPathCancel" style="
                    width:100%; margin-top:5px; padding:6px;
                    background: transparent; border: 1px solid #444; color: #888;
                    font-size:0.7rem; text-transform:uppercase; letter-spacing:1px;
                    border-radius:4px; cursor: pointer; transition: all 0.2s;
                " onmouseover="this.style.borderColor='#fff'; this.style.color='#fff';" onmouseout="this.style.borderColor='#444'; this.style.color='#888';">
                    ✖ Annuler séquence
                </button>
            </div>
        </div>
    `;
}

// =============================================================================
// --- 2. BARRE LATÉRALE DROITE (ÉDITEUR AVEC LIAISON MAP) ---
// =============================================================================
export function renderEditorHTML(n, state) {
    const isP = (n.type === TYPES.PERSON);
    
    // Options Type
    const typeOptions = `
        <option value="${TYPES.PERSON}" ${n.type===TYPES.PERSON?'selected':''}>Personne</option>
        <option value="${TYPES.GROUP}" ${n.type===TYPES.GROUP?'selected':''}>Groupe</option>
        <option value="${TYPES.COMPANY}" ${n.type===TYPES.COMPANY?'selected':''}>Entreprise</option>
    `;

    // BOUTON LIAISON MAP (Ping Croisé)
    const mapLinkBtn = n.linkedMapPointId 
        ? `<button id="btnGoToMap" class="mini-btn" style="width:auto; padding:0 8px; border:1px solid var(--accent-cyan); color:var(--accent-cyan); margin-left:5px;" title="Voir sur la Carte Tactique">🗺️</button>` 
        : '';

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

        <div style="margin-top:8px; padding-top:8px; border-top:1px dashed rgba(255,255,255,0.1);">
             <label style="font-size:0.7rem; color:#888;">Liaison Carte Tactique</label>
             <div class="flex-row-force">
                 <input type="text" id="edMapId" value="${escapeHtml(n.linkedMapPointId || '')}" placeholder="ID Point Map..." class="flex-grow-input" style="font-size:0.8rem; font-family:monospace; color:var(--accent-orange);">
                 ${mapLinkBtn}
             </div>
        </div>
    </div>

    <div style="border:1px solid var(--border-color); border-radius:8px; padding:10px; background:rgba(0,0,0,0.2); margin-bottom:10px;">
        <div style="font-size:0.75rem; color:#73fbf7; margin-bottom:5px; font-weight:bold;">INFORMATIONS</div>
        <textarea id="edNotes" rows="3" placeholder="Notes..." style="background:rgba(0,0,0,0.3); font-size:0.85rem;">${escapeHtml(n.notes || '')}</textarea>
    </div>

    <div style="border:1px solid var(--border-color); border-radius:8px; padding:10px; background:rgba(0,0,0,0.2); margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
            <div style="font-size:0.75rem; color:#73fbf7; font-weight:bold;">AJOUTER / CRÉER RELATION</div>
        </div>

        <div style="margin-bottom:6px;">
            <label style="font-size:0.7rem; color:#aaa;">Entreprise</label>
            <div class="flex-row-force">
                <input id="inpCompany" list="datalist-companies" placeholder="Nom..." class="flex-grow-input" style="font-size:0.85rem;">
                <select id="selKindCompany" class="compact-select" style="width:90px;">${getLinkOptions()}</select>
                <button id="btnAddCompany" class="mini-btn primary" style="width:30px;">+</button>
            </div>
        </div>

        <div style="margin-bottom:6px;">
            <label style="font-size:0.7rem; color:#aaa;">Groupuscule</label>
            <div class="flex-row-force">
                <input id="inpGroup" list="datalist-groups" placeholder="Nom..." class="flex-grow-input" style="font-size:0.85rem;">
                <select id="selKindGroup" class="compact-select" style="width:90px;">${getLinkOptions()}</select>
                <button id="btnAddGroup" class="mini-btn primary" style="width:30px;">+</button>
            </div>
        </div>

        <div>
            <label style="font-size:0.7rem; color:#aaa;">Personnel</label>
            <div class="flex-row-force">
                <input id="inpPerson" list="datalist-people" placeholder="Nom..." class="flex-grow-input" style="font-size:0.85rem;">
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
            <div style="font-size:0.7rem; color:#aaa; margin-top:5px; font-style:italic;">
                ⚠️ Fusionner déplacera tous les liens vers la cible et supprimera ce nœud.
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