import { escapeHtml, safeHex, kindToLabel } from './utils.js';
import { TYPES, PERSON_PERSON_KINDS, PERSON_ORG_KINDS, ORG_ORG_KINDS } from './constants.js';

export function getLinkOptions(sourceType, targetType) {
    let validKinds = [];
    if (sourceType === TYPES.PERSON && targetType === TYPES.PERSON) validKinds = PERSON_PERSON_KINDS;
    else if (sourceType !== TYPES.PERSON && targetType !== TYPES.PERSON) validKinds = ORG_ORG_KINDS;
    else validKinds = PERSON_ORG_KINDS;
    return Array.from(validKinds).map(k => `<option value="${k}">${kindToLabel(k)}</option>`).join('');
}

export function renderEditorHTML(n, state) {
    let colorInputHtml = '';
    if (n.type === 'person') {
        colorInputHtml = `<div style="font-size:0.8rem; padding-top:10px; color:#aaa;">Auto (Mix)</div>`;
    } else {
        colorInputHtml = `<input id="edColor" type="color" value="${safeHex(n.color)}" style="height:38px; width:100%;"/>`;
    }

    // Bouton Pathfinding Dynamique
    let pathBtnHTML = '';
    if (state.pathfinding.startId === null) {
        pathBtnHTML = `<button id="btnPathStart" class="action-btn" style="flex:1; border:1px solid var(--accent-cyan); color:var(--accent-cyan); background:transparent;">🚩 Définir Source</button>`;
    } else if (state.pathfinding.startId === n.id) {
        pathBtnHTML = `<button id="btnPathCancel" class="action-btn danger" style="flex:1;">❌ Annuler Source</button>`;
    } else {
        pathBtnHTML = `<button id="btnPathCalc" class="action-btn primary" style="flex:1;">⚡ Calculer Corrélation</button>`;
    }

    let clearPathHTML = '';
    if (state.pathfinding.active) {
        clearPathHTML = `<button id="btnClearPath" class="action-btn" style="width:100%; margin-top:5px; background:#444;">🔄 Réinitialiser l'affichage</button>`;
    }

    return `
        <div class="flex-row-force" style="margin-bottom:10px;">
            <button id="btnFocusNode" class="${state.focusMode ? 'primary' : ''}" style="flex:1; font-size:0.8rem;">
                ${state.focusMode ? '🔍 Tout' : '🎯 Focus'}
            </button>
            <button id="btnCenterNode" style="flex:1; font-size:0.8rem;">📍 Centrer</button>
            <button id="btnDelete" class="danger" style="flex:0 0 auto; width:40px; font-size:0.8rem;">🗑️</button>
        </div>

        <div style="background:rgba(0,255,255,0.05); border:1px solid rgba(0,255,255,0.2); padding:8px; border-radius:4px; margin-bottom:15px;">
            <div style="font-size:0.7rem; color:var(--accent-cyan); text-transform:uppercase; margin-bottom:5px; font-weight:bold;">Algorithme de Liaison</div>
            <div class="flex-row-force">
                ${pathBtnHTML}
            </div>
            ${clearPathHTML}
        </div>

        <details open>
            <summary>Propriétés</summary>
            <div class="row">
                <label>Nom</label>
                <input id="edName" type="text" value="${escapeHtml(n.name)}"/>
            </div>
            
            <div class="flex-row-force">
                <div style="flex:1;">
                    <label style="font-size:0.8rem; opacity:0.7;">Type</label>
                    <select id="edType" style="width:100%;">
                        <option value="person" ${n.type==='person'?'selected':''}>Personne</option>
                        <option value="group" ${n.type==='group'?'selected':''}>Groupuscule</option>
                        <option value="company" ${n.type==='company'?'selected':''}>Entreprise</option>
                    </select>
                </div>
                <div style="flex:1;">
                    <label style="font-size:0.8rem; opacity:0.7;">Couleur</label>
                    ${colorInputHtml}
                </div>
            </div>

            <div class="row" style="margin-top:5px;">
                <label>Téléphone</label>
                <input id="edNum" type="text" value="${escapeHtml(n.num||'')}"/>
            </div>
        </details>

        <details open>
            <summary>Informations</summary>
            <textarea id="edNotes" class="notes-textarea" placeholder="Notes..." style="min-height:80px;">${escapeHtml(n.notes||'')}</textarea>
        </details>
        
        <details open>
            <summary>Ajouter / Créer relation</summary>
            
            <div style="margin-bottom:8px;">
                <label style="font-size:0.8rem; color:#aaa;">Entreprise</label>
                <div class="flex-row-force">
                    <input id="inpCompany" list="datalist-companies" placeholder="Nom..." class="flex-grow-input" />
                    <select id="selKindCompany" class="compact-select">${getLinkOptions(n.type, TYPES.COMPANY)}</select>
                    <button id="btnAddCompany" class="primary mini-btn">+</button>
                </div>
            </div>

            <div style="margin-bottom:8px;">
                <label style="font-size:0.8rem; color:#aaa;">Groupuscule</label>
                <div class="flex-row-force">
                    <input id="inpGroup" list="datalist-groups" placeholder="Nom..." class="flex-grow-input" />
                    <select id="selKindGroup" class="compact-select">${getLinkOptions(n.type, TYPES.GROUP)}</select>
                    <button id="btnAddGroup" class="primary mini-btn">+</button>
                </div>
            </div>

            <div style="margin-bottom:8px;">
                <label style="font-size:0.8rem; color:#aaa;">Personnel</label>
                <div class="flex-row-force">
                    <input id="inpPerson" list="datalist-people" placeholder="Nom..." class="flex-grow-input" />
                    <select id="selKindPerson" class="compact-select">${getLinkOptions(n.type, TYPES.PERSON)}</select>
                    <button id="btnAddPerson" class="primary mini-btn">+</button>
                </div>
            </div>
        </details>

        <details>
            <summary style="color:#ff5555;">Zone de Danger (Fusion)</summary>
            <div style="font-size:0.75rem; color:#aaa; margin-bottom:5px;">
                Fusionner <b>${escapeHtml(n.name)}</b> dans un autre point.
            </div>
            <div class="flex-row-force">
               <input id="mergeTarget" list="datalist-all" placeholder="Vers qui fusionner ?" class="flex-grow-input" />
               <button id="btnMerge" class="primary danger" style="padding:0 10px;">Fusionner</button>
            </div>
        </details>

        <details open>
            <summary>Liens Actifs</summary>
            <div id="chipsLinks"></div>
        </details>
    `;
}