import { state, saveState } from './state.js';
import { getSimulation } from './physics.js';
import { draw } from './render.js';
import { screenToWorld, clamp } from './utils.js';
import { selectNode, renderEditor, updatePathfindingPanel, addLink } from './ui.js';

function getCanvasEventPosition(event, canvas) {
    const source = event?.sourceEvent || event;
    const rect = canvas.getBoundingClientRect();
    const touch = source?.touches?.[0] || source?.changedTouches?.[0] || null;
    const clientX = Number(touch?.clientX ?? source?.clientX ?? 0);
    const clientY = Number(touch?.clientY ?? source?.clientY ?? 0);

    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

function getWorldPositionFromEvent(event, canvas) {
    const point = getCanvasEventPosition(event, canvas);
    return screenToWorld(point.x, point.y, canvas, state.view);
}

export function setupCanvasEvents(canvas) {
    const NODE_DRAG_THRESHOLD_PX = 6;
    
    // 1. ZOOM (CORRIGÉ ET SYNCHRONISÉ)
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const mouse = getCanvasEventPosition(e, canvas);

        // 1. Où est la souris dans le monde AVANT le zoom ?
        // On utilise la fonction centralisée screenToWorld pour être cohérent avec le clic
        const mouseBefore = screenToWorld(mouse.x, mouse.y, canvas, state.view);

        // 2. Calcul du nouveau zoom
        const delta = (e.deltaY < 0) ? 1.1 : 0.9;
        const newScale = clamp(state.view.scale * delta, 0.1, 5.0);

        // 3. Application du zoom
        state.view.scale = newScale;

        // 4. Recalcul de la position (Pan) pour que la souris reste au même endroit du monde
        // Formule inverse de screenToWorld :
        // screenX = worldX * scale + viewX + width/2
        // => viewX = screenX - width/2 - worldX * scale
        state.view.x = mouse.x - canvas.clientWidth / 2 - (mouseBefore.x * newScale);
        state.view.y = mouse.y - canvas.clientHeight / 2 - (mouseBefore.y * newScale);

        draw();
    }, { passive: false });


    // 2. SOURIS (CLIC & DRAG MANUEL)
    let isPanning = false;
    let lastPan = { x: 0, y: 0 };
    let dragLinkSource = null;
    let suppressNextClick = false;

    canvas.addEventListener('mousedown', (e) => {
        const sim = getSimulation();
        if (!sim) return; 

        // Calcul précis de la position monde
        const p = getWorldPositionFromEvent(e, canvas);
        
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
        
        // Cas 2 : Panoramique (Clic Gauche DANS LE VIDE)
        // On vérifie bien !hit pour ne pas bouger si on est sur un noeud
        if (!hit && e.button === 0) {
            isPanning = true; 
            suppressNextClick = true;
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
            const p = getWorldPositionFromEvent(e, canvas);
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
            const p = getWorldPositionFromEvent(e, canvas);
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
            const p = getWorldPositionFromEvent(e, canvas);
            const hit = sim ? sim.find(p.x, p.y, 40) : null; 
            suppressNextClick = true;
            
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

    canvas.addEventListener('click', (e) => {
        if (suppressNextClick) {
            suppressNextClick = false;
            return;
        }
        if (e.shiftKey || e.button !== 0) return;

        const sim = getSimulation();
        if (!sim) return;

        const p = getWorldPositionFromEvent(e, canvas);
        const hit = sim.find(p.x, p.y, 40);
        if (hit) {
            selectNode(hit.id);
        }
    });
    
    canvas.addEventListener('mouseleave', () => {
        isPanning = false; state.hoverId = null; dragLinkSource = null; state.tempLink = null; suppressNextClick = false; draw();
    });

    // 3. CONFIGURATION D3 DRAG (Pour bouger les nœuds)
    d3.select(canvas).call(d3.drag()
        .container(canvas)
        .filter(event => !event.shiftKey && event.button === 0) // Uniquement Clic Gauche sans Shift
        .subject(e => {
            const sim = getSimulation();
            if (!sim) return null;
            // On utilise screenToWorld ici aussi pour être cohérent !
            const p = getWorldPositionFromEvent(e, canvas);
            return sim.find(p.x, p.y, 40);
        })
        .on("start", e => {
            const sim = getSimulation();
            if (!sim) return;
            if (!e.active) sim.alphaTarget(0.3).restart();
            if (e.subject) {
                e.subject.__dragStartClientX = Number(e.sourceEvent?.clientX || 0);
                e.subject.__dragStartClientY = Number(e.sourceEvent?.clientY || 0);
                e.subject.__dragMoved = false;
                e.subject.fx = e.subject.x; 
                e.subject.fy = e.subject.y; 
            }
        })
        .on("drag", e => {
            if (e.subject) {
                const dx = Math.abs(Number(e.sourceEvent?.clientX || 0) - Number(e.subject.__dragStartClientX || 0));
                const dy = Math.abs(Number(e.sourceEvent?.clientY || 0) - Number(e.subject.__dragStartClientY || 0));
                if (!e.subject.__dragMoved && dx < NODE_DRAG_THRESHOLD_PX && dy < NODE_DRAG_THRESHOLD_PX) {
                    return;
                }
                e.subject.__dragMoved = true;
                suppressNextClick = true;

                // Conversion continue pendant le mouvement
                const p = getWorldPositionFromEvent(e, canvas);
                e.subject.fx = p.x; 
                e.subject.fy = p.y;
            }
        })
        .on("end", e => {
            const sim = getSimulation();
            if (!sim) return;
            if (!e.active) sim.alphaTarget(0);
            if (e.subject) {
                const moved = Boolean(e.subject.__dragMoved);
                e.subject.fx = null; 
                e.subject.fy = null; 
                delete e.subject.__dragMoved;
                delete e.subject.__dragStartClientX;
                delete e.subject.__dragStartClientY;

                if (moved) {
                    saveState();
                }
            }
        })
    );
}
