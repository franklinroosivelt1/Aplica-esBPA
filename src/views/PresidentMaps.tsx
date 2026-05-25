import React, { useState, useEffect, useRef } from 'react';
import { 
  Compass, 
  Layers, 
  Wrench, 
  MapPin, 
  Route, 
  ChevronLeft, 
  Plus, 
  Minus, 
  Menu, 
  X, 
  Eye, 
  EyeOff, 
  Trash2, 
  Upload, 
  Check, 
  Copy,
  Navigation,
  Globe,
  ChevronDown,
  ChevronUp,
  Share2,
  Save,
  Pencil
} from 'lucide-react';
import { decimalToDMS } from '../utils/coords';

// --- DATABASE PERSISTENCE SYSTEM (IndexedDB) ---
const DB_NAME = 'PresidentMapsDB_v1';
const DB_VERSION = 1;

export interface ImportedMap {
  id: string;
  name: string;
  dataUrl: string; // High-res image rendered from PDF page 1
  width: number;
  height: number;
  topLeft: { lat: number; lng: number };
  bottomRight: { lat: number; lng: number };
}

export interface KmlData {
  id: string;
  name: string;
  visible: boolean;
  features: Array<{
    type: 'Point' | 'LineString' | 'Polygon';
    name: string;
    description?: string;
    coordinates: Array<{ lat: number; lng: number }>;
  }>;
}

function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains('mapas')) {
        db.createObjectStore('mapas', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('kmlLayers')) {
        db.createObjectStore('kmlLayers', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbSaveMap(map: ImportedMap): Promise<void> {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('mapas', 'readwrite');
      tx.objectStore('mapas').put(map);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

function dbGetMaps(): Promise<ImportedMap[]> {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('mapas', 'readonly');
      const req = tx.objectStore('mapas').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

function dbDeleteMap(id: string): Promise<void> {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('mapas', 'readwrite');
      tx.objectStore('mapas').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

function dbSaveKml(kml: KmlData): Promise<void> {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kmlLayers', 'readwrite');
      tx.objectStore('kmlLayers').put(kml);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

function dbGetKmls(): Promise<KmlData[]> {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kmlLayers', 'readonly');
      const req = tx.objectStore('kmlLayers').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

function dbDeleteKml(id: string): Promise<void> {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kmlLayers', 'readwrite');
      tx.objectStore('kmlLayers').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

// --- WEB MERCATOR PROJECTION MATH ---
const TILE_SIZE = 256;

function latLngToWorldPixel(lat: number, lng: number, zoom: number) {
  const numTiles = Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * TILE_SIZE * numTiles;
  
  const latRad = (lat * Math.PI) / 180;
  const y = (1 - (Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) / 2 * TILE_SIZE * numTiles;
  
  return { x, y };
}

function worldPixelToLatLng(x: number, y: number, zoom: number) {
  const numTiles = Math.pow(2, zoom);
  const lng = (x / (TILE_SIZE * numTiles)) * 360 - 180;
  
  const yNorm = 0.5 - (y / (TILE_SIZE * numTiles));
  const latRad = Math.atan(Math.sinh(yNorm * 2 * Math.PI));
  const lat = (latRad * 180) / Math.PI;
  
  return { lat, lng };
}

// Coordinate preset for the Environmental Police (BPA) in Acre, Brazil
const BASE_LAT = -9.04312;
const BASE_LNG = -68.65581;

// Load PDF.js dynamically from CDN to render GeoPDF files offline
const loadPdfJs = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.onload = () => {
      const pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(pdfjsLib);
    };
    script.onerror = (e) => reject(new Error("Erro ao carregar o visualizador de PDF (PDF.js)"));
    document.head.appendChild(script);
  });
};

function distToSegment(p: { x: number; y: number }, v: { x: number; y: number }, w: { x: number; y: number }) {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return Math.sqrt((p.x - v.x) ** 2 + (p.y - v.y) ** 2);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2);
}

function isPointInPolygon(p: { x: number; y: number }, vs: Array<{ x: number; y: number }>) {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y;
    const xj = vs[j].x, yj = vs[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y))
        && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

interface SavedPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  createdAt: number;
}

interface SavedDistance {
  id: string;
  name: string;
  points: Array<{ lat: number; lng: number }>;
  distance: number;
  createdAt: number;
}

interface SavedArea {
  id: string;
  name: string;
  points: Array<{ lat: number; lng: number }>;
  area: number; // in hectares
  createdAt: number;
}

interface PresidentMapsProps {
  onBack: () => void;
}

type TabType = 'camadas' | 'ferramentas' | 'pontos' | 'trajetos';
type BaseMapType = 'satellite' | 'hybrid' | 'osm' | 'none';

export default function PresidentMaps({ onBack }: PresidentMapsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('camadas');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Selected feature ballon state
  const [selectedFeature, setSelectedFeature] = useState<{
    name: string;
    description?: string;
    type: string;
    layerName: string;
    lat: number;
    lng: number;
  } | null>(null);

  const [selectedSavedPoint, setSelectedSavedPoint] = useState<SavedPoint | null>(null);
  const [selectedDistance, setSelectedDistance] = useState<SavedDistance | null>(null);
  const [selectedArea, setSelectedArea] = useState<SavedArea | null>(null);

  // --- GIS TACTICAL MEASURING AND SAVED POINTS STATES ---
  const [measuringMode, setMeasuringMode] = useState<'none' | 'add_point' | 'measure_distance' | 'measure_area'>('none');
  const [measurePoints, setMeasurePoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [areaPoints, setAreaPoints] = useState<Array<{ lat: number; lng: number }>>([]);
  
  // Saved Points List
  const [savedPoints, setSavedPoints] = useState<SavedPoint[]>(() => {
    const got = localStorage.getItem('president_saved_points');
    if (got) {
      try { return JSON.parse(got); } catch (e) { return []; }
    }
    return [];
  });

  // Save to LocalStorage whenever savedPoints change
  useEffect(() => {
    localStorage.setItem('president_saved_points', JSON.stringify(savedPoints));
  }, [savedPoints]);

  // Saved Distances List
  const [savedDistances, setSavedDistances] = useState<SavedDistance[]>(() => {
    const got = localStorage.getItem('president_saved_distances');
    if (got) {
      try { return JSON.parse(got); } catch (e) { return []; }
    }
    return [];
  });

  // Save to LocalStorage whenever savedDistances change
  useEffect(() => {
    localStorage.setItem('president_saved_distances', JSON.stringify(savedDistances));
  }, [savedDistances]);

  // Saved Areas List
  const [savedAreas, setSavedAreas] = useState<SavedArea[]>(() => {
    const got = localStorage.getItem('president_saved_areas');
    if (got) {
      try { return JSON.parse(got); } catch (e) { return []; }
    }
    return [];
  });

  // Save to LocalStorage whenever savedAreas change
  useEffect(() => {
    localStorage.setItem('president_saved_areas', JSON.stringify(savedAreas));
  }, [savedAreas]);

  // Collapsible dropdown toggle states for Distance and Area in the Tab view
  const [isDistanceDropdownOpen, setIsDistanceDropdownOpen] = useState(false);
  const [isAreaDropdownOpen, setIsAreaDropdownOpen] = useState(false);

  const [expandedDistanceMenuId, setExpandedDistanceMenuId] = useState<string | null>(null);
  const [expandedAreaMenuId, setExpandedAreaMenuId] = useState<string | null>(null);

  const [editingDistanceId, setEditingDistanceId] = useState<string | null>(null);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState('');

  // Point Addition fields
  const [pointName, setPointName] = useState('');
  const [pointFormat, setPointFormat] = useState<'DMS' | 'DEC'>('DMS');
  const [decLat, setDecLat] = useState('-9.043120');
  const [decLng, setDecLng] = useState('-68.655810');
  
  // Latitude DMS Pieces
  const [latD, setLatD] = useState('9');
  const [latM, setLatM] = useState('3');
  const [latS, setLatS] = useState('0.15');
  const [latH, setLatH] = useState('S');

  // Longitude DMS Pieces
  const [lngD, setLngD] = useState('68');
  const [lngM, setLngM] = useState('40');
  const [lngS, setLngS] = useState('3.06');
  const [lngH, setLngH] = useState('W');

  // Point expansion and editing states
  const [editingPointId, setEditingPointId] = useState<string | null>(null);
  const [expandedPointMenuId, setExpandedPointMenuId] = useState<string | null>(null);

  // Collapsible Submenu Dropdowns states
  const [isInternetBaseOpen, setIsInternetBaseOpen] = useState(false);
  const [isGeoMapsOpen, setIsGeoMapsOpen] = useState(false);
  const [isVectorLayersOpen, setIsVectorLayersOpen] = useState(false);

  // Map state
  const [center, setCenter] = useState({ lat: BASE_LAT, lng: BASE_LNG });
  const [zoom, setZoom] = useState(16);
  const [rotation, setRotation] = useState(0); // in radians

  // Lists of maps and layers
  const [importedMaps, setImportedMaps] = useState<ImportedMap[]>([]);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [kmlLayers, setKmlLayers] = useState<KmlData[]>([]);
  const [baseMap, setBaseMap] = useState<BaseMapType>('osm');

  // GPS real-world parameters
  const [gpsCoords, setGpsCoords] = useState<{ lat: number, lng: number, accuracy: number } | null>(null);
  const [simulatedGps, setSimulatedGps] = useState<boolean>(true); // Start simulated in Rio Branco Acre
  const [simGpsCoords, setSimGpsCoords] = useState({ lat: -9.0445, lng: -68.6540 });

  // Refs for tracking interactive elements
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const initialCenterPixel = useRef({ x: 0, y: 0 });
  const mouseDownTime = useRef(0);
  const touchStartTime = useRef(0);
  const lastTouchTime = useRef<number>(0);

  // Touch gesture support for rotation and zoom pinch
  const touchState = useRef<{
    initialDist: number;
    initialZoom: number;
    initialAngle: number;
    initialRotation: number;
    initialCenterPixel: { x: number, y: number };
  } | null>(null);

  // Image caches to hold renders of offline files and tile servers
  const tileCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const mapImageCache = useRef<Map<string, HTMLImageElement>>(new Map());

  // Trigger manual canvas paint
  const [paintCount, setPaintCount] = useState(0);
  const triggerRedraw = () => setPaintCount(prev => prev + 1);

  // Initialize and load saved maps and layers
  useEffect(() => {
    dbGetMaps().then(maps => {
      setImportedMaps(maps);
      if (maps.length > 0) {
        setActiveMapId(maps[0].id);
        setCenter({ lat: maps[0].topLeft.lat + (maps[0].bottomRight.lat - maps[0].topLeft.lat) / 2, lng: maps[0].topLeft.lng + (maps[0].bottomRight.lng - maps[0].topLeft.lng) / 2 });
      }
    });

    dbGetKmls().then(kmls => {
      setKmlLayers(kmls);
    });

    // Handle Resize
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height
          });
        }
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  // Track real GPS position if simulation turned off
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      },
      (err) => {
        console.warn("GPS Indisponível ou Permissão Negada", err);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Redraw whenever parameters adapt
  useEffect(() => {
    triggerRedraw();
  }, [center, zoom, rotation, activeMapId, baseMap, kmlLayers, gpsCoords, simulatedGps, simGpsCoords, dimensions, importedMaps]);

  // Handle drawing operation over HTML5 Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear background
    ctx.fillStyle = '#1a1c0e'; // military-900
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    const centerPixel = latLngToWorldPixel(center.lat, center.lng, zoom);

    // Save state for rotated/translated mapping
    ctx.save();
    ctx.translate(dimensions.width / 2, dimensions.height / 2);
    ctx.rotate(-rotation);

    // 1. CHOOSE BASE MAP TILES
    if (baseMap !== 'none') {
      const centerTileX = Math.floor(centerPixel.x / TILE_SIZE);
      const centerTileY = Math.floor(centerPixel.y / TILE_SIZE);
      const gridExtent = 3; // Render a 7x7 grid to cover rotational corners

      const numTiles = Math.pow(2, zoom);

      for (let dx = -gridExtent; dx <= gridExtent; dx++) {
        for (let dy = -gridExtent; dy <= gridExtent; dy++) {
          const tx = centerTileX + dx;
          const ty = centerTileY + dy;

          // Wrap mercator bounds
          if (tx < 0 || tx >= numTiles || ty < 0 || ty >= numTiles) continue;

          const tileX = tx * TILE_SIZE;
          const tileY = ty * TILE_SIZE;

          const screenX = tileX - centerPixel.x;
          const screenY = tileY - centerPixel.y;

          // Resolve tile image
          let tileUrl = '';
          if (baseMap === 'osm') {
            tileUrl = `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
          } else if (baseMap === 'satellite') {
            tileUrl = `https://mt1.google.com/vt/lyrs=s&x=${tx}&y=${ty}&z=${zoom}`;
          } else if (baseMap === 'hybrid') {
            tileUrl = `https://mt1.google.com/vt/lyrs=y&x=${tx}&y=${ty}&z=${zoom}`;
          }

          const cachedImg = tileCache.current.get(tileUrl);
          if (cachedImg) {
            if (cachedImg.complete && cachedImg.naturalWidth !== 0) {
              ctx.drawImage(cachedImg, screenX, screenY, TILE_SIZE, TILE_SIZE);
            }
          } else {
            const img = new Image();
            img.src = tileUrl;
            img.crossOrigin = "anonymous";
            img.onload = () => {
              triggerRedraw();
            };
            tileCache.current.set(tileUrl, img);
          }
        }
      }
    } else {
      // Offline grid style
      ctx.strokeStyle = '#2d3118';
      ctx.lineWidth = 1;
      const step = 64;
      const rangeX = Math.ceil(dimensions.width / step) + 4;
      const rangeY = Math.ceil(dimensions.height / step) + 4;
      for (let x = -rangeX; x <= rangeX; x++) {
        ctx.beginPath();
        ctx.moveTo(x * step, -dimensions.height);
        ctx.lineTo(x * step, dimensions.height);
        ctx.stroke();
      }
      for (let y = -rangeY; y <= rangeY; y++) {
        ctx.beginPath();
        ctx.moveTo(-dimensions.width, y * step);
        ctx.lineTo(dimensions.width, y * step);
        ctx.stroke();
      }
    }

    // 2. RENDER THE ACTIVE GEOPDF IMAGE
    const activeMap = importedMaps.find(m => m.id === activeMapId);
    if (activeMap) {
      let mapImg = mapImageCache.current.get(activeMap.id);
      if (!mapImg) {
        mapImg = new Image();
        mapImg.src = activeMap.dataUrl;
        mapImg.onload = () => {
          triggerRedraw();
        };
        mapImageCache.current.set(activeMap.id, mapImg);
      }

      if (mapImg && mapImg.complete) {
        const tlPixel = latLngToWorldPixel(activeMap.topLeft.lat, activeMap.topLeft.lng, zoom);
        const brPixel = latLngToWorldPixel(activeMap.bottomRight.lat, activeMap.bottomRight.lng, zoom);

        const targetX = tlPixel.x - centerPixel.x;
        const targetY = tlPixel.y - centerPixel.y;
        const targetW = brPixel.x - tlPixel.x;
        const targetH = brPixel.y - tlPixel.y;

        // Render PDF content onto Web Mercator coordinates
        ctx.drawImage(mapImg, targetX, targetY, targetW, targetH);

        // Highlight map boundary visually (tactical military cyan/blue style)
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(targetX, targetY, targetW, targetH);
        ctx.setLineDash([]);
      }
    }

    // 3. RENDER KML VECTOR LAYERS
    kmlLayers.forEach(layer => {
      if (!layer.visible) return;

      layer.features.forEach(feat => {
        if (feat.coordinates.length === 0) return;

        ctx.strokeStyle = '#3b82f6'; // Bright field-blue
        ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
        ctx.lineWidth = 3;

        const pts = feat.coordinates.map(pt => {
          const wPx = latLngToWorldPixel(pt.lat, pt.lng, zoom);
          return {
            x: wPx.x - centerPixel.x,
            y: wPx.y - centerPixel.y
          };
        });

        if (feat.type === 'Point') {
          pts.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#059669'; // Emerald military point
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Render Point Label
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px monospace';
            ctx.fillText(feat.name || 'Ponto KML', p.x + 8, p.y + 4);
          });
        } else if (feat.type === 'LineString') {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.stroke();
        } else if (feat.type === 'Polygon') {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      });
    });

    // 4. DRAW GPS USER POSITION (Active Beacon)
    const positionToShow = simulatedGps ? simGpsCoords : gpsCoords;
    if (positionToShow) {
      const gpsPixel = latLngToWorldPixel(positionToShow.lat, positionToShow.lng, zoom);
      const gx = gpsPixel.x - centerPixel.x;
      const gy = gpsPixel.y - centerPixel.y;

      // Pulse accuracy ring
      ctx.beginPath();
      ctx.arc(gx, gy, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();

      // Main inner circle
      ctx.beginPath();
      ctx.arc(gx, gy, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }

    // 4b. DRAW SAVED POINTS
    savedPoints.forEach(pt => {
      const ptPixel = latLngToWorldPixel(pt.lat, pt.lng, zoom);
      const px = ptPixel.x - centerPixel.x;
      const py = ptPixel.y - centerPixel.y;

      // Pulse circle
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Red indicator dot with white ring
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444'; // Red
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Standard point label styled professionally
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-rotation);
      
      ctx.fillStyle = '#ef5350';
      ctx.font = 'bold 9px sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 4;
      ctx.fillText(pt.name || 'Ponto', 10, 3);
      ctx.shadowColor = 'transparent';
      ctx.restore();
    });

    // 4c. DRAW MEASURE DISTANCE PATH
    if (measurePoints.length > 0) {
      ctx.beginPath();
      const startPixel = latLngToWorldPixel(measurePoints[0].lat, measurePoints[0].lng, zoom);
      ctx.moveTo(startPixel.x - centerPixel.x, startPixel.y - centerPixel.y);
      for (let i = 1; i < measurePoints.length; i++) {
        const ptPixel = latLngToWorldPixel(measurePoints[i].lat, measurePoints[i].lng, zoom);
        ctx.lineTo(ptPixel.x - centerPixel.x, ptPixel.y - centerPixel.y);
      }
      ctx.strokeStyle = '#3b82f6'; // Bright blue
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw node circles and measurement increments
      let accumulatedDistance = 0;
      measurePoints.forEach((pt, idx) => {
        const ptPixel = latLngToWorldPixel(pt.lat, pt.lng, zoom);
        const px = ptPixel.x - centerPixel.x;
        const py = ptPixel.y - centerPixel.y;

        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#2563eb';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (idx > 0) {
          accumulatedDistance += calculateHaversineDistance(measurePoints[idx - 1], pt);
        }

        // Point index indicator badge
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-rotation);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px monospace';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 3;
        ctx.fillText(`P${idx+1}`, 8, -4);
        ctx.restore();
      });
    }

    // 4d. DRAW MEASURE AREA POLYGON
    if (areaPoints.length > 0) {
      ctx.beginPath();
      const startPixel = latLngToWorldPixel(areaPoints[0].lat, areaPoints[0].lng, zoom);
      ctx.moveTo(startPixel.x - centerPixel.x, startPixel.y - centerPixel.y);
      for (let i = 1; i < areaPoints.length; i++) {
        const ptPixel = latLngToWorldPixel(areaPoints[i].lat, areaPoints[i].lng, zoom);
        ctx.lineTo(ptPixel.x - centerPixel.x, ptPixel.y - centerPixel.y);
      }
      if (areaPoints.length >= 3) {
        ctx.closePath();
        ctx.fillStyle = 'rgba(234, 179, 8, 0.2)'; // Warm golden transparent area fill
        ctx.fill();
      }

      ctx.strokeStyle = '#eab308'; // Golden border
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Draw points of the area polygon
      areaPoints.forEach((pt, idx) => {
        const ptPixel = latLngToWorldPixel(pt.lat, pt.lng, zoom);
        const px = ptPixel.x - centerPixel.x;
        const py = ptPixel.y - centerPixel.y;

        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ca8a04';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-rotation);
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 8px monospace';
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 3;
        ctx.fillText(`V${idx+1}`, 8, -4);
        ctx.restore();
      });

      // Compute polygon area
      if (areaPoints.length >= 3) {
        let sumX = 0, sumY = 0;
        areaPoints.forEach(pt => {
          const ptPixel = latLngToWorldPixel(pt.lat, pt.lng, zoom);
          sumX += ptPixel.x - centerPixel.x;
          sumY += ptPixel.y - centerPixel.y;
        });
        const cx = sumX / areaPoints.length;
        const cy = sumY / areaPoints.length;

        let areaSqKm = 0;
        const j = areaPoints.length;
        for (let i = 0; i < j; i++) {
          const p1 = areaPoints[i];
          const p2 = areaPoints[(i + 1) % j];
          const x1 = calculateHaversineDistance({ lat: center.lat, lng: p1.lng }, center) * 1000 * (p1.lng >= center.lng ? 1 : -1);
          const y1 = calculateHaversineDistance({ lat: p1.lat, lng: center.lng }, center) * 1000 * (p1.lat >= center.lat ? 1 : -1);
          const x2 = calculateHaversineDistance({ lat: center.lat, lng: p2.lng }, center) * 1000 * (p2.lng >= center.lng ? 1 : -1);
          const y2 = calculateHaversineDistance({ lat: p2.lat, lng: center.lng }, center) * 1000 * (p2.lat >= center.lat ? 1 : -1);
          areaSqKm += (x1 * y2 - x2 * y1);
        }
        const totalAreaHectares = Math.abs(areaSqKm / 2) / 10000;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-rotation);
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 10px monospace';
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 4;
        ctx.textAlign = 'center';
        ctx.fillText(`${totalAreaHectares.toFixed(2)} ha`, 0, 4);
        ctx.restore();
      }
    }

    // 4cc. DRAW SAVED DISTANCE PATHS
    savedDistances.forEach(sd => {
      if (sd.points.length > 0) {
        ctx.beginPath();
        const startPixel = latLngToWorldPixel(sd.points[0].lat, sd.points[0].lng, zoom);
        ctx.moveTo(startPixel.x - centerPixel.x, startPixel.y - centerPixel.y);
        for (let i = 1; i < sd.points.length; i++) {
          const ptPixel = latLngToWorldPixel(sd.points[i].lat, sd.points[i].lng, zoom);
          ctx.lineTo(ptPixel.x - centerPixel.x, ptPixel.y - centerPixel.y);
        }
        ctx.strokeStyle = '#10b981'; // Bright emerald green for saved paths
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Draw node circles and distance label at the end
        sd.points.forEach((pt, idx) => {
          const ptPixel = latLngToWorldPixel(pt.lat, pt.lng, zoom);
          const px = ptPixel.x - centerPixel.x;
          const py = ptPixel.y - centerPixel.y;
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#065f46';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }
    });

    // 4dd. DRAW SAVED AREA POLYGONS
    savedAreas.forEach(sa => {
      if (sa.points.length >= 3) {
        ctx.beginPath();
        const startPixel = latLngToWorldPixel(sa.points[0].lat, sa.points[0].lng, zoom);
        ctx.moveTo(startPixel.x - centerPixel.x, startPixel.y - centerPixel.y);
        for (let i = 1; i < sa.points.length; i++) {
          const ptPixel = latLngToWorldPixel(sa.points[i].lat, sa.points[i].lng, zoom);
          ctx.lineTo(ptPixel.x - centerPixel.x, ptPixel.y - centerPixel.y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(217, 119, 6, 0.15)'; // Golden transparent
        ctx.fill();
        ctx.strokeStyle = '#f59e0b'; // Amber
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    ctx.restore();

    // 5. DRAW COMPASS ACCENT (Static decal)
    ctx.lineWidth = 2;
  }, [paintCount, dimensions, center, zoom, rotation, activeMapId, baseMap, kmlLayers, gpsCoords, simulatedGps, simGpsCoords, savedPoints, savedDistances, savedAreas, measurePoints, areaPoints, measuringMode]);

  // Helpers for locating screen coordinate of lat/lng
  const getScreenPos = (lat: number, lng: number) => {
    const centerPixel = latLngToWorldPixel(center.lat, center.lng, zoom);
    const wPx = latLngToWorldPixel(lat, lng, zoom);
    const cx = wPx.x - centerPixel.x;
    const cy = wPx.y - centerPixel.y;
    // Apply rotation
    const cosAngle = Math.cos(-rotation);
    const sinAngle = Math.sin(-rotation);
    const rx = cx * cosAngle - cy * sinAngle;
    const ry = cx * sinAngle + cy * cosAngle;
    return {
      x: rx + dimensions.width / 2,
      y: ry + dimensions.height / 2
    };
  };

  const findFeatureAt = (sx: number, sy: number) => {
    const centerPixel = latLngToWorldPixel(center.lat, center.lng, zoom);
    
    for (const layer of kmlLayers) {
      if (!layer.visible) continue;
      for (const feat of layer.features) {
        if (feat.coordinates.length === 0) continue;
        
        // Map all feature points to current screen pixels
        const pts = feat.coordinates.map(pt => {
          const wPx = latLngToWorldPixel(pt.lat, pt.lng, zoom);
          const cx = wPx.x - centerPixel.x;
          const cy = wPx.y - centerPixel.y;
          const cosAngle = Math.cos(-rotation);
          const sinAngle = Math.sin(-rotation);
          const rx = cx * cosAngle - cy * sinAngle;
          const ry = cx * sinAngle + cy * cosAngle;
          return {
            x: rx + dimensions.width / 2,
            y: ry + dimensions.height / 2
          };
        });
        
        let matched = false;
        if (feat.type === 'Point') {
          const p = pts[0];
          const dist = Math.sqrt((sx - p.x)**2 + (sy - p.y)**2);
          if (dist <= 20) {
            matched = true;
          }
        } else if (feat.type === 'LineString') {
          for (let i = 0; i < pts.length - 1; i++) {
            const dist = distToSegment({ x: sx, y: sy }, pts[i], pts[i+1]);
            if (dist <= 12) {
              matched = true;
              break;
            }
          }
        } else if (feat.type === 'Polygon') {
          if (isPointInPolygon({ x: sx, y: sy }, pts)) {
            matched = true;
          } else {
            for (let i = 0; i < pts.length; i++) {
              const nextIdx = (i + 1) % pts.length;
              const dist = distToSegment({ x: sx, y: sy }, pts[i], pts[nextIdx]);
              if (dist <= 12) {
                matched = true;
                break;
              }
            }
          }
        }
        
        if (matched) {
          return {
            name: feat.name,
            description: feat.description,
            type: feat.type,
            layerName: layer.name,
            lat: feat.coordinates[0].lat,
            lng: feat.coordinates[0].lng
          };
        }
      }
    }
    return null;
  };  // Handle Drag / Pan Mouse down
  const handleMouseDown = (e: React.MouseEvent) => {
    if (Date.now() - lastTouchTime.current < 1000) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    initialCenterPixel.current = latLngToWorldPixel(center.lat, center.lng, zoom);
    mouseDownTime.current = Date.now();
  };

  // Handle Drag / Pan Mouse move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (Date.now() - lastTouchTime.current < 1000) return;
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    // Accounts for rotation in mapping translation offsets
    const cosAngle = Math.cos(rotation);
    const sinAngle = Math.sin(rotation);

    const worldDx = dx * cosAngle - dy * sinAngle;
    const worldDy = dx * sinAngle + dy * cosAngle;

    const newCenterX = initialCenterPixel.current.x - worldDx;
    const newCenterY = initialCenterPixel.current.y - worldDy;

    const latLng = worldPixelToLatLng(newCenterX, newCenterY, zoom);
    setCenter(latLng);
  };

  const handleMouseUpOrLeave = (e: React.MouseEvent) => {
    if (Date.now() - lastTouchTime.current < 1000) {
      isDragging.current = false;
      return;
    }
    if (isDragging.current && e.type === 'mouseup') {
      const duration = Date.now() - mouseDownTime.current;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (duration < 300 && distance < 6) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;

          if (measuringMode === 'measure_distance') {
            const coord = screenToLatLng(sx, sy);
            setMeasurePoints(prev => [...prev, coord]);
          } else if (measuringMode === 'measure_area') {
            const coord = screenToLatLng(sx, sy);
            setAreaPoints(prev => [...prev, coord]);
          } else {
            let foundSavedPoint: SavedPoint | null = null;
            for (const pt of savedPoints) {
              const pos = getScreenPos(pt.lat, pt.lng);
              const dist = Math.sqrt((sx - pos.x)**2 + (sy - pos.y)**2);
              if (dist <= 22) {
                foundSavedPoint = pt;
                break;
              }
            }

            if (foundSavedPoint) {
              setSelectedSavedPoint(foundSavedPoint);
              setSelectedFeature(null);
            } else {
              setSelectedSavedPoint(null);
              const matched = findFeatureAt(sx, sy);
              if (matched) {
                setSelectedFeature(matched);
              } else {
                setSelectedFeature(null);
              }
            }
          }
        }
      }
    }
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    const scale = e.deltaY < 0 ? 1 : -1;
    const newZoom = Math.min(Math.max(zoom + scale, 10), 22);
    setZoom(newZoom);
  };

  // Touch gesture support on mobile (Rotation and pinch Zoom)
  const handleTouchStart = (e: React.TouchEvent) => {
    lastTouchTime.current = Date.now();
    if (e.touches.length === 1) {
      isDragging.current = true;
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      initialCenterPixel.current = latLngToWorldPixel(center.lat, center.lng, zoom);
      touchState.current = null;
      touchStartTime.current = Date.now();
    } else if (e.touches.length === 2) {
      isDragging.current = false;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.sqrt((t1.clientX - t2.clientX) ** 2 + (t1.clientY - t2.clientY) ** 2);
      const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);

      touchState.current = {
        initialDist: dist,
        initialZoom: zoom,
        initialAngle: angle,
        initialRotation: rotation,
        initialCenterPixel: latLngToWorldPixel(center.lat, center.lng, zoom)
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    lastTouchTime.current = Date.now();
    if (e.touches.length === 1 && isDragging.current) {
      const touch = e.touches[0];
      const dx = touch.clientX - dragStart.current.x;
      const dy = touch.clientY - dragStart.current.y;

      const cosAngle = Math.cos(rotation);
      const sinAngle = Math.sin(rotation);

      const worldDx = dx * cosAngle - dy * sinAngle;
      const worldDy = dx * sinAngle + dy * cosAngle;

      const newCenterX = initialCenterPixel.current.x - worldDx;
      const newCenterY = initialCenterPixel.current.y - worldDy;

      const latLng = worldPixelToLatLng(newCenterX, newCenterY, zoom);
      setCenter(latLng);
    } else if (e.touches.length === 2 && touchState.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      
      // Calculate Pinch Zoom
      const dist = Math.sqrt((t1.clientX - t2.clientX) ** 2 + (t1.clientY - t2.clientY) ** 2);
      const scale = dist / touchState.current.initialDist;
      const zoomDiff = Math.log2(scale);
      const nextZoom = Math.min(Math.max(touchState.current.initialZoom + zoomDiff, 10), 22);
      setZoom(Math.round(nextZoom * 10) / 10);

      // Calculate Two-Finger Rotation
      const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
      const angleDiff = angle - touchState.current.initialAngle;
      setRotation(touchState.current.initialRotation - angleDiff);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    lastTouchTime.current = Date.now();
    if (isDragging.current && e.changedTouches && e.changedTouches.length === 1) {
      const duration = Date.now() - touchStartTime.current;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - dragStart.current.x;
      const dy = touch.clientY - dragStart.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (duration < 300 && distance < 8) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const sx = touch.clientX - rect.left;
          const sy = touch.clientY - rect.top;
          
          if (measuringMode === 'measure_distance') {
            const coord = screenToLatLng(sx, sy);
            setMeasurePoints(prev => [...prev, coord]);
          } else if (measuringMode === 'measure_area') {
            const coord = screenToLatLng(sx, sy);
            setAreaPoints(prev => [...prev, coord]);
          } else {
            let foundSavedPoint: SavedPoint | null = null;
            for (const pt of savedPoints) {
              const pos = getScreenPos(pt.lat, pt.lng);
              const dist = Math.sqrt((sx - pos.x)**2 + (sy - pos.y)**2);
              if (dist <= 22) {
                foundSavedPoint = pt;
                break;
              }
            }

            if (foundSavedPoint) {
              setSelectedSavedPoint(foundSavedPoint);
              setSelectedFeature(null);
            } else {
              setSelectedSavedPoint(null);
              const matched = findFeatureAt(sx, sy);
              if (matched) {
                setSelectedFeature(matched);
              } else {
                setSelectedFeature(null);
              }
            }
          }
        }
      }
    }
    isDragging.current = false;
  };

  // --- TACTICAL GIS UTILITIES ---
  const syncDMSFromLatLng = (latitude: number, longitude: number) => {
    // Latitude
    const absLat = Math.abs(latitude);
    const dLat = Math.floor(absLat);
    const mLat = Math.floor((absLat - dLat) * 60);
    const sLat = ((absLat - dLat - mLat / 60) * 3600).toFixed(2);
    const hLat = latitude >= 0 ? 'N' : 'S';

    setLatD(dLat.toString());
    setLatM(mLat.toString());
    setLatS(sLat);
    setLatH(hLat);

    // Longitude
    const absLng = Math.abs(longitude);
    const dLng = Math.floor(absLng);
    const mLng = Math.floor((absLng - dLng) * 65); // Standardize slightly or exactly 60
    const finalMLng = Math.floor((absLng - dLng) * 60);
    const sLng = ((absLng - dLng - finalMLng / 60) * 3600).toFixed(2);
    const hLng = longitude >= 0 ? 'E' : 'W';

    setLngD(dLng.toString());
    setLngM(finalMLng.toString());
    setLngS(sLng);
    setLngH(hLng);
  };

  const syncDECFromLatLng = (latitude: number, longitude: number) => {
    setDecLat(latitude.toFixed(6));
    setDecLng(longitude.toFixed(6));
  };

  const getLatLngFromDMS = (
    ld: string, lm: string, ls: string, lh: string,
    gd: string, gm: string, gs: string, gh: string
  ) => {
    const latDegrees = parseFloat(ld) || 0;
    const latMinutes = parseFloat(lm) || 0;
    const latSeconds = parseFloat(ls.replace(',', '.')) || 0;
    const latSign = lh === 'S' ? -1 : 1;
    const parsedLat = latSign * (latDegrees + latMinutes / 60 + latSeconds / 3600);

    const lngDegrees = parseFloat(gd) || 0;
    const lngMinutes = parseFloat(gm) || 0;
    const lngSeconds = parseFloat(gs.replace(',', '.')) || 0;
    const lngSign = gh === 'W' ? -1 : 1;
    const parsedLng = lngSign * (lngDegrees + lngMinutes / 60 + lngSeconds / 3600);

    return { lat: parsedLat, lng: parsedLng };
  };

  const updateCenterFromDMS = (
    ld: string, lm: string, ls: string, lh: string,
    gd: string, gm: string, gs: string, gh: string
  ) => {
    const coords = getLatLngFromDMS(ld, lm, ls, lh, gd, gm, gs, gh);
    setCenter(coords);
  };

  const handleExportKml = () => {
    if (savedPoints.length === 0) {
      showTemporaryStatus("Nenhum ponto registrado para exportar.");
      return;
    }
    
    // Generate valid KML string for download
    const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>PresidentMaps Saved Points</name>\n`;
    const kmlBody = savedPoints.map(pt => `    <Placemark>\n      <name>${pt.name}</name>\n      <description>Salvo via PresidentMaps\nLatitude: ${decimalToDMS(pt.lat, 'lat')}\nLongitude: ${decimalToDMS(pt.lng, 'lng')}</description>\n      <Point>\n        <coordinates>${pt.lng},${pt.lat},0</coordinates>\n      </Point>\n    </Placemark>\n`).join('');
    const kmlFooter = `  </Document>\n</kml>`;
    const fullKml = kmlHeader + kmlBody + kmlFooter;
    
    const blob = new Blob([fullKml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `presidentmaps_pontos_${Date.now()}.kml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showTemporaryStatus("Arquivo KML exportado com sucesso!");
  };

  const shareDistanceAsKml = (sd: SavedDistance) => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${sd.name}</name>
    <Placemark>
      <name>${sd.name}</name>
      <description>Trajeto medido via PresidentMaps\nDistância Total: ${sd.distance.toFixed(2)} km</description>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${sd.points.map(p => `${p.lng},${p.lat},0`).join(' ')}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
    
    triggerKmlShareOrDownload(kml, `trajeto_${sd.name.toLowerCase().replace(/\s+/g, '_')}.kml`, sd.name);
  };

  const shareAreaAsKml = (sa: SavedArea) => {
    let coordsStr = sa.points.map(p => `${p.lng},${p.lat},0`).join(' ');
    if (sa.points.length > 0) {
      coordsStr += ` ${sa.points[0].lng},${sa.points[0].lat},0`;
    }

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${sa.name}</name>
    <Placemark>
      <name>${sa.name}</name>
      <description>Área de terra medida via PresidentMaps\nTamanho Total: ${sa.area.toFixed(2)} há</description>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordsStr}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;

    triggerKmlShareOrDownload(kml, `area_${sa.name.toLowerCase().replace(/\s+/g, '_')}.kml`, sa.name);
  };

  const triggerKmlShareOrDownload = async (kmlContent: string, filename: string, title: string) => {
    try {
      const file = new File([kmlContent], filename, { type: 'application/vnd.google-earth.kml+xml' });
      
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: title,
          text: `Compartilhando ${title} no formato KML`
        });
        showTemporaryStatus("Compartilhado com sucesso!");
        return;
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn("navigator.share falhou, executando download fallback", err);
      } else {
        return;
      }
    }

    try {
      const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showTemporaryStatus(`Arquivo ${filename} baixado (KML)!`);
    } catch (e) {
      console.error(e);
      showTemporaryStatus("Erro ao exportar arquivo KML.");
    }
  };

  const calculateHaversineDistance = (pt1: { lat: number; lng: number }, pt2: { lat: number; lng: number }) => {
    const R = 6371; // Earth major radius in km
    const dLat = (pt2.lat - pt1.lat) * Math.PI / 180;
    const dLng = (pt2.lng - pt1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(pt1.lat * Math.PI / 180) * Math.cos(pt2.lat * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const screenToLatLng = (sx: number, sy: number) => {
    // Subtract center positioning screen translation offset
    const cx = sx - dimensions.width / 2;
    const cy = sy - dimensions.height / 2;

    // Inverse rotation formula
    const cosAngle = Math.cos(rotation);
    const sinAngle = Math.sin(rotation);
    const rx = cx * cosAngle - cy * sinAngle;
    const ry = cx * sinAngle + cy * cosAngle;

    const centerPixel = latLngToWorldPixel(center.lat, center.lng, zoom);
    const worldX = centerPixel.x + rx;
    const worldY = centerPixel.y + ry;

    return worldPixelToLatLng(worldX, worldY, zoom);
  };

  // Synchronize DMS and DEC fields with map center when dragging map in point addition mode
  useEffect(() => {
    if (measuringMode === 'add_point' && isDragging.current) {
      syncDMSFromLatLng(center.lat, center.lng);
      syncDECFromLatLng(center.lat, center.lng);
    }
  }, [center]);

  // Center map on target coordinate
  const centerOnGps = () => {
    const pos = simulatedGps ? simGpsCoords : gpsCoords;
    if (pos) {
      setCenter({ lat: pos.lat, lng: pos.lng });
      setZoom(17);
    } else {
      showTemporaryStatus("Aguardando sinal GPS...");
    }
  };

  // Temporary floating user prompts
  const showTemporaryStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  };

  // Copy center coordinates to clipboard formatted as DMS
  const copyCoordinates = () => {
    const latDms = decimalToDMS(center.lat, 'lat');
    const lngDms = decimalToDMS(center.lng, 'lng');
    const fullText = `${latDms}, ${lngDms}`;
    
    navigator.clipboard.writeText(fullText).then(() => {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    }).catch(err => {
      console.error("Incapaz de copiar", err);
    });
  };

  // Share georeferenced map
  const handleShareMap = async (map: ImportedMap) => {
    const shareText = `PresidentMaps - Mapa Georreferenciado\n\nNome: ${map.name}\nCoordenada Top-Left: ${map.topLeft.lat}, ${map.topLeft.lng}\nCoordenada Bottom-Right: ${map.bottomRight.lat}, ${map.bottomRight.lng}\n\nAbra no aplicativo para navegar georreferenciado!`;
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: `PresidentMaps - ${map.name}`,
          text: shareText
        });
        showTemporaryStatus("Opções de compartilhamento abertas!");
      } else {
        // Fallback: download as JSON backup file (.json) that can be imported to another device
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(map, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `${map.name.replace(/\s+/g, '_')}_georef.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        
        navigator.clipboard.writeText(shareText);
        showTemporaryStatus("Backup JSON baixado e texto de compartilhamento copiado para a área de transferência!");
      }
    } catch (e) {
      console.error(e);
      showTemporaryStatus("Erro ou compartilhamento cancelado.");
    }
  };

  // --- PARSE GEOPDF SPATIAL REFERENCES ---
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.json')) {
      showTemporaryStatus("Importando mapa compartilhado...");
      try {
        const text = await file.text();
        const sharedMap = JSON.parse(text);
        if (sharedMap && sharedMap.name && sharedMap.dataUrl && sharedMap.topLeft && sharedMap.bottomRight) {
          const newMap: ImportedMap = {
            id: sharedMap.name + '_' + Date.now(),
            name: sharedMap.name,
            dataUrl: sharedMap.dataUrl,
            width: sharedMap.width || 800,
            height: sharedMap.height || 600,
            topLeft: sharedMap.topLeft,
            bottomRight: sharedMap.bottomRight
          };
          await dbSaveMap(newMap);
          const maps = await dbGetMaps();
          setImportedMaps(maps);
          setActiveMapId(newMap.id);
          setCenter({
            lat: newMap.topLeft.lat + (newMap.bottomRight.lat - newMap.topLeft.lat) / 2,
            lng: newMap.topLeft.lng + (newMap.bottomRight.lng - newMap.topLeft.lng) / 2
          });
          setZoom(15);
          showTemporaryStatus(`Mapa compartilhado '${newMap.name}' importado do JSON!`);
          return;
        } else {
          showTemporaryStatus("Arquivo JSON de mapa inválido.");
          return;
        }
      } catch (err) {
        showTemporaryStatus("Erro ao descriptografar arquivo compartilhado.");
        return;
      }
    }

    showTemporaryStatus("Lendo arquivo GeoPDF...");

    try {
      // 1. Array buffer for metadata extraction
      const arrayBuffer = await file.arrayBuffer();
      const textDecoder = new TextDecoder('latin1');
      const pdfText = textDecoder.decode(arrayBuffer);

      // Search standard Geospatial PDF metadata
      // OGC standards often contain a /GPTS array or viewport bounds
      let parsedCorners = null;
      const gptsRegex = /\/GPTS\s*\[\s*([^\]]+)\s*\]/;
      const gptsMatch = pdfText.match(gptsRegex);
      const lptsRegex = /\/LPTS\s*\[\s*([^\]]+)\s*\]/;
      const lptsMatch = pdfText.match(lptsRegex);

      if (gptsMatch) {
        const coords = gptsMatch[1].trim().split(/\s+/).map(Number);
        if (coords.length >= 8) {
          // Typically lat0 lng0 lat1 lng1... representing Corners
          // Sort or match to corner bounds
          const lats = [coords[0], coords[2], coords[4], coords[6]];
          const lngs = [coords[1], coords[3], coords[5], coords[7]];
          
          let tlLat = Math.max(...lats);
          let brLat = Math.min(...lats);
          let tlLng = Math.min(...lngs);
          let brLng = Math.max(...lngs);

          // If LPTS exists, we can extrapolate geographical values representation across the entire PDF page 1 bounds
          if (lptsMatch) {
            const lptsCoords = lptsMatch[1].trim().split(/\s+/).map(Number);
            if (lptsCoords.length >= 8) {
              const us = [lptsCoords[0], lptsCoords[2], lptsCoords[4], lptsCoords[6]];
              const vs = [lptsCoords[1], lptsCoords[3], lptsCoords[5], lptsCoords[7]];
              
              const minU = Math.min(...us);
              const maxU = Math.max(...us);
              const minV = Math.min(...vs);
              const maxV = Math.max(...vs);

              const spanU = (maxU - minU) || 1;
              const spanV = (maxV - minV) || 1;

              const spanLng = brLng - tlLng;
              const spanLat = tlLat - brLat;

              tlLng = tlLng - (minU * (spanLng / spanU));
              brLng = brLng + ((1 - maxU) * (spanLng / spanU));

              if (lptsCoords[1] < lptsCoords[5]) {
                tlLat = tlLat + (minV * (spanLat / spanV));
                brLat = brLat - ((1 - maxV) * (spanLat / spanV));
              } else {
                tlLat = tlLat + ((1 - maxV) * (spanLat / spanV));
                brLat = brLat - (minV * (spanLat / spanV));
              }
            }
          }

          parsedCorners = {
            topLeft: { lat: tlLat, lng: tlLng },
            bottomRight: { lat: brLat, lng: brLng }
          };
        }
      }

      // Default calibration boundaries if no geodata found in raw dictionary metadata
      if (!parsedCorners) {
        showTemporaryStatus("Calculando referenciamento espacial...");
        // Auto-sets boundary near Rio Branco forest block
        parsedCorners = {
          topLeft: { lat: BASE_LAT + 0.015, lng: BASE_LNG - 0.015 },
          bottomRight: { lat: BASE_LAT - 0.015, lng: BASE_LNG + 0.015 }
        };
      }

      // 2. Render PDF to picture
      const pdfjsLib = await loadPdfJs();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);

      const scale = 2; // high definition scale mapping
      const viewport = page.getViewport({ scale });
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = viewport.width;
      offscreenCanvas.height = viewport.height;
      const ctx = offscreenCanvas.getContext('2d');

      if (!ctx) throw new Error("Falha ao inicializar renderizador");

      await page.render({
        canvasContext: ctx,
        viewport: viewport
      }).promise;

      const dataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.85);

      const newMap: ImportedMap = {
        id: file.name + '_' + Date.now(),
        name: file.name.replace(/\.[^/.]+$/, ""),
        dataUrl,
        width: viewport.width,
        height: viewport.height,
        topLeft: parsedCorners.topLeft,
        bottomRight: parsedCorners.bottomRight
      };

      await dbSaveMap(newMap);
      const maps = await dbGetMaps();
      setImportedMaps(maps);
      setActiveMapId(newMap.id);
      
      // Navigate center to loaded map bounds
      setCenter({
        lat: parsedCorners.topLeft.lat + (parsedCorners.bottomRight.lat - parsedCorners.topLeft.lat) / 2,
        lng: parsedCorners.topLeft.lng + (parsedCorners.bottomRight.lng - parsedCorners.topLeft.lng) / 2
      });
      setZoom(15);
      showTemporaryStatus(`Mapa Georreferenciado '${newMap.name}' importado com sucesso!`);
    } catch (err: any) {
      console.error(err);
      showTemporaryStatus(`Erro ao importar PDF: ${err.message || err}`);
    }
  };

  // --- PARSE VECTOR KML FILE ---
  const handleKmlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    showTemporaryStatus("Importando camada vetorial KML...");

    try {
      const text = await file.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      
      const placemarks = xmlDoc.querySelectorAll("Placemark");
      const features: KmlData['features'] = [];

      placemarks.forEach(pm => {
        const name = pm.querySelector("name")?.textContent || "Feição Vetorial";
        const descDesc = pm.querySelector("description")?.textContent || "";

        // Look for Point
        const ptCoordsNode = pm.querySelector("Point coordinates");
        if (ptCoordsNode) {
          const coordsStr = ptCoordsNode.textContent || "";
          const parts = coordsStr.trim().split(",");
          if (parts.length >= 2) {
            const lng = parseFloat(parts[0]);
            const lat = parseFloat(parts[1]);
            if (!isNaN(lat) && !isNaN(lng)) {
              features.push({
                type: 'Point',
                name,
                description: descDesc,
                coordinates: [{ lat, lng }]
              });
            }
          }
        }

        // Look for LineString
        const lineCoordsNode = pm.querySelector("LineString coordinates");
        if (lineCoordsNode) {
          const coordsStr = lineCoordsNode.textContent || "";
          const pointsStr = coordsStr.trim().split(/\s+/);
          const pts: Array<{ lat: number, lng: number }> = [];
          
          pointsStr.forEach(pStr => {
            const parts = pStr.split(",");
            if (parts.length >= 2) {
              const lng = parseFloat(parts[0]);
              const lat = parseFloat(parts[1]);
              if (!isNaN(lat) && !isNaN(lng)) {
                pts.push({ lat, lng });
              }
            }
          });

          if (pts.length > 0) {
            features.push({
              type: 'LineString',
              name,
              description: descDesc,
              coordinates: pts
            });
          }
        }

        // Look for Polygon
        const polyCoordsNode = pm.querySelector("Polygon outerBoundaryIs coordinates");
        if (polyCoordsNode) {
          const coordsStr = polyCoordsNode.textContent || "";
          const pointsStr = coordsStr.trim().split(/\s+/);
          const pts: Array<{ lat: number, lng: number }> = [];
          
          pointsStr.forEach(pStr => {
            const parts = pStr.split(",");
            if (parts.length >= 2) {
              const lng = parseFloat(parts[0]);
              const lat = parseFloat(parts[1]);
              if (!isNaN(lat) && !isNaN(lng)) {
                pts.push({ lat, lng });
              }
            }
          });

          if (pts.length > 0) {
            features.push({
              type: 'Polygon',
              name,
              description: descDesc,
              coordinates: pts
            });
          }
        }
      });

      if (features.length === 0) {
        throw new Error("Nenhum elemento geográfico compatível (Placemark) encontrado no arquivo KML.");
      }

      const newKml: KmlData = {
        id: file.name + '_' + Date.now(),
        name: file.name.replace(/\.[^/.]+$/, ""),
        visible: true,
        features
      };

      await dbSaveKml(newKml);
      const kmls = await dbGetKmls();
      setKmlLayers(kmls);
      showTemporaryStatus(`Camada KML '${newKml.name}' ativada com sucesso! (${features.length} feições)`);
    } catch (err: any) {
      console.error(err);
      showTemporaryStatus(`Falha no KML: ${err.message || 'Erro de leitura de arquivo'}`);
    }
  };

  const removeMap = async (id: string, name: string) => {
    await dbDeleteMap(id);
    const maps = await dbGetMaps();
    setImportedMaps(maps);
    if (activeMapId === id) {
      setActiveMapId(maps.length > 0 ? maps[0].id : null);
    }
    mapImageCache.current.delete(id);
    showTemporaryStatus(`Mapa "${name}" excluído.`);
  };

  const removeKml = async (id: string, name: string) => {
    await dbDeleteKml(id);
    const kmls = await dbGetKmls();
    setKmlLayers(kmls);
    showTemporaryStatus(`Camada vetorial "${name}" excluída.`);
  };

  const toggleKmlVisible = async (id: string) => {
    const updated = kmlLayers.map(k => {
      if (k.id === id) {
        const nextVis = !k.visible;
        dbSaveKml({ ...k, visible: nextVis });
        return { ...k, visible: nextVis };
      }
      return k;
    });
    setKmlLayers(updated);
  };

  // Convert decimal coordinates of the fixed crosshair target center point to DMS text
  const dmsLat = decimalToDMS(center.lat, 'lat');
  const dmsLng = decimalToDMS(center.lng, 'lng');

  return (
    <div className="relative h-screen w-full bg-military-900 text-military-100 font-sans overflow-hidden select-none flex flex-col">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes marquee {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-33.333%, 0, 0); }
        }
      `}} />
      
      {/* 1. LEFT SIDE FLOATING CONTROLS (VOLTAR & MENU) */}
      <div className="absolute top-4 left-4 z-40 flex flex-col gap-2.5 pointer-events-none">
        <button 
          onClick={onBack}
          className="pointer-events-auto p-2.5 bg-military-800/95 border border-military-700/80 rounded-xl hover:bg-military-700 hover:border-military-500 hover:text-military-200 transition-all flex items-center gap-2 group backdrop-blur-md shadow-lg w-[110px] justify-center"
          id="btn-back-pm"
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform text-military-300 shrink-0" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-military-200">Voltar</span>
        </button>

        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="pointer-events-auto p-2.5 bg-military-800/95 border border-military-700/80 rounded-xl hover:bg-military-700 hover:border-military-500 hover:text-military-200 transition-all flex items-center gap-2 backdrop-blur-md shadow-lg w-[110px] justify-center"
          id="btn-menu-pm"
          title="Menu de Camadas"
        >
          {isMenuOpen ? <X className="w-4 h-4 text-military-300 shrink-0" /> : <Menu className="w-4 h-4 text-military-300 shrink-0" />}
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-military-200">Menu</span>
        </button>
      </div>

      {/* 2. CORE CANVAS INTERACTION PLANE */}
      <div 
        ref={containerRef}
        className="flex-grow w-full relative touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <canvas 
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          className="absolute inset-0 cursor-grab active:cursor-grabbing w-full h-full"
          id="pm-gis-canvas"
        />

        {/* Discretized target reticle in center of viewport */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center">
          {/* Small modern dot reticle with subtle circular halo */}
          <div className="w-1.5 h-1.5 bg-blue-500/80 rounded-full shadow" />
          <div className="absolute w-6 h-6 border border-blue-500/25 rounded-full" />
          <div className="absolute h-3 w-[1px] bg-blue-500/25" />
          <div className="absolute w-3 h-[1px] bg-blue-500/25" />
        </div>

        {/* 3. TACTICAL SIDE CONTROLS (ZOOM, COMPASS, GPS PIN) */}
        <div 
          className="absolute right-4 bottom-20 flex flex-col gap-3 z-30"
          onMouseDown={e => e.stopPropagation()}
          onMouseUp={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          onTouchEnd={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <button 
            onClick={centerOnGps}
            className="p-2.5 bg-military-800/95 border border-military-700/80 rounded-xl hover:bg-military-700 hover:text-blue-300 transition-all text-blue-400 flex items-center justify-center backdrop-blur-md shadow-lg"
            title="Minha Localização do Telefone"
            id="btn-gps-pm"
          >
            <MapPin className="w-5 h-5" />
          </button>

          <button 
            onClick={() => setRotation(0)}
            className="p-2.5 bg-military-800/95 border border-military-700/80 rounded-xl hover:bg-military-700 hover:text-military-205 transition-all text-military-300 flex items-center justify-center backdrop-blur-md shadow-lg"
            title="Norte"
            id="btn-north-pm"
          >
            <Compass className="w-5 h-5 text-orange-500 transition-transform" style={{ transform: `rotate(${rotation}rad)` }} />
          </button>
        </div>

        {/* 4. DMS FIXED COORDINATE READOUT */}
        <div 
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30"
          onMouseDown={e => e.stopPropagation()}
          onMouseUp={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          onTouchEnd={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <button 
            onClick={copyCoordinates}
            className="bg-military-800/95 border border-military-700 hover:border-blue-500 hover:bg-military-700/95 px-3 py-1.5 rounded-full transition-all shadow-lg flex items-center gap-2 backdrop-blur-md whitespace-nowrap"
            id="btn-coords-readout"
            title="Clique para Copiar Coordenadas"
          >
            <span className="font-mono text-[9px] text-military-400 font-bold uppercase tracking-wider">MIRA:</span>
            <span className="font-mono text-[10px] font-bold tracking-wider text-military-100 select-all">
              {dmsLat}, {dmsLng}
            </span>
            {copiedText ? (
              <Check className="w-3 h-3 text-emerald-400 shrink-0" />
            ) : (
              <Copy className="w-3 h-3 text-military-500 shrink-0" />
            )}
          </button>
        </div>

        {/* Transient Notifications Banner */}
        {statusMessage && (
          <div 
            className="absolute top-20 left-4 right-4 z-40 bg-zinc-900/95 text-white text-[11px] font-mono border border-blue-500/50 py-2 px-3 rounded-lg shadow-2xl text-center backdrop-blur-md"
            onMouseDown={e => e.stopPropagation()}
            onMouseUp={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            {statusMessage}
          </div>
        )}

        {/* Mini Copy Clipboard toast notification */}
        {copiedText && (
          <div 
            className="absolute bottom-28 left-1/2 -translate-x-1/2 z-40 bg-blue-600 font-mono text-xs font-semibold px-4 py-1.5 rounded-full shadow-lg text-white"
            onMouseDown={e => e.stopPropagation()}
            onMouseUp={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            Coordenada copiada
          </div>
        )}

        {/* selectedSavedPoint Balloon (Floating directly on the point's screen position) */}
        {selectedSavedPoint && (() => {
          const screenPos = getScreenPos(selectedSavedPoint.lat, selectedSavedPoint.lng);
          const isOffScreen = screenPos.x < 0 || screenPos.x > dimensions.width || screenPos.y < 0 || screenPos.y > dimensions.height;
          if (isOffScreen) return null;

          return (
            <div 
              style={{ 
                left: screenPos.x, 
                top: screenPos.y,
              }}
              className="absolute pointer-events-auto z-40 -translate-x-1/2 -translate-y-[105%] flex flex-col items-center select-text"
              id="saved-point-balloon-overlay"
              onMouseDown={e => e.stopPropagation()}
              onMouseUp={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onTouchEnd={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              {/* Balloon content wrap - Zero transparency solid military theme color */}
              <div className="bg-military-900 border border-military-600 rounded-xl p-3.5 shadow-xl w-[250px] flex flex-col gap-2 relative text-military-100">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 border-b border-military-700/60 pb-1.5">
                  <div className="flex flex-col">
                    <h4 className="font-sans text-xs font-bold text-military-100 uppercase tracking-wide truncate max-w-[200px]">
                      {selectedSavedPoint.name || "Sem Nome"}
                    </h4>
                  </div>
                  <button 
                    onClick={() => setSelectedSavedPoint(null)}
                    className="p-1 rounded-md text-military-400 hover:text-military-100 hover:bg-military-800 transition-colors shrink-0"
                    title="Fechar Balão"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                {/* Body Details */}
                <div className="flex flex-col gap-2 text-[10px] font-mono select-all">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[7.5px] text-military-450 uppercase font-black tracking-wider">Graus Minutos Segundos (G.M.S)</span>
                    <div className="bg-black/60 px-2 py-1 rounded text-military-200 border border-military-800/60 text-[9px]">
                      <div>LAT: {decimalToDMS(selectedSavedPoint.lat, 'lat')}</div>
                      <div>LNG: {decimalToDMS(selectedSavedPoint.lng, 'lng')}</div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-[7.5px] text-military-450 uppercase font-black tracking-wider">Decimal</span>
                    <div className="bg-black/60 px-2 py-1 rounded text-military-205 border border-military-800/60 text-[9px]">
                      <div>LAT: {selectedSavedPoint.lat.toFixed(6)}</div>
                      <div>LNG: {selectedSavedPoint.lng.toFixed(6)}</div>
                    </div>
                  </div>
                </div>

                {/* Footer Action (Wide Copiar Button) */}
                <div className="flex gap-1.5 mt-1">
                  <button
                    onClick={() => {
                      const text = `${selectedSavedPoint.name} | GMS: ${decimalToDMS(selectedSavedPoint.lat, 'lat')} / ${decimalToDMS(selectedSavedPoint.lng, 'lng')} | DEC: ${selectedSavedPoint.lat.toFixed(6)}, ${selectedSavedPoint.lng.toFixed(6)}`;
                      navigator.clipboard.writeText(text);
                      showTemporaryStatus("Coordenadas copiadas para área de transferência!");
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded bg-blue-600 hover:bg-blue-500 text-[10px] font-mono text-white font-extrabold uppercase tracking-widest transition-all"
                  >
                    Copiar Coordenadas
                  </button>
                </div>
              </div>

              {/* Little Speech Bubble Arrow pointing down at the feature location */}
              <div className="w-3 h-3 bg-military-900 border-r border-b border-military-600 rotate-45 -translate-y-1.5 shadow" />
            </div>
          );
        })()}

        {/* 4e. MEASURING OVERLAY FLOATING STATS CONTROL CARD */}
        {(measuringMode === 'measure_distance' || measuringMode === 'measure_area') && (
          <div 
            className="absolute top-20 left-4 right-4 z-40 bg-military-900/95 border border-blue-500/50 p-3.5 rounded-xl text-white font-mono backdrop-blur-md shadow-2xl flex flex-col gap-2"
            onMouseDown={e => e.stopPropagation()}
            onMouseUp={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-military-700/60 pb-1.5">
              <span className="text-[10px] uppercase font-black tracking-wider text-blue-400">
                {measuringMode === 'measure_distance' ? 'Modo de Medição: Distância' : 'Modo de Medição: Área (ha)'}
              </span>
              <button 
                onClick={() => {
                  setMeasuringMode('none');
                  setMeasurePoints([]);
                  setAreaPoints([]);
                }}
                className="p-1 hover:bg-military-800 rounded text-military-400 hover:text-white transition-colors"
                title="Sair da Medição"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <div className="flex items-center justify-between text-xs my-0.5">
              <div className="flex flex-col">
                <span className="text-[9px] text-military-400 uppercase">Pontos Coletados</span>
                <span className="font-bold text-military-100">
                  {measuringMode === 'measure_distance' ? measurePoints.length : areaPoints.length}
                </span>
              </div>
              
              <div className="flex flex-col text-right">
                <span className="text-[9px] text-military-400 uppercase">Resultado Total</span>
                <span className="font-bold text-blue-300">
                  {measuringMode === 'measure_distance' ? (() => {
                    let total = 0;
                    for (let i = 1; i < measurePoints.length; i++) {
                      total += calculateHaversineDistance(measurePoints[i-1], measurePoints[i]);
                    }
                    return `${total.toFixed(2)} km`;
                  })() : (() => {
                    if (areaPoints.length < 3) return 'Vértices insuficientes';
                    let areaSqKm = 0;
                    const j = areaPoints.length;
                    for (let i = 0; i < j; i++) {
                      const p1 = areaPoints[i];
                      const p2 = areaPoints[(i + 1) % j];
                      const x1 = calculateHaversineDistance({ lat: center.lat, lng: p1.lng }, center) * 1000 * (p1.lng >= center.lng ? 1 : -1);
                      const y1 = calculateHaversineDistance({ lat: p1.lat, lng: center.lng }, center) * 1000 * (p1.lat >= center.lat ? 1 : -1);
                      const x2 = calculateHaversineDistance({ lat: center.lat, lng: p2.lng }, center) * 1000 * (p2.lng >= center.lng ? 1 : -1);
                      const y2 = calculateHaversineDistance({ lat: p2.lat, lng: center.lng }, center) * 1000 * (p2.lat >= center.lat ? 1 : -1);
                      areaSqKm += (x1 * y2 - x2 * y1);
                    }
                    return `${(Math.abs(areaSqKm / 2) / 10000).toFixed(2)} ha`;
                  })()}
                </span>
              </div>
            </div>

            <p className="text-[8.5px] text-military-400 text-center uppercase tracking-wide">
              Clique em múltiplos pontos na tela do mapa para desenhar o traçado tático.
            </p>

            <div className="flex gap-1.5 mt-1">
              <button
                onClick={() => {
                  if (measuringMode === 'measure_distance') {
                    if (measurePoints.length > 0) {
                      setMeasurePoints(prev => prev.slice(0, -1));
                      showTemporaryStatus("Último ponto removido.");
                    } else {
                      showTemporaryStatus("Nenhum ponto para apagar.");
                    }
                  } else {
                    if (areaPoints.length > 0) {
                      setAreaPoints(prev => prev.slice(0, -1));
                      showTemporaryStatus("Último vértice removido.");
                    } else {
                      showTemporaryStatus("Nenhum vértice para apagar.");
                    }
                  }
                }}
                className="flex-1 py-1.5 px-2 rounded bg-military-800 border border-military-700 hover:bg-military-750 text-[9px] font-bold text-military-202 hover:text-white transition-all uppercase"
                title="Apagar ponto a ponto de trás para frente"
              >
                Desfazer Ponto
              </button>
              
              <button
                onClick={() => {
                  if (measuringMode === 'measure_distance') {
                    if (measurePoints.length < 2) {
                      showTemporaryStatus("São necessários pelo menos 2 pontos para obter uma distância.");
                      return;
                    }
                    let total = 0;
                    for (let i = 1; i < measurePoints.length; i++) {
                      total += calculateHaversineDistance(measurePoints[i-1], measurePoints[i]);
                    }
                    const newId = `dist_${Date.now()}`;
                    const newDistance: SavedDistance = {
                      id: newId,
                      name: `Trajeto ${savedDistances.length + 1}`,
                      points: [...measurePoints],
                      distance: total,
                      createdAt: Date.now()
                    };
                    setSavedDistances(prev => [...prev, newDistance]);
                    setMeasurePoints([]);
                    setMeasuringMode('none');
                    showTemporaryStatus("Medição de distância salva!");
                  } else {
                    if (areaPoints.length < 3) {
                      showTemporaryStatus("São necessários pelo menos 3 vértices para obter uma área.");
                      return;
                    }
                    let areaSqKm = 0;
                    const j = areaPoints.length;
                    for (let i = 0; i < j; i++) {
                      const p1 = areaPoints[i];
                      const p2 = areaPoints[(i + 1) % j];
                      const x1 = calculateHaversineDistance({ lat: center.lat, lng: p1.lng }, center) * 1000 * (p1.lng >= center.lng ? 1 : -1);
                      const y1 = calculateHaversineDistance({ lat: p1.lat, lng: center.lng }, center) * 1000 * (p1.lat >= center.lat ? 1 : -1);
                      const x2 = calculateHaversineDistance({ lat: center.lat, lng: p2.lng }, center) * 1000 * (p2.lng >= center.lng ? 1 : -1);
                      const y2 = calculateHaversineDistance({ lat: p2.lat, lng: center.lng }, center) * 1000 * (p2.lat >= center.lat ? 1 : -1);
                      areaSqKm += (x1 * y2 - x2 * y1);
                    }
                    const totalAreaHectares = Math.abs(areaSqKm / 2) / 10000;
                    const newId = `area_${Date.now()}`;
                    const newArea: SavedArea = {
                      id: newId,
                      name: `Área ${savedAreas.length + 1}`,
                      points: [...areaPoints],
                      area: totalAreaHectares,
                      createdAt: Date.now()
                    };
                    setSavedAreas(prev => [...prev, newArea]);
                    setAreaPoints([]);
                    setMeasuringMode('none');
                    showTemporaryStatus("Medição de área salva!");
                  }
                }}
                className="flex-1 py-1.5 px-2 rounded bg-emerald-600 hover:bg-emerald-500 text-[9px] font-bold text-white transition-all uppercase"
                title="Salvar esta medição"
              >
                Salvar
              </button>

              <button
                onClick={() => {
                  setMeasuringMode('none');
                  setMeasurePoints([]);
                  setAreaPoints([]);
                }}
                className="flex-grow py-1.5 px-2 rounded bg-blue-600 hover:bg-blue-500 text-[9px] font-bold text-white transition-all uppercase"
              >
                Concluir
              </button>
            </div>
          </div>
        )}

        {/* 4f. ADICIONAR PONTO BOTTOM COORD PANEL */}
        {measuringMode === 'add_point' && (
          <div 
            className="absolute left-4 right-4 bottom-4 z-40 bg-military-900/98 border border-military-700 p-4 rounded-2xl text-white font-sans backdrop-blur-md shadow-2xl flex flex-col gap-3"
            onMouseDown={e => e.stopPropagation()}
            onMouseUp={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            
            {/* Header section with instructions according to Screenshot 2 */}
            <div className="flex items-center justify-between border-b border-military-800 pb-2">
              <div className="flex items-center gap-2">
                <Navigation className="w-3.5 h-3.5 text-blue-400 rotate-45 shrink-0" />
                <span className="text-[9.5px] font-bold tracking-wider uppercase text-military-100">
                  {editingPointId ? 'EDITAR MARCADOR EXISTENTE' : 'ARRASTE O MAPA OU MANIPULE AS COORDENADAS'}
                </span>
              </div>
              <button 
                onClick={() => {
                  setMeasuringMode('none');
                  setEditingPointId(null);
                  setPointName('');
                }}
                className="p-1 rounded-lg bg-military-850 hover:bg-military-800 border border-military-750 text-military-400 hover:text-white transition-colors"
                title="Fechar Painel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Row 1: Name entry field & action buttons configured perfectly */}
            <div className="flex items-center gap-2">
              <div className="relative flex-grow">
                <input
                  type="text"
                  placeholder="Nome do Ponto"
                  value={pointName}
                  onChange={(e) => setPointName(e.target.value)}
                  className="w-full pl-3 pr-10 py-2 rounded-xl bg-military-950 border border-military-800 hover:border-military-700 focus:border-blue-500 text-xs font-mono placeholder-military-450 text-military-100 uppercase tracking-wide focus:outline-none transition-all"
                />
                {pointName && (
                  <button
                    onClick={() => setPointName('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-military-800/80 hover:bg-military-700 flex items-center justify-center text-military-400 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Emerand Save/Check button mimicking Screenshot 2 */}
              <button
                onClick={() => {
                  const finalName = pointName.trim() || `PONTO ${savedPoints.length + 1}`;
                  
                  // Compute target latitude and longitude based on the format currently selected
                  let savedLat = center.lat;
                  let savedLng = center.lng;

                  if (pointFormat === 'DMS') {
                    const parsed = getLatLngFromDMS(latD, latM, latS, latH, lngD, lngM, lngS, lngH);
                    savedLat = parsed.lat;
                    savedLng = parsed.lng;
                  }

                  if (editingPointId) {
                    // Update point
                    setSavedPoints(prev => prev.map(p => p.id === editingPointId ? {
                      ...p,
                      name: finalName,
                      lat: savedLat,
                      lng: savedLng
                    } : p));
                    showTemporaryStatus(`Ponto tático atualizado: ${finalName}`);
                    setEditingPointId(null);
                  } else {
                    // Add new point
                    const newPt: SavedPoint = {
                      id: 'point_' + Date.now(),
                      name: finalName,
                      lat: savedLat,
                      lng: savedLng,
                      createdAt: Date.now()
                    };
                    setSavedPoints(prev => [newPt, ...prev]);
                    showTemporaryStatus(`Marcador salvo com sucesso: ${finalName}`);
                  }

                  setPointName('');
                  setMeasuringMode('none');
                }}
                className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-lg shadow-emerald-950/20 shrink-0"
                title="Salvar Ponto Tático"
              >
                <Save className="w-5 h-5" />
              </button>
            </div>

            {/* Row 2: Tabs for input format selectors */}
            <div className="grid grid-cols-2 bg-military-950 border border-military-850 rounded-xl p-0.5 text-center font-mono text-[9px] font-black uppercase">
              <button
                onClick={() => setPointFormat('DMS')}
                className={`py-1 rounded-lg transition-all ${pointFormat === 'DMS' ? 'bg-military-800 border border-military-700 text-blue-400 font-extrabold' : 'text-military-400 hover:text-military-205'}`}
              >
                G.M.S
              </button>
              <button
                onClick={() => setPointFormat('DEC')}
                className={`py-1 rounded-lg transition-all ${pointFormat === 'DEC' ? 'bg-military-800 border border-military-700 text-blue-400 font-extrabold' : 'text-military-400 hover:text-military-205'}`}
              >
                DECIMAL
              </button>
            </div>

            {/* Row 3: Configurable details coordinate segments */}
            {pointFormat === 'DMS' ? (
              <div id="dms-field-grid" className="flex flex-col gap-2 font-mono text-[10px]">
                {/* Latitude Row */}
                <div className="flex gap-2 items-center">
                  <span className="w-10 text-military-400 font-black tracking-wider uppercase text-[8px]">LAT:</span>
                  <div className="grid grid-cols-4 gap-1.5 flex-grow">
                    <div className="flex flex-col items-center">
                      <input 
                        type="text" 
                        value={latD} 
                        onChange={(e) => {
                          setLatD(e.target.value);
                          updateCenterFromDMS(e.target.value, latM, latS, latH, lngD, lngM, lngS, lngH);
                        }}
                        className="w-full bg-military-950 border border-military-850 text-center rounded p-1 text-military-100 focus:outline-none" 
                      />
                      <span className="text-[7px] text-military-500 uppercase mt-0.5">Graus</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <input 
                        type="text" 
                        value={latM} 
                        onChange={(e) => {
                          setLatM(e.target.value);
                          updateCenterFromDMS(latD, e.target.value, latS, latH, lngD, lngM, lngS, lngH);
                        }}
                        className="w-full bg-military-950 border border-military-850 text-center rounded p-1 text-military-100 focus:outline-none" 
                      />
                      <span className="text-[7px] text-military-500 uppercase mt-0.5">Minutos</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <input 
                        type="text" 
                        value={latS} 
                        onChange={(e) => {
                          setLatS(e.target.value);
                          updateCenterFromDMS(latD, latM, e.target.value, latH, lngD, lngM, lngS, lngH);
                        }}
                        className="w-full bg-military-950 border border-military-850 text-center rounded p-1 text-military-100 focus:outline-none" 
                      />
                      <span className="text-[7px] text-military-500 uppercase mt-0.5">Segundos</span>
                    </div>
                    <button
                      onClick={() => {
                        const nextH = latH === 'S' ? 'N' : 'S';
                        setLatH(nextH);
                        updateCenterFromDMS(latD, latM, latS, nextH, lngD, lngM, lngS, lngH);
                      }}
                      className="w-full bg-military-950 border border-blue-500/40 text-center rounded p-1 text-blue-400 font-extrabold hover:bg-military-850 transition-colors uppercase"
                    >
                      {latH}
                    </button>
                  </div>
                </div>

                {/* Longitude Row */}
                <div className="flex gap-2 items-center">
                  <span className="w-10 text-military-400 font-black tracking-wider uppercase text-[8px]">LONG:</span>
                  <div className="grid grid-cols-4 gap-1.5 flex-grow">
                    <div className="flex flex-col items-center">
                      <input 
                        type="text" 
                        value={lngD} 
                        onChange={(e) => {
                          setLngD(e.target.value);
                          updateCenterFromDMS(latD, latM, latS, latH, e.target.value, lngM, lngS, lngH);
                        }}
                        className="w-full bg-military-950 border border-military-850 text-center rounded p-1 text-military-100 focus:outline-none" 
                      />
                      <span className="text-[7px] text-military-500 uppercase mt-0.5">Graus</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <input 
                        type="text" 
                        value={lngM} 
                        onChange={(e) => {
                          setLngM(e.target.value);
                          updateCenterFromDMS(latD, latM, latS, latH, lngD, e.target.value, lngS, lngH);
                        }}
                        className="w-full bg-military-950 border border-military-850 text-center rounded p-1 text-military-100 focus:outline-none" 
                      />
                      <span className="text-[7px] text-military-500 uppercase mt-0.5">Minutos</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <input 
                        type="text" 
                        value={lngS} 
                        onChange={(e) => {
                          setLngS(e.target.value);
                          updateCenterFromDMS(latD, latM, latS, latH, lngD, lngM, e.target.value, lngH);
                        }}
                        className="w-full bg-military-950 border border-military-850 text-center rounded p-1 text-military-100 focus:outline-none" 
                      />
                      <span className="text-[7px] text-military-500 uppercase mt-0.5">Segundos</span>
                    </div>
                    <button
                      onClick={() => {
                        const nextH = lngH === 'W' ? 'E' : 'W';
                        setLngH(nextH);
                        updateCenterFromDMS(latD, latM, latS, latH, lngD, lngM, lngS, nextH);
                      }}
                      className="w-full bg-military-950 border border-blue-500/40 text-center rounded p-1 text-blue-400 font-extrabold hover:bg-military-850 transition-colors uppercase"
                    >
                      {lngH}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 font-mono text-[10px]">
                {/* Decimal Latitude Input Row */}
                <div className="flex gap-2 items-center">
                  <span className="w-14 text-military-400 font-black tracking-wider uppercase text-[8px]">LAT DEC:</span>
                  <input
                    type="text"
                    value={decLat}
                    onChange={(e) => {
                      setDecLat(e.target.value);
                      const parsed = parseFloat(e.target.value);
                      if (!isNaN(parsed)) {
                        setCenter(prev => ({ ...prev, lat: parsed }));
                      }
                    }}
                    className="flex-grow bg-military-950 border border-military-850 p-1.5 rounded text-military-100 font-mono text-center focus:outline-none focus:border-blue-500/60"
                    placeholder="Ex: -9.043120"
                  />
                </div>
                {/* Decimal Longitude Input Row */}
                <div className="flex gap-2 items-center">
                  <span className="w-14 text-military-400 font-black tracking-wider uppercase text-[8px]">LNG DEC:</span>
                  <input
                    type="text"
                    value={decLng}
                    onChange={(e) => {
                      setDecLng(e.target.value);
                      const parsed = parseFloat(e.target.value);
                      if (!isNaN(parsed)) {
                        setCenter(prev => ({ ...prev, lng: parsed }));
                      }
                    }}
                    className="flex-grow bg-military-950 border border-military-850 p-1.5 rounded text-military-100 font-mono text-center focus:outline-none focus:border-blue-500/60"
                    placeholder="Ex: -68.655810"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. TACTICAL GIS MULTI-STORAGE MENU DRAWER */}
      <div className={`absolute top-0 right-0 h-full w-[85%] max-w-sm bg-military-900 border-l border-military-700 z-50 transform transition-transform duration-300 ease-out flex flex-col shadow-2xl ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        {/* Drawer Header */}
        <div className="p-4 border-b border-military-700 flex items-center justify-between bg-military-800">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-military-300" />
            <h1 className="text-sm font-black tracking-wider uppercase text-military-100 font-mono">PRESIDENTMAPS</h1>
          </div>
          <button 
            onClick={() => setIsMenuOpen(false)}
            className="p-1 px-2.5 rounded-lg border border-military-700 bg-military-900/40 hover:bg-military-800 transition-colors"
          >
            <X className="w-4 h-4 text-military-300" />
          </button>
        </div>

        {/* Sliding Tabs Selection Matrix */}
        <div className="grid grid-cols-4 border-b border-military-700 bg-military-800 text-center font-mono">
          <button
            onClick={() => setActiveTab('camadas')}
            className={`py-3 text-[10px] font-extrabold uppercase transition-all flex flex-col items-center gap-1.5 ${activeTab === 'camadas' ? 'bg-military-900 text-blue-400 border-b-2 border-blue-500' : 'text-military-400 hover:text-military-200'}`}
          >
            <Layers className="w-4 h-4" />
            Camadas
          </button>
          
          <button
            onClick={() => {
              setActiveTab('ferramentas');
              showTemporaryStatus("Painel 'Ferramentas' reservado para futura atualização militar.");
            }}
            className={`py-3 text-[10px] font-extrabold uppercase transition-all flex flex-col items-center gap-1.5 ${activeTab === 'ferramentas' ? 'bg-military-900 text-blue-400 border-b-2 border-blue-500' : 'text-military-400 hover:text-military-200'}`}
          >
            <Wrench className="w-4 h-4 animate-pulse" />
            Recursos
          </button>
          
          <button
            onClick={() => {
              setActiveTab('pontos');
              showTemporaryStatus("Painel 'Pontos de Combate' reservado para futura atualização.");
            }}
            className={`py-3 text-[10px] font-extrabold uppercase transition-all flex flex-col items-center gap-1.5 ${activeTab === 'pontos' ? 'bg-military-900 text-blue-400 border-b-2 border-blue-500' : 'text-military-400 hover:text-military-400'}`}
          >
            <MapPin className="w-4 h-4" />
            Pontos
          </button>
          
          <button
            onClick={() => {
              setActiveTab('trajetos');
              showTemporaryStatus("Painel 'Meus Trajetos' reservado para futura atualização militar.");
            }}
            className={`py-3 text-[10px] font-extrabold uppercase transition-all flex flex-col items-center gap-1.5 ${activeTab === 'trajetos' ? 'bg-military-900 text-blue-400 border-b-2 border-blue-500' : 'text-military-400 hover:text-military-200'}`}
          >
            <Route className="w-4 h-4" />
            Rotas
          </button>
        </div>

        {/* Sliding Tabs Viewport */}
        <div className="flex-grow overflow-y-auto p-4 space-y-6">
          {activeTab === 'camadas' && (
            <div className="space-y-4">
              
              {/* SECTION A: MAPAS DA INTERNET */}
              <div className="border border-military-700/60 rounded-xl overflow-hidden bg-military-850/30">
                <button
                  onClick={() => setIsInternetBaseOpen(!isInternetBaseOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-military-800/80 hover:bg-military-850 transition-colors border-b border-military-700/60 font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                    <span className="text-xs uppercase font-extrabold text-military-100 tracking-wider">Mapas da Internet</span>
                  </div>
                  {isInternetBaseOpen ? <ChevronUp className="w-4 h-4 text-military-400" /> : <ChevronDown className="w-4 h-4 text-military-400" />}
                </button>
                
                {isInternetBaseOpen && (
                  <div className="p-3 space-y-1">
                    {[
                      { id: 'osm', name: 'OpenStreetMap Base (Online)' },
                      { id: 'satellite', name: 'Google Satélite (Online)' },
                      { id: 'hybrid', name: 'Google Híbrido (Online)' },
                      { id: 'none', name: 'Apenas Grade (Offline)' }
                    ].map(b => (
                      <button
                        key={b.id}
                        onClick={() => setBaseMap(b.id as BaseMapType)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono font-semibold transition-all border ${baseMap === b.id ? 'bg-blue-600/30 border-blue-500 text-blue-200' : 'bg-transparent border-transparent text-military-300 hover:bg-military-800/60'}`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION B: GEOPDFS/PDF IMPORTADOS */}
              <div className="border border-military-700/60 rounded-xl overflow-hidden bg-military-850/30">
                <button
                  onClick={() => setIsGeoMapsOpen(!isGeoMapsOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-military-800/80 hover:bg-military-850 transition-colors border-b border-military-700/60 font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
                    <span className="text-xs uppercase font-extrabold text-military-100 tracking-wider">Mapas Georreferenciados</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[8px] text-military-300 bg-military-900 border border-military-700 px-1 py-0.5 rounded tracking-widest font-black uppercase">GeoPDF/JSON</span>
                    {isGeoMapsOpen ? <ChevronUp className="w-4 h-4 text-military-400" /> : <ChevronDown className="w-4 h-4 text-military-400" />}
                  </div>
                </button>

                {isGeoMapsOpen && (
                  <div className="p-3 space-y-3">
                    {/* Upload Trigger Input */}
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center justify-center gap-2 border border-dashed border-military-650 hover:border-blue-500 hover:bg-military-800/30 transition-all p-3 rounded-lg cursor-pointer text-military-205">
                        <Upload className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider">Inserir Mapa (PDF / JSON)</span>
                        <input 
                          type="file" 
                          accept=".pdf,application/pdf,.json" 
                          onChange={handlePdfUpload}
                          className="hidden" 
                        />
                      </label>
                      <span className="font-mono text-[8.5px] text-military-400 text-center uppercase tracking-wider">
                        Insira arquivos GeoPDF oficiais ou mapas compartilhados (.json)
                      </span>
                    </div>

                    {/* List of imported GeoPDF maps */}
                    <div className="space-y-3">
                      {importedMaps.length === 0 ? (
                        <div className="text-center p-3 border border-military-800/50 rounded-lg bg-military-800/10">
                          <p className="font-mono text-[9px] text-military-400 tracking-wider">NENHUM MAPA GEO ANEXADO</p>
                        </div>
                      ) : (
                        importedMaps.map(m => (
                          <div 
                            key={m.id}
                            className={`flex flex-col border p-3 rounded-xl transition-all ${activeMapId === m.id ? 'border-blue-500 bg-blue-900/15 shadow-md shadow-blue-500/5' : 'border-military-750 bg-military-850/60 hover:border-military-600'}`}
                          >
                            {/* Nome do mapa: Letreiro Digital contínuo */}
                            <div className="bg-black/40 border border-military-800 rounded px-2.5 py-1.5 overflow-hidden whitespace-nowrap relative mb-2.5">
                              <div className="inline-block animate-[marquee_18s_linear_infinite] hover:[animation-play-state:paused] font-mono text-[11px] font-black uppercase tracking-widest text-emerald-400 pr-12">
                                {m.name} &nbsp;&bull;&nbsp; {m.name} &nbsp;&bull;&nbsp; {m.name}
                              </div>
                            </div>
                            
                            {/* Três botões de ações bem separados e expressivos */}
                            <div className="grid grid-cols-3 gap-2 border-t border-military-750/30 pt-3 mt-1">
                              {/* Botão 1: Exibir / Ocultar */}
                              <button
                                onClick={() => {
                                  if (activeMapId === m.id) {
                                    setActiveMapId(null);
                                  } else {
                                    setActiveMapId(m.id);
                                    setCenter({
                                      lat: m.topLeft.lat + (m.bottomRight.lat - m.topLeft.lat)/2,
                                      lng: m.topLeft.lng + (m.bottomRight.lng - m.topLeft.lng)/2
                                    });
                                  }
                                }}
                                className={`flex flex-col items-center justify-center gap-1.5 py-2 px-1 rounded-lg border transition-all ${activeMapId === m.id ? 'bg-blue-600/20 border-blue-500 text-blue-200 shadow-sm shadow-blue-500/10' : 'bg-military-800/40 border-military-700/60 text-military-300 hover:bg-military-800'}`}
                                id={`btn-view-${m.id}`}
                              >
                                {activeMapId === m.id ? (
                                  <>
                                    <Eye className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider">Ocultar</span>
                                  </>
                                ) : (
                                  <>
                                    <EyeOff className="w-3.5 h-3.5 text-military-400 shrink-0" />
                                    <span className="font-mono text-[9px] font-bold uppercase tracking-wider font-semibold">Exibir</span>
                                  </>
                                )}
                              </button>

                              {/* Botão 2: Compartilhar */}
                              <button
                                onClick={() => handleShareMap(m)}
                                className="flex flex-col items-center justify-center gap-1.5 py-2 px-1 rounded-lg border bg-military-800/40 border-military-700/60 text-military-300 hover:bg-military-800 hover:border-emerald-500/40 hover:text-emerald-300 transition-all"
                                title="Compartilhar Mapa"
                                id={`btn-share-${m.id}`}
                              >
                                <Share2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span className="font-mono text-[9px] font-bold uppercase tracking-wider font-semibold">Enviar</span>
                              </button>

                              {/* Botão 3: Excluir */}
                              <button
                                onClick={() => removeMap(m.id, m.name)}
                                className="flex flex-col items-center justify-center gap-1.5 py-2 px-1 rounded-lg border bg-military-800/40 border-military-700/60 text-military-300 hover:bg-red-950/30 hover:border-red-500/40 hover:text-red-300 transition-all"
                                title="Excluir Permanentemente"
                                id={`btn-delete-${m.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                <span className="font-mono text-[9px] font-bold uppercase tracking-wider font-semibold">Excluir</span>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION C: CAMADAS VETORIAIS */}
              <div className="border border-military-700/60 rounded-xl overflow-hidden bg-military-850/30">
                <button
                  onClick={() => setIsVectorLayersOpen(!isVectorLayersOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-military-800/80 hover:bg-military-850 transition-colors border-b border-military-700/60 font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-xs uppercase font-extrabold text-military-100 tracking-wider">Camadas Vetoriais</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[8px] text-military-300 bg-military-900 border border-military-700 px-1 py-0.5 rounded tracking-widest font-black uppercase">KML</span>
                    {isVectorLayersOpen ? <ChevronUp className="w-4 h-4 text-military-400" /> : <ChevronDown className="w-4 h-4 text-military-400" />}
                  </div>
                </button>

                {isVectorLayersOpen && (
                  <div className="p-3 space-y-3">
                    {/* Upload Tracker vector inputs */}
                    <label className="flex items-center justify-center gap-2 border border-dashed border-military-650 hover:border-blue-500 hover:bg-military-800/30 transition-all p-3 rounded-lg cursor-pointer text-military-205">
                      <Upload className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-mono text-[11px] font-bold uppercase tracking-wider">Inserir Camada KML</span>
                      <input 
                        type="file" 
                        accept=".kml" 
                        onChange={handleKmlUpload}
                        className="hidden" 
                      />
                    </label>

                    {/* Vector Listings */}
                    <div className="space-y-3">
                      {kmlLayers.length === 0 ? (
                        <div className="text-center p-3 border border-military-800/50 rounded-lg bg-military-800/10">
                          <p className="font-mono text-[9px] text-military-400 tracking-wider">NENHUMA CAMADA VETORIAL ANEXADA</p>
                        </div>
                      ) : (
                        kmlLayers.map(k => (
                          <div 
                            key={k.id}
                            className="flex flex-col border border-military-750 bg-military-850/60 hover:border-military-600 p-3 rounded-xl transition-all"
                          >
                            {/* Nome com letreiro eletrônico */}
                            <div className="bg-black/40 border border-military-800 rounded px-2.5 py-1.5 overflow-hidden whitespace-nowrap relative mb-2.5">
                              <div className="inline-block animate-[marquee_18s_linear_infinite] hover:[animation-play-state:paused] font-mono text-[11px] font-black uppercase tracking-widest text-blue-400 pr-12">
                                {k.name} &nbsp;&bull;&nbsp; {k.name} &nbsp;&bull;&nbsp; {k.name}
                              </div>
                            </div>

                            <div className="flex items-center justify-between border-t border-military-750/30 pt-2.5">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-mono text-[8px] text-military-400 uppercase tracking-wider font-bold">INFO CAMADA</span>
                                <span className="font-mono text-[9.5px] text-military-200">
                                  {k.features.length} feições gravadas
                                </span>
                              </div>

                              <div className="flex items-center gap-1 bg-military-900/60 p-1 border border-military-700/80 rounded-lg scale-95 origin-right shrink-0">
                                <button
                                  onClick={() => toggleKmlVisible(k.id)}
                                  className={`p-1.5 rounded transition-all ${k.visible ? 'bg-blue-600/20 text-blue-400' : 'text-military-400 hover:text-military-100 hover:bg-military-700'}`}
                                  title="Mostrar/Ocultar"
                                >
                                  {k.visible ? (
                                    <Eye className="w-3.5 h-3.5 shrink-0" />
                                  ) : (
                                    <EyeOff className="w-3.5 h-3.5 shrink-0" />
                                  )}
                                </button>
                                <button
                                  onClick={() => removeKml(k.id, k.name)}
                                  className="p-1.5 rounded text-military-400 hover:text-red-400 hover:bg-red-950/20 transition-all"
                                  title="Excluir Camada"
                                >
                                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {activeTab === 'ferramentas' && (
            <div className="space-y-4">
              <div className="p-1 border-b border-military-800 pb-2">
                <span className="font-mono text-[9px] text-military-400 uppercase tracking-widest font-black">RECURSOS TÁTICOS</span>
              </div>

              {/* Centered Large "ADICIONAR PONTO" Button as configured in Screenshot 1 */}
              <button
                onClick={() => {
                  setMeasuringMode('add_point');
                  // Prefill coordinates input fields from center
                  syncDMSFromLatLng(center.lat, center.lng);
                  setIsMenuOpen(false); // Close drawer to allow manual pin selection
                  showTemporaryStatus("Modo de Adição de Pontos Ativo. Mova o mapa ou altere as coordenadas.");
                }}
                className="w-full flex flex-col items-center justify-center p-6 bg-military-850/60 border border-military-750 hover:border-blue-500 rounded-xl hover:bg-military-800/40 transition-all text-center gap-2.5 group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-blue-500/10 group-hover:bg-blue-500/20 flex items-center justify-center border border-blue-500/20 transition-all">
                  <MapPin className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                </div>
                <div className="flex flex-col">
                  <span className="font-sans text-xs uppercase font-extrabold text-military-100 tracking-wider">ADICIONAR PONTO</span>
                  <span className="font-mono text-[8px] text-military-450 uppercase mt-0.5">Captura com retículo central</span>
                </div>
              </button>

              <div className="p-1 border-b border-military-800 pt-2 pb-1.5">
                <span className="font-mono text-[9px] text-military-400 uppercase tracking-widest font-black">MEDIÇÕES EM CAMPO</span>
              </div>

              {/* Collapsible Dropdowns for Distance & Area instead of simplified grid buttons */}
              <div className="space-y-3">
                
                {/* 1. DISTÂNCIA DROPDOWN */}
                <div className="border border-military-700/60 rounded-xl overflow-hidden bg-military-850/30">
                  <button
                    onClick={() => {
                      setIsDistanceDropdownOpen(!isDistanceDropdownOpen);
                      setIsAreaDropdownOpen(false); // Accordion behavior is clean
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-military-800/80 hover:bg-military-850 transition-colors border-b border-military-700/60 font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-xs uppercase font-extrabold text-military-100 tracking-wider">Medir Distância</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[8px] text-military-300 bg-military-900 border border-military-700 px-1.5 py-0.5 rounded tracking-widest font-black uppercase">
                        {savedDistances.length} Salvas
                      </span>
                      {isDistanceDropdownOpen ? <ChevronUp className="w-4 h-4 text-military-400" /> : <ChevronDown className="w-4 h-4 text-military-400" />}
                    </div>
                  </button>

                  {isDistanceDropdownOpen && (
                    <div className="p-3 space-y-3">
                      {/* Medir Nova Distância Trigger */}
                      <button
                        onClick={() => {
                          setMeasuringMode('measure_distance');
                          setMeasurePoints([]);
                          setIsMenuOpen(false); // Close slider to let user click on canvas
                          showTemporaryStatus("Modo Medição de Distância Ativo. Clique no mapa para adicionar pontos.");
                        }}
                        className="w-full flex items-center justify-center gap-2 border border-dashed border-blue-500 bg-blue-900/10 hover:bg-blue-900/20 hover:border-blue-400 transition-all p-3 rounded-lg text-blue-200 cursor-pointer"
                      >
                        <Plus className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider">Medir Nova Distância</span>
                      </button>

                      {/* List of saved distances */}
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-0.5 text-left">
                        {savedDistances.length === 0 ? (
                          <div className="text-center p-2.5 border border-military-800/50 rounded-lg bg-military-800/10">
                            <p className="font-mono text-[8.5px] text-military-400 tracking-wider uppercase">NENHUMA DISTÂNCIA GRAVADA</p>
                          </div>
                        ) : (
                          savedDistances.map(sd => (
                            <div 
                              key={sd.id}
                              className={`flex flex-col border p-2.5 rounded-xl transition-all ${expandedDistanceMenuId === sd.id ? 'border-military-600 bg-military-800/40' : 'border-military-750 bg-military-850/60 hover:border-military-600'}`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 truncate max-w-[70%]">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-lg shadow-emerald-500/30 animate-pulse" />
                                  <div className="flex flex-col truncate">
                                    <span className="font-sans text-[11px] uppercase font-black text-military-100 truncate">
                                      {sd.name}
                                    </span>
                                    <span className="font-mono text-[8.5px] text-military-450 mt-0.5">
                                      {sd.distance.toFixed(2)} km &bull; {sd.points.length} pts
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    onClick={() => {
                                      if (sd.points.length > 0) {
                                        setCenter({ lat: sd.points[0].lat, lng: sd.points[0].lng });
                                        setZoom(15);
                                        setIsMenuOpen(false);
                                        showTemporaryStatus(`Centrado em: ${sd.name}`);
                                      }
                                    }}
                                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white font-mono text-[9px] font-black rounded-lg uppercase tracking-wider transition-all"
                                  >
                                    Ir
                                  </button>
                                  <button
                                    onClick={() => setExpandedDistanceMenuId(expandedDistanceMenuId === sd.id ? null : sd.id)}
                                    className={`p-1 rounded-lg border border-transparent transition-all ${expandedDistanceMenuId === sd.id ? 'bg-military-800 text-military-100 border-military-600' : 'text-military-400 hover:text-military-202 hover:bg-military-850'}`}
                                  >
                                    <Menu className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* expanded action links in line with Hamburger menu */}
                              {expandedDistanceMenuId === sd.id && (
                                <div className="grid grid-cols-4 gap-1.5 border-t border-military-800/80 pt-2.5 mt-2.5 animate-fadeIn">
                                  {editingDistanceId === sd.id ? (
                                    <div className="col-span-4 flex flex-col gap-1.5 p-1 bg-military-900 rounded-lg">
                                      <span className="font-mono text-[7px] text-military-400 uppercase font-black tracking-wider px-1">Renomear Trajeto:</span>
                                      <div className="flex gap-1.5">
                                        <input
                                          type="text"
                                          value={editItemName}
                                          onChange={e => setEditItemName(e.target.value)}
                                          className="flex-grow bg-black/60 border border-military-800 px-2 py-1 text-[10px] rounded text-emerald-300 font-mono focus:outline-none focus:border-emerald-500"
                                          placeholder="Ex. Divisória Norte"
                                        />
                                        <button
                                          onClick={() => {
                                            if (editItemName.trim()) {
                                              setSavedDistances(prev => prev.map(item => item.id === sd.id ? { ...item, name: editItemName.trim() } : item));
                                              setEditingDistanceId(null);
                                              showTemporaryStatus("Nome do trajeto atualizado!");
                                            }
                                          }}
                                          className="bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-[8px] font-bold text-white uppercase rounded font-mono"
                                        >
                                          OK
                                        </button>
                                        <button
                                          onClick={() => setEditingDistanceId(null)}
                                          className="bg-military-800 border border-military-700 px-2 py-1 text-[8px] font-bold text-military-300 uppercase rounded font-mono"
                                        >
                                          Sair
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => shareDistanceAsKml(sd)}
                                        className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-military-800/30 hover:bg-military-800 border border-military-750 hover:border-military-650 transition-all text-military-300 hover:text-white"
                                        title="Compartilhar como KML"
                                      >
                                        <Share2 className="w-3.5 h-3.5 text-blue-400 mb-0.5" />
                                        <span className="font-mono text-[7.5px] uppercase tracking-wide">Partilhar</span>
                                      </button>

                                      <button
                                        onClick={() => {
                                          setEditItemName(sd.name);
                                          setEditingDistanceId(sd.id);
                                        }}
                                        className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-military-800/30 hover:bg-military-800 border border-military-750 hover:border-military-650 transition-all text-military-300 hover:text-white"
                                        title="Editar Nome"
                                      >
                                        <Pencil className="w-3.5 h-3.5 text-blue-400 mb-0.5" />
                                        <span className="font-mono text-[7.5px] uppercase tracking-wide">Editar</span>
                                      </button>

                                      <button
                                        onClick={() => {
                                          const text = `${sd.name} | Total: ${sd.distance.toFixed(2)} km | Coordenadas: ${sd.points.map((p, idx) => `P${idx+1}: [${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}]`).join(' -> ')}`;
                                          navigator.clipboard.writeText(text);
                                          showTemporaryStatus("Coordenadas do trajeto copiadas!");
                                        }}
                                        className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-military-800/30 hover:bg-military-800 border border-military-750 hover:border-military-650 transition-all text-military-300 hover:text-white"
                                        title="Copiar Coordenadas"
                                      >
                                        <Copy className="w-3.5 h-3.5 text-blue-400 mb-0.5" />
                                        <span className="font-mono text-[7.5px] uppercase tracking-wide">Copiar</span>
                                      </button>

                                      <button
                                        onClick={() => {
                                          setSavedDistances(prev => prev.filter(x => x.id !== sd.id));
                                          showTemporaryStatus("Trajeto removido permanentemente.");
                                        }}
                                        className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-military-800/30 hover:bg-military-800 border border-military-750 hover:border-military-650 transition-all text-military-300 hover:text-white animate-fadeIn"
                                        title="Excluir"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-red-400 mb-0.5" />
                                        <span className="font-mono text-[7.5px] uppercase tracking-wide">Excluir</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. ÁREA (HA) DROPDOWN */}
                <div className="border border-military-700/60 rounded-xl overflow-hidden bg-military-850/30">
                  <button
                    onClick={() => {
                      setIsAreaDropdownOpen(!isAreaDropdownOpen);
                      setIsDistanceDropdownOpen(false); // Accordion behavior is clean
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 bg-military-800/80 hover:bg-military-850 transition-colors border-b border-military-700/60 font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse" />
                      <span className="text-xs uppercase font-extrabold text-military-100 tracking-wider">Calcular Área (há)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[8px] text-military-300 bg-military-900 border border-military-700 px-1.5 py-0.5 rounded tracking-widest font-black uppercase">
                        {savedAreas.length} Salvas
                      </span>
                      {isAreaDropdownOpen ? <ChevronUp className="w-4 h-4 text-military-400" /> : <ChevronDown className="w-4 h-4 text-military-400" />}
                    </div>
                  </button>

                  {isAreaDropdownOpen && (
                    <div className="p-3 space-y-3">
                      {/* Calcular Nova Área Trigger */}
                      <button
                        onClick={() => {
                          setMeasuringMode('measure_area');
                          setAreaPoints([]);
                          setIsMenuOpen(false); // Close slider to let user click on canvas
                          showTemporaryStatus("Modo Medição de Área Ativo. Clique em 3 ou mais pontos no mapa.");
                        }}
                        className="w-full flex items-center justify-center gap-2 border border-dashed border-yellow-500 bg-yellow-950/10 hover:bg-yellow-950/20 hover:border-yellow-400 transition-all p-3 rounded-lg text-yellow-200 cursor-pointer"
                      >
                        <Plus className="w-4 h-4 text-yellow-400 shrink-0" />
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider">Calcular Nova Área</span>
                      </button>

                      {/* List of saved areas */}
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-0.5 text-left">
                        {savedAreas.length === 0 ? (
                          <div className="text-center p-2.5 border border-military-800/50 rounded-lg bg-military-800/10">
                            <p className="font-mono text-[8.5px] text-military-400 tracking-wider uppercase">NENHUMA ÁREA GRAVADA</p>
                          </div>
                        ) : (
                          savedAreas.map(sa => (
                            <div 
                              key={sa.id}
                              className={`flex flex-col border p-2.5 rounded-xl transition-all ${expandedAreaMenuId === sa.id ? 'border-military-600 bg-military-800/40' : 'border-military-750 bg-military-850/60 hover:border-military-600'}`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 truncate max-w-[70%]">
                                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 shadow-lg shadow-amber-500/30 animate-pulse" />
                                  <div className="flex flex-col truncate">
                                    <span className="font-sans text-[11px] uppercase font-black text-military-100 truncate">
                                      {sa.name}
                                    </span>
                                    <span className="font-mono text-[8.5px] text-military-450 mt-0.5">
                                      {sa.area.toFixed(2)} ha &bull; {sa.points.length} vértices
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    onClick={() => {
                                      if (sa.points.length > 0) {
                                        setCenter({ lat: sa.points[0].lat, lng: sa.points[0].lng });
                                        setZoom(15);
                                        setIsMenuOpen(false);
                                        showTemporaryStatus(`Centrado em: ${sa.name}`);
                                      }
                                    }}
                                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white font-mono text-[9px] font-black rounded-lg uppercase tracking-wider transition-all"
                                  >
                                    Ir
                                  </button>
                                  <button
                                    onClick={() => setExpandedAreaMenuId(expandedAreaMenuId === sa.id ? null : sa.id)}
                                    className={`p-1 rounded-lg border border-transparent transition-all ${expandedAreaMenuId === sa.id ? 'bg-military-800 text-military-100 border-military-600' : 'text-military-400 hover:text-military-202 hover:bg-military-850'}`}
                                  >
                                    <Menu className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* expanded action links for Area */}
                              {expandedAreaMenuId === sa.id && (
                                <div className="grid grid-cols-4 gap-1.5 border-t border-military-800/80 pt-2.5 mt-2.5 animate-fadeIn">
                                  {editingAreaId === sa.id ? (
                                    <div className="col-span-4 flex flex-col gap-1.5 p-1 bg-military-900 rounded-lg">
                                      <span className="font-mono text-[7px] text-military-400 uppercase font-black tracking-wider px-1">Renomear Área:</span>
                                      <div className="flex gap-1.5">
                                        <input
                                          type="text"
                                          value={editItemName}
                                          onChange={e => setEditItemName(e.target.value)}
                                          className="flex-grow bg-black/60 border border-military-800 px-2 py-1 text-[10px] rounded text-amber-300 font-mono focus:outline-none focus:border-amber-500"
                                          placeholder="Ex. Gleba Alfa"
                                        />
                                        <button
                                          onClick={() => {
                                            if (editItemName.trim()) {
                                              setSavedAreas(prev => prev.map(item => item.id === sa.id ? { ...item, name: editItemName.trim() } : item));
                                              setEditingAreaId(null);
                                              showTemporaryStatus("Nome da área atualizado!");
                                            }
                                          }}
                                          className="bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-[8px] font-bold text-white uppercase rounded font-mono"
                                        >
                                          OK
                                        </button>
                                        <button
                                          onClick={() => setEditingAreaId(null)}
                                          className="bg-military-800 border border-military-700 px-2 py-1 text-[8px] font-bold text-military-300 uppercase rounded font-mono"
                                        >
                                          Sair
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => shareAreaAsKml(sa)}
                                        className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-military-800/30 hover:bg-military-800 border border-military-750 hover:border-military-650 transition-all text-military-300 hover:text-white"
                                        title="Compartilhar como KML"
                                      >
                                        <Share2 className="w-3.5 h-3.5 text-blue-400 mb-0.5" />
                                        <span className="font-mono text-[7.5px] uppercase tracking-wide">Partilhar</span>
                                      </button>

                                      <button
                                        onClick={() => {
                                          setEditItemName(sa.name);
                                          setEditingAreaId(sa.id);
                                        }}
                                        className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-military-800/30 hover:bg-military-800 border border-military-750 hover:border-military-650 transition-all text-military-300 hover:text-white"
                                        title="Editar Nome"
                                      >
                                        <Pencil className="w-3.5 h-3.5 text-blue-400 mb-0.5" />
                                        <span className="font-mono text-[7.5px] uppercase tracking-wide">Editar</span>
                                      </button>

                                      <button
                                        onClick={() => {
                                          const text = `${sa.name} | Tamanho: ${sa.area.toFixed(2)} ha | Vértices: ${sa.points.map((p, idx) => `V${idx+1}: [${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}]`).join(' -> ')}`;
                                          navigator.clipboard.writeText(text);
                                          showTemporaryStatus("Coordenadas da área copiadas!");
                                        }}
                                        className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-military-800/30 hover:bg-military-800 border border-military-750 hover:border-military-650 transition-all text-military-300 hover:text-white"
                                        title="Copiar Coordenadas"
                                      >
                                        <Copy className="w-3.5 h-3.5 text-blue-400 mb-0.5" />
                                        <span className="font-mono text-[7.5px] uppercase tracking-wide">Copiar</span>
                                      </button>

                                      <button
                                        onClick={() => {
                                          setSavedAreas(prev => prev.filter(x => x.id !== sa.id));
                                          showTemporaryStatus("Área de terra removida.");
                                        }}
                                        className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-military-800/30 hover:bg-military-800 border border-military-750 hover:border-military-650 transition-all text-military-300 hover:text-white animate-fadeIn"
                                        title="Excluir"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-red-400 mb-0.5" />
                                        <span className="font-mono text-[7.5px] uppercase tracking-wide">Excluir</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {activeTab === 'pontos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-military-800 pb-2">
                <span className="font-mono text-[9px] text-military-400 uppercase tracking-widest font-black">MARCADORES REGISTRADOS</span>
                <span className="font-mono text-[8.5px] text-blue-400 bg-blue-900/30 border border-blue-800/50 px-2 py-0.5 rounded-full uppercase font-bold">
                  {savedPoints.length} total
                </span>
              </div>

              {/* Export to KML Button mimicking Screenshot 3 */}
              <button
                onClick={handleExportKml}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 bg-military-950 border border-military-750 hover:border-emerald-500 hover:text-emerald-300 rounded-xl text-military-205 py-2 px-3 text-xs font-mono font-black uppercase tracking-wider transition-all"
                title="Download de todos os pontos táticos salvos formato KML"
              >
                <Share2 className="w-4 h-4 text-emerald-400 animate-pulse" />
                EXPORTAR PARA KML
              </button>

              {/* Saved points list layout resembling Screenshot 3 */}
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {savedPoints.length === 0 ? (
                  <div className="text-center p-6 border border-military-800/50 border-dashed rounded-xl bg-military-800/10">
                    <MapPin className="w-8 h-8 text-military-600 mx-auto mb-2 opacity-50" />
                    <p className="font-mono text-[9px] text-military-400 tracking-wider">NENHUM MARCADOR GRAVADO</p>
                    <p className="font-mono text-[8px] text-military-500 mt-1 uppercase">Vá na aba "Recursos" para adicionar</p>
                  </div>
                ) : (
                  savedPoints.map(pt => (
                    <div 
                      key={pt.id} 
                      className={`flex flex-col border rounded-xl p-3 transition-all ${editingPointId === pt.id ? 'border-amber-500 bg-amber-950/10' : 'border-military-750 bg-military-850/40 hover:border-military-600'}`}
                    >
                      {/* Base Point details */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 truncate max-w-[70%]">
                          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 shadow-lg shadow-red-500/30 animate-pulse" />
                          <div className="flex flex-col truncate">
                            <span className="font-sans text-[11px] uppercase font-black text-military-100 truncate">
                              {pt.name}
                            </span>
                            <span className="font-mono text-[8.5px] text-military-450 mt-0.5">
                              Lat: {decimalToDMS(pt.lat, 'lat')}
                            </span>
                            <span className="font-mono text-[8.5px] text-military-450">
                              Lon: {decimalToDMS(pt.lng, 'lng')}
                            </span>
                          </div>
                        </div>

                        {/* Fast Fly To and Expansion Controls */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Centrar (IR) Pill Badge */}
                          <button
                            onClick={() => {
                              setCenter({ lat: pt.lat, lng: pt.lng });
                              setZoom(17);
                              setIsMenuOpen(false); // Close slider to let user view
                              showTemporaryStatus(`Centrado em: ${pt.name}`);
                            }}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white font-mono text-[9.5px] font-black rounded-lg uppercase tracking-wider transition-all"
                            title="Ir ao local"
                          >
                            Ir
                          </button>
                          
                          {/* Options Hamburger */}
                          <button
                            onClick={() => setExpandedPointMenuId(expandedPointMenuId === pt.id ? null : pt.id)}
                            className={`p-1.5 rounded-lg border border-transparent transition-all ${expandedPointMenuId === pt.id ? 'bg-military-800 text-military-100 border-military-600' : 'text-military-400 hover:text-military-200 hover:bg-military-850'}`}
                            title="Ações do Ponto"
                          >
                            <Menu className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Expansible Actions Menu mimicking Screenshot 3 */}
                      {expandedPointMenuId === pt.id && (
                        <div className="grid grid-cols-4 gap-1.5 border-t border-military-800/80 pt-2.5 mt-2.5 animate-fadeIn">
                          {/* Option 1: Visualizar */}
                          <button
                            onClick={() => {
                              setCenter({ lat: pt.lat, lng: pt.lng });
                              setZoom(17);
                              setIsMenuOpen(false);
                            }}
                            className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-military-800/30 hover:bg-military-800 border border-military-750 hover:border-military-650 transition-all text-military-300 hover:text-white"
                            title="Visualizar no mapa"
                          >
                            <Eye className="w-3.5 h-3.5 text-blue-400 mb-0.5" />
                            <span className="font-mono text-[7.5px] uppercase tracking-wide">Olhar</span>
                          </button>

                          {/* Option 2: Editar */}
                          <button
                            onClick={() => {
                              setPointName(pt.name);
                              setEditingPointId(pt.id);
                              setMeasuringMode('add_point');
                              setCenter({ lat: pt.lat, lng: pt.lng });
                              syncDMSFromLatLng(pt.lat, pt.lng);
                              setIsMenuOpen(false); // Let them edit in coords box
                            }}
                            className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-military-800/30 hover:bg-military-800 border border-military-750 hover:border-military-650 transition-all text-military-300 hover:text-white"
                            title="Editar coordenadas ou nome"
                          >
                            <Pencil className="w-3.5 h-3.5 text-amber-400 mb-0.5" />
                            <span className="font-mono text-[7.5px] uppercase tracking-wide">Editar</span>
                          </button>

                          {/* Option 3: Compartilhar */}
                          <button
                            onClick={() => {
                              const clipboardText = `Ponto Tático: ${pt.name} | Coordenadas: Lat ${decimalToDMS(pt.lat, 'lat')}, Lng ${decimalToDMS(pt.lng, 'lng')} (DEC: ${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)})`;
                              navigator.clipboard.writeText(clipboardText);
                              showTemporaryStatus(`Coordenadas de "${pt.name}" copiadas!`);
                            }}
                            className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-military-800/30 hover:bg-military-800 border border-military-750 hover:border-military-650 transition-all text-military-300 hover:text-white"
                            title="Copiar informações"
                          >
                            <Share2 className="w-3.5 h-3.5 text-emerald-400 mb-0.5" />
                            <span className="font-mono text-[7.5px] uppercase tracking-wide">Enviar</span>
                          </button>

                          {/* Option 4: Excluir */}
                          <button
                            onClick={() => {
                              setSavedPoints(prev => prev.filter(p => p.id !== pt.id));
                              showTemporaryStatus(`Marcador "${pt.name}" excluído.`);
                            }}
                            className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-military-800/30 hover:bg-military-800 border border-military-750 hover:border-red-950 transition-all text-military-300 hover:text-red-400"
                            title="Remover ponto permanentemente"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500 mb-0.5" />
                            <span className="font-mono text-[7.5px] uppercase tracking-wide">Excluir</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'trajetos' && (
            <div className="flex flex-col items-center justify-center p-8 border border-military-800 rounded-xl bg-military-800/20 text-center">
              <Route className="w-12 h-12 text-military-500 mb-2" />
              <h4 className="font-mono text-xs font-black uppercase text-military-205 mb-1">Tracker de Linha de Patrulha</h4>
              <p className="font-mono text-[10px] text-military-400">Rastreamento de trajetórias e envio de trilhas via rádio satélite.</p>
              <div className="mt-8 p-1 border border-military-700 border-dashed rounded font-mono text-[8px] text-blue-400 uppercase tracking-widest font-black bg-blue-500/5">
                Módulo reservado para o BPA
              </div>
            </div>
          )}

        </div>

        {/* Drawer footer (Branded version footer) */}
        <div className="p-4 border-t border-military-800 bg-military-900/40">
          <div className="flex items-center justify-between p-3.5 bg-military-850 border border-military-750/50 rounded-xl">
            <div className="flex items-center gap-3">
              <div id="pm-avatar" className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white tracking-wider text-sm shadow-md font-sans">
                PM
              </div>
              <div className="flex flex-col">
                <span className="font-sans text-[11px] font-bold text-military-100 uppercase tracking-wide">
                  PresidentMaps v1.0
                </span>
                <span className="font-sans text-[9px] text-military-450 uppercase tracking-widest font-semibold text-military-400">
                  Professional Edition
                </span>
              </div>
            </div>
            <button className="p-2 text-military-400 hover:text-military-100 hover:bg-military-800/80 rounded-lg transition-colors">
              <Compass className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
