// --- BIBLIOTHÈQUE D'ICÔNES TACTIQUES (V2 - BOLD) ---
export const ICONS = {
    // Carré Tactique (Par défaut) - Simple et efficace
    DEFAULT: '<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"/>',
    
    // QG / Base - Un château fort stylisé plein
    HQ: '<path d="M2 22h20V10l-4-4V2h-4v4h-4V2H6v4L2 10v12zM12 4h2v4h-2V4z" fill="currentColor"/>',
    
    // Police - Un bouclier insigne plein
    POLICE: '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" fill="currentColor"/>',
    
    // Hopital / Medic - Une croix épaisse
    MEDIC: '<path d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z" fill="currentColor"/>',
    
    // Gang / Hostile - Tête de mort bien visible
    GANG: '<path d="M12 2c-4.97 0-9 3.28-9 7.33 0 1.83.83 3.52 2.24 4.82L5 18h2.36c2.09.82 5.19.82 7.28 0H19l-.24-3.85C20.17 12.85 21 11.16 21 9.33 21 5.28 16.97 2 12 2zm-3 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="currentColor"/>',
    
    // Magasin - Panier rempli
    SHOP: '<path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" fill="currentColor"/>',
    
    // Armurerie - Pistolet solide
    WEAPON: '<path d="M20 6h-7.17l-3.42 3.41.59 4.59L3 21v-3l1.41-1.41 4.59.59L12.41 13.75 12 10h8V6z" fill="currentColor"/>',
    
    // Garage - Voiture de face pleine
    GARAGE: '<path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" fill="currentColor"/>',
    
    // Info - Cercle "i"
    INFO: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor"/>',
    
    // Zone Danger - Crâne simple
    SKULL: '<path d="M12 2c-4.42 0-8 3.58-8 8 0 4.42 3.58 8 8 8s8-3.58 8-8c0-4.42-3.58-8-8-8zm0 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z m0-12c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z" fill="currentColor"/>'
};

// --- ECHELLE RÉELLE (Inchangé) ---
export const MAP_SCALE_UNIT = 82.5; 

// --- CALIBRATION GPS GTA V (Inchangé) ---
export const GTA_BOUNDS = {
    MIN_X: -3750, MAX_X: 4500, MIN_Y: -4250, MAX_Y: 8250   
};

// --- CORRECTION MANUELLE (Inchangé) ---
export const GPS_CORRECTION = {
    x: -3.1, y: 1.5
};