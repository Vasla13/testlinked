import { state } from './state.js';
import { handleMapClick } from './ui.js';

let map = null;
const hudCoords = document.getElementById('coords-display');

// CONFIGURATION BASÉE SUR TES FICHIERS (Zoom max 7)
// Une tuile fait 256px. Au zoom 7, la carte fait 2^7 tuiles = 128 tuiles.
// 128 tuiles * 256px = 32768 pixels.
const MAP_PIXEL_SIZE = 32768; 
const MAP_PERCENT_SIZE = 100; // Ton échelle JSON (0-100)
const SCALE_FACTOR = MAP_PIXEL_SIZE / MAP_PERCENT_SIZE; 

export function initEngine() {
    // 1. Initialisation Leaflet
    map = L.map('map-world', {
        crs: L.CRS.Simple, 
        minZoom: 1, 
        maxZoom: 10,        // Zoom max autorisé (agrandissement numérique)
        zoomControl: false, 
        attributionControl: false,
        zoomSnap: 0.1,
        wheelPxPerZoomLevel: 120
    });

    // 2. Définition des bornes (Top-Left 0,0 | Bottom-Right -32768, 32768)
    const bounds = [[-MAP_PIXEL_SIZE, 0], [0, MAP_PIXEL_SIZE]];

    // 3. CHARGEMENT DES TUILES (CORRIGÉ POUR TON FORMAT : Z-X_Y.png)
    // On utilise les tirets et l'underscore comme dans ton terminal
    const tileUrl = './tiles/atlas/{z}-{x}_{y}.png';

    L.tileLayer(tileUrl, {
        minZoom: 0,
        maxZoom: 10, 
        maxNativeZoom: 7,  // Tes fichiers s'arrêtent au zoom 7
        bounds: bounds,
        noWrap: true,
        tms: false, 
        tileSize: 256,
        // Image transparente si fichier manquant (évite les erreurs 404)
        errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    }).addTo(map);

    // 4. Couleur de l'océan
    document.getElementById('map-world').style.background = '#0fa8d2';

    // Centrage initial
    map.fitBounds(bounds);

    // 5. Événements
    map.on('mousemove', (e) => {
        const pct = leafletToPct(e.latlng);
        if(hudCoords) hudCoords.innerText = `X: ${pct.x.toFixed(2)} | Y: ${pct.y.toFixed(2)}`;
    });

    map.on('click', (e) => {
        if (handleMapClick(e.latlng, false)) return;
    });

    map.on('contextmenu', (e) => {
        if (handleMapClick(e.latlng, true)) return;
        state.lastRightClickPos = leafletToPct(e.latlng);
    });

    return map;
}

export function centerMap() {
    if(map) map.fitBounds([[-MAP_PIXEL_SIZE, 0], [0, MAP_PIXEL_SIZE]]);
}

export function getMapInstance() { return map; }

// --- CONVERSIONS (0-100 vers 0-32768) ---

export function pctToLeaflet(pt) {
    return [-(pt.y * SCALE_FACTOR), pt.x * SCALE_FACTOR];
}

export function leafletToPct(latlng) {
    return {
        x: latlng.lng / SCALE_FACTOR,
        y: -(latlng.lat / SCALE_FACTOR)
    };
}

export const getMapPercentCoords = leafletToPct;