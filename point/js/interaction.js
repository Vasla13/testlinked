import { state, saveState } from './state.js';
import { getSimulation } from './physics.js';
import { draw } from './render.js';
import { screenToWorld, clamp } from './utils.js';
import { selectNode, renderEditor, updatePathfindingPanel, addLink } from './ui.js';

export function setupCanvasEvents(canvas) {
    
    // 1. ZOOM (CORRIGÉ : Coordonnées Logiques)
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();

        // Position de la souris (Repère Canvas)
        const mouseX = e.offsetX;
        const mouseY = e.offsetY;

        // Facteur de zoom
        const delta = (e.deltaY < 0) ? 1.1 : 0.9;
        const oldScale = state.view.scale;
        const newScale = clamp(oldScale * delta, 0.1, 5.0);

        // CORRECTION MAJEURE ICI : Utilisation de clientWidth/Height (taille d'affichage)
        // au lieu de width/height (taille pixels physiques) pour éviter le décalage Retina/HD.
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        // 1. Calcul du point monde sous la souris avant zoom
        const worldX = (mouseX - width/2 - state.view.x) / oldScale;
        const worldY = (mouseY - height/2 - state.view.y) / oldScale;

        // 2. Application du nouveau scale
        state.view.scale = newScale;

        // 3. Recalcul de la translation pour garder le point sous la souris
        state.view.x = mouseX - width/2 - (worldX * newScale);
        state.view.y = mouseY - height/2 - (worldY * newScale);

        draw();
    }, { passive: false });

    // 2. SOURIS (Drag & Click)
    let isPanning = false;
    let lastPan = { x: 0, y: 0 };
    let dragLinkSource = null;

    canvas.addEventListener('mousedown', (e) => {
        const sim = getSimulation();
        if (!sim) return; 

        const p = screenToWorld(e.offsetX, e.offsetY, canvas, state.view);
        
        // Rayon de détection légèrement augmenté pour faciliter le clic (30 -> 40)
        const hit = sim.find(p.x, p.y, 40); 
        
        // Cas 1 : Création de lien (Shift + Clic)
        if (e.shiftKey && hit) {
            dragLinkSource = hit;
            state.tempLink = { x1: hit.x, y1: hit.y, x2: hit.x, y2: hit.y };
            draw(); 
            e.stopImmediatePropagation(); 
            return;
        }
        
        // Cas 2 : Sélection simple (Clic Gauche sur un point)
        if (hit && e.button === 0) {
            // On force la sélection ici pour être sûr (même si D3 drag ne se lance pas)
            selectNode(hit.id);
            draw();
        }
        
        // Cas 3 : Panoramique (Clic Gauche dans le vide)
        // On vérifie e.button === 0 pour ne pas bouger avec le clic droit
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
        const p = screenToWorld(e.offsetX, e.offsetY, canvas, state.view);
        
        // Mode création de lien
        if (dragLinkSource) { 
            state.tempLink.x2 = p.x; state.tempLink.y2 = p.y; 
            draw(); return; 
        }
        
        // Mode Panoramique
        if (isPanning) {
            const dx = e.clientX - lastPan.x; 
            const dy = e.clientY - lastPan.y;
            lastPan = { x: e.clientX, y: e.clientY };
            state.view.x += dx; state.view.y += dy; 
            draw(); return; 
        }
        
        // Curseur Pointer au survol
        const sim = getSimulation();
        if (sim) {
            const hit = sim.find(p.x, p.y, 30);
            if (hit) { 
                if (state.hoverId !== hit.id) { state.hoverId = hit.id; canvas.style.cursor = 'pointer'; draw(); } 
            } else { 
                if (state.hoverId !== null) { state.hoverId = null; canvas.style.cursor = 'default'; draw(); } 
            }
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        const p = screenToWorld(e.offsetX, e.offsetY, canvas, state.view);
        const sim = getSimulation();

        // Fin création lien
        if (dragLinkSource && sim) {
            const hit = sim.find(p.x, p.y, 40); 
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

    // Gestion Drag & Drop des nœuds avec D3
    d3.select(canvas).call(d3.drag()
        .container(canvas)
        .filter(event => !event.shiftKey && event.button === 0) // Uniquement Clic Gauche
        .subject(e => {
            const sim = getSimulation();
            if (!sim) return null;
            const p = screenToWorld(e.sourceEvent.offsetX, e.sourceEvent.offsetY, canvas, state.view);
            return sim.find(p.x, p.y, 40); // Rayon cohérent avec mousedown
        })
        .on("start", e => {
            const sim = getSimulation();
            if (!sim) return;
            if (!e.active) sim.alphaTarget(0.3).restart();
            if (e.subject) {
                e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; 
                selectNode(e.subject.id); // Sélection au début du drag
            }
        })
        .on("drag", e => {
            if (e.subject) {
                // Conversion écran -> monde continue pendant le drag
                const p = screenToWorld(e.sourceEvent.offsetX, e.sourceEvent.offsetY, canvas, state.view);
                e.subject.fx = p.x; e.subject.fy = p.y;
            }
        })
        .on("end", e => {
            const sim = getSimulation();
            if (!sim) return;
            if (!e.active) sim.alphaTarget(0);
            if (e.subject) {
                e.subject.fx = null; e.subject.fy = null; // Relâche la physique
                saveState(); 
            }
        })
    );
}