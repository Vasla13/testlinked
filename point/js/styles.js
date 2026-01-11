export function injectStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
        .editor { width: 380px !important; }
        #editorBody { max-height: calc(100vh - 180px); overflow-y: auto; padding-right: 5px; }
        #editorBody::-webkit-scrollbar { width: 5px; }
        #editorBody::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
        
        details { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; margin-bottom: 8px; padding: 5px; }
        summary { cursor: pointer; font-weight: bold; font-size: 0.85rem; color: var(--accent-cyan); padding: 4px 0; list-style: none; display: flex; align-items: center; justify-content: space-between; }
        summary::after { content: '+'; font-size: 1rem; font-weight: bold; }
        details[open] summary::after { content: '-'; }
        
        .flex-row-force { display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; align-items: center !important; width: 100% !important; gap: 5px !important; }
        .flex-grow-input { flex: 1 1 auto !important; min-width: 0 !important; width: 100% !important; }
        .compact-select { flex: 0 0 100px !important; width: 100px !important; font-size: 0.75rem !important; padding: 2px !important; }
        .mini-btn { flex: 0 0 30px !important; width: 30px !important; padding: 0 !important; text-align: center !important; justify-content: center !important; }

        .link-category { margin-top: 10px; margin-bottom: 2px; font-size: 0.65rem; color: #888; text-transform: uppercase; border-bottom: 1px solid #333; }
        
        /* CHIPS COMPACTS (STYLE EXCEL/CYBER) */
        .chip { 
            display: flex; align-items: center; justify-content: space-between; 
            background: rgba(20, 20, 30, 0.4); border-left: 3px solid #888; 
            border-radius: 0 3px 3px 0; padding: 2px 6px; margin-bottom: 3px; 
            transition: all 0.2s; height: 24px;
        }
        .chip:hover { background: rgba(255,255,255,0.08); }
        .chip-content { display: flex; align-items: center; flex: 1; min-width: 0; gap: 8px; }
        .chip-name { font-weight: 500; font-size: 0.8rem; cursor: pointer; color: #ddd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chip-name:hover { text-decoration: underline; color: #fff; }
        .chip-meta { margin-left: auto; }
        .chip-badge { font-size: 0.65rem; font-weight: bold; text-transform: uppercase; opacity: 0.9; white-space: nowrap; }
        .x { padding: 0 0 0 8px; cursor: pointer; color: #666; font-size: 1rem; font-weight: bold; }
        .x:hover { color: #ff5555; }

        /* FILTER BAR DOCK STYLE */
        #filter-bar {
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(10, 15, 30, 0.9); border: 1px solid rgba(0, 255, 255, 0.2);
            border-radius: 12px; padding: 6px; display: flex; gap: 5px;
            backdrop-filter: blur(5px); z-index: 1000; box-shadow: 0 5px 20px rgba(0,0,0,0.6);
        }
        .filter-btn {
            background: rgba(255,255,255,0.05); border: 1px solid transparent; color: #aaa;
            padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 0.75rem;
            font-weight: bold; text-transform: uppercase; transition: all 0.2s;
            min-width: 80px; text-align: center;
        }
        .filter-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
        .filter-btn.active { 
            background: rgba(0, 255, 255, 0.15); color: var(--accent-cyan); 
            border-color: var(--accent-cyan); box-shadow: 0 0 10px rgba(0, 255, 255, 0.2);
        }
        
        /* HUD REMONTÉ */
        #hud { bottom: 70px; border-radius: 8px; padding: 5px 15px; }
    `;
    document.head.appendChild(style);
}