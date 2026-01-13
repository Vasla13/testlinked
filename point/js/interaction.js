import { state, saveState } from './state.js';
import { getSimulation } from './physics.js';
import { draw } from './render.js';
import { screenToWorld, clamp } from './utils.js';
import { selectNode, renderEditor, updatePathfindingPanel, addLink } from './ui.js';

export function setupCanvasEvents(canvas) {
    
    // 1. ZOOM (CORRIGÉ ET SYNCHRONISÉ)
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();

        // 1. Où est la souris dans le monde AVANT le zoom ?
        // On utilise la fonction centralisée screenToWorld pour être cohérent avec le clic
        const mouseBefore = screenToWorld(e.offsetX, e.offsetY, canvas, state.view);

        // 2. Calcul du nouveau zoom
        const delta = (e.deltaY < 0) ? 1.1 : 0.9;
        const newScale = clamp(state.view.scale * delta, 0.1, 5.0);

        // 3. Application du zoom
        state.view.scale = newScale;

        // 4. Recalcul de la position (Pan) pour que la souris reste au même endroit du monde
        // Formule inverse de screenToWorld :
        // screenX = worldX * scale + viewX + width/2
        // => viewX = screenX - width/2 - worldX * scale
        state.view.x = e.offsetX - canvas.clientWidth / 2 - (mouseBefore.x * newScale);
        state.view.y = e.offsetY - canvas.clientHeight / 2 - (mouseBefore.y * newScale);

        draw();
    }, { passive: false });


    // 2. SOURIS (CLIC & DRAG MANUEL)
    let isPanning = false;
    let lastPan = { x: 0, y: 0 };
    let dragLinkSource = null;

    canvas.addEventListener('mousedown', (e) => {
        const sim = getSimulation();
        if (!sim) return; 

        // Calcul précis de la position monde
        const p = screenToWorld(e.offsetX, e.offsetY, canvas, state.view);
        
        // On cherche un nœud sous la souris (Rayon 40px)
        const hit = sim.find(p.x, p.y, 40); 
        
        // Cas 1 : Création de lien (Shift + Clic)
        if (e.shiftKey && hit) {
            dragLinkSource = hit;
            state.tempLink = { x1: hit.x, y1: hit.y, x2: hit.x, y2: hit.y };
            draw(); 
            e.stopImmediatePropagation(); // Empêche D3 d'interférer
            return;
        }
        
        // Cas 2 : Sélection simple (Clic Gauche sur un point)
        if (hit && e.button === 0) {
            // C'est ici que ça bloquait : on force la sélection maintenant
            selectNode(hit.id);
            draw();
            // On laisse l'événement se propager pour que D3 puisse lancer le drag si on bouge
        }
        
        // Cas 3 : Panoramique (Clic Gauche DANS LE VIDE)
        // On vérifie bien !hit pour ne pas bouger si on est sur un noeud
        if (!hit && e.button === 0) {
            isPanning = true; 
            lastPan = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
            
            // Désélection si on clique dans le vide
            if (state.selection) { 
                state.selection = null; 
                renderEditor(); 
                updatePathfindingPanel(); 
                draw(); 
            }
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        // Mode création de lien (visuel)
        if (dragLinkSource) { 
            const p = screenToWorld(e.offsetX, e.offsetY, canvas, state.view);
            state.tempLink.x2 = p.x; state.tempLink.y2 = p.y; 
            draw(); return; 
        }
        
        // Mode Panoramique (Déplacement carte)
        if (isPanning) {
            const dx = e.clientX - lastPan.x; 
            const dy = e.clientY - lastPan.y;
            lastPan = { x: e.clientX, y: e.clientY };
            state.view.x += dx; state.view.y += dy; 
            draw(); return; 
        }
        
        // Changement curseur au survol
        const sim = getSimulation();
        if (sim && !isPanning && !dragLinkSource) {
            const p = screenToWorld(e.offsetX, e.offsetY, canvas, state.view);
            const hit = sim.find(p.x, p.y, 40);
            if (hit) { 
                if (state.hoverId !== hit.id) { state.hoverId = hit.id; canvas.style.cursor = 'pointer'; draw(); } 
            } else { 
                if (state.hoverId !== null) { state.hoverId = null; canvas.style.cursor = 'default'; draw(); } 
            }
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        // Fin création lien
        if (dragLinkSource) {
            const sim = getSimulation();
            const p = screenToWorld(e.offsetX, e.offsetY, canvas, state.view);
            const hit = sim ? sim.find(p.x, p.y, 40) : null; 
            
            if (hit && hit.id !== dragLinkSource.id) {
                const success = addLink(dragLinkSource, hit, null); 
                if (success) selectNode(dragLinkSource.id);
            }
            dragLinkSource = null; state.tempLink = null; 
            draw(); return;
        }
        
        // Fin Panoramique
        if (isPanning) { isPanning = false; canvas.style.cursor = 'default'; }
    });
    
    canvas.addEventListener('mouseleave', () => { 
        isPanning = false; state.hoverId = null; dragLinkSource = null; state.tempLink = null; draw(); 
    });

    // 3. CONFIGURATION D3 DRAG (Pour bouger les nœuds)
    d3.select(canvas).call(d3.drag()
        .container(canvas)
        .filter(event => !event.shiftKey && event.button === 0) // Uniquement Clic Gauche sans Shift
        .subject(e => {
            const sim = getSimulation();
            if (!sim) return null;
            // On utilise screenToWorld ici aussi pour être cohérent !
            const p = screenToWorld(e.sourceEvent.offsetX, e.sourceEvent.offsetY, canvas, state.view);
            return sim.find(p.x, p.y, 40);
        })
        .on("start", e => {
            const sim = getSimulation();
            if (!sim) return;
            if (!e.active) sim.alphaTarget(0.3).restart();
            if (e.subject) {
                e.subject.fx = e.subject.x; 
                e.subject.fy = e.subject.y; 
                selectNode(e.subject.id); // Sélectionne aussi quand on commence à drag
            }
        })
        .on("drag", e => {
            if (e.subject) {
                // Conversion continue pendant le mouvement
                const p = screenToWorld(e.sourceEvent.offsetX, e.sourceEvent.offsetY, canvas, state.view);
                e.subject.fx = p.x; 
                e.subject.fy = p.y;
            }
        })
        .on("end", e => {
            const sim = getSimulation();
            if (!sim) return;
            if (!e.active) sim.alphaTarget(0);
            if (e.subject) {
                e.subject.fx = null; 
                e.subject.fy = null; 
                saveState(); 
            }
        })
    );
}