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

        #btnIntel { border: 1px solid var(--accent-cyan); color: var(--accent-cyan); background: rgba(115, 251, 247, 0.1); }
        #btnIntel:hover { background: rgba(115, 251, 247, 0.2); box-shadow: 0 0 10px rgba(115, 251, 247, 0.35); }
        #btnIntel.active { background: var(--accent-cyan); color: #000; box-shadow: 0 0 15px rgba(115, 251, 247, 0.6); }
        #btnIntel.locked { opacity: 0.7; }

        .hud-sep { width: 1px; height: 20px; background: rgba(255,255,255,0.1); }

        /* --- HVT PANEL --- */
        #hvt-panel {
            position: fixed;
            right: 20px;
            top: 90px;
            width: 340px;
            max-height: 75vh;
            display: none;
            flex-direction: column;
            background: rgba(5, 7, 20, 0.98);
            border: 1px solid rgba(255, 85, 85, 0.5);
            border-radius: 10px;
            padding: 12px;
            z-index: 10002;
            box-shadow: 0 0 40px rgba(0,0,0,0.8);
            backdrop-filter: blur(12px);
        }
        .hvt-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; cursor: move; user-select: none; }
        #hvt-panel.dragging { cursor: grabbing; }
        .hvt-title { color: #ff5555; text-transform: uppercase; letter-spacing: 2px; font-weight: 700; font-size: 0.8rem; }
        .hvt-close { cursor: pointer; color: #999; font-weight: bold; padding: 2px 6px; border-radius: 4px; }
        .hvt-close:hover { color: #fff; background: rgba(255,255,255,0.08); }
        .hvt-sub { display: flex; align-items: center; justify-content: space-between; color: #888; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 8px; }
        #hvt-list { max-height: 260px; overflow-y: auto; border-top: 1px solid rgba(255,255,255,0.08); border-bottom: 1px solid rgba(255,255,255,0.08); padding: 6px 0; }
        .hvt-row { display: flex; align-items: center; gap: 8px; padding: 6px 6px; border-radius: 6px; cursor: pointer; transition: background 0.2s; }
        .hvt-row:hover { background: rgba(255,255,255,0.06); }
        .hvt-row.active { background: rgba(255, 85, 85, 0.2); border: 1px solid rgba(255, 85, 85, 0.5); }
        .hvt-rank { width: 22px; font-size: 0.7rem; color: var(--accent-cyan); font-weight: bold; text-align: right; }
        .hvt-name { font-size: 0.85rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
        .hvt-type { font-size: 0.7rem; color: #888; }
        .hvt-score { font-size: 0.7rem; color: #ffb3b3; font-weight: bold; }
        #hvt-details { padding-top: 8px; font-size: 0.8rem; color: #cfcfcf; }
        .hvt-detail-title { color: var(--accent-cyan); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
        .hvt-detail-name { font-size: 1rem; font-weight: bold; margin-bottom: 6px; color: #fff; }
        .hvt-detail-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .hvt-detail-sub { margin-top: 8px; margin-bottom: 4px; font-size: 0.7rem; text-transform: uppercase; color: #888; letter-spacing: 1px; }
        .hvt-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .hvt-tag { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 2px 6px; font-size: 0.7rem; color: #ddd; }

        /* --- INTEL PANEL --- */
        #intel-panel {
            position: fixed;
            right: 380px;
            top: 90px;
            width: 360px;
            max-height: 78vh;
            display: none;
            flex-direction: column;
            background: rgba(5, 7, 20, 0.98);
            border: 1px solid rgba(115, 251, 247, 0.5);
            border-radius: 10px;
            padding: 12px;
            z-index: 10003;
            box-shadow: 0 0 40px rgba(0,0,0,0.8);
            backdrop-filter: blur(12px);
        }
        .intel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; cursor: move; user-select: none; }
        #intel-panel.dragging { cursor: grabbing; }
        .intel-title { color: var(--accent-cyan); text-transform: uppercase; letter-spacing: 2px; font-weight: 700; font-size: 0.8rem; }
        .intel-close { cursor: pointer; color: #999; font-weight: bold; padding: 2px 6px; border-radius: 4px; }
        .intel-close:hover { color: #fff; background: rgba(255,255,255,0.08); }
        .intel-sub { font-size: 0.7rem; text-transform: uppercase; color: #88a; letter-spacing: 1px; margin-bottom: 8px; }
        .intel-controls { display: flex; flex-direction: column; gap: 8px; }
        .intel-row { display: flex; align-items: center; gap: 8px; }
        .intel-row label { font-size: 0.7rem; color: #888; text-transform: uppercase; letter-spacing: 1px; }
        .intel-row .intel-grow { flex: 1; }
        .intel-select, .intel-input {
            background: rgba(0,0,0,0.4);
            border: 1px solid rgba(255,255,255,0.1);
            color: #ddd;
            font-size: 0.75rem;
            padding: 6px 8px;
            border-radius: 4px;
        }
        .intel-toggle { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .intel-toggle label { font-size: 0.7rem; color: #aaa; text-transform: uppercase; display: flex; align-items: center; gap: 4px; }
        .intel-toggle input { accent-color: var(--accent-cyan); }
        .intel-actions { display: flex; align-items: center; gap: 6px; }
        .intel-actions button { font-size: 0.7rem; padding: 6px 8px; }
        .intel-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 6px 0; }
        #intel-list { margin-top: 8px; overflow-y: auto; padding-right: 4px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 8px; }
        .intel-item { background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px; margin-bottom: 8px; }
        .intel-item.highlight { border-color: rgba(115, 251, 247, 0.4); box-shadow: 0 0 12px rgba(115, 251, 247, 0.12); }
        .intel-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 0.7rem; color: #999; }
        .intel-score { color: var(--accent-cyan); font-weight: bold; }
        .intel-confidence { color: #9fd4d2; font-weight: 600; }
        .intel-names { font-size: 0.85rem; color: #fff; margin: 4px 0; display: flex; align-items: center; gap: 6px; }
        .intel-badge { font-size: 0.65rem; text-transform: uppercase; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 2px 6px; color: #aaa; }
        .intel-reasons { font-size: 0.7rem; color: #888; margin-top: 6px; line-height: 1.2; }
        .intel-cta { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
        .intel-cta button { font-size: 0.65rem; padding: 5px 8px; border-radius: 4px; }
        .intel-kind { font-size: 0.7rem; }
        .intel-feedback { margin-left: auto; display: flex; gap: 4px; }
        .intel-feedback button { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); color: #aaa; padding: 3px 6px; border-radius: 4px; font-size: 0.65rem; }
        .intel-feedback button.active { border-color: var(--accent-cyan); color: var(--accent-cyan); }

        @media (max-width: 1100px) {
            #intel-panel { right: 20px; top: 90px; width: 320px; }
        }

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
