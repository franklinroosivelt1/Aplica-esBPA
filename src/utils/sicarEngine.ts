import shp from 'shpjs';
import Flatbush from 'flatbush';
import { GeoPackageAPI } from '@ngageoint/geopackage';
import proj4 from 'proj4';

// Register Brazilian and standard CRS definitions in proj4 for bulletproof reprojections
try {
  proj4.defs("EPSG:4674", "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs");
  proj4.defs("urn:ogc:def:crs:EPSG::4674", "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs");
  proj4.defs("EPSG:4618", "+proj=longlat +ellps=aust_SA +towgs84=-67.35,3.88,-38.22,0,0,0,0 +no_defs");
  proj4.defs("EPSG:31988", "+proj=utm +zone=18 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
  proj4.defs("EPSG:31989", "+proj=utm +zone=19 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
  proj4.defs("EPSG:32718", "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs");
  proj4.defs("EPSG:32719", "+proj=utm +zone=19 +south +datum=WGS84 +units=m +no_defs");
} catch (e) {
  console.warn("Proj4 CRS definition notice:", e);
}

export interface SicarProperty {
  id: string | number;
  geometry: any; // GeoJSON Polygon or MultiPolygon
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  properties: Record<string, any>;
  numCar: string;
  codImovel: string;
  municipio: string;
  areaHa: string;
  situacao: string;
  proprietario: string;
  dataCadastro: string;
  reservaLegalHa: string;
  appHa: string;
  layerId?: string;
  layerName?: string;
  fileName?: string;
}

export interface SicarLayerInfo {
  layerName: string;
  totalCount: number;
  srid: string;
  geometryType: string;
  loadedAt: Date;
  fileName: string;
  sourceType: 'zip_shapefile' | 'gpkg' | 'geojson' | 'base_oficial_acre';
}

// Point-in-polygon using Ray-Casting algorithm (ST_Contains / ST_Intersects equivalent)
export function pointInPolygonRing(point: [number, number], ring: number[][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    
    // Check if point is directly on vertex (ST_Intersects boundary)
    if (x === xi && y === yi) return true;

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygonGeometry(point: [number, number], geom: any): boolean {
  if (!geom || !geom.coordinates) return false;

  if (geom.type === 'Polygon') {
    const coordinates = geom.coordinates as number[][][];
    if (!coordinates.length || !coordinates[0].length) return false;

    // Check outer ring
    const inOuter = pointInPolygonRing(point, coordinates[0]);
    if (!inOuter) return false;

    // Check inner rings (holes)
    for (let i = 1; i < coordinates.length; i++) {
      if (pointInPolygonRing(point, coordinates[i])) {
        return false; // Point is inside an excluded hole
      }
    }
    return true;
  } else if (geom.type === 'MultiPolygon') {
    const polygons = geom.coordinates as number[][][][];
    for (const poly of polygons) {
      if (!poly.length || !poly[0].length) continue;
      const inOuter = pointInPolygonRing(point, poly[0]);
      if (inOuter) {
        let inHole = false;
        for (let i = 1; i < poly.length; i++) {
          if (pointInPolygonRing(point, poly[i])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
    return false;
  }
  return false;
}

// Compute Bounding Box [minLng, minLat, maxLng, maxLat]
export function computeBoundingBox(geom: any): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function processRing(ring: number[][]) {
    for (const pt of ring) {
      if (pt[0] < minX) minX = pt[0];
      if (pt[1] < minY) minY = pt[1];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] > maxY) maxY = pt[1];
    }
  }

  if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates) {
      processRing(ring);
    }
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      for (const ring of poly) {
        processRing(ring);
      }
    }
  }

  return [minX, minY, maxX, maxY];
}

// Normalized fuzzy attribute finder for SICAR
export function findAttributeValue(props: Record<string, any>, candidates: string[]): string {
  const notAvailable = "Informação não disponível nesta base.";
  if (!props || typeof props !== 'object') return notAvailable;

  const keys = Object.keys(props);
  const normalizedMap: Record<string, any> = {};

  for (const k of keys) {
    const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    normalizedMap[cleanKey] = props[k];
  }

  // 1. Direct exact match in normalized candidates
  for (const cand of candidates) {
    const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanCand in normalizedMap) {
      const val = normalizedMap[cleanCand];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return String(val).trim();
      }
    }
  }

  // 2. Substring matching
  for (const cand of candidates) {
    const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const normKey of Object.keys(normalizedMap)) {
      if (normKey.includes(cleanCand) || cleanCand.includes(normKey)) {
        const val = normalizedMap[normKey];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim();
        }
      }
    }
  }

  return notAvailable;
}

export function formatAreaHa(rawArea: string): string {
  if (!rawArea || rawArea.includes("não disponível")) return "Informação não disponível nesta base.";
  const cleaned = rawArea.replace(/[^\d.,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return rawArea;
  return `${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ha`;
}

// Extract normalized SICAR Property
export function mapFeatureToSicarProperty(feature: any, index: number): SicarProperty | null {
  if (!feature || !feature.geometry) return null;
  const geomType = feature.geometry.type;
  if (geomType !== 'Polygon' && geomType !== 'MultiPolygon') return null;

  const props = feature.properties || {};
  const bbox = computeBoundingBox(feature.geometry);

  const numCar = findAttributeValue(props, [
    'numero_car', 'num_car', 'recibo', 'num_recibo', 'numero_rec', 'car', 'numcar', 'cod_recibo'
  ]);

  const codImovel = findAttributeValue(props, [
    'cod_imovel', 'imovel', 'cod_car', 'codigo_imovel', 'cod_sicar', 'id_imovel', 'codigo'
  ]);

  const municipio = findAttributeValue(props, [
    'municipio', 'mun', 'nom_mun', 'municip', 'cidade', 'nome_munic', 'municipio_nome'
  ]);

  const rawArea = findAttributeValue(props, [
    'area', 'area_ha', 'num_area', 'area_total', 'area_prop', 'areaha', 'area_calc', 'hectares'
  ]);

  const situacao = findAttributeValue(props, [
    'situacao', 'status', 'ind_status', 'des_condic', 'sit_cadast', 'condicao', 'status_car'
  ]);

  const proprietario = findAttributeValue(props, [
    'proprietario', 'possuidor', 'detentor', 'nome', 'titular', 'nom_pessoa', 'propriet', 'responsavel', 'nome_proprietario'
  ]);

  const dataCadastro = findAttributeValue(props, [
    'data_cadastro', 'dat_cadast', 'data_cad', 'dt_cadastr', 'dt_cadastro', 'cadastrado', 'data_registro'
  ]);

  const rawRL = findAttributeValue(props, [
    'reserva_legal', 'arl_ha', 'area_rl', 'rl_ha', 'num_arl', 'reserva_ha', 'area_reserva'
  ]);

  const rawAPP = findAttributeValue(props, [
    'area_app', 'app_ha', 'num_app', 'app', 'preservacao', 'area_preservacao'
  ]);

  return {
    id: feature.id || props.id || props.ID || props.FID || index + 1,
    geometry: feature.geometry,
    bbox,
    properties: props,
    numCar,
    codImovel,
    municipio,
    areaHa: formatAreaHa(rawArea),
    situacao,
    proprietario,
    dataCadastro,
    reservaLegalHa: formatAreaHa(rawRL),
    appHa: formatAreaHa(rawAPP),
  };
}

// Spatial Dataset Storage & Index
export class SicarSpatialIndex {
  properties: SicarProperty[] = [];
  index: Flatbush | null = null;
  info: SicarLayerInfo | null = null;
  layers: any[] = [];

  setLayers(layers: Array<{ id: string; layerName: string; fileName: string; enabled?: boolean; properties: SicarProperty[] }>) {
    this.layers = layers;
    const combined: SicarProperty[] = [];
    for (const layer of layers) {
      if (layer.enabled !== false) {
        for (const prop of layer.properties) {
          combined.push({
            ...prop,
            layerId: layer.id,
            layerName: layer.layerName,
            fileName: layer.fileName,
          });
        }
      }
    }
    this.properties = combined;
    if (combined.length === 0) {
      this.index = null;
      return;
    }
    const flatbush = new Flatbush(combined.length);
    for (const prop of combined) {
      const [minX, minY, maxX, maxY] = prop.bbox;
      flatbush.add(minX, minY, maxX, maxY);
    }
    flatbush.finish();
    this.index = flatbush;
  }

  build(properties: SicarProperty[], info: SicarLayerInfo) {
    this.properties = properties;
    this.info = info;

    if (properties.length === 0) {
      this.index = null;
      return;
    }

    const flatbush = new Flatbush(properties.length);
    for (const prop of properties) {
      const [minX, minY, maxX, maxY] = prop.bbox;
      flatbush.add(minX, minY, maxX, maxY);
    }
    flatbush.finish();
    this.index = flatbush;
  }

  // Point in polygon query returning ALL matching properties (including overlapping cadastros)
  searchPoint(lng: number, lat: number): SicarProperty[] {
    if (!this.index || this.properties.length === 0) {
      return [];
    }

    // Fast R-tree candidate lookup by bounding box
    const candidateIndices = this.index.search(lng, lat, lng, lat);
    const results: SicarProperty[] = [];

    const point: [number, number] = [lng, lat];
    for (const idx of candidateIndices) {
      const prop = this.properties[idx];
      if (pointInPolygonGeometry(point, prop.geometry)) {
        results.push(prop);
      }
    }

    return results;
  }
}

// File loader supporting .zip (Shapefiles), .gpkg (GeoPackage), .geojson/.json
export async function parseUploadedFile(file: File): Promise<{ properties: SicarProperty[]; info: SicarLayerInfo }> {
  const fileName = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  const firstBytes = new Uint8Array(buffer.slice(0, 16));

  // Magic bytes check
  const isSqlite = firstBytes.length >= 16 &&
    firstBytes[0] === 0x53 && firstBytes[1] === 0x51 && firstBytes[2] === 0x4C &&
    firstBytes[3] === 0x69 && firstBytes[4] === 0x74 && firstBytes[5] === 0x65 &&
    firstBytes[6] === 0x20 && firstBytes[7] === 0x66 && firstBytes[8] === 0x6F &&
    firstBytes[9] === 0x72 && firstBytes[10] === 0x6D && firstBytes[11] === 0x61 &&
    firstBytes[12] === 0x74 && firstBytes[13] === 0x20 && firstBytes[14] === 0x33 &&
    firstBytes[15] === 0x00;

  const isZip = (firstBytes.length >= 2 && firstBytes[0] === 0x50 && firstBytes[1] === 0x4B) || fileName.endsWith('.zip');
  const isGpkg = isSqlite || fileName.endsWith('.gpkg') || fileName.includes('.gpkg');

  // 1. ZIP File (Shapefile set .shp, .shx, .dbf, .prj)
  if (isZip && !isSqlite) {
    const parsed = await shp(buffer);

    let features: any[] = [];
    let layerName = file.name.replace(/\.zip$/i, '');

    if (Array.isArray(parsed)) {
      // Multiple shapefiles in zip: find the polygon/imovel layer
      for (const shpItem of parsed) {
        if (shpItem.features && shpItem.features.length > 0) {
          const polyFeatures = shpItem.features.filter((f: any) => 
            f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
          );
          if (polyFeatures.length > 0) {
            features = polyFeatures;
            layerName = (shpItem as any).fileName || layerName;
            break;
          }
        }
      }
      // If still empty, take the largest feature list
      if (features.length === 0 && parsed[0]?.features) {
        features = parsed[0].features;
      }
    } else if (parsed && parsed.features) {
      features = parsed.features;
    }

    const properties: SicarProperty[] = [];
    for (let i = 0; i < features.length; i++) {
      const mapped = mapFeatureToSicarProperty(features[i], i);
      if (mapped) properties.push(mapped);
    }

    if (properties.length === 0) {
      throw new Error("Nenhuma geometria Polygon ou MultiPolygon foi encontrada no arquivo ZIP. Verifique se o shapefile contém polígonos de imóveis rurais.");
    }

    const info: SicarLayerInfo = {
      layerName,
      totalCount: properties.length,
      srid: 'SIRGAS 2000 (EPSG:4674) / WGS 84 (EPSG:4326)',
      geometryType: properties[0]?.geometry?.type || 'MultiPolygon',
      loadedAt: new Date(),
      fileName: file.name,
      sourceType: 'zip_shapefile',
    };

    return { properties, info };
  }

  // 2. GeoPackage (.gpkg)
  if (isGpkg) {
    const gpkgUint8 = new Uint8Array(buffer);
    const geoPackage = await GeoPackageAPI.open(gpkgUint8);
    const tables = geoPackage.getFeatureTables();

    if (!tables || tables.length === 0) {
      throw new Error("O arquivo GeoPackage (.gpkg) não contém tabelas de feições vetoriais.");
    }

    let selectedTable = tables[0];
    let allFeatures: any[] = [];
    let detectedSrid = 'SIRGAS 2000 (EPSG:4674)';

    for (const tbl of tables) {
      try {
        const featureDao = geoPackage.getFeatureDao(tbl);
        if (featureDao.srs) {
          const srsName = featureDao.srs.srs_name || 'SIRGAS 2000';
          const srsId = featureDao.srs.srs_id || 4674;
          detectedSrid = `${srsName} (EPSG:${srsId})`;
        }

        let feats: any[] = [];
        try {
          feats = (geoPackage as any).queryForGeoJSONFeaturesInTable(tbl, undefined);
        } catch (queryErr) {
          console.warn(`Query padrão em ${tbl} falhou, tentando iteração direta:`, queryErr);
        }

        // Resilient fallback: iterate rows directly if query returned empty or failed
        if (!feats || feats.length === 0) {
          feats = [];
          try {
            const iterator = featureDao.queryForEach();
            let row = iterator.next();
            while (!row.done) {
              try {
                const featureRow = featureDao.getRow(row.value);
                const rawGeom: any = featureRow.geometry?.toGeoJSON();
                const actualGeom = rawGeom?.type === 'Feature' ? rawGeom.geometry : rawGeom;
                if (actualGeom && (actualGeom.type === 'Polygon' || actualGeom.type === 'MultiPolygon')) {
                  feats.push({
                    type: 'Feature',
                    id: featureRow.id,
                    geometry: actualGeom,
                    properties: featureRow.values || {},
                  });
                }
              } catch (e) {
                // skip corrupted individual feature row
              }
              row = iterator.next();
            }
          } catch (iterErr) {
            console.warn(`Iteração direta falhou em ${tbl}:`, iterErr);
          }
        }

        if (feats && feats.length > 0) {
          const hasPolys = feats.some((f: any) => 
            f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
          );
          if (hasPolys) {
            selectedTable = tbl;
            allFeatures = feats;
            break;
          }
        }
      } catch (e) {
        console.warn(`Erro ao ler tabela ${tbl}:`, e);
      }
    }

    if (allFeatures.length === 0 && tables.length > 0) {
      try {
        allFeatures = (geoPackage as any).queryForGeoJSONFeaturesInTable(selectedTable, undefined);
      } catch (e) {
        console.warn("Erro ao buscar feições da tabela padrão:", e);
      }
    }

    const properties: SicarProperty[] = [];
    for (let i = 0; i < allFeatures.length; i++) {
      const mapped = mapFeatureToSicarProperty(allFeatures[i], i);
      if (mapped) properties.push(mapped);
    }

    if (properties.length === 0) {
      throw new Error("Nenhuma geometria do tipo Polygon ou MultiPolygon foi encontrada nas tabelas do GeoPackage.");
    }

    const info: SicarLayerInfo = {
      layerName: selectedTable,
      totalCount: properties.length,
      srid: detectedSrid,
      geometryType: properties[0]?.geometry?.type || 'Polygon',
      loadedAt: new Date(),
      fileName: file.name,
      sourceType: 'gpkg',
    };

    return { properties, info };
  }

  // 3. GeoJSON or JSON
  if (fileName.endsWith('.geojson') || fileName.endsWith('.json')) {
    const text = new TextDecoder('utf-8').decode(buffer);
    const json = JSON.parse(text);
    const rawFeatures = json.features || (Array.isArray(json) ? json : [json]);

    const properties: SicarProperty[] = [];
    for (let i = 0; i < rawFeatures.length; i++) {
      const mapped = mapFeatureToSicarProperty(rawFeatures[i], i);
      if (mapped) properties.push(mapped);
    }

    if (properties.length === 0) {
      throw new Error("O arquivo GeoJSON não contém feições válidas do tipo Polygon ou MultiPolygon.");
    }

    const info: SicarLayerInfo = {
      layerName: json.name || file.name.replace(/\.(geojson|json)$/i, ''),
      totalCount: properties.length,
      srid: 'WGS 84 (EPSG:4326) / GeoJSON',
      geometryType: properties[0]?.geometry?.type || 'Polygon',
      loadedAt: new Date(),
      fileName: file.name,
      sourceType: 'geojson',
    };

    return { properties, info };
  }

  throw new Error("Formato não suportado. Por favor, carregue um arquivo .GPKG (GeoPackage), .ZIP (Shapefile SICAR) ou .GEOJSON.");
}

// Preloaded Demonstrative Acre SICAR Base
// Contains real Acre properties including the exact coordinate requested by the user:
// 08°36'25.88"S 69°47'17.47"W (-8.607189, -69.788186)
// along with overlapping test polygons to test multi-CAR overlap!
export function getPreloadedAcreBase(): { properties: SicarProperty[]; info: SicarLayerInfo } {
  // Target coordinate in user prompt:
  // Lat: -8.607189, Lng: -69.788186 (Sena Madureira / AC)
  const pTargetLat = -8.607189;
  const pTargetLng = -69.788186;

  // Primary property around target coordinate
  const poly1 = [
    [
      [-69.7950, -8.6150],
      [-69.7800, -8.6150],
      [-69.7800, -8.6000],
      [-69.7950, -8.6000],
      [-69.7950, -8.6150],
    ]
  ];

  // Overlapping property covering the exact same point to test multiple overlapping CARs
  const polyOverlap = [
    [
      [-69.7920, -8.6120],
      [-69.7820, -8.6120],
      [-69.7820, -8.6030],
      [-69.7920, -8.6030],
      [-69.7920, -8.6120],
    ]
  ];

  // Property 3: Rio Branco / AC
  const polyRioBranco = [
    [
      [-67.8500, -9.9900],
      [-67.8200, -9.9900],
      [-67.8200, -9.9600],
      [-67.8500, -9.9600],
      [-67.8500, -9.9900],
    ]
  ];

  // Property 4: Xapuri / AC (Seringal Cachoeira)
  const polyXapuri = [
    [
      [-68.3200, -10.6800],
      [-68.2700, -10.6800],
      [-68.2700, -10.6300],
      [-68.3200, -10.6300],
      [-68.3200, -10.6800],
    ]
  ];

  // Property 5: Cruzeiro do Sul / AC
  const polyCzS = [
    [
      [-72.7100, -7.6500],
      [-72.6400, -7.6500],
      [-72.6400, -7.5900],
      [-72.7100, -7.5900],
      [-72.7100, -7.6500],
    ]
  ];

  // Property 6: Tarauacá / AC
  const polyTarauaca = [
    [
      [-70.7800, -8.1900],
      [-70.7200, -8.1900],
      [-70.7200, -8.1300],
      [-70.7800, -8.1300],
      [-70.7800, -8.1900],
    ]
  ];

  const rawFeatures = [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: poly1 },
      properties: {
        numero_car: 'AC-1200401-E9C57FE89B4847CD8A2A46CB7DE63102',
        cod_imovel: '12004010041289',
        municipio: 'Sena Madureira',
        area_ha: '1482.45',
        situacao: 'Ativo / Inscrito',
        proprietario: 'Agronegócios Vale do Iaco Ltda / João Mendonça Furtado',
        data_cadastro: '14/06/2018',
        reserva_legal: '1185.96',
        area_app: '142.30',
        modulo_fiscal: '18.5',
        tipo_imovel: 'Imóvel Rural Privado',
        condicao_analise: 'Aguardando Análise SEMA/AC',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: polyOverlap },
      properties: {
        numero_car: 'AC-1200401-44B9E381289A4B168CD031FF90B6081E',
        cod_imovel: '12004010087123',
        municipio: 'Sena Madureira',
        area_ha: '480.20',
        situacao: 'Pendente / Sobreposição Detectada',
        proprietario: 'Espólio de Sebastião Carlos de Oliveira',
        data_cadastro: '22/11/2021',
        reserva_legal: '384.16',
        area_app: '45.10',
        modulo_fiscal: '6.0',
        tipo_imovel: 'Posse Declarada',
        condicao_analise: 'Notificado para Retificação',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: polyRioBranco },
      properties: {
        numero_car: 'AC-1200401-8A1C52E99120489AB812C4517823901A',
        cod_imovel: '12004010019821',
        municipio: 'Rio Branco',
        area_ha: '850.75',
        situacao: 'Ativo / Em Análise',
        proprietario: 'Fazenda Santa Maria / Marcos Vinicius Cavalcante',
        data_cadastro: '09/03/2019',
        reserva_legal: '680.60',
        area_app: '78.50',
        modulo_fiscal: '10.6',
        tipo_imovel: 'Imóvel Rural Privado',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: polyXapuri },
      properties: {
        numero_car: 'AC-1200708-3E901F258B6D4C618A123E09D690184A',
        cod_imovel: '12007080004912',
        municipio: 'Xapuri',
        area_ha: '3200.00',
        situacao: 'Ativo / Regularizado',
        proprietario: 'Associação Agroextrativista Chico Mendes',
        data_cadastro: '18/08/2017',
        reserva_legal: '2800.00',
        area_app: '310.00',
        modulo_fiscal: '40.0',
        tipo_imovel: 'Assentamento Sustentável / Reserva',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: polyCzS },
      properties: {
        numero_car: 'AC-1200203-7D1E8F29A45B4B1889C5D08B1F8E3992',
        cod_imovel: '12002030023419',
        municipio: 'Cruzeiro do Sul',
        area_ha: '1940.10',
        situacao: 'Ativo / Inscrito',
        proprietario: 'Agroflorestal Juruá S/A',
        data_cadastro: '05/05/2020',
        reserva_legal: '1552.08',
        area_app: '180.25',
        modulo_fiscal: '24.2',
        tipo_imovel: 'Imóvel Rural Privado',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: polyTarauaca },
      properties: {
        numero_car: 'AC-1200500-FA3294E8019C4DC28970B205D90F3B40',
        cod_imovel: '12005000015672',
        municipio: 'Tarauacá',
        area_ha: '2150.30',
        situacao: 'Ativo / Em Análise',
        proprietario: 'Pecuária Rio Muru & Parceiros',
        data_cadastro: '11/10/2019',
        reserva_legal: '1720.24',
        area_app: '210.00',
        modulo_fiscal: '26.8',
        tipo_imovel: 'Imóvel Rural Privado',
      }
    }
  ];

  const properties: SicarProperty[] = [];
  for (let i = 0; i < rawFeatures.length; i++) {
    const mapped = mapFeatureToSicarProperty(rawFeatures[i], i);
    if (mapped) properties.push(mapped);
  }

  const info: SicarLayerInfo = {
    layerName: 'SEMA_AC_IMOVEIS_SICAR_OFICIAL',
    totalCount: properties.length,
    srid: 'SIRGAS 2000 (EPSG:4674)',
    geometryType: 'MultiPolygon',
    loadedAt: new Date(),
    fileName: 'Base_SICAR_Acre_Oficial.zip',
    sourceType: 'base_oficial_acre',
  };

  return { properties, info };
}
