import { GTA_BOUNDS, GPS_CORRECTION } from './constants.js';

// Convertit les coordonnées GPS (Mètres) en Pourcentage CSS (0-100%)
export function gpsToPercentage(gameX, gameY) {
    // Calcul de la largeur et hauteur totale du monde en unités jeu
    const mapWidth = GTA_BOUNDS.MAX_X - GTA_BOUNDS.MIN_X;
    const mapHeight = GTA_BOUNDS.MAX_Y - GTA_BOUNDS.MIN_Y;

    // Conversion X
    let xPercent = ((gameX - GTA_BOUNDS.MIN_X) / mapWidth) * 100;

    // Conversion Y (Axe inversé)
    let yPercent = ((GTA_BOUNDS.MAX_Y - gameY) / mapHeight) * 100;

    // --- APPLICATION DE LA CORRECTION ---
    // On ajoute le décalage manuel défini dans constants.js
    xPercent += GPS_CORRECTION.x;
    yPercent += GPS_CORRECTION.y;

    return { x: xPercent, y: yPercent };
}