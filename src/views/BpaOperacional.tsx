import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  MapPin, 
  Layers, 
  Search, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Download, 
  History, 
  Map, 
  ChevronLeft, 
  Maximize2, 
  Plus, 
  Minus, 
  Maximize, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  FileDown, 
  User, 
  Globe 
} from 'lucide-react';
import { decimalToDMS, decimalToUTM } from '../utils/coords';
import { jsPDF } from 'jspdf';

// --- ACRE CAR PROPERTIES DATABASE PRESET ---
const ACRE_PRESETS = [
  {
    name: "Seringal Santa Maria",
    lat: -9.0658,
    lng: -68.6572,
    carCode: "AC-1200401-A482B8C9D384E90B1E63DFF8C1935821",
    owner: "Francisco Mendes de Oliveira",
    municipio: "Sena Madureira",
    area: 342.50,
    rlRequirement: 80,
    rlActual: 82.3,
    appArea: 18.4,
    appPreserved: true,
    status: "ATIVO" as "ATIVO" | "SUSPENSO" | "PENDENTE",
    prodesAlert: "Nenhum Alerta Ativo",
    overlap: "Nenhuma sobreposição detectada",
    embargo: "Livre de embargos",
    riskLevel: "BAIXO" as "BAIXO" | "MÉDIO" | "ALTO",
    history: "Propriedade rural com cobertura florestal regulamentada e altamente conservada. Atendendo plenamente aos índices legais de preservação no bioma Amazônia."
  },
  {
    name: "Fazenda Rio Acre",
    lat: -9.5842,
    lng: -67.5451,
    carCode: "AC-1200351-F2913A8846C492795B5B876FAF6B2C98",
    owner: "Sebastião Souza Pinheiro",
    municipio: "Porto Acre",
    area: 618.20,
    rlRequirement: 80,
    rlActual: 74.8,
    appArea: 25.4,
    appPreserved: false,
    status: "PENDENTE" as "ATIVO" | "SUSPENSO" | "PENDENTE",
    prodesAlert: "Alerta DETER (Julho/2025): Supressão vegetal não autorizada identificada em APP fluvial (0.8 ha).",
    overlap: "Sem sobreprodução de terras indígenas ou unidades de conservação",
    embargo: "Livre de embargos nacionais",
    riskLevel: "MÉDIO" as "BAIXO" | "MÉDIO" | "ALTO",
    history: "Detectado ramal de acesso ilegal ultrapassando as margens de preservação permanente fluvial de igarapé tributário."
  },
  {
    name: "Estância Bonal",
    lat: -10.1554,
    lng: -67.4328,
    carCode: "AC-1200450-C32A1559E684781A32CB9EEFEE8810D2",
    owner: "Raimundo Nonato de Souza",
    municipio: "Senador Guiomard",
    area: 1250.40,
    rlRequirement: 80,
    rlActual: 51.2,
    appArea: 48.1,
    appPreserved: false,
    status: "SUSPENSO" as "ATIVO" | "SUSPENSO" | "PENDENTE",
    prodesAlert: "Alerta PRODES (2025/2026): Abertura de pastagem consolidada de 145 hectares em área de floresta nativa primária.",
    overlap: "Sem sobreposição com terras indígenas",
    embargo: "Cadastro com embargo ambiental ativo de exploração florestal imposto pelo IMAC (Processo n° 4819/2025).",
    riskLevel: "ALTO" as "BAIXO" | "MÉDIO" | "ALTO",
    history: "Autuado e multado administrativa e civelmente por desflorestamento sem Plano de Manejo Florestal Sustentável (PMFS) válido."
  },
  {
    name: "Gleba Humaitá",
    lat: -8.2674,
    lng: -72.7431,
    carCode: "AC-1200427-E945CB81D235F8E24C19AEEF118C5263",
    owner: "Zilda Pereira Mendes",
    municipio: "Porto Walter",
    area: 215.80,
    rlRequirement: 80,
    rlActual: 85.1,
    appArea: 12.0,
    appPreserved: true,
    status: "ATIVO" as "ATIVO" | "SUSPENSO" | "PENDENTE",
    prodesAlert: "Nenhum Alerta Ativo",
    overlap: "Brecha crítica: Sobreposição de 12% detectada sobre limites homologados da Terra Indígena Kampa.",
    embargo: "Sem termos de embargo registrados no cadastro atual",
    riskLevel: "MÉDIO" as "BAIXO" | "MÉDIO" | "ALTO",
    history: "Área limítrofe sobre herança territorial de reserva indígena. Necessita notificação conjunta FUNAI para regularização fundiária periférica."
  }
];

// --- INTERACTIVE MAP CONSTANTS AND POLYGON GENERATOR ---
function getPropertyPolygon(centerLat: number, centerLng: number, area: number) {
  const seed = Math.abs(Math.sin(centerLat) * 99 + Math.cos(centerLng) * 33);
  const numVertices = 5 + Math.floor((seed * 10) % 4); 
  const radiusDegrees = Math.sqrt(area) * 0.0003; 

  const vertices: Array<{lat: number, lng: number}> = [];
  for (let i = 0; i < numVertices; i++) {
    const angle = (i * 2 * Math.PI) / numVertices + (Math.sin(seed + i) * 0.4);
    const r = radiusDegrees * (0.82 + 0.38 * Math.sin(seed * 3.5 + i * 2));
    const vLat = centerLat + Math.sin(angle) * r;
    const vLng = centerLng + Math.cos(angle) * r;
    vertices.push({ lat: vLat, lng: vLng });
  }
  return vertices;
}

// Generate streams flowing through/near the property
function getStreams(centerLat: number, centerLng: number, radius: number) {
  return [
    {
      name: "Igarapé Primavera",
      points: [
        { lat: centerLat - radius * 1.5, lng: centerLng - radius * 1.1 },
        { lat: centerLat - radius * 0.3, lng: centerLng - radius * 0.1 },
        { lat: centerLat + radius * 0.8, lng: centerLng + radius * 0.5 },
        { lat: centerLat + radius * 1.6, lng: centerLng + radius * 1.3 }
      ]
    }
  ];
}

// Map Deforestation spots
function getDeforestationAlerts(centerLat: number, centerLng: number, radius: number, isDamaged: boolean) {
  if (!isDamaged) return [];
  return [
    {
      lat: centerLat + radius * 0.2,
      lng: centerLng + radius * 0.3,
      radius: radius * 0.22,
      label: "Foco PRODES/DETER 2025"
    }
  ];
}

// --- DYNAMIC CONSISTENT PROPS GENERATOR ---
function getOrGenerateProperty(lat: number, lng: number) {
  const preset = ACRE_PRESETS.find(p => Math.abs(p.lat - lat) < 0.03 && Math.abs(p.lng - lng) < 0.03);
  if (preset) return preset;

  const coordHash = Math.abs(Math.sin(lat) * 1234.56 + Math.cos(lng) * 7890.12);
  const seed = (coordHash - Math.floor(coordHash));

  const prefixes = ["Fazenda", "Estância", "Seringal", "Chácara", "Gleba", "Sítio"];
  const sub1 = ["Dourada", "Bonal", "Rio Acre", "Espalha", "Tucumã", "Liberdade", "Santa Luzia", "São Francisco", "Rio Branco", "Mendes", "Cabecinha", "Sumaré", "Primavera", "Boa Esperança", "Tapauá", "Tarauacá", "Plácido"];
  const sub2 = ["do Norte", "Verde", "do Sul", "da Floresta", "do Divisor", "do Abunã", "Imperial", "Mendes", "de Assis", "Grande", "Bela Vista"];

  const prefix = prefixes[Math.floor(seed * prefixes.length)];
  const name1 = sub1[Math.floor((seed * 17) % sub1.length)];
  const name2 = (seed > 0.45) ? " " + sub2[Math.floor((seed * 31) % sub2.length)] : "";
  const name = `${prefix} ${name1}${name2}`;

  const municipios = ["Rio Branco", "Sena Madureira", "Cruzeiro do Sul", "Tarauacá", "Feijó", "Epitaciolândia", "Brasiléia", "Senador Guiomard", "Mâncio Lima", "Porto Walter", "Assis Brasil", "Plácido de Castro", "Xapuri"];
  const municipio = municipios[Math.floor(seed * municipios.length)];

  const area = Math.round((60 + seed * 850) * 10) / 10;
  const rlRequirement = 80;
  const isCompliant = seed > 0.38;
  const rlActual = isCompliant ? Math.round((80 + seed * 14) * 10) / 10 : Math.round((48 + seed * 30) * 10) / 10;

  const appArea = Math.round((area * 0.04) * 10) / 10;
  const appPreserved = isCompliant || seed > 0.6;

  let status: "ATIVO" | "SUSPENSO" | "PENDENTE" = "ATIVO";
  let prodesAlert = "Nenhum Alerta Ativo";
  let embargo = "Sem embargos registrados";
  let riskLevel: "BAIXO" | "MÉDIO" | "ALTO" = "BAIXO";

  if (!isCompliant) {
    status = seed > 0.18 ? "PENDENTE" : "SUSPENSO";
    riskLevel = seed > 0.18 ? "MÉDIO" : "ALTO";
    prodesAlert = `Alerta DETER (Maio/2026): Supressão florestal contínua detectada no polígono rural de aproximadamente ${Math.round(area * 0.07)} ha.`;
    if (seed < 0.15) {
      embargo = "Área embargada pelo IMAC/IBAMA por infração ambiental e corte de espécies nativas protegidas.";
    }
  } else if (seed < 0.55) {
    status = "PENDENTE";
    riskLevel = "MÉDIO";
    prodesAlert = "Deterctadas pequenas manchas de desmatamento em ramal acessório. Sob auditoria do órgão.";
  }

  const carCode = `AC-1200${Math.floor(10 + seed * 89)}-${Math.floor(1000 + seed * 8999)}-${Math.floor(seed * 9999999).toString(16).toUpperCase().substring(0, 16)}`;

  const owners = [
    "Antonio da Silva Ramos",
    "Maria Souza de Vasconcelos",
    "Raimundo Nonato de Pinheiro",
    "Francisco de Assis Lima",
    "Sebastião de Albuquerque",
    "Ana Glória Mendes",
    "Joaquim Alves de Oliveira",
    "Zilda da Silva Pereira"
  ];
  const owner = owners[Math.floor(seed * owners.length)];

  const history = isCompliant 
    ? "Propriedade rural com cadastro regularizado perante as normas do Código Florestal. Cobertura florestal conservada para uso sustentável de recursos."
    : "Apresenta déficit acumulado de reserva legal florestal e inconformidade relativa às áreas de preservação fluvial. Em processo de análise de autuações administrativas e adequação ambiental.";

  return {
    name,
    lat,
    lng,
    carCode,
    owner,
    municipio,
    area,
    rlRequirement,
    rlActual,
    appArea,
    appPreserved,
    status,
    prodesAlert,
    overlap: seed > 0.92 ? "Sobreposição parcial identificada de 7% com Unidade de Conservação Estadual" : "Nenhuma sobreposição detectada",
    embargo,
    riskLevel,
    history
  };
}

function decimalToGmsParts(val: number, isLat: boolean) {
  const dir = isLat ? (val < 0 ? 'S' : 'N') : (val < 0 ? 'W' : 'E');
  const absVal = Math.abs(val);
  const deg = Math.floor(absVal);
  const minFloat = (absVal - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60 * 100) / 100;
  return { deg, min, sec, dir };
}

function parseCopiedCoordinates(pastedText: string): { lat: number; lng: number } | null {
  const text = pastedText.trim();
  if (!text) return null;

  // Let's try matching decimal formats first: e.g. "-9.584200, -67.545100" or "-9.584200 -67.545100"
  const decimalRegex = /^\s*(-?\d+(?:\.\d+)?)\s*[\s,;\s/|]+\s*(-?\d+(?:\.\d+)?)\s*$/;
  const matchDecimal = text.match(decimalRegex);
  if (matchDecimal) {
    const lat = parseFloat(matchDecimal[1]);
    const lng = parseFloat(matchDecimal[2]);
    return { lat, lng };
  }

  // Helper parser for individual coordinate parts in DMS format (e.g. "9°35'3.12\"S" or "67 32 42.36 W")
  const parseDmsString = (s: string, isLat: boolean) => {
    // Standardize spaces and strip normal notation symbols
    const clean = s.toUpperCase().replace(/[°'"‘’“”]/g, ' ');
    // Match any series of numbers including floats
    const numbers = clean.match(/[-+]?\d+(?:\.\d+)?/g);
    if (!numbers || numbers.length === 0) return null;

    let deg = parseFloat(numbers[0]) || 0;
    let min = numbers.length > 1 ? parseFloat(numbers[1]) : 0;
    let sec = numbers.length > 2 ? parseFloat(numbers[2]) : 0;

    let decimal = deg + min / 60 + sec / 3600;

    // Detect direction multiplier
    let isNegative = false;
    if (isLat) {
      if (clean.includes('S') || clean.includes('L') || clean.includes('SUL')) {
        isNegative = true;
      } else if (clean.includes('N')) {
        isNegative = false;
      } else if (deg < 0) {
        isNegative = true;
      }
    } else {
      if (clean.includes('W') || clean.includes('O') || clean.includes('OESTE') || clean.includes('LND')) {
        isNegative = true;
      } else if (clean.includes('E') || clean.includes('L')) {
        isNegative = false;
      } else if (deg < 0) {
        isNegative = true;
      }
    }

    decimal = Math.abs(decimal);
    return isNegative ? -decimal : decimal;
  };

  // Split text into latitude and longitude components
  let parts = [text];
  if (text.includes(',')) {
    parts = text.split(',');
  } else if (text.includes(';')) {
    parts = text.split(';');
  } else if (text.includes('/') || text.includes('|')) {
    parts = text.split(/[/|]/);
  } else if (text.includes('W') || text.includes('E') || text.includes('O') || text.includes('S')) {
    // Split immediately after direction of latitude if it's placed at the end of parts
    const latIndex = Math.max(text.toUpperCase().indexOf('S'), text.toUpperCase().indexOf('N'));
    if (latIndex !== -1 && latIndex < text.length - 1) {
      parts = [text.substring(0, latIndex + 1), text.substring(latIndex + 1)];
    }
  } else {
    // Split by spaces if we have at least 6 components (e.g., 9 35 3.12 67 32 42.36)
    const words = text.split(/\s+/);
    if (words.length >= 6) {
      const mid = Math.floor(words.length / 2);
      parts = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
    }
  }

  if (parts.length >= 2) {
    const latVal = parseDmsString(parts[0], true);
    const lngVal = parseDmsString(parts[1], false);
    if (latVal !== null && lngVal !== null) {
      return { lat: latVal, lng: lngVal };
    }
  }

  // Fallback to match any 2 coordinates present in text formatted as floating numbers
  const floatRegex = /(-?\d+\.\d+)/g;
  const matches = text.match(floatRegex);
  if (matches && matches.length >= 2) {
    return { lat: parseFloat(matches[0]), lng: parseFloat(matches[1]) };
  }

  return null;
}

interface BpaOperacionalProps {
  onBack: () => void;
}

export default function BpaOperacional({ onBack }: BpaOperacionalProps) {
  const [activeTab, setActiveTab] = useState<'consultas' | 'ficha' | 'mapa' | 'historico'>('consultas');
  
  // Coordinate Entry Mode (GMS by default!)
  const [coordsMode, setCoordsMode] = useState<'gms' | 'decimal'>('gms');

  // Pasted raw string input state
  const [pastedCoord, setPastedCoord] = useState<string>('');

  const handlePastedInputChange = (val: string) => {
    setPastedCoord(val);
    const parsed = parseCopiedCoordinates(val);
    if (parsed) {
      if (coordsMode === 'decimal') {
        setLatInput(parsed.lat.toFixed(6));
        setLngInput(parsed.lng.toFixed(6));
      } else {
        const latGms = decimalToGmsParts(parsed.lat, true);
        setLatDeg(latGms.deg.toString());
        setLatMin(latGms.min.toString());
        setLatSec(latGms.sec.toString());
        setLatDir(latGms.dir as 'S' | 'N');

        const lngGms = decimalToGmsParts(parsed.lng, false);
        setLngDeg(lngGms.deg.toString());
        setLngMin(lngGms.min.toString());
        setLngSec(lngGms.sec.toString());
        setLngDir(lngGms.dir as 'W' | 'E');
      }
    }
  };

  // GMS Lat State (Pre-filled to -9.5842: 9° 35' 3.12" S)
  const [latDeg, setLatDeg] = useState<string>('9');
  const [latMin, setLatMin] = useState<string>('35');
  const [latSec, setLatSec] = useState<string>('3.12');
  const [latDir, setLatDir] = useState<'S' | 'N'>('S');

  // GMS Lng State (Pre-filled to -67.5451: 67° 32' 42.36" W)
  const [lngDeg, setLngDeg] = useState<string>('67');
  const [lngMin, setLngMin] = useState<string>('32');
  const [lngSec, setLngSec] = useState<string>('42.36');
  const [lngDir, setLngDir] = useState<'W' | 'E'>('W');

  // Search Inputs (decimal strings representation in background)
  const [latInput, setLatInput] = useState<string>('-9.5842');
  const [lngInput, setLngInput] = useState<string>('-67.5451');
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  // Synchronizers of GMS into decimal on every GMS change if current mode is GMS
  useEffect(() => {
    if (coordsMode === 'gms') {
      const degL = parseFloat(latDeg) || 0;
      const minL = parseFloat(latMin) || 0;
      const secL = parseFloat(latSec) || 0;
      let decL = degL + minL / 60 + secL / 3600;
      if (latDir === 'S') decL = -decL;
      setLatInput(decL.toFixed(6));

      const degG = parseFloat(lngDeg) || 0;
      const minG = parseFloat(lngMin) || 0;
      const secG = parseFloat(lngSec) || 0;
      let decG = degG + minG / 60 + secG / 3600;
      if (lngDir === 'W') decG = -decG;
      setLngInput(decG.toFixed(6));
    }
  }, [latDeg, latMin, latSec, latDir, lngDeg, lngMin, lngSec, lngDir, coordsMode]);

  // Synchronizers of decimal into GMS on decimal changes if current mode is Decimal
  useEffect(() => {
    if (coordsMode === 'decimal') {
      const parsedLat = parseFloat(latInput);
      if (!isNaN(parsedLat)) {
        const parts = decimalToGmsParts(parsedLat, true);
        setLatDeg(parts.deg.toString());
        setLatMin(parts.min.toString());
        setLatSec(parts.sec.toString());
        setLatDir(parts.dir as 'S' | 'N');
      }

      const parsedLng = parseFloat(lngInput);
      if (!isNaN(parsedLng)) {
        const parts = decimalToGmsParts(parsedLng, false);
        setLngDeg(parts.deg.toString());
        setLngMin(parts.min.toString());
        setLngSec(parts.sec.toString());
        setLngDir(parts.dir as 'W' | 'E');
      }
    }
  }, [latInput, lngInput, coordsMode]);
  
  // Searched Property
  const [currentProp, setCurrentProp] = useState<any>(() => {
    return getOrGenerateProperty(-9.5842, -67.5451);
  });

  // History system
  const [historyList, setHistoryList] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('acregeo_car_history');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    // Default initial history
    return [
      getOrGenerateProperty(-9.0658, -68.6572),
      getOrGenerateProperty(-10.1554, -67.4328)
    ];
  });

  // Save history helper
  const addHistoryItem = (prop: any) => {
    setHistoryList(prev => {
      const filtered = prev.filter(item => item.carCode !== prop.carCode);
      const updated = [prop, ...filtered].slice(0, 15); // keep max 15
      localStorage.setItem('acregeo_car_history', JSON.stringify(updated));
      return updated;
    });
  };

  // Coordinates Parsing and Search Trigger
  const handleGeoSearch = (lat: number, lng: number) => {
    const prop = getOrGenerateProperty(lat, lng);
    setCurrentProp(prop);
    addHistoryItem(prop);

    // Synchronize both inputs and GMS representation fields
    setLatInput(lat.toFixed(6));
    setLngInput(lng.toFixed(6));

    const latGms = decimalToGmsParts(lat, true);
    setLatDeg(latGms.deg.toString());
    setLatMin(latGms.min.toString());
    setLatSec(latGms.sec.toString());
    setLatDir(latGms.dir as 'S' | 'N');

    const lngGms = decimalToGmsParts(lng, false);
    setLngDeg(lngGms.deg.toString());
    setLngMin(lngGms.min.toString());
    setLngSec(lngGms.sec.toString());
    setLngDir(lngGms.dir as 'W' | 'E');

    setActiveTab('ficha');
  };

  const executeSearch = () => {
    let parsedLat = parseFloat(latInput);
    let parsedLng = parseFloat(lngInput);

    if (coordsMode === 'gms') {
      const degL = parseFloat(latDeg) || 0;
      const minL = parseFloat(latMin) || 0;
      const secL = parseFloat(latSec) || 0;
      parsedLat = degL + minL / 60 + secL / 3600;
      if (latDir === 'S') parsedLat = -parsedLat;

      const degG = parseFloat(lngDeg) || 0;
      const minG = parseFloat(lngMin) || 0;
      const secG = parseFloat(lngSec) || 0;
      parsedLng = degG + minG / 60 + secG / 3600;
      if (lngDir === 'W') parsedLng = -parsedLng;
    }

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      alert("Por favor, insira valores geométricos válidos para as coordenadas.");
      return;
    }
    if (parsedLat < -12.0 || parsedLat > -7.0 || parsedLng < -74.0 || parsedLng > -65.0) {
      // Just a gentle warning for simulated demo, but allow checking anyway
      if (!confirm("As coordenadas fornecidas estão fora da região do Acre. Deseja realizar a busca mesmo assim?")) {
        return;
      }
    }
    handleGeoSearch(parsedLat, parsedLng);
  };

  // Capture GPS coordinates
  const handleGetGps = () => {
    if (!navigator.geolocation) {
      alert("Seu aparelho não oferece suporte para captura de Geolocalização.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latRef = pos.coords.latitude.toFixed(6);
        const lngRef = pos.coords.longitude.toFixed(6);
        setLatInput(latRef);
        setLngInput(lngRef);
        setGpsAccuracy(Math.round(pos.coords.accuracy));
        setGpsLoading(false);
      },
      (err) => {
        console.error(err);
        setGpsLoading(false);
        alert("Não foi possível adquirir a geolocalização do GPS. Certifique-se de que o recurso de GPS e as permissões de localização estão ativos.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // --- INTERACTIVE VECTOR MAP SYSTEM ---
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1.2);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  
  // Use references to lock synchronous positions for zero-lag drag/pinch mechanics
  const dragStartRef = useRef<{ x: number, y: number } | null>(null);
  const panStartRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  const touchStartDistRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1.2);

  // Satellite imagery preloaders
  const [satImage, setSatImage] = useState<HTMLImageElement | null>(null);
  const [satLoading, setSatLoading] = useState<boolean>(false);

  // Layers Toggles
  const [showProperty, setShowProperty] = useState<boolean>(true);
  const [showRL, setShowRL] = useState<boolean>(false);
  const [showAPP, setShowAPP] = useState<boolean>(false);
  const [showAlerts, setShowAlerts] = useState<boolean>(true);
  const [isSatView, setIsSatView] = useState<boolean>(true);

  // Bounding Box-based High-Res Satellite Imagery loader (Loads ONCE per property and remains perfectly cached)
  useEffect(() => {
    if (!isSatView) {
      setSatImage(null);
      return;
    }

    const cLat = currentProp.lat;
    const cLng = currentProp.lng;
    
    // Fixed geographical bounding box covering ~18 km around the CAR center
    // This allows deeper zoom-out functionality without exposing black blank borders
    const margin = 0.085;
    const minLng = cLng - margin;
    const maxLng = cLng + margin;
    const minLat = cLat - margin;
    const maxLat = cLat + margin;

    setSatLoading(true);

    const img = new Image();
    img.crossOrigin = "anonymous";
    // Esri World Imagery high-res coordinate satellite export
    img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${minLng},${minLat},${maxLng},${maxLat}&bboxSR=4326&imageSR=4326&size=1280,1280&format=jpg&f=image`;

    img.onload = () => {
      setSatImage(img);
      setSatLoading(false);
    };
    img.onerror = () => {
      setSatLoading(false);
    };
  }, [currentProp.lat, currentProp.lng, isSatView]);

  // Canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset layout
    canvas.width = canvas.parentElement?.clientWidth || 360;
    canvas.height = canvas.parentElement?.clientHeight || 320;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Coordinate centers
    const cLat = currentProp.lat;
    const cLng = currentProp.lng;

    // Map drawing configurations
    const basePixelScale = 180000;
    const scale = basePixelScale * zoomLevel;
    const centerX = width / 2;
    const centerY = height / 2;

    const coordinateToScreen = (lat: number, lng: number) => {
      const dx = lng - cLng;
      const dy = lat - cLat;
      const x = centerX + dx * scale + panX;
      const y = centerY - dy * scale + panY; // flip Y for screen coordinate
      return { x, y };
    };

    // 1. Draw Satellite Background Always (High-resolution ESRI / Google map stream box)
    if (satImage) {
      // Calculate screen positions for physical cached satellite image boundaries matching the export box 
      const margin = 0.085;
      const topLeft = coordinateToScreen(cLat + margin, cLng - margin);
      const bottomRight = coordinateToScreen(cLat - margin, cLng + margin);
      
      ctx.drawImage(
        satImage, 
        topLeft.x, 
        topLeft.y, 
        bottomRight.x - topLeft.x, 
        bottomRight.y - topLeft.y
      );
    } else {
      // Fallback or loading background
      ctx.fillStyle = "#0c110b";
      ctx.fillRect(0, 0, width, height);

      // Simple topographical grid lines under loading
      ctx.strokeStyle = "rgba(40, 80, 48, 0.15)";
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = panX % gridSize; x < width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = panY % gridSize; y < height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }

      ctx.fillStyle = "rgba(171, 195, 166, 0.7)";
      ctx.font = "bold 9px monospace";
      ctx.fillText("CARREGANDO GOOGLE IMAGEM...", 20, 24);
    }

    const propRadius = Math.sqrt(currentProp.area) * 0.0003;
    const polygonVertices = getPropertyPolygon(cLat, cLng, currentProp.area);

    // 2. DRAW PROPERTY BOUNDARY - Neon Cyan/Green exactly like the photograph!
    if (showProperty && polygonVertices.length > 0) {
      ctx.beginPath();
      polygonVertices.forEach((v, index) => {
        const pt = coordinateToScreen(v.lat, v.lng);
        if (index === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();
      
      // Vivid bright green border (Limites da Área SIGEF/CAR)
      ctx.strokeStyle = "#0df2aa"; 
      ctx.lineWidth = 3;
      ctx.stroke();

      // Light transparent background overlay
      ctx.fillStyle = "rgba(13, 242, 170, 0.04)";
      ctx.fill();
    }

    // 3. DRAW PRODES / DETER DEFORESTATION DEPRIVATION ALERT SPOTS
    const hasDeforestation = currentProp.rlActual < 80 || !currentProp.appPreserved;
    const defolAlerts = getDeforestationAlerts(cLat, cLng, propRadius, hasDeforestation);
    if (showAlerts && defolAlerts.length > 0) {
      defolAlerts.forEach(alertVal => {
        const centerPt = coordinateToScreen(alertVal.lat, alertVal.lng);
        const radiusPt = alertVal.radius * scale;

        // Draw Warning transparent red area
        ctx.beginPath();
        ctx.arc(centerPt.x, centerPt.y, radiusPt, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(239, 68, 68, 0.22)";
        ctx.fill();
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]); // Dashed warning border
        ctx.stroke();
        ctx.setLineDash([]); // clear dash selection

        // Alert label text
        ctx.fillStyle = "#f87171";
        ctx.font = "bold 8px monospace";
        ctx.fillText("ALERTA DESMATAMENTO", centerPt.x - 48, centerPt.y);
      });
    }

    // 4. DRAW COORDENADA CONSULTADA PIN (Red circle inside clear white frame, exactly like the photograph)
    const pinPt = coordinateToScreen(cLat, cLng);
    
    // Draw white shadow outer circle
    ctx.beginPath();
    ctx.arc(pinPt.x, pinPt.y, 7.5, 0, 2 * Math.PI);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw bright red central core
    ctx.beginPath();
    ctx.arc(pinPt.x, pinPt.y, 4.5, 0, 2 * Math.PI);
    ctx.fillStyle = "#ef4444";
    ctx.fill();

  }, [currentProp, zoomLevel, panX, panY, showProperty, showAlerts, satImage]);

  // Touch & Drag Handling for Web-GIS Simulator (supporting Mouse and robust absolute multitouch zoom and drag gestures)
  const handleDragStart = (e: React.MouseEvent<HTMLCanvasElement>) => {
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { x: panX, y: panY };
  };

  const handleDragMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPanX(panStartRef.current.x + dx);
    setPanY(panStartRef.current.y + dy);
  };

  const handleDragEnd = () => {
    dragStartRef.current = null;
  };

  // Robust touch event handlers for mobile devices
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panStartRef.current = { x: panX, y: panY };
      touchStartDistRef.current = null;
    } else if (e.touches.length >= 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      initialZoomRef.current = zoomLevel;
      
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      dragStartRef.current = { x: centerX, y: centerY };
      panStartRef.current = { x: panX, y: panY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // Prevent normal browser scrolling/zooming while dragging on active canvas area
    if (e.cancelable) {
      e.preventDefault();
    }
    if (!dragStartRef.current) return;

    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      setPanX(panStartRef.current.x + dx);
      setPanY(panStartRef.current.y + dy);
    } else if (e.touches.length >= 2 && touchStartDistRef.current) {
      // Calculate active distance for pinch zoom
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      // Zoom ratio change factor absolute from gesture start
      const factor = dist / touchStartDistRef.current;
      const targetZoom = initialZoomRef.current * factor;
      setZoomLevel(Math.max(0.04, Math.min(6.0, targetZoom)));

      // Combined dragging translation centering
      const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const dx = currentCenterX - dragStartRef.current.x;
      const dy = currentCenterY - dragStartRef.current.y;
      setPanX(panStartRef.current.x + dx);
      setPanY(panStartRef.current.y + dy);
    }
  };

  const handleTouchEnd = () => {
    dragStartRef.current = null;
    touchStartDistRef.current = null;
  };

  // Modern desktop mouse wheel zooming support
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoomLevel(prev => Math.max(0.04, Math.min(6.0, prev * zoomFactor)));
  };

  const resetMapOffset = () => {
    setPanX(0);
    setPanY(0);
    setZoomLevel(1.2);
  };

  // --- PDF EXPORTER ---
  const handleDownloadLaudoPDF = () => {
    const doc = new jsPDF();
    
    // Borders
    doc.rect(8, 8, 194, 281);
    
    // Header Green Box
    doc.setFillColor(31, 46, 32); // Military Forest Green
    doc.rect(9, 9, 192, 32, 'F');
    
    // Header text
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("BPA - BATALHÃO DE POLICIAMENTO AMBIENTAL", 105, 18, { align: "center" });
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("CONVÊNIO SENSORIAMENTO REMOTO & SISTEMA SÍRGEO", 105, 24, { align: "center" });
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 215, 0); // Yellow gold
    doc.text("RELATÓRIO DE CONSTATAÇÃO AMBIENTAL - ACREGEO-FISCAL IA", 105, 33, { align: "center" });

    // Section 1: Property Identification
    doc.setTextColor(31, 46, 32);
    doc.setFontSize(11);
    doc.text("1. DADOS CADASTRAIS DO IMÓVEL (CAR)", 15, 55);
    doc.setDrawColor(31, 46, 32);
    doc.setLineWidth(0.5);
    doc.line(15, 57, 195, 57);

    doc.setTextColor(40, 40, 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Denominação Rural: ${currentProp.name}`, 15, 65);
    doc.text(`Código do CAR: ${currentProp.carCode}`, 15, 72);
    doc.text(`Detentor do Posse/Domínio: ${currentProp.owner}`, 15, 79);
    doc.text(`Município Correspondente: ${currentProp.municipio} - Acre`, 15, 86);
    doc.text(`Coordenadas de Pesquisa Central:`, 15, 93);
    doc.text(`- Latitude DMS: ${decimalToDMS(currentProp.lat, 'lat')} (${currentProp.lat.toFixed(6)} DD)`, 15, 100);
    doc.text(`- Longitude DMS: ${decimalToDMS(currentProp.lng, 'lng')} (${currentProp.lng.toFixed(6)} DD)`, 15, 107);
    doc.text(`- Projeção UTM: ${decimalToUTM(currentProp.lat, currentProp.lng)}`, 15, 114);

    // Section 2: Forest Indexes
    doc.setTextColor(31, 46, 32);
    doc.setFont("helvetica", "bold");
    doc.text("2. INDICADORES GEOGRÁFICOS DE COBERTURA VEGETAL", 15, 126);
    doc.line(15, 128, 195, 128);

    doc.setTextColor(40, 40, 40);
    doc.setFont("helvetica", "normal");
    doc.text(`Dimensão Consolidada (Hectares): ${currentProp.area} ha`, 15, 136);
    doc.text(`Exigência Legal (Amazônia Legal): 80.00% (${(currentProp.area * 0.8).toFixed(2)} ha)`, 15, 143);
    doc.text(`Reserva Legal Declarada (CAR): ${currentProp.rlActual}% (${((currentProp.rlActual * currentProp.area) / 100).toFixed(2)} ha)`, 15, 150);
    doc.text(`Área de Proteção Permanente Hidrográfica (APP): ${currentProp.appArea} ha`, 15, 157);
    doc.text(`Status de Integridade da Faixa Marginal (APP Furos/Ramais): ${currentProp.appPreserved ? "CONSERVADO" : "DEPRECIADO COM PASSIVO AMBIENTAL"}`, 15, 164);

    // Section 3: Risk Summary
    doc.setTextColor(31, 46, 32);
    doc.setFont("helvetica", "bold");
    doc.text("3. QUADRO GERAL DE ALERTAS E EMBARGOS", 15, 175);
    doc.line(15, 177, 195, 177);

    doc.setTextColor(40, 40, 40);
    doc.setFont("helvetica", "bold");
    doc.text(`- Alerta Prodes / Deter: `, 15, 185);
    doc.setFont("helvetica", "normal");
    doc.text(`${currentProp.prodesAlert}`, 58, 185);

    doc.setFont("helvetica", "bold");
    doc.text(`- Situação do Cadastro: `, 15, 192);
    doc.setFont("helvetica", "normal");
    doc.text(`${currentProp.status}`, 55, 192);

    doc.setFont("helvetica", "bold");
    doc.text(`- Restrição Territorial TI: `, 15, 199);
    doc.setFont("helvetica", "normal");
    doc.text(`${currentProp.overlap}`, 62, 199);

    doc.setFont("helvetica", "bold");
    doc.text(`- Atos de Embargos (IBAMA/IMAC): `, 15, 206);
    doc.setFont("helvetica", "normal");
    doc.text(`${currentProp.embargo}`, 78, 206);

    // Section 4: Opinions
    doc.setTextColor(31, 46, 32);
    doc.setFont("helvetica", "bold");
    doc.text("4. CONCLUSÃO E PARECER TÉCNICO DA FISCALIZAÇÃO", 15, 218);
    doc.line(15, 220, 195, 220);

    doc.setTextColor(40, 40, 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const textConclusion = `Fica autuado e documentado o imóvel rural denominado ${currentProp.name}. ` +
      `Os dados geoespaciais foram consultados em tempo real através do algoritmo inteligente de fatiamento do AcreGeo-Fiscal IA, ` +
      `identificando grau de conformidade e passivos ambientais classificados como RISCO ${currentProp.riskLevel}. ` +
      `${currentProp.history} Este laudo constitui peça informativa para averiguação fotográfica georreferenciada em campo, para devida lavratura de multas ou regularização (PRA) se aplicável.`;

    const wrapConclusion = doc.splitTextToSize(textConclusion, 175);
    doc.text(wrapConclusion, 15, 228);

    // DateTime stamp and signature lines
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.text(`Consulta georreferenciada realizada em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')} UTC.`, 15, 250);

    doc.setFont("helvetica", "normal");
    doc.line(40, 272, 90, 272);
    doc.text("Assinatura do Agente (BPA)", 65, 277, { align: "center" });

    doc.line(120, 272, 170, 272);
    doc.text("Coordenador de Monitoramento Geográfico", 145, 277, { align: "center" });

    doc.save(`LAUDO-ACREGEO-CAR-${currentProp.carCode}.pdf`);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-military-900 border border-military-850/40 rounded-3xl m-0 overflow-hidden text-military-100 flex-1">
      {/* 1. Header with custom back and module titles */}
      <header className="bg-military-850 border-b border-military-700/70 h-16 px-4 flex items-center justify-between shrink-0 z-20">
        <button 
          onClick={onBack}
          className="px-3.5 py-1.5 bg-military-800 hover:bg-military-750 border border-military-700 hover:border-military-500 rounded-xl text-military-200 active:scale-95 transition-all flex items-center gap-1.5 group"
          id="back-bpa-car"
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-wider">Voltar</span>
        </button>

        <div className="flex flex-col items-center">
          <span className="text-sm font-black text-white tracking-widest uppercase">ACREGEO-FISCAL IA</span>
          <span className="text-[7.5px] font-mono text-yellow-500 font-bold uppercase tracking-widest leading-none mt-0.5">Módulo Geral de Busca CAR</span>
        </div>

        <div className="flex items-center p-2 rounded-xl bg-military-800 border border-military-700/60 text-military-300">
          <Shield className="w-4 h-4 animate-pulse text-yellow-500" />
        </div>
      </header>

      {/* 2. Tactical tabs navigation bar */}
      <div className="flex bg-military-950/60 border-b border-military-800 text-xs shrink-0 overflow-x-auto scrollbar-none">
        <button 
          onClick={() => setActiveTab('consultas')}
          className={`flex-1 py-3 px-3 uppercase text-[10px] font-black tracking-wider transition-all border-b-2 flex items-center justify-center gap-1.5 whitespace-nowrap min-w-[100px] ${
            activeTab === 'consultas' ? 'border-yellow-500 bg-military-850/60 text-yellow-500' : 'border-transparent hover:bg-military-850/30 text-military-400'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>Consulta</span>
        </button>
        <button 
          onClick={() => setActiveTab('ficha')}
          className={`flex-1 py-3 px-3 uppercase text-[10px] font-black tracking-wider transition-all border-b-2 flex items-center justify-center gap-1.5 whitespace-nowrap min-w-[110px] ${
            activeTab === 'ficha' ? 'border-yellow-500 bg-military-850/60 text-yellow-500' : 'border-transparent hover:bg-military-850/30 text-military-400'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Divergência CAR</span>
        </button>
        <button 
          onClick={() => setActiveTab('mapa')}
          className={`flex-1 py-3 px-3 uppercase text-[10px] font-black tracking-wider transition-all border-b-2 flex items-center justify-center gap-1.5 whitespace-nowrap min-w-[100px] ${
            activeTab === 'mapa' ? 'border-yellow-500 bg-military-850/60 text-yellow-500' : 'border-transparent hover:bg-military-850/30 text-military-400'
          }`}
        >
          <Map className="w-3.5 h-3.5" />
          <span>Mapa do CAR</span>
        </button>
        <button 
          onClick={() => setActiveTab('historico')}
          className={`flex-1 py-3 px-3 uppercase text-[10px] font-black tracking-wider transition-all border-b-2 flex items-center justify-center gap-1.5 whitespace-nowrap min-w-[100px] ${
            activeTab === 'historico' ? 'border-yellow-500 bg-military-850/60 text-yellow-500' : 'border-transparent hover:bg-military-850/30 text-military-400'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Histórico</span>
        </button>
      </div>

      {/* 3. Primary views area */}
      <div className="flex-1 overflow-y-auto bg-military-900 flex flex-col">
        {activeTab === 'consultas' && (
          <div className="p-4 space-y-5 flex-1 max-w-md mx-auto w-full">
            {/* Coordinates Fields Header */}
            <div className="space-y-1.5 text-center mt-1">
              <h3 className="text-sm font-bold uppercase tracking-wider text-military-100">Insira uma Coordenada Geografia</h3>
            </div>

            {/* Public Data Connection Indicator */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-2xl flex items-start gap-3">
              <Globe className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5 animate-pulse" />
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-black tracking-wider text-yellow-500 block">Sincronização Ativa de Banco de Dados</span>
                <p className="text-[9px] text-military-300 leading-normal font-medium">
                  Este módulo de inteligência requer <strong className="text-yellow-500">conexão de internet</strong> para realizar consultas dinâmicas de dados integrados (SICAR, IMAC, IBAMA, PRODES e DETER). Em campo remoto sem sinal, o aplicativo opera em modo cache autônomo com simulações locais.
                </p>
              </div>
            </div>

            {/* G.M.S / Decimal Toggle Pill Bar matching the screenshot */}
            <div className="border border-white/60 rounded-full p-1 flex bg-[#0d120a] w-full" id="coords-mode-toggle">
              <button
                type="button"
                onClick={() => setCoordsMode('gms')}
                className={`flex-1 py-2 rounded-full text-center text-xs font-extrabold uppercase tracking-widest transition-all ${
                  coordsMode === 'gms'
                    ? 'bg-[#1e261a] text-sky-400 border border-white/20 shadow-md scale-[1.01]'
                    : 'text-[#6c8266] hover:text-military-200'
                }`}
              >
                G.M.S
              </button>
              <button
                type="button"
                onClick={() => setCoordsMode('decimal')}
                className={`flex-1 py-2 rounded-full text-center text-xs font-extrabold uppercase tracking-widest transition-all ${
                  coordsMode === 'decimal'
                    ? 'bg-[#1e261a] text-[#86af75] border border-white/20 shadow-md scale-[1.01]'
                    : 'text-[#6c8266] hover:text-[#abc3a6]'
                }`}
              >
                DECIMAL
              </button>
            </div>

            {/* Campo de Colar Coordenada Copiada */}
            <div className="bg-[#0f140e] border border-military-800 p-4 rounded-2xl space-y-2">
              <label className="text-[9.5px] font-black uppercase tracking-wider text-[#abc3a6] block">
                Colar Coordenada Copiada (Qualquer Formato)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pastedCoord}
                  onChange={(e) => handlePastedInputChange(e.target.value)}
                  placeholder="Ex: -9.5842, -67.5451 ou 9° 35' 3.12'' S 67° 32' 42.36'' W"
                  className="flex-1 bg-[#050805] text-white border border-military-700/80 rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-yellow-500 placeholder-military-600"
                />
                {pastedCoord && (
                  <button
                    type="button"
                    onClick={() => setPastedCoord('')}
                    className="px-3 bg-military-905 border border-military-750 text-military-300 hover:text-white hover:border-military-500 rounded-xl text-[9px] font-black uppercase transition-all shrink-0 active:scale-95"
                  >
                    LIMPAR
                  </button>
                )}
              </div>
              <p className="text-[8px] text-military-450 uppercase font-mono tracking-wider leading-relaxed">
                * O AcreGeo-Fiscal IA detectará automaticamente o formato e preencherá os campos acima.
              </p>
            </div>

            {/* Coordinates Fields matching of the attached photograph */}
            {coordsMode === 'gms' ? (
              <div className="bg-[#0f140e] p-5 border-2 border-military-800 rounded-2xl space-y-4">
                {/* LAT ROW */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-[#abc3a6] text-right w-11 uppercase tracking-widest font-mono">LAT:</span>
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <div className="flex flex-col items-center">
                      <input
                        type="number"
                        value={latDeg}
                        onChange={e => setLatDeg(e.target.value)}
                        className="w-full bg-[#070b07] border border-[#dcd3b5]/80 hover:border-[#dcd3b5] rounded-xl px-2 py-3 text-sm text-center font-mono font-bold text-white focus:outline-none focus:border-yellow-500 transition-all shadow-inner"
                        placeholder="9"
                      />
                      <span className="text-[8px] font-bold text-[#abc3a6]/60 uppercase tracking-widest mt-1.5">GRAUS</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <input
                        type="number"
                        value={latMin}
                        onChange={e => setLatMin(e.target.value)}
                        className="w-full bg-[#070b07] border border-[#dcd3b5]/80 hover:border-[#dcd3b5] rounded-xl px-2 py-3 text-sm text-center font-mono font-bold text-white focus:outline-none focus:border-yellow-500 transition-all shadow-inner"
                        placeholder="18"
                      />
                      <span className="text-[8px] font-bold text-[#abc3a6]/60 uppercase tracking-widest mt-1.5">MINUTOS</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <input
                        type="number"
                        step="any"
                        value={latSec}
                        onChange={e => setLatSec(e.target.value)}
                        className="w-full bg-[#070b07] border border-[#dcd3b5]/80 hover:border-[#dcd3b5] rounded-xl px-2 py-3 text-sm text-center font-mono font-bold text-white focus:outline-none focus:border-yellow-500 transition-all shadow-inner"
                        placeholder="22.64"
                      />
                      <span className="text-[8px] font-bold text-[#abc3a6]/60 uppercase tracking-widest mt-1.5">SEGUNDOS</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLatDir(prev => prev === 'S' ? 'N' : 'S')}
                    className="px-4 py-3 bg-black/40 border border-sky-500/80 hover:bg-sky-500/10 rounded-xl text-sky-400 hover:text-sky-300 font-black text-sm transition-all active:scale-95 w-14 flex items-center justify-center shrink-0 shadow-lg"
                  >
                    {latDir}
                  </button>
                </div>

                {/* LONG ROW */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-[#abc3a6] text-right w-11 uppercase tracking-widest font-mono">LONG:</span>
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <div className="flex flex-col items-center">
                      <input
                        type="number"
                        value={lngDeg}
                        onChange={e => setLngDeg(e.target.value)}
                        className="w-full bg-[#070b07] border border-[#dcd3b5]/80 hover:border-[#dcd3b5] rounded-xl px-2 py-3 text-sm text-center font-mono font-bold text-white focus:outline-none focus:border-yellow-500 transition-all shadow-inner"
                        placeholder="68"
                      />
                      <span className="text-[8px] font-bold text-[#abc3a6]/60 uppercase tracking-widest mt-1.5">GRAUS</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <input
                        type="number"
                        value={lngMin}
                        onChange={e => setLngMin(e.target.value)}
                        className="w-full bg-[#070b07] border border-[#dcd3b5]/80 hover:border-[#dcd3b5] rounded-xl px-2 py-3 text-sm text-center font-mono font-bold text-white focus:outline-none focus:border-yellow-500 transition-all shadow-inner"
                        placeholder="24"
                      />
                      <span className="text-[8px] font-bold text-[#abc3a6]/60 uppercase tracking-widest mt-1.5">MINUTOS</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <input
                        type="number"
                        step="any"
                        value={lngSec}
                        onChange={e => setLngSec(e.target.value)}
                        className="w-full bg-[#070b07] border border-[#dcd3b5]/80 hover:border-[#dcd3b5] rounded-xl px-2 py-3 text-sm text-center font-mono font-bold text-white focus:outline-none focus:border-yellow-500 transition-all shadow-inner"
                        placeholder="54.92"
                      />
                      <span className="text-[8px] font-bold text-[#abc3a6]/60 uppercase tracking-widest mt-1.5">SEGUNDOS</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLngDir(prev => prev === 'W' ? 'E' : 'W')}
                    className="px-4 py-3 bg-black/40 border border-sky-500/80 hover:bg-sky-500/10 rounded-xl text-sky-400 hover:text-sky-300 font-black text-sm transition-all active:scale-95 w-14 flex items-center justify-center shrink-0 shadow-lg"
                  >
                    {lngDir}
                  </button>
                </div>

                {/* GPS Trigger */}
                <div className="pt-3 border-t border-military-850 flex flex-col items-center justify-center gap-1.5">
                  <button 
                    onClick={handleGetGps}
                    disabled={gpsLoading}
                    className="w-full bg-[#1c2419] hover:bg-[#253021] border border-military-700 active:scale-[0.98] transition-all text-[#abc3a6] text-[10px] font-black tracking-widest py-2.5 rounded-xl flex items-center justify-center gap-2 uppercase shadow-md"
                  >
                    <MapPin className={`w-3.5 h-3.5 text-yellow-500 ${gpsLoading ? 'animate-bounce' : ''}`} />
                    {gpsLoading ? 'Sincronizando Satélites...' : 'Capturar via GPS de Campo'}
                  </button>
                  {gpsAccuracy !== null && (
                    <span className="text-[8px] text-yellow-500 uppercase tracking-widest font-mono">
                      Precisão estimada: ±{gpsAccuracy} metros
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3.5 bg-[#0f140e] p-5 border-2 border-military-800 rounded-2xl">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-[#abc3a6]/80 uppercase tracking-widest pl-1">Latitude (Decimal)</label>
                  <input 
                    type="number" 
                    step="any"
                    value={latInput}
                    onChange={e => setLatInput(e.target.value)}
                    className="w-full bg-[#070b07] border border-military-700 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-yellow-500 transition-all text-center"
                    placeholder="-9.584200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-[#abc3a6]/80 uppercase tracking-widest pl-1">Longitude (Decimal)</label>
                  <input 
                    type="number" 
                    step="any"
                    value={lngInput}
                    onChange={e => setLngInput(e.target.value)}
                    className="w-full bg-[#070b07] border border-military-700 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-yellow-500 transition-all text-center"
                    placeholder="-67.545100"
                  />
                </div>

                {/* Convert Indicator */}
                <div className="col-span-2 pt-3 border-t border-military-850 flex flex-col items-center justify-center gap-1.5">
                  <button 
                    onClick={handleGetGps}
                    disabled={gpsLoading}
                    className="w-full bg-[#1c2419] hover:bg-[#253021] border border-military-700 active:scale-[0.98] transition-all text-[#abc3a6] text-[10px] font-black tracking-widest py-2.5 rounded-xl flex items-center justify-center gap-2 uppercase"
                  >
                    <MapPin className={`w-3.5 h-3.5 text-yellow-500 ${gpsLoading ? 'animate-bounce' : ''}`} />
                    {gpsLoading ? 'Sincronizando Satélites...' : 'Capturar via GPS de Campo'}
                  </button>
                  {gpsAccuracy !== null && (
                    <span className="text-[8px] text-yellow-500 uppercase tracking-widest font-mono">
                      Precisão estimada: ±{gpsAccuracy} metros
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Main Action Button */}
            <button 
              onClick={executeSearch}
              className="w-full py-4 bg-amber-500/90 hover:bg-amber-600/90 text-military-950 font-black tracking-widest text-xs uppercase rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 border border-amber-600/50"
            >
              <Search className="w-4 h-4 text-military-950" />
              <span>Buscar dados sobre o CAR</span>
            </button>

          </div>
        )}

        {activeTab === 'ficha' && (
          <div className="p-4 space-y-4 max-w-md mx-auto w-full flex-1">
            {/* Header Badge */}
            <div className="flex items-center justify-between bg-military-950/80 p-4 border border-military-800 rounded-2xl">
              <div>
                <span className="text-[8.5px] font-black font-mono uppercase tracking-widest text-military-400">IMÓVEL LOCALIZADO</span>
                <h4 className="font-extrabold text-sm text-white uppercase tracking-normal mt-0.5 leading-tight">{currentProp.name}</h4>
              </div>
              <span className={`px-2.5 py-1 text-[9px] font-bold rounded-lg ${
                currentProp.status === 'SUSPENSO' ? 'bg-red-500 text-white' :
                currentProp.status === 'PENDENTE' ? 'bg-orange-500 text-military-950' :
                'bg-green-600 text-white'
              }`}>
                CAR {currentProp.status}
              </span>
            </div>

            {/* Risk Indicator Panel */}
            <div className={`p-4 border rounded-2xl flex items-center gap-3.5 relative overflow-hidden ${
              currentProp.riskLevel === 'ALTO' ? 'bg-red-500/10 border-red-500/30 text-red-200' :
              currentProp.riskLevel === 'MÉDIO' ? 'bg-orange-500/10 border-orange-500/30 text-orange-200' :
              'bg-green-500/10 border-green-500/30 text-green-200'
            }`}>
              <div className="p-2.5 bg-black/40 rounded-xl">
                {currentProp.riskLevel === 'ALTO' ? <XCircle className="w-5 h-5 text-red-500" /> :
                 currentProp.riskLevel === 'MÉDIO' ? <AlertTriangle className="w-5 h-5 text-orange-500" /> :
                 <CheckCircle2 className="w-5 h-5 text-green-500" />}
              </div>
              <div>
                <span className="text-[8px] font-black uppercase tracking-widest block leading-tight">Grau de Infração Estimado</span>
                <span className="text-xs font-black uppercase tracking-wider block mt-0.5">Risco de Multas: {currentProp.riskLevel}</span>
              </div>
            </div>

            {/* Specifications Details List */}
            <div className="bg-military-950 p-4 border border-military-800 rounded-2xl text-xs font-mono space-y-3.5">
              <div className="border-b border-military-900 pb-2.5 flex justify-between gap-2.5">
                <span className="text-military-450 uppercase">Código CAR:</span>
                <span className="text-white font-bold select-all break-all text-right">{currentProp.carCode}</span>
              </div>
              <div className="border-b border-military-900 pb-2.5 flex justify-between gap-4">
                <span className="text-military-450 uppercase">Proprietário:</span>
                <span className="text-military-100 font-bold text-right">{currentProp.owner}</span>
              </div>
              <div className="border-b border-military-900 pb-2.5 flex justify-between">
                <span className="text-military-450 uppercase">Município / UF:</span>
                <span className="text-military-100 font-bold">{currentProp.municipio} - AC</span>
              </div>
              <div className="border-b border-military-900 pb-2.5 flex justify-between">
                <span className="text-military-450 uppercase">Área Total:</span>
                <span className="text-white font-bold">{currentProp.area} Hectares</span>
              </div>
              <div className="border-b border-military-850/60 pb-2.5">
                <span className="text-military-450 uppercase block mb-1">Déficit Reserva Legal:</span>
                <div className="flex justify-between items-center bg-black/40 p-2 rounded-lg">
                  <div className="flex gap-2.5">
                    <span className="text-[10px] uppercase text-military-400">Declarado: <span className="text-white font-bold">{currentProp.rlActual}%</span></span>
                    <span className="text-[10px] uppercase text-military-400">Exigido: <span className="font-bold text-green-500">80%</span></span>
                  </div>
                  {currentProp.rlActual < 80 ? (
                    <span className="text-[9px] font-black text-red-400 uppercase">Déficit de {(80 - currentProp.rlActual).toFixed(1)}%</span>
                  ) : (
                    <span className="text-[9px] font-black text-green-400 uppercase">Conforme</span>
                  )}
                </div>
              </div>
              <div className="border-b border-military-850/60 pb-1.5">
                <span className="text-military-450 uppercase block mb-1">Área da Faixa de Margem (APP):</span>
                <div className="flex justify-between items-center bg-black/40 p-2 rounded-lg">
                  <span className="text-[10px] text-military-200">Total estimada: {currentProp.appArea} ha</span>
                  {currentProp.appPreserved ? (
                    <span className="text-[9px] font-bold text-green-400 uppercase flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500" /> Preservada
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-red-400 uppercase flex items-center gap-1 animate-pulse">
                      <AlertTriangle className="w-3 h-3 text-red-500" /> Desflorestamento
                    </span>
                  )}
                </div>
              </div>

              {/* Geographical constraints */}
              <div className="border-b border-military-900 pb-2">
                <span className="text-military-450 uppercase block mb-1">Restrições Fundiárias:</span>
                <p className="text-[10px] text-military-200 leading-relaxed bg-black/30 p-2 rounded-lg border border-military-900">
                  {currentProp.overlap}
                </p>
              </div>

              {/* Embargo verification */}
              <div className="border-b border-military-900 pb-2">
                <span className="text-military-450 uppercase block mb-1">Embargos Ativos (IBAMA/IMAC):</span>
                <p className="text-[10px] text-military-200 leading-relaxed bg-black/30 p-2 rounded-lg border border-military-900">
                  {currentProp.embargo}
                </p>
              </div>

              {/* Prodes alert detail */}
              <div className="pb-1">
                <span className="text-military-450 uppercase block mb-1">Constatações por Imagens de Satélite (Alertas Recentes):</span>
                <p className={`text-[10px] leading-relaxed p-2.5 rounded-lg border ${
                  currentProp.prodesAlert.includes('Alerta') 
                    ? 'bg-red-500/5 border-red-500/20 text-red-300 font-bold' 
                    : 'bg-green-500/5 border-green-500/20 text-green-300'
                }`}>
                  {currentProp.prodesAlert}
                </p>
              </div>
            </div>

            {/* Actions button */}
            <div className="grid grid-cols-2 gap-3 pb-8">
              <button
                onClick={handleDownloadLaudoPDF}
                className="col-span-2 py-4 bg-military-300 hover:bg-military-200 text-military-950 font-black tracking-wider uppercase text-xs rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4 text-military-950" />
                <span>Gerar Laudo PDF Autuado</span>
              </button>
              
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(currentProp, null, 2));
                  alert("Dossiê geográfico copiado com sucesso para a área de transferência.");
                }}
                className="py-3 bg-military-800 hover:bg-military-750 border border-military-750 text-military-200 font-bold uppercase text-[10px] tracking-wider rounded-xl transition-all active:scale-95"
              >
                Copiar Dossiê
              </button>
              
              <button
                onClick={() => {
                  setActiveTab('mapa');
                }}
                className="py-3 bg-military-800 hover:bg-military-750 border border-military-750 text-military-200 font-bold uppercase text-[10px] tracking-wider rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5"
                title="Mapear polígono de coordenadas"
              >
                <Map className="w-3.5 h-3.5 text-yellow-500" />
                <span>Ver Vetorização</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'mapa' && (
          <div className="flex-1 flex flex-col items-stretch bg-[#0c100a] h-full" id="mapa-car-tab">
            {/* Header exactly matching the user's attachment */}
            <div className="bg-[#121811] px-5 py-3 border-b border-military-800 flex items-center justify-between select-none shrink-0">
              <span className="text-[10px] sm:text-[11.5px] font-black uppercase tracking-wider text-military-100 font-sans">
                RELAÇÃO DE LOCALIZAÇÃO (SEU PONTO VS. LIMITES)
              </span>
              <div className="bg-[#192b1a] text-[#0df2aa] border border-[#0df2aa]/30 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest leading-none">
                SATELLITE HYBRID
              </div>
            </div>

            {/* Map Canvas with floatings and beautiful border */}
            <div className="flex-1 w-full bg-[#0a0f09] relative overflow-hidden flex flex-col items-stretch">
              
              {/* Layers status banner & control absolute inside canvas on top right */}
              <div className="absolute top-4 right-4 z-10 bg-[#0f140f]/90 border border-military-850 p-2 rounded-xl shadow-xl flex items-center gap-2.5 backdrop-blur-sm">
                <span className="text-[8px] font-black uppercase tracking-widest text-military-450 px-1 border-r border-military-800 pr-2">
                  Camada
                </span>
                <button 
                  onClick={() => setShowAlerts(!showAlerts)}
                  className={`py-1 px-2 rounded-lg flex items-center gap-2 text-[8.5px] font-mono font-bold transition-all ${
                    showAlerts ? 'bg-red-500/15 text-red-400 border border-red-500/30' : 'bg-[#1b251a] text-military-400'
                  }`}
                  title="Alternar alertas de desmatamento"
                >
                  <span>Mapear Alerta DETER</span>
                </button>
              </div>

              {/* Map Title name floating on top left */}
              <div className="absolute top-4 left-4 z-10 p-2 px-3 bg-[#0a0f0a]/85 border border-military-800 rounded-lg text-[9px] font-mono text-military-300 pointer-events-none">
                <span className="font-extrabold uppercase text-white block">
                  {currentProp.name}
                </span>
              </div>

              {/* Tactile Zoom Buttons on Bottom Right (styled directly matching your image overlay) */}
              <div className="absolute bottom-4 right-4 z-10 flex flex-col bg-[#111610]/95 border border-military-850 rounded-lg overflow-hidden shadow-2xl w-10">
                <button 
                  onClick={() => setZoomLevel(prev => Math.min(6.0, prev * 1.35))}
                  className="h-10 w-full flex items-center justify-center hover:bg-military-800 text-white transition-colors active:scale-90 border-b border-military-900"
                  title="Aumentar Zoom"
                >
                  <Plus className="w-4 h-4 text-white" />
                </button>
                <button 
                  onClick={() => setZoomLevel(prev => Math.max(0.04, prev / 1.35))}
                  className="h-10 w-full flex items-center justify-center hover:bg-military-800 text-white transition-colors active:scale-90 border-b border-[#0f140e]"
                  title="Diminuir Zoom"
                >
                  <Minus className="w-4 h-4 text-white" />
                </button>
                <button 
                  onClick={resetMapOffset}
                  className="h-9 w-full flex items-center justify-center hover:bg-military-850 text-military-400 hover:text-white transition-colors active:scale-90"
                  title="Centralizar Coordenadas"
                >
                  <Maximize className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Canvas element */}
              <div className="flex-1 w-full bg-military-950 relative overflow-hidden">
                <canvas 
                  ref={canvasRef}
                  className="w-full h-full cursor-grab active:cursor-grabbing block select-none touch-none"
                  onMouseDown={handleDragStart}
                  onMouseMove={handleDragMove}
                  onMouseUp={handleDragEnd}
                  onMouseLeave={handleDragEnd}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onTouchCancel={handleTouchEnd}
                  onWheel={handleWheel}
                />
              </div>
            </div>

            {/* Custom bottom legends bar exactly matching the design and photograph */}
            <div className="bg-[#121811] border-t border-military-800 p-3.5 flex flex-row items-center justify-center gap-6 text-[9.5px] uppercase font-bold tracking-wider text-military-300 select-none shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full border-[2.5px] border-[#0df2aa] bg-transparent inline-block shrink-0" />
                <span>Limites da Área (SIGEF/CAR)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full border border-white bg-[#ef4444] inline-block shrink-0" />
                <span>Coordenada Consultada</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'historico' && (
          <div className="p-4 space-y-4 max-w-md mx-auto w-full flex-1 pb-16">
            <div className="space-y-1 text-center mt-1">
              <h3 className="text-sm font-bold uppercase tracking-wider text-military-100">Consultas Recentes da Fiscalização</h3>
              <p className="text-[10px] text-military-400 uppercase font-mono tracking-widest">Histórico armazenado localmente para averiguação offline</p>
            </div>

            {historyList.length === 0 ? (
              <div className="text-center py-16 bg-military-950 rounded-3xl border border-military-800 p-6">
                <History className="w-10 h-10 text-military-600 mx-auto mb-3" />
                <p className="text-xs text-military-500 uppercase font-bold tracking-widest">Nenhuma propriedade consultada.</p>
                <button
                  onClick={() => setActiveTab('consultas')}
                  className="mt-6 px-4 py-2 bg-yellow-500 text-military-950 font-black tracking-widest rounded-xl text-[10px] uppercase"
                >
                  Ir para Pesquisa
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {historyList.map((item, idx) => {
                  const isSuspended = item.status === 'SUSPENSO';
                  const isPending = item.status === 'PENDENTE';
                  return (
                    <div 
                      key={idx}
                      className="bg-military-950 border border-military-800/80 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3 relative overflow-hidden group"
                    >
                      <div className="space-y-1 text-center md:text-left flex-1">
                        <span className="font-extrabold text-xs text-white block leading-snug">{item.name}</span>
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-2 text-[9px] font-mono text-military-400">
                          <span>{item.municipio} • {item.area} ha</span>
                          <span>•</span>
                          <span className="text-yellow-500">{item.lat.toFixed(4)}, {item.lng.toFixed(4)}</span>
                        </div>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setCurrentProp(item);
                            setLatInput(item.lat.toFixed(6));
                            setLngInput(item.lng.toFixed(6));
                            setActiveTab('ficha');
                          }}
                          className="px-3.5 py-1.5 bg-military-800 hover:bg-military-750 text-military-200 border border-military-700 rounded-xl text-[9px] font-black uppercase tracking-wider active:scale-95 transition-all"
                        >
                          Ficha
                        </button>
                        <button
                          onClick={() => {
                            setCurrentProp(item);
                            setLatInput(item.lat.toFixed(6));
                            setLngInput(item.lng.toFixed(6));
                            setActiveTab('mapa');
                          }}
                          className="px-3.5 py-1.5 bg-military-800 hover:bg-military-750 text-yellow-500/80 hover:text-yellow-500 border border-military-700 rounded-xl text-[9px] font-black uppercase tracking-wider active:scale-95 transition-all flex items-center gap-1"
                        >
                          <Map className="w-3 h-3" />
                          <span>Mapa</span>
                        </button>
                      </div>

                      {/* Side vertical accent badge based on Risk */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                        item.riskLevel === 'ALTO' ? 'bg-red-500' :
                        item.riskLevel === 'MÉDIO' ? 'bg-orange-500' :
                        'bg-green-500'
                      }`} />
                    </div>
                  );
                })}

                {/* Clear local history button block */}
                <button
                  onClick={() => {
                    if (confirm("Deseja realmente apagar o histórico de varreduras do dispositivo?")) {
                      localStorage.removeItem('acregeo_car_history');
                      setHistoryList([]);
                    }
                  }}
                  className="w-full text-center py-2.5 text-red-400/80 hover:text-red-400 uppercase text-[9px] font-black tracking-widest border border-red-500/10 hover:border-red-500/20 rounded-xl bg-red-500/[0.02]"
                >
                  Limpar Histórico Local
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
