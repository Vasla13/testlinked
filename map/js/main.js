import { state, setGroups, exportToJSON } from './state.js';
import { initEngine, centerMap } from './engine.js'; 
import { renderGroupsList, initUI, selectItem } from './ui.js';
import { renderAll } from './render.js';
import { gpsToPercentage } from './utils.js'; // Import de la fonction de conversion

const DEFAULT_DATA = [
    { name: "Alliés", color: "#73fbf7", visible: true, points: [], zones: [] },
    { name: "Hostiles", color: "#ff6b81", visible: true, points: [], zones: [] },
    { name: "Neutres", color: "#ffd400", visible: true, points: [], zones: [] }
];

document.addEventListener('DOMContentLoaded', () => {
    initUI();
    setGroups(DEFAULT_DATA);
    initEngine();
    renderGroupsList();
    renderAll(); 

    // --- LOGIQUE GPS ---
    const inpX = document.getElementById('gpsInputX');
    const inpY = document.getElementById('gpsInputY');
    const btnGps = document.getElementById('btnAddGpsPoint');

    // Détection collage intelligent (si on colle "GPS: X, Y" dans la case X)
    inpX.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        
        // Regex pour trouver deux nombres (positifs ou négatifs) séparés par virgule ou espace
        // Ex: "GPS: 861.2, -2308.94" ou "861.2 -2308.94"
        const matches = text.match(/([-\d.]+)[,\s]+([-\d.]+)/);
        
        if (matches && matches.length >= 3) {
            inpX.value = matches[1];
            inpY.value = matches[2];
        } else {
            inpX.value = text; // Collage normal si pas de format détecté
        }
    });

    btnGps.onclick = () => {
        const xVal = parseFloat(inpX.value);
        const yVal = parseFloat(inpY.value);

        if (isNaN(xVal) || isNaN(yVal)) {
            alert("Coordonnées invalides.");
            return;
        }

        // 1. Conversion
        const mapCoords = gpsToPercentage(xVal, yVal);

        // 2. Création du point
        if (state.groups.length > 0) {
            // On cherche le groupe "Points d'intérêt" ou on prend le premier visible
            let targetGroup = state.groups.find(g => g.name.includes("intérêt") || g.name.includes("Neutre"));
            if (!targetGroup) targetGroup = state.groups[0];

            // Rendre le groupe visible pour voir le point
            targetGroup.visible = true;

            // Ajout du point
            const newPoint = { 
                name: `GPS: ${xVal.toFixed(0)}, ${yVal.toFixed(0)}`, 
                x: mapCoords.x, 
                y: mapCoords.y, 
                type: "point",
                iconType: "INFO"
            };
            targetGroup.points.push(newPoint);

            // 3. Mise à jour UI
            renderGroupsList();
            renderAll();

            // 4. Zoom sur le point
            // On calcule le zoom pour centrer (formule inverse de engine.js)
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            state.view.scale = 3; // Zoom fort
            state.view.x = (vw / 2) - (newPoint.x * state.mapWidth / 100) * state.view.scale;
            state.view.y = (vh / 2) - (newPoint.y * state.mapHeight / 100) * state.view.scale;
            
            // Mise à jour visuelle du moteur
            import('./engine.js').then(eng => eng.updateTransform());
            
            // Sélectionner le point pour l'éditer direct
            selectItem('point', state.groups.indexOf(targetGroup), targetGroup.points.length - 1);
            
            // Nettoyer les inputs
            inpX.value = "";
            inpY.value = "";
        } else {
            alert("Créez d'abord un groupe !");
        }
    };

    // --- LE RESTE DU CODE EXISTANT ---
    const fileInput = document.getElementById('fileImport');
    if (fileInput) {
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const json = JSON.parse(evt.target.result);
                    if(json.groups) {
                        setGroups(json.groups);
                        if(json.tacticalLinks) state.tacticalLinks = json.tacticalLinks;
                        renderGroupsList();
                        renderAll();
                    } else { alert("Format JSON invalide."); }
                } catch(err) { console.error(err); alert("Erreur fichier."); }
            };
            reader.readAsText(file);
        };
    }

    const btnSave = document.getElementById('btnSave');
    if (btnSave) btnSave.onclick = exportToJSON;

    const btnReset = document.getElementById('btnResetView');
    if (btnReset) btnReset.onclick = centerMap;

    const btnAddGroup = document.getElementById('btnAddGroup');
    if (btnAddGroup) {
        btnAddGroup.onclick = () => {
            const name = prompt("Nom du groupe ?");
            if(name) {
                state.groups.push({ name, color: '#ffffff', visible: true, points: [], zones: [] });
                renderGroupsList();
            }
        };
    }
});