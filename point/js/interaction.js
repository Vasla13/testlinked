import { state, saveState } from './state.js';
import { getSimulation } from './physics.js';
import { draw } from './render.js';
import { screenToWorld, clamp } from './utils.js';
import { selectNode, renderEditor, updatePathfindingPanel, addLink } from './ui.js'; // Import cyclique géré par les modules

export function setupCanvasEvents(canvas) {
    
    // 1. ZOOM (Wheel)
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const m = screenToWorld(e.offsetX, e.offsetY, canvas, state.view);
        const delta = clamp((e.deltaY < 0 ? 1.1 : 0.9), 0.2, 5);
        state.view.scale = clamp(state.view.scale * delta, 0.1, 4.0);
        state.view.x += (m.x * state.view.scale + state.view.x + canvas.width/2 - e.offsetX) * (1 - delta);
        draw();
    }, { passive: false });

    // 2. SOURIS (Drag & Click)
    let isPanning = false;
    let lastPan = { x: 0, y: 0 };
    let dragLinkSource = null;

    canvas.addEventListener('mousedown', (e) => {
        const p = screenToWorld(e.offsetX, e.offsetY, canvas, state.view);
        const hit = getSimulation().find(p.x, p.y, 30); 
        
        // Mode Création de lien (Shift + Click)
        if (e.shiftKey && hit) {
            dragLinkSource = hit;
            state.tempLink = { x1: hit.x, y1: hit.y, x2: hit.x, y2: hit.y };
            draw(); 
            e.stopImmediatePropagation(); 
            return;
        }
        
        // Mode Panoramique (Click dans le vide)
        if (!hit) {
            isPanning = true; 
            lastPan = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
            // Désélection si clic vide
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
        
        // Dessin du lien temporaire
        if (dragLinkSource) { 
            state.tempLink.x2 = p.x; 
            state.tempLink.y2 = p.y; 
            draw(); 
            return; 
        }
        
        // Mouvement Panoramique
        if (isPanning) {
            const dx = e.clientX - lastPan.x; 
            const dy = e.clientY - lastPan.y;
            lastPan = { x: e.clientX, y: e.clientY };
            state.view.x += dx; 
            state.view.y += dy; 
            draw(); 
            return; 
        }
        
        // Hover Effect
        const hit = getSimulation().find(p.x, p.y, 25);
        if (hit) { 
            if (state.hoverId !== hit.id) { 
                state.hoverId = hit.id; 
                canvas.style.cursor = 'pointer'; 
                draw(); 
            } 
        } else { 
            if (state.hoverId !== null) { 
                state.hoverId = null; 
                canvas.style.cursor = 'default'; 
                draw(); 
            } 
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        const p = screenToWorld(e.offsetX, e.offsetY, canvas, state.view);
        
        // Fin création lien
        if (dragLinkSource) {
            const hit = getSimulation().find(p.x, p.y, 40); 
            if (hit && hit.id !== dragLinkSource.id) {
                // Utilise la fonction addLink importée de UI/Logic
                const success = addLink(dragLinkSource, hit, null); 
                if (success) selectNode(dragLinkSource.id);
            }
            dragLinkSource = null; 
            state.tempLink = null; 
            draw(); 
            return;
        }
        
        // Fin Panoramique
        if (isPanning) { 
            isPanning = false; 
            canvas.style.cursor = 'default'; 
        }
    });
    
    canvas.addEventListener('mouseleave', () => { 
        isPanning = false; 
        state.hoverId = null; 
        dragLinkSource = null; 
        state.tempLink = null; 
        draw(); 
    });

    // 3. D3 DRAG (Pour déplacer les nœuds physique)
    // Nécessite d3 global
    d3.select(canvas).call(d3.drag()
        .container(canvas)
        .filter(event => !event.shiftKey) // Ignore si shift (car c'est pour créer un lien)
        .subject(e => {
            const p = screenToWorld(e.sourceEvent.offsetX, e.sourceEvent.offsetY, canvas, state.view);
            return getSimulation().find(p.x, p.y, 30);
        })
        .on("start", e => {
            if (!e.active) getSimulation().alphaTarget(0.3).restart();
            e.subject.fx = e.subject.x; 
            e.subject.fy = e.subject.y; 
            selectNode(e.subject.id); 
        })
        .on("drag", e => {
            const p = screenToWorld(e.sourceEvent.offsetX, e.sourceEvent.offsetY, canvas, state.view);
            e.subject.fx = p.x; 
            e.subject.fy = p.y;
        })
        .on("end", e => {
            if (!e.active) getSimulation().alphaTarget(0);
            e.subject.fx = null; 
            e.subject.fy = null; 
            saveState(); 
        })
    );
}