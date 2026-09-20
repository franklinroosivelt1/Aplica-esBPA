import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, 
  Shield, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  MapPin, 
  FileText, 
  Download, 
  Layers, 
  Compass, 
  RefreshCw,
  Trash2,
  Plus,
  Crosshair,
  Maximize2
} from 'lucide-react';
import { 
  SicarProperty, 
  SicarLayerInfo, 
  SicarSpatialIndex, 
  parseUploadedFile, 
  getPreloadedAcreBase 
} from '../utils/sicarEngine';
import { 
  SicarLayer, 
  getStoredLayers, 
  saveLayer, 
  deleteLayer, 
  clearAllLayers 
} from '../utils/sicarStorage';
import { 
  ParsedCoordinate, 
  parseCoordinates, 
  decimalToGms 
} from '../utils/gmsParser';
import { SicarMap } from '../components/SicarMap';
import { exportSicarPdf } from '../utils/sicarPdfExport';

interface BpaOperacionalProps {
  onBack: () => void;
}

export default function BpaOperacional({ onBack }: BpaOperacionalProps) {
  // Spatial Index Instance
  const spatialIndexRef = useRef<SicarSpatialIndex>(new SicarSpatialIndex());

  // Base / Layer State - Persistent across screen navigation
  const [layers, setLayers] = useState<SicarLayer[]>([]);
  const [isLoadingBase, setIsLoadingBase] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('Processando...');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Input & Coordinate State
  const [gmsInput, setGmsInput] = useState<string>('08°36\'25.88"S 69°47\'17.47"W');
  const [parsedCoord, setParsedCoord] = useState<ParsedCoordinate | null>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);

  // Search Results State
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<SicarProperty[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | number | null>(null);
  const [showRawAttributes, setShowRawAttributes] = useState(false);

  // Restore persistent layers on mount (IndexedDB + memory cache)
  useEffect(() => {
    let isMounted = true;

    async function initLayers() {
      setIsLoadingBase(true);
      setLoadingMessage('Restaurando bases salvas...');
      try {
        const stored = await getStoredLayers();
        if (!isMounted) return;

        if (stored && stored.length > 0) {
          setLayers(stored);
          spatialIndexRef.current.setLayers(stored);
        } else {
          // If no layers have ever been uploaded, initialize with the Acre demonstrative base
          const { properties, info } = getPreloadedAcreBase();
          const demoLayer: SicarLayer = {
            id: 'demo_acre_sema',
            layerName: info.layerName,
            fileName: info.fileName,
            totalCount: info.totalCount,
            srid: info.srid,
            geometryType: info.geometryType,
            loadedAt: new Date().toISOString(),
            enabled: true,
            properties,
          };
          setLayers([demoLayer]);
          spatialIndexRef.current.setLayers([demoLayer]);
        }
      } catch (e) {
        console.warn("Falha ao restaurar camadas do armazenamento:", e);
      } finally {
        if (isMounted) setIsLoadingBase(false);
      }
    }

    initLayers();

    // Auto-convert default GMS coordinate
    const converted = parseCoordinates('08°36\'25.88"S 69°47\'17.47"W');
    if (converted) {
      setParsedCoord(converted);
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle File Upload supporting 1, 2 or 3 files simultaneously or sequentially
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList) as File[];
    setIsLoadingBase(true);
    setUploadError(null);
    setUploadSuccessMessage(null);

    const newLayersToAdd: SicarLayer[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        setLoadingMessage(
          files.length > 1
            ? `Processando (${i + 1}/${files.length}): ${file.name} (${sizeMb} MB)...`
            : `Lendo ${file.name} (${sizeMb} MB)...`
        );

        const { properties, info } = await parseUploadedFile(file);
        setLoadingMessage(`Gravando e indexando ${properties.length.toLocaleString('pt-BR')} feições...`);

        const newLayer: SicarLayer = {
          id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          layerName: info.layerName,
          fileName: file.name,
          fileSize: file.size,
          totalCount: properties.length,
          srid: info.srid,
          geometryType: info.geometryType,
          loadedAt: new Date().toISOString(),
          enabled: true,
          properties,
        };

        // Persist to IndexedDB immediately so it's permanent
        await saveLayer(newLayer);
        newLayersToAdd.push(newLayer);
      }

      // Update state: if previous state had only the demonstrative mock base, replace it!
      setLayers(prev => {
        const cleanPrev = prev.filter(l => l.id !== 'demo_acre_sema');
        const combined = [...cleanPrev, ...newLayersToAdd];
        spatialIndexRef.current.setLayers(combined);
        return combined;
      });

      const totalFeaturesAdded = newLayersToAdd.reduce((acc, l) => acc + l.totalCount, 0);
      setUploadSuccessMessage(
        files.length === 1
          ? `Camada "${newLayersToAdd[0].layerName}" adicionada com sucesso! ${totalFeaturesAdded.toLocaleString('pt-BR')} registros salvos no app.`
          : `${files.length} arquivos adicionados com sucesso! +${totalFeaturesAdded.toLocaleString('pt-BR')} feições integradas à busca.`
      );

      // Reset search results for new base
      setSearchResults([]);
      setHasSearched(false);
    } catch (err: any) {
      console.error("Erro ao processar arquivo:", err);
      setUploadError(err.message || "Erro ao processar o(s) arquivo(s) carregado(s).");
    } finally {
      setIsLoadingBase(false);
      setLoadingMessage('Processando...');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Delete a specific layer
  const handleDeleteLayer = async (layerId: string, layerName: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o arquivo/camada "${layerName}"?`)) {
      return;
    }

    try {
      await deleteLayer(layerId);
      setLayers(prev => {
        const remaining = prev.filter(l => l.id !== layerId);
        spatialIndexRef.current.setLayers(remaining);
        return remaining;
      });
      setSearchResults(prev => prev.filter(p => p.layerId !== layerId));
      setUploadSuccessMessage(`Camada "${layerName}" excluída com sucesso.`);
    } catch (err) {
      console.error("Erro ao excluir camada:", err);
      setUploadError("Falha ao excluir a camada.");
    }
  };

  // Load Preloaded Acre Demonstrative Base
  const handleLoadAcreBase = () => {
    setIsLoadingBase(true);
    setLoadingMessage("Carregando base Acre (SEMA)...");
    setUploadError(null);
    setTimeout(() => {
      try {
        const { properties, info } = getPreloadedAcreBase();
        const demoLayer: SicarLayer = {
          id: 'demo_acre_sema',
          layerName: info.layerName,
          fileName: info.fileName,
          totalCount: info.totalCount,
          srid: info.srid,
          geometryType: info.geometryType,
          loadedAt: new Date().toISOString(),
          enabled: true,
          properties,
        };
        setLayers([demoLayer]);
        spatialIndexRef.current.setLayers([demoLayer]);
        setUploadSuccessMessage(
          `Base demonstrativa "${info.layerName}" carregada | ${info.totalCount} imóveis`
        );
        setSearchResults([]);
        setHasSearched(false);
      } catch (e: any) {
        setUploadError("Erro ao carregar a base oficial do Acre.");
      } finally {
        setIsLoadingBase(false);
      }
    }, 150);
  };

  // Handle Coordinate Conversion (GMS -> Decimal)
  const handleConvertCoordinates = () => {
    setConversionError(null);
    const converted = parseCoordinates(gmsInput);
    if (!converted) {
      setConversionError("Formato de coordenada inválido. Utilize um dos formatos aceitos.");
      setParsedCoord(null);
      return;
    }
    setParsedCoord(converted);
  };

  // Get Current Device GPS
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setConversionError("Geolocalização não suportada neste dispositivo.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const latGms = decimalToGms(lat, true);
        const lngGms = decimalToGms(lng, false);
        const gmsString = `${latGms} ${lngGms}`;
        setGmsInput(gmsString);

        const converted = parseCoordinates(gmsString);
        if (converted) {
          setParsedCoord(converted);
          setConversionError(null);
        }
      },
      (err) => {
        setConversionError(`Erro ao obter GPS: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Execute Point In Polygon Spatial Query across ALL loaded layers
  const handleBuscarCar = () => {
    let target = parsedCoord;
    if (!target) {
      target = parseCoordinates(gmsInput);
      if (target) {
        setParsedCoord(target);
      } else {
        setConversionError("Converta uma coordenada válida antes de realizar a busca.");
        return;
      }
    }

    setIsSearching(true);
    setConversionError(null);

    setTimeout(() => {
      try {
        const results = spatialIndexRef.current.searchPoint(target!.lng, target!.lat);
        setSearchResults(results);
        setHasSearched(true);
        if (results.length > 0) {
          setSelectedPropertyId(results[0].id);
        } else {
          setSelectedPropertyId(null);
        }
      } catch (err: any) {
        console.error("Erro na busca espacial:", err);
      } finally {
        setIsSearching(false);
      }
    }, 100);
  };

  // Export PDF Report with all matching features
  const handleExportPdf = () => {
    if (!parsedCoord) return;
    const summaryInfo: SicarLayerInfo = {
      layerName: layers.map(l => l.layerName).join(' + ') || 'SICAR Oficial',
      totalCount: layers.reduce((acc, l) => acc + l.totalCount, 0),
      srid: layers[0]?.srid || 'SIRGAS 2000 (EPSG:4674)',
      geometryType: layers[0]?.geometryType || 'MultiPolygon',
      loadedAt: new Date(),
      fileName: layers.map(l => l.fileName).join(', '),
      sourceType: 'gpkg',
    };
    exportSicarPdf(searchResults, parsedCoord, summaryInfo);
  };

  const totalActiveFeatures = layers
    .filter(l => l.enabled !== false)
    .reduce((sum, l) => sum + l.totalCount, 0);

  const selectedProperty = searchResults.find(p => p.id === selectedPropertyId) || searchResults[0];

  return (
    <div className="flex flex-col min-h-screen bg-military-900 text-military-100 font-sans pb-12" id="buscar-car-view">
      {/* Top App Bar */}
      <header className="sticky top-0 z-40 bg-military-850/95 backdrop-blur-md border-b border-military-700 px-4 py-3 flex items-center justify-between shadow-sm">
        <button
          onClick={onBack}
          id="btn-voltar-car"
          className="p-2 hover:bg-military-800 rounded-xl transition-colors flex items-center gap-2 group cursor-pointer text-military-300 hover:text-military-100"
        >
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold text-sm">Voltar</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-military-800 border border-military-700 flex items-center justify-center text-military-300">
            <Shield className="w-4 h-4" />
          </div>
          <h1 className="text-sm font-black tracking-tight uppercase">Buscar Dados do CAR</h1>
        </div>

        <div className="w-16 flex justify-end">
          {searchResults.length > 0 && (
            <button
              onClick={handleExportPdf}
              title="Exportar Relatório em PDF"
              className="p-1.5 rounded-lg bg-military-300 hover:bg-military-200 text-military-950 transition active:scale-95 shadow-sm cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <div className="max-w-xl mx-auto w-full px-4 pt-4 space-y-4">
        {/* Title Header Card */}
        <div className="bg-military-850 border border-military-700/80 rounded-2xl p-4 shadow-sm text-center">
          <h2 className="text-lg font-black uppercase text-military-100 tracking-tight">
            Consulta Geoespacial do CAR
          </h2>
          <p className="text-xs text-military-400 font-medium mt-0.5">
            Interseção Espacial de Imóveis Rurais (Point in Polygon)
          </p>
        </div>

        {/* 1. SEÇÃO DE FONTES DE DADOS E UPLOAD MULTI-CAMADA */}
        <div className="bg-military-850 border border-military-700/80 rounded-2xl p-4 shadow-sm space-y-3" id="secao-fontes-dados">
          <div className="flex items-center justify-between border-b border-military-750 pb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-military-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-military-100">
                Bases Geoespaciais Anexadas
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold text-military-300 uppercase bg-military-800 px-2 py-0.5 rounded border border-military-750">
              {layers.length > 0
                ? `${totalActiveFeatures.toLocaleString('pt-BR')} ${totalActiveFeatures === 1 ? 'Feição' : 'Feições'} (${layers.length} ${layers.length === 1 ? 'Arquivo' : 'Arquivos'})`
                : 'Nenhum Arquivo'}
            </span>
          </div>

          {/* Lista de Camadas Ativas com Botão Excluir */}
          {layers.length > 0 ? (
            <div className="space-y-2">
              {layers.map((layer) => {
                const isDemo = layer.id === 'demo_acre_sema';
                const sizeStr = layer.fileSize ? ` • ${(layer.fileSize / (1024 * 1024)).toFixed(1)} MB` : '';
                return (
                  <div 
                    key={layer.id}
                    className="bg-military-800/90 border border-military-750 rounded-xl p-3 text-xs flex flex-col gap-1.5 transition hover:border-military-650"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="p-1.5 rounded bg-military-750 text-military-300 shrink-0">
                          <Layers className="w-3.5 h-3.5 text-military-300" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <strong className="text-military-100 font-bold truncate max-w-[200px] sm:max-w-[280px]">
                              {layer.layerName}
                            </strong>
                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-700/60 px-1.5 py-0.5 rounded font-bold flex items-center gap-1 shrink-0">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Ativa
                            </span>
                            {isDemo && (
                              <span className="text-[9px] font-mono text-amber-400 bg-amber-950/60 border border-amber-700/60 px-1.5 py-0.5 rounded font-bold shrink-0">
                                Demonstrativa
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-military-400 truncate block mt-0.5">
                            {layer.fileName}{sizeStr}
                          </span>
                        </div>
                      </div>

                      {/* Botão para Excluir este arquivo */}
                      <button
                        onClick={() => handleDeleteLayer(layer.id, layer.layerName)}
                        title={`Excluir ${layer.fileName}`}
                        className="py-1 px-2.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 transition active:scale-95 cursor-pointer shrink-0 flex items-center gap-1 text-[11px]"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span className="font-bold">Excluir</span>
                      </button>
                    </div>

                    <div className="text-[11px] text-military-400 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-military-750/70 pt-1.5">
                      <span>Total: <strong className="text-military-200">{layer.totalCount.toLocaleString('pt-BR')}</strong></span>
                      <span>SRID: <strong className="text-military-200">{layer.srid}</strong></span>
                      <span>Tipo: <strong className="text-military-200">{layer.geometryType}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-military-800/50 border border-dashed border-military-700 rounded-xl p-3 text-center text-xs text-military-400">
              Nenhuma base geoespacial anexada. Adicione seus arquivos do SICAR (.gpkg ou .zip) para realizar consultas offline.
            </div>
          )}

          {/* Success Message Banner */}
          {uploadSuccessMessage && (
            <div className="bg-emerald-950/40 border border-emerald-700/60 text-emerald-200 rounded-xl p-3 text-xs flex items-start gap-2 shadow-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="leading-snug">
                <strong className="block font-bold text-emerald-300">Atualização de Base:</strong>
                <span className="text-[11px]">{uploadSuccessMessage}</span>
              </div>
            </div>
          )}

          {/* Error Message Banner */}
          {uploadError && (
            <div className="bg-rose-950/40 border border-rose-700/60 text-rose-200 rounded-xl p-3 text-xs flex items-start gap-2 shadow-xs">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-snug">
                <strong className="block font-bold text-rose-300">Falha no processamento:</strong>
                <span className="text-[11px]">{uploadError}</span>
              </div>
            </div>
          )}

          {/* Upload Input & Actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="*/*"
              multiple
              className="hidden"
              id="car-file-input"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoadingBase}
              id="btn-upload-car"
              className="flex-1 py-2.5 px-3 bg-military-800 hover:bg-military-750 text-military-100 border border-military-700 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer shadow-xs"
            >
              <Upload className="w-4 h-4 text-military-400" />
              <span>{isLoadingBase ? loadingMessage : '+ Anexar Arquivo (.GPKG / .ZIP)'}</span>
            </button>

            <button
              onClick={handleLoadAcreBase}
              disabled={isLoadingBase}
              id="btn-load-acre-base"
              className="py-2.5 px-3 bg-military-800 hover:bg-military-750 text-military-300 border border-military-700 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
              title="Restaurar Base SICAR Oficial Demonstrativa do Acre"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Base Acre (SEMA)</span>
            </button>
          </div>

          <p className="text-[10px] text-military-400 leading-tight">
            Os arquivos anexados ficam salvos permanentemente no seu dispositivo (permanecem ativos ao sair e retornar ao módulo). Você pode anexar 2 ou 3 arquivos complementares (ex.: Área do Imóvel, Reserva Legal, APP) para busca conjunta simultânea por coordenadas.
          </p>
        </div>

        {/* 2. SEÇÃO DE COORDENADA EM GMS E CONVERSÃO */}
        <div className="bg-military-850 border border-military-700/80 rounded-2xl p-4 shadow-sm space-y-3.5" id="secao-coordenada">
          <div className="flex items-center justify-between border-b border-military-750 pb-2">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-military-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-military-100">
                Coordenada em GMS
              </h3>
            </div>
            <button
              onClick={handleGetCurrentLocation}
              className="text-[11px] font-bold text-military-300 hover:text-military-100 flex items-center gap-1 transition cursor-pointer"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>GPS Atual</span>
            </button>
          </div>

          {/* Coordinate Input */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-military-400 mb-1">
              Entrada nos formatos aceitos:
            </label>
            <input
              type="text"
              value={gmsInput}
              onChange={(e) => setGmsInput(e.target.value)}
              placeholder='08°36&apos;25.88"S 69°47&apos;17.47"W ou 8°36&apos;25.88" S, 69°47&apos;17.47" W'
              id="input-coordenada-gms"
              className="w-full bg-military-800 border border-military-700 rounded-xl px-3 py-2.5 text-xs font-mono text-military-100 focus:outline-none focus:ring-2 focus:ring-military-500 shadow-inner"
            />
          </div>

          {/* Format hints buttons */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="text-military-400">Exemplos:</span>
            <button
              type="button"
              onClick={() => setGmsInput('08°36\'25.88"S 69°47\'17.47"W')}
              className="px-2 py-0.5 rounded bg-military-800 hover:bg-military-750 border border-military-700 text-military-300 font-mono transition cursor-pointer"
            >
              08°36'25.88"S 69°47'17.47"W
            </button>
            <button
              type="button"
              onClick={() => setGmsInput('8°36\'25.88" S, 69°47\'17.47" W')}
              className="px-2 py-0.5 rounded bg-military-800 hover:bg-military-750 border border-military-700 text-military-300 font-mono transition cursor-pointer"
            >
              8°36'25.88" S, 69°47'17.47" W
            </button>
            <button
              type="button"
              onClick={() => setGmsInput('08 36 25.88 S / 69 47 17.47 W')}
              className="px-2 py-0.5 rounded bg-military-800 hover:bg-military-750 border border-military-700 text-military-300 font-mono transition cursor-pointer"
            >
              08 36 25.88 S / 69 47 17.47 W
            </button>
          </div>

          {/* Converter Button */}
          <button
            onClick={handleConvertCoordinates}
            id="btn-converter-coordenada"
            className="w-full py-2.5 px-4 bg-military-800 hover:bg-military-750 text-military-100 border border-military-700 rounded-xl font-black text-xs uppercase tracking-wider transition active:scale-95 cursor-pointer shadow-xs"
          >
            [ CONVERTER ]
          </button>

          {/* Conversion Error */}
          {conversionError && (
            <p className="text-xs text-rose-400 font-medium">
              {conversionError}
            </p>
          )}

          {/* Converted Decimal Display */}
          {parsedCoord && (
            <div className="bg-military-900 border border-military-750 rounded-xl p-3 space-y-2 font-mono text-xs shadow-inner">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-military-850 p-2 rounded-lg border border-military-750">
                  <span className="block text-[10px] text-military-400 font-bold uppercase tracking-wider font-sans">
                    Latitude Decimal:
                  </span>
                  <span className="text-sm font-bold text-military-100">
                    {parsedCoord.latFormatted}
                  </span>
                </div>

                <div className="bg-military-850 p-2 rounded-lg border border-military-750">
                  <span className="block text-[10px] text-military-400 font-bold uppercase tracking-wider font-sans">
                    Longitude Decimal:
                  </span>
                  <span className="text-sm font-bold text-military-100">
                    {parsedCoord.lngFormatted}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-military-400 flex items-center justify-between pt-1">
                <span>GMS Formatado: <strong>{parsedCoord.fullGms}</strong></span>
              </div>
            </div>
          )}

          {/* 3. BOTÃO BUSCAR CAR */}
          <button
            onClick={handleBuscarCar}
            disabled={isSearching || layers.length === 0}
            id="btn-buscar-car"
            className="w-full py-3.5 px-4 bg-military-300 hover:bg-military-200 text-military-950 font-black rounded-xl text-sm uppercase tracking-wider shadow-md transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Search className="w-4 h-4" />
            <span>{isSearching ? 'Processando Interseção Espacial...' : '[ BUSCAR CAR ]'}</span>
          </button>
        </div>

        {/* 4. RESULTADO DA CONSULTA ESPACIAL */}
        {hasSearched && (
          <div className="space-y-4" id="resultado-consulta-container">
            {/* OVERLAP ALERT OU RESULTADO ÚNICO */}
            {searchResults.length > 1 ? (
              <div className="bg-amber-500/15 border-2 border-amber-500/60 rounded-2xl p-4 text-center shadow-md">
                <div className="flex items-center justify-center gap-2 text-amber-400 font-black text-sm uppercase tracking-wider mb-1">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  <span>FORAM ENCONTRADOS {searchResults.length} REGISTROS / POLÍGONOS NESTA COORDENADA</span>
                </div>
                <p className="text-xs text-military-300">
                  A coordenada consultada intersecta polígonos nas bases carregadas (sobreposições ou dados complementares). Selecione abaixo para inspecionar cada elemento:
                </p>

                {/* Overlapping Selection Tabs */}
                <div className="flex items-center justify-center gap-2 mt-3 overflow-x-auto pb-1 max-w-full">
                  {searchResults.map((prop, idx) => {
                    const isSelected = selectedProperty?.id === prop.id;
                    const label = prop.layerName ? `${prop.layerName} #${idx + 1}` : `CAR ${idx + 1}`;
                    return (
                      <button
                        key={prop.id}
                        onClick={() => setSelectedPropertyId(prop.id)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider transition cursor-pointer shrink-0 border ${
                          isSelected
                            ? 'bg-amber-500 text-military-950 border-amber-400 shadow-sm font-black'
                            : 'bg-military-850 text-military-300 border-military-700 hover:bg-military-800'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : searchResults.length === 1 ? (
              <div className="bg-emerald-500/15 border border-emerald-500/50 rounded-2xl p-3.5 text-center shadow-sm">
                <div className="flex items-center justify-center gap-2 text-emerald-400 font-black text-xs uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>1 Polígono / Imóvel Encontrado no SICAR</span>
                </div>
              </div>
            ) : (
              <div className="bg-rose-500/15 border border-rose-500/50 rounded-2xl p-4 text-center shadow-sm">
                <div className="flex items-center justify-center gap-2 text-rose-400 font-black text-xs uppercase tracking-wider mb-1">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Nenhum Polígono Encontrado</span>
                </div>
                <p className="text-xs text-military-300">
                  A coordenada consultada não intersecta nenhum polígono nas bases ativas do CAR atualmente carregadas.
                </p>
              </div>
            )}

            {/* MAPA INTERATIVO DOS POLÍGONOS ENCONTRADOS */}
            {searchResults.length > 0 && parsedCoord && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-military-400">
                    Visualização Cartográfica:
                  </span>
                  <span className="text-[10px] text-military-400 font-mono">
                    {searchResults.length} Polígono(s) renderizados
                  </span>
                </div>

                <SicarMap
                  properties={searchResults}
                  selectedPropertyId={selectedProperty?.id}
                  onSelectProperty={(p) => setSelectedPropertyId(p.id)}
                  queriedPoint={{ lat: parsedCoord.lat, lng: parsedCoord.lng }}
                />
              </div>
            )}

            {/* DETALHAMENTO DO ELEMENTO SELECIONADO */}
            {selectedProperty && parsedCoord && (
              <div className="bg-military-850 border border-military-700/80 rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-military-750 pb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-military-400" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-military-100">
                      {searchResults.length > 1
                        ? `Registro ${searchResults.findIndex(p => p.id === selectedProperty.id) + 1} de ${searchResults.length}`
                        : 'Informações do Imóvel Rural'}
                    </h3>
                  </div>

                  <button
                    onClick={handleExportPdf}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-military-300 hover:bg-military-200 text-military-950 font-black text-xs uppercase tracking-wider transition active:scale-95 shadow-sm cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar PDF</span>
                  </button>
                </div>

                {/* Camada de Origem */}
                {selectedProperty.layerName && (
                  <div className="bg-military-800/80 p-2 rounded-xl border border-military-750 flex items-center justify-between text-xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-military-400">
                      Camada de Origem:
                    </span>
                    <span className="font-mono font-bold text-emerald-400 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      {selectedProperty.layerName} {selectedProperty.fileName ? `(${selectedProperty.fileName})` : ''}
                    </span>
                  </div>
                )}

                {/* Lista formatada de atributos */}
                <div className="space-y-2.5 text-xs">
                  <div className="bg-military-800 p-2.5 rounded-xl border border-military-750">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-military-400">
                      Número do CAR:
                    </span>
                    <span className="text-xs sm:text-sm font-mono font-black text-military-100 break-all select-all">
                      {selectedProperty.numCar}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="bg-military-800 p-2.5 rounded-xl border border-military-750">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-military-400">
                        Município:
                      </span>
                      <span className="text-xs font-bold text-military-100">
                        {selectedProperty.municipio}
                      </span>
                    </div>

                    <div className="bg-military-800 p-2.5 rounded-xl border border-military-750">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-military-400">
                        Área do Imóvel:
                      </span>
                      <span className="text-xs font-bold text-military-100">
                        {selectedProperty.areaHa}
                      </span>
                    </div>
                  </div>

                  <div className="bg-military-800 p-2.5 rounded-xl border border-military-750">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-military-400">
                      Situação do CAR:
                    </span>
                    <span className="text-xs font-bold text-military-100">
                      {selectedProperty.situacao}
                    </span>
                  </div>

                  <div className="bg-military-800 p-2.5 rounded-xl border border-military-750">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-military-400">
                      Proprietário/Possuidor Declarado:
                    </span>
                    <span className="text-xs font-bold text-military-100">
                      {selectedProperty.proprietario}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="bg-military-800 p-2.5 rounded-xl border border-military-750">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-military-400">
                        Data do Cadastro:
                      </span>
                      <span className="text-xs font-bold text-military-100">
                        {selectedProperty.dataCadastro}
                      </span>
                    </div>

                    <div className="bg-military-800 p-2.5 rounded-xl border border-military-750">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-military-400">
                        Código do Imóvel:
                      </span>
                      <span className="text-xs font-mono font-bold text-military-100">
                        {selectedProperty.codImovel}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="bg-military-800 p-2.5 rounded-xl border border-military-750">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-military-400">
                        Área de Reserva Legal:
                      </span>
                      <span className="text-xs font-bold text-military-100">
                        {selectedProperty.reservaLegalHa}
                      </span>
                    </div>

                    <div className="bg-military-800 p-2.5 rounded-xl border border-military-750">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-military-400">
                        Área de APP:
                      </span>
                      <span className="text-xs font-bold text-military-100">
                        {selectedProperty.appHa}
                      </span>
                    </div>
                  </div>

                  <div className="bg-military-900/60 p-2.5 rounded-xl border border-military-750 space-y-1 font-mono text-[11px]">
                    <span className="block text-[10px] font-sans font-bold uppercase tracking-wider text-military-400">
                      Coordenada Consultada:
                    </span>
                    <div className="text-military-200">
                      {parsedCoord.fullGms}
                    </div>
                    <div className="text-military-400 text-[10px]">
                      Latitude: {parsedCoord.latFormatted} | Longitude: {parsedCoord.lngFormatted}
                    </div>
                  </div>
                </div>

                {/* TABELA DE ATRIBUTOS DINÂMICA (RAW ATTRIBUTES) */}
                <div className="pt-2 border-t border-military-750">
                  <button
                    onClick={() => setShowRawAttributes(!showRawAttributes)}
                    className="w-full flex items-center justify-between text-xs font-bold text-military-300 hover:text-military-100 transition py-1 cursor-pointer"
                  >
                    <span>Todos os Atributos da Camada ({Object.keys(selectedProperty.properties).length})</span>
                    <span className="text-[10px] font-mono">{showRawAttributes ? '▲ Ocultar' : '▼ Expandir'}</span>
                  </button>

                  {showRawAttributes && (
                    <div className="mt-2 bg-military-900 border border-military-750 rounded-xl p-3 max-h-60 overflow-y-auto space-y-1.5 font-mono text-[11px]">
                      {Object.entries(selectedProperty.properties).map(([k, v]) => (
                        <div key={k} className="flex flex-col sm:flex-row sm:justify-between border-b border-military-800 pb-1">
                          <span className="text-military-400 font-bold">{k}:</span>
                          <span className="text-military-200 break-all">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
