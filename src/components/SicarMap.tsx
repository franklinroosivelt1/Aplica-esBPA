import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { SicarProperty } from '../utils/sicarEngine';
import { Layers, MapPin, Maximize2 } from 'lucide-react';

interface SicarMapProps {
  properties: SicarProperty[];
  selectedPropertyId?: string | number | null;
  onSelectProperty?: (prop: SicarProperty) => void;
  queriedPoint: { lat: number; lng: number } | null;
}

export const SicarMap: React.FC<SicarMapProps> = ({
  properties,
  selectedPropertyId,
  onSelectProperty,
  queriedPoint,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const geojsonLayerRef = useRef<L.FeatureGroup | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [activeLayerType, setActiveLayerType] = React.useState<'osm' | 'satellite'>('satellite');

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialLat = queriedPoint ? queriedPoint.lat : -8.607189;
      const initialLng = queriedPoint ? queriedPoint.lng : -69.788186;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Tile layers
      const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      });

      const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18,
      });

      satelliteLayer.addTo(map);

      const featureGroup = L.featureGroup().addTo(map);
      geojsonLayerRef.current = featureGroup;
      mapInstanceRef.current = map;

      // Store layer refs on map object for easy switching
      (map as any)._osmLayer = osmLayer;
      (map as any)._satLayer = satelliteLayer;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Switch base layers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const osm = (map as any)._osmLayer;
    const sat = (map as any)._satLayer;

    if (activeLayerType === 'satellite') {
      if (map.hasLayer(osm)) map.removeLayer(osm);
      if (!map.hasLayer(sat)) sat.addTo(map);
    } else {
      if (map.hasLayer(sat)) map.removeLayer(sat);
      if (!map.hasLayer(osm)) osm.addTo(map);
    }
  }, [activeLayerType]);

  // Update features and marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    const featureGroup = geojsonLayerRef.current;
    if (!map || !featureGroup) return;

    featureGroup.clearLayers();

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    const bounds = L.latLngBounds([]);

    // Draw polygons
    properties.forEach((prop, idx) => {
      const isSelected = selectedPropertyId === prop.id || (!selectedPropertyId && idx === 0);

      // Distinct styling for selected vs overlapping CAR
      const style: L.PathOptions = {
        color: isSelected ? '#eab308' : '#38bdf8', // Yellow for selected, Sky Blue for other overlaps
        weight: isSelected ? 3.5 : 2.5,
        opacity: 0.95,
        fillColor: isSelected ? '#f59e0b' : '#0284c7',
        fillOpacity: isSelected ? 0.35 : 0.18,
        dashArray: isSelected ? undefined : '5, 5',
      };

      const geoJsonLayer = L.geoJSON(prop.geometry, {
        style,
        onEachFeature: (_, layer) => {
          layer.on('click', () => {
            if (onSelectProperty) onSelectProperty(prop);
          });
          layer.bindTooltip(`
            <div style="font-family: sans-serif; font-size: 11px; padding: 2px;">
              ${prop.layerName ? `<div style="font-weight: 700; color: #047857; text-transform: uppercase; font-size: 9px; margin-bottom: 2px;">Camada: ${prop.layerName}</div>` : ''}
              <strong style="color: #102410;">${prop.municipio}</strong><br/>
              CAR: ${prop.numCar !== 'Informação não disponível nesta base.' ? prop.numCar : prop.codImovel}<br/>
              Área: ${prop.areaHa}
            </div>
          `, { sticky: true });
        }
      });

      featureGroup.addLayer(geoJsonLayer);
      try {
        bounds.extend(geoJsonLayer.getBounds());
      } catch (e) {
        // ignore empty geometry bounds
      }
    });

    // Add marker for queried coordinate
    if (queriedPoint) {
      const pointLatLng = L.latLng(queriedPoint.lat, queriedPoint.lng);
      bounds.extend(pointLatLng);

      const customIcon = L.divIcon({
        className: 'custom-gps-pin',
        html: `
          <div style="
            position: relative;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <div style="
              position: absolute;
              width: 24px;
              height: 24px;
              background: #ef4444;
              border: 3px solid #ffffff;
              border-radius: 50%;
              box-shadow: 0 4px 10px rgba(0,0,0,0.5);
              animation: pulse 1.5s infinite;
            "></div>
            <div style="
              width: 8px;
              height: 8px;
              background: #ffffff;
              border-radius: 50%;
              z-index: 10;
            "></div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker(pointLatLng, { icon: customIcon }).addTo(map);
      marker.bindPopup(`
        <div style="font-family: sans-serif; font-size: 11px; text-align: center; padding: 4px;">
          <strong style="color: #b91c1c; text-transform: uppercase;">Ponto Consultado</strong><br/>
          Lat: ${queriedPoint.lat.toFixed(6)}<br/>
          Lng: ${queriedPoint.lng.toFixed(6)}
        </div>
      `).openPopup();

      markerRef.current = marker;
    }

    // Auto fit bounds
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 });
    }
  }, [properties, selectedPropertyId, queriedPoint, onSelectProperty]);

  // Handle fit bounds manually
  const handleRecenter = () => {
    const map = mapInstanceRef.current;
    const featureGroup = geojsonLayerRef.current;
    if (!map || !featureGroup) return;

    const bounds = featureGroup.getBounds();
    if (queriedPoint) {
      bounds.extend([queriedPoint.lat, queriedPoint.lng]);
    }
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  };

  return (
    <div className="relative w-full h-[320px] sm:h-[380px] rounded-2xl overflow-hidden border border-military-700/80 shadow-md bg-military-900" id="sicar-map-container">
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* Map Controls */}
      <div className="absolute top-2.5 right-2.5 z-20 flex flex-col gap-1.5 bg-military-850/90 backdrop-blur-md p-1 rounded-xl border border-military-700 shadow-lg">
        <button
          onClick={() => setActiveLayerType(activeLayerType === 'satellite' ? 'osm' : 'satellite')}
          title="Alternar Satélite / Mapa"
          className="p-2 rounded-lg hover:bg-military-800 text-military-200 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
        >
          <Layers className="w-4 h-4 text-military-400" />
          <span>{activeLayerType === 'satellite' ? 'Satélite' : 'Vetor'}</span>
        </button>

        <button
          onClick={handleRecenter}
          title="Centralizar nos Imóveis"
          className="p-2 rounded-lg hover:bg-military-800 text-military-200 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
        >
          <Maximize2 className="w-4 h-4 text-military-400" />
          <span>Enquadrar</span>
        </button>
      </div>

      {/* Map Legend */}
      <div className="absolute bottom-2.5 left-2.5 z-20 bg-military-900/90 backdrop-blur-md px-3 py-2 rounded-xl border border-military-700 text-[10px] text-military-300 font-mono shadow-md flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500 border border-white" />
          <span className="text-military-100 font-bold">Ponto GPS</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-2.5 rounded-sm bg-yellow-500/40 border-2 border-yellow-500" />
          <span className="text-military-100 font-bold">CAR Selecionado</span>
        </div>
        {properties.length > 1 && (
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-2.5 rounded-sm bg-sky-500/30 border-2 border-dashed border-sky-400" />
            <span className="text-sky-300 font-bold">Sobreposição</span>
          </div>
        )}
      </div>
    </div>
  );
};
