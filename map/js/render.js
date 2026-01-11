import { state } from './state.js';
import { getMapInstance, pctToLeaflet } from './engine.js';
import { selectItem } from './ui.js';

let layersGroup = null;

export function renderAll() {
    const map = getMapInstance();
    if (!map) return;

    if (!layersGroup) {
        layersGroup = L.layerGroup().addTo(map);
    } else {
        layersGroup.clearLayers();
    }

    state.groups.forEach((group, gIndex) => {
        if (!group.visible) return;
        const color = group.color;

        // 1. ZONES (Polygones)
        if (group.zones) {
            group.zones.forEach((zone, zIndex) => {
                const latlngs = zone.points.map(p => pctToLeaflet(p));
                const isSelected = (state.selectedItem && state.selectedItem.type === 'zone' && state.selectedItem.groupIndex === gIndex && state.selectedItem.itemIndex === zIndex);
                
                const poly = L.polygon(latlngs, {
                    color: color, weight: isSelected ? 3 : 1, fillOpacity: 0.3,
                    dashArray: isSelected ? '5, 5' : null
                });
                poly.on('click', (e) => { L.DomEvent.stopPropagation(e); selectItem('zone', gIndex, zIndex); });
                layersGroup.addLayer(poly);
            });
        }

        // 2. ROUTES (Lignes) <--- NOUVEAU
        if (group.routes) {
            group.routes.forEach((route, rIndex) => {
                const latlngs = route.points.map(p => pctToLeaflet(p));
                const isSelected = (state.selectedItem && state.selectedItem.type === 'route' && state.selectedItem.groupIndex === gIndex && state.selectedItem.itemIndex === rIndex);

                // On dessine une ligne épaisse
                const line = L.polyline(latlngs, {
                    color: color,
                    weight: isSelected ? 6 : 4, // Plus épais pour être visible
                    opacity: isSelected ? 1 : 0.8,
                    lineCap: 'round'
                });

                // Flèches de direction (Optionnel, nécessite plugin, sinon juste ligne simple)
                
                line.on('click', (e) => { L.DomEvent.stopPropagation(e); selectItem('route', gIndex, rIndex); });
                layersGroup.addLayer(line);
            });
        }

        // 3. POINTS (Markers)
        group.points.forEach((point, pIndex) => {
            const latlng = pctToLeaflet(point);
            const isSelected = (state.selectedItem && state.selectedItem.type === 'point' && state.selectedItem.groupIndex === gIndex && state.selectedItem.itemIndex === pIndex);
            
            const htmlIcon = `<div class="custom-marker ${isSelected ? 'selected' : ''}" style="--color:${color}"><div class="marker-pin"></div><div class="marker-label">${point.name}</div></div>`;
            const customIcon = L.divIcon({ html: htmlIcon, className: '', iconSize: [30, 30], iconAnchor: [15, 15] });
            
            const marker = L.marker(latlng, { icon: customIcon });
            marker.on('click', (e) => { L.DomEvent.stopPropagation(e); selectItem('point', gIndex, pIndex); });
            layersGroup.addLayer(marker);
        });
    });

    // DESSIN EN COURS (Aperçu)
    if (state.drawingMode && state.tempPoints.length > 0) {
        const latlngs = state.tempPoints.map(p => pctToLeaflet(p));
        // Si on dessine une zone, on ferme la forme (polygon), sinon ligne ouverte (polyline)
        const ShapeClass = (state.drawingType === 'zone') ? L.polygon : L.polyline;
        
        const tempShape = new ShapeClass(latlngs, {
            color: '#fff', weight: 2, dashArray: '10, 10', fillOpacity: 0.1
        });
        layersGroup.addLayer(tempShape);
    }
}