export const ICONS = {
    // Un simple point
    DEFAULT: '<circle cx="12" cy="12" r="5" fill="currentColor"/>',
    
    // Base / QG (Forme de bouclier/maison)
    HQ: '<path d="M12 2L2 12h3v8h6v-6h2v6h6v-8h3L12 2z" fill="currentColor"/>',
    
    // Hostile (Crâne stylisé simplifié)
    HOSTILE: '<path d="M12 2c-4.4 0-8 3.6-8 8 0 2.1.8 4 2.1 5.4L6 22h12l-.1-6.6c1.3-1.4 2.1-3.3 2.1-5.4 0-4.4-3.6-8-8-8zm0 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="currentColor"/>',
    
    // Business (Dollar)
    BUSINESS: '<path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" fill="currentColor"/>',
    
    // Véhicule / Garage
    GARAGE: '<path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" fill="currentColor"/>',
    
    // Info
    INFO: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor"/>'
};

// Echelle : 1% de la map = X mètres. (A calibrer selon ta carte GTA/IRL)
export const MAP_SCALE_UNIT = 150;