export function injectStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
        /* --- BASICS --- */
        .editor { width: 380px !important; }
        #editorBody { max-height: calc(100vh - 180px); overflow-y: auto; padding-right: 5px; }
        #editorBody::-webkit-scrollbar { width: 5px; }
        #editorBody::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
        
        details { 
            background: rgba(255,255,255,0.02); 
            border: 1px solid rgba(255,255,255,0.05); 
            border-radius: 6px; 
            margin-bottom: 8px; 
            padding: 8px; 
        }
        summary { 
            cursor: pointer; font-weight: bold; font-size: 0.8rem; 
            color: var(--accent-cyan); 
            list-style: none; display: flex; align-items: center; justify-content: space-between; 
        }
        summary::after { content: '+'; font-size: 1rem; font-weight: bold; opacity:0.5; }
        details[open] summary::after { content: '-'; }
        
        .flex-row-force { display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; align-items: center !important; width: 100% !important; gap: 5px !important; }
        .flex-grow-input { flex: 1 1 auto !important; min-width: 0 !important; width: 100% !important; }
        .compact-select { flex: 0 0 auto !important; font-size: 0.75rem !important; padding: 2px !important; }
        
        /* MINI BOUTONS REFAITS */
        .mini-btn { 
            flex: 0 0 auto; 
            padding: 4px 8px; 
            text-align: center; 
            justify-content: center; 
            font-size: 0.75rem;
            border-radius: 4px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            color: #ccc;
        }
        .mini-btn:hover { background: rgba(255,255,255,0.1); color:#fff; }
        .mini-btn.active { background: var(--accent-cyan); color:#000; border-color:var(--accent-cyan); }
        .mini-btn.primary { background: rgba(115, 251, 247, 0.2); border-color: var(--accent-cyan); color: var(--accent-cyan); }

        .link-category { margin-top: 10px; margin-bottom: 4px; font-size: 0.65rem; color: #666; text-transform: uppercase; font-weight:bold; letter-spacing:1px; }
        
        .chip { display: flex; align-items: center; justify-content: space-between; background: rgba(20, 20, 30, 0.4); border-left: 3px solid #888; border-radius: 0 3px 3px 0; padding: 2px 6px; margin-bottom: 3px; transition: all 0.2s; height: 26px; }
        .chip:hover { background: rgba(255,255,255,0.08); }
        .chip-content { display: flex; align-items: center; flex: 1; min-width: 0; gap: 8px; }
        .chip-name { font-weight: 500; font-size: 0.8rem; cursor: pointer; color: #ddd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chip-name:hover { text-decoration: underline; color: #fff; }
        .chip-meta { margin-left: auto; }
        .chip-badge { font-size: 0.65rem; font-weight: bold; text-transform: uppercase; opacity: 0.9; white-space: nowrap; }
        .x { padding: 0 0 0 8px; cursor: pointer; color: #666; font-size: 1rem; font-weight: bold; }
        .x:hover { color: #ff5555; }

        /* HUD & DOCK */
        #filter-bar {
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(5, 7, 20, 0.9); border: 1px solid rgba(115, 251, 247, 0.3);
            border-radius: 6px; padding: 4px; display: flex; gap: 4px;
            backdrop-filter: blur(10px); z-index: 1000; box-shadow: 0 5px 20px rgba(0,0,0,0.8);
        }
        .filter-btn {
            background: transparent; border: 1px solid transparent; color: #8b9bb4;
            padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.75rem;
            font-weight: 600; text-transform: uppercase; transition: all 0.2s;
            min-width: 80px; text-align: center; letter-spacing: 1px;
        }
        .filter-btn:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .filter-btn.active { 
            background: rgba(115, 251, 247, 0.1); color: var(--accent-cyan); 
            border-color: var(--accent-cyan); box-shadow: 0 0 15px rgba(115, 251, 247, 0.15);
        }
        
        #hud { 
            bottom: 70px; border-radius: 4px; padding: 6px 15px; 
            background: rgba(5, 7, 20, 0.95); border: 1px solid rgba(115, 251, 247, 0.3);
            display: flex; align-items: center; gap: 15px;
        }

        .icon-svg { width: 16px; height: 16px; fill: currentColor; display: block; }
        
        .hud-btn {
            background: transparent; border: none; color: #8b9bb4; cursor: pointer;
            display: flex; align-items: center; gap: 6px; font-family: var(--font-main);
            font-size: 0.8rem; text-transform: uppercase; font-weight: 600;
            padding: 6px; transition: all 0.2s; border-radius: 4px;
        }
        .hud-btn:hover { color: var(--accent-cyan); background: rgba(115, 251, 247, 0.05); }
        .hud-btn.active { color: var(--accent-cyan); text-shadow: 0 0 8px rgba(115, 251, 247, 0.6); }

        .hud-toggle {
            display: flex; align-items: center; gap: 8px; cursor: pointer; 
            color: #8b9bb4; font-size: 0.8rem; text-transform: uppercase; font-weight: 600;
            transition: color 0.2s;
        }
        .hud-toggle:hover { color: #fff; }
        .hud-toggle input { display: none; }
        
        .toggle-track {
            width: 24px; height: 12px; background: #333; border-radius: 10px;
            position: relative; transition: background 0.3s;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);
        }
        .toggle-thumb {
            width: 10px; height: 10px; background: #888; border-radius: 50%;
            position: absolute; top: 1px; left: 1px; transition: transform 0.3s, background 0.3s;
        }
        .hud-toggle input:checked + .toggle-track { background: rgba(115, 251, 247, 0.2); border: 1px solid var(--accent-cyan); }
        .hud-toggle input:checked + .toggle-track .toggle-thumb { transform: translateX(12px); background: var(--accent-cyan); box-shadow: 0 0 8px var(--accent-cyan); }

        #btnHVT { border: 1px solid #ff5555; color: #ff5555; background: rgba(255, 85, 85, 0.1); }
        #btnHVT:hover { background: rgba(255, 85, 85, 0.2); box-shadow: 0 0 10px rgba(255, 85, 85, 0.3); }
        #btnHVT.active { background: #ff5555; color: #000; box-shadow: 0 0 15px #ff5555; }

        .hud-sep { width: 1px; height: 20px; background: rgba(255,255,255,0.1); }

        /* --- CONTEXT MENU --- */
        #context-menu {
            position: fixed; z-index: 10000; 
            background: rgba(5, 7, 20, 0.98); border: 1px solid var(--accent-cyan);
            border-radius: 8px; padding: 5px 0; min-width: 180px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.8); backdrop-filter: blur(10px);
            display: none; flex-direction: column;
        }
        .ctx-item {
            padding: 8px 15px; cursor: pointer; font-size: 0.9rem; color: #eee;
            display: flex; align-items: center; gap: 10px; transition: background 0.1s;
        }
        .ctx-item:hover { background: rgba(115, 251, 247, 0.15); color: #fff; }
        .ctx-item.danger { color: #ff5555; }
        .ctx-item.danger:hover { background: rgba(255, 80, 80, 0.2); }
        .ctx-divider { height: 1px; background: rgba(255,255,255,0.1); margin: 4px 0; }

        /* --- PANNEAU REGLAGES (HAUT GAUCHE) --- */
        #settings-panel {
            position: fixed; top: 20px; left: 20px;
            width: 380px; 
            background: rgba(5, 7, 20, 0.98);
            border: 1px solid var(--accent-cyan); border-radius: 12px;
            padding: 20px; z-index: 10001;
            display: none; 
            box-shadow: 0 0 50px rgba(0,0,0,0.9);
            backdrop-filter: blur(15px);
        }
        .settings-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; }
        .settings-header h3 { margin: 0; color: var(--accent-cyan); text-transform: uppercase; font-size: 1rem; letter-spacing: 1px; }
        .settings-close { cursor: pointer; color: #fff; font-weight: bold; font-size: 1.2rem; }
        .settings-close:hover { color: #ff5555; }

        .setting-row { margin-bottom: 15px; }
        .setting-row label { display: block; font-size: 0.8rem; color: #aaa; margin-bottom: 5px; text-transform: uppercase; font-weight: 600; }
        .setting-row input[type="range"] { width: 100%; cursor: pointer; accent-color: var(--accent-cyan); margin-top: 5px; }
        .setting-val { float: right; color: var(--accent-cyan); font-family: monospace; font-size: 0.9rem; }
        
        .settings-actions { margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px; }
    `;
    document.head.appendChild(style);
}