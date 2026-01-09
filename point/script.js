/* PATCH 2025-11-05:
   - Désactive les collisions pendant la phase 'burst' (2s de démarrage)
   - x3 sur l'attraction des liens pendant 'burst'
   - Durée du boost initial portée à 2000 ms
*/
/* PATCH 2025-11-05: Désactivation des forces angulaires (RING_TANG_K, ORBIT_PREF_K) pour éviter le retour à l'angle d'origine et favoriser uniquement la minimisation des distances de liens. */

/* v8 — Graphe Obsidian-like (physique et édition corrigées)
   - Organisations (entreprise/groupe) plus éloignées entre elles
   - Personnes plus proches de leur orga
   - Anneaux par rôle: patron (proche) → haut gradé → employé/membre
   - Déplacement avec ancrage doux (ne revient pas à l'origine)
   - Éditeur fonctionnel
*/
/* OPTIMISATION 2025-11-20:
   - Implémentation d'une grille spatiale (spatial grid) dans physics.step pour la répulsion entre nœuds (réduction de O(N^2) à O(N)).
   - Amélioration de la logique de sélection des nœuds actifs pour la simulation (seulement les nœuds visibles ou ceux en cours de glissement).
*/
(function(){
  const DEFAULT_ZOOM = 0.8;
  // ---------- State & enums ----------
  const state={
    centerLockId:null,
    nodes:[],
    links:[],
    nextId:1,
    selection:null,
    showLabels:true,
    showLinkTypes:false,
    performance:false,
    focusOnlyId:null,
    view:{x:0,y:0,scale:0.8},
    ui:{}
  };

  const POINT_STORAGE_KEY = 'pointPageState_v1';
  let __hasRestoredPointState = false;

  function savePointStateToStorage(){
    try{
      const payload = {
        nodes: state.nodes,
        links: state.links,
        view: state.view,
        showLabels: state.showLabels,
        showLinkTypes: state.showLinkTypes,
        performance: state.performance,
        focusOnlyId: state.focusOnlyId
      };
      localStorage.setItem(POINT_STORAGE_KEY, JSON.stringify(payload));
    }catch(err){
      console.error('Erreur sauvegarde état (points):', err);
    }
  }

  function loadPointStateFromStorage(){
    try{
      const raw = localStorage.getItem(POINT_STORAGE_KEY);
      if(!raw) return;
      const data = JSON.parse(raw);
      if(Array.isArray(data.nodes)) state.nodes = data.nodes;
      if(Array.isArray(data.links)) state.links = data.links;
      if(data.view && typeof data.view.x==='number' && typeof data.view.y==='number' && typeof data.view.scale==='number'){
        state.view = data.view;
      }
      if(typeof data.showLabels==='boolean') state.showLabels = data.showLabels;
      if(typeof data.showLinkTypes==='boolean') state.showLinkTypes = data.showLinkTypes;
      if(typeof data.performance==='boolean') state.performance = data.performance;
      if(data.focusOnlyId != null) state.focusOnlyId = data.focusOnlyId;
      __hasRestoredPointState = true;
    }catch(err){
      console.error('Erreur lecture état (points):', err);
    }
  }

  // Sauvegarde automatique à la fermeture/actualisation
  window.addEventListener('beforeunload', savePointStateToStorage);

  // --- Confirmation modal spécifique à la page points ---
  function createPointConfirmModal(){
    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-modal-backdrop is-hidden';
    backdrop.innerHTML = `
      <div class="confirm-modal">
        <p data-confirm-message></p>
        <div class="confirm-modal-buttons">
          <button type="button" data-confirm-cancel>Annuler</button>
          <button type="button" class="danger" data-confirm-ok>Confirmer</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    return backdrop;
  }

  const __pointConfirmBackdrop = createPointConfirmModal();
  const __pointConfirmMessage = __pointConfirmBackdrop.querySelector('[data-confirm-message]');
  const __pointConfirmCancel = __pointConfirmBackdrop.querySelector('[data-confirm-cancel]');
  const __pointConfirmOk = __pointConfirmBackdrop.querySelector('[data-confirm-ok]');

  function showPointConfirmModal(message, onConfirm){
    if(!__pointConfirmBackdrop) return;
    __pointConfirmMessage.textContent = message || '';
    __pointConfirmBackdrop.classList.remove('is-hidden');

    const handleCancel = (e)=>{
      e.stopPropagation();
      close();
    };
    const handleOk = (e)=>{
      e.stopPropagation();
      close();
      if(typeof onConfirm === 'function') onConfirm();
    };
    const handleBackdrop = (e)=>{
      if(e.target === __pointConfirmBackdrop){
        close();
      }
    };

    function close(){
      __pointConfirmBackdrop.classList.add('is-hidden');
      __pointConfirmCancel.removeEventListener('click', handleCancel);
      __pointConfirmOk.removeEventListener('click', handleOk);
      __pointConfirmBackdrop.removeEventListener('click', handleBackdrop);
    }

    __pointConfirmCancel.addEventListener('click', handleCancel);
    __pointConfirmOk.addEventListener('click', handleOk);
    __pointConfirmBackdrop.addEventListener('click', handleBackdrop);
  }


  const TYPES={ PERSON:'person', GROUP:'group', COMPANY:'company' };
  const KINDS={
    AMOUR:'amour', FAMILLE:'famille', PARTENAIRE:'partenaire', AMI:'ami',
    PATRON:'patron', HAUT_GRADE:'haut_grade', EMPLOYE:'employe', MEMBRE:'membre',
    AFFILIATION:'affiliation'
  };
  const ORG_REL = new Set([KINDS.PATRON, KINDS.HAUT_GRADE, KINDS.EMPLOYE, KINDS.MEMBRE]);
  // Allowed kinds by node-type combination
  const PERSON_PERSON_KINDS = new Set([KINDS.AMOUR, KINDS.AMI, KINDS.FAMILLE, KINDS.PARTENAIRE]);
  const PERSON_ORG_KINDS    = new Set([KINDS.PATRON, KINDS.HAUT_GRADE, KINDS.EMPLOYE, KINDS.MEMBRE, KINDS.AFFILIATION]);
  const ORG_ORG_KINDS       = new Set([KINDS.AFFILIATION]);

  function isLinkAllowedByTypes(aType, bType, kind){
    if(aType===TYPES.PERSON && bType===TYPES.PERSON) return PERSON_PERSON_KINDS.has(kind);
    if(aType===TYPES.PERSON && (bType===TYPES.GROUP || bType===TYPES.COMPANY)) return PERSON_ORG_KINDS.has(kind);
    if((aType===TYPES.GROUP || aType===TYPES.COMPANY) && bType===TYPES.PERSON) return PERSON_ORG_KINDS.has(kind);
    if((aType===TYPES.GROUP || aType===TYPES.COMPANY) && (bType===TYPES.GROUP || bType===TYPES.COMPANY)) return ORG_ORG_KINDS.has(kind);
    return false;
  }


  const isPerson=n=>n.type===TYPES.PERSON;
  const isGroup =n=>n.type===TYPES.GROUP;
  const isCompany=n=>n.type===TYPES.COMPANY;
  const isOrg =n=>isGroup(n)||isCompany(n);
  // === Helpers ajoutés ===

  // Vérifie si une PERSONNE a un lien Patron/Haut gradé avec une organisation
  function isHighRankPersonById(id){
    const n = nodeById(id);
    if(!n || n.type !== TYPES.PERSON) return false;
    for(const l of state.links){
      if(l.source===id || l.target===id){
        const otherId = (l.source===id)? l.target : l.source;
        const o = nodeById(otherId);
        if(o && (o.type===TYPES.GROUP || o.type===TYPES.COMPANY)){
          if(l.kind===KINDS.PATRON || l.kind===KINDS.HAUT_GRADE){
            return true;
          }
        }
      }
    }
    return false;
  }

  // Calcule l'épaisseur d'un trait selon les règles demandées
  function computeLinkWidth(l, scale){
    const a=nodeById(l.source), b=nodeById(l.target);
    const s=Math.max(0.5, scale || (state.view && state.view.scale) || 1);
    const base = 2.4/Math.sqrt(s);
    if(!a||!b) return base;

        // If either endpoint would be clustered at this zoom, force thinner lines
    if(state && state._clusterCache && state._clusterCache.repOf){
      const repOf = state._clusterCache.repOf;
      const gA = repOf.get(a.id)!==a.id;
      const gB = repOf.get(b.id)!==b.id;
      if(gA || gB){ return 1.2/Math.sqrt(s); }
    }
const aOrg = (a.type===TYPES.GROUP || a.type===TYPES.COMPANY);
    const bOrg = (b.type===TYPES.GROUP || b.type===TYPES.COMPANY);

    // 1) Orga <-> Orga (entreprise/groupuscule <-> entreprise/groupuscule) : plus gros
    if(aOrg && bOrg) return 4.0/Math.sqrt(s);

    // 2) Orga <-> Patron/Haut gradé : plus gros
    const isHighRoleEdge = (
      (aOrg && b.type===TYPES.PERSON && (l.kind===KINDS.PATRON || l.kind===KINDS.HAUT_GRADE)) ||
      (bOrg && a.type===TYPES.PERSON && (l.kind===KINDS.PATRON || l.kind===KINDS.HAUT_GRADE))
    );
    if(isHighRoleEdge) return 4.0/Math.sqrt(s);

    // 3) Orga <-> personne qui fait le pont vers une autre orga : plus gros
    let thicker=false;
    if((aOrg && b.type===TYPES.PERSON) || (bOrg && a.type===TYPES.PERSON)){
      const person = (a.type===TYPES.PERSON) ? a : b;
      let orgCount = 0;
      for(const lk of state.links){
        if(lk.source===person.id || lk.target===person.id){
          const otherId = (lk.source===person.id) ? lk.target : lk.source;
          const o = nodeById(otherId);
          if(o && (o.type===TYPES.GROUP || o.type===TYPES.COMPANY)){
            orgCount++;
          }
        }
      }
      if(orgCount>=2) thicker=true;
    }

    return thicker ? 3.6/Math.sqrt(s) : base;
  }


  const LINK_KIND_EMOJI = {
    [KINDS.AMOUR]: '❤️',
    [KINDS.FAMILLE]: '👪',
    [KINDS.PARTENAIRE]: '🤝',
    [KINDS.AMI]: '🤝',
    [KINDS.PATRON]: '👑',
    [KINDS.HAUT_GRADE]: '🏅',
    [KINDS.EMPLOYE]: '💼',
    [KINDS.MEMBRE]: '🎫',
    [KINDS.AFFILIATION]: '🔗'
  };

  const LINK_KIND_COLOR = {
    [KINDS.AMOUR]: '#ff6b81',
    [KINDS.FAMILLE]: '#ffd43b',
    [KINDS.PARTENAIRE]: '#b197fc',
    [KINDS.AMI]: '#4dabf7',
    [KINDS.PATRON]: '#ff922b',
    [KINDS.HAUT_GRADE]: '#fab005',
    [KINDS.EMPLOYE]: '#20c997',
    [KINDS.MEMBRE]: '#15aabf',
    [KINDS.AFFILIATION]: '#94d82d'
  };

  function linkKindEmoji(kind){
    return LINK_KIND_EMOJI[kind] || '•';
  }

  function linkKindColor(kind){
    return LINK_KIND_COLOR[kind] || '#5b6280';
  }

  function computeLinkColor(l){
    const a = nodeById(l.source), b = nodeById(l.target);
    if(!a || !b || !l || !l.kind) return '#5b6280';

    const isOrgNode = (n) => n && (n.type===TYPES.GROUP || n.type===TYPES.COMPANY);

    // Personne <-> Personne
    if(a.type===TYPES.PERSON && b.type===TYPES.PERSON){
      return linkKindColor(l.kind);
    }

    // Personne <-> Organisation
    if( (a.type===TYPES.PERSON && isOrgNode(b)) || (b.type===TYPES.PERSON && isOrgNode(a)) ){
      return linkKindColor(l.kind);
    }

    // Organisation <-> Organisation
    if(isOrgNode(a) && isOrgNode(b)){
      return linkKindColor(l.kind);
    }

    return linkKindColor(l.kind);
  }

  function updateLinkLegend(){
    if(!ui.linkLegend) return;
    if(!state.showLinkTypes){
      ui.linkLegend.style.display = 'none';
      ui.linkLegend.innerHTML = '';
      return;
    }
    const usedKinds = new Set(state.links.map(l=>l.kind).filter(Boolean));
    if(usedKinds.size===0){
      ui.linkLegend.style.display = 'none';
      ui.linkLegend.innerHTML = '';
      return;
    }
    const labels = {
      [KINDS.AMOUR]: 'Amour',
      [KINDS.FAMILLE]: 'Famille',
      [KINDS.PARTENAIRE]: 'Partenaire',
      [KINDS.AMI]: 'Amitié',
      [KINDS.PATRON]: 'Patron / Direction',
      [KINDS.HAUT_GRADE]: 'Haut gradé',
      [KINDS.EMPLOYE]: 'Employé',
      [KINDS.MEMBRE]: 'Membre',
      [KINDS.AFFILIATION]: 'Affiliation'
    };
    const order = [
      KINDS.PATRON, KINDS.HAUT_GRADE, KINDS.EMPLOYE, KINDS.MEMBRE, KINDS.AFFILIATION,
      KINDS.AMOUR, KINDS.FAMILLE, KINDS.AMI, KINDS.PARTENAIRE
    ];
    const htmlParts = [];
    for(const k of order){
      if(!usedKinds.has(k)) continue;
      const emoji = linkKindEmoji(k);
      const label = labels[k] || k;
      const color = linkKindColor(k);
      htmlParts.push(
        '<div class="legend-item">'
        + '<span class="legend-emoji">' + emoji + '</span>'
        + '<span class="legend-color-swatch" style="background:' + color + '"></span>'
        + '<span class="legend-label">' + label + '</span>'
        + '</div>'
      );
    }
    ui.linkLegend.innerHTML = htmlParts.join('');
    ui.linkLegend.style.display = 'flex';
  }


  // ---------- Clustering (zoom-out regroupement) ----------
  const CLUSTER_THRESHOLD = 0.40; // quand p.scale <= seuil => on regroupe
  function computeClusters(){
    // Map id->rep (représentant)
    const repOf = new Map();
    // Init
    for(const n of state.nodes){ repOf.set(n.id, n.id); }
    // Build adjacency and link kinds
    const adj = new Map();
    for(const n of state.nodes){ adj.set(n.id, []); }
    for(const l of state.links){
      const a = l.source, b = l.target;
      if(!adj.has(a)) adj.set(a, []);
      if(!adj.has(b)) adj.set(b, []);
      adj.get(a).push({id:b, kind:l.kind});
      adj.get(b).push({id:a, kind:l.kind});
    }
    const deg = (id)=> (adj.get(id)||[]).length;

    // Helper to know if a node is org/person
    const getNode = (id)=> state.nodes.find(n=>n.id===id);

    // 1) Regrouper les personnes rattachées à UNE seule organisation
    for(const n of state.nodes){
      if(!isPerson(n)) continue;
      const neigh = (adj.get(n.id)||[]);
      // Liens orga/personne par type
      const orgNeigh = neigh.filter(e=> {
        const t = getNode(e.id);
        return t && isOrg(t) && ORG_REL.has(e.kind) && (e.kind!==KINDS.PATRON && e.kind!==KINDS.HAUT_GRADE);
      }).map(e=>e.id);
      if(orgNeigh.length===1){
        repOf.set(n.id, orgNeigh[0]); // collapse vers l’organisation unique
      }
    }

    // 2) Regrouper les feuilles (degré 1) entre personnes
    for(const n of state.nodes){
      if(!isPerson(n)) continue; if(isHighRankPersonById(n.id)) continue;
      if(repOf.get(n.id)!==n.id) continue; // déjà regroupé
      const neigh = (adj.get(n.id)||[]);
      if(neigh.length===1){
        const v = neigh[0].id;
        const nv = getNode(v);
        if(nv && isPerson(nv) && repOf.get(v)===v){
          // Cas du duo isolé: choisir représentant de façon stable (id min)
          if(deg(n.id)===1 && deg(v)===1){
            const rep = Math.min(n.id, v);
            const other = (rep===n.id)? v : n.id;
            repOf.set(other, rep);
          }else{
            // Sinon on regroupe la feuille vers son voisin
            repOf.set(n.id, v);
          }
        }
      }
    }

    // 3) Compter et préparer labels
    const counts = new Map();
    for(const id of repOf.values()){
      counts.set(id, (counts.get(id)||0)+1);
    }
    const displayName = new Map();
    for(const repId of counts.keys()){
      const rep = getNode(repId);
      if(!rep) continue;
      const c = counts.get(repId)||1;
      if(c>1){
        displayName.set(repId, `${rep.name} (+${c-1})`);
      }else{
        displayName.set(repId, rep.name);
      }
    }
    return {repOf, counts, displayName};
  }

  const CLUSTER_TRANSITION_MS = 400;
  let clusterTransition = null;
  let lastClusteredFlag = null;

  function __nowMs(){
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function __isClusteredView(){
    return !!(state.view && state.view.scale <= CLUSTER_THRESHOLD && state.focusOnlyId==null);
  }

  function __getNodeDrawPos(n, clusterData, transitioning, progress){
    if(!transitioning || !clusterTransition || state.performance===true){
      return {x:n.x, y:n.y};
    }
    if(!clusterData || !clusterData.repOf){
      return {x:n.x, y:n.y};
    }
    const repOf = clusterData.repOf;
    const repId = repOf.get(n.id);
    if(!repId){
      return {x:n.x, y:n.y};
    }
    const rep = nodeById(repId);
    if(!rep){
      return {x:n.x, y:n.y};
    }
    let fromX, fromY, toX, toY;
    if(clusterTransition.mode === 'toNormal'){
      fromX = rep.x; fromY = rep.y;
      toX = n.x;     toY = n.y;
    }else if(clusterTransition.mode === 'toClustered'){
      fromX = n.x;   fromY = n.y;
      toX = rep.x;   toY = rep.y;
    }else{
      return {x:n.x, y:n.y};
    }
    const k = Math.max(0, Math.min(1, progress));
    return {x: fromX + (toX-fromX)*k, y: fromY + (toY-fromY)*k};
  }


  function drawClustered(){
    applyPersonOrgColors();
    const p=state.view, w=canvas.width/(window.devicePixelRatio||1), h=canvas.height/(window.devicePixelRatio||1);
    ctx.save();
    ctx.clearRect(0,0,w,h);
    ctx.translate(w/2+p.x, h/2+p.y);
    ctx.scale(p.scale,p.scale);

    const {repOf, counts, displayName} = computeClusters();
    const reps = new Map(); // repId -> node
    for(const n of state.nodes){
      if(repOf.get(n.id)===n.id){
        reps.set(n.id, n);
      }
    }
    // Dessiner uniquement les représentants (sans liens pour alléger)
    // Dessiner les liens entre représentants (ne pas cacher les traits entre points visibles)
    (function(){
      const pairMaxW = new Map(); // 'a|b' -> width
      for(const l of state.links){
        const ra = repOf.get(l.source), rb = repOf.get(l.target);
        if(!ra || !rb || ra===rb) continue;
        if(!reps.has(ra) || !reps.has(rb)) continue;
        const key = (ra<rb) ? (ra+'|'+rb) : (rb+'|'+ra);
        const w = computeLinkWidth(l, p.scale);
        const prev = pairMaxW.get(key) || 0;
        if(w>prev) pairMaxW.set(key, w);
      }
      ctx.save();
      ctx.strokeStyle = '#41465e';
      ctx.globalAlpha = 0.9;
      for(const [key,w] of pairMaxW.entries()){
        const [aId,bId] = key.split('|').map(x=>parseInt(x,10));
        const a = reps.get(aId), b = reps.get(bId);
        if(!a||!b) continue;
        ctx.lineWidth = (0.8/Math.sqrt(p.scale));
        ctx.beginPath();
        ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
        ctx.stroke();
      }
      ctx.restore();
    })();

    for(const [id, n] of reps){
      const bump = Math.min(12, 2*Math.log2( (counts.get(id)||1) ));
      const r = nodeRadius(n) + bump;
      ctx.fillStyle=n.color||'#9aa3ff';
      ctx.beginPath();
      if(isGroup(n)){
        polygonPath(ctx, n.x, n.y, r, 8);
      }else if(isCompany(n)){
        roundRectPath(ctx, n.x-r*0.9, n.y-r*0.9, r*1.8, r*1.8, Math.min(10,r/3));
      }else{
        ctx.arc(n.x,n.y,r,0,Math.PI*2);
      }
      ctx.fill();

      // Sélection (si le point sélectionné est regroupé, surligner le représentant)
      const sel = state.selection!=null ? repOf.get(state.selection) : null;
      if(sel===id){
        ctx.strokeStyle='#7aa2ff';
        ctx.lineWidth=2/Math.sqrt(p.scale);
        ctx.stroke();
      }
    }

    // Labels
    if(state.showLabels){
      ctx.font = `${12/Math.sqrt(p.scale)}px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle='#c6cbe0';
      for(const [id, n] of reps){
        const name = displayName.get(id) || n.name;
        const bump = Math.min(12, 2*Math.log2( (counts.get(id)||1) ));
        const r = nodeRadius(n) + bump;
        ctx.fillText(name, n.x, n.y + r + 10/Math.sqrt(p.scale));
      }
    }

    ctx.restore();
    updateLinkLegend();
  }


  // ---------- Visuals ----------
  const NODE_BASE_SIZE = { [TYPES.PERSON]:10, [TYPES.GROUP]:20, [TYPES.COMPANY]:22 };

  // Distances cibles (≈ image 4)
  const LINK_TARGET = {
    [KINDS.PATRON]:  80,
    [KINDS.HAUT_GRADE]: 150,
    [KINDS.EMPLOYE]: 220,
    [KINDS.MEMBRE]: 220,
    [KINDS.AFFILIATION]: 300,

    [KINDS.AMOUR]: 90,
    [KINDS.AMI]: 120,
    [KINDS.FAMILLE]: 140,
    [KINDS.PARTENAIRE]: 150,
  };

  // Légende visuelle pour les types de liens (emoji + couleur)
  const LINK_EMOJI = {
    [KINDS.PARTENAIRE]: "🤝🏻",
    [KINDS.AMI]: "💛",
    [KINDS.FAMILLE]: "💙",
    [KINDS.AMOUR]: "❤️",
    [KINDS.EMPLOYE]: "🔗",
    [KINDS.MEMBRE]: "🔗",
    [KINDS.HAUT_GRADE]: "👔",
    [KINDS.PATRON]: "📜",
    [KINDS.AFFILIATION]: "🏢",
  };
  const LINK_COLOR = {
    [KINDS.PARTENAIRE]: "#caa07a",
    [KINDS.AMI]: "#ffd700",
    [KINDS.FAMILLE]: "#1e90ff",
    [KINDS.AMOUR]: "#ff3b30",
    [KINDS.EMPLOYE]: "#a0a0a0",
    [KINDS.MEMBRE]: "#a0a0a0",
    [KINDS.HAUT_GRADE]: "#3b82f6",
    [KINDS.PATRON]: "#c19a6b",
    [KINDS.AFFILIATION]: "#7f8c8d",
  };


  // Intensités des ressorts
  
const LINK_STRENGTH = {
    [KINDS.PATRON]:  1.70,
    [KINDS.HAUT_GRADE]: 1.50,
    [KINDS.EMPLOYE]: 1.40,
    [KINDS.MEMBRE]:  1.40,
    [KINDS.AFFILIATION]: 1.40,

    // Personne ↔ personne (plus rigide pour éviter les élastiques)
    [KINDS.AMOUR]: 1.00,
    [KINDS.AMI]: 0.80,
    [KINDS.FAMILLE]: 0.90,
    [KINDS.PARTENAIRE]: 0.85,
  };


  
// --- Réglages "sphère" globale & orbites ---
const SPHERE_BOUNDARY_K = 0.008;
const DISCONNECTED_BOOST = 1.7;
const ORBIT_RADII = { 2: 110, 3: 170, 4: 230, 5: 310 };
const ORBIT_K = 0.12;

// --- Périmètres de sécurité autour des organisations ---
// Rayon dynamique = f(taille du point, nombre de liens directs)
// (Réglés ici pour être environ 2× plus petits que la première version)
const SEC_PERIM_MAX_RADIUS    = 700;
const SEC_PERIM_RADIUS_FACTOR = 0.5;   // avant: 2.0
const SEC_PERIM_BASE_MULT     = 0.25;   // avant: 1.0
const SEC_PERIM_REPULSION_K   = 0.25;  // intensité du champ de force entre bulles
const SEC_EMP_BLOCK_K         = 0.55;  // force qui ramène les employés dans leur périmètre

const ORG_BUBBLE_MARGIN = 60;

  // Champs et constantes globales
  const GLOBAL_REPULSION = 3800;        // espace global plus grand
  const ORG_ORG_MULT    = 1.8;          // repoussement org↔org plus fort
  const ORG_BUFFER_BASE = 220;          // rayon d'exclusion autour des orgs
  const ORG_BUFFER_SCALE= 16.0;         // + rayon si point plus gros
  const ORG_BUFFER_FORCE= 0.09;         // force de repoussement des non-liés
  const RING_K          = 0.0065;       // organisation en cercle (global)
  const CENTER_PULL     = 0.0015;       // centre doux pour éviter la dérive
  const FRICTION        = 0.86;
  const MAX_SPEED       = 3.2;
  const PIN_K           = 0.08;         // ancrage doux après déplacement

  // ---------- Utilities ----------
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function uid(){ return state.nextId++; }
  function hslToHex(h,s,l){ s/=100; l/=100;
    const k=n=>(n+h/30)%12, f=n=>l-s*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
    const th=x=>Math.round(255*x).toString(16).padStart(2,'0');
    return `#${th(f(0))}${th(f(8))}${th(f(4))}`;
  }
  function randomPastel(){ return hslToHex(Math.floor(Math.random()*360),60,65); }

  function hexToRgb(hex){
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex||'#ffffff');
    if(!m) return {r:255,g:255,b:255};
    return { r:parseInt(m[1],16), g:parseInt(m[2],16), b:parseInt(m[3],16) };
  }
  function rgbToHex(r,g,b){
    const to = v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');
    return '#'+to(r)+to(g)+to(b);
  }

  // ---------- Data helpers ----------
  // Label helper for link kinds
  function kindToLabel(k){
    switch(k){
      case KINDS.PATRON: return 'Patron';
      case KINDS.HAUT_GRADE: return 'Haut gradé';
      case KINDS.EMPLOYE: return 'Employé';
      case KINDS.MEMBRE: return 'Membre';
      case KINDS.AFFILIATION: return 'Affiliation';
      case KINDS.AMOUR: return 'Amour';
      case KINDS.AMI: return 'Ami';
      case KINDS.FAMILLE: return 'Famille';
      case KINDS.PARTENAIRE: return 'Partenaire';
      default: return k || '';
    }
  }

  function ensureNode(type,name,init={}){
    let n = state.nodes.find(x=>x.name===name);
    if(!n){
      n = { id:uid(), name, type, x: (Math.random()-0.5)*600, y:(Math.random()-0.5)*600, vx:0, vy:0, color:(type===TYPES.PERSON? '#ffffff' : (init.color||randomPastel())) , _justCreated:true };
      state.nodes.push(n);
    }
    return n;
  }
  function nodeById(id){ return state.nodes.find(n=>n.id===id); }
  function propagateOrgNumsFromPatrons(){
    for(const l of state.links){
      if(l.kind!==KINDS.PATRON) continue;
      const A=nodeById(l.source), B=nodeById(l.target);
      if(!A||!B) continue;
      let person = isPerson(A)?A : (isPerson(B)?B:null);
      let org = (isCompany(A)||isGroup(A))?A : ((isCompany(B)||isGroup(B))?B:null);
      if(person && org){
        if(person.num!=null && person.num!=='') org.num = person.num;
      }
    }
  }

  function addLink(a,b,kind){
    const A = (typeof a==='object')?a:nodeById(a);
    const B = (typeof b==='object')?b:nodeById(b);
    if(!A || !B) return;
    const s = A.id, t = B.id;
    if(s===t) return;
    // Enforce allowed kinds based on node types
    if(!isLinkAllowedByTypes(A.type, B.type, kind)) return;
    if(!state.links.find(l=> (l.source===s && l.target===t) || (l.source===t && l.target===s) )){
      state.links.push({source:s,target:t,kind});
      if(kind===KINDS.PATRON){ propagateOrgNumsFromPatrons(); draw(); }
    }
  }
  
  // Degré de connectivité (nombre de liens directs)
  function degree(id){ return state.links.reduce((c,l)=>c+((l.source===id||l.target===id)?1:0),0); }

  // Taille des points = f(nb de liens directs), par type, avec bornes
  const DEG_SCALE = { [TYPES.PERSON]:3.5, [TYPES.GROUP]:5.0, [TYPES.COMPANY]:5.5 };
  const R_MIN     = { [TYPES.PERSON]:NODE_BASE_SIZE[TYPES.PERSON], [TYPES.GROUP]:NODE_BASE_SIZE[TYPES.GROUP], [TYPES.COMPANY]:NODE_BASE_SIZE[TYPES.COMPANY] };
  const R_MAX     = { [TYPES.PERSON]:48, [TYPES.GROUP]:72, [TYPES.COMPANY]:80 };
  
  // Cache pour degree: à revalider si les liens changent
  const degreeCache = new Map();
  let lastLinksLength = 0;
  
  function updateDegreeCache(){
    if(state.links.length !== lastLinksLength){
      degreeCache.clear();
      lastLinksLength = state.links.length;
      const counts = new Map();
      for(const l of state.links){
        counts.set(l.source, (counts.get(l.source)||0)+1);
        counts.set(l.target, (counts.get(l.target)||0)+1);
      }
      for(const n of state.nodes){
        degreeCache.set(n.id, counts.get(n.id) || 0);
      }
    }
    return degreeCache;
  }
  
  function nodeDegree(id){
    if(state.performance) updateDegreeCache(); // update only if needed
    return degreeCache.get(id) || degree(id); // fallback for newly created nodes before cache update
  }
  
  function nodeRadius(n){
    const base = (NODE_BASE_SIZE[n.type]||10);
    const d = nodeDegree(n.id);
    const r = base + (DEG_SCALE[n.type]||4.0) * d; // linéaire: +k px par lien direct
    const rmin = (R_MIN[n.type]||base);
    const rmax = (R_MAX[n.type]||base+60);
    return Math.max(rmin, Math.min(rmax, r));
  }
  function nodeMass(n){ return 1 + Math.pow(nodeRadius(n),0.9); }

  
  // ----- Graph helpers -----
  function buildAdjacency(){
    const adj = new Map();
    for(const l of state.links){
      if(!adj.has(l.source)) adj.set(l.source, []);
      if(!adj.has(l.target)) adj.set(l.target, []);
      adj.get(l.source).push({id:l.target, kind:l.kind});
      adj.get(l.target).push({id:l.source, kind:l.kind});
    }
    return adj;
  }

  // ----- Stretch-limit helpers -----
  // Build a map of initial link distances for the connected component of rootId.
  function __linkKey(aId,bId){
    const a = String(aId), b = String(bId);
    return (a<b? a+'-'+b : b+'-'+a);
  }
  function snapshotInitialDistances(rootId){
    const adj = buildAdjacency();
    const byId = new Map(); for(const n of state.nodes) byId.set(n.id, n);
    const dist0 = new Map();
    const q = [rootId];
    const seen = new Set([rootId]);
    while(q.length){
      const uId = q.shift();
      const neigh = adj.get(uId)||[];
      for(const e of neigh){
        const vId = e.id;
        const k = __linkKey(uId,vId);
        if(!dist0.has(k)){
          const u = byId.get(uId), v = byId.get(vId);
          if(u && v){
            const dx = v.x - u.x, dy = v.y - u.y;
            const d = Math.hypot(dx,dy) || 0.0001;
            dist0.set(k, d);
          }
        }
        if(!seen.has(vId)){ seen.add(vId); q.push(vId); }
      }
    }
    return dist0;
  }

  // Apply chain stretch constraints:
  // - If neighbor is smaller than current, it may stretch to +10% of initial distance.
  // - If neighbor is larger/equal, it may stretch to +20% of initial distance.
  // - Nodes may always move closer than initial distances.
  // Propagates breadth-first so each node "pulls" the next ones.
  function applyStretchConstraints(rootId, dist0){
    if(!dist0) return;
    const adj = buildAdjacency();
    const byId = new Map(); for(const n of state.nodes) byId.set(n.id, n);
    const q = [rootId];
    const parent = new Map(); parent.set(rootId, null);
    const visitedLinks = new Set();

    while(q.length){
      const uId = q.shift();
      const u = byId.get(uId);
      if(!u) continue;
      const neigh = adj.get(uId)||[];
      for(const e of neigh){
        const vId = e.id;
        if(parent.get(uId) === vId) continue; // avoid going back immediately
        const k = __linkKey(uId, vId);
        if(visitedLinks.has(k)) continue;
        visitedLinks.add(k);

        const v = byId.get(vId);
        if(!v) continue;

        const d0 = dist0.get(k);
        if(!d0 || d0<=0) { if(!parent.has(vId)){ parent.set(vId,uId); q.push(vId);} continue; }

        // Allowed max stretch relative to the "puller" u
        const ru = nodeRadius(u), rv = nodeRadius(v);
        const maxFactor = (rv < ru) ? 1.10 : 1.20;
        const maxDist = d0 * maxFactor;

        let dx = v.x - u.x, dy = v.y - u.y;
        let d = Math.hypot(dx,dy) || 0.0001;

        if(d > maxDist){
          const ux = dx / d, uy = dy / d;
          const targetX = u.x + ux * maxDist;
          const targetY = u.y + uy * maxDist;

          // Move only the neighbor if it's not fixed; otherwise if neighbor is fixed, try moving u slightly back
          if(!v.fixed){
            v.x = targetX;
            v.y = targetY;
            v.vx *= 0.4; v.vy *= 0.4;
          }else if(!u.fixed){
            u.x = targetX - ux * (d - maxDist);
            u.y = targetY - uy * (d - maxDist);
            u.vx *= 0.4; u.vy *= 0.4;
          }
        }

        if(!parent.has(vId)){
          parent.set(vId, uId);
          q.push(vId);
        }
      }
    }
  }


  
function reachableSet(rootId){
  // Returns the set of nodes to display when focusing on a node:
  // - all nodes at distance <= 2 from rootId (two generations)
  // - PLUS: if a GROUP or COMPANY is on the 2nd ring, include all its EMPLOYE/MEMBRE neighbors.
  const adj = buildAdjacency();
  const byId = new Map(state.nodes.map(n=>[n.id,n]));

  const seen = new Set();
  const depth = new Map(); // nodeId -> hop distance from root
  const q = [];
  seen.add(rootId);
  depth.set(rootId, 0);
  q.push(rootId);

  while(q.length){
    const u = q.shift();
    const du = depth.get(u) || 0;
    if(du >= 2) continue; // stop at 2 hops

    for(const e of (adj.get(u)||[])){
      const v = e.id;
      if(!seen.has(v)){
        seen.add(v);
        depth.set(v, du+1);
        q.push(v);
      }
    }
  }

  // Expand orgs on the frontier (distance === 2): include all their EMPLOYE/MEMBRE persons
  for(const id of Array.from(seen)){
    const d = depth.get(id);
    if(d !== 2) continue;
    const n = byId.get(id);
    if(!n) continue;
    const isOrg = (n.type === TYPES.GROUP || n.type === TYPES.COMPANY);
    if(!isOrg) continue;
    for(const e of (adj.get(id)||[])){
      if(e.kind===KINDS.EMPLOYE || e.kind===KINDS.MEMBRE){
        seen.add(e.id);
      }
    }
  }

  return seen;
}

  function centerRingsLayout(rootId){
    const root = nodeById(rootId); if(!root) return;
    const adj = buildAdjacency();
    const dist = new Map(); const layers = new Map();
    const q = [rootId]; dist.set(rootId, 0);
    while(q.length){
      const u = q.shift(); const d = dist.get(u);
      if(!layers.has(d)) layers.set(d, []);
      layers.get(d).push(u);
      for(const e of (adj.get(u)||[])){
        if(!dist.has(e.id)){ dist.set(e.id, d+1); q.push(e.id); }
      }
    }
    const R0=30, STEP=160;
    const positions = new Map();
    positions.set(rootId, {x:0,y:0});
    const sorted = Array.from(layers.entries()).sort((a,b)=>a[0]-b[0]);
    for(const [d, ids] of sorted){
      if(d===0) continue;
      const r = R0 + d*STEP;
      const n = ids.length;
      for(let i=0;i<n;i++){
        const a = (2*Math.PI)*(i/n);
        positions.set(ids[i], {x:r*Math.cos(a), y:r*Math.sin(a)});
      }
    }
    for(const n of state.nodes){
      const pos = positions.get(n.id);
      if(pos){
        n.x = pos.x; n.y = pos.y; n.vx=0; n.vy=0; n.pin={x:pos.x,y:pos.y};
      }else{
        const far = R0 + (sorted.length+2)*STEP;
        const a = Math.random()*2*Math.PI;
        const x = far*Math.cos(a), y = far*Math.sin(a);
        n.x=x; n.y=y; n.vx=0; n.vy=0; n.pin={x,y};
      }
    }
    state.view.x=0; state.view.y=0;
  }
// ---------- Canvas & UI ----------
  const canvas=document.getElementById('graph');
  const ctx=canvas.getContext('2d');
  function resize(){ const r=window.devicePixelRatio||1; canvas.width=canvas.clientWidth*r; canvas.height=canvas.clientHeight*r; ctx.setTransform(r,0,0,r,0,0); draw(); }
  window.addEventListener('resize', resize);
  resize();

  const ui={
    listCompanies:document.getElementById('listCompanies'),
    listGroups:document.getElementById('listGroups'),
    listPeople:document.getElementById('listPeople'),
    searchInput:document.getElementById('searchInput'),
    searchResult:document.getElementById('searchResult'),
    btnRelayout:document.getElementById('btnRelayout'),
    btnExport:document.getElementById('btnExport'),
    fileImport:document.getElementById('fileImport'),
    fileMerge:document.getElementById('fileMerge'),
    btnClearAll:document.getElementById('btnClearAll'),
    createPerson:document.getElementById('createPerson'),
    createGroup:document.getElementById('createGroup'),
    createCompany:document.getElementById('createCompany'),
    editorTitle:document.getElementById('editorTitle'),
    editorBody:document.getElementById('editorBody'),
    relationsTop:document.getElementById('relationsTop'),
    relationsChips:document.getElementById('relationsChips'),
    chkLabels:document.getElementById('chkLabels'),
    chkLinkTypes:document.getElementById('chkLinkTypes'),
    chkPerf:document.getElementById('chkPerf'),
    linkLegend:document.getElementById('linkLegend'),
      btnToggleSim:document.getElementById('btnToggleSim'),
};

  // ---------- Lists ----------
  function fillList(el, arr){
    if(!el) return;
    el.innerHTML='';
    for(const n of arr.sort((a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'}))){
      const li=document.createElement('li');
      const item=document.createElement('div');
      item.className='list-item';
      item.innerHTML=`<span class="bullet" style="background:${n.color}"></span>${n.name}`;
      item.addEventListener('click',()=>{ selectNode(n.id); zoomToNode(n.id, 1.6); });
      li.appendChild(item);
      el.appendChild(li);
    }
  }
  function refreshLists(){
    refreshDatalists();
    updateDegreeCache(); // Keep cache fresh when lists are refreshed

    fillList(ui.listCompanies, state.nodes.filter(isCompany));
    fillList(ui.listGroups, state.nodes.filter(isGroup));
    fillList(ui.listPeople, state.nodes.filter(isPerson));
  }

  
  // ---------- Datalists ----------
  function refreshDatalists(){
    const dlPeople = document.getElementById('datalist-people');
    const dlGroups = document.getElementById('datalist-groups');
    const dlCompanies = document.getElementById('datalist-companies');
    if(dlPeople){
      dlPeople.innerHTML = state.nodes.filter(isPerson).sort((a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'})).map(n=>`<option value="${escapeHtml(n.name)}"></option>`).join('');
    }
    if(dlGroups){
      dlGroups.innerHTML = state.nodes.filter(isGroup).sort((a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'})).map(n=>`<option value="${escapeHtml(n.name)}"></option>`).join('');
    }
    if(dlCompanies){
      dlCompanies.innerHTML = state.nodes.filter(isCompany).sort((a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'})).map(n=>`<option value="${escapeHtml(n.name)}"></option>`).join('');
    }
  }
// ---------- Editor ----------
  

  // ---- Themed custom dropdown wrapper (keeps native <select> in sync) ----
  function upgradeSelect(el){
    if(!el || el._upgraded) return;
    el._upgraded = true;
    el.classList.add('native-select');
    const wrap = document.createElement('div');
    wrap.className = 'select-wrap';
    const display = document.createElement('button');
    display.type = 'button';
    display.className = 'select-display';
    const label = document.createElement('span'); label.className = 'select-label';
    const arrow = document.createElement('span'); arrow.className = 'select-arrow'; arrow.textContent = '▾';
    display.append(label, arrow);
    const list = document.createElement('div'); list.className = 'select-list';

    const parent = el.parentNode;
    parent.insertBefore(wrap, el);
    wrap.appendChild(el);
    wrap.appendChild(display);
    wrap.appendChild(list);

    function renderLabel(){
      const chosen = el.options[el.selectedIndex];
      label.textContent = chosen ? chosen.textContent : '';
    }

    function rebuild(){
      list.innerHTML = '';
      Array.from(el.options).forEach(opt => {
        const item = document.createElement('div');
        item.className = 'select-option';
        item.textContent = opt.textContent;
        item.setAttribute('data-value', opt.value);
        if(opt.value === el.value){ item.setAttribute('aria-selected','true'); }
        item.addEventListener('click', ()=>{
          el.value = opt.value;
          el.dispatchEvent(new Event('change', {bubbles:true}));
          wrap.classList.remove('open');
          renderLabel();
          rebuild();
        });
        list.appendChild(item);
      });
      renderLabel();
    }

    display.addEventListener('click', (e)=>{
      e.stopPropagation();
      wrap.classList.toggle('open');
    });
    document.addEventListener('click', ()=> wrap.classList.remove('open'));

    // Observe option list changes and rebuild
    const mo = new MutationObserver(()=> rebuild());
    mo.observe(el, {childList:true, subtree:false});

    rebuild();
  }
function renderEditor(){
    const id=state.selection;
    const body=ui.editorBody;
    const title=ui.editorTitle;
    if(!body||!title) return;
    if(!id){
      title.textContent='Aucune sélection';
      body.classList.add('muted');
      body.innerHTML='Sélectionnez un point ou créez une fiche pour éditer ici.';
      return;
    }
    const n=nodeById(id);
    title.textContent='Sélection · '+(n?.name||'');
    if(!n){ body.classList.add('muted'); body.innerHTML='Sélection invalide.'; return; }
    body.classList.remove('muted');

    const typeOptions = [
      {v:TYPES.PERSON,  t:'Personne'},
      {v:TYPES.GROUP,   t:'Groupuscule'},
      {v:TYPES.COMPANY, t:'Entreprise'},
    ];

    // UI skeleton
    body.innerHTML=`
      <div class="row">
        <label>Nom</label>
        <input id="edName" type="text" class="grow" value="${escapeHtml(n.name)}"/>
      </div>
      <div class="row">
        <label>Type</label>
        <select id="edType">
          ${typeOptions.map(o=>`<option value="${o.v}" ${o.v===n.type?'selected':''}>${o.t}</option>`).join('')}
        </select>
        <input id="edColor" type="color" value="${toColorInput(n.color)}"/>
        <span style="margin:0 8px;">num</span>
        <input id="edNum" type="text" value="${(n.num??'555')}" placeholder="num" style="width:150px; margin-left:0;" />
        
      </div>
      
      <div class="row">
        <label>Fusionner</label>
        <div class="hstack">
          <input id="mergeInput" list="datalist-merge" class="grow" placeholder="Nom d’un point du même type…"/>
          <button id="btnMerge">Fusionner</button>
        </div>
        <datalist id="datalist-merge"></datalist>
      </div>

      
      <div class="row hstack">
        <button id="btnFocusLinks">Afficher lien</button>
        <button id="btnCenterTree">Mettre au centre</button>
        <button id="btnDelete" class="danger">Supprimer</button>
      </div>


      
      <div class="row collapsible-header" data-target="linksCreate">
        <div class="collapsible-inner">
          <span class="collapsible-title">Créer un lien</span>
          <span class="collapsible-line"></span>
          <span class="collapsible-arrow"></span>
        </div>
      </div>

      <div id="linksCreate" class="collapsible-content">
        <div class="row">
          <div class="grow">
            <div><em>Entreprise</em></div>
            <div class="hstack">
              <input id="inCompany" list="datalist-companies" placeholder="Nom d’entreprise…"/>
              <select id="kindCompany"></select>
              <button id="btnAddCompany">Valider</button>
            </div>
          </div>
        </div>

        <div class="row">
          <div class="grow">
            <div><em>Groupuscule</em></div>
            <div class="hstack">
              <input id="inGroup" list="datalist-groups" placeholder="Nom du groupuscule…"/>
              <select id="kindGroup"></select>
              <button id="btnAddGroup">Valider</button>
            </div>
          </div>
        </div>

        <div class="row">
          <div class="grow">
            <div><em>Personnel</em></div>
            <div class="hstack">
              <input id="inPerson" list="datalist-people" placeholder="Nom de la personne…"/>
              <select id="kindPerson"></select>
              <button id="btnAddPerson">Valider</button>
            </div>
          </div>
        </div>
      </div>

      <div class="row collapsible-header" data-target="linksAll">
        <div class="collapsible-inner">
          <span class="collapsible-title">Tous les liens</span>
          <span class="collapsible-line"></span>
          <span class="collapsible-arrow"></span>
        </div>
      </div>

      <div id="linksAll" class="collapsible-content">
        <div class="row"><strong>entreprise :</strong></div>
        <div id="chipsCompanies" class="chips"></div>
        <div class="row"><strong>groupuscule :</strong></div>
        <div id="chipsGroups" class="chips"></div>
        <div class="row"><strong>personnel :</strong></div>
        <div id="chipsPeople" class="chips"></div>
      </div>

      <div class="row collapsible-header" data-target="notesSection">
        <div class="collapsible-inner">
          <span class="collapsible-title">Notes</span>
          <span class="collapsible-line"></span>
          <span class="collapsible-arrow"></span>
        </div>
      </div>

      <div id="notesSection" class="collapsible-content">
        <div class="row">
          <div class="grow">
            <textarea id="edNotes" class="notes-textarea" placeholder="Notes libres pour ce point..."></textarea>
          </div>
        </div>
      </div>

    `;

    // Populate datalists
    refreshDatalists();

    // Populate kind selects with allowed kinds according to the target type
    const elKC = body.querySelector('#kindCompany');
    const elKG = body.querySelector('#kindGroup');
    const elKP = body.querySelector('#kindPerson');

    
function fillKinds(selectEl, allowedSet){
      // Determine priority order based on which select it is, and what is being edited
      // Defaults are kept for cases we didn't specify explicitly
      let order = [
        KINDS.PATRON, KINDS.HAUT_GRADE, KINDS.EMPLOYE, KINDS.MEMBRE, KINDS.AFFILIATION,
        KINDS.AMOUR, KINDS.AMI, KINDS.FAMILLE, KINDS.PARTENAIRE
      ];
      try {
        const selId = (selectEl && selectEl.id) ? selectEl.id : '';
        // When editing a person
        if(n && n.type===TYPES.PERSON){
          if(selId==='kindCompany'){ 
            // Company kind when editing a person
            order = [KINDS.EMPLOYE, KINDS.HAUT_GRADE, KINDS.PATRON, KINDS.AFFILIATION, KINDS.MEMBRE];
          }else if(selId==='kindGroup'){
            // Group kind when editing a person
            order = [KINDS.MEMBRE, KINDS.HAUT_GRADE, KINDS.PATRON, KINDS.AFFILIATION, KINDS.EMPLOYE];
          }else if(selId==='kindPerson'){
            // Person kind when editing a person
            order = [KINDS.PARTENAIRE, KINDS.AMI, KINDS.FAMILLE, KINDS.AMOUR];
          }
        }else if(n && selId==='kindPerson'){
          // Editing an organisation, selecting kind toward a person
          if(n.type===TYPES.COMPANY){
            order = [KINDS.EMPLOYE, KINDS.HAUT_GRADE, KINDS.PATRON, KINDS.AFFILIATION, KINDS.MEMBRE];
          }else if(n.type===TYPES.GROUP){
            order = [KINDS.MEMBRE, KINDS.HAUT_GRADE, KINDS.PATRON, KINDS.AFFILIATION, KINDS.EMPLOYE];
          }
        }
      } catch(e){ /* fallback to default order */ }
      
      const labelMap = {
        [KINDS.PATRON]:'Patron',
        [KINDS.HAUT_GRADE]:'Haut gradé',
        [KINDS.EMPLOYE]:'Employé',
        [KINDS.MEMBRE]:'Membre',
        [KINDS.AFFILIATION]:'Affiliation',
        [KINDS.AMOUR]:'Amour',
        [KINDS.AMI]:'Ami',
        [KINDS.FAMILLE]:'Famille',
        [KINDS.PARTENAIRE]:'Partenaire'
      };
      
      const opts = [];
      for(const k of order){
        if(allowedSet.has && allowedSet.has(k)){
          opts.push({v:k, t:labelMap[k] || k});
        }
      }
      // If nothing pushed (e.g., allowedSet has something not in our order), fall back to previous method
      if(opts.length===0 && allowedSet && allowedSet.forEach){
        allowedSet.forEach(k=>{
          if(labelMap[k]) opts.push({v:k, t:labelMap[k]});
        });
      }
      selectEl.innerHTML = opts.map(o=>`<option value="${o.v}">${o.t}</option>`).join('');
    }

    if(n.type===TYPES.PERSON){
      fillKinds(elKC, PERSON_ORG_KINDS);
      fillKinds(elKG, PERSON_ORG_KINDS);
      fillKinds(elKP, PERSON_PERSON_KINDS);
    // Upgrade dropdowns to themed component
    ;['#kindCompany','#kindGroup','#kindPerson','#edType'].forEach(sel=>{
      const el = body.querySelector(sel);
      if(el) upgradeSelect(el);
    });

    }else{
      // selected is an organisation
      fillKinds(elKC, ORG_ORG_KINDS);
      fillKinds(elKG, ORG_ORG_KINDS);
      fillKinds(elKP, PERSON_ORG_KINDS);
    }

    // Handlers: name, type, color, delete
    body.querySelector('#edName').addEventListener('input', e=>{
      n.name=e.target.value; refreshLists(); draw();
    });
    
    // Enforce person color policy in editor
    const elColor = body.querySelector('#edColor');
    function enforcePersonColor(){
      if(n.type===TYPES.PERSON){
        if(elColor){ elColor.disabled = true; elColor.value = '#ffffff'; }
        // color will be computed by applyPersonOrgColors; but default is white
        n.color = '#ffffff';
      }else{
        if(elColor){ elColor.disabled = false; }
      }
    }
    enforcePersonColor();
if(n.num==null){ n.num = '555'; }
    const edNumEl = body.querySelector('#edNum'); if(edNumEl){ if(!edNumEl.value) edNumEl.value = n.num; }
    body.querySelector('#edType').addEventListener('change', e=>{
      n.type=e.target.value; refreshLists(); enforcePersonColor(); draw();
    });
    body.querySelector('#edColor').addEventListener('input', e=>{
      if(n.type!==TYPES.PERSON){ n.color=e.target.value; } else { e.target.value = '#ffffff'; n.color = '#ffffff'; } draw();
    });
    
    
    body.querySelector('#edNum').addEventListener('input', e=>{
      n.num = e.target.value;
      if(n.type===TYPES.PERSON){
        propagateOrgNumsFromPatrons();
        draw();
      }
    });
    
    // Notes: bind textarea to node.notes and keep in JSON
    const edNotesEl = body.querySelector('#edNotes');
    if(edNotesEl){
      edNotesEl.value = (n.notes || '');
      edNotesEl.addEventListener('input', e=>{
        n.notes = e.target.value;
      });
    }

    // Collapsible sections (Créer un lien / Tous les liens / Notes)
    const collapsibleHeaders = body.querySelectorAll('.collapsible-header');
    collapsibleHeaders.forEach(header=>{
      const targetId = header.getAttribute('data-target');
      if(!targetId) return;
      const content = body.querySelector('#'+targetId);
      if(!content) return;
      const arrow = header.querySelector('.collapsible-arrow');
      // closed by default
      content.style.display = 'none';
      if(arrow) arrow.textContent = '\\/';
      header.addEventListener('click', ()=>{
        const isHidden = (content.style.display === 'none');
        content.style.display = isHidden ? '' : 'none';
        if(arrow) arrow.textContent = isHidden ? '/\\' : '\\/';
      });
    });

// Toggle component-only view (show only nodes reachable from selection)
    const btnFocus = body.querySelector('#btnFocusLinks');
    if(btnFocus){
      const active = (state.focusOnlyId===n.id);
      btnFocus.textContent = active ? 'Afficher tout' : 'Afficher lien';
      btnFocus.addEventListener('click', ()=>{
        const wasActive = (state.focusOnlyId===n.id);
        if(wasActive){
          // Désactiver le focus: tout revient à la normale
          state.focusOnlyId = null;
          unfreezeHiddenNodes();
          renderEditor(); startMotionSequence(true); draw(); // normal 5s flow
        }else{
          // Activer le focus sur ce nœud → courte stabilisation (2s)
          state.focusOnlyId = n.id;
          freezeHiddenNodes();
          renderEditor();
          __clearMotionTimers();
          __setMotion('cooldown');
          __motionTimers.push(setTimeout(()=>{ freezeAllAuto(); __setMotion('frozen'); }, 2000));
          draw();
        }
      });
    }
    // Center rings layout around selection
    
const btnCenter = body.querySelector('#btnCenterTree');
if(btnCenter){
  btnCenter.addEventListener('click', ()=>{
    // Toggle hard lock of the selected node at the world center
    if(state.centerLockId === n.id){
      const lock = nodeById(state.centerLockId);
      if(lock){ lock.fixed = false; lock.pin = null; }
      state.centerLockId = null;
      draw();
      return;
    }
    // unlock previous lock if any
    if(state.centerLockId){
      const prev = nodeById(state.centerLockId);
      if(prev){ prev.fixed = false; prev.pin = null; }
      state.centerLockId = null;
    }
    centerRingsLayout(n.id);
    const sel = nodeById(n.id);
    if(sel){
      sel.x = 0; sel.y = 0; sel.vx = 0; sel.vy = 0;
      sel.fixed = true;
      sel.pin = {x:0, y:0};
    }
    state.view.x = 0; state.view.y = 0;
    state.centerLockId = n.id;
    selectNode(n.id);
    startMotionSequence(true);
    draw();
  });
}

body.querySelector('#btnDelete').addEventListener('click', ()=>{
      state.links = state.links.filter(l=>l.source!==n.id && l.target!==n.id);
      state.nodes = state.nodes.filter(x=>x!==n);
      state.selection=null;
      refreshLists(); renderEditor(); startMotionSequence(true); draw();
    });

    // Add-link helpers
    function addLinkByInputs(inputSel, kindSel, targetType){
      const name = body.querySelector(inputSel).value.trim();
      const kind = body.querySelector(kindSel).value;
      if(!name) return;
      // find target by name (case-insensitive)
      let t = state.nodes.find(x=>x.name.toLowerCase()===name.toLowerCase());
      if(!t){ t = ensureNode(targetType, name); }
      if(!isLinkAllowedByTypes(n.type, t.type, kind)) return;
      addLink(n, t, kind);
      body.querySelector(inputSel).value='';
      propagateOrgNumsFromPatrons();
      renderEditor(); refreshLists(); draw();
    }
    body.querySelector('#btnAddCompany').addEventListener('click', ()=> addLinkByInputs('#inCompany','#kindCompany', TYPES.COMPANY));
    body.querySelector('#btnAddGroup').addEventListener('click',   ()=> addLinkByInputs('#inGroup','#kindGroup', TYPES.GROUP));
    body.querySelector('#btnAddPerson').addEventListener('click',  ()=> addLinkByInputs('#inPerson','#kindPerson', TYPES.PERSON));
    // Populate merge datalist with nodes of same type (excluding current)
    const dlMerge = body.querySelector('#datalist-merge');
    if(dlMerge){
      const sameType = state.nodes.filter(o=> o.type===n.type && o.id!==n.id)
        .sort((a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'}));
      dlMerge.innerHTML = sameType.map(o=>`<option value="${escapeHtml(o.name)}"></option>`).join('');
    }

    function mergeNodesKeepCurrentByName(nameValue){
      const name = (nameValue||'').toString().trim();
      if(!name){ alert('Choisissez un point à fusionner.'); return; }
      const norm = normalizeNameNoAccents(name);
      const candidates = state.nodes.filter(o=> o.type===n.type && o.id!==n.id && normalizeNameNoAccents(o.name)===norm);
      if(candidates.length===0){
        alert('Aucun point de même type avec ce nom.');
        return;
      }
      const other = candidates[0];
      if((n.num==null||n.num==='') && (other.num!=null && other.num!=='')) { n.num = other.num; }
      // Transférer tous ses liens vers la fiche courante, en évitant les auto-liens
      const linksToTransfer = state.links.filter(l=> l.source===other.id || l.target===other.id);
      for(const l of linksToTransfer){
        const otherSide = (l.source===other.id) ? l.target : l.source;
        if(otherSide===n.id) continue; // lien entre eux -> supprimé
        addLink(n.id, otherSide, l.kind);
      }
      // Supprimer tous les liens du noeud fusionné
      state.links = state.links.filter(l=> l.source!==other.id && l.target!==other.id);
      // Supprimer le noeud fusionné
      state.nodes = state.nodes.filter(x=> x.id!==other.id);
      if(state.selection===other.id) state.selection = n.id;
      if(state.focusOnlyId===other.id) state.focusOnlyId = null;
      if(state.centerLockId===other.id) state.centerLockId = n.id;
      // Rafraîchissement
      refreshLists();
      renderEditor();
      draw();
    }

    const btnMerge = body.querySelector('#btnMerge');
    const inMerge  = body.querySelector('#mergeInput');
    if(btnMerge){
      btnMerge.addEventListener('click', ()=> mergeNodesKeepCurrentByName(inMerge.value));
    }
    if(inMerge){
      inMerge.addEventListener('keydown', (e)=>{
        if(e.key==='Enter'){ e.preventDefault(); mergeNodesKeepCurrentByName(inMerge.value); }
      });
    }


    // Build chips grouped by target category
    function renderChips(){
      const links = state.links.filter(l=>l.source===n.id||l.target===n.id);
      const buckets = { company:[], group:[], person:[] };
      for(const l of links){
        const otherId = (l.source===n.id)?l.target:l.source;
        const o = nodeById(otherId); if(!o) continue;
        if(isCompany(o)) buckets.company.push({node:o, link:l});
        else if(isGroup(o)) buckets.group.push({node:o, link:l});
        else buckets.person.push({node:o, link:l});
      }
      function fill(containerId, arr, label){
        const cont = body.querySelector(containerId);
        cont.previousElementSibling?.remove; // no-op, just ensure order
        if(arr.length===0){ cont.innerHTML = ''; return; }
        cont.innerHTML = arr.sort((a,b)=>a.node.name.localeCompare(b.node.name,'fr',{sensitivity:'base'})).map(({node,link})=>{
          return `<span class="chip" data-id="${node.id}" data-ls="${link.source}" data-lt="${link.target}" title="${escapeHtml(node.name)}">
            ${escapeHtml(node.name)} <em>(${kindToLabel(link.kind)})</em> <span class="x" title="Supprimer">×</span>
          </span>`;
        }).join('');
        // interactions: click selects; click on .x deletes
        for(const el of cont.querySelectorAll('.chip')){
          el.addEventListener('click', (ev)=>{
            if(ev.target && (ev.target.classList && ev.target.classList.contains('x'))) return; // handled below
            const nid = parseInt(el.getAttribute('data-id'),10);
            selectNode(nid);
          });
          const x = el.querySelector('.x');
          x.addEventListener('click', (ev)=>{
            ev.stopPropagation();
            const ls = parseInt(el.getAttribute('data-ls'),10);
            const lt = parseInt(el.getAttribute('data-lt'),10);
            state.links = state.links.filter(L=> !(L.source===ls && L.target===lt) && !(L.source===lt && L.target===ls));
            propagateOrgNumsFromPatrons();
      renderEditor(); refreshLists(); draw();
          });
        }
      }
      fill('#chipsCompanies', buckets.company, 'Entreprises');
      fill('#chipsGroups', buckets.group, 'Groupuscules');
      fill('#chipsPeople', buckets.person, 'Personnel');
    }
    renderChips();
}

  function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));}
  function toColorInput(hex){
    // Normalize 3/6-digit hex
    if(/^#[0-9a-f]{3}$/i.test(hex)){ return '#'+hex.slice(1).split('').map(c=>c+c).join(''); }
    return hex;
  }
  function selectNode(id){ state.selection=id||null; renderEditor(); }

  // ---------- Search ----------
  if(ui.searchInput && ui.searchResult){
    ui.searchInput.addEventListener('input',()=>{
      const q=ui.searchInput.value.trim().toLowerCase();
      if(!q){ ui.searchResult.textContent=''; return; }
      const found = state.nodes.filter(n=>n.name.toLowerCase().includes(q));
      ui.searchResult.innerHTML = found.map(n=>`<span class="search-hit" data-id="${n.id}">${escapeHtml(n.name)}</span>`).join(' · ');
      for(const el of ui.searchResult.querySelectorAll('.search-hit')){
        el.addEventListener('click', (e)=>{
          const id = +e.currentTarget.getAttribute('data-id');
          selectNode(id);
          if(typeof zoomToNode==='function'){ zoomToNode(id, 1.6); }
        });
      }
    });
  }

  // ---------- Physics ----------
  const physics={ alpha:1 };
// === PERF HELPERS (2025-11-05) ===
// Détection de lag + compensation vitesse
const __lag = {
  lastTs: null,
  avgDt: 16.7,        // ms
  smooth: 0.10,       // lissage EWMA
  dtTarget: 16.7,     // 60 FPS
  timeScale: 1.0,     // multiplicateur dt utilisé dans physics.step
  fps(){ return 1000/this.avgDt; }
};

function __updateLag(ts){
  if(__lag.lastTs==null){ __lag.lastTs = ts; return; }
  const dt = Math.max(1, ts - __lag.lastTs);
  __lag.lastTs = ts;
  __lag.avgDt = __lag.avgDt*(1-__lag.smooth) + dt*__lag.smooth;
  // Si on rame (< 55 fps), on accélère proportionnellement (borné 3×)
  const scale = Math.min(3.0, Math.max(0.5, __lag.dtTarget / __lag.avgDt));
  __lag.timeScale = scale;
  // En parallèle, on augmente aussi la vitesse max pour éviter le plafonnage
  physics.motion.maxSpeedMul = Math.max(1, scale);
}

// Bords visibles en coordonnées monde (avec marge en px monde)
function getVisibleWorldBounds(margin=120){
  const p = state.view;
  const w = canvas.width/(window.devicePixelRatio||1);
  const h = canvas.height/(window.devicePixelRatio||1);
  const halfW = (w/2)/p.scale, halfH = (h/2)/p.scale;
  const cx = -p.x/p.scale, cy = -p.y/p.scale;
  return {
    minX: cx - halfW - margin,
    maxX: cx + halfW + margin,
    minY: cy - halfH - margin,
    maxY: cy + halfH + margin
  };
}

function __isNodeInBounds(n, bounds){
  if(!n) return false;
  const r = (typeof nodeRadius==='function') ? nodeRadius(n) : 10;
  return n.x + r >= bounds.minX && n.x - r <= bounds.maxX &&
         n.y + r >= bounds.minY && n.y - r <= bounds.maxY;
}

  // ---------- Motion controller (burst → normal → cooldown → freeze) ----------
  physics.motion = { mode:'normal', dtMul:1, friction:0.88, maxSpeedMul:1 };
  let __motionTimers = [];

  // Flags for toggling optional force fields ("réfraction" etc.)
  physics.flags = { refractionEnabled: true };


  function __clearMotionTimers(){
    for(const id of __motionTimers){ try{ clearTimeout(id); }catch(e){} }
    __motionTimers = [];
  }
  function __setMotion(mode){
    physics.motion.mode = mode;
    // Toggle "refraction" fields depending on mode
    if(physics.flags){
      if(mode==='burst'){ physics.flags.refractionEnabled = false; }
      else if(mode==='normal' || mode==='cooldown' || mode==='frozen'){ physics.flags.refractionEnabled = true; }
    }
    if(mode==='burst'){
      physics.motion.dtMul = 3;
      physics.motion.friction = 0.95;
      physics.motion.maxSpeedMul = 3;    // allow higher speed cap
    }else if(mode==='normal'){
      physics.motion.dtMul = 1;
      physics.motion.friction = 0.88;
      physics.motion.maxSpeedMul = 1;
    }else if(mode==='cooldown'){
      physics.motion.dtMul = 1;
      physics.motion.friction = 0.72;      // stronger damping to settle
      physics.motion.maxSpeedMul = 0.9;
    }else if(mode==='frozen'){
      physics.motion.dtMul = 1;
      physics.motion.friction = 0.72;
      physics.motion.maxSpeedMul = 0.1;
    }
  }

  function unfreezeAllAuto(){
    for(const n of state.nodes){
      if(n._autoFrozen){
        n.fixed = false;
        n.pin = null;
        delete n._autoFrozen;
      }
    }
  }
  function freezeAllAuto(){
    for(const n of state.nodes){
      if(!n.fixed){
        n._autoFrozen = true;
        n.fixed = true;
        n.pin = {x:n.x, y:n.y};
        n.vx = 0; n.vy = 0;
      }
    }
  }

  // Start a full motion sequence. If initialBurst==true: 2s burst, then normal until 5s, then cooldown and freeze.
  let __autoMotionGuard=false;
  function startMotionSequence(initialBurst=true){
    if(__autoMotionGuard || state.forceSimulation){ /*prevent auto sequence while forced*/ __clearMotionTimers(); __setMotion('normal'); return; }
    __clearMotionTimers();
    unfreezeAllAuto();
    if(initialBurst){
      // Durée du boost "burst" dépendante du nombre de points :
      // ex: ~0.4s pour 10 nœuds, ~2s pour 50, ~4s pour 100.
      const N = Math.max(1, state.nodes.length);
      const burstMs = Math.max(300, Math.min(5000, 40 * N)); // 0.04s * N, borné entre 0.3s et 5s
      const slowdownMs = 3000;                               // phase de stabilisation commune
      const totalMs = burstMs + slowdownMs;                  // durée totale avant gel auto

      __setMotion('burst');
      __motionTimers.push(setTimeout(()=>{
        __setMotion('normal');
        // Reset inertia/velocity once when turbo ends
        for(const n of state.nodes){ if(!n.fixed){ n.vx = 0; n.vy = 0; } }
      }, burstMs));
      // Progressive slowdown pendant la phase post-burst, jusqu'au gel
      const __t0 = performance.now();
      const __ramp = setInterval(()=>{
        const t = performance.now() - __t0;
        const p = Math.max(0, Math.min(1, t/slowdownMs));
        // Interpolate friction from 0.88 → 0.55 au fur et à mesure
        physics.motion.friction = 0.88 - (0.88-0.55)*p;
        if(t >= slowdownMs){ clearInterval(__ramp); }
      }, 120);
      __motionTimers.push(__ramp);
      __motionTimers.push(setTimeout(()=>{
        // Final settle and freeze à la fin de totalMs
        __setMotion('cooldown');
        for(const n of state.nodes){ if(!n.fixed){ n.vx = 0; n.vy = 0; } }
        freezeAllAuto(); __setMotion('frozen');
      }, totalMs));
    }else{
      // No burst: keep normal briefly, then cooldown & freeze
      __setMotion('normal');
      // Shorter ramp if no burst: 4s ramp then freeze at 5s
      const __t0b = performance.now();
      const __rampB = setInterval(()=>{
        const t = performance.now() - __t0b;
        const p = Math.max(0, Math.min(1, t/4000));
        physics.motion.friction = 0.88 - (0.88-0.60)*p;
        if(t >= 4000){ clearInterval(__rampB); }
      }, 120);
      __motionTimers.push(__rampB);
      __motionTimers.push(setTimeout(()=>{
        __setMotion('cooldown');
        for(const n of state.nodes){ if(!n.fixed){ n.vx = 0; n.vy = 0; } }
        freezeAllAuto(); __setMotion('frozen');
      }, 5000));}
  }

  function globalRingRadius(){ const N=Math.max(1,state.nodes.length); return 420 + 16*Math.sqrt(N); }

  
physics.step=function(dt=1){// === Filtrage des nœuds actifs (visibles & non figés) ===
    updateDegreeCache(); // Assurez-vous que le cache de degré est à jour
    const __bounds = getVisibleWorldBounds(160);
const activeNodes = [];
const activeSet = new Set();
const __burst = (physics.motion && physics.motion.mode === "burst");
// --- Performance-aware selection ---
if(state.performance===true){
  // If dragging a node: only the dragged node and those colliding with it
  if(typeof dragging==='object' && dragging && dragging.node){
    const d = dragging.node;
    const rD = Math.max(1, nodeRadius(d));
    activeNodes.push(d); activeSet.add(d.id);
    for(const n of state.nodes){
      if(n===d || n.fixed) continue;
      const rN = Math.max(1, nodeRadius(n));
      const dx=n.x-d.x, dy=n.y-d.y; const sum=rD+rN+16; // margin to catch near-collisions
      if(dx*dx+dy*dy <= sum*sum){ activeNodes.push(n); activeSet.add(n.id); }
    }
  }else{
    // No drag: only visible in viewport
    for(const n of state.nodes){
      if(n.fixed) continue;
      if(__burst || __isNodeInBounds(n, __bounds)){ activeNodes.push(n); activeSet.add(n.id); }
    }
  }
}else{
  // Performance OFF or burst mode: simulate all (even off-screen)
  for(const n of state.nodes){ 
    if(n.fixed) continue; 
    activeNodes.push(n); activeSet.add(n.id); 
  }
}

    // Si aucun nœud visible (zoom très loin par ex.), on ne calcule rien
    if(activeNodes.length===0){
      return;
    }
    const __visFocus = (state.focusOnlyId!=null) ? reachableSet(state.focusOnlyId) : null;

    function __isHiddenByFocus(node){
      return (__visFocus && node && !__visFocus.has(node.id));
    }

    // =========================
    // Physique v2.3 — répulsion ∝ taille + blocage employés (≤ R3)
    // =========================
    const DT = Math.max(0.25, Math.min(3.0, dt));
    const BASE_FRICTION = 0.88;
    const BASE_MAX_SPEED = 6.0;
    const FRICTION = (physics.motion && typeof physics.motion.friction==='number') ? physics.motion.friction : BASE_FRICTION;
    const MAX_SPEED = BASE_MAX_SPEED * ((physics.motion && physics.motion.maxSpeedMul) || 1);
    const NODE_MIN_GAP = 10.0;
    const COLLISION_PUSH = 0.33;
    // Répulsion dépendante des tailles (plus forte pour gros points)
    const REP_BASE  = 520;                 // base globale
    const REP_DECAY = 520; // doublé pour augmenter la portée du champ de répulsion                 // décroissance exponentielle avec la distance
    const REP_CUTOFF = 1040; // doublé pour que la répulsion agisse plus loin                // portée effective
    const REP_SIZE_POW = 1.15;             // exponent >1 pour accentuer l'effet de taille
    // Attractions
    const K_ATTR_DIRECT    = 0.16;
    const K_ATTR_INDIRECT  = 0.0;
const AFFIL_SEP_K        = 0.12; // force de séparation sécurité org↔org
const AFFIL_SAFE_PAD_BASE= 64;   // base de pagination/marge par org (px)
const AFFIL_PAD_SCALE    = 0.40; // marge additionnelle proportionnelle à la taille du point
const AFFIL_SAFE_GAP     = 16;   // espace entre les deux zones de sécurité (elles ne se touchent pas)
const AFFIL_LINK_SOFTNESS= 1.7;  // liens d'affiliation un peu plus rigides
const ORG_ORG_LINK_STIFFNESS    = 3.0;  // liens org↔org plus rigides
const ORG_PERSON_LINK_STIFFNESS = 2.4;  // liens personne↔org plus rigides
// PATCH 2025-11-15: liens patron/haut gradé plus souples et un peu plus longs
const ORG_HIGHROLE_STIFFNESS_MULT = 0.6;   // <1 = plus souple
const ORG_HIGHROLE_TARGET_MULT    = 1.3;   // >1 = distance de repos plus grande
const LINK_MAX_STRETCH_K        = 2.0;  // force de rappel pour la distance maximale des liens
    const K_ATTR_INDIRECT3 = 0.0;
    const ENABLE_INDIRECT_ATTR = false;
    const TARGET_LINK_DIST = 140;
    // Orbites locales (5 niveaux)
    const RING_RADIAL_K   = 0.12;
    const RING_TANG_K     = 0;
    const RING_ROOT_INERT = 0.12;
    const RING_MIN_SPACING = 14;
    // PATCH 2025-11-15: orbites patron/haut un peu plus souples que les autres
    const RING_RADIAL_MULT = {1:0.75, 2:0.85, 3:1.0, 4:1.0, 5:1.0};
    const ORBIT_PREF_K = 0;   // force tangentielle vers les liens
    const ORBIT_PREF_ROOT_INERT = 0.10; // inertie de l'org face à la préférence
    // Barrière employés/membres pour empêcher R3/R2/R1
    const EMP_BLOCK_K = 0.12;              // intensité de la poussée vers l'extérieur
    // Sphère globale
    const SPHERE_BASE     = 360;
    const SPHERE_PER_NODE = 26;
    // PATCH 2025-11-15: sphère plus large mais toujours contenue
    const K_SPHERE_OUT    = 0.0025;
    const K_SPHERE_WALL   = 0.020;
    const CENTER_K        = 0.0015;

    const isOrg = n => n.type===TYPES.COMPANY || n.type===TYPES.GROUP;

    // Adjacences + type
    const adjSet = new Map();
    const adjKind = new Map();
    for (const l of state.links){
      if(!adjSet.has(l.source)) adjSet.set(l.source, new Set());
      if(!adjSet.has(l.target)) adjSet.set(l.target, new Set());
      if(!adjKind.has(l.source)) adjKind.set(l.source, new Map());
      if(!adjKind.has(l.target)) adjKind.set(l.target, new Map());
      adjSet.get(l.source).add(l.target);
      adjSet.get(l.target).add(l.source);
      adjKind.get(l.source).set(l.target, l.kind);
      adjKind.get(l.target).set(l.source, l.kind);
    }
    const byId = new Map(); for(const n of state.nodes) byId.set(n.id, n);

    // Spawn doux
    for (const n of state.nodes){
      if(n._justCreated && (adjSet.get(n.id)?.size || 0) > 0){
        const parentId = Array.from(adjSet.get(n.id))[0];
        const parent = byId.get(parentId);
        if(parent){
          const ang = Math.random() * Math.PI * 2;
          const r0 = 140 + nodeRadius(parent) + nodeRadius(n)*0.5 + (Math.random()-0.5)*30;
          n.x = parent.x + Math.cos(ang) * r0;
          n.y = parent.y + Math.sin(ang) * r0;
          n.vx = 0; n.vy = 0;
        }
        n._justCreated = false;
      }
    }

    // Reach 1/2/3
    const reach1 = new Map(), reach2 = new Map(), reach3 = new Map();
    for(const n of state.nodes){
      const v1 = new Set(adjSet.get(n.id) || []);
      reach1.set(n.id, v1);
      const v2 = new Set();
      for(const x of v1){ for(const y of (adjSet.get(x)||[])){ if(y!==n.id && !v1.has(y)) v2.add(y); } }
      reach2.set(n.id, v2);
      const v3 = new Set();
      for(const x of v2){ for(const y of (adjSet.get(x)||[])){ if(y!==n.id && !v1.has(y) && !v2.has(y)) v3.add(y); } }
      reach3.set(n.id, v3);
    }

    // Sphère globale (calcul R cible)
    let visibleSet = null;
    if(state.focusOnlyId!=null && typeof reachableSet==='function'){
      visibleSet = reachableSet(state.focusOnlyId);
    }
    const visibleNodes = state.nodes.filter(n => !visibleSet || visibleSet.has(n.id));
    const Nvis = Math.max(visibleNodes.length, 1);
    const R_SPHERE = SPHERE_BASE + SPHERE_PER_NODE*Math.sqrt(Nvis);

    // Périmètres de sécurité dynamiques (entreprise/groupuscule)
    const securityRadius = new Map();
    const orgList = [];
    for(const n of state.nodes){
      if(isOrg(n)){
        // Utiliser la fonction nodeDegree optimisée pour le calcul de R
        const rawDeg = nodeDegree(n.id);
        const deg = Math.max(4, rawDeg); // PATCH 2025-11-15: orbites/périmètres comme si 4 connexions min
        const orgR = nodeRadius(n);
        // Rayon ≈ taille du point × (0.5 + 1.0×nb de liens directs, avec un minimum équivalent à 4 connexions), borné pour éviter les explosions
        let rSec = SEC_PERIM_BASE_MULT * orgR + SEC_PERIM_RADIUS_FACTOR * orgR * Math.max(1, deg);
        rSec = Math.min(SEC_PERIM_MAX_RADIUS, Math.max(orgR * 1.2, rSec));
        securityRadius.set(n.id, rSec);
        orgList.push(n);
      }
    }

    for(const n of state.nodes){ if(!n.vx) n.vx=0; if(!n.vy) n.vy=0; }

    // ===== Attraction liés/indirects =====
    
for(const l of state.links){
  const a=byId.get(l.source), b=byId.get(l.target); if(!a||!b) continue; 
  // Filtrage des nœuds actifs pour les liens (pour l'attraction)
  if(state.performance===true && (!activeSet.has(a.id) || !activeSet.has(b.id))) continue;
  if(__visFocus && (__isHiddenByFocus(a) || __isHiddenByFocus(b))) continue;
  const dx=b.x-a.x, dy=b.y-a.y; const dist=Math.hypot(dx,dy)||0.0001;
  const ux=dx/dist, uy=dy/dist;
  const mA=Math.max(1,nodeRadius(a)), mB=Math.max(1,nodeRadius(b));

  // Distance maximale des liens par rapport au périmètre de sécurité des organisations
  let maxDist = Infinity;
  if(isOrg(a)){
    const rA = securityRadius.get(a.id);
    if(rA && rA>0) maxDist = Math.min(maxDist, 2 * rA);
  }
  if(isOrg(b)){
    const rB = securityRadius.get(b.id);
    if(rB && rB>0) maxDist = Math.min(maxDist, 2 * rB);
  }
  if(maxDist < Infinity && dist > maxDist){
    const over = dist - maxDist;
    const fClamp = over * LINK_MAX_STRETCH_K;
    if(!a.fixed){ a.vx += ux * fClamp * DT; a.vy += uy * fClamp * DT; }
    if(!b.fixed){ b.vx -= ux * fClamp * DT; b.vy -= uy * fClamp * DT; }
  }

  const targetBase = TARGET_LINK_DIST + (nodeRadius(a)+nodeRadius(b))*0.15;
  let target = targetBase;

  // Orga↔Personne (patron/haut gradé) : distance de repos un peu plus grande
  const __isHighRoleOrgPerson = (
    ((isOrg(a) && isPerson(b)) || (isOrg(b) && isPerson(a))) &&
    (l.kind===KINDS.PATRON || l.kind===KINDS.HAUT_GRADE)
  );
  if(__isHighRoleOrgPerson){
    target *= ORG_HIGHROLE_TARGET_MULT;
  }

  // Affiliation org↔org : sécurité dépendante de la taille + lien élastique
  const __isOrgAff = (isOrg(a) && isOrg(b) && l.kind===KINDS.AFFILIATION);
  if(__isOrgAff){
    const ring5 = (node)=>{
      const orgR = nodeRadius(node);
      const margin = Math.max(14, orgR * 0.45);
      const spacing = Math.max(36, orgR * 0.65);
      return orgR + margin + spacing*4;
    };
    // Pagination/marge liée à la taille de chaque point
    const padA = AFFIL_SAFE_PAD_BASE + nodeRadius(a) * AFFIL_PAD_SCALE;
    const padB = AFFIL_SAFE_PAD_BASE + nodeRadius(b) * AFFIL_PAD_SCALE;
    const safeA = ring5(a) + padA;
    const safeB = ring5(b) + padB;

    // Seuil de non-chevauchement des zones (séparation stricte des périmètres)
    const threshold = safeA + safeB + AFFIL_SAFE_GAP;

    if(physics.flags && physics.flags.refractionEnabled){
// Répulsion "mur" si trop proche
    if(dist < threshold){
      const push = (threshold - dist) * AFFIL_SEP_K;
      if(!a.fixed){ a.vx += -ux * push * DT; a.vy += -uy * push * DT; }
      if(!b.fixed){ b.vx +=  ux * push * DT; b.vy +=  uy * push * DT; }
    }

    }// Cible dynamique, 2× plus longue par défaut, mais jamais < sécurité
    target = Math.max(targetBase * 2, threshold);
  }

  const delta = dist - target;

  // --- Contrainte visibilité: distance minimale entre personnes liées ---
  const MIN_PERSON_LINK_DIST = 100;
  if(isPerson(a) && isPerson(b)){
    const minD = MIN_PERSON_LINK_DIST;
    if(!__burst && dist < minD){
      const gap = (minD - dist);
      const push = gap * 0.35; // raideur modérée
      if(!a.fixed){ a.vx -= ux * push * DT; a.vy -= uy * push * DT; }
      if(!b.fixed){ b.vx += ux * push * DT; b.vy += uy * push * DT; }
    }
  }

  // Raideur des liens selon le type:
// - Orga↔Orga : plus rigide
// - Personne↔Orga : plus rigide
// - Personne↔Personne : valeur de base
  const isOrgA = isOrg(a), isOrgB = isOrg(b);
  const isPersonA = isPerson(a), isPersonB = isPerson(b);

  let __kScale = 1.0;
  if (isOrgA && isOrgB){
    __kScale *= ORG_ORG_LINK_STIFFNESS;
  } else if ((isOrgA && isPersonB) || (isOrgB && isPersonA)){
    __kScale *= ORG_PERSON_LINK_STIFFNESS;
    if(__isHighRoleOrgPerson){
      __kScale *= ORG_HIGHROLE_STIFFNESS_MULT;
    }
  }
  if (__isOrgAff){
    __kScale *= AFFIL_LINK_SOFTNESS;
  }

  const burstBoost = (physics.motion && physics.motion.mode === "burst") ? (function(){
  // Exponentiel plus fort par taille: tier ~= round(radius/10)
  const tierA = Math.max(1, Math.round(nodeRadius(a)/10));
  const tierB = Math.max(1, Math.round(nodeRadius(b)/10));
  const base = 1.35;               // base expo
  const scale = 2.2;               // échelle globale
  const bA = Math.round(scale * Math.pow(base, tierA));
  const bB = Math.round(scale * Math.pow(base, tierB));
  return (bA + bB) / 2;
})() : 1;
  const kEff = K_ATTR_DIRECT * __kScale * burstBoost;

  // Ne plus laisser les personnes pousser leur entreprise/groupuscule :
  // - si lien Orga↔Personne, seule la personne est affectée par le ressort
  if(isOrgA && isPersonB){
    if(!b.fixed){ b.vx += (-ux*delta*(kEff)/mB)*DT; b.vy += (-uy*delta*(kEff)/mB)*DT; }
  } else if(isOrgB && isPersonA){
    if(!a.fixed){ a.vx += (ux*delta*(kEff)/mA)*DT; a.vy += (uy*delta*(kEff)/mA)*DT; }
  } else {
    // Cas classique: les deux extrémités sont affectées
    if(!a.fixed){ a.vx += (ux*delta*(kEff)/mA)*DT; a.vy += (uy*delta*(kEff)/mA)*DT; }
    if(!b.fixed){ b.vx += (-ux*delta*(kEff)/mB)*DT; b.vy += (-uy*delta*(kEff)/mB)*DT; }
  }

  // PATCH 2025-11-15: traction hiérarchique gros→petit
  // 1) Pendant le burst, les affiliations Orga↔Orga rapprochent fortement les orga :
  //    le plus gros point tire le plus petit pour qu'ils se regroupent.
  if(__burst && __isOrgAff){
    const rA = nodeRadius(a), rB = nodeRadius(b);
    const big = (rA >= rB) ? a : b;
    const small = (big === a) ? b : a;
    const mSmall = Math.max(1, nodeRadius(small));
    const dxAff = big.x - small.x, dyAff = big.y - small.y;
    const distAff = Math.hypot(dxAff, dyAff) || 0.0001;
    const uxAff = dxAff / distAff, uyAff = dyAff / distAff;
    // Force de rapprochement très forte mais courte portée
    const AFFIL_BURST_PULL = 0.9; // à ajuster si nécessaire
    const pullAff = AFFIL_BURST_PULL * distAff;
    if(!small.fixed){
      small.vx += uxAff * pullAff * DT / mSmall;
      small.vy += uyAff * pullAff * DT / mSmall;
    }
  }

  // 2) Règle générale : chaque point tire les points plus petits qui lui sont reliés.
  //    Seul le plus gros d'une chaîne ne subit pas de traction de ses voisins plus petits.
  {
    const rA = nodeRadius(a), rB = nodeRadius(b);
    // a plus gros que b → a "tracteur", b "tracté"
    if(rA > rB + 1){
      const dxG = a.x - b.x, dyG = a.y - b.y;
      const distG = Math.hypot(dxG, dyG) || 0.0001;
      const uxG = dxG / distG, uyG = dyG / distG;
      const mSmall = Math.max(1, rB);
      const HIER_PULL = 0.22; // traction hiérarchique globale
      const pull = HIER_PULL * distG;
      if(!b.fixed){
        b.vx += uxG * pull * DT / mSmall;
        b.vy += uyG * pull * DT / mSmall;
      }
    }else if(rB > rA + 1){
      const dxG = b.x - a.x, dyG = b.y - a.y;
      const distG = Math.hypot(dxG, dyG) || 0.0001;
      const uxG = dxG / distG, uyG = dyG / distG;
      const mSmall = Math.max(1, rA);
      const HIER_PULL = 0.22;
      const pull = HIER_PULL * distG;
      if(!a.fixed){
        a.vx += uxG * pull * DT / mSmall;
        a.vy += uyG * pull * DT / mSmall;
      }
    }
  }
}

    for(const a of activeNodes){
      if(ENABLE_INDIRECT_ATTR){
      const s2=reach2.get(a.id)||new Set();
      for(const id of s2){
        const b=byId.get(id); if(!b) continue;
        // Skip person↔org indirect attraction (avoid drifting to other orgs)
        if( (isPerson(a) && isOrg(b)) || (isOrg(a) && isPerson(b)) ) continue;
        const dx=b.x-a.x, dy=b.y-a.y; const dist=Math.hypot(dx,dy)||0.0001;
        if(dist>800) continue;
        const ux=dx/dist, uy=dy/dist;
        const target = TARGET_LINK_DIST*1.25 + (nodeRadius(a)+nodeRadius(b))*0.12;
        const delta = dist - target;
        const mA=Math.max(1,nodeRadius(a)), mB=Math.max(1,nodeRadius(b));
        if(!a.fixed){ a.vx += (ux*delta*K_ATTR_INDIRECT/mA)*DT; a.vy += (uy*delta*K_ATTR_INDIRECT/mA)*DT; }
        if(!b.fixed){ b.vx += (-ux*delta*K_ATTR_INDIRECT/mB)*DT; b.vy += (-uy*delta*K_ATTR_INDIRECT/mB)*DT; }
      }
    }
    for(const a of activeNodes){
      const s3=reach3.get(a.id)||new Set();
      for(const id of s3){
        const b=byId.get(id); if(!b) continue;
        // Skip person↔org indirect attraction (3 hops)
        if( (isPerson(a) && isOrg(b)) || (isOrg(a) && isPerson(b)) ) continue;
        const dx=b.x-a.x, dy=b.y-a.y; const dist=Math.hypot(dx,dy)||0.0001;
        if(dist>900) continue;
        const ux=dx/dist, uy=dy/dist;
        const target = TARGET_LINK_DIST*1.5 + (nodeRadius(a)+nodeRadius(b))*0.10;
        const delta = dist - target;
        const mA=Math.max(1,nodeRadius(a)), mB=Math.max(1,nodeRadius(b));
        if(!a.fixed){ a.vx += (ux*delta*K_ATTR_INDIRECT3/mA)*DT; a.vy += (uy*delta*K_ATTR_INDIRECT3/mA)*DT; }
        if(!b.fixed){ b.vx += (-ux*delta*K_ATTR_INDIRECT3/mB)*DT; b.vy += (-uy*delta*K_ATTR_INDIRECT3/mB)*DT; }
      }
    }

    } // ENABLE_INDIRECT_ATTR

    // ===== Collisions + répulsion liée à la taille =====
    const __NODES = activeNodes; 
// --- Optimized neighbor processing with spatial grid when many nodes ---
(function() {
  const __THRESH = 380;
  const useGrid = __NODES.length > __THRESH && !__burst;
  const CELL = 180; // world units (~ collision horizon)

  if(!useGrid){
    // O(N^2) Full scan for smaller graphs
    for(let i=0;i<__NODES.length;i++){
      const a=__NODES[i], ra=nodeRadius(a);
      for(let j=i+1;j<__NODES.length;j++){
        const b=__NODES[j], rb=nodeRadius(b);
        if(__visFocus && (__isHiddenByFocus(a) || __isHiddenByFocus(b))) continue;

        const dx=b.x-a.x, dy=b.y-a.y; let dist=Math.hypot(dx,dy)||0.0001;
        const ux=dx/dist, uy=dy/dist;
        
        // anti-superposition (collision)
        const minSep=ra+rb+NODE_MIN_GAP;
        if(dist < minSep){
          const overlap = (minSep - dist);
          const wA = a.fixed ? 0 : 1/Math.max(1,ra);
          const wB = b.fixed ? 0 : 1/Math.max(1,rb);
          const wS = wA + wB;
          if(wS > 0){
            const mA = (wA / wS) * overlap;
            const mB = (wB / wS) * overlap;
            if(!a.fixed){ a.x -= ux * mA; a.y -= uy * mA; a.vx *= 0.7; a.vy *= 0.7; }
            if(!b.fixed){ b.x += ux * mB; b.y += uy * mB; b.vx *= 0.7; b.vy *= 0.7; }
            dist = minSep;
          }
        }

        // répulsion si non-liés: ∝ (ra^p * rb^p) * exp(-r/decay) / r^2
        const linked = (adjSet.get(a.id)?.has(b.id) || false);
        if(!linked && dist < (REP_CUTOFF + (ra+rb)*1.2)){
          const sizeA = Math.pow(ra, REP_SIZE_POW);
          const sizeB = Math.pow(rb, REP_SIZE_POW);
          const falloff = Math.exp(-dist / REP_DECAY);
          
          // Small-node weakening: each small node halves its repulsive contribution
          const SMALL_R = 14;
          const smallScaleA = (ra < SMALL_R) ? 0.5 : 1.0;
          const smallScaleB = (rb < SMALL_R) ? 0.5 : 1.0;
          const F = REP_BASE * smallScaleA * smallScaleB * (sizeA * sizeB) / (dist*dist + 25) * falloff;

          if(!a.fixed){ a.vx -= ux*F*DT; a.vy -= uy*F*DT; }
          if(!b.fixed){ b.vx += ux*F*DT; b.vy += uy*F*DT; }
        }
      }
    }
  }else{
    // Spatial Grid for large graphs (approx O(N))
    const __grid = new Map();
    for(let idx=0; idx<__NODES.length; idx++){
      const n = __NODES[idx];
      const gx = Math.floor(n.x / CELL), gy = Math.floor(n.y / CELL);
      const key = gx+'|'+gy;
      let arr = __grid.get(key); if(!arr){ arr=[]; __grid.set(key, arr); }
      arr.push(idx);
    }
    
    for(let i=0;i<__NODES.length;i++){
      const a=__NODES[i], ra=nodeRadius(a);
      const gx = Math.floor(a.x / CELL), gy=Math.floor(a.y / CELL);
      
      // Check 9 neighboring cells
      for(let ox=-1; ox<=1; ox++){ 
        for(let oy=-1; oy<=1; oy++){ 
        const arr = __grid.get((gx+ox)+'|'+(gy+oy)); if(!arr) continue;
        
        for(let ii=0; ii<arr.length; ii++){ 
          const j = arr[ii]; 
          if(j<=i) continue; // Only check unique pairs
          
          const b=__NODES[j], rb=nodeRadius(b);
          if(__visFocus && (__isHiddenByFocus(a) || __isHiddenByFocus(b))) continue;

          const dx=b.x-a.x, dy=b.y-a.y; let dist=Math.hypot(dx,dy)||0.0001;
          const ux=dx/dist, uy=dy/dist;
          
          // anti-superposition (collision)
          const minSep=ra+rb+NODE_MIN_GAP;
          if(dist < minSep){
            const overlap = (minSep - dist);
            const wA = a.fixed ? 0 : 1/Math.max(1,ra);
            const wB = b.fixed ? 0 : 1/Math.max(1,rb);
            const wS = wA + wB;
            if(wS > 0){
              const mA = (wA / wS) * overlap;
              const mB = (wB / wS) * overlap;
              if(!a.fixed){ a.x -= ux * mA; a.y -= uy * mA; a.vx *= 0.7; a.vy *= 0.7; }
              if(!b.fixed){ b.x += ux * mB; b.y += uy * mB; b.vx *= 0.7; b.vy *= 0.7; }
              dist = minSep;
            }
          }

          // répulsion si non-liés: ∝ (ra^p * rb^p) * exp(-r/decay) / r^2
          const linked = (adjSet.get(a.id)?.has(b.id) || false);
          if(!linked && dist < (REP_CUTOFF + (ra+rb)*1.2)){
            const sizeA = Math.pow(ra, REP_SIZE_POW);
            const sizeB = Math.pow(rb, REP_SIZE_POW);
            const falloff = Math.exp(-dist / REP_DECAY);
            
            // Small-node weakening: each small node halves its repulsive contribution
            const SMALL_R = 14;
            const smallScaleA = (ra < SMALL_R) ? 0.5 : 1.0;
            const smallScaleB = (rb < SMALL_R) ? 0.5 : 1.0;
            const F = REP_BASE * smallScaleA * smallScaleB * (sizeA * sizeB) / (dist*dist + 25) * falloff;

            if(!a.fixed){ a.vx -= ux*F*DT; a.vy -= uy*F*DT; }
            if(!b.fixed){ b.vx += ux*F*DT; b.vy += uy*F*DT; }
          }
        
          }
        } 
      }
    }
  }
})();


    // ===== Orbites par rôle + barrière employés =====
    for(const org of activeNodes){
      if(!isOrg(org)) continue;
      // Utiliser nodeDegree ici aussi
      const __rawDegOrg = nodeDegree(org.id);
      
      const neighIds = Array.from(reach1.get(org.id) || []);
      if(neighIds.length===0) continue;

      // Rayon effectif pour les orbites : comme si l'organisation avait au moins 4 connexions
      // → évite que patron/haut gradé spawnent trop près de la hitbox quand il y a peu de liens
      const __effDegOrg = Math.max(4, __rawDegOrg);
      const __baseSizeOrg = (NODE_BASE_SIZE[org.type]||10);
      const __scaleOrg = (DEG_SCALE[org.type]||4.0);
      const __rOrg = __baseSizeOrg + __scaleOrg * __effDegOrg;
      const __rMinOrg = (R_MIN[org.type]||__baseSizeOrg);
      const __rMaxOrg = (R_MAX[org.type]||__baseSizeOrg+60);
      const orgR = Math.max(__rMinOrg, Math.min(__rMaxOrg, __rOrg));
// Anneaux proportionnels à la taille du point org + marge
const margin = Math.max(14, orgR * 0.45);
const spacing = Math.max(36, orgR * 0.65);
const base = orgR + margin; // orbit 1 toujours > rayon du point
// PATCH 2025-11-15: patron/haut un peu plus éloignés de l'organisation
const ringR = {
  1: base + spacing*0.4,
  2: base + spacing*1.3,
  3: base + spacing*2,
  4: base + spacing*3,
  5: base + spacing*4
};

      // Partition
      const ringNodes = {1:[], 2:[], 3:[], 4:[], 5:[]};
      const employeesMem = [];
      for(const id of neighIds){
        const node = byId.get(id); if(!node) continue;
        const kind = adjKind.get(org.id)?.get(id);
        if(kind===KINDS.PATRON){ ringNodes[1].push(node); }
        else if(kind===KINDS.HAUT_GRADE){ ringNodes[2].push(node); }
        else if(kind===KINDS.EMPLOYE || kind===KINDS.MEMBRE){ employeesMem.push(node); }
      }

      // Capacité approximative 5 puis 4
      const avgEmpR = (employeesMem.length? employeesMem.reduce((s,n)=>s+nodeRadius(n),0)/employeesMem.length : 10);
      const cap = (R)=> Math.max(1, Math.floor((2*Math.PI*R) / Math.max(10, (avgEmpR*2.2 + RING_MIN_SPACING))));
      const cap5 = cap(ringR[5]);
      const ring5 = employeesMem.slice(0, cap5);
      const ring4 = employeesMem.slice(cap5);
      for(const n of ring5) ringNodes[5].push(n);
      for(const n of ring4) ringNodes[4].push(n);

      // Orbites (forces radiales + tangentielle)
      for(const k of [1,2,3,4,5]){
        const arr = ringNodes[k]; if(arr.length===0) continue;
        const R = ringR[k];
        const ordered = arr.slice().sort((a,b)=> (''+a.id).localeCompare(''+b.id));
        const n = ordered.length;
        for(let i=0;i<n;i++){
          const child = ordered[i];
          // S'assurer que le nœud enfant est également actif
          if(state.performance===true && !activeSet.has(child.id)) continue;
          
          const dx = child.x - org.x, dy = child.y - org.y;
          const dist = Math.hypot(dx,dy) || 0.0001;
          const ux = dx/dist, uy = dy/dist;
          const dr = dist - R;
          const fr = -dr * RING_RADIAL_K * (RING_RADIAL_MULT[k] || 1);
          if(!child.fixed){ child.vx += fr*ux*DT; child.vy += fr*uy*DT; }
          // PATCH 2025-11-15: les orbites ne poussent plus l'organisation, uniquement le nœud enfant
          // if(!org.fixed){ org.vx -= fr*ux*RING_ROOT_INERT*DT; org.vy -= fr*uy*RING_ROOT_INERT*DT; }
          const curAng = Math.atan2(dy,dx);
          let targetAng = (2*Math.PI)*(i/n);
          let dAng = targetAng - curAng;
          dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
          const ft = dAng * RING_TANG_K * R;
          const tx = -uy, ty = ux;
          if(!child.fixed){ child.vx += ft*tx*DT; child.vy += ft*ty*DT; }
          // PATCH 2025-11-15: pas de contre-couple sur l'organisation (évite la dérive poussée par les membres)
          // if(!org.fixed){ org.vx -= ft*tx*RING_ROOT_INERT*DT; org.vy -= ft*ty*RING_ROOT_INERT*DT; }
          // Préférence angulaire: attirer le point vers la direction des nœuds auxquels il est lié (hors org)
          const neigh = Array.from(adjSet.get(child.id) || [] ).filter(id => id !== org.id);
          if(neigh.length){
            let sx=0, sy=0, wsum=0;
            for(const id of neigh){
              const t = byId.get(id); if(!t) continue;
              // angle depuis l'org vers la cible
              const dxT = t.x - org.x, dyT = t.y - org.y;
              const rT = Math.hypot(dxT, dyT) || 0.0001;
              const uxT = dxT / rT, uyT = dyT / rT;
              // pondération par intensité du lien et proximité actuelle
              const k = adjKind.get(child.id)?.get(id);
              const wKind = (k && LINK_STRENGTH[k]) ? LINK_STRENGTH[k] : 1.0;
              const wDist = 1 / Math.max(60, rT); // moins d'influence si très loin
              const w = wKind * wDist;
              sx += uxT * w; sy += uyT * w; wsum += w;
            }
            if(wsum > 0){
              const uxPref = sx / wsum, uyPref = sy / wsum;
              const prefAng = Math.atan2(uyPref, uxPref);
              let dPref = prefAng - curAng;
              dPref = Math.atan2(Math.sin(dPref), Math.cos(dPref)); // wrap [-π,π]
              const ftPref = dPref * ORBIT_PREF_K * R;
              const txPref = -uy, tyPref = ux; // tangent unitaire au rayon courant
              if(!child.fixed){ child.vx += ftPref*txPref*DT; child.vy += ftPref*tyPref*DT; }
              // PATCH 2025-11-15: l'organisation ne reçoit plus la composante tangentielle des préférences d'orbite
              // if(!org.fixed){ org.vx -= ftPref*txPref*ORBIT_PREF_ROOT_INERT*DT; org.vy -= ftPref*tyPref*ORBIT_PREF_ROOT_INERT*DT; }
            }
          }

        }
      }

      // Barrière: EMPLOYE/MEMBRE ne peuvent pas entrer en-deçà d'une limite entre R3 et R4
      const blockThreshold = (ringR[3] + ringR[4]) * 0.5;
      for(const id of neighIds){
        const kind = adjKind.get(org.id)?.get(id);
        if(kind!==KINDS.EMPLOYE && kind!==KINDS.MEMBRE) continue;
        const n = byId.get(id);
        if(__visFocus && (__isHiddenByFocus(org) || __isHiddenByFocus(n))) continue;
        if(!n) continue;
        // S'assurer que le nœud est actif
        if(state.performance===true && !activeSet.has(n.id)) continue;
        
        const dx = n.x - org.x, dy = n.y - org.y;
        const dist = Math.hypot(dx,dy) || 0.0001;
        if(dist < blockThreshold){
          const ux = dx/dist, uy = dy/dist;
          const f = (blockThreshold - dist) * EMP_BLOCK_K;
          if(!n.fixed){ n.vx += ux * f * DT; n.vy += uy * f * DT; }
          // PATCH 2025-11-15: la barrière ne repousse plus l'organisation, seulement l'employé/membre
          // if(!org.fixed){ org.vx -= ux * f * 0.1 * DT; org.vy -= uy * f * 0.1 * DT; }
        }
      }

      // Périmètre de sécurité: les personnes reliées à une ou plusieurs orga
      // sont maintenues dans la bulle de leur organisation principale (la plus grosse).
      const secR = securityRadius.get(org.id) || 0;
      if(secR > 0){
        for(const id of neighIds){
          const n = byId.get(id);
          if(__visFocus && (__isHiddenByFocus(org) || __isHiddenByFocus(n))) continue;
          if(!n) continue;
          if(!isPerson(n)) continue;
          // S'assurer que le nœud est actif
          if(state.performance===true && !activeSet.has(n.id)) continue;

          const neighOfN = Array.from(adjSet.get(n.id) || []);
          if(neighOfN.length === 0) continue;

          // On cherche, parmi les voisins de n, l'organisation avec le plus grand périmètre.
          let mainOrg = null;
          let mainOrgR = -Infinity;
          for(const nid of neighOfN){
            const nn = byId.get(nid); if(!nn) continue;
            if(!isOrg(nn)) continue;
            const rSec = securityRadius.get(nn.id) || nodeRadius(nn);
            if(rSec > mainOrgR){
              mainOrgR = rSec;
              mainOrg = nn;
            }
          }
          if(!mainOrg) continue;

          // On ne traite ce nœud que depuis l'organisation principale.
          if(mainOrg.id !== org.id) continue;

          const secMain = securityRadius.get(org.id) || 0;
          if(secMain <= 0) continue;

          const dx2 = n.x - org.x, dy2 = n.y - org.y;
          const dist2 = Math.hypot(dx2,dy2) || 0.0001;
          if(dist2 > secMain){
            const ux2 = dx2/dist2, uy2 = dy2/dist2;
            // Reprojet immédiat dans la zone de sécurité (comme pour les nœuds à lien unique)
            const targetDist = secMain * 0.98;
            if(!n.fixed){
              n.x = org.x + ux2 * targetDist;
              n.y = org.y + uy2 * targetDist;
              n.vx *= 0.2;
              n.vy *= 0.2;
            }
          }
        }
      }
    }

    // ===== Champ de force entre périmètres de sécurité d'organisations =====
    if(orgList.length > 1){
      for(let i=0; i<orgList.length; i++){
        const a = orgList[i];
        if(state.performance===true && !activeSet.has(a.id)) continue;
        const ra = securityRadius.get(a.id) || 0;
        if(ra <= 0) continue;
        for(let j=i+1; j<orgList.length; j++){
          const b = orgList[j];
          if(state.performance===true && !activeSet.has(b.id)) continue;
          const rb = securityRadius.get(b.id) || 0;
          if(rb <= 0) continue;

          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx,dy) || 0.0001;
          const minDist = ra + rb;
          if(dist < minDist){
            const ux = dx/dist, uy = dy/dist;
            const overlap = (minDist - dist) * SEC_PERIM_REPULSION_K;

            const wA = a.fixed ? 0 : 1/Math.max(1, nodeRadius(a));
            const wB = b.fixed ? 0 : 1/Math.max(1, nodeRadius(b));
            const wS = wA + wB;
            if(wS > 0){
              const mA = overlap * (wA / wS);
              const mB = overlap * (wB / wS);
              if(!a.fixed){ a.x -= ux * mA; a.y -= uy * mA; a.vx *= 0.7; a.vy *= 0.7; }
              if(!b.fixed){ b.x += ux * mB; b.y += uy * mB; b.vx *= 0.7; b.vy *= 0.7; }
            }
          }
        }
      }
    }

    // ===== Sphère globale (attraction vers le centre, barrière extérieure) =====
    for(const n of activeNodes){
      const r = Math.hypot(n.x, n.y) || 0.0001;
      const ux = n.x / r, uy = n.y / r;
      const dr = r - R_SPHERE;
      if(dr > 0){
        const f = -dr * K_SPHERE_WALL;
        if(!n.fixed){ n.vx += f*ux*DT; n.vy += f*uy*DT; }
      }else{
        const f = (-dr) * K_SPHERE_OUT;
        if(!n.fixed){ n.vx += f*ux*DT; n.vy += f*uy*DT; }
      }
      if(!n.fixed){
        const __mass = Math.max(1, nodeRadius(n));
        if(__burst){
          // During the initial 'burst', push nodes OUTWARD from the center,
          // and amplify this push for high-degree nodes so they naturally migrate to the exterior.
          const __deg = nodeDegree(n.id);
          // Consider "many connections" starting around 6+; clamp to [0,1] for stability
          const __degNorm = Math.min(1, __deg / 6);
          const __k = CENTER_K * (0.9 + 1.6 * __degNorm); // low-degree still outward; high-degree more outward
          n.vx += ( n.x * __k * DT) / __mass;
          n.vy += ( n.y * __k * DT) / __mass;
        }else{
          // In normal/cooldown modes, keep a gentle attraction to the center to avoid drift
          n.vx += (-n.x * CENTER_K * DT) / __mass;
          n.vy += (-n.y * CENTER_K * DT) / __mass;
        }

        // PATCH 2025-11-15: clamp doux pour empêcher les nœuds de s'échapper trop loin
        // Rayon max dépendant du nombre de nœuds (via R_SPHERE).
        const R_MAX = R_SPHERE * 1.8;
        const r2 = Math.hypot(n.x, n.y) || 0.0001;
        if(r2 > R_MAX){
          const ux2 = n.x / r2, uy2 = n.y / r2;
          const clampR = R_MAX;
          n.x = ux2 * clampR;
          n.y = uy2 * clampR;
          // On amortit aussi la vitesse pour éviter un rebond violent
          n.vx *= 0.25;
          n.vy *= 0.25;
        }
      }
    }

    // ===== Intégration =====
    for(const n of activeNodes){
      if(n.fixed) continue;
      n.vx *= FRICTION; n.vy *= FRICTION;
      const sp = Math.hypot(n.vx, n.vy);
      if(sp > MAX_SPEED){ const s = MAX_SPEED/(sp+1e-6); n.vx *= s; n.vy *= s; }
      n.x += n.vx; n.y += n.vy;
    }
    
    // --- CONTRAINTE DURE: Personne↔Personne liées ≥ 100px (appliquée sur tous les nœuds actifs) ---
    (function enforceMinDistanceForLinkedPersons(){
      const MIN_D = 100;
      const byId = new Map(); for(const n of state.nodes) byId.set(n.id, n);
      for(const l of state.links){
        const a = byId.get(l.source), b = byId.get(l.target);
        if(!a || !b) continue;
        if(!(isPerson(a) && isPerson(b))) continue;
        // On n'applique cette contrainte que si les deux nœuds sont actifs
        if(state.performance===true && (!activeSet.has(a.id) || !activeSet.has(b.id))) continue;
        
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.hypot(dx, dy) || 0.0001;
        if(dist >= MIN_D) continue;
        const ux = dx / dist, uy = dy / dist;
        const need = (MIN_D - dist);
        let moveA = need * 0.5, moveB = need * 0.5;
        if(a.fixed && !b.fixed){ moveA = 0; moveB = need; }
        else if(b.fixed && !a.fixed){ moveA = need; moveB = 0; }
        if(!a.fixed){ a.x -= ux * moveA; a.y -= uy * moveA; a.vx -= ux * (need * 0.2); a.vy -= uy * (need * 0.2); }
        if(!b.fixed){ b.x += ux * moveB; b.y += uy * moveB; b.vx += ux * (need * 0.2); b.vy += uy * (need * 0.2); }
      }
    })();

    
};


  function angleDiff(a,b){ let d=b-a; while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI; return d; }
  function tangentUnit(c,n){ const dx=n.x-c.x, dy=n.y-c.y; const r=Math.hypot(dx,dy)||0.0001; return {x:-dy/r, y:dx/r}; }

  // ---------- Interaction (pan/zoom/drag) ----------
  function screenToWorld(px,py){ const p=state.view; const w=canvas.width/(window.devicePixelRatio||1), h=canvas.height/(window.devicePixelRatio||1); return {x:(px-w/2-p.x)/p.scale, y:(py-h/2-p.y)/p.scale}; }
  function worldToScreen(x,y){ const p=state.view; const w=canvas.width/(window.devicePixelRatio||1), h=canvas.height/(window.devicePixelRatio||1); return {x:(x*p.scale)+(w/2+p.x), y:(y*p.scale)+(h/2+p.y)}; }

  // Programmatic zoom/pan to a specific node (center it and zoom in)
  
  // Zoom-out pour cadrer toute la carte
  function zoomToFit(paddingPx){
    const pad = (typeof paddingPx==='number') ? paddingPx : 100;
    const w = canvas.width/(window.devicePixelRatio||1);
    const h = canvas.height/(window.devicePixelRatio||1);
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    for(const n of state.nodes){
      if(!n) continue;
      const r = (typeof nodeRadius==='function') ? nodeRadius(n) : 10;
      minX = Math.min(minX, n.x - r);
      minY = Math.min(minY, n.y - r);
      maxX = Math.max(maxX, n.x + r);
      maxY = Math.max(maxY, n.y + r);
    }
    if(!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return;
    const worldW = Math.max(1, maxX - minX);
    const worldH = Math.max(1, maxY - minY);
    const sx = (w - 2*pad) / worldW;
    const sy = (h - 2*pad) / worldH;
    const s = clamp(Math.min(sx, sy), 0.25, 3.0);
    state.view.scale = s;
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    state.view.x = -cx * s;
    state.view.y = -cy * s;
    draw();
  }

  function zoomToNode(id, targetScale){
    const n = nodeById(id);
    if(!n) return;
    const s0 = state.view.scale || 1;
    const s1 = clamp(targetScale || Math.max(1.6, s0), 0.25, 3.0);
    state.view.scale = s1;
    state.view.x = -n.x * s1;
    state.view.y = -n.y * s1;
    draw();
  }

  canvas.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const m=screenToWorld(e.offsetX,e.offsetY);
    const before=worldToScreen(m.x,m.y);
    const delta = clamp((e.deltaY<0?1.1:0.9), 0.2, 5);
    state.view.scale = clamp(state.view.scale*delta, 0.25, 3.0);
    const after=worldToScreen(m.x,m.y);
    state.view.x += (before.x-after.x);
    state.view.y += (before.y-after.y);
    draw();
  }, {passive:false});

  let isPanning=false, panLast=null;
  canvas.addEventListener('mousedown',(e)=>{
    const hit=pickNode(e.offsetX,e.offsetY);
    if(hit) beginDrag(hit,e);
    else { isPanning=true; panLast={x:e.clientX,y:e.clientY}; }
  });
  window.addEventListener('mousemove',e=>{
    if(isPanning){ const dx=e.clientX-panLast.x, dy=e.clientY-panLast.y; panLast={x:e.clientX,y:e.clientY}; state.view.x+=dx; state.view.y+=dy; draw(); }
  });
  window.addEventListener('mouseup',()=>{ isPanning=false; });

  let dragging=null, clickPending=null;
  function beginDrag(node,e){
    dragging={node,lastWorld:screenToWorld(e.offsetX,e.offsetY), started:false, startClient:{x:e.clientX,y:e.clientY}};
    // Snapshot initial link distances for the connected component
    dragging.dist0 = snapshotInitialDistances(node.id);
    document.body.style.cursor='grabbing';
    clickPending={node,t:performance.now()};
}
  window.addEventListener('mousemove',e=>{
    if(!dragging) return;
    const cur=screenToWorld(e.offsetX,e.offsetY);
    const n=dragging.node;
    // Activate drag only after small movement threshold
    if(!dragging.started){
      const dxC=e.clientX-dragging.startClient.x, dyC=e.clientY-dragging.startClient.y;
      if(Math.hypot(dxC,dyC) < 3) return;
      dragging.started = true;
      __clearMotionTimers();
      unfreezeAllAuto();
      __setMotion('normal');
    }
    const dx=cur.x-dragging.lastWorld.x, dy=cur.y-dragging.lastWorld.y;
    dragging.lastWorld=cur;
    n.x += dx; n.y += dy; n.vx*=0.4; n.vy*=0.4;
    // Apply chain stretch-limit constraints so links deform less
    applyStretchConstraints(n.id, dragging.dist0);
    // Tirer l'organisation entraîne un peu les rattachés
    const pull = isOrg(n)?0.25:0.08;
    for(const l of state.links){
      let otherId=null;
      if(l.source===n.id) otherId=l.target;
      else if(l.target===n.id) otherId=l.source;
      if(otherId==null) continue;
      const o=nodeById(otherId); if(!o||o.fixed) continue;
      if(isOrg(n) && isPerson(o) && ORG_REL.has(l.kind)){
        o.x+=dx*pull; o.y+=dy*pull; o.vx*=0.35; o.vy*=0.35;
      }
    }
    draw();
  });
  function endDrag(){
    if(dragging){
      if(dragging.started){
        dragging.node.vx=0; dragging.node.vy=0;
        dragging.node.pin={x:dragging.node.x,y:dragging.node.y}; // ancrage à la nouvelle place
        // After drag: slow down and refreeze
        __clearMotionTimers();
        __setMotion('cooldown');
        __motionTimers.push(setTimeout(()=>{ freezeAllAuto(); __setMotion('frozen'); }, 2000));
      }
    }
    if(dragging && dragging.dist0) dragging.dist0 = null;
    dragging=null;
    document.body.style.cursor='default';
  }
  window.addEventListener('mouseup', endDrag);
  canvas.addEventListener('click',()=>{
    if(clickPending && performance.now()-clickPending.t<220) selectNode(clickPending.node.id);
    clickPending=null;
  });

  function pickNode(px,py){
    const w=screenToWorld(px,py);
    for(let i=state.nodes.length-1;i>=0;i--){
      const n=state.nodes[i], r=nodeRadius(n)+6;
      const dx=w.x-n.x, dy=w.y-n.y;
      if(dx*dx+dy*dy <= r*r) return n;
    }
    return null;
  }

  // ---------- Drawing ----------
  

function applyPersonOrgColors(){
  // Blend org colors onto persons. Weight = (# direct links p↔org) * degree(org)
  updateDegreeCache(); // Assurez-vous d'avoir les degrés à jour
  for(const p of state.nodes){
    if(!isPerson(p)) continue;
    const weights = new Map();
    for(const l of state.links){
      let otherId=null;
      if(l.source===p.id && (isGroup(nodeById(l.target))||isCompany(nodeById(l.target))) && PERSON_ORG_KINDS.has(l.kind)){ otherId=l.target; }
      else if(l.target===p.id && (isGroup(nodeById(l.source))||isCompany(nodeById(l.source))) && PERSON_ORG_KINDS.has(l.kind)){ otherId=l.source; }
      if(otherId!=null){
        // Utiliser nodeDegree du cache
        const w = (weights.get(otherId)||0) + 1 * Math.max(1, nodeDegree(otherId));
        weights.set(otherId, w);
      }
    }
    if(weights.size===0){ p.color = '#ffffff'; continue; }
    let R=0,G=0,B=0,W=0;
    for(const [oid,w] of weights.entries()){
      const org = nodeById(oid);
      const c = hexToRgb(org.color||'#ffffff');
      R += c.r*w; G += c.g*w; B += c.b*w; W += w;
    }
    p.color = rgbToHex(R/W, G/W, B/W);
  }
}


  // ------- Focus-mode helpers: geler/dégeler la physique des points cachés -------
  function freezeHiddenNodes(){
    if(state.focusOnlyId==null) return;
    const vis = reachableSet(state.focusOnlyId);
    for(const n of state.nodes){
      if(!vis.has(n.id)){
        // Sauvegarde état pour restauration
        if(n._frozenByFocus) continue;
        n._frozenByFocus = true;
        n._savedFixed = !!n.fixed;
        n._savedPin = n.pin ? {x:n.pin.x, y:n.pin.y} : null;
        // Geler sur place
        n.fixed = true;
        n.pin = {x:n.x, y:n.y};
        n.vx = 0; n.vy = 0;
      }
    }
  }
  function unfreezeHiddenNodes(){
    for(const n of state.nodes){
      if(n._frozenByFocus){
        n.fixed = n._savedFixed;
        n.pin = n._savedPin;
        delete n._savedFixed;
        delete n._savedPin;
        delete n._frozenByFocus;
      }
    }
  }

function draw(){
    const clustered = __isClusteredView();

    // Mode performance : pas d'animation de transition, comportement instantané
    if(state.performance===true){
      clusterTransition = null;
      lastClusteredFlag = clustered;
      if(clustered){
        return drawClustered();
      }
    }else{
      const now = __nowMs();
      if(lastClusteredFlag===null){
        lastClusteredFlag = clustered;
      }
      if(clustered !== lastClusteredFlag){
        // Démarrage d'une nouvelle transition entre vue regroupée et vue normale
        clusterTransition = {
          mode: clustered ? 'toClustered' : 'toNormal',
          start: now
        };
        lastClusteredFlag = clustered;
      }
    }

    let clusterData = null;
    let transitioning = false;
    let progress = 1;

    if(state.performance!==true){
      if(clusterTransition){
        const now = __nowMs();
        let t = (now - clusterTransition.start) / CLUSTER_TRANSITION_MS;
        if(t >= 1){
          clusterTransition = null;
          t = 1;
        }else{
          transitioning = true;
          progress = t;
        }
      }
      // On calcule les clusters uniquement si on est en vue regroupée
      // ou pendant une animation de transition
      if(clustered || transitioning){
        clusterData = computeClusters();
        state._clusterCache = clusterData;
      }else{
        state._clusterCache = null;
      }
    }else{
      // En mode performance on ne garde que le cache minimal pour drawClustered / épaisseur de liens
      if(clustered){
        clusterData = computeClusters();
        state._clusterCache = clusterData;
      }else{
        state._clusterCache = null;
      }
    }

    // Si on est en vue regroupée sans animation → on délègue au rendu regroupé classique
    if(clustered && !transitioning){
      return drawClustered();
    }

    applyPersonOrgColors();
    const p=state.view, w=canvas.width/(window.devicePixelRatio||1), h=canvas.height/(window.devicePixelRatio||1);
    ctx.save();
    ctx.clearRect(0,0,w,h);
    ctx.translate(w/2+p.x, h/2+p.y);
    ctx.scale(p.scale,p.scale);


    // links
    const linkTypesOn = !!state.showLinkTypes;
    if(!linkTypesOn){
      // Original thin neutral links
      /* Base neutral links split in two passes: grouped edges thinner */
      const __repOf = (state._clusterCache && state._clusterCache.repOf) ? state._clusterCache.repOf : null;
      // Pass 1: grouped edges (any endpoint would be clustered) with thinner width
      ctx.lineWidth = 0.6/Math.sqrt(p.scale);
      ctx.strokeStyle='#41465e';
      ctx.globalAlpha=0.85;
      ctx.beginPath();
      for(const l of state.links){
        const a=nodeById(l.source), b=nodeById(l.target); if(!a||!b) continue;
        let __vis=null; if(state.focusOnlyId!=null){ __vis=reachableSet(state.focusOnlyId); }
        if(__vis && (!__vis.has(l.source)||!__vis.has(l.target))) continue;
        const gA = __repOf ? (__repOf.get(l.source)!==l.source) : false;
        const gB = __repOf ? (__repOf.get(l.target)!==l.target) : false;
        const pa = __getNodeDrawPos(a, clusterData, transitioning, progress);
        const pb = __getNodeDrawPos(b, clusterData, transitioning, progress);
        if(gA || gB){ ctx.moveTo(pa.x,pa.y); ctx.lineTo(pb.x,pb.y); }
      }
      ctx.stroke();
      // Pass 2: non-grouped edges with normal base width
      ctx.lineWidth = 1/Math.sqrt(p.scale);
      ctx.strokeStyle='#41465e';
      ctx.globalAlpha=0.85;
      ctx.beginPath();
      for(const l of state.links){
        const a=nodeById(l.source), b=nodeById(l.target); if(!a||!b) continue;
        let __vis=null; if(state.focusOnlyId!=null){ __vis=reachableSet(state.focusOnlyId); }
        if(__vis && (!__vis.has(l.source)||!__vis.has(l.target))) continue;
        const gA = __repOf ? (__repOf.get(l.source)!==l.source) : false;
        const gB = __repOf ? (__repOf.get(l.target)!==l.target) : false;
        const pa = __getNodeDrawPos(a, clusterData, transitioning, progress);
        const pb = __getNodeDrawPos(b, clusterData, transitioning, progress);
        if(!(gA || gB)){ ctx.moveTo(pa.x,pa.y); ctx.lineTo(pb.x,pb.y); }
      }
      ctx.stroke();
    }else{
      ctx.lineWidth=1/Math.sqrt(p.scale);
      ctx.globalAlpha=0.8;
      ctx.beginPath();
      for(const l of state.links){
        const a=nodeById(l.source), b=nodeById(l.target); if(!a||!b) continue;
        let __vis=null; if(state.focusOnlyId!=null){ __vis=reachableSet(state.focusOnlyId); }
        if(__vis && (!__vis.has(l.source)||!__vis.has(l.target))) continue;
        const w=computeLinkWidth(l, p.scale);
        ctx.lineWidth=w;
        ctx.strokeStyle=computeLinkColor(l);
        const pa = __getNodeDrawPos(a, clusterData, transitioning, progress);
        const pb = __getNodeDrawPos(b, clusterData, transitioning, progress);
        ctx.beginPath();
        ctx.moveTo(pa.x,pa.y);
        ctx.lineTo(pb.x,pb.y);
        ctx.stroke();

        // Emoji au centre de la ligne pour représenter le type de lien
        const mx = (pa.x + pb.x) / 2;
        const my = (pa.y + pb.y) / 2;
        const emoji = linkKindEmoji(l.kind);
        if(emoji){
          ctx.save();
          const s = Math.max(0.6, Math.sqrt(p.scale||1));
          ctx.font = (12/s) + 'px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(emoji, mx, my);
          ctx.restore();
        }
      }
    }

    // nodes
    ctx.globalAlpha=1;
    let __visN=null; if(state.focusOnlyId!=null){ __visN=reachableSet(state.focusOnlyId); }
    for(const n of state.nodes){
      if(__visN && !__visN.has(n.id)) continue;
      const r=nodeRadius(n);
      ctx.fillStyle=n.color||'#9aa3ff';
      ctx.beginPath();
      const pos = __getNodeDrawPos(n, clusterData, transitioning, progress);
      if(isGroup(n)){
        // octogone léger pour groupe
        polygonPath(ctx, pos.x, pos.y, r, 8);
      }else if(isCompany(n)){
        // carré aux coins arrondis
        roundRectPath(ctx, pos.x-r*0.9, pos.y-r*0.9, r*1.8, r*1.8, Math.min(10,r/3));
      }else{
        ctx.arc(pos.x,pos.y,r,0,Math.PI*2);
      }
      ctx.fill();

      // highlight selection
      if(state.selection===n.id){
        ctx.strokeStyle='#7aa2ff';
        ctx.lineWidth=2/Math.sqrt(p.scale);
        ctx.stroke();
      }
    }

    // labels
    if(state.showLabels){
      ctx.font = `${12/Math.sqrt(p.scale)}px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle='#c6cbe0';
      let __visN2=null; if(state.focusOnlyId!=null){ __visN2=reachableSet(state.focusOnlyId); }
      for(const n of state.nodes){
        if(__visN2 && !__visN2.has(n.id)) continue; // NE PAS afficher les noms des points cachés
        const pos = __getNodeDrawPos(n, clusterData, transitioning, progress);
        ctx.fillText(n.name, pos.x, pos.y + nodeRadius(n) + 10/Math.sqrt(p.scale));
      }
    }

    ctx.restore();
  }
  function  polygonPath(ctx,cx,cy,r,sides){
    ctx.moveTo(cx+r, cy);
    for(let i=1;i<=sides;i++){
      const a=i*2*Math.PI/sides; ctx.lineTo(cx+r*Math.cos(a), cy+r*Math.sin(a));
    }
    ctx.closePath();
  }
  function roundRectPath(ctx,x,y,w,h,r){
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  
// ===== Circle spawn by affinity (added) =====
function pickRootIdByDegree(){
  updateDegreeCache(); // Assurez-vous d'avoir les degrés à jour
  const adj = buildAdjacency();
  let best = null, bestDeg = -1;
  for(const n of state.nodes){
    const d = nodeDegree(n.id);
    if(d > bestDeg){ bestDeg = d; best = n.id; }
  }
  return best || (state.nodes.length ? state.nodes[0].id : null);
}
function pickRootIdRandom(){
  if(!state.nodes.length) return null;
  const i = Math.floor(Math.random()*state.nodes.length);
  return state.nodes[i].id;
}

function bfsLayers(rootId, adj){
  const dist = new Map(); const layers = new Map();
  if(rootId==null) return layers;
  const q = [rootId]; dist.set(rootId, 0);
  while(q.length){
    const u = q.shift(); const d = dist.get(u);
    if(!layers.has(d)) layers.set(d, []);
    layers.get(d).push(u);
    for(const e of (adj.get(u)||[])){
      if(!dist.has(e.id)){ dist.set(e.id, d+1); q.push(e.id); }
    }
  }
  return layers;
}
function orderIdsByAffinity(ids, adj){
  if(ids.length<=2) return ids.slice();
  const idsSet = new Set(ids);
  const degreeInSet = (id)=> (adj.get(id)||[]).reduce((a,e)=>a+(idsSet.has(e.id)?1:0),0);
  const placed=[]; const unplaced = new Set(ids);
  let current = ids.slice().sort((a,b)=>degreeInSet(b)-degreeInSet(a))[0];
  while(unplaced.size){
    if(!current || !unplaced.has(current)){
      // pick remaining with max links to placed, then degree
      let scored=[...unplaced].map(id=>[id,(adj.get(id)||[]).reduce((a,e)=>a+(placed.includes(e.id)?1:0),0),degreeInSet(id)]);
      scored.sort((A,B)=> (B[1]-A[1]) || (B[2]-A[2]));
      current = scored.length?scored[0][0]:[...unplaced][0];
    }
    placed.push(current);
    unplaced.delete(current);
    const neigh = (adj.get(current)||[]).map(e=>e.id).filter(id=>unplaced.has(id) && idsSet.has(id));
    if(neigh.length){
      neigh.sort((a,b)=>degreeInSet(b)-degreeInSet(a));
      current = neigh[0];
    }else{
      current = null;
    }
  }
  return placed;
}
function spawnRingsLikeCenterByAffinity(){
  if(!state.nodes.length) return;
  const adj = buildAdjacency();
  const rootId = (state.centerLockId!=null ? state.centerLockId : pickRootIdRandom());
  // Layout constants copied from centerRingsLayout:
  const R0 = 30, STEP = 160;
  // Build layers from root
  const layers = bfsLayers(rootId, adj);
  // Ensure all nodes present: add disconnected nodes as far ring
  const allIds = new Set(state.nodes.map(n=>n.id));
  const assigned = new Set([...(layers?.values?.() ? [].concat(...Array.from(layers.values())) : [])]);
  const far = [];
  for(const id of allIds){ if(!assigned.has(id)) far.push(id); }
  if(far.length){
    const maxLayer = layers.size? Math.max(...layers.keys()) : 0;
    layers.set(maxLayer+1, far);
  }
  // Position per layer
  const positions = new Map();
  // Root at center
  if(rootId!=null) positions.set(rootId, {x:0,y:0});
  for(const [d, ids] of Array.from(layers.entries()).sort((a,b)=>a[0]-b[0])){
    if(d===0) continue; // center
    const ordered = orderIdsByAffinity(ids, adj);
    const m = Math.max(1, ordered.length);
    const radius = R0 + STEP*d;
    const angleStep = (2*Math.PI)/m;
    // Small deterministic jitter based on id to avoid perfect overlap across rings
    for(let i=0;i<m;i++){
      const id = ordered[i];
      const a = i*angleStep;
      const x = radius * Math.cos(a);
      const y = radius * Math.sin(a);
      positions.set(id, {x,y});
    }
  }
  // Apply positions + pins
  for(const n of state.nodes){
    const pos = positions.get(n.id);
    if(pos){
      n.x = pos.x; n.y = pos.y; n.vx = 0; n.vy = 0; n.pin = {x:pos.x, y:pos.y};
    }else{
      // fallback very far
      const L = R0 + (state.nodes.length+2)*STEP;
      const a = Math.random()*2*Math.PI;
      const x = L*Math.cos(a), y = L*Math.sin(a);
      n.x=x; n.y=y; n.vx=0; n.vy=0; n.pin={x,y};
    }
  }
  state.view.x = 0; state.view.y = 0;
}
function spawnByChainConnections(){
  if(!state.nodes.length) return;
  updateDegreeCache(); // Assurez-vous d'avoir les degrés à jour
  const adj = buildAdjacency();
  const ids = state.nodes.map(n=>n.id);
  // Connected components
  const visited = new Set();
  const comps = [];
  const compIndex = new Map();
  for(const id of ids){
    if(visited.has(id)) continue;
    const q=[id]; visited.add(id);
    const comp=[];
    while(q.length){
      const u=q.shift(); comp.push(u); compIndex.set(u, comps.length);
      for(const e of (adj.get(u)||[])){
        if(!visited.has(e.id)){ visited.add(e.id); q.push(e.id); }
      }
    }
    comps.push(comp);
  }
  const compSize = new Map();
  for(let c=0;c<comps.length;c++){
    const size = comps[c].length;
    for(const id of comps[c]) compSize.set(id, size);
  }
  const deg = id => nodeDegree(id);
  // Smallest connectivity → centre ; Largest → extérieur
  // PATCH 2025-11-15: ordre de spawn basé sur les chaînes de liens (BFS)
  // → les nœuds directement connectés apparaissent côte à côte au spawn.
  const ordered = [];
  const seenOrder = new Set();
  // Composantes triées par taille croissante (petites au centre, grosses à l'extérieur)
  const compsSorted = comps.slice().sort((a,b)=> a.length - b.length);
  for(const comp of compsSorted){
    if(!comp.length) continue;
    const compSet = new Set(comp);
    // Point de départ = nœud le plus connecté de la composante
    let root = comp[0];
    let bestDeg = deg(root);
    for(const id of comp){
      const d = deg(id);
      if(d > bestDeg){ bestDeg = d; root = id; }
    }
    const q = [root];
    if(!seenOrder.has(root)) seenOrder.add(root);
    while(q.length){
      const u = q.shift();
      ordered.push(u);
      for(const e of (adj.get(u)||[])){
        const v = e.id;
        if(!compSet.has(v) || seenOrder.has(v)) continue;
        seenOrder.add(v);
        q.push(v);
      }
    }
    // Ajout de secours des nœuds isolés / non visités
    for(const id of comp){
      if(!seenOrder.has(id)){
        seenOrder.add(id);
        ordered.push(id);
      }
    }
  }
  const R0 = 24, STEP = 160;
  const ringCap = r => 12*(r+1); // 12,24,36,...
  const positions = new Map();
  let idx=0, ring=0;
  while(idx < ordered.length){
    const cap = ringCap(ring);
    const chunk = ordered.slice(idx, idx+cap);
    const m = Math.max(1, chunk.length);
    const radius = R0 + STEP*ring;
    const angleStep = (2*Math.PI)/m;
    const jitter = 0.0001;
    for(let k=0;k<m;k++){
      const id = chunk[k];
      const a = angleStep*k + (k%2? jitter : -jitter);
      const x = radius*Math.cos(a), y = radius*Math.sin(a);
      positions.set(chunk[k], {x,y});
    }
    idx += cap; ring++;
  }
  for(const n of state.nodes){
    const pos = positions.get(n.id);
    if(pos){
      n.x = pos.x; n.y = pos.y; n.vx = 0; n.vy = 0; n.pin = {x:pos.x, y:pos.y};
    }else{
      const L = R0 + (state.nodes.length+2)*STEP;
      const a = Math.random()*2*Math.PI;
      const x = L*Math.cos(a), y = L*Math.sin(a);
      n.x=x; n.y=y; n.vx=0; n.vy=0; n.pin={x,y};
    }
  }
  state.view.x = 0; state.view.y = 0;
}

// ---------- Ticker ----------
  function tick(){
return function __tick(ts){
      if(typeof ts !== 'number'){ ts = (window.performance && performance.now) ? performance.now() : Date.now(); }
      __updateLag(ts);
      // dtMul utilisé par la physique (compense le ralentissement visuel)
      physics.motion.dtMul = __lag.timeScale;
      // Ne pas simuler si l'onglet est masqué, sauf si la simulation est forcée
      if(document.hidden && !state.forceSimulation){ 
        // Pas de simulation physique, mais on met à jour la vue (pan/zoom/etc.)
        draw();
        return requestAnimationFrame(__tick);
      }
      
      const dtMul = (physics.motion && physics.motion.dtMul) ? physics.motion.dtMul : 1;
      physics.step(dtMul);
      draw();
      return requestAnimationFrame(__tick);
    }();
  // Sync initial UI

  // Sync initial UI
  if(ui.chkLinkTypes){ state.showLinkTypes = ui.chkLinkTypes.checked; }
  }

  
  

// --- Toggle forced simulation ---
if(ui.btnToggleSim){
  ui.btnToggleSim.addEventListener('click', ()=>{
    state.forceSimulation = !state.forceSimulation;
    if(state.forceSimulation){
      // Force ON: stop auto timers, unfreeze, set normal motion
      try{ __clearMotionTimers(); }catch(e){}
      try{ unfreezeAllAuto(); }catch(e){}
      try{ __setMotion('normal'); }catch(e){}
      ui.btnToggleSim.textContent = 'Mettre en pause la simulation';
    }else{
      // Force OFF: resume normal lifecycle
      startMotionSequence(false);
      ui.btnToggleSim.textContent = 'Lancer la simulation';
    }
  });
}

// ---------- Toolbar / controls ----------
  
if(ui.btnRelayout){
  ui.btnRelayout.addEventListener('click',()=>{
// Unlock center if one is locked
    if(state.centerLockId){
      const lock = nodeById(state.centerLockId);
      if(lock){ lock.fixed = false; lock.pin = null; }
      state.centerLockId = null;
    }
    spawnByChainConnections();
    startMotionSequence(true);
    draw();
  
    // Dézoom maximal automatique après réorganisation
    if(state.view){ state.view.scale = 0.25; state.view.x = 0; state.view.y = 0; }
    draw();
});
}

  if(ui.chkLabels){
    ui.chkLabels.addEventListener('change',()=>{ state.showLabels = ui.chkLabels.checked; draw(); });

  if(ui.chkLinkTypes){
    ui.chkLinkTypes.addEventListener('change',()=>{
      state.showLinkTypes = ui.chkLinkTypes.checked;
      updateLinkLegend();
      draw();
    });
  }  }
  if(ui.createPerson && !ui.createPerson.__bound){ ui.createPerson.__bound=true; ui.createPerson.addEventListener('click',()=>{ const n=ensureNode(TYPES.PERSON, uniqueName('Personne')); selectNode(n.id); refreshLists(); draw(); }); }
  if(ui.createGroup && !ui.createGroup.__bound){ ui.createGroup.__bound=true; ui.createGroup.addEventListener('click',()=>{ const n=ensureNode(TYPES.GROUP, uniqueName('Groupuscule')); selectNode(n.id); refreshLists(); draw(); }); }
  if(ui.createCompany && !ui.createCompany.__bound){ ui.createCompany.__bound=true; ui.createCompany.addEventListener('click',()=>{ const n=ensureNode(TYPES.COMPANY, uniqueName('Entreprise')); selectNode(n.id); refreshLists(); draw(); }); }

  // Export / Import
  // Fusionner (merge) JSON
  
  const mergeLabel = ui.fileMerge ? ui.fileMerge.closest('label') : null;
  if(mergeLabel){
    mergeLabel.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      openJsonModal({
        mode:'merge',
        onFileClick: (file) => {
          try{
            mergeGraph(file);
          }catch(err){
            console.error('Fusion JSON (Point, fichier) a échoué:', err);
          }
        },
        onValidate: (raw) => {
          try{
            const obj = JSON.parse(raw);
            mergeGraphObject(obj);
            return true;
          }catch(err){
            console.error('Fusion JSON a échoué:', err);
            return false;
          }
        }
      });
    });
  }

  if(ui.fileMerge){
    ui.fileMerge.addEventListener('change', (e)=>{
      const f = e.target.files[0];
      if(f) mergeGraph(f);
      e.target.value='';
      if (typeof closeJsonModal === 'function') {
        try { closeJsonModal(); } catch(err){}
      }
    });
  }


  if(ui.btnExport){ ui.btnExport.addEventListener('click', exportGraph); }
  if(ui.btnClearAll){
    ui.btnClearAll.addEventListener('click', ()=>{
      showPointConfirmModal('Voulez-vous vraiment supprimer tous les points affichés ?', ()=>{
        // Réinitialise les noeuds et liens
        state.nodes = [];
        state.links = [];
        // Vide les listes dans le panneau latéral
        if(ui.listCompanies) ui.listCompanies.innerHTML='';
        if(ui.listGroups) ui.listGroups.innerHTML='';
        if(ui.listPeople) ui.listPeople.innerHTML='';
        // Redessine
        draw();
        savePointStateToStorage();
      });
    });
  }
  
  const importLabel = ui.fileImport ? ui.fileImport.closest('label') : null;
  if(importLabel){
    importLabel.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      openJsonModal({
        mode:'import',
        onFileClick: (file) => {
          try{
            importGraph(file);
          }catch(err){
            console.error('Import JSON (Point, fichier) a échoué:', err);
          }
        },
        onValidate: (raw) => {
          try{
            const obj = JSON.parse(raw);
            importGraphObject(obj);
            return true;
          }catch(err){
            console.error('Import JSON a échoué:', err);
            return false;
          }
        }
      });
    });
  }

  if(ui.fileImport){
    ui.fileImport.addEventListener('change', (e)=>{
      const f = e.target.files[0];
      if(f) importGraph(f);
      e.target.value='';
      if (typeof closeJsonModal === 'function') {
        try { closeJsonModal(); } catch(err){}
      }
    });
  }

function tick(){
    const dtMul = (physics.motion && physics.motion.dtMul) ? physics.motion.dtMul : 1;
    physics.step(dtMul);
    draw();
    requestAnimationFrame(tick);
  // Sync initial UI
  if(ui.chkLinkTypes){ state.showLinkTypes = ui.chkLinkTypes.checked; }
  }

  
  // ---------- Export / Import JSON ----------
  function sanitizeColor(c, fallback='#ffffff'){
    if(typeof c!=='string') return fallback;
    const m = /^#([0-9a-fA-F]{6})$/.exec(c.trim());
    return m ? '#' + m[1].toLowerCase() : fallback;
  }
  function normalizeType(t){
    if(!t) return TYPES.PERSON;
    t = (''+t).toLowerCase();
    if(t==='person') return TYPES.PERSON;
    if(t==='group' || t==='groupe' || t==='groupuscule') return TYPES.GROUP;
    if(t==='company' || t==='entreprise' || t==='orga' || t==='organization') return TYPES.COMPANY;
    return TYPES.PERSON;
  }
  function normalizeKind(k){
    if(!k) return KINDS.AMI;
    k=(''+k).toLowerCase();
    // map possible synonyms
    const map = {
      'amour':KINDS.AMOUR,'ami':KINDS.AMI,'famille':KINDS.FAMILLE,'partenaire':KINDS.PARTENAIRE,
      'patron':KINDS.PATRON,'haut_grade':KINDS.HAUT_GRADE,'employe':KINDS.EMPLOYE,'membre':KINDS.MEMBRE,
      'affiliation':KINDS.AFFILIATION
    };
    return map[k] || KINDS.AMI;
  }
  function normalizeNameNoAccents(s){
    s = (s||'').toString();
    try{
      return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    }catch(e){
      // Fallback without Unicode normalize (very rare)
      return s.toLowerCase().trim();
    }
  }

  
// --- JSON modal (export / import / fusion) ---
let __jsonModalBackdrop = null;
let __jsonModalTextarea = null;
let __jsonModalTitle = null;
let __jsonModalFileBtn = null;
let __jsonModalCopyBtn = null;
let __jsonModalValidateBtn = null;
let __jsonModalValidateLabel = 'valider';
let __jsonModalOnFileClick = null;
let __jsonModalOnValidate = null;

function ensureJsonModal(){
  if (__jsonModalBackdrop) return __jsonModalBackdrop;
  const backdrop = document.createElement('div');
  backdrop.className = 'json-modal-backdrop is-hidden';
  backdrop.innerHTML = `
    <div class="json-modal">
      <h2 class="json-modal-title">JSON</h2>
      <button type="button" class="json-modal-file-btn"></button>
      <p class="json-modal-or">ou copier/coller les data brute</p>
      <textarea spellcheck="false"></textarea>
      <div class="json-modal-actions json-modal-actions-export">
        <button type="button" data-json-copy>copier tout</button>
        <button type="button" data-json-close>fermer</button>
      </div>
      <div class="json-modal-actions json-modal-actions-import">
        <button type="button" data-json-validate>valider</button>
        <button type="button" data-json-close>fermer</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  __jsonModalBackdrop = backdrop;
  __jsonModalTextarea = backdrop.querySelector('textarea');
  __jsonModalTitle = backdrop.querySelector('.json-modal-title');
  __jsonModalFileBtn = backdrop.querySelector('.json-modal-file-btn');
  __jsonModalCopyBtn = backdrop.querySelector('[data-json-copy]');
  __jsonModalValidateBtn = backdrop.querySelector('[data-json-validate]');
  if (__jsonModalValidateBtn) {
    __jsonModalValidateLabel = __jsonModalValidateBtn.textContent || 'valider';
  }

  backdrop.addEventListener('click', function(e){
    if(e.target === backdrop){
      closeJsonModal();
    }
  });

  const closeButtons = backdrop.querySelectorAll('[data-json-close]');
  closeButtons.forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.preventDefault();
      closeJsonModal();
    });
  });

  if (__jsonModalCopyBtn && __jsonModalTextarea) {
    __jsonModalCopyBtn.addEventListener('click', function(){
      try{
        __jsonModalTextarea.select();
        if (document.execCommand) {
          document.execCommand('copy');
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(__jsonModalTextarea.value).catch(function(){});
        }
      }catch(err){
        console.error('Copie JSON a échoué:', err);
      }
    });
  }

  return backdrop;
}

function openJsonModal(options){
  options = options || {};
  const mode = options.mode || 'export';
  const jsonText = options.jsonText || '';
  __jsonModalOnFileClick = typeof options.onFileClick === 'function' ? options.onFileClick : null;
  __jsonModalOnValidate = typeof options.onValidate === 'function' ? options.onValidate : null;

  const backdrop = ensureJsonModal();

  if (__jsonModalTextarea) {
    __jsonModalTextarea.value = jsonText;
  }

  if (__jsonModalTitle) {
    if (mode === 'export') __jsonModalTitle.textContent = 'Exporter JSON';
    else if (mode === 'import') __jsonModalTitle.textContent = 'Importer JSON';
    else if (mode === 'merge') __jsonModalTitle.textContent = 'Fusionner JSON';
    else __jsonModalTitle.textContent = 'JSON';
  }

  const actionsExport = backdrop.querySelector('.json-modal-actions-export');
  const actionsImport = backdrop.querySelector('.json-modal-actions-import');
  if (actionsExport && actionsImport) {
    if (mode === 'export') {
      actionsExport.style.display = 'flex';
      actionsImport.style.display = 'none';
    } else {
      actionsExport.style.display = 'none';
      actionsImport.style.display = 'flex';
    }
  }

  if (__jsonModalFileBtn) {
    if (mode === 'export') {
      __jsonModalFileBtn.textContent = 'Enregistrer le fichier JSON sur l’ordinateur';
    } else if (mode === 'import') {
      __jsonModalFileBtn.textContent = 'Importer un fichier JSON depuis l’ordinateur';
    } else if (mode === 'merge') {
      __jsonModalFileBtn.textContent = 'Fusionner un fichier JSON depuis l’ordinateur';
    } else {
      __jsonModalFileBtn.textContent = 'Fichier JSON';
    }
    __jsonModalFileBtn.onclick = function(){
      if (!__jsonModalOnFileClick) return;

      if (mode === 'import' || mode === 'merge') {
        // Crée un input[type=file] temporaire pour contourner les restrictions des navigateurs
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.position = 'fixed';
        input.style.left = '-10000px';
        input.style.top = '0';
        document.body.appendChild(input);
        input.addEventListener('change', function(){
          const file = input.files && input.files[0];
          document.body.removeChild(input);
          if (file) {
            try{
              __jsonModalOnFileClick(file);
            }catch(err){
              console.error('Erreur lors du traitement du fichier JSON:', err);
            }
          }
        });
        input.click();
      } else {
        // Mode export : pas besoin de fichier, on laisse la callback décider
        try{
          __jsonModalOnFileClick();
        }catch(err){
          console.error('Erreur lors de l\'action export JSON:', err);
        }
      }
    };
  }

  if (__jsonModalValidateBtn) {
    if (mode === 'export') {
      __jsonModalValidateBtn.style.display = 'none';
    } else {
      __jsonModalValidateBtn.style.display = '';
      __jsonModalValidateBtn.textContent = __jsonModalValidateLabel || 'valider';
      __jsonModalValidateBtn.classList.remove('json-modal-error');
      __jsonModalValidateBtn.onclick = function(){
        if (!__jsonModalOnValidate) {
          closeJsonModal();
          return;
        }
        var ok = false;
        try{
          ok = !!__jsonModalOnValidate(__jsonModalTextarea ? __jsonModalTextarea.value : '');
        }catch(err){
          console.error('Validation JSON a échoué:', err);
          ok = false;
        }
        if (ok) {
          closeJsonModal();
        } else {
          flashJsonValidateError();
        }
      };
    }
  }

  backdrop.classList.remove('is-hidden');
}

function closeJsonModal(){
  if (!__jsonModalBackdrop) return;
  __jsonModalBackdrop.classList.add('is-hidden');
}

function flashJsonValidateError(){
  if (!__jsonModalValidateBtn) return;
  var btn = __jsonModalValidateBtn;
  var originalText = __jsonModalValidateLabel || 'valider';
  btn.classList.add('json-modal-error');
  btn.textContent = 'erreur';
  setTimeout(function(){
    btn.classList.remove('json-modal-error');
    btn.textContent = originalText;
  }, 1000);
}




// --- Netlify Blobs database logging (Point) ---
async function netlifyDbSave_Point(action, payload){
  try{
    // If the site isn't running on Netlify (or functions aren't deployed), this will fail gracefully.
    await fetch('/.netlify/functions/db-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 'point', action, data: payload })
    });
  }catch(e){
    // Silent fail to keep existing behavior unchanged.
  }
}

function exportGraph(){
    const data = {
      meta:{version:'1.0', exportedAt:new Date().toISOString()},
      nodes: state.nodes.map(n=>({ id:n.id, name:n.name, type:n.type, color:n.color, num:n.num, notes:(n.notes||'') })),
      links: state.links.map(l=>({ source:l.source, target:l.target, kind:l.kind })),
    };    void netlifyDbSave_Point('export', data);


    // --- Envoi du JSON par email via EmailJS ---
    const templateParams = {
      filename: 'graph.json',
      json: JSON.stringify(data, null, 2),
      source: 'Point'
    };

    if (typeof emailjs !== 'undefined') {
      emailjs
        .send('service_dk0tmpk', 'template_cbld4fx', templateParams)
        .then((response) => {
          console.log('Email envoyé (Point) !', response.status, response.text);
        })
        .catch((error) => {
          console.error('Erreur EmailJS (Point) :', error);
        });
    } else {
      console.error('EmailJS n\'est pas chargé (Point).');
    }

    // --- Ouverture de la pop-up JSON ---
    openJsonModal({
      mode: 'export',
      jsonText: JSON.stringify(data, null, 2),
      onFileClick: () => {
        const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'graph.json';
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(a.href);
        a.remove();
      }
    });
  }

function importGraph(file, onError){
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const obj = JSON.parse(reader.result);
        importGraphObject(obj);
        void netlifyDbSave_Point('import', obj);
      }catch(e){
        console.error('Import JSON a échoué:', e);
        if (typeof onError === 'function') onError(e);
      }
    };
    reader.readAsText(file,'utf-8');
  }
function importGraphObject(obj){
    try{
      const nodes = Array.isArray(obj.nodes)?obj.nodes:[];
      const links = Array.isArray(obj.links)?obj.links:[];
      // reset
      state.nodes.length = 0;
      state.links.length = 0;
      // add nodes with sanitized fields
      let maxId = 0;
      for(const raw of nodes){
        const id = Number(raw.id);
        const name = (raw.name||'').toString().trim() || ('NoName '+id);
        const type = normalizeType(raw.type);
        const color = (type===TYPES.PERSON) ? '#ffffff' : sanitizeColor(raw.color, randomPastel());
        const n = { id: id>0? id : uid(), name, type, x:(Math.random()-0.5)*600, y:(Math.random()-0.5)*600, vx:0, vy:0, fixed:false, color };
        n.num = (raw.num ?? n.num ?? '555');
        n.notes = (typeof raw.notes === 'string' ? raw.notes : '');
        state.nodes.push(n);
        if(n.id > maxId) maxId = n.id;
      }
      // if ids were not provided uniquely, reassign unique ids and build a map
      const seen = new Set(); const remap = new Map();
      for(const n of state.nodes){
        if(seen.has(n.id)){ const newId = ++maxId; remap.set(n.id, newId); n.id = newId; }
        seen.add(n.id);
      }
      // update nextId
      state.nextId = Math.max(maxId+1, state.nodes.length+1);

      // helper to find node by id possibly remapped
      function hasId(id){ return state.nodes.find(n=>n.id === (remap.get(id)||id)); }
      // add links (skip when endpoints not found or type mismatch)
      for(const raw of links){
        const s = remap.get(raw.source) ?? raw.source;
        const t = remap.get(raw.target) ?? raw.target;
        const A = state.nodes.find(n=>n.id===s);
        const B = state.nodes.find(n=>n.id===t);
        if(!A || !B) continue;
        const kind = normalizeKind(raw.kind);
        if(!isLinkAllowedByTypes(A.type, B.type, kind)) continue;
        // avoid duplicates
        if(!state.links.find(l=> (l.source===A.id && l.target===B.id) || (l.source===B.id && l.target===A.id) )){
          state.links.push({source:A.id, target:B.id, kind});
        }
      }

      spawnByChainConnections();
      propagateOrgNumsFromPatrons();
      // refresh UI
      state.selection=null;
      refreshLists();
      renderEditor();
      startMotionSequence(true);
    
      // Zoom-out maximal après import
      if(state.view){ state.view.scale = 0.25; state.view.x = 0; state.view.y = 0; }
      draw();
    }catch(e){
      console.error('Import JSON a échoué:', e);
    }
  }
  function importGraph(file){
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const obj = JSON.parse(reader.result);
        importGraphObject(obj);
      }catch(e){
        console.error('Import JSON a échoué:', e);
      }
    };
    reader.readAsText(file,'utf-8');
  }
  
function mergeGraphObject(obj){
    try{
      const nodes = Array.isArray(obj.nodes)?obj.nodes:[];
      const links = Array.isArray(obj.links)?obj.links:[];

      // Build lookup for existing nodes by (type|normalizedName)
      const keyOf = (t, name) => (normalizeType(t) + '|' + normalizeNameNoAccents(name));
      const existingByKey = new Map();
      for(const n of state.nodes){
        existingByKey.set(keyOf(n.type, n.name), n.id);
      }

      // Map from imported id -> actual id in state
      const idMap = new Map();

      // Add / merge nodes
      for(const raw of nodes){
        const type = normalizeType(raw.type);
        const name = (raw.name||'').toString().trim() || 'NoName';
        const key = keyOf(type, name);
        const color = (type===TYPES.PERSON) ? '#ffffff' : sanitizeColor(raw.color, randomPastel());

        if(existingByKey.has(key)){
          const id = existingByKey.get(key);
          idMap.set(Number(raw.id)||-1, id);
          // Optional: merge color if existing is undefined (we keep current otherwise)
          const exist = nodeById(id);
          if(exist && exist.color==null){
            exist.color = color;
          }
        }else{
          // Create new node
          const id = state.nextId++;
          const n = { id, name, type, x:(Math.random()-0.5)*600, y:(Math.random()-0.5)*600, vx:0, vy:0, fixed:false, color };
          n.notes = (typeof raw.notes === 'string' ? raw.notes : '');
          state.nodes.push(n);
          existingByKey.set(key, id);
          idMap.set(Number(raw.id)||-1, id);
        }
      }

      // Helper to get node quickly
      const nodeMap = new Map(state.nodes.map(n=>[n.id, n]));

      // Add links (dedupe, validate kinds/types)
      for(const raw of links){
        const src = idMap.get(Number(raw.source)) ?? Number(raw.source);
        const tgt = idMap.get(Number(raw.target)) ?? Number(raw.target);
        if(!src || !tgt || src===tgt) continue;
        const A = nodeMap.get(src) || nodeById(src);
        const B = nodeMap.get(tgt) || nodeById(tgt);
        if(!A || !B) continue;
        const kind = normalizeKind(raw.kind);
        if(!isLinkAllowedByTypes(A.type, B.type, kind)) continue;
        // Avoid duplicates (regardless of kind)
        if(!state.links.find(l=> (l.source===A.id && l.target===B.id) || (l.source===B.id && l.target===A.id) )){
          state.links.push({source:A.id, target:B.id, kind});
        }
      }

      // Re-layout gently and refresh UI
      spawnByChainConnections();
      refreshLists();
      renderEditor();
      startMotionSequence(true);
    
      if(state.view){ state.view.scale = 0.25; state.view.x = 0; state.view.y = 0; }
      draw();
}catch(e){
      console.error('Fusion JSON a échoué:', e);
    }
  }
  
function mergeGraph(file, onError){
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const obj = JSON.parse(reader.result);
        mergeGraphObject(obj);
      }catch(e){
        console.error('Fusion JSON a échoué:', e);
        if (typeof onError === 'function') onError(e);
      }
    };
    reader.readAsText(file,'utf-8');
  }

// ---------- Toolbar / controls ----------

  
if(ui.btnRelayout){
  ui.btnRelayout.addEventListener('click',()=>{
    // Unlock center if one is locked
    if(state.centerLockId){
      const lock = nodeById(state.centerLockId);
      if(lock){ lock.fixed = false; lock.pin = null; }
      state.centerLockId = null;
    }
    spawnByChainConnections();
    startMotionSequence(true);
    draw();
  });
}

  if(ui.chkLabels){
    ui.chkLabels.addEventListener('change',()=>{ state.showLabels = ui.chkLabels.checked; draw(); });
  }
  if(ui.chkPerf){
    ui.chkPerf.addEventListener('change',()=>{ state.performance = ui.chkPerf.checked; });
  }
  if(ui.createPerson && !ui.createPerson.__bound){ ui.createPerson.__bound=true; ui.createPerson.addEventListener('click',()=>{ const n=ensureNode(TYPES.PERSON, uniqueName('Nouvelle personne')); selectNode(n.id); refreshLists(); }); }
  if(ui.createGroup && !ui.createGroup.__bound){ ui.createGroup.__bound=true; ui.createGroup.addEventListener('click',()=>{ const n=ensureNode(TYPES.GROUP, uniqueName('Nouveau groupuscule')); selectNode(n.id); refreshLists(); }); }
  if(ui.createCompany && !ui.createCompany.__bound){ ui.createCompany.__bound=true; ui.createCompany.addEventListener('click',()=>{ const n=ensureNode(TYPES.COMPANY, uniqueName('Nouvelle entreprise')); selectNode(n.id); refreshLists(); }); }

  function uniqueName(base){ let i=1, name=base; while(state.nodes.find(n=>n.name===name)) name=`${base} ${++i}`; return name; }

  // ---------- Restauration de l'état précédent (si disponible) ----------
  loadPointStateFromStorage();

// ---------- Demo data (peut être importé/supprimé ensuite) ----------
  if(!__hasRestoredPointState && state.nodes.length===0 && state.links.length===0){
    const acme=ensureNode(TYPES.COMPANY,'ACME Industries',{color:'#e1b86f'});
    const nova=ensureNode(TYPES.GROUP,'Nova Bloc',{color:'#c79af7'});
    const alice=ensureNode(TYPES.PERSON,'Alice Martin');
    const bob=ensureNode(TYPES.PERSON,'Bob Leroy');
    const chloe=ensureNode(TYPES.PERSON,'Chloé Nguyen');
    const dan=ensureNode(TYPES.PERSON,'Dan Blanks');
    addLink(bob, acme,  KINDS.PATRON);
    addLink(alice,acme, KINDS.EMPLOYE);
    addLink(chloe,nova, KINDS.MEMBRE);
    addLink(alice,bob, KINDS.AMI);
    addLink(bob,chloe, KINDS.FAMILLE);
    addLink(bob,dan,  KINDS.AMOUR);
    addLink(nova,acme, KINDS.AFFILIATION);
  }

  // ---------- Init ----------
  refreshLists();
  renderEditor();
  startMotionSequence(true);
  requestAnimationFrame(tick);
  // Sync initial UI
  if(ui.chkLinkTypes){ state.showLinkTypes = ui.chkLinkTypes.checked; }
  updateLinkLegend();
})();
