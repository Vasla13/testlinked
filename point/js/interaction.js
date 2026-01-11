import { state, saveState } from './state.js';
import { getSimulation } from './physics.js';
import { draw } from './render.js';
import { screenToWorld, clamp } from './utils.js';
import { selectNode, renderEditor, updatePathfindingPanel, addLink } from './ui.js';

export function setupCanvasEvents(canvas) {
    
    // 1. ZOOM (CORRIGÉ : VERS LA SOURIS)
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();

        // Position de la souris sur l'écran (repère canvas)
        const mouseX = e.offsetX;
        const mouseY = e.offsetY;

        // Facteur de zoom
        const delta = (e.deltaY < 0) ? 1.1 : 0.9;
        const oldScale = state.view.scale;
        const newScale = clamp(oldScale * delta, 0.1, 5.0);

        // Mathématique du zoom vers curseur :
        // On veut que le point sous la souris reste sous la souris après le zoom.
        // P_ecran = P_monde * scale + translate
        // translate_nouveau = P_ecran - (P_monde * scale_nouveau)
        // Or P_monde = (P_ecran - translate_vieux) / scale_vieux
        
        // 1. On calcule le monde sous la souris
        const worldX = (mouseX - canvas.width/2 - state.view.x) / oldScale;
        const worldY = (mouseY - canvas.height/2 - state.view.y) / oldScale;

        // 2. On met à jour l'échelle
        state.view.scale = newScale;

        // 3. On recalcule la translation pour que worldX/Y revienne sous mouseX/Y
        state.view.x = mouseX - canvas.width/2 - (worldX * newScale);
        state.view.y = mouseY - canvas.height/2 - (worldY * newScale);

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
        const hit = sim.find(p.x, p.y, 30); 
        
        if (e.shiftKey && hit) {
            dragLinkSource = hit;
            state.tempLink = { x1: hit.x, y1: hit.y, x2: hit.x, y2: hit.y };
            draw(); 
            e.stopImmediatePropagation(); 
            return;
        }
        
        if (!hit) {
            isPanning = true; 
            lastPan = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
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
        
        if (dragLinkSource) { 
            state.tempLink.x2 = p.x; state.tempLink.y2 = p.y; 
            draw(); return; 
        }
        
        if (isPanning) {
            const dx = e.clientX - lastPan.x; 
            const dy = e.clientY - lastPan.y;
            lastPan = { x: e.clientX, y: e.clientY };
            state.view.x += dx; state.view.y += dy; 
            draw(); return; 
        }
        
        const sim = getSimulation();
        if (sim) {
            const hit = sim.find(p.x, p.y, 25);
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

        if (dragLinkSource && sim) {
            const hit = sim.find(p.x, p.y, 40); 
            if (hit && hit.id !== dragLinkSource.id) {
                const success = addLink(dragLinkSource, hit, null); 
                if (success) selectNode(dragLinkSource.id);
            }
            dragLinkSource = null; state.tempLink = null; 
            draw(); return;
        }
        
        if (isPanning) { isPanning = false; canvas.style.cursor = 'default'; }
    });
    
    canvas.addEventListener('mouseleave', () => { 
        isPanning = false; state.hoverId = null; dragLinkSource = null; state.tempLink = null; draw(); 
    });

    d3.select(canvas).call(d3.drag()
        .container(canvas)
        .filter(event => !event.shiftKey)
        .subject(e => {
            const sim = getSimulation();
            if (!sim) return null;
            const p = screenToWorld(e.sourceEvent.offsetX, e.sourceEvent.offsetY, canvas, state.view);
            return sim.find(p.x, p.y, 30);
        })
        .on("start", e => {
            const sim = getSimulation();
            if (!sim) return;
            if (!e.active) sim.alphaTarget(0.3).restart();
            if (e.subject) {
                e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; selectNode(e.subject.id); 
            }
        })
        .on("drag", e => {
            if (e.subject) {
                const p = screenToWorld(e.sourceEvent.offsetX, e.sourceEvent.offsetY, canvas, state.view);
                e.subject.fx = p.x; e.subject.fy = p.y;
            }
        })
        .on("end", e => {
            const sim = getSimulation();
            if (!sim) return;
            if (!e.active) sim.alphaTarget(0);
            if (e.subject) {
                e.subject.fx = null; e.subject.fy = null; saveState(); 
            }
        })
    );
}