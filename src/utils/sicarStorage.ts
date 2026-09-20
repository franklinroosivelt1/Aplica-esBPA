import { SicarProperty, SicarLayerInfo } from './sicarEngine';

export interface SicarLayer {
  id: string;
  layerName: string;
  fileName: string;
  fileSize?: number;
  totalCount: number;
  srid: string;
  geometryType: string;
  loadedAt: string;
  enabled: boolean;
  properties: SicarProperty[];
}

const DB_NAME = 'bpa_sicar_layers_db';
const DB_VERSION = 1;
const STORE_LAYERS = 'layers';

// In-memory cache singleton to guarantee instant 0ms restoration
// when the user navigates between views (e.g. going back to view documents and returning)
let memoryLayersCache: SicarLayer[] | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error("IndexedDB não está disponível neste ambiente."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_LAYERS)) {
        db.createObjectStore(STORE_LAYERS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error("Falha ao abrir o banco IndexedDB"));
    };
  });
}

/**
 * Retrieve all stored layers. Checks in-memory cache first for instant response,
 * falling back to persistent IndexedDB storage.
 */
export async function getStoredLayers(): Promise<SicarLayer[]> {
  if (memoryLayersCache !== null && memoryLayersCache.length > 0) {
    return memoryLayersCache;
  }

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_LAYERS, 'readonly');
      const store = transaction.objectStore(STORE_LAYERS);
      const request = store.getAll();

      request.onsuccess = () => {
        const layers = (request.result as SicarLayer[]) || [];
        memoryLayersCache = layers;
        resolve(layers);
      };

      request.onerror = () => {
        console.warn("Erro ao ler camadas do IndexedDB:", request.error);
        resolve(memoryLayersCache || []);
      };
    });
  } catch (err) {
    console.warn("IndexedDB indisponível, usando cache em memória:", err);
    return memoryLayersCache || [];
  }
}

/**
 * Save or update a layer persistently in IndexedDB and in-memory cache.
 */
export async function saveLayer(layer: SicarLayer): Promise<void> {
  // Update in-memory cache immediately
  if (!memoryLayersCache) {
    memoryLayersCache = [];
  }
  const existingIdx = memoryLayersCache.findIndex(l => l.id === layer.id);
  if (existingIdx >= 0) {
    memoryLayersCache[existingIdx] = layer;
  } else {
    memoryLayersCache.push(layer);
  }

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_LAYERS, 'readwrite');
      const store = transaction.objectStore(STORE_LAYERS);
      const request = store.put(layer);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("Não foi possível persistir no IndexedDB (mantido em memória):", err);
  }
}

/**
 * Delete a specific layer by ID from IndexedDB and in-memory cache.
 */
export async function deleteLayer(layerId: string): Promise<void> {
  if (memoryLayersCache) {
    memoryLayersCache = memoryLayersCache.filter(l => l.id !== layerId);
  }

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_LAYERS, 'readwrite');
      const store = transaction.objectStore(STORE_LAYERS);
      const request = store.delete(layerId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("Erro ao deletar camada do IndexedDB:", err);
  }
}

/**
 * Clear all layers from IndexedDB and cache.
 */
export async function clearAllLayers(): Promise<void> {
  memoryLayersCache = [];

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_LAYERS, 'readwrite');
      const store = transaction.objectStore(STORE_LAYERS);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("Erro ao limpar camadas do IndexedDB:", err);
  }
}

/**
 * Sets the active in-memory cache (e.g. for testing or reset)
 */
export function setMemoryLayersCache(layers: SicarLayer[]) {
  memoryLayersCache = layers;
}
