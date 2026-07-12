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
  Pencil,
  RotateCcw,
  Crosshair
} from 'lucide-react';
import { decimalToDMS } from '../utils/coords';
import brandLogo from '../assets/images/batalhao_ambiental_logo_1779854041969.png';

// --- DATABASE PERSISTENCE SYSTEM (IndexedDB) ---
const DB_NAME = 'PresidentMapsDB_v2';
const DB_VERSION = 2;

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
  color?: string;
  thickness?: 'grossa' | 'media' | 'fina';
  features: Array<{
    type: 'Point' | 'LineString' | 'Polygon';
    name: string;
    description?: string;
    coordinates: Array<{ lat: number; lng: number }>;
  }>;
}

let cachedDbConnection: IDBDatabase | null = null;

function initDB(): Promise<IDBDatabase> {
  if (cachedDbConnection) {
    return Promise.resolve(cachedDbConnection);
  }
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
      if (!db.objectStoreNames.contains('tiles_cache')) {
        db.createObjectStore('tiles_cache', { keyPath: 'url' });
      }
    };
    request.onsuccess = () => {
      cachedDbConnection = request.result;
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

function dbSaveTile(url: string, data: Blob | string): Promise<void> {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tiles_cache', 'readwrite');
      tx.objectStore('tiles_cache').put({ url, dataUrl: data, createdAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

function dbGetTile(url: string): Promise<Blob | string | null> {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tiles_cache', 'readonly');
      const req = tx.objectStore('tiles_cache').get(url);
      req.onsuccess = () => {
        if (req.result) {
          resolve(req.result.dataUrl);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  });
}

function dbCleanupOldTiles(): Promise<void> {
  return initDB().then(db => {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('tiles_cache', 'readwrite');
        const store = tx.objectStore('tiles_cache');
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const req = store.openCursor();
        let deletedCount = 0;
        req.onsuccess = (event: any) => {
          const cursor = event.target.result;
          if (cursor) {
            const value = cursor.value;
            if (value.createdAt && value.createdAt < sevenDaysAgo) {
              cursor.delete();
              deletedCount++;
            }
            cursor.continue();
          } else {
            if (deletedCount > 0) {
              console.log(`[BPA] Limpeza de cache: ${deletedCount} tiles antigas removidas.`);
            }
            resolve();
          }
        };
        req.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
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

const ACRE_MUNICIPIOS = [
  "Rio Branco", "Sena Madureira", "Cruzeiro do Sul", "Tarauacá", 
  "Feijó", "Epitaciolândia", "Brasiléia", "Senador Guiomard", 
  "Mâncio Lima", "Porto Walter", "Assis Brasil", "Plácido de Castro", "Xapuri", "Porto Acre"
];

const ACRE_MUNICIPIOS_GEO = [
  { name: "Sena Madureira", lat: -9.06, lng: -68.66 },
  { name: "Rio Branco", lat: -9.97, lng: -67.81 },
  { name: "Cruzeiro do Sul", lat: -7.63, lng: -72.67 },
  { name: "Tarauacá", lat: -8.16, lng: -70.76 },
  { name: "Feijó", lat: -8.16, lng: -70.35 },
  { name: "Epitaciolândia", lat: -11.02, lng: -68.74 },
  { name: "Brasiléia", lat: -11.01, lng: -68.75 },
  { name: "Senador Guiomard", lat: -9.90, lng: -67.73 },
  { name: "Mâncio Lima", lat: -7.61, lng: -72.90 },
  { name: "Porto Walter", lat: -8.27, lng: -72.74 },
  { name: "Assis Brasil", lat: -10.94, lng: -69.57 },
  { name: "Plácido de Castro", lat: -10.33, lng: -67.15 },
  { name: "Xapuri", lat: -10.30, lng: -68.50 },
  { name: "Porto Acre", lat: -9.58, lng: -67.53 },
  { name: "Manoel Urbano", lat: -8.84, lng: -69.26 },
  { name: "Bujari", lat: -9.82, lng: -67.95 },
  { name: "Acrelândia", lat: -9.83, lng: -66.88 },
  { name: "Capixaba", lat: -10.32, lng: -67.92 },
  { name: "Santa Rosa do Purus", lat: -9.43, lng: -70.50 },
  { name: "Jordão", lat: -9.43, lng: -71.88 },
  { name: "Marechal Thaumaturgo", lat: -8.94, lng: -72.79 },
  { name: "Rodrigues Alves", lat: -7.74, lng: -72.65 }
];

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
  isTrack?: boolean;
  points?: Array<{ lat: number; lng: number }>;
  distance?: number;
  duration?: number;
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

const convertImageToDataURL = (img: HTMLImageElement): string | null => {
  try {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.naturalWidth || 256;
    tempCanvas.height = img.naturalHeight || 256;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;
    tempCtx.drawImage(img, 0, 0);
    return tempCanvas.toDataURL('image/png');
  } catch (e) {
    return null;
  }
};

export default function PresidentMaps({ onBack }: PresidentMapsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('camadas');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number>(0);
  const [smoothHeading, setSmoothHeading] = useState<number>(0);
  const [showTargetReticle, setShowTargetReticle] = useState<boolean>(true);
  const prevHeading = useRef<number>(0);

  // Smooth continuous heading to avoid 359 -> 0 degree spinning/jitter
  useEffect(() => {
    let diff = deviceHeading - (prevHeading.current % 360);
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    const nextHeading = prevHeading.current + diff;
    setSmoothHeading(nextHeading);
    prevHeading.current = nextHeading;
  }, [deviceHeading]);

  // Listener for dynamic device orientation/compass heading
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      let heading = (e as any).webkitCompassHeading;
      if (heading === undefined) {
        if (e.alpha !== null && e.alpha !== undefined) {
          heading = 360 - e.alpha;
        }
      }
      if (heading !== undefined && heading !== null) {
        setDeviceHeading(heading);
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  // Selected feature ballon state
  const [selectedFeature, setSelectedFeature] = useState<{
    name: string;
    description?: string;
    type: string;
    layerName: string;
    lat: number;
    lng: number;
    coordinates?: Array<{ lat: number; lng: number }>;
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
  const [center, setCenter] = useState(() => {
    const saved = localStorage.getItem('president_map_center');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
          return parsed;
        }
      } catch (e) {}
    }
    return { lat: BASE_LAT, lng: BASE_LNG };
  });
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('president_map_zoom');
    if (saved) {
      const z = parseInt(saved, 10);
      if (!isNaN(z)) return z;
    }
    return 13;
  });
  const [rotation, setRotation] = useState(0); // in radians

  // Lists of maps and layers
  const [importedMaps, setImportedMaps] = useState<ImportedMap[]>([]);
  const [activeMapIds, setActiveMapIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('president_active_map_ids');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [kmlLayers, setKmlLayers] = useState<KmlData[]>([]);
  const [baseMap, setBaseMap] = useState<BaseMapType>(() => {
    const saved = localStorage.getItem('president_base_map');
    return (saved as BaseMapType) || 'satellite';
  });

  // GPS real-world parameters
  const [gpsCoords, setGpsCoords] = useState<{ lat: number, lng: number, accuracy: number } | null>(null);
  const [simulatedGps, setSimulatedGps] = useState<boolean>(true); // Start simulated in Rio Branco Acre
  const [simGpsCoords, setSimGpsCoords] = useState({ lat: -9.0445, lng: -68.6540 });

  // GPS Track Recording States (loaded from localStorage to survive background suspension)
  const [isRecordingGpsTrack, setIsRecordingGpsTrack] = useState<boolean>(() => {
    return localStorage.getItem('president_recording_active') === 'true';
  });
  const [recordedTrackPoints, setRecordedTrackPoints] = useState<Array<{ lat: number; lng: number }>>(() => {
    const saved = localStorage.getItem('president_recorded_points');
    return saved ? JSON.parse(saved) : [];
  });
  const [recordedTrackDistance, setRecordedTrackDistance] = useState<number>(() => {
    const saved = localStorage.getItem('president_recorded_distance');
    return saved ? parseFloat(saved) : 0;
  });
  const [recordedTrackElapsedTime, setRecordedTrackElapsedTime] = useState<number>(() => {
    const saved = localStorage.getItem('president_recorded_elapsed_time');
    return saved ? parseInt(saved) : 0;
  });
  const [recordedTrackStartTime, setRecordedTrackStartTime] = useState<number | null>(() => {
    const saved = localStorage.getItem('president_recorded_start_time');
    return saved ? parseInt(saved) : null;
  });
  const [trackName, setTrackName] = useState<string>(() => {
    return localStorage.getItem('president_recorded_track_name') || '';
  });

  // Synchronize active GPS recording states to localStorage for complete offline / background survival
  useEffect(() => {
    localStorage.setItem('president_recording_active', isRecordingGpsTrack ? 'true' : 'false');
    if (!isRecordingGpsTrack) {
      localStorage.removeItem('president_recorded_points');
      localStorage.removeItem('president_recorded_distance');
      localStorage.removeItem('president_recorded_elapsed_time');
      localStorage.removeItem('president_recorded_start_time');
      localStorage.removeItem('president_recorded_track_name');
    }
  }, [isRecordingGpsTrack]);

  useEffect(() => {
    if (isRecordingGpsTrack) {
      localStorage.setItem('president_recorded_points', JSON.stringify(recordedTrackPoints));
    }
  }, [recordedTrackPoints, isRecordingGpsTrack]);

  useEffect(() => {
    if (isRecordingGpsTrack) {
      localStorage.setItem('president_recorded_distance', recordedTrackDistance.toString());
    }
  }, [recordedTrackDistance, isRecordingGpsTrack]);

  useEffect(() => {
    if (isRecordingGpsTrack) {
      localStorage.setItem('president_recorded_elapsed_time', recordedTrackElapsedTime.toString());
    }
  }, [recordedTrackElapsedTime, isRecordingGpsTrack]);

  useEffect(() => {
    if (isRecordingGpsTrack && recordedTrackStartTime !== null) {
      localStorage.setItem('president_recorded_start_time', recordedTrackStartTime.toString());
    }
  }, [recordedTrackStartTime, isRecordingGpsTrack]);

  useEffect(() => {
    if (isRecordingGpsTrack) {
      localStorage.setItem('president_recorded_track_name', trackName);
    }
  }, [trackName, isRecordingGpsTrack]);

  // Local state for GPS track name input field
  const [inputTrackName, setInputTrackName] = useState('');

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

  // Evict old DB tiles in the background when maps open, and clear raw memory on exit
  useEffect(() => {
    dbCleanupOldTiles().catch(err => console.warn("Failed to clean up old tiles:", err));

    return () => {
      // Cleanup all Blob URLs cached when exiting the Maps module to immediately free memory!
      tileCache.current.forEach(img => {
        if (img.src && img.src.startsWith('blob:')) {
          URL.revokeObjectURL(img.src);
        }
      });
      tileCache.current.clear();

      mapImageCache.current.forEach(img => {
        if (img.src && img.src.startsWith('blob:')) {
          URL.revokeObjectURL(img.src);
        }
      });
      mapImageCache.current.clear();
      console.log("[BPA] Memória de texturas liberada com sucesso.");
    };
  }, []);

  // Sync states with LocalStorage
  useEffect(() => {
    localStorage.setItem('president_map_center', JSON.stringify(center));
  }, [center]);

  useEffect(() => {
    localStorage.setItem('president_map_zoom', zoom.toString());
  }, [zoom]);

  useEffect(() => {
    localStorage.setItem('president_base_map', baseMap);
  }, [baseMap]);

  useEffect(() => {
    localStorage.setItem('president_active_map_ids', JSON.stringify(activeMapIds));
  }, [activeMapIds]);

  // Initialize and load saved maps and layers
  useEffect(() => {
    dbGetMaps().then(maps => {
      setImportedMaps(maps);
      if (maps.length > 0) {
        const savedActiveIdsStr = localStorage.getItem('president_active_map_ids');
        if (savedActiveIdsStr) {
          try {
            const savedActiveIds = JSON.parse(savedActiveIdsStr) as string[];
            // Filter to only include valid, existing map IDs
            const validActiveIds = savedActiveIds.filter(id => maps.some(m => m.id === id));
            setActiveMapIds(validActiveIds);
          } catch (e) {
            setActiveMapIds([maps[0].id]);
          }
        } else {
          setActiveMapIds([maps[0].id]);
        }
        const hasSavedLocation = localStorage.getItem('president_map_center');
        if (!hasSavedLocation) {
          setCenter({ lat: maps[0].topLeft.lat + (maps[0].bottomRight.lat - maps[0].topLeft.lat) / 2, lng: maps[0].topLeft.lng + (maps[0].bottomRight.lng - maps[0].topLeft.lng) / 2 });
        }
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

  // Redraw whenever parameters adapt (wrapped in requestAnimationFrame to prevent state lockups and drop frames on high interactions like pan/pinch)
  useEffect(() => {
    let frameId = requestAnimationFrame(() => {
      triggerRedraw();
    });
    return () => cancelAnimationFrame(frameId);
  }, [center, zoom, rotation, activeMapIds, baseMap, kmlLayers, gpsCoords, simulatedGps, simGpsCoords, dimensions, importedMaps, isRecordingGpsTrack, recordedTrackPoints]);

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
      const tileZoom = Math.floor(zoom);
      const centerPixelAtTileZoom = latLngToWorldPixel(center.lat, center.lng, tileZoom);
      const centerTileX = Math.floor(centerPixelAtTileZoom.x / TILE_SIZE);
      const centerTileY = Math.floor(centerPixelAtTileZoom.y / TILE_SIZE);
      const gridExtent = 3; // Render a 7x7 grid to cover rotational corners

      const numTiles = Math.pow(2, tileZoom);

      for (let dx = -gridExtent; dx <= gridExtent; dx++) {
        for (let dy = -gridExtent; dy <= gridExtent; dy++) {
          const tx = centerTileX + dx;
          const ty = centerTileY + dy;

          // Wrap mercator bounds at tileZoom
          if (tx < 0 || tx >= numTiles || ty < 0 || ty >= numTiles) continue;

          const tileX = tx * TILE_SIZE;
          const tileY = ty * TILE_SIZE;

          const dxFromCenter = tileX - centerPixelAtTileZoom.x;
          const dyFromCenter = tileY - centerPixelAtTileZoom.y;

          const scale = Math.pow(2, zoom - tileZoom);
          const screenX = dxFromCenter * scale;
          const screenY = dyFromCenter * scale;
          const drawSize = TILE_SIZE * scale;

          // Resolve tile image
          let tileUrl = '';
          if (baseMap === 'osm') {
            tileUrl = `https://tile.openstreetmap.org/${tileZoom}/${tx}/${ty}.png`;
          } else if (baseMap === 'satellite') {
            tileUrl = `https://mt1.google.com/vt/lyrs=s&x=${tx}&y=${ty}&z=${tileZoom}`;
          } else if (baseMap === 'hybrid') {
            tileUrl = `https://mt1.google.com/vt/lyrs=y&x=${tx}&y=${ty}&z=${tileZoom}`;
          }

          if (tileUrl) {
            const cachedImg = tileCache.current.get(tileUrl);
            if (cachedImg) {
              if (cachedImg.complete && cachedImg.naturalWidth !== 0) {
                ctx.drawImage(cachedImg, screenX, screenY, drawSize, drawSize);
              }
            } else {
              // Register an empty loading Image object immediately to avoid duplicate database or network requests
              const loadingImg = new Image();
              
              // Prevent cache memory overflow (Max 600 elements) on RAM-constrained devices
              if (tileCache.current.size >= 600) {
                const oldestKey = tileCache.current.keys().next().value;
                if (oldestKey) {
                  const imgToEvict = tileCache.current.get(oldestKey);
                  if (imgToEvict && imgToEvict.src && imgToEvict.src.startsWith('blob:')) {
                    URL.revokeObjectURL(imgToEvict.src);
                  }
                  tileCache.current.delete(oldestKey);
                }
              }
              tileCache.current.set(tileUrl, loadingImg);

              // Handle non-CORS Google Satellite and Hybrid tiles directly!
              const isGoogleTile = tileUrl.includes('google.com');
              if (isGoogleTile) {
                loadingImg.src = tileUrl;
                loadingImg.onload = () => {
                  triggerRedraw();
                };
              } else {
                // Fetch persistently from IndexedDB for robust offline loading (OSM or other CORS-enabled tiles)
                dbGetTile(tileUrl).then(dataUrlOrBlob => {
                  if (dataUrlOrBlob) {
                    if (dataUrlOrBlob instanceof Blob) {
                      const objectUrl = URL.createObjectURL(dataUrlOrBlob);
                      loadingImg.src = objectUrl;
                      loadingImg.onload = () => {
                        triggerRedraw();
                      };
                    } else {
                      // Legacy support for string-based dataUrIs
                      loadingImg.src = dataUrlOrBlob;
                      loadingImg.onload = () => {
                        triggerRedraw();
                      };
                    }
                  } else {
                    // Not cached. Fetch online as a blob to save into DB, and set image src
                    fetch(tileUrl)
                      .then(response => {
                        if (!response.ok) throw new Error("HTTP error " + response.status);
                        return response.blob();
                      })
                      .then(blob => {
                        // Save to IndexedDB asynchronously in the background
                        dbSaveTile(tileUrl, blob).catch(err => console.warn("Failed to save tile:", err));
                        
                        const objectUrl = URL.createObjectURL(blob);
                        loadingImg.src = objectUrl;
                        loadingImg.onload = () => {
                          triggerRedraw();
                        };
                      })
                      .catch(err => {
                        // Fallback to setting src directly to tileUrl if fetch fails (e.g. CORS or offline preview mode)
                        loadingImg.crossOrigin = "anonymous";
                        loadingImg.src = tileUrl;
                        loadingImg.onload = () => {
                          triggerRedraw();
                        };
                      });
                  }
                }).catch(e => {
                  // Offline/Database error fallback: attempt online load directly
                  loadingImg.crossOrigin = "anonymous";
                  loadingImg.src = tileUrl;
                  loadingImg.onload = () => {
                    triggerRedraw();
                  };
                });
              }
            }
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

    // 2. RENDER THE ACTIVE GEOPDF IMAGES (MULTIPLE SUPPORTED)
    importedMaps.forEach(activeMap => {
      if (!activeMapIds.includes(activeMap.id)) return;

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
    });

    // 3. RENDER KML VECTOR LAYERS
    kmlLayers.forEach(layer => {
      if (!layer.visible) return;

      layer.features.forEach(feat => {
        if (feat.coordinates.length === 0) return;

        const strokeColor = layer.color || '#3b82f6';
        let fillColor = 'rgba(59, 130, 246, 0.15)';
        if (layer.color) {
          const hex = layer.color.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16) || 59;
          const g = parseInt(hex.substring(2, 4), 16) || 130;
          const b = parseInt(hex.substring(4, 6), 16) || 246;
          fillColor = `rgba(${r}, ${g}, ${b}, 0.15)`;
        }

        ctx.strokeStyle = strokeColor;
        ctx.fillStyle = fillColor;

        // Custom line thickness based on user preference
        let lineWidth = 3; // Default (Grossa)
        if (layer.thickness === 'fina') {
          lineWidth = 1;
        } else if (layer.thickness === 'media') {
          lineWidth = 2;
        }
        ctx.lineWidth = lineWidth;

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

      // 1. Draw thin discrete dashed line connecting GPS position to map center (0,0)
      const distKm = calculateHaversineDistance(positionToShow, center);
      const distM = distKm * 1000;
      
      if (distM > 5) { // Only show line if user is at least 5m away from map center
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(0, 0);
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.65)'; // Discrete tactical blue line
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]); // Dashed line
        ctx.stroke();
        ctx.restore();

        // Draw modern distance badge close to the central reticle (0, 0)
        const len = Math.sqrt(gx * gx + gy * gy);
        let mx = gx / 2;
        let my = gy / 2;
        if (len > 40) {
          mx = (gx / len) * 40;
          my = (gy / len) * 40;
        }
        const label = distM < 1000 ? `${Math.round(distM)} m` : `${distKm.toFixed(2)} km`;
        
        ctx.save();
        ctx.font = 'bold 9.5px monospace';
        const textWidth = ctx.measureText(label).width;
        const padX = 6;
        const bW = textWidth + padX * 2;
        const bH = 16;
        const bx = mx - bW / 2;
        const by = my - bH / 2;
        
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(bx, by, bW, bH, 4);
        } else {
          ctx.rect(bx, by, bW, bH);
        }
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'; // Sleek dark slate
        ctx.fill();
        ctx.strokeStyle = '#3b82f6'; // Clean blue border
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, mx, my + 0.5);
        ctx.restore();
      }

      // 2. Draw the new vivid blue arrowhead reticle always pointing in device heading direction
      ctx.save();
      ctx.translate(gx, gy);
      
      const headingRad = (smoothHeading * Math.PI) / 180;
      ctx.rotate(headingRad);

      // Soft blue glow ring
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.fill();

      // Sharp arrowhead path (vivid blue)
      ctx.beginPath();
      ctx.moveTo(0, -15);         // Top apex
      ctx.lineTo(11, 11);         // Bottom-right wing
      ctx.lineTo(0, 3);           // Bottom-center indentation
      ctx.lineTo(-11, 11);        // Bottom-left wing
      ctx.closePath();

      ctx.fillStyle = '#0066ff';  // Vivid blue
      ctx.fill();

      // Sharp white outline for high contrast
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.restore();
    }

    // 4b. DRAW SAVED POINTS
    savedPoints.forEach(pt => {
      const ptPixel = latLngToWorldPixel(pt.lat, pt.lng, zoom);
      const px = ptPixel.x - centerPixel.x;
      const py = ptPixel.y - centerPixel.y;

      // Subtle outer blue glow ring
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-rotation);

      // Draw beautiful, discrete, tactical crosshair marker (modern style)
      const cx = 0;
      const cy = 0;
      const r = 5.5;

      // Outer ring
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.fill();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Crosshair tick marks
      ctx.beginPath();
      // Top
      ctx.moveTo(cx, cy - r - 2); ctx.lineTo(cx, cy - r);
      // Bottom
      ctx.moveTo(cx, cy + r); ctx.lineTo(cx, cy + r + 2);
      // Left
      ctx.moveTo(cx - r - 2, cy); ctx.lineTo(cx - r, cy);
      // Right
      ctx.moveTo(cx + r, cy); ctx.lineTo(cx + r + 2, cy);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Center solid core dot
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Draw modern slate/blue badge above the marker
      const labelText = pt.name || 'Ponto';
      ctx.font = 'bold 9px monospace';
      const textWidth = ctx.measureText(labelText).width;
      
      const badgeW = textWidth + 10;
      const badgeH = 15;
      const bx = -badgeW / 2;
      const by = -21; // Positioned neatly just above the marker

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(bx, by, badgeW, badgeH, 4);
      } else {
        ctx.rect(bx, by, badgeW, badgeH);
      }
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; // Dark tactical slate
      ctx.fill();
      ctx.strokeStyle = '#3b82f6'; // Tactical blue border
      ctx.lineWidth = 1;
      ctx.stroke();

      // Text inside badge
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, 0, by + badgeH / 2 + 0.5);

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

    // 4g. DRAW SAVED GPS TRACKS/TRAILS
    savedPoints.forEach(pt => {
      if (pt.isTrack && pt.points && pt.points.length >= 2) {
        ctx.beginPath();
        const startPixel = latLngToWorldPixel(pt.points[0].lat, pt.points[0].lng, zoom);
        ctx.moveTo(startPixel.x - centerPixel.x, startPixel.y - centerPixel.y);
        for (let i = 1; i < pt.points.length; i++) {
          const ptPixel = latLngToWorldPixel(pt.points[i].lat, pt.points[i].lng, zoom);
          ctx.lineTo(ptPixel.x - centerPixel.x, ptPixel.y - centerPixel.y);
        }
        
        // Draw path shadow/glow
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)'; // Glow purple
        ctx.lineWidth = 6;
        ctx.stroke();

        ctx.strokeStyle = '#a855f7'; // Solid vibrant purple for saved track
        ctx.lineWidth = 3;
        ctx.stroke();

        // Draw green start dot and red end dot
        const startPx = startPixel.x - centerPixel.x;
        const startPy = startPixel.y - centerPixel.y;
        ctx.beginPath();
        ctx.arc(startPx, startPy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        const endPt = pt.points[pt.points.length - 1];
        const endPixel = latLngToWorldPixel(endPt.lat, endPt.lng, zoom);
        const endPx = endPixel.x - centerPixel.x;
        const endPy = endPixel.y - centerPixel.y;
        ctx.beginPath();
        ctx.arc(endPx, endPy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });

    // 4h. DRAW ACTIVE RECORDING GPS TRACK
    if (isRecordingGpsTrack && recordedTrackPoints.length >= 2) {
      ctx.beginPath();
      const startPixel = latLngToWorldPixel(recordedTrackPoints[0].lat, recordedTrackPoints[0].lng, zoom);
      ctx.moveTo(startPixel.x - centerPixel.x, startPixel.y - centerPixel.y);
      for (let i = 1; i < recordedTrackPoints.length; i++) {
        const ptPixel = latLngToWorldPixel(recordedTrackPoints[i].lat, recordedTrackPoints[i].lng, zoom);
        ctx.lineTo(ptPixel.x - centerPixel.x, ptPixel.y - centerPixel.y);
      }

      ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)'; // Glow pink for recording
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.strokeStyle = '#ec4899'; // Vibrant pink for active recording
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Green start point
      const startPx = startPixel.x - centerPixel.x;
      const startPy = startPixel.y - centerPixel.y;
      ctx.beginPath();
      ctx.arc(startPx, startPy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#10b981';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();

    // 5. DRAW COMPASS ACCENT (Static decal)
    ctx.lineWidth = 2;
  }, [paintCount, dimensions, center, zoom, rotation, activeMapIds, baseMap, kmlLayers, gpsCoords, simulatedGps, simGpsCoords, savedPoints, savedDistances, savedAreas, measurePoints, areaPoints, measuringMode, isRecordingGpsTrack, recordedTrackPoints]);

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

  const averageLatLng = (points: Array<{lat: number, lng: number}>) => {
    if (points.length === 0) return { lat: 0, lng: 0 };
    let sumLat = 0;
    let sumLng = 0;
    points.forEach(p => {
      sumLat += p.lat;
      sumLng += p.lng;
    });
    return { lat: sumLat / points.length, lng: sumLng / points.length };
  };

  const findSavedDistanceAt = (sx: number, sy: number): SavedDistance | null => {
    for (const sd of savedDistances) {
      if (sd.points.length < 2) continue;
      const pts = sd.points.map(pt => getScreenPos(pt.lat, pt.lng));
      for (let i = 0; i < pts.length - 1; i++) {
        const dist = distToSegment({ x: sx, y: sy }, pts[i], pts[i+1]);
        if (dist <= 15) {
          return sd;
        }
      }
    }
    return null;
  };

  const findSavedAreaAt = (sx: number, sy: number): SavedArea | null => {
    for (const sa of savedAreas) {
      if (sa.points.length < 3) continue;
      const pts = sa.points.map(pt => getScreenPos(pt.lat, pt.lng));
      if (isPointInPolygon({ x: sx, y: sy }, pts)) {
        return sa;
      }
      for (let i = 0; i < pts.length; i++) {
        const nextIdx = (i + 1) % pts.length;
        const dist = distToSegment({ x: sx, y: sy }, pts[i], pts[nextIdx]);
        if (dist <= 15) {
          return sa;
        }
      }
    }
    return null;
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
            lng: feat.coordinates[0].lng,
            coordinates: feat.coordinates
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
              setSelectedDistance(null);
              setSelectedArea(null);
              setSelectedFeature(null);
            } else {
              const foundDistance = findSavedDistanceAt(sx, sy);
              if (foundDistance) {
                setSelectedDistance(foundDistance);
                setSelectedSavedPoint(null);
                setSelectedArea(null);
                setSelectedFeature(null);
              } else {
                const foundArea = findSavedAreaAt(sx, sy);
                if (foundArea) {
                  setSelectedArea(foundArea);
                  setSelectedSavedPoint(null);
                  setSelectedDistance(null);
                  setSelectedFeature(null);
                } else {
                  setSelectedSavedPoint(null);
                  setSelectedDistance(null);
                  setSelectedArea(null);
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
      }
    }
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    const scale = e.deltaY < 0 ? 1 : -1;
    const newZoom = Math.max(1.0, Math.min(100.0, zoom + scale * 0.5));
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
      const nextZoom = Math.max(1.0, Math.min(100.0, touchState.current.initialZoom + zoomDiff));
      setZoom(nextZoom);

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
              setSelectedDistance(null);
              setSelectedArea(null);
              setSelectedFeature(null);
            } else {
              const foundDistance = findSavedDistanceAt(sx, sy);
              if (foundDistance) {
                setSelectedDistance(foundDistance);
                setSelectedSavedPoint(null);
                setSelectedArea(null);
                setSelectedFeature(null);
              } else {
                const foundArea = findSavedAreaAt(sx, sy);
                if (foundArea) {
                  setSelectedArea(foundArea);
                  setSelectedSavedPoint(null);
                  setSelectedDistance(null);
                  setSelectedFeature(null);
                } else {
                  setSelectedSavedPoint(null);
                  setSelectedDistance(null);
                  setSelectedArea(null);
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
    const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>BPA Saved Points</name>\n`;
    const kmlBody = savedPoints.map(pt => `    <Placemark>\n      <name>${pt.name}</name>\n      <description>Salvo via Aplicações BPA\nLatitude: ${decimalToDMS(pt.lat, 'lat')}\nLongitude: ${decimalToDMS(pt.lng, 'lng')}</description>\n      <Point>\n        <coordinates>${pt.lng},${pt.lat},0</coordinates>\n      </Point>\n    </Placemark>\n`).join('');
    const kmlFooter = `  </Document>\n</kml>`;
    const fullKml = kmlHeader + kmlBody + kmlFooter;
    
    const blob = new Blob([fullKml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bpa_pontos_${Date.now()}.kml`;
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
      <description>Trajeto medido via Aplicações BPA\nDistância Total: ${sd.distance.toFixed(2)} km</description>
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
      <description>Área de terra medida via Aplicações BPA\nTamanho Total: ${sa.area.toFixed(2)} há</description>
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

  const formatElapsedTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (h > 0) {
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  };

  const formatDistance = (meters: number) => {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
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

  // Start a completely fresh GPS track recording
  const startNewRecording = (customName: string) => {
    const finalName = customName.trim() || `TRILHA GPS ${savedPoints.filter(p => p.isTrack).length + 1}`;
    const startTime = Date.now();
    
    setRecordedTrackStartTime(startTime);
    setRecordedTrackElapsedTime(0);
    
    const initialPos = simulatedGps ? simGpsCoords : gpsCoords;
    const initialPoints = initialPos ? [initialPos] : [];
    
    setRecordedTrackPoints(initialPoints);
    setRecordedTrackDistance(0);
    setTrackName(finalName);
    setIsRecordingGpsTrack(true);
    
    showTemporaryStatus(`Gravação de trilha tática iniciada: ${finalName}`);
  };

  // Keep-Alive background systems: Screen Wake Lock + Silent Audio Playback Loop
  const wakeLockRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let activeAudio: HTMLAudioElement | null = null;
    
    async function startKeepAlive() {
      if (!isRecordingGpsTrack) return;
      
      // 1. Request Screen Wake Lock to prevent smartphone from turning off the screen or locking
      if ('wakeLock' in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log("GPS Background: Wake Lock adquirido com sucesso.");
        } catch (err) {
          console.warn("GPS Background: Erro ao solicitar Screen Wake Lock:", err);
        }
      }
      
      // 2. Play a silent audio loop to keep the browser process alive in the background on mobile OS
      try {
        const audio = new Audio();
        // 1-second silent WAV loop
        audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
        audio.loop = true;
        audio.volume = 0.01; // Almost muted
        await audio.play();
        audioRef.current = audio;
        activeAudio = audio;
        console.log("GPS Background: Áudio silencioso em segundo plano ativado.");
      } catch (err) {
        console.warn("GPS Background: Bloqueio do navegador para áudio (necessita interação):", err);
      }
    }

    function stopKeepAlive() {
      if (wakeLockRef.current) {
        wakeLockRef.current.release()
          .then(() => {
            wakeLockRef.current = null;
          })
          .catch((e: any) => console.error(e));
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (activeAudio) {
        activeAudio.pause();
      }
    }

    if (isRecordingGpsTrack) {
      startKeepAlive();
    } else {
      stopKeepAlive();
    }

    return () => {
      stopKeepAlive();
    };
  }, [isRecordingGpsTrack]);

  // Handle visibility changes to re-acquire wake lock when the tab becomes visible again
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && isRecordingGpsTrack) {
        if ('wakeLock' in navigator && !wakeLockRef.current) {
          try {
            wakeLockRef.current = await navigator.wakeLock.request('screen');
            console.log("GPS Background: Wake Lock re-adquirido com sucesso ao abrir a aba");
          } catch (err) {
            console.warn("GPS Background: Falha ao re-adquirir Wake Lock:", err);
          }
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isRecordingGpsTrack]);

  // Effect 1: Handle GPS recording time ticking & simulated movement
  useEffect(() => {
    if (!isRecordingGpsTrack) return;

    const intervalId = setInterval(() => {
      // Calculate elapsed time based on absolute start time to be completely immune to background thread sleep/throttling
      if (recordedTrackStartTime) {
        const elapsed = Math.floor((Date.now() - recordedTrackStartTime) / 1000);
        setRecordedTrackElapsedTime(elapsed);
      } else {
        setRecordedTrackElapsedTime(prev => prev + 1);
      }

      // If simulated, update position to create realistic walking movement
      if (simulatedGps) {
        setSimGpsCoords(prev => {
          // slight random walk in Acre (approx 5-10 meters, which is 0.00005 to 0.00010 degrees)
          // consistent walking heading northeast with a bit of noise
          const deltaLat = 0.00006 + (Math.random() - 0.4) * 0.00002;
          const deltaLng = 0.00008 + (Math.random() - 0.4) * 0.00002;
          return {
            lat: prev.lat + deltaLat,
            lng: prev.lng + deltaLng
          };
        });
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isRecordingGpsTrack, simulatedGps, recordedTrackStartTime]);

  // Effect 2: Watch current active position to append track points and calculate accumulated distance
  const currentActivePos = simulatedGps ? simGpsCoords : gpsCoords;

  useEffect(() => {
    if (!isRecordingGpsTrack || !currentActivePos) return;

    setRecordedTrackPoints(prev => {
      if (prev.length === 0) {
        return [currentActivePos];
      }
      const lastPt = prev[prev.length - 1];
      // Calculate distance in km
      const distKm = calculateHaversineDistance(lastPt, currentActivePos);
      const distM = distKm * 1000;

      // Append point and add to accumulated distance if moved at least 0.5 meters to capture fine paths
      if (distM >= 0.5) {
        setRecordedTrackDistance(d => d + distM);
        return [...prev, currentActivePos];
      }
      return prev;
    });
  }, [isRecordingGpsTrack, currentActivePos]);

  // Center map on target coordinate
  const centerOnGps = () => {
    showTemporaryStatus("Buscando localização real do smartphone...");
    setSimulatedGps(false);
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = pos.coords.accuracy;
          setGpsCoords({ lat, lng, accuracy });
          setCenter({ lat, lng });
          setZoom(14);
          showTemporaryStatus(`Localizado com sucesso! (Precisão: ${accuracy.toFixed(1)}m)`);
        },
        (err) => {
          console.error("Erro ao obter posição exata:", err);
          // Fallback to active gpsCoords watch if we have it
          if (gpsCoords) {
            setCenter({ lat: gpsCoords.lat, lng: gpsCoords.lng });
            setZoom(14);
            showTemporaryStatus("Centralizado na última posição GPS obtida.");
          } else {
            showTemporaryStatus("Falha ao obter sinal de GPS. Verifique se o GPS e as permissões de localização estão ativos.");
          }
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    } else {
      showTemporaryStatus("GPS não suportado neste aparelho.");
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
    const shareText = `Aplicações BPA - Mapa Georreferenciado\n\nNome: ${map.name}\nCoordenada Top-Left: ${map.topLeft.lat}, ${map.topLeft.lng}\nCoordenada Bottom-Right: ${map.bottomRight.lat}, ${map.bottomRight.lng}\n\nAbra no aplicativo para navegar georreferenciado!`;
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Aplicações BPA - ${map.name}`,
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
          setActiveMapIds(prev => [...new Set([...prev, newMap.id])]);
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
      setActiveMapIds(prev => [...new Set([...prev, newMap.id])]);
      
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
    setActiveMapIds(prev => prev.filter(mid => mid !== id));
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

  const changeKmlColor = async (id: string, color: string) => {
    const updated = kmlLayers.map(k => {
      if (k.id === id) {
        dbSaveKml({ ...k, color });
        return { ...k, color };
      }
      return k;
    });
    setKmlLayers(updated);
  };

  const changeKmlThickness = async (id: string, thickness: 'grossa' | 'media' | 'fina') => {
    const updated = kmlLayers.map(k => {
      if (k.id === id) {
        dbSaveKml({ ...k, thickness });
        return { ...k, thickness };
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

        {/* Central tactical reticle marking the coordinate displayed at the bottom of the screen */}
        {showTargetReticle && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center z-20">
            {/* Crisp, small, high-contrast classic GIS reticle (blue/white double-stroke) */}
            <svg 
              width="24" 
              height="24" 
              viewBox="0 0 100 100" 
              className="drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.65)] select-none"
            >
              {/* Core central blue dot with neat white border */}
              <circle cx="50" cy="50" r="10" fill="#3b82f6" stroke="white" strokeWidth="3" />
              
              {/* Outer precise target ring (small) */}
              <circle cx="50" cy="50" r="32" stroke="#3b82f6" strokeWidth="5" fill="none" />
              <circle cx="50" cy="50" r="32" stroke="white" strokeWidth="1.8" fill="none" />

              {/* Precision crosshair tick lines */}
              {/* Top vertical indicator */}
              <line x1="50" y1="8" x2="50" y2="24" stroke="#3b82f6" strokeWidth="5" strokeLinecap="round" />
              <line x1="50" y1="8" x2="50" y2="24" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
              
              {/* Bottom vertical indicator */}
              <line x1="50" y1="76" x2="50" y2="92" stroke="#3b82f6" strokeWidth="5" strokeLinecap="round" />
              <line x1="50" y1="76" x2="50" y2="92" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
              
              {/* Left horizontal indicator */}
              <line x1="8" y1="50" x2="24" y2="50" stroke="#3b82f6" strokeWidth="5" strokeLinecap="round" />
              <line x1="8" y1="50" x2="24" y2="50" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
              
              {/* Right horizontal indicator */}
              <line x1="76" y1="50" x2="92" y2="50" stroke="#3b82f6" strokeWidth="5" strokeLinecap="round" />
              <line x1="76" y1="50" x2="92" y2="50" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
        )}

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
            onClick={() => setZoom(prev => Math.min(100.0, prev + 1))}
            className="p-2.5 bg-military-800/95 border border-military-700/80 rounded-xl hover:bg-military-700 hover:text-blue-300 transition-all text-military-300 flex items-center justify-center backdrop-blur-md shadow-lg"
            title="Aumentar Zoom"
            id="btn-zoom-in"
          >
            <Plus className="w-5 h-5" />
          </button>

          <button 
            onClick={() => setZoom(prev => Math.max(1.0, prev - 1))}
            className="p-2.5 bg-military-800/95 border border-military-700/80 rounded-xl hover:bg-military-700 hover:text-blue-300 transition-all text-military-300 flex items-center justify-center backdrop-blur-md shadow-lg"
            title="Diminuir Zoom"
            id="btn-zoom-out"
          >
            <Minus className="w-5 h-5" />
          </button>

          <button 
            onClick={centerOnGps}
            className="p-2.5 bg-military-800/95 border border-military-700/80 rounded-xl hover:bg-military-700 hover:text-blue-300 transition-all text-blue-400 flex items-center justify-center backdrop-blur-md shadow-lg"
            title="Minha Localização do Telefone"
            id="btn-gps-pm"
          >
            <MapPin className="w-5 h-5" />
          </button>

          <button 
            onClick={() => setShowTargetReticle(!showTargetReticle)}
            className={`p-2.5 bg-military-800/95 border transition-all flex items-center justify-center backdrop-blur-md shadow-lg rounded-xl ${
              showTargetReticle 
                ? 'border-blue-500/50 text-blue-400 bg-blue-950/20' 
                : 'border-military-700/80 text-military-300 hover:bg-military-700 hover:text-military-205'
            }`}
            title="Alternar Retículo de Mira"
            id="btn-toggle-reticle"
          >
            <Crosshair className="w-5 h-5" />
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

        {/* selectedFeature Balloon (Floating on the vector feature's position) */}
        {selectedFeature && (() => {
          // Fallback to first point, but for LineString or Polygon we can float on centroid
          const positionCoords = (selectedFeature.coordinates && selectedFeature.coordinates.length > 0)
            ? averageLatLng(selectedFeature.coordinates)
            : { lat: selectedFeature.lat, lng: selectedFeature.lng };

          const screenPos = getScreenPos(positionCoords.lat, positionCoords.lng);
          const isOffScreen = screenPos.x < 0 || screenPos.x > dimensions.width || screenPos.y < 0 || screenPos.y > dimensions.height;
          if (isOffScreen) return null;

          // Calculations
          let featureLengthKm = 0;
          let featureAreaHectares = 0;

          if (selectedFeature.coordinates && selectedFeature.coordinates.length > 1) {
            const coords = selectedFeature.coordinates;
            if (selectedFeature.type === 'LineString') {
              for (let i = 1; i < coords.length; i++) {
                featureLengthKm += calculateHaversineDistance(coords[i-1], coords[i]);
              }
            } else if (selectedFeature.type === 'Polygon') {
              // Perimeter
              for (let i = 0; i < coords.length; i++) {
                const next = coords[(i + 1) % coords.length];
                featureLengthKm += calculateHaversineDistance(coords[i], next);
              }
              // Area
              let areaSqKm = 0;
              const j = coords.length;
              for (let i = 0; i < j; i++) {
                const p1 = coords[i];
                const p2 = coords[(i + 1) % j];
                const x1 = calculateHaversineDistance({ lat: center.lat, lng: p1.lng }, center) * 1000 * (p1.lng >= center.lng ? 1 : -1);
                const y1 = calculateHaversineDistance({ lat: p1.lat, lng: center.lng }, center) * 1000 * (p1.lat >= center.lat ? 1 : -1);
                const x2 = calculateHaversineDistance({ lat: center.lat, lng: p2.lng }, center) * 1000 * (p2.lng >= center.lng ? 1 : -1);
                const y2 = calculateHaversineDistance({ lat: p2.lat, lng: center.lng }, center) * 1000 * (p2.lat >= center.lat ? 1 : -1);
                areaSqKm += (x1 * y2 - x2 * y1);
              }
              featureAreaHectares = Math.abs(areaSqKm / 2) / 10000;
            }
          }

          return (
            <div 
              style={{ 
                left: screenPos.x, 
                top: screenPos.y,
              }}
              className="absolute pointer-events-auto z-40 -translate-x-1/2 -translate-y-[105%] flex flex-col items-center select-text animate-fade-in"
              id="selected-kml-feature-overlay"
              onMouseDown={e => e.stopPropagation()}
              onMouseUp={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onTouchEnd={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xl w-[260px] flex flex-col gap-2.5 relative text-slate-800">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="flex flex-col flex-grow min-w-0">
                    <h4 className="font-sans text-xs font-black text-slate-800 uppercase tracking-wide truncate pr-1">
                      {selectedFeature.name || "Elemento Vetorial"}
                    </h4>
                    <span className="text-[7.5px] font-mono text-emerald-600 uppercase tracking-widest font-black mt-0.5 truncate">
                      Camada: {selectedFeature.layerName || "Inserida"}
                    </span>
                  </div>
                  <button 
                    onClick={() => setSelectedFeature(null)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                    title="Fechar Balão"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Body / Attribute Table Details */}
                <div className="flex flex-col gap-2 text-[10px] font-mono select-all">
                  
                  {/* General details based on feature type */}
                  <div className="flex justify-between items-center bg-[#f8fafc] px-2 py-1 rounded-lg border border-slate-250/20 text-[9px] text-slate-500 font-sans font-bold">
                    <span className="uppercase text-[7.5px]">Tipo da Feição</span>
                    <span className="font-black text-blue-600 uppercase">
                      {selectedFeature.type === 'Point' ? 'PONTO / MARCO' : selectedFeature.type === 'LineString' ? 'LINHA / TRAJETO' : 'POLÍGONO / ÁREA'}
                    </span>
                  </div>

                  {/* LINESTRING SPECIFIC DETAILS: Length / Extension */}
                  {selectedFeature.type === 'LineString' && (
                    <>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[7.5px] text-slate-450 uppercase font-black tracking-wider">Extensão da Linha</span>
                        <div className="bg-[#f0f9ff] px-2.5 py-1.5 rounded-lg text-blue-700 border border-blue-100 text-xs font-black font-mono">
                          {featureLengthKm.toFixed(3)} km
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[7.5px] text-slate-450 uppercase font-black tracking-wider">Extensão em Metros</span>
                        <div className="bg-[#f8fafc] px-2.5 py-1.5 rounded-lg text-slate-700 border border-slate-200 text-xs font-black font-mono">
                          {(featureLengthKm * 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m
                        </div>
                      </div>
                    </>
                  )}

                  {/* POLYGON SPECIFIC DETAILS: Area & Perimeter */}
                  {selectedFeature.type === 'Polygon' && (
                    <>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[7.5px] text-slate-450 uppercase font-black tracking-wider">Área Calculada</span>
                        <div className="bg-[#fffbeb] px-2.5 py-1.5 rounded-lg text-amber-700 border border-amber-100 text-xs font-black font-mono">
                          {featureAreaHectares.toFixed(3)} ha
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[7.5px] text-slate-450 uppercase font-black tracking-wider">Metros Quadrados</span>
                        <div className="bg-[#f0f9ff] px-2.5 py-1.5 rounded-lg text-blue-700 border border-blue-100 text-xs font-black font-mono">
                          {(featureAreaHectares * 10000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m²
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[7.5px] text-slate-450 uppercase font-black tracking-wider">Perímetro (Extensão)</span>
                        <div className="bg-[#f8fafc] px-2.5 py-1.5 rounded-lg text-slate-700 border border-slate-200 text-xs font-black font-mono">
                          {featureLengthKm.toFixed(3)} km ({(featureLengthKm * 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m)
                        </div>
                      </div>
                    </>
                  )}

                  {/* POINT SPECIFIC DETAILS: Coordinates (GMS & Decimal) */}
                  {selectedFeature.type === 'Point' && (
                    <>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[7.5px] text-slate-450 uppercase font-black tracking-wider">Graus Minutos Segundos (GMS)</span>
                        <div className="bg-[#f0f9ff] px-2.5 py-1.5 rounded-lg text-blue-800 border border-blue-100 text-[8.5px] leading-relaxed">
                          <div>LAT: {decimalToDMS(selectedFeature.lat, 'lat')}</div>
                          <div>LNG: {decimalToDMS(selectedFeature.lng, 'lng')}</div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[7.5px] text-slate-450 uppercase font-black tracking-wider">Coordenadas Decimais</span>
                        <div className="bg-[#f8fafc] px-2 py-1 rounded-lg text-slate-600 border border-slate-200 text-[9px]">
                          <div>LAT: {selectedFeature.lat.toFixed(6)}</div>
                          <div>LNG: {selectedFeature.lng.toFixed(6)}</div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Feature description / Attribute table display */}
                  {selectedFeature.description && selectedFeature.description.trim() && (
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      <span className="text-[7.5px] text-slate-450 uppercase font-black tracking-wider">Atributos Adicionais</span>
                      <div 
                        className="max-h-[85px] overflow-y-auto border border-slate-200/80 rounded-xl p-2.5 bg-[#f8fafc] text-[8.5px] leading-normal text-slate-600 select-text scrollbar-thin overflow-x-hidden"
                        dangerouslySetInnerHTML={{ __html: selectedFeature.description }}
                      />
                    </div>
                  )}

                  {selectedFeature.coordinates && selectedFeature.coordinates.length > 0 && (
                    <div className="flex justify-between items-center text-[7.5px] text-slate-400 font-black mt-1">
                      <span>NÓS: {selectedFeature.coordinates.length} PONTOS</span>
                      <span>CENTRO COORD: {positionCoords.lat.toFixed(4)}, {positionCoords.lng.toFixed(4)}</span>
                    </div>
                  )}
                </div>

                {/* Footer Action */}
                <div className="flex gap-1.5 mt-1 border-t border-slate-100 pt-2.5">
                  <button
                    onClick={() => {
                      let copyText = `Elemento: ${selectedFeature.name || "Elemento Vetorial"}\nCamada: ${selectedFeature.layerName}\nTipo: ${selectedFeature.type}\nCoordenadas Centro: ${positionCoords.lat.toFixed(6)}, ${positionCoords.lng.toFixed(6)}`;
                      if (selectedFeature.type === 'LineString') {
                        copyText += `\nExtensão: ${featureLengthKm.toFixed(3)} km (${(featureLengthKm * 1000).toLocaleString('pt-BR')} m)`;
                      } else if (selectedFeature.type === 'Polygon') {
                        copyText += `\nÁrea: ${featureAreaHectares.toFixed(2)} ha / Perímetro: ${featureLengthKm.toFixed(3)} km`;
                      }
                      if (selectedFeature.description) {
                        copyText += `\nAtributos: ${selectedFeature.description.replace(/<[^>]*>/g, ' ').trim()}`;
                      }
                      navigator.clipboard.writeText(copyText);
                      showTemporaryStatus("Atributos copiados com sucesso!");
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-[10px] font-mono text-white font-extrabold uppercase tracking-widest transition-all"
                  >
                    Copiar Atributos
                  </button>
                </div>
              </div>

              {/* Speech pointer */}
              <div className="w-3 h-3 bg-white border-r border-b border-slate-200/80 rotate-45 -translate-y-1.5 shadow" />
            </div>
          );
        })()}

        {/* selectedDistance Balloon (Floating on the trajectory's center position) */}
        {selectedDistance && (() => {
          const centroid = averageLatLng(selectedDistance.points);
          const screenPos = getScreenPos(centroid.lat, centroid.lng);
          const isOffScreen = screenPos.x < 0 || screenPos.x > dimensions.width || screenPos.y < 0 || screenPos.y > dimensions.height;
          if (isOffScreen) return null;

          return (
            <div 
              style={{ 
                left: screenPos.x, 
                top: screenPos.y,
              }}
              className="absolute pointer-events-auto z-40 -translate-x-1/2 -translate-y-[105%] flex flex-col items-center select-text"
              id="saved-distance-balloon-overlay"
              onMouseDown={e => e.stopPropagation()}
              onMouseUp={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onTouchEnd={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xl w-[250px] flex flex-col gap-2.5 relative text-slate-800">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="flex flex-col animate-fade-in">
                    <h4 className="font-sans text-xs font-black text-slate-800 uppercase tracking-wide truncate max-w-[190px]">
                      {selectedDistance.name || "Sem Nome"}
                    </h4>
                    <span className="text-[7.5px] font-mono text-slate-400 uppercase tracking-widest font-black mt-0.5">Dispositivo Medidor de Linhas</span>
                  </div>
                  <button 
                    onClick={() => setSelectedDistance(null)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                    title="Fechar Balão"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                {/* Body Details */}
                <div className="flex flex-col gap-2 text-[10px] font-mono select-all">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[7.5px] text-slate-450 uppercase font-black tracking-wider">Distância Medida</span>
                    <div className="bg-[#ecfdf5] px-2.5 py-1.5 rounded-lg text-emerald-700 border border-emerald-100 text-xs font-black font-mono">
                      {selectedDistance.distance.toFixed(2)} km
                    </div>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-[7.5px] text-slate-450 uppercase font-black tracking-wider">Metros</span>
                    <div className="bg-[#f0f9ff] px-2.5 py-1.5 rounded-lg text-blue-700 border border-blue-100 text-xs font-black font-mono">
                      {(selectedDistance.distance * 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m
                    </div>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-[7.5px] text-slate-450 uppercase font-black tracking-wider">Quantidade de Nós / Pontos</span>
                    <div className="bg-[#f8fafc] px-2.5 py-1.5 rounded-lg text-slate-700 border border-slate-200 text-xs font-black font-mono">
                      {selectedDistance.points.length} pontos
                    </div>
                  </div>
                </div>

                {/* Footer Copy */}
                <div className="flex gap-1.5 mt-1">
                  <button
                    onClick={() => {
                      const text = `${selectedDistance.name} | Distância: ${selectedDistance.distance.toFixed(2)} km | ${selectedDistance.points.length} pontos`;
                      navigator.clipboard.writeText(text);
                      showTemporaryStatus("Informações de trajeto copiadas!");
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-[10px] font-mono text-white font-extrabold uppercase tracking-widest transition-all"
                  >
                    Copiar Dados
                  </button>
                </div>
              </div>

              {/* Speech pointer */}
              <div className="w-3 h-3 bg-white border-r border-b border-slate-200/80 rotate-45 -translate-y-1.5 shadow" />
            </div>
          );
        })()}

        {/* selectedArea Balloon (Floating on the polygon's center position) */}
        {selectedArea && (() => {
          const centroid = averageLatLng(selectedArea.points);
          const screenPos = getScreenPos(centroid.lat, centroid.lng);
          const isOffScreen = screenPos.x < 0 || screenPos.x > dimensions.width || screenPos.y < 0 || screenPos.y > dimensions.height;
          if (isOffScreen) return null;

          return (
            <div 
              style={{ 
                left: screenPos.x, 
                top: screenPos.y,
              }}
              className="absolute pointer-events-auto z-40 -translate-x-1/2 -translate-y-[105%] flex flex-col items-center select-text"
              id="saved-area-balloon-overlay"
              onMouseDown={e => e.stopPropagation()}
              onMouseUp={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onTouchEnd={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xl w-[250px] flex flex-col gap-2.5 relative text-slate-800">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="flex flex-col animate-fade-in">
                    <h4 className="font-sans text-xs font-black text-slate-800 uppercase tracking-wide truncate max-w-[190px]">
                      {selectedArea.name || "Sem Nome"}
                    </h4>
                    <span className="text-[7.5px] font-mono text-slate-400 uppercase tracking-widest font-black mt-0.5">Dispositivo Medidor de Polígonos</span>
                  </div>
                  <button 
                    onClick={() => setSelectedArea(null)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                    title="Fechar Balão"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                {/* Body Details */}
                <div className="flex flex-col gap-2 text-[10px] font-mono select-all">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[7.5px] text-slate-450 uppercase font-black tracking-wider">Área Calculada</span>
                    <div className="bg-[#fffbeb] px-2.5 py-1.5 rounded-lg text-amber-700 border border-amber-100 text-xs font-black font-mono">
                      {selectedArea.area.toFixed(2)} ha
                    </div>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-[7.5px] text-slate-450 uppercase font-black tracking-wider">Metros Quadrados</span>
                    <div className="bg-[#f0f9ff] px-2.5 py-1.5 rounded-lg text-blue-700 border border-blue-100 text-xs font-black font-mono">
                      {(selectedArea.area * 10000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m²
                    </div>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-[7.5px] text-slate-450 uppercase font-black tracking-wider">Quantidade de Vértices</span>
                    <div className="bg-[#f8fafc] px-2.5 py-1.5 rounded-lg text-slate-700 border border-slate-200 text-xs font-black font-mono">
                      {selectedArea.points.length} vertices
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="flex gap-1.5 mt-1">
                  <button
                    onClick={() => {
                      const text = `${selectedArea.name} | Área: ${selectedArea.area.toFixed(2)} ha | ${selectedArea.points.length} vertices`;
                      navigator.clipboard.writeText(text);
                      showTemporaryStatus("Informações de área copiadas!");
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-[10px] font-mono text-white font-extrabold uppercase tracking-widest transition-all"
                  >
                    Copiar Dados
                  </button>
                </div>
              </div>

              {/* Speech pointer */}
              <div className="w-3 h-3 bg-white border-r border-b border-slate-200/80 rotate-45 -translate-y-1.5 shadow" />
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
              
              <div className="flex flex-col text-right justify-center">
                <span className="text-[10px] text-amber-400 uppercase tracking-widest font-black">Resultado Total</span>
                <span className="font-extrabold text-emerald-400 text-2xl tracking-tight leading-tight mt-0.5 drop-shadow-md">
                  {measuringMode === 'measure_distance' ? (() => {
                    let total = 0;
                    for (let i = 1; i < measurePoints.length; i++) {
                      total += calculateHaversineDistance(measurePoints[i-1], measurePoints[i]);
                    }
                    return `${total.toFixed(2)} km`;
                  })() : (() => {
                    if (areaPoints.length < 3) return 'Poucos Vértices';
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

            <div className="flex justify-center gap-4 mt-2">
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
                className="w-11 h-9 flex items-center justify-center rounded-xl bg-amber-150 hover:bg-amber-200 border border-amber-400 text-amber-950 transition-all active:scale-95 shadow-sm cursor-pointer"
                title="Desfazer Último Ponto"
                type="button"
              >
                <RotateCcw className="w-4 h-4" />
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
                className="w-11 h-9 flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-95 shadow-sm cursor-pointer"
                title="Salvar Medição"
                type="button"
              >
                <Save className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setMeasuringMode('none');
                  setMeasurePoints([]);
                  setAreaPoints([]);
                }}
                className="w-11 h-9 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all active:scale-95 shadow-sm cursor-pointer"
                title="Concluir Medição"
                type="button"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* 4f. ADICIONAR PONTO BOTTOM COORD PANEL */}
        {measuringMode === 'add_point' && (
          <div 
            className="absolute left-4 right-4 bottom-4 z-40 bg-military-900/98 border border-military-700 p-2.5 px-3 rounded-xl text-white font-sans backdrop-blur-md shadow-xl flex flex-col gap-2"
            onMouseDown={e => e.stopPropagation()}
            onMouseUp={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            
            {/* Header section with instructions according to Screenshot 2 */}
            <div className="flex items-center justify-between border-b border-military-800 pb-1.5">
              <div className="flex items-center gap-1.5">
                <Navigation className="w-3 h-3 text-blue-400 rotate-45 shrink-0" />
                <span className="text-[8.5px] font-black tracking-wider uppercase text-military-100">
                  {editingPointId ? (savedPoints.find(p => p.id === editingPointId)?.isTrack ? 'EDITAR TRILHA GPS' : 'EDITAR MARCADOR') : 'ADICIONAR PONTO TÁTICO'}
                </span>
              </div>
              <button 
                onClick={() => {
                  setMeasuringMode('none');
                  setEditingPointId(null);
                  setPointName('');
                }}
                className="p-0.5 rounded bg-military-850 hover:bg-military-800 border border-military-750 text-military-400 hover:text-white transition-colors"
                title="Fechar Panel"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* Row 1: Name entry field & action buttons configured perfectly */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-grow">
                <input
                  type="text"
                  placeholder="Nome do Ponto"
                  value={pointName}
                  onChange={(e) => setPointName(e.target.value)}
                  className="w-full pl-2.5 pr-8 py-1.5 rounded-lg bg-military-950 border border-military-800 hover:border-military-700 focus:border-blue-500 text-[10.5px] font-mono placeholder-military-450 text-military-100 uppercase tracking-wide focus:outline-none transition-all"
                />
                {pointName && (
                  <button
                    onClick={() => setPointName('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-4.5 h-4.5 rounded-full bg-military-800/80 hover:bg-military-700 flex items-center justify-center text-military-400 transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>

              {/* Emerand Save/Check button mimicking Screenshot 2 */}
              <button
                onClick={() => {
                  const editingItem = editingPointId ? savedPoints.find(p => p.id === editingPointId) : null;
                  const isTrack = editingItem?.isTrack;
                  const finalName = pointName.trim() || (isTrack ? `TRILHA GPS ${savedPoints.filter(p => p.isTrack).length + 1}` : `PONTO ${savedPoints.length + 1}`);
                  
                  if (editingPointId) {
                    // Update point or track name
                    setSavedPoints(prev => prev.map(p => {
                      if (p.id === editingPointId) {
                        if (p.isTrack) {
                          return { ...p, name: finalName };
                        } else {
                          let savedLat = center.lat;
                          let savedLng = center.lng;
                          if (pointFormat === 'DMS') {
                            const parsed = getLatLngFromDMS(latD, latM, latS, latH, lngD, lngM, lngS, lngH);
                            savedLat = parsed.lat;
                            savedLng = parsed.lng;
                          }
                          return { ...p, name: finalName, lat: savedLat, lng: savedLng };
                        }
                      }
                      return p;
                    }));
                    showTemporaryStatus(`${isTrack ? 'Trilha GPS' : 'Marcador'} atualizado com sucesso: ${finalName}`);
                    setEditingPointId(null);
                  } else {
                    // Compute target latitude and longitude based on the format currently selected
                    let savedLat = center.lat;
                    let savedLng = center.lng;

                    if (pointFormat === 'DMS') {
                      const parsed = getLatLngFromDMS(latD, latM, latS, latH, lngD, lngM, lngS, lngH);
                      savedLat = parsed.lat;
                      savedLng = parsed.lng;
                    }

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
                className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-md shrink-0"
                title="Salvar Ponto Tático"
              >
                <Save className="w-4 h-4" />
              </button>
            </div>

            {/* Only show coordinate inputs if we are NOT editing a GPS track */}
            {!(editingPointId && savedPoints.find(p => p.id === editingPointId)?.isTrack) && (
              <>
                {/* Row 2: Tabs for input format selectors */}
                <div className="grid grid-cols-2 bg-military-950 border border-military-850 rounded-lg p-0.5 text-center font-mono text-[8px] font-black uppercase">
                  <button
                    onClick={() => setPointFormat('DMS')}
                    className={`py-0.5 rounded transition-all ${pointFormat === 'DMS' ? 'bg-military-800 border border-military-700 text-blue-400 font-extrabold' : 'text-military-400 hover:text-military-205'}`}
                  >
                    G.M.S
                  </button>
                  <button
                    onClick={() => setPointFormat('DEC')}
                    className={`py-0.5 rounded transition-all ${pointFormat === 'DEC' ? 'bg-military-800 border border-military-700 text-blue-400 font-extrabold' : 'text-military-400 hover:text-military-205'}`}
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
              </>
            )}
          </div>
        )}
      </div>

      {/* 5. TACTICAL GIS MULTI-STORAGE MENU DRAWER */}
      <div className={`absolute top-0 right-0 h-full w-[85%] max-w-sm bg-military-900 border-l border-military-700 z-50 transform transition-transform duration-300 ease-out flex flex-col shadow-2xl ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        {/* Drawer Header */}
        <div className="p-4 border-b border-military-700 flex items-center justify-between bg-military-800">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-military-300 animate-spin-slow" />
            <h1 className="text-sm font-black tracking-wider uppercase text-military-100 font-mono">APLICAÇÕES BPA</h1>
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
            onClick={() => {
              setActiveTab('ferramentas');
              showTemporaryStatus("Painel 'Recursos' reservado para futura atualização militar.");
            }}
            className={`py-2 text-[9px] font-extrabold uppercase transition-all flex flex-col items-center justify-center gap-1 h-14 ${activeTab === 'ferramentas' ? 'bg-military-900 text-blue-400 border-b-2 border-blue-500' : 'text-military-400 hover:text-military-200'}`}
          >
            <Wrench className="w-4 h-4" />
            <span>Recursos</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('pontos');
              showTemporaryStatus("Painel 'Pontos Salvos' reservado para futura atualização.");
            }}
            className={`py-2 text-[9px] font-extrabold uppercase transition-all flex flex-col items-center justify-center gap-0.5 h-14 ${activeTab === 'pontos' ? 'bg-military-900 text-blue-400 border-b-2 border-blue-500' : 'text-military-400 hover:text-military-200'}`}
          >
            <MapPin className="w-4 h-4" />
            <span className="leading-tight">Pontos<br />Salvos</span>
          </button>
          
          <button
            onClick={() => setActiveTab('camadas')}
            className={`py-2 text-[9px] font-extrabold uppercase transition-all flex flex-col items-center justify-center gap-0.5 h-14 ${activeTab === 'camadas' ? 'bg-military-900 text-blue-400 border-b-2 border-blue-500' : 'text-military-400 hover:text-military-200'}`}
          >
            <Layers className="w-4 h-4" />
            <span className="leading-tight">Camadas/<br />Mapas</span>
          </button>
          
          <button
            onClick={() => {
              setActiveTab('trajetos');
              showTemporaryStatus("Painel 'Rotas Gravadas' reservado para futura atualização militar.");
            }}
            className={`py-2 text-[9px] font-extrabold uppercase transition-all flex flex-col items-center justify-center gap-0.5 h-14 ${activeTab === 'trajetos' ? 'bg-military-900 text-blue-400 border-b-2 border-blue-500' : 'text-military-400 hover:text-military-200'}`}
          >
            <Route className="w-4 h-4" />
            <span className="leading-tight">Rotas<br />Gravadas</span>
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
                    <div className="space-y-2">
                      {importedMaps.length === 0 ? (
                        <div className="text-center p-3 border border-military-800/50 rounded-lg bg-military-800/10">
                          <p className="font-mono text-[9px] text-military-400 tracking-wider">NENHUM MAPA GEO ANEXADO</p>
                        </div>
                      ) : (
                        importedMaps.map(m => (
                          <div 
                            key={m.id}
                            className={`flex flex-col border p-2 rounded-xl transition-all ${activeMapIds.includes(m.id) ? 'border-blue-500 bg-blue-900/15 shadow-md shadow-blue-500/5' : 'border-military-750 bg-military-850/60 hover:border-military-600'}`}
                          >
                            {/* Nome do mapa: Letreiro Digital contínuo com destaque discreto (slower marquee, smaller padding/text) */}
                            <div className="bg-[#f1f5f9] border border-slate-200/60 rounded-md px-2 py-1 overflow-hidden whitespace-nowrap relative mb-1.5">
                              <div className="inline-block animate-[marquee_45s_linear_infinite] hover:[animation-play-state:paused] font-mono text-[10px] font-black uppercase tracking-normal text-slate-800 pr-8">
                                {m.name} &nbsp;&bull;&nbsp; {m.name} &nbsp;&bull;&nbsp; {m.name}
                              </div>
                            </div>
                            
                            {/* Três botões de ações mais compactos e com menor espaçamento */}
                            <div className="grid grid-cols-3 gap-1.5 border-t border-military-750/15 pt-1.5 mt-0.5">
                              {/* Botão 1: Exibir / Ocultar */}
                              <button
                                onClick={() => {
                                  if (activeMapIds.includes(m.id)) {
                                    setActiveMapIds(prev => prev.filter(id => id !== m.id));
                                  } else {
                                    setActiveMapIds(prev => [...prev, m.id]);
                                    setCenter({
                                      lat: m.topLeft.lat + (m.bottomRight.lat - m.topLeft.lat)/2,
                                      lng: m.topLeft.lng + (m.bottomRight.lng - m.topLeft.lng)/2
                                    });
                                  }
                                }}
                                className={`flex flex-col items-center justify-center gap-1 py-1 px-1 rounded-lg border transition-all ${activeMapIds.includes(m.id) ? 'bg-blue-600/20 border-blue-500 text-blue-200 shadow-sm shadow-blue-500/10' : 'bg-military-800/40 border-military-700/60 text-military-300 hover:bg-military-800'}`}
                                id={`btn-view-${m.id}`}
                              >
                                {activeMapIds.includes(m.id) ? (
                                  <>
                                    <Eye className="w-3 h-3 text-blue-400 shrink-0" />
                                    <span className="font-mono text-[8px] font-bold uppercase tracking-wider">Ocultar</span>
                                  </>
                                ) : (
                                  <>
                                    <EyeOff className="w-3 h-3 text-military-400 shrink-0" />
                                    <span className="font-mono text-[8px] font-bold uppercase tracking-wider font-semibold">Exibir</span>
                                  </>
                                )}
                              </button>

                              {/* Botão 2: Compartilhar */}
                              <button
                                onClick={() => handleShareMap(m)}
                                className="flex flex-col items-center justify-center gap-1 py-1 px-1 rounded-lg border bg-military-800/40 border-military-700/60 text-military-300 hover:bg-military-800 hover:border-emerald-500/40 hover:text-emerald-300 transition-all"
                                title="Compartilhar Mapa"
                                id={`btn-share-${m.id}`}
                              >
                                <Share2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                <span className="font-mono text-[8px] font-bold uppercase tracking-wider font-semibold">Enviar</span>
                              </button>

                              {/* Botão 3: Excluir */}
                              <button
                                onClick={() => removeMap(m.id, m.name)}
                                className="flex flex-col items-center justify-center gap-1 py-1 px-1 rounded-lg border bg-military-800/40 border-military-700/60 text-military-300 hover:bg-red-950/30 hover:border-red-500/40 hover:text-red-300 transition-all"
                                title="Excluir Permanentemente"
                                id={`btn-delete-${m.id}`}
                              >
                                <Trash2 className="w-3 h-3 text-red-400 shrink-0" />
                                <span className="font-mono text-[8px] font-bold uppercase tracking-wider font-semibold">Excluir</span>
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
                            {/* Nome com letreiro eletrônico com destaque discreto (slower marquee) */}
                            <div className="bg-[#f0fdf4] border border-emerald-200/60 rounded-lg px-2.5 py-1.5 overflow-hidden whitespace-nowrap relative mb-2.5">
                              <div className="inline-block animate-[marquee_45s_linear_infinite] hover:[animation-play-state:paused] font-mono text-[11.5px] font-black uppercase tracking-normal text-slate-800 pr-12">
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

                            {/* Dynamic Color Selector Section */}
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-military-750/20">
                              <span className="font-mono text-[8px] text-military-400 uppercase tracking-wider font-bold">Alterar Cor:</span>
                              <div className="flex items-center gap-1.5">
                                {[
                                  { name: 'Azul', hex: '#3b82f6' },
                                  { name: 'Verde', hex: '#22c55e' },
                                  { name: 'Vermelho', hex: '#ef4444' },
                                  { name: 'Amarelo', hex: '#eab308' },
                                  { name: 'Roxo', hex: '#a855f7' },
                                ].map(colorOption => (
                                  <button
                                    key={colorOption.hex}
                                    onClick={() => changeKmlColor(k.id, colorOption.hex)}
                                    style={{ backgroundColor: colorOption.hex }}
                                    className={`w-4 h-4 rounded-full border transition-all hover:scale-125 ${ (k.color || '#3b82f6') === colorOption.hex ? 'border-white scale-110 shadow-sm shadow-white/60' : 'border-transparent opacity-80 hover:opacity-100' }`}
                                    title={colorOption.name}
                                  />
                                ))}
                                {/* Custom picker */}
                                <label className="relative cursor-pointer w-4 h-4 rounded-full border border-military-500/50 flex items-center justify-center overflow-hidden bg-gradient-to-tr from-red-500 via-green-500 to-blue-500 hover:scale-125 transition-transform" title="Cor Personalizada">
                                  <input 
                                    type="color"
                                    value={k.color || '#3b82f6'}
                                    onChange={(e) => changeKmlColor(k.id, e.target.value)}
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                  />
                                </label>
                              </div>
                            </div>

                            {/* Dynamic Thickness Selector Section */}
                            <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-military-750/10">
                              <span className="font-mono text-[8px] text-military-400 uppercase tracking-wider font-bold">Espessura:</span>
                              <div className="flex bg-military-900/60 p-0.5 rounded-lg border border-military-700/40">
                                {[
                                  { name: 'Fina', value: 'fina' },
                                  { name: 'Média', value: 'media' },
                                  { name: 'Grossa', value: 'grossa' },
                                ].map(thicknessOption => {
                                  const isActive = (k.thickness || 'grossa') === thicknessOption.value;
                                  return (
                                    <button
                                      key={thicknessOption.value}
                                      onClick={() => changeKmlThickness(k.id, thicknessOption.value as 'grossa' | 'media' | 'fina')}
                                      className={`px-2 py-0.5 rounded-md font-mono text-[8px] font-bold uppercase transition-all ${
                                        isActive
                                          ? 'bg-military-700 text-white shadow-sm font-black'
                                          : 'text-military-400 hover:text-military-200'
                                      }`}
                                    >
                                      {thicknessOption.name}
                                    </button>
                                  );
                                })}
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
                        className="w-full flex items-center justify-center gap-2 border border-dashed border-military-650 hover:border-blue-500 hover:bg-military-800/30 transition-all p-3 rounded-lg text-military-205 cursor-pointer"
                      >
                        <Plus className="w-4 h-4 text-blue-500 shrink-0" />
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
                        className="w-full flex items-center justify-center gap-2 border border-dashed border-military-650 hover:border-yellow-600 hover:bg-military-800/30 transition-all p-3 rounded-lg text-military-205 cursor-pointer"
                      >
                        <Plus className="w-4 h-4 text-yellow-600 shrink-0" />
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

              {/* Saved points list layout resembling Screenshot 3 */}
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {savedPoints.length === 0 ? (
                  <div className="text-center p-6 border border-military-800/50 border-dashed rounded-xl bg-military-800/10">
                    <MapPin className="w-8 h-8 text-military-600 mx-auto mb-2 opacity-50" />
                    <p className="font-mono text-[9px] text-military-400 tracking-wider">NENHUM MARCADOR GRAVADO</p>
                    <p className="font-mono text-[8px] text-military-500 mt-1 uppercase">Vá na aba "Recursos" para adicionar</p>
                  </div>
                ) : (
                  savedPoints.map(pt => {
                    const isTrackItem = pt.isTrack;
                    const firstPt = pt.points && pt.points.length > 0 ? pt.points[0] : { lat: pt.lat, lng: pt.lng };

                    return (
                      <div 
                        key={pt.id} 
                        className={`flex flex-col border rounded-xl p-3 transition-all ${editingPointId === pt.id ? 'border-amber-500 bg-amber-950/10' : 'border-military-750 bg-military-800 hover:border-military-500 hover:shadow-sm'}`}
                      >
                        {/* Base Point/Track details */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 truncate max-w-[75%]">
                            {/* Left Icon Badge based on element type */}
                            {isTrackItem ? (
                              <div className="w-9 h-9 rounded-xl bg-purple-950/30 border border-purple-800/50 flex items-center justify-center text-purple-400 shrink-0" title="Trilha GPS">
                                <Route className="w-4 h-4 text-purple-400" />
                              </div>
                            ) : (
                              <div className="w-9 h-9 rounded-xl bg-military-900 border border-military-750 flex items-center justify-center text-military-300 shrink-0" title="Ponto Marcador">
                                <MapPin className="w-4 h-4 text-military-300 fill-military-300/10" />
                              </div>
                            )}
                            
                            <div className="flex flex-col truncate">
                              <span className="font-sans text-[11px] uppercase font-black text-military-100 tracking-wide truncate">
                                {pt.name}
                              </span>
                              
                              {isTrackItem ? (
                                <div className="flex flex-col gap-0.5 mt-1 font-mono text-[8.5px] text-military-400">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[7px] font-black text-purple-400 uppercase bg-purple-950/40 border border-purple-900/50 px-1 py-0.2 rounded">DIST</span>
                                    <span>{formatDistance(pt.distance || 0)}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[7px] font-black text-purple-400 uppercase bg-purple-950/40 border border-purple-900/50 px-1 py-0.2 rounded">TEMPO</span>
                                    <span>{formatElapsedTime(pt.duration || 0)}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[7px] font-black text-purple-400 uppercase bg-purple-950/40 border border-purple-900/50 px-1 py-0.2 rounded">PTS</span>
                                    <span>{pt.points ? pt.points.length : 0} coordenadas</span>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-1.5 mt-0.5 font-mono text-[8.5px] text-military-450">
                                    <span className="bg-military-900 border border-military-750 px-1 py-0.2 rounded text-[7.5px] font-black text-military-400 uppercase">Lat</span>
                                    <span>{decimalToDMS(pt.lat, 'lat')}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5 font-mono text-[8.5px] text-military-450">
                                    <span className="bg-military-900 border border-military-750 px-1 py-0.2 rounded text-[7.5px] font-black text-military-400 uppercase">Long</span>
                                    <span>{decimalToDMS(pt.lng, 'lng')}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Fast Fly To and Expansion Controls */}
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Centrar (IR) Pill Badge */}
                            <button
                              onClick={() => {
                                setCenter({ lat: firstPt.lat, lng: firstPt.lng });
                                setZoom(14);
                                setIsMenuOpen(false); // Close slider to let user view
                                showTemporaryStatus(`Centrado em: ${pt.name}`);
                              }}
                              className="px-2.5 py-1 bg-military-900 border border-military-750 hover:bg-blue-600 hover:text-white hover:border-blue-600 text-military-350 text-[9px] font-black rounded-lg uppercase tracking-wider transition-all cursor-pointer"
                              title="Ir ao local"
                            >
                              Ir
                            </button>
                            
                            {/* Options Hamburger */}
                            <button
                              onClick={() => setExpandedPointMenuId(expandedPointMenuId === pt.id ? null : pt.id)}
                              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${expandedPointMenuId === pt.id ? 'bg-military-950 text-military-100 border-military-600' : 'text-military-400 hover:text-military-200 hover:bg-military-900 border-transparent'}`}
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
                                setCenter({ lat: firstPt.lat, lng: firstPt.lng });
                                setZoom(14);
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
                                setCenter({ lat: firstPt.lat, lng: firstPt.lng });
                                if (!isTrackItem) {
                                  syncDMSFromLatLng(pt.lat, pt.lng);
                                }
                                setIsMenuOpen(false); // Let them edit in coords box
                              }}
                              className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-military-800/30 hover:bg-military-800 border border-military-750 hover:border-military-650 transition-all text-military-300 hover:text-white"
                              title={isTrackItem ? "Renomear Trilha" : "Editar coordenadas ou nome"}
                            >
                              <Pencil className="w-3.5 h-3.5 text-amber-400 mb-0.5" />
                              <span className="font-mono text-[7.5px] uppercase tracking-wide">Editar</span>
                            </button>

                            {/* Option 3: Compartilhar */}
                            <button
                              onClick={() => {
                                let clipboardText = "";
                                if (isTrackItem) {
                                  clipboardText = `Trilha GPS: ${pt.name} | Distância: ${formatDistance(pt.distance || 0)} | Tempo: ${formatElapsedTime(pt.duration || 0)} | Pontos: ${pt.points ? pt.points.length : 0}`;
                                } else {
                                  clipboardText = `Ponto Tático: ${pt.name} | Coordenadas: Lat ${decimalToDMS(pt.lat, 'lat')}, Lng ${decimalToDMS(pt.lng, 'lng')} (DEC: ${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)})`;
                                }
                                navigator.clipboard.writeText(clipboardText);
                                showTemporaryStatus(`Informações de "${pt.name}" copiadas!`);
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
                                showTemporaryStatus(`${isTrackItem ? 'Trilha GPS' : 'Marcador'} "${pt.name}" excluído.`);
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
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'trajetos' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              {/* Tactical GPS Header */}
              <div className="border border-military-750 bg-military-850 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-950/40 border border-purple-800/50 flex items-center justify-center text-purple-400">
                    <Route className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="flex flex-col">
                    <h4 className="font-sans text-xs font-black uppercase text-military-100 tracking-wide">Rastreador de Patrulha GPS</h4>
                    <span className="font-mono text-[8px] text-military-450 uppercase">Gravação e Monitoramento de Trajetos</span>
                  </div>
                </div>
                
                {isRecordingGpsTrack && (
                  <div className="mt-3.5 flex items-center gap-2.5 px-3 py-2 border border-red-900/50 bg-red-950/15 rounded-lg text-red-400">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                    <div className="flex flex-col leading-tight">
                      <span className="font-sans text-[10px] font-black uppercase tracking-wider">GRAVAÇÃO TÁTICA EM SEGUNDO PLANO</span>
                      <span className="font-mono text-[8px] text-red-500/80">
                        Thread segura contra suspensão (Keep-Alive de áudio & Wake Lock ativo)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Recording Stats (Only shown if actively recording) */}
              {isRecordingGpsTrack ? (
                <div className="flex flex-col gap-3.5">
                  {/* Bento Grid Metrics */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Time Elapsed */}
                    <div className="border border-military-750 bg-military-800/80 rounded-xl p-3 flex flex-col justify-between">
                      <span className="font-mono text-[8px] uppercase font-black text-military-450 tracking-wide">TEMPO DECORRIDO</span>
                      <span className="font-mono text-lg font-black text-white mt-1 leading-none">{formatElapsedTime(recordedTrackElapsedTime)}</span>
                    </div>

                    {/* Distance */}
                    <div className="border border-military-750 bg-military-800/80 rounded-xl p-3 flex flex-col justify-between">
                      <span className="font-mono text-[8px] uppercase font-black text-military-450 tracking-wide">DISTÂNCIA TOTAL</span>
                      <span className="font-mono text-lg font-black text-purple-400 mt-1 leading-none">{formatDistance(recordedTrackDistance)}</span>
                    </div>

                    {/* Point Count */}
                    <div className="border border-military-750 bg-military-800/80 rounded-xl p-3 flex flex-col justify-between">
                      <span className="font-mono text-[8px] uppercase font-black text-military-450 tracking-wide">PONTOS CAPTURADOS</span>
                      <span className="font-mono text-lg font-black text-blue-400 mt-1 leading-none">{recordedTrackPoints.length}</span>
                    </div>

                    {/* Precision/Status */}
                    <div className="border border-military-750 bg-military-800/80 rounded-xl p-3 flex flex-col justify-between">
                      <span className="font-mono text-[8px] uppercase font-black text-military-450 tracking-wide">MODO / SINAL</span>
                      <span className="font-mono text-[11px] font-black text-emerald-400 mt-1 leading-none uppercase truncate">
                        {simulatedGps ? "⚡ SIMULADO (Acre)" : (gpsCoords ? `📡 REAL (~${gpsCoords.accuracy.toFixed(1)}m)` : "📡 REAL (Aguardando...)")}
                      </span>
                    </div>
                  </div>

                  {/* Active coordinates debug line */}
                  <div className="border border-military-750 bg-military-900/50 rounded-xl p-3">
                    <span className="font-mono text-[7.5px] uppercase font-black text-military-450 block mb-1">ÚLTIMA COORDENADA REGISTRADA</span>
                    {recordedTrackPoints.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 font-mono text-[9px] text-military-300">
                          <span className="bg-military-800 border border-military-700 px-1 py-0.2 rounded text-[7px] font-black text-military-400 uppercase">LAT</span>
                          <span>{decimalToDMS(recordedTrackPoints[recordedTrackPoints.length - 1].lat, 'lat')}</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono text-[9px] text-military-300">
                          <span className="bg-military-800 border border-military-700 px-1 py-0.2 rounded text-[7px] font-black text-military-400 uppercase">LNG</span>
                          <span>{decimalToDMS(recordedTrackPoints[recordedTrackPoints.length - 1].lng, 'lng')}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="font-mono text-[9px] text-military-500 uppercase">Aguardando coordenadas GPS...</span>
                    )}
                  </div>

                  {/* Instructions on Lock state */}
                  <div className="border border-military-750/50 bg-military-850/40 rounded-xl p-3">
                    <p className="font-sans text-[9px] text-military-400 leading-normal">
                      <strong className="text-military-300">📱 PROTEÇÃO DE TELA ATIVA:</strong> Você pode desligar a tela ou bloquear o celular. O sistema mantém o GPS ativo em segundo plano utilizando um processo de áudio inaudível para prevenir suspensão pelo iOS/Android e sincronização de hora absoluta. Certifique-se de manter esta aba aberta no navegador.
                    </p>
                  </div>

                  {/* Stop controls */}
                  <div className="flex flex-col gap-2 mt-2">
                    <button
                      onClick={() => {
                        if (recordedTrackPoints.length < 2) {
                          showTemporaryStatus("Erro: Coordenadas insuficientes para gerar uma trilha (mínimo 2 pontos).");
                          setIsRecordingGpsTrack(false);
                          return;
                        }
                        const finalName = trackName || `TRILHA GPS ${savedPoints.filter(p => p.isTrack).length + 1}`;
                        const newTrack: SavedPoint = {
                          id: 'track_' + Date.now(),
                          name: finalName,
                          lat: recordedTrackPoints[0].lat,
                          lng: recordedTrackPoints[0].lng,
                          isTrack: true,
                          points: recordedTrackPoints,
                          distance: recordedTrackDistance,
                          duration: recordedTrackElapsedTime,
                          createdAt: Date.now()
                        };
                        setSavedPoints(prev => [newTrack, ...prev]);
                        setIsRecordingGpsTrack(false);
                        showTemporaryStatus(`Trilha "${finalName}" salva com sucesso!`);
                      }}
                      className="w-full py-3 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 border border-purple-500 text-white font-sans text-[11px] font-black uppercase rounded-xl tracking-wider shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Save className="w-3.5 h-3.5" />
                      SALVAR TRILHA TÁTICA
                    </button>

                    <button
                      onClick={() => {
                        if (window.confirm("Deseja realmente descartar a gravação atual? Todos os pontos coletados serão perdidos.")) {
                          setIsRecordingGpsTrack(false);
                          showTemporaryStatus("Gravação descartada.");
                        }
                      }}
                      className="w-full py-2.5 bg-military-800 hover:bg-red-950/30 border border-military-750 hover:border-red-900/50 text-military-400 hover:text-red-400 font-sans text-[10px] font-black uppercase rounded-xl tracking-wider transition-all cursor-pointer"
                    >
                      DESCARTAR GRAVAÇÃO
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* GPS Mode Selector Card */}
                  <div className="border border-military-750 bg-military-800/50 rounded-xl p-3">
                    <span className="font-mono text-[8px] uppercase font-black text-military-450 block mb-2 tracking-wide">FONTE DE LOCALIZAÇÃO GPS</span>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setSimulatedGps(true);
                          showTemporaryStatus("GPS Simulado ativado (Acre). Perfeito para demonstrações em desktop.");
                        }}
                        className={`py-2 px-2.5 border rounded-lg font-sans text-[9px] font-black uppercase transition-all cursor-pointer ${simulatedGps ? 'bg-amber-950/20 border-amber-600/80 text-amber-400' : 'bg-military-900 border-military-750 text-military-400 hover:text-military-200'}`}
                      >
                        SIMULADO (WALK)
                      </button>
                      
                      <button
                        onClick={() => {
                          setSimulatedGps(false);
                          showTemporaryStatus("GPS Real ativado. Conectando ao hardware do smartphone...");
                          centerOnGps();
                        }}
                        className={`py-2 px-2.5 border rounded-lg font-sans text-[9px] font-black uppercase transition-all cursor-pointer ${!simulatedGps ? 'bg-blue-950/20 border-blue-600/80 text-blue-400' : 'bg-military-900 border-military-750 text-military-400 hover:text-military-200'}`}
                      >
                        REAL (CELULAR)
                      </button>
                    </div>

                    <p className="font-mono text-[8px] text-military-400 mt-2.5 leading-normal uppercase">
                      {simulatedGps 
                        ? "⚠️ O GPS Simulado gera uma caminhada em Rio Branco-AC para demonstração fácil das linhas." 
                        : "📡 Utiliza a geolocalização exata do navegador. Ideal para patrulhamento em campo aberto."}
                    </p>
                  </div>

                  {/* Name field input card */}
                  <div className="border border-military-750 bg-military-800/50 rounded-xl p-3">
                    <label className="font-mono text-[8px] uppercase font-black text-military-450 block mb-1.5 tracking-wide">
                      NOME DA TRILHA DE PATRULHA
                    </label>
                    <input
                      type="text"
                      placeholder={`TRILHA GPS ${savedPoints.filter(p => p.isTrack).length + 1}`}
                      value={inputTrackName}
                      onChange={(e) => setInputTrackName(e.target.value)}
                      className="w-full px-3 py-2 bg-military-900 border border-military-750 focus:border-military-500 focus:outline-none rounded-lg text-military-100 font-sans text-xs"
                    />
                  </div>

                  {/* Quick coordinates status */}
                  <div className="border border-military-750 bg-military-850/60 rounded-xl p-3.5">
                    <span className="font-mono text-[8px] uppercase font-black text-military-450 block mb-1.5 tracking-wide">STATUS ATUAL DO HARDWARE</span>
                    
                    <div className="flex flex-col gap-1 font-mono text-[9px] text-military-300">
                      <div className="flex items-center gap-1.5">
                        <span className="bg-military-800 border border-military-700 px-1 py-0.2 rounded text-[7px] font-black text-military-400 uppercase">POS</span>
                        <span>
                          {simulatedGps 
                            ? `${simGpsCoords.lat.toFixed(6)}, ${simGpsCoords.lng.toFixed(6)}` 
                            : (gpsCoords ? `${gpsCoords.lat.toFixed(6)}, ${gpsCoords.lng.toFixed(6)}` : "Não obtido")}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="bg-military-800 border border-military-700 px-1 py-0.2 rounded text-[7px] font-black text-military-400 uppercase">PREC</span>
                        <span>
                          {simulatedGps 
                            ? "Simulação perfeita (0m)" 
                            : (gpsCoords ? `± ${gpsCoords.accuracy.toFixed(1)} metros` : "Aguardando sinal")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Start Button */}
                  <button
                    onClick={() => {
                      const nameToUse = inputTrackName.trim() || `TRILHA GPS ${savedPoints.filter(p => p.isTrack).length + 1}`;
                      startNewRecording(nameToUse);
                      setInputTrackName(''); // Clear field
                    }}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 border border-emerald-500 text-white font-sans text-[11px] font-black uppercase rounded-xl tracking-wider shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></span>
                    INICIAR GRAVAÇÃO DE TRILHA
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Drawer footer (Branded version footer) */}
        <div className="p-4 border-t border-military-800 bg-military-900/40">
          <div className="flex items-center justify-between p-3.5 bg-military-850 border border-military-750/50 rounded-xl">
            <div className="flex items-center gap-3">
              <div id="pm-avatar" className="w-10 h-10 rounded-full overflow-hidden bg-military-950 flex items-center justify-center shadow-md border border-military-700">
                <img 
                  src={brandLogo} 
                  alt="Aplicações BPA Logo" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer" 
                />
              </div>
              <div className="flex flex-col">
                <span className="font-sans text-[11px] font-bold text-military-100 uppercase tracking-wide">
                  Aplicações BPA
                </span>
                <span className="font-sans text-[9px] text-military-400 uppercase tracking-widest font-bold">
                  Sistema Militar
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
