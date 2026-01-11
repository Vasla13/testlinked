import { TYPES, KIND_LABELS } from './constants.js';
import { escapeHtml, safeHex } from './utils.js';

// Génère les options pour les listes déroulantes de liens
function getLinkOptions() {
    return Object.entries(KIND_LABELS).map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
}

// --- 1. BARRE LATÉRALE GAUCHE (LIAISON IA) ---
// Correspond à ton image : image_c4a450.png
export function renderPathfindingSidebar(state, selectedNode) {
    // Cas 1 : Aucune source définie
    if (!state.pathfinding.startId) {
        if (selectedNode) {
            // Un nœud est sélectionné -> On propose de le définir comme source
            return `
                <div style="padding:15px; border:1px solid rgba(115, 251, 247, 0.2); background:rgba(0,0,0,0.3); border-radius:8px; text-align:center;">
                    <div style="font-size:0.8rem; color:#888; margin-bottom:10px;">Point de départ :</div>
                    <div style="font-size:1.1rem; font-weight:bold; color:#fff; margin-bottom:15px;">${escapeHtml(selectedNode.name)}</div>
                    
                    <button id="btnPathStart" class="primary" style="width:100%; font-weight:bold; padding:10px; border:1px solid var(--accent-cyan); box-shadow: 0 0 10px rgba(115,251,247,0.2);">
                        🚩 DÉFINIR COMME SOURCE
                    </button>
                </div>
            `;
        } else {
            // Rien n'est sélectionné -> Message d'attente
            return `
                <div style="padding:20px; text-align:center; opacity:0.6;">
                    <div style="font-size:2rem; margin-bottom:10px;">🚩</div>
                    <div style="font-style:italic;">Sélectionnez une personne sur la carte pour commencer.</div>
                </div>
            `;
        }
    }

    // Cas 2 : Source définie -> On cherche une cible
    const startNode = state.nodes.find(n => n.id === state.pathfinding.startId);
    const startName = startNode ? escapeHtml(startNode.name) : "Inconnu";
    
    // La cible est la sélection actuelle (si différente du départ)
    const targetNode = (selectedNode && selectedNode.id !== state.pathfinding.startId) ? selectedNode : null;
    
    let targetHtml = '';
    let actionBtnHtml = '';

    if (targetNode) {
        targetHtml = `<b style="color:#fff; font-size:1rem;">${escapeHtml(targetNode.name)}</b>`;
        actionBtnHtml = `<button id="btnPathCalc" class="primary" style="width:100%; margin-top:10px;">⚡ CALCULER LE CHEMIN</button>`;
    } else {
        targetHtml = `<span style="color:#666; font-style:italic;">(Sélectionnez une cible...)</span>`;
        actionBtnHtml = `<button disabled style="width:100%; margin-top:10px; opacity:0.5; cursor:not-allowed;">En attente de cible...</button>`;
    }

    if (state.pathfinding.active) {
        actionBtnHtml = `<div style="text-align:center; color:#00ff00; margin:10px 0; font-weight:bold;">✅ Chemin affiché</div>`;
    }

    return `
        <div style="border:1px solid rgba(115, 251, 247, 0.3); border-radius:8px; overflow:hidden;">
            <div style="background:rgba(115, 251, 247, 0.1); padding:8px 12px; border-bottom:1px solid rgba(115, 251, 247, 0.2);">
                <div style="font-size:0.7rem; color:#73fbf7; text-transform:uppercase;">Source</div>
                <div style="font-weight:bold; color:#fff;">${startName}</div>
            </div>
            
            <div style="text-align:center; color:#666; padding:4px;">⬇️</div>

            <div style="padding:8px 12px;">
                <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Destination</div>
                ${targetHtml}
            </div>
        </div>

        ${actionBtnHtml}

        <button id="btnPathCancel" style="width:100%; margin-top:10px; background:rgba(255, 80, 80, 0.1); color:#ff5050; border:1px solid #ff5050;">
            ✖ RESET / ANNULER
        </button>
    `;
}

// --- 2. BARRE LATÉRALE DROITE (EDITEUR) ---
// Correspond à tes images : image_c4a433.png et image_c4986f.png
export function renderEditorHTML(n, state) {
    const isP = (n.type === TYPES.PERSON);
    
    // Dropdown Type
    const typeOptions = `
        <option value="${TYPES.PERSON}" ${n.type===TYPES.PERSON?'selected':''}>Personne</option>
        <option value="${TYPES.GROUP}" ${n.type===TYPES.GROUP?'selected':''}>Groupe</option>
        <option value="${TYPES.COMPANY}" ${n.type===TYPES.COMPANY?'selected':''}>Entreprise</option>
    `;

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
            📄 Copier Dossier RP
        </button>
    </div>

    <datalist id="datalist-all">
        </datalist>
    `;
}