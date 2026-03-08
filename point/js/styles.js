export function injectStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
        /* --- BASICS --- */
        .editor { width: 100% !important; }
        #editorBody { max-height: calc(100vh - 180px); overflow-y: auto; padding-right: 5px; }
        #editorBody::-webkit-scrollbar { width: 5px; }
        #editorBody::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }

        .editor-sheet {
            font-family: var(--font-main);
            color: #d2ecff;
        }
        .editor-sheet-head {
            display: grid;
            grid-template-columns: 1fr auto auto;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
        }
        .editor-sheet-name {
            font-family: var(--font-tactical, var(--font-main));
            font-size: 3.5rem;
            line-height: 0.85;
            color: var(--accent-cyan);
            letter-spacing: 1px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .editor-sheet-type {
            padding: 4px 10px 3px;
            background: rgba(115, 251, 247, 0.82);
            color: #041621;
            font-family: var(--font-tactical, var(--font-main));
            font-size: 2rem;
            line-height: 0.82;
            text-transform: lowercase;
            border-radius: 1px;
            min-width: 88px;
            text-align: center;
        }
        .editor-sheet-id {
            font-family: var(--font-tactical, var(--font-main));
            font-size: 3.2rem;
            line-height: 0.82;
            color: var(--accent-cyan);
            letter-spacing: 1.2px;
        }
        .editor-sheet-values {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            font-family: var(--font-tactical, var(--font-main));
            font-size: 2rem;
            line-height: 0.85;
            color: #5fd9de;
            padding: 4px 2px 9px;
            border-bottom: 2px solid rgba(115, 251, 247, 0.65);
            margin-bottom: 10px;
        }
        .editor-sheet-note {
            border-bottom: 2px solid rgba(115, 251, 247, 0.45);
            margin-bottom: 10px;
        }
        .editor-sheet-note textarea {
            min-height: 54px;
            resize: vertical;
            border: none;
            border-radius: 0;
            padding: 4px 0 8px;
            background: transparent;
            color: #69d9df;
            font-family: var(--font-tactical, var(--font-main));
            font-size: 2rem;
            line-height: 0.9;
            box-shadow: none;
        }
        .editor-sheet-note textarea::placeholder {
            color: rgba(108, 199, 203, 0.62);
            font-family: var(--font-tactical, var(--font-main));
        }
        .editor-links-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 1rem;
            color: #58d4dc;
            letter-spacing: 1px;
            text-transform: uppercase;
            font-weight: 700;
        }
        #chipsLinks {
            min-height: 92px;
            border-bottom: 1px solid rgba(115, 251, 247, 0.2);
            padding-bottom: 10px;
            margin-bottom: 10px;
        }
        .sheet-links-columns {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
        }
        .sheet-links-col {
            min-width: 0;
        }
        .sheet-links-col + .sheet-links-col {
            border-left: 1px solid rgba(115, 251, 247, 0.2);
            padding-left: 12px;
        }
        .link-category {
            margin-top: 6px;
            margin-bottom: 4px;
            font-size: 0.7rem;
            color: #4f6f8f;
            text-transform: uppercase;
            letter-spacing: 1.2px;
            font-weight: 700;
        }
        .chip {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: rgba(13, 19, 37, 0.65);
            border-left: 3px solid #888;
            border-radius: 0 2px 2px 0;
            padding: 2px 6px;
            margin-bottom: 3px;
            transition: all 0.2s;
            min-height: 28px;
        }
        .chip:hover { background: rgba(255,255,255,0.08); }
        .chip-content { display: flex; align-items: center; flex: 1; min-width: 0; gap: 8px; }
        .chip-name {
            font-weight: 500;
            font-size: 1.9rem;
            line-height: 0.84;
            font-family: var(--font-tactical, var(--font-main));
            cursor: pointer;
            color: #cfd9eb;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .chip-name:hover { text-decoration: underline; color: #fff; }
        .chip-meta { margin-left: auto; }
        .chip-badge {
            font-size: 1.55rem;
            line-height: 0.8;
            font-family: var(--font-tactical, var(--font-main));
            text-transform: uppercase;
            opacity: 0.9;
            white-space: nowrap;
        }
        .x { padding: 0 0 0 8px; cursor: pointer; color: #666; font-size: 1rem; font-weight: bold; }
        .x:hover { color: #ff5555; }

        .editor-sheet-actions {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
            margin-top: 2px;
        }
        .editor-sheet-actions .mini-btn {
            font-family: var(--font-tactical, var(--font-main));
            font-size: 2rem;
            line-height: 0.86;
            text-transform: lowercase;
            min-height: 40px;
            background: rgba(99, 214, 216, 0.9);
            color: #041621;
            border-color: rgba(115, 251, 247, 0.95);
        }
        #btnMerge {
            background: rgba(98, 214, 216, 0.95);
            color: #041621;
        }
        #btnToggleEditSecondary {
            text-transform: capitalize;
        }

        .editor-advanced {
            margin-top: 10px;
            border: 1px solid rgba(115, 251, 247, 0.25);
            background: rgba(5, 10, 23, 0.85);
            padding: 10px;
            display: none;
        }
        .editor-advanced.open { display: block; }
        .editor-adv-grid {
            display: grid;
            grid-template-columns: 1.4fr 1fr 0.65fr;
            gap: 8px;
            margin-bottom: 8px;
        }
        .editor-adv-grid label {
            display: block;
            margin-bottom: 3px;
            font-size: 0.7rem;
            color: #88a6c1;
            letter-spacing: 0.8px;
            text-transform: uppercase;
        }
        .editor-adv-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        .editor-adv-links {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 8px;
        }

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
            padding: 6px 10px;
            text-align: center;
            justify-content: center;
            font-size: 0.88rem;
            border-radius: 3px;
            min-height: 30px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.12);
            color: #c9d7f0;
            font-family: var(--font-main);
            letter-spacing: 0.8px;
            text-transform: uppercase;
            clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
        }
        .mini-btn:hover { background: rgba(115, 251, 247, 0.16); color:#fff; border-color: rgba(115, 251, 247, 0.45); }
        .mini-btn:disabled { opacity: 0.45; cursor: not-allowed; background: rgba(6, 14, 28, 0.74); color:#6d819a; border-color: rgba(115, 251, 247, 0.12); }
        .mini-btn.active { background: var(--accent-cyan); color:#000; border-color:var(--accent-cyan); }
        .mini-btn.primary { background: rgba(115, 251, 247, 0.2); border-color: var(--accent-cyan); color: var(--accent-cyan); }

        /* HUD & DOCK */
        #filter-bar {
            position: fixed; bottom: 76px; left: 50%; transform: translateX(-50%);
            background: rgba(5, 7, 20, 0.9); border: 1px solid rgba(115, 251, 247, 0.3);
            border-radius: 6px; padding: 4px; display: flex; gap: 6px;
            backdrop-filter: blur(10px); z-index: 1000; box-shadow: 0 5px 20px rgba(0,0,0,0.8);
            display: none;
        }
        .filter-btn {
            background: transparent; border: 1px solid transparent; color: #8b9bb4;
            padding: 7px 14px; border-radius: 4px; cursor: pointer; font-size: 1.25rem;
            font-family: var(--font-tactical, var(--font-main)); line-height: 0.9;
            font-weight: 500; text-transform: uppercase; transition: all 0.2s;
            min-width: 102px; text-align: center; letter-spacing: 1px;
        }
        .filter-btn:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .filter-btn.active {
            background: rgba(115, 251, 247, 0.1); color: var(--accent-cyan);
            border-color: var(--accent-cyan); box-shadow: 0 0 15px rgba(115, 251, 247, 0.15);
        }

        #hud {
            bottom: 128px; border-radius: 4px; padding: 8px 16px;
            background: rgba(5, 7, 20, 0.95); border: 1px solid rgba(115, 251, 247, 0.3);
            display: flex; align-items: center; gap: 12px;
            display: none;
        }

        .icon-svg { width: 16px; height: 16px; fill: currentColor; display: block; }

        .hud-btn {
            background: transparent; border: none; color: #8b9bb4; cursor: pointer;
            display: flex; align-items: center; gap: 6px; font-family: var(--font-main);
            font-size: 0.92rem; text-transform: uppercase; font-weight: 700;
            padding: 6px; transition: all 0.2s; border-radius: 4px;
            letter-spacing: 0.8px;
        }
        .hud-btn:hover { color: var(--accent-cyan); background: rgba(115, 251, 247, 0.05); }
        .hud-btn.active { color: var(--accent-cyan); text-shadow: 0 0 8px rgba(115, 251, 247, 0.6); }

        .hud-toggle {
            display: flex; align-items: center; gap: 8px; cursor: pointer;
            color: #8b9bb4; font-size: 0.85rem; text-transform: uppercase; font-weight: 700;
            transition: color 0.2s;
            letter-spacing: 0.8px;
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
        .hud-zoom {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 132px;
            padding: 6px 10px;
            border: 1px solid rgba(115, 251, 247, 0.18);
            border-radius: 10px;
            background: rgba(10, 18, 38, 0.82);
        }
        .hud-zoom-label {
            color: #7f92ad;
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 1.1px;
            text-transform: uppercase;
        }
        .hud-zoom-value {
            min-width: 44px;
            color: var(--accent-cyan);
            font-family: var(--font-tactical);
            font-size: 1.55rem;
            line-height: 0.8;
        }
        .hud-zoom-bar {
            position: relative;
            flex: 1 1 auto;
            height: 4px;
            border-radius: 999px;
            overflow: hidden;
            background: rgba(115, 251, 247, 0.12);
        }
        .hud-zoom-bar span {
            display: block;
            width: 0%;
            height: 100%;
            border-radius: inherit;
            background: linear-gradient(90deg, rgba(115, 251, 247, 0.42), rgba(115, 251, 247, 0.92));
            box-shadow: 0 0 10px rgba(115, 251, 247, 0.32);
        }

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
            width: 420px;
            max-height: 80vh;
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

        /* --- THEME OVERRIDES --- */
        #custom-modal {
            background: rgba(1, 4, 12, 0.78) !important;
            backdrop-filter: blur(8px) !important;
        }
        #custom-modal .modal-card {
            background:
                linear-gradient(180deg, rgba(8, 18, 42, 0.98), rgba(4, 11, 26, 0.96)) !important;
            border: 1px solid rgba(102, 243, 255, 0.44) !important;
            border-radius: 18px;
            clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px));
            box-shadow:
                0 0 0 1px rgba(102, 243, 255, 0.08),
                0 28px 70px rgba(0, 0, 0, 0.66) !important;
        }
        #custom-modal #modal-msg {
            color: var(--text-main);
            font-family: var(--font-main);
        }
        #custom-modal #modal-actions {
            gap: 12px;
            justify-content: flex-end;
        }
        #custom-modal #modal-actions button {
            min-width: 140px;
        }
        .modal-tool {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .modal-tool-title {
            margin: 0;
            color: var(--accent-cyan);
            font-size: 0.78rem;
            line-height: 1.3;
            letter-spacing: 3px;
            text-transform: uppercase;
        }
        .modal-input-standalone,
        .modal-raw-input {
            width: 100%;
            border: 1px solid rgba(102, 243, 255, 0.18);
            border-radius: 10px;
            background: rgba(2, 8, 20, 0.92);
            color: var(--text-light);
            box-shadow: inset 0 0 0 1px rgba(102, 243, 255, 0.04);
        }
        .modal-input-standalone {
            min-height: 46px;
            padding: 10px 12px;
        }
        .modal-input-standalone::placeholder,
        .modal-raw-input::placeholder {
            color: #637996;
        }
        .modal-input-center {
            text-align: center;
            font-family: var(--font-main);
            font-size: 1.08rem;
            letter-spacing: 0.06em;
        }
        .modal-search-results {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 300px;
            overflow: auto;
            padding: 8px;
            border: 1px solid rgba(102, 243, 255, 0.12);
            border-radius: 10px;
            background: rgba(3, 10, 24, 0.72);
        }
        .quick-search-hit {
            width: 100%;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }
        .quick-search-name {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .quick-search-meta {
            color: var(--text-muted);
            font-family: var(--font-code);
            font-size: 0.78rem;
            letter-spacing: 0.04em;
        }
        .modal-empty-state {
            padding: 12px;
            text-align: center;
            color: var(--text-faded);
            font-size: 0.82rem;
        }
        .modal-segment {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
        }
        .modal-segment-btn {
            width: 100%;
        }
        .modal-note {
            color: #9bb0c7;
            font-size: 0.8rem;
            line-height: 1.5;
        }
        .modal-note-warning {
            color: #ffcc8a;
        }
        .modal-raw-input {
            min-height: 180px;
            padding: 12px 14px;
            resize: vertical;
            font-family: var(--font-code);
            font-size: 0.82rem;
            line-height: 1.45;
        }
        .intel-unlock-error {
            min-height: 16px;
            margin-top: 2px;
            color: #ff6b81;
            font-size: 0.8rem;
        }
        .is-disabled-visual {
            opacity: 0.6;
        }

        .ai-hub {
            display: flex;
            flex-direction: column;
            min-height: 520px;
            position: relative;
            overflow: hidden;
            background:
                linear-gradient(180deg, rgba(1, 9, 28, 0.98), rgba(1, 6, 18, 0.98)),
                radial-gradient(circle at 85% 10%, rgba(102, 243, 255, 0.08), transparent 24%);
        }
        .ai-hub::before {
            content: "";
            position: absolute;
            inset: 0;
            pointer-events: none;
            background-image:
                linear-gradient(rgba(102, 243, 255, 0.06) 1px, transparent 1px),
                linear-gradient(90deg, rgba(102, 243, 255, 0.05) 1px, transparent 1px);
            background-size: 48px 48px;
            opacity: 0.24;
        }
        .ai-hub-head {
            position: relative;
            z-index: 1;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 18px;
            padding: 22px 22px 18px;
            border-bottom: 1px solid rgba(102, 243, 255, 0.12);
        }
        .ai-hub-copy {
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 0;
        }
        .ai-hub-kicker {
            color: #90aac6;
            font-size: 0.74rem;
            letter-spacing: 4px;
            text-transform: uppercase;
        }
        .ai-hub-title {
            color: var(--text-light);
            font-family: var(--font-main);
            font-size: clamp(2.8rem, 5vw, 4.2rem);
            line-height: 0.86;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        .ai-hub-close {
            min-width: 156px;
            min-height: 52px;
            padding: 0 20px;
            align-self: flex-start;
            justify-content: center;
            border: 1px solid rgba(102, 243, 255, 0.72);
            background:
                linear-gradient(180deg, rgba(6, 23, 40, 0.96), rgba(3, 12, 24, 0.96));
            color: #78f3ff;
            font-size: 0.9rem;
            letter-spacing: 2px;
            text-transform: uppercase;
            clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
        }
        .ai-hub-close:hover {
            background:
                linear-gradient(180deg, rgba(16, 48, 72, 0.98), rgba(5, 18, 30, 0.98));
        }
        .ai-hub-grid {
            position: relative;
            z-index: 1;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 22px;
            padding: 22px;
            flex: 1;
        }
        .ai-hub-card {
            position: relative;
            min-height: 320px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 26px;
            padding: 34px 22px 28px;
            border: 1px solid rgba(132, 169, 212, 0.22);
            border-radius: 0;
            background:
                linear-gradient(180deg, rgba(3, 14, 42, 0.96), rgba(2, 9, 28, 0.96)),
                radial-gradient(circle at 50% 0%, rgba(102, 243, 255, 0.07), transparent 52%);
            text-align: left;
            text-transform: none;
            letter-spacing: normal;
            font-family: var(--font-main);
            box-shadow:
                inset 0 0 0 1px rgba(102, 243, 255, 0.05),
                0 16px 40px rgba(0, 0, 0, 0.32);
            clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
        }
        .ai-hub-card:hover {
            border-color: rgba(102, 243, 255, 0.48);
            transform: translateY(-2px);
            box-shadow:
                inset 0 0 0 1px rgba(102, 243, 255, 0.08),
                0 22px 44px rgba(0, 0, 0, 0.42);
        }
        .ai-hub-card::before {
            content: "";
            position: absolute;
            inset: 0;
            pointer-events: none;
            background:
                linear-gradient(180deg, rgba(102, 243, 255, 0.05), transparent 14%, transparent 86%, rgba(102, 243, 255, 0.04));
        }
        .ai-hub-card-corner {
            position: absolute;
            width: 32px;
            height: 32px;
            opacity: 0.9;
        }
        .ai-hub-card-corner::before,
        .ai-hub-card-corner::after {
            content: "";
            position: absolute;
            background: rgba(214, 233, 255, 0.9);
        }
        .ai-hub-card-corner::before {
            width: 18px;
            height: 2px;
        }
        .ai-hub-card-corner::after {
            width: 2px;
            height: 18px;
        }
        .ai-hub-card-corner-tl {
            top: 12px;
            left: 12px;
        }
        .ai-hub-card-corner-tl::before,
        .ai-hub-card-corner-tl::after {
            top: 0;
            left: 0;
        }
        .ai-hub-card-corner-br {
            right: 12px;
            bottom: 12px;
        }
        .ai-hub-card-corner-br::before,
        .ai-hub-card-corner-br::after {
            right: 0;
            bottom: 0;
        }
        .ai-hub-card-icon {
            width: 110px;
            height: 110px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: rgba(255, 255, 255, 0.96);
        }
        .ai-hub-card-icon svg {
            width: 100%;
            height: 100%;
            display: block;
        }
        .ai-hub-card-title {
            color: var(--text-light);
            font-size: clamp(2rem, 3.4vw, 3rem);
            line-height: 1.04;
            font-weight: 700;
            text-align: center;
        }
        .ai-hub-card-desc {
            max-width: 360px;
            color: #95aac8;
            font-size: 0.94rem;
            line-height: 1.55;
            letter-spacing: 2.3px;
            text-align: center;
            text-transform: uppercase;
        }

        .quick-create-shell {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 18px;
            border: 1px solid rgba(102, 243, 255, 0.34);
            border-radius: 16px;
            background:
                linear-gradient(180deg, rgba(8, 18, 42, 0.94), rgba(4, 11, 26, 0.92)),
                radial-gradient(circle at top right, rgba(102, 243, 255, 0.08), transparent 52%);
            box-shadow: inset 0 0 0 1px rgba(102, 243, 255, 0.04);
        }
        .quick-create-tabs {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
        }
        .quick-create-tab {
            appearance: none;
            padding: 14px 16px;
            border: 1px solid rgba(102, 243, 255, 0.16);
            border-radius: 12px;
            background: rgba(3, 10, 24, 0.82);
            color: #6d88aa;
            font-family: var(--font-main);
            font-size: clamp(1.35rem, 3vw, 1.9rem);
            line-height: 0.92;
            letter-spacing: 0.08em;
            text-align: left;
            text-transform: uppercase;
            transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.18s ease;
            box-shadow: none;
        }
        .quick-create-tab:hover {
            border-color: rgba(102, 243, 255, 0.28);
            color: #d5fcff;
        }
        .quick-create-tab.active {
            border-color: rgba(102, 243, 255, 0.42);
            background:
                linear-gradient(180deg, rgba(8, 23, 48, 0.96), rgba(4, 12, 28, 0.92)),
                radial-gradient(circle at top right, rgba(102, 243, 255, 0.12), transparent 60%);
            color: var(--accent-cyan);
            transform: translateY(-1px);
        }
        .quick-create-panels {
            display: flex;
            flex-direction: column;
        }
        .quick-create-panel {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .quick-create-panel.is-hidden {
            display: none;
        }
        .quick-create-title {
            margin: 0;
            color: var(--accent-cyan);
            font-family: var(--font-main);
            font-size: clamp(2.4rem, 4vw, 3.4rem);
            line-height: 0.82;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        .quick-create-block {
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-height: 100%;
            padding: 14px;
            border: 1px solid rgba(102, 243, 255, 0.14);
            border-radius: 12px;
            background: rgba(2, 8, 20, 0.58);
        }
        .quick-create-block-head {
            color: #9eb8d4;
            font-size: 0.75rem;
            letter-spacing: 2px;
            text-transform: uppercase;
        }
        .quick-create-link-flow {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
            gap: 12px;
            align-items: start;
        }
        .quick-create-link-arrow {
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 52px;
            min-height: 54px;
            color: var(--accent-cyan);
            font-size: clamp(2.1rem, 4vw, 2.8rem);
            line-height: 1;
            text-shadow: 0 0 16px rgba(102, 243, 255, 0.2);
        }
        .quick-create-node-row {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
        }
        .quick-create-target-input {
            min-height: 54px;
            padding: 10px 12px;
            border: 1px solid rgba(102, 243, 255, 0.26);
            border-radius: 10px;
            background: rgba(2, 8, 20, 0.92);
            color: var(--text-light);
            font-family: var(--font-main);
            font-size: clamp(1.1rem, 2.4vw, 1.55rem);
            line-height: 1.1;
            letter-spacing: 0.04em;
        }
        .quick-create-target-input::placeholder {
            color: #5b7291;
        }
        .quick-create-field-stack {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .quick-create-field-label {
            color: #9bb0c7;
            font-size: 0.72rem;
            letter-spacing: 1.8px;
            text-transform: uppercase;
        }
        .quick-create-search-result {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            min-height: 18px;
        }
        .quick-create-search-hit {
            margin: 0;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            width: auto;
            padding: 7px 10px;
            border: 1px solid rgba(102, 243, 255, 0.14);
            border-radius: 999px;
            background: rgba(4, 12, 28, 0.78);
            color: #cfefff;
            font-family: var(--font-main);
            font-size: 0.82rem;
            line-height: 1;
            text-transform: none;
            box-shadow: none;
        }
        .quick-create-search-hit:hover {
            border-color: rgba(102, 243, 255, 0.34);
            background: rgba(8, 20, 40, 0.92);
            color: #fff;
            box-shadow: none;
        }
        .quick-create-search-name {
            max-width: 180px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .quick-create-search-meta {
            color: #89a6c5;
            font-size: 0.64rem;
            letter-spacing: 1.2px;
            text-transform: uppercase;
            white-space: nowrap;
        }
        .quick-create-search-empty {
            color: var(--text-faded);
            font-size: 0.76rem;
        }
        .quick-create-context {
            color: #7aa6b9;
            font-size: 0.76rem;
            line-height: 1.45;
            letter-spacing: 1.2px;
            text-transform: uppercase;
        }
        .quick-create-source-pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            width: fit-content;
            padding: 8px 12px;
            border: 1px solid rgba(102, 243, 255, 0.22);
            border-radius: 999px;
            background: rgba(102, 243, 255, 0.08);
            color: var(--accent-cyan);
            font-size: 0.8rem;
            letter-spacing: 1.2px;
            text-transform: uppercase;
        }
        .quick-create-empty-state {
            padding: 14px;
            border: 1px dashed rgba(102, 243, 255, 0.2);
            border-radius: 10px;
            background: rgba(3, 10, 24, 0.72);
            color: var(--text-faded);
            font-size: 0.84rem;
            line-height: 1.45;
            text-align: center;
        }
        .quick-create-suggestions {
            display: grid;
            grid-template-columns: 1fr;
            gap: 8px;
            max-height: 176px;
            overflow: auto;
            padding: 10px;
            border: 1px dashed rgba(102, 243, 255, 0.22);
            border-radius: 10px;
            background: rgba(3, 10, 24, 0.7);
        }
        .quick-create-type-row,
        .quick-create-source-row,
        .quick-create-kind-row {
            display: flex;
            gap: 8px;
        }
        .quick-create-kind-label {
            align-self: center;
            min-width: 74px;
            margin: 0;
            color: #9bb0c7;
            font-size: 0.75rem;
            letter-spacing: 1.2px;
            text-transform: uppercase;
            white-space: nowrap;
        }
        .quick-create-suggestion {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 10px 12px;
            border: 1px solid rgba(102, 243, 255, 0.12);
            border-radius: 10px;
            background: rgba(5, 12, 26, 0.82);
            color: var(--text-light);
            font-family: var(--font-main);
            font-size: 0.92rem;
            line-height: 1.2;
            text-transform: none;
            text-decoration: none;
            box-shadow: none;
        }
        .quick-create-suggestion:hover {
            background: rgba(10, 23, 42, 0.92);
            border-color: rgba(102, 243, 255, 0.34);
            color: #d5fcff;
            box-shadow: none;
        }
        .quick-create-suggestion-type {
            color: #89a6c5;
            font-size: 0.68rem;
            letter-spacing: 1.4px;
            text-transform: uppercase;
            white-space: nowrap;
        }
        .quick-create-panel-action {
            width: 100%;
            margin-top: auto;
        }
        .quick-create-sep {
            color: #3a6f7e;
        }
        .quick-create-empty {
            color: var(--text-faded);
            font-size: 0.76rem;
        }

        .cloud-auth-shell {
            max-width: 420px;
        }
        .cloud-inline-form {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 120px auto;
            gap: 8px;
            align-items: center;
        }
        .cloud-inline-select {
            min-width: 110px;
        }
        .cloud-board-manage-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 10px;
        }
        .cloud-share-line {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 8px;
            color: #8faac8;
            font-size: 0.74rem;
            line-height: 1.5;
        }
        .cloud-share-link {
            color: var(--accent-cyan);
            word-break: break-all;
        }
        .cloud-scroll,
        .cloud-column {
            max-height: 330px;
            overflow: auto;
            padding-right: 4px;
        }
        .cloud-panel-shell {
            min-height: 280px;
        }
        .cloud-scroll {
            max-height: 260px;
        }
        .cloud-member-row,
        .cloud-board-row {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
            margin: 6px 0;
            padding: 10px;
            border: 1px solid rgba(102, 243, 255, 0.12);
            border-radius: 10px;
            background: rgba(3, 10, 24, 0.72);
        }
        .cloud-board-row.is-active {
            border-color: rgba(102, 243, 255, 0.34);
            background: rgba(102, 243, 255, 0.08);
        }
        .cloud-board-row-local {
            background: rgba(4, 10, 22, 0.82);
        }
        .cloud-local-badge {
            align-self: center;
            padding: 6px 10px;
            border: 1px solid rgba(102, 243, 255, 0.18);
            border-radius: 999px;
            background: rgba(102, 243, 255, 0.08);
            color: var(--accent-cyan);
            font-size: 0.7rem;
            letter-spacing: 1.2px;
            text-transform: uppercase;
            white-space: nowrap;
        }
        .cloud-row-main {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .cloud-row-title {
            color: var(--text-light);
            font-size: 0.95rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .cloud-row-sub {
            color: #8b9bb4;
            font-size: 0.72rem;
            letter-spacing: 1.2px;
            text-transform: uppercase;
        }
        .cloud-member-status {
            margin-top: 2px;
            color: #7e95b0;
            font-size: 0.72rem;
            line-height: 1.35;
        }
        .cloud-member-status.is-online {
            color: #9df5b8;
        }
        .cloud-member-status.is-offline {
            color: #ff9aa7;
        }
        .cloud-row-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 6px;
            flex-shrink: 0;
        }
        .cloud-home-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 2px solid rgba(102, 243, 255, 0.42);
        }
        .cloud-home-tab-group {
            display: flex;
            align-items: center;
            gap: 22px;
            min-width: 0;
        }
        .cloud-home-tab {
            border: 0;
            background: transparent;
            padding: 0;
            cursor: pointer;
            opacity: 0.58;
            transition: opacity 0.2s ease, transform 0.2s ease, color 0.2s ease;
            clip-path: none;
        }
        .cloud-home-tab:hover {
            opacity: 0.86;
            transform: translateY(-1px);
        }
        .cloud-home-tab.is-active {
            opacity: 1;
        }
        .cloud-home-word {
            color: var(--accent-cyan);
            font-family: var(--font-main);
            font-size: clamp(2.2rem, 4vw, 3.4rem);
            line-height: 0.86;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        .cloud-home-word-alt {
            color: #3d8b90;
        }
        .cloud-home-tab.is-active.cloud-home-word-alt {
            color: #7bd8df;
        }
        .cloud-close-btn {
            min-width: 38px;
            min-height: 38px;
        }
        .cloud-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
        }
        .cloud-status-bar {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin-top: 10px;
            color: #9bb0c7;
            font-size: 0.82rem;
        }
        .cloud-status-active {
            color: var(--accent-cyan);
        }
        .cloud-local-hint,
        .cloud-local-note {
            margin-top: 8px;
            padding: 10px 12px;
            border-radius: 10px;
            border: 1px dashed rgba(102, 243, 255, 0.14);
            background: rgba(3, 10, 24, 0.6);
            color: #8faac8;
            font-size: 0.74rem;
            line-height: 1.45;
        }
        .cloud-local-note {
            border-color: rgba(255, 204, 138, 0.18);
            color: #ffd8a4;
            margin-top: 0;
            margin-bottom: 8px;
        }
        .cloud-local-panel {
            margin-top: 10px;
        }
        .cloud-local-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
        }
        #cloudModalSyncInfo[data-state="saving"],
        #cloudModalSyncInfo[data-state="pending"] {
            color: #ffcc8a;
        }
        #cloudModalSyncInfo[data-state="merged"] {
            color: #9df5b8;
        }
        #cloudModalSyncInfo[data-state="error"] {
            color: #ff9aa7;
        }
        .cloud-modal-presence {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 10px;
        }
        .cloud-modal-presence .cloud-presence-pill {
            min-width: 180px;
            flex: 1 1 180px;
        }
        .cloud-board-log {
            margin-top: 12px;
            padding: 12px;
            border: 1px solid rgba(102, 243, 255, 0.14);
            border-radius: 12px;
            background: rgba(3, 10, 24, 0.78);
        }
        .cloud-board-log-home {
            margin-top: 14px;
        }
        .cloud-board-log-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 1px solid rgba(102, 243, 255, 0.12);
            color: #9db3cd;
            font-size: 0.74rem;
            letter-spacing: 1.6px;
            text-transform: uppercase;
        }
        .cloud-board-log-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 220px;
            overflow: auto;
            padding-right: 4px;
        }
        .cloud-board-log-row {
            width: 100%;
            margin: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 8px 10px;
            border: 1px solid rgba(102, 243, 255, 0.08);
            border-radius: 8px;
            background: rgba(2, 8, 18, 0.82);
            text-align: left;
            font-family: var(--font-main);
            box-shadow: none;
        }
        .cloud-board-log-row.is-clickable {
            appearance: none;
            cursor: pointer;
            transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
        }
        .cloud-board-log-row.is-clickable:hover {
            border-color: rgba(102, 243, 255, 0.28);
            background: rgba(7, 18, 36, 0.92);
            transform: translateY(-1px);
        }
        .cloud-board-log-row.is-clickable:focus-visible {
            outline: 1px solid rgba(102, 243, 255, 0.42);
            outline-offset: 1px;
        }
        .cloud-board-log-meta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }
        .cloud-board-log-actor {
            color: var(--text-light);
            font-size: 0.76rem;
            letter-spacing: 1.1px;
            text-transform: uppercase;
        }
        .cloud-board-log-time {
            color: #7d95b0;
            font-size: 0.7rem;
            letter-spacing: 1px;
            text-transform: uppercase;
        }
        .cloud-board-log-text {
            color: #a9bdd4;
            font-size: 0.8rem;
            line-height: 1.45;
        }
        .cloud-board-log-summary {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 10px;
        }
        .cloud-board-log-summary span {
            padding: 6px 10px;
            border: 1px solid rgba(102, 243, 255, 0.12);
            border-radius: 999px;
            background: rgba(8, 17, 34, 0.72);
            color: #8ca9c9;
            font-size: 0.7rem;
            letter-spacing: 1.1px;
            text-transform: uppercase;
        }
        .cloud-board-log-list-detail {
            max-height: 280px;
        }
        .cloud-board-log-empty {
            color: #7388a4;
            font-size: 0.76rem;
            line-height: 1.45;
            padding: 2px 0;
        }

        .data-hub {
            display: flex;
            flex-direction: column;
            gap: 14px;
        }
        .data-hub-head {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .data-hub-panels {
            display: grid;
            grid-template-columns: 1fr;
            gap: 12px;
        }
        .data-hub-section {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 12px;
            border-radius: 14px;
            border: 1px solid rgba(102, 243, 255, 0.12);
            background: rgba(4, 10, 24, 0.64);
        }
        .data-hub-section-local {
            border-color: rgba(102, 243, 255, 0.22);
            background:
                linear-gradient(180deg, rgba(8, 20, 40, 0.9), rgba(3, 10, 22, 0.82)),
                radial-gradient(circle at top left, rgba(102, 243, 255, 0.1), transparent 56%);
            clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%);
        }
        .data-hub-section-cloud {
            border-color: rgba(255, 199, 122, 0.24);
            background:
                linear-gradient(180deg, rgba(36, 26, 10, 0.9), rgba(17, 12, 6, 0.86)),
                radial-gradient(circle at top right, rgba(255, 199, 122, 0.1), transparent 52%);
            clip-path: polygon(14px 0, 100% 0, 100% 100%, calc(100% - 14px) 100%, 0 calc(100% - 14px), 0 0);
        }
        .data-hub-section-danger {
            border-color: rgba(255, 107, 129, 0.22);
            background:
                linear-gradient(180deg, rgba(42, 12, 20, 0.88), rgba(22, 7, 12, 0.88)),
                radial-gradient(circle at center, rgba(255, 107, 129, 0.08), transparent 58%);
        }
        .data-hub-kicker {
            color: #8ea9c6;
            font-size: 0.72rem;
            letter-spacing: 2.4px;
            text-transform: uppercase;
        }
        .data-hub-section-local .data-hub-kicker {
            color: var(--accent-cyan);
        }
        .data-hub-section-cloud .data-hub-kicker {
            color: #ffcc8a;
        }
        .data-hub-section-danger .data-hub-kicker {
            color: #ff9aa7;
        }
        .data-hub-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
        }
        .data-hub-grid-single {
            grid-template-columns: 1fr;
        }
        .data-hub-card {
            width: 100%;
            min-height: 72px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 12px 14px;
            text-align: center;
            border-radius: 12px;
            border: 1px solid rgba(102, 243, 255, 0.16);
            background: linear-gradient(180deg, rgba(7, 18, 38, 0.94), rgba(4, 10, 22, 0.9));
            box-shadow: inset 0 0 0 1px rgba(102, 243, 255, 0.04);
        }
        .data-hub-card:hover {
            border-color: rgba(102, 243, 255, 0.42);
            background: linear-gradient(180deg, rgba(14, 31, 56, 0.96), rgba(6, 14, 28, 0.92));
        }
        .data-hub-card-local {
            border-color: rgba(102, 243, 255, 0.22);
            background: linear-gradient(180deg, rgba(10, 24, 48, 0.96), rgba(4, 10, 22, 0.92));
            clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%);
        }
        .data-hub-card-local:hover {
            border-color: rgba(102, 243, 255, 0.5);
            background: linear-gradient(180deg, rgba(18, 40, 66, 0.98), rgba(6, 14, 28, 0.94));
        }
        .data-hub-card-cloud {
            border-color: rgba(255, 199, 122, 0.3);
            background: linear-gradient(180deg, rgba(50, 36, 12, 0.96), rgba(20, 14, 6, 0.92));
            clip-path: polygon(12px 0, 100% 0, 100% 100%, 0 100%, 0 12px);
        }
        .data-hub-card-cloud:hover {
            border-color: rgba(255, 199, 122, 0.56);
            background: linear-gradient(180deg, rgba(74, 52, 16, 0.98), rgba(28, 20, 8, 0.94));
        }
        .data-hub-card-danger {
            border-color: rgba(255, 107, 129, 0.28);
            background: linear-gradient(180deg, rgba(54, 14, 26, 0.9), rgba(28, 8, 14, 0.92));
            clip-path: polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%);
        }
        .data-hub-card-danger:hover {
            border-color: rgba(255, 107, 129, 0.54);
            background: linear-gradient(180deg, rgba(78, 20, 34, 0.94), rgba(38, 10, 18, 0.94));
        }
        .data-hub-card-title {
            color: var(--text-light);
            font-size: 0.82rem;
            letter-spacing: 1.8px;
            text-transform: uppercase;
        }
        .data-hub-card-local .data-hub-card-title {
            color: #8cf4ff;
        }
        .data-hub-card-cloud .data-hub-card-title {
            color: #ffd7a1;
        }
        .data-hub-card-danger .data-hub-card-title {
            color: #ffb1bb;
        }
        .data-hub-card-meta {
            color: #89a0bb;
            font-size: 0.68rem;
            letter-spacing: 1.4px;
            text-transform: uppercase;
        }
        .data-hub-advanced {
            border: 1px solid rgba(102, 243, 255, 0.12);
            border-radius: 12px;
            background: rgba(3, 10, 24, 0.54);
            overflow: hidden;
        }
        .data-hub-summary {
            cursor: pointer;
            padding: 12px 14px;
            color: #93aac6;
            font-size: 0.76rem;
            letter-spacing: 1.8px;
            text-transform: uppercase;
            user-select: none;
        }
        .data-hub-advanced[open] .data-hub-summary {
            border-bottom: 1px solid rgba(102, 243, 255, 0.08);
        }
        .data-hub-advanced-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            padding: 12px;
        }
        .data-hub-status {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 12px 14px;
            border: 1px dashed rgba(102, 243, 255, 0.18);
            border-radius: 10px;
            background: rgba(3, 10, 24, 0.66);
            color: #90a7c3;
            font-size: 0.74rem;
            letter-spacing: 1px;
            text-transform: uppercase;
            flex-wrap: wrap;
        }
        .data-hub-status strong {
            color: var(--text-light);
            font-weight: 600;
            letter-spacing: 1px;
            text-transform: uppercase;
        }
        .data-hub-status-pill {
            min-height: 34px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 8px 10px;
            border-radius: 8px;
            border: 1px solid rgba(102, 243, 255, 0.14);
            background: rgba(2, 8, 18, 0.88);
        }
        .data-hub-status-pill-local {
            border-color: rgba(102, 243, 255, 0.24);
            color: #8cf4ff;
            background: rgba(9, 24, 40, 0.82);
        }
        .data-hub-status-pill-cloud {
            border-color: rgba(255, 199, 122, 0.24);
            color: #ffd7a1;
            background: rgba(40, 30, 10, 0.84);
        }
        .data-hub-status-pill-sync {
            color: #a7bdd4;
        }

        .intel-toolbar {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 10px;
        }
        .intel-toolbar-row {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .intel-toolbar-row-actions {
            flex-wrap: wrap;
        }
        .intel-toolbar-label {
            min-width: 58px;
            color: #8ea9c6;
            font-size: 0.72rem;
            letter-spacing: 1.5px;
            text-transform: uppercase;
        }
        .intel-preset-group {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }
        .intel-preset-btn {
            min-width: 94px;
        }
        .intel-simple-toggle {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: var(--text-muted);
            font-size: 0.74rem;
            letter-spacing: 1px;
            text-transform: uppercase;
        }
        .intel-simple-toggle input {
            accent-color: var(--accent-cyan);
        }
        .intel-advanced {
            margin: 4px 0 10px;
            border: 1px solid rgba(102, 243, 255, 0.1);
            border-radius: 10px;
            background: rgba(3, 10, 24, 0.52);
        }
        .intel-advanced summary {
            cursor: pointer;
            padding: 10px 12px;
            color: #9bb0c7;
            font-size: 0.74rem;
            letter-spacing: 1.6px;
            text-transform: uppercase;
            user-select: none;
        }
        .intel-advanced[open] summary {
            border-bottom: 1px solid rgba(102, 243, 255, 0.1);
        }
        .intel-advanced .intel-controls {
            padding: 10px 12px 12px;
        }
        .intel-limit-input {
            width: 76px;
        }
        .intel-results {
            margin-top: 0;
            overflow-y: auto;
            padding-right: 4px;
            border-top: 1px solid rgba(102, 243, 255, 0.08);
            padding-top: 10px;
        }
        .intel-empty-state {
            padding: 12px;
            text-align: center;
            color: var(--text-faded);
            font-size: 0.82rem;
        }
        .intel-item {
            padding: 10px;
            margin-bottom: 10px;
            cursor: pointer;
            transition: border-color 0.2s, background 0.2s, transform 0.2s;
        }
        .intel-item:hover {
            border-color: rgba(102, 243, 255, 0.3);
            background: rgba(8, 19, 39, 0.84);
            transform: translateY(-1px);
        }
        .intel-card-top {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 8px;
        }
        .intel-badges {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 4px;
        }
        .intel-name-pair {
            display: block;
            line-height: 1.35;
        }
        .intel-cta {
            flex-wrap: wrap;
            margin-top: 8px;
        }
        .intel-kind {
            min-width: 180px;
            flex: 1 1 190px;
        }
        .intel-connect-btn {
            min-width: 132px;
        }

        .settings-mode-card {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 15px;
            padding: 12px;
            border: 1px solid rgba(102, 243, 255, 0.18);
            border-radius: 12px;
            background: rgba(3, 10, 24, 0.72);
        }
        .settings-mode-label {
            display: flex;
            align-items: center;
            gap: 10px;
            color: var(--text-light);
            font-weight: 700;
        }
        .settings-mode-icon {
            width: 22px;
            height: 22px;
            fill: currentColor;
            color: var(--accent-cyan);
            flex: 0 0 auto;
        }
        .settings-section-break {
            margin-top: 20px;
            padding-top: 12px;
            border-top: 1px solid rgba(102, 243, 255, 0.12);
        }
        .settings-reset-btn {
            width: 100%;
        }

        .pf-card {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 12px;
            border: 1px dashed rgba(102, 243, 255, 0.28);
            border-radius: 8px;
            background: linear-gradient(180deg, rgba(4, 11, 26, 0.88), rgba(3, 8, 20, 0.76));
            box-shadow: inset 0 0 0 1px rgba(102, 243, 255, 0.04);
        }
        .pf-card-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid rgba(102, 243, 255, 0.14);
        }
        .pf-card-kicker {
            color: #a9bfd8;
            font-size: 0.74rem;
            letter-spacing: 2px;
            text-transform: uppercase;
            font-weight: 700;
        }
        .pf-card-led {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: rgba(255, 136, 136, 0.95);
            box-shadow: 0 0 12px rgba(255, 107, 129, 0.42);
            flex: 0 0 auto;
        }
        .pf-card-led.is-active {
            background: rgba(102, 243, 255, 0.96);
            box-shadow: 0 0 12px rgba(102, 243, 255, 0.5);
        }
        .pf-node-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 8px;
        }
        .pf-node-box {
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-height: 54px;
            padding: 10px 12px;
            border: 1px solid rgba(102, 243, 255, 0.12);
            border-radius: 8px;
            background: rgba(2, 8, 20, 0.72);
        }
        .pf-node-box-active {
            border-color: rgba(102, 243, 255, 0.34);
            background: rgba(102, 243, 255, 0.08);
        }
        .pf-node-box-target {
            border-color: rgba(255, 107, 129, 0.34);
            background: rgba(255, 107, 129, 0.06);
        }
        .pf-node-label {
            font-size: 0.68rem;
            letter-spacing: 1.6px;
            text-transform: uppercase;
            color: #86a7c8;
        }
        .pf-node-value {
            font-size: 0.92rem;
            line-height: 1.2;
            font-weight: 600;
            color: var(--text-light);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .pf-status-wrap {
            min-height: 46px;
            display: flex;
            align-items: center;
        }
        .pf-status {
            width: 100%;
            padding: 10px 12px;
            border-radius: 8px;
            text-align: center;
            font-size: 0.78rem;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            border: 1px solid rgba(102, 243, 255, 0.14);
            background: rgba(3, 9, 22, 0.82);
        }
        .pf-status-active {
            color: var(--accent-cyan);
            border-color: rgba(102, 243, 255, 0.34);
            background: rgba(102, 243, 255, 0.08);
        }
        .pf-status-idle {
            color: var(--text-faded);
        }
        .pf-action-btn {
            width: 100%;
        }
        .pf-action-btn-alt {
            border-color: rgba(255, 107, 129, 0.74);
            color: #ff9aa7;
            background: linear-gradient(90deg, rgba(66, 16, 30, 0.78), rgba(35, 10, 18, 0.88));
        }
        .pf-cancel-btn {
            width: 100%;
            min-height: 38px;
            background: rgba(4, 10, 22, 0.92);
            border-color: rgba(102, 243, 255, 0.2);
            color: var(--text-muted);
            font-size: 0.74rem;
        }
        .pf-empty-card {
            min-height: 84px;
            border: 1px dashed rgba(102, 243, 255, 0.22);
            border-radius: 8px;
            background: rgba(3, 9, 22, 0.76);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            color: var(--text-faded);
            font-style: italic;
        }
        .pf-empty-icon {
            font-family: var(--font-code);
            font-size: 1.3rem;
            color: #7e93ae;
            opacity: 0.7;
        }
        .pf-empty-text {
            font-size: 0.86rem;
        }

        .mini-btn {
            min-height: 36px;
            font-size: 0.74rem;
            line-height: 1.15;
            letter-spacing: 1.5px;
            background: rgba(8, 18, 36, 0.92);
            border: 1px solid rgba(102, 243, 255, 0.16);
            color: var(--text-main);
            box-shadow: none;
        }
        .mini-btn:hover {
            background: rgba(102, 243, 255, 0.1);
            border-color: rgba(102, 243, 255, 0.38);
            color: var(--accent-cyan);
        }
        .mini-btn.primary {
            background: linear-gradient(90deg, rgba(20, 47, 63, 0.72), rgba(12, 23, 40, 0.88));
            border-color: rgba(102, 243, 255, 0.58);
            color: var(--accent-cyan);
        }

        .editor-sheet {
            display: flex;
            flex-direction: column;
            gap: 14px;
            color: var(--text-main);
        }
        .editor-sheet-head {
            grid-template-columns: minmax(0, 1fr) auto auto;
            align-items: end;
            gap: 10px;
            padding-bottom: 12px;
            border-bottom: 1px solid rgba(102, 243, 255, 0.14);
        }
        .editor-sheet-name {
            font-family: var(--font-main);
            font-size: clamp(1.6rem, 3vw, 2.3rem);
            line-height: 0.92;
            color: var(--text-light);
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        .editor-sheet-type {
            min-width: auto;
            padding: 6px 10px;
            border: 1px solid rgba(102, 243, 255, 0.32);
            background: rgba(102, 243, 255, 0.12);
            color: var(--accent-cyan);
            font-family: var(--font-main);
            font-size: 0.76rem;
            line-height: 1;
            letter-spacing: 1.8px;
            text-transform: uppercase;
            border-radius: 8px;
        }
        .editor-sheet-id {
            font-family: var(--font-code);
            font-size: 1.25rem;
            line-height: 1;
            color: #9fd8e1;
            letter-spacing: 0.14em;
        }
        .editor-sheet-values {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
            padding: 0;
            border-bottom: none;
            margin: 0;
            font-family: var(--font-main);
            font-size: 0.72rem;
            line-height: 1.4;
            text-transform: uppercase;
            color: #90aac6;
        }
        .editor-sheet-values > div {
            min-height: 52px;
            padding: 10px 12px;
            border: 1px solid rgba(102, 243, 255, 0.12);
            border-radius: 8px;
            background: rgba(4, 11, 27, 0.72);
            display: flex;
            align-items: flex-start;
        }
        .editor-sheet-note {
            border-bottom: none;
            margin: 0;
        }
        .editor-sheet-note textarea {
            min-height: 74px;
            border: 1px solid rgba(102, 243, 255, 0.16);
            border-radius: 8px;
            padding: 12px 14px;
            background: rgba(2, 8, 20, 0.92);
            color: var(--text-main);
            font-family: var(--font-main);
            font-size: 1rem;
            line-height: 1.35;
        }
        .editor-sheet-note textarea::placeholder {
            color: #637996;
            font-family: var(--font-main);
        }
        .editor-quick-identity {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
        }
        .editor-quick-identity-single {
            grid-template-columns: minmax(0, 1fr);
        }
        .editor-quick-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 10px 12px;
            border: 1px solid rgba(102, 243, 255, 0.12);
            border-radius: 10px;
            background: rgba(4, 11, 27, 0.72);
        }
        .editor-quick-field label {
            color: #8ba4c0;
            letter-spacing: 1.6px;
            font-size: 0.68rem;
            text-transform: uppercase;
        }
        .editor-quick-field input {
            min-height: 42px;
            border: 1px solid rgba(102, 243, 255, 0.16);
            border-radius: 8px;
            padding: 10px 12px;
            background: rgba(2, 8, 20, 0.92);
            color: var(--text-main);
            font-family: var(--font-main);
            font-size: 0.98rem;
            line-height: 1.2;
        }
        .editor-quick-field input:focus {
            outline: none;
            border-color: rgba(102, 243, 255, 0.38);
            box-shadow: 0 0 0 3px rgba(102, 243, 255, 0.08);
        }
        .editor-links-head {
            margin: 0;
            padding-top: 2px;
            color: #a8bed8;
            letter-spacing: 2px;
        }
        .editor-links-head .mini-btn {
            min-width: 104px;
        }
        #chipsLinks {
            min-height: 110px;
            border: 1px dashed rgba(102, 243, 255, 0.22);
            border-radius: 10px;
            background: rgba(3, 10, 24, 0.74);
            padding: 12px;
            margin-bottom: 0;
        }
        .sheet-links-columns {
            gap: 12px;
        }
        .sheet-links-col + .sheet-links-col {
            border-left: 1px solid rgba(102, 243, 255, 0.12);
            padding-left: 12px;
        }
        .link-category {
            margin: 0 0 6px;
            font-size: 0.72rem;
            color: #86a7c8;
            letter-spacing: 2px;
        }
        .chip {
            background: linear-gradient(90deg, rgba(8, 18, 36, 0.94), rgba(4, 10, 22, 0.86));
            border: 1px solid rgba(102, 243, 255, 0.12);
            border-left-width: 1px;
            border-radius: 8px;
            padding: 8px 10px;
            margin-bottom: 6px;
            min-height: 40px;
            clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
        }
        .chip:hover {
            background: linear-gradient(90deg, rgba(12, 24, 48, 0.96), rgba(6, 13, 27, 0.9));
        }
        .chip-content {
            gap: 10px;
        }
        .chip-name {
            font-family: var(--font-main);
            font-size: 0.95rem;
            line-height: 1.1;
            color: var(--text-light);
            letter-spacing: 0.04em;
        }
        .chip-badge {
            font-size: 0.72rem;
            line-height: 1.1;
            font-family: var(--font-main);
            letter-spacing: 1px;
        }
        .x {
            color: #7b90ab;
            padding: 0 0 0 10px;
        }
        .x:hover {
            color: #ff9aa7;
        }
        .editor-sheet-actions {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
            margin-top: 0;
        }
        .editor-sheet-actions .mini-btn {
            min-height: 42px;
            font-size: 0.76rem;
            line-height: 1.15;
            font-family: var(--font-main);
            letter-spacing: 1.4px;
            text-transform: uppercase;
            background: linear-gradient(90deg, rgba(16, 34, 52, 0.82), rgba(8, 17, 30, 0.9));
            color: var(--accent-cyan);
            border: 1px solid rgba(102, 243, 255, 0.16);
        }
        #btnToggleEditSecondary {
            min-width: 104px;
        }
        .editor-advanced {
            margin-top: 4px;
            border: 1px solid rgba(102, 243, 255, 0.14);
            border-radius: 12px;
            background: linear-gradient(180deg, rgba(5, 12, 28, 0.94), rgba(3, 9, 22, 0.86));
            padding: 12px;
        }
        .editor-adv-section {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 12px;
            padding: 12px;
            border: 1px solid rgba(102, 243, 255, 0.12);
            border-radius: 10px;
            background: rgba(3, 10, 24, 0.54);
        }
        .editor-adv-title {
            color: #a8bed8;
            font-size: 0.72rem;
            letter-spacing: 2px;
            text-transform: uppercase;
        }
        .editor-adv-grid {
            gap: 10px;
            margin-bottom: 10px;
        }
        .editor-adv-grid label {
            color: #8ba4c0;
            letter-spacing: 1.6px;
            font-size: 0.68rem;
        }
        .editor-adv-row {
            gap: 10px;
            margin-bottom: 10px;
        }
        .editor-merge-row {
            flex-wrap: wrap;
        }
        .editor-merge-row .flex-grow-input {
            min-width: 220px;
        }
        .editor-adv-links {
            gap: 8px;
            margin-bottom: 10px;
        }
        .editor-link-composer {
            display: flex;
            gap: 8px;
        }
        .editor-link-hint {
            color: var(--text-muted);
            font-size: 0.76rem;
            line-height: 1.4;
        }
        .flex-row-force {
            gap: 8px !important;
        }
        .compact-select {
            min-height: 42px !important;
            font-size: 0.72rem !important;
            padding: 8px 10px !important;
        }
        .editor-compact-select {
            width: 112px;
        }
        .editor-color-input {
            height: 34px;
            padding: 0;
            cursor: pointer;
            border-radius: 8px;
            border: 1px solid rgba(102, 243, 255, 0.18);
            background: rgba(2, 8, 20, 0.92);
        }
        .editor-map-id {
            font-size: 0.8rem;
            font-family: var(--font-code);
            letter-spacing: 0.04em;
        }

        #filter-bar {
            bottom: 84px;
            background: rgba(5, 12, 28, 0.94);
            border: 1px solid rgba(102, 243, 255, 0.22);
            border-radius: 14px;
            padding: 6px;
            box-shadow: 0 16px 42px rgba(0, 0, 0, 0.48);
        }
        .filter-btn {
            min-width: 118px;
            min-height: 38px;
            border-radius: 8px;
            font-family: var(--font-main);
            font-size: 0.72rem;
            letter-spacing: 1.6px;
            color: var(--text-muted);
        }
        .filter-btn.active {
            background: rgba(102, 243, 255, 0.12);
            border-color: rgba(102, 243, 255, 0.42);
            color: var(--accent-cyan);
        }
        #hud {
            bottom: 138px;
            background: rgba(5, 12, 28, 0.94);
            border: 1px solid rgba(102, 243, 255, 0.2);
            border-radius: 16px;
            padding: 10px 14px;
            box-shadow: 0 18px 44px rgba(0, 0, 0, 0.5);
        }
        .hud-btn {
            color: var(--text-muted);
            font-size: 0.76rem;
            letter-spacing: 1.4px;
        }
        .hud-toggle {
            color: var(--text-muted);
            font-size: 0.74rem;
            letter-spacing: 1.2px;
        }
        .hud-toggle:hover {
            color: var(--text-light);
        }

        #settings-panel,
        #hvt-panel,
        #intel-panel {
            border: 1px solid rgba(102, 243, 255, 0.28);
            border-radius: 18px;
            background:
                linear-gradient(180deg, rgba(8, 18, 42, 0.98), rgba(4, 11, 26, 0.96));
            box-shadow:
                0 0 0 1px rgba(102, 243, 255, 0.06),
                0 26px 70px rgba(0, 0, 0, 0.66);
            clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px));
        }
        .settings-header,
        .hvt-header,
        .intel-header {
            border-bottom: 1px solid rgba(102, 243, 255, 0.14);
            padding-bottom: 10px;
            margin-bottom: 10px;
        }
        .settings-header h3,
        .hvt-title,
        .intel-title {
            font-size: 0.8rem;
            letter-spacing: 3px;
            color: var(--accent-cyan);
        }
        .hvt-sub,
        .intel-sub {
            color: var(--text-muted);
        }
        .hvt-row,
        .intel-item {
            background: rgba(3, 10, 24, 0.72);
            border: 1px solid rgba(102, 243, 255, 0.1);
            border-radius: 10px;
        }
        .hvt-row.active {
            background: rgba(102, 243, 255, 0.12);
            border-color: rgba(102, 243, 255, 0.32);
        }
        .hvt-rank,
        .intel-score {
            color: var(--accent-cyan);
        }
        .hvt-name,
        .intel-names {
            color: var(--text-light);
        }
        .hvt-type,
        .hvt-score,
        .intel-meta,
        .intel-reasons {
            color: var(--text-muted);
        }
        .hvt-tag,
        .intel-badge {
            background: rgba(102, 243, 255, 0.08);
            border-color: rgba(102, 243, 255, 0.14);
            color: #a7bfd6;
        }

        #context-menu {
            background: linear-gradient(180deg, rgba(8, 18, 42, 0.98), rgba(4, 11, 26, 0.96));
            border: 1px solid rgba(102, 243, 255, 0.28);
            border-radius: 14px;
            clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px));
        }
        .ctx-item {
            font-size: 0.78rem;
            letter-spacing: 1.2px;
            text-transform: uppercase;
            color: var(--text-main);
        }
        .ctx-item:hover {
            background: rgba(102, 243, 255, 0.12);
            color: var(--accent-cyan);
        }
        .ctx-item.danger:hover {
            background: rgba(255, 107, 129, 0.12);
            color: #ff9aa7;
        }

        @media (max-width: 900px) {
            #filter-bar {
                bottom: 72px;
                width: calc(100vw - 20px);
                flex-wrap: wrap;
                justify-content: center;
            }
            .modal-segment {
                grid-template-columns: 1fr;
            }
            .data-hub-grid,
            .data-hub-advanced-grid {
                grid-template-columns: 1fr;
            }
            .ai-hub {
                min-height: auto;
            }
            .ai-hub-head {
                padding: 18px 16px 14px;
                flex-direction: column;
                align-items: stretch;
            }
            .ai-hub-close {
                width: 100%;
                min-width: 0;
            }
            .ai-hub-grid {
                grid-template-columns: 1fr;
                gap: 14px;
                padding: 16px;
            }
            .ai-hub-card {
                min-height: 240px;
                gap: 18px;
                padding: 26px 18px 22px;
            }
            .ai-hub-card-icon {
                width: 86px;
                height: 86px;
            }
            .ai-hub-card-title {
                font-size: clamp(1.7rem, 7vw, 2.3rem);
            }
            .ai-hub-card-desc {
                font-size: 0.82rem;
                letter-spacing: 1.7px;
            }
            .quick-create-tabs,
            .quick-create-link-flow,
            .quick-create-node-row {
                grid-template-columns: 1fr;
            }
            .quick-create-type-row,
            .quick-create-source-row,
            .quick-create-kind-row {
                flex-direction: column;
            }
            .editor-quick-identity {
                grid-template-columns: 1fr;
            }
            .editor-link-composer {
                flex-direction: column;
            }
            .cloud-inline-form,
            .cloud-grid,
            .cloud-local-grid {
                grid-template-columns: 1fr;
            }
            .cloud-home-head,
            .cloud-board-manage-head,
            .cloud-status-bar,
            .cloud-member-row,
            .cloud-board-row {
                flex-direction: column;
            }
            .intel-toolbar-row {
                flex-direction: column;
                align-items: stretch;
            }
            .cloud-row-actions {
                width: 100%;
                justify-content: flex-start;
            }
            .quick-create-kind-label {
                min-width: 0;
            }
            .quick-create-link-arrow {
                min-height: 28px;
                transform: rotate(90deg);
            }
            #hud {
                bottom: 132px;
                width: calc(100vw - 20px);
                justify-content: center;
                flex-wrap: wrap;
            }
            #settings-panel,
            #hvt-panel,
            #intel-panel {
                clip-path: none;
                border-radius: 16px;
            }
        }
    `;
    document.head.appendChild(style);
}
