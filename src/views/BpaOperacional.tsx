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
  FileSpreadsheet,
  HelpCircle,
  ExternalLink,
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

  // Base / Layer State
  const [layerInfo, setLayerInfo] = useState<SicarLayerInfo | null>(null);
  const [isLoadingBase, setIsLoadingBase] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('Processando Base...');
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

  // Auto-initialize with preloaded Acre base on first mount
  useEffect(() => {
    try {
      const { properties, info } = getPreloadedAcreBase();
      spatialIndexRef.current.build(properties, info);
      setLayerInfo(info);
    } catch (e) {
      console.warn("Could not load initial demonstrative base", e);
    }

    // Auto-convert default GMS coordinate
    const converted = parseCoordinates('08°36\'25.88"S 69°47\'17.47"W');
    if (converted) {
      setParsedCoord(converted);
    }
  }, []);

  // Handle File Upload (.zip, .gpkg, .geojson)
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    setLoadingMessage(`Lendo ${file.name} (${sizeMb} MB)...`);
    setIsLoadingBase(true);
    setUploadError(null);
    setUploadSuccessMessage(null);

    try {
      const { properties, info } = await parseUploadedFile(file);
      setLoadingMessage(`Indexando ${properties.length.toLocaleString('pt-BR')} imóveis...`);
      spatialIndexRef.current.build(properties, info);
      setLayerInfo(info);

      setUploadSuccessMessage(
        `Camada: "${info.layerName}" | ${info.totalCount.toLocaleString('pt-BR')} imóveis carregados | SRID: ${info.srid}`
      );

      // Reset search results for new base
      setSearchResults([]);
      setHasSearched(false);
    } catch (err: any) {
      console.error("Erro ao processar arquivo:", err);
      setUploadError(err.message || "Erro ao processar a base geoespacial carregada.");
    } finally {
      setIsLoadingBase(false);
      setLoadingMessage('Processando Base...');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Load Preloaded Acre Base
  const handleLoadAcreBase = () => {
    setIsLoadingBase(true);
    setUploadError(null);
    setTimeout(() => {
      try {
        const { properties, info } = getPreloadedAcreBase();
        spatialIndexRef.current.build(properties, info);
        setLayerInfo(info);
        setUploadSuccessMessage(
          `Camada: "${info.layerName}" | ${info.totalCount} imóveis carregados | SRID: ${info.srid}`
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

  // Execute Point In Polygon Spatial Query
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

  // Export PDF Report
  const handleExportPdf = () => {
    if (!parsedCoord) return;
    exportSicarPdf(searchResults, parsedCoord, layerInfo);
  };

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

        {/* 1. SEÇÃO DE FONTES DE DADOS E UPLOAD */}
        <div className="bg-military-850 border border-military-700/80 rounded-2xl p-4 shadow-sm space-y-3" id="secao-fontes-dados">
          <div className="flex items-center justify-between border-b border-military-750 pb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-military-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-military-100">
                Base Geoespacial do SICAR
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold text-military-400 uppercase bg-military-800 px-2 py-0.5 rounded border border-military-750">
              {layerInfo ? `${layerInfo.totalCount.toLocaleString('pt-BR')} Imóveis` : 'Sem Base'}
            </span>
          </div>

          {/* Active Layer Banner */}
          {layerInfo && (
            <div className="bg-military-800/90 border border-military-750 rounded-xl p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-military-100 truncate max-w-[280px]">
                  {layerInfo.layerName}
                </span>
                <span className="text-[10px] font-mono text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Ativa
                </span>
              </div>
              <div className="text-[11px] text-military-400 flex flex-wrap gap-x-3 gap-y-0.5">
                <span>Total: <strong className="text-military-200">{layerInfo.totalCount}</strong></span>
                <span>SRID: <strong className="text-military-200">{layerInfo.srid}</strong></span>
                <span>Tipo: <strong className="text-military-200">{layerInfo.geometryType}</strong></span>
              </div>
            </div>
          )}

          {/* Success Message Banner */}
          {uploadSuccessMessage && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl p-3 text-xs flex items-start gap-2 shadow-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="leading-snug">
                <strong className="block font-bold">Base carregada com sucesso!</strong>
                <span className="text-[11px]">{uploadSuccessMessage}</span>
              </div>
            </div>
          )}

          {/* Error Message Banner */}
          {uploadError && (
            <div className="bg-rose-50 border border-rose-300 text-rose-900 rounded-xl p-3 text-xs flex items-start gap-2 shadow-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-snug">
                <strong className="block font-bold">Falha no processamento:</strong>
                <span className="text-[11px]">{uploadError}</span>
              </div>
            </div>
          )}

          {/* Upload Input & Quick Actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="*/*"
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
              <span>{isLoadingBase ? loadingMessage : 'Upload (.GPKG / .ZIP)'}</span>
            </button>

            <button
              onClick={handleLoadAcreBase}
              disabled={isLoadingBase}
              id="btn-load-acre-base"
              className="py-2.5 px-3 bg-military-800 hover:bg-military-750 text-military-300 border border-military-700 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
              title="Carregar Base SICAR Oficial do Acre"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Base Acre (SEMA)</span>
            </button>
          </div>

          <p className="text-[10px] text-military-400 leading-tight">
            Compatível com GeoPackage (.gpkg - classificado como "Arquivo em BIN" no Android), Shapefiles (.zip) e GeoJSON. Validação automática de geometrias Polygon e MultiPolygon com índice R-Tree.
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
              className="text-[11px] font-bold text-military-300 hover:text-military-100 flex items-center gap-1 transition"
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
              className="px-2 py-0.5 rounded bg-military-800 hover:bg-military-750 border border-military-700 text-military-300 font-mono transition"
            >
              08°36'25.88"S 69°47'17.47"W
            </button>
            <button
              type="button"
              onClick={() => setGmsInput('8°36\'25.88" S, 69°47\'17.47" W')}
              className="px-2 py-0.5 rounded bg-military-800 hover:bg-military-750 border border-military-700 text-military-300 font-mono transition"
            >
              8°36'25.88" S, 69°47'17.47" W
            </button>
            <button
              type="button"
              onClick={() => setGmsInput('08 36 25.88 S / 69 47 17.47 W')}
              className="px-2 py-0.5 rounded bg-military-800 hover:bg-military-750 border border-military-700 text-military-300 font-mono transition"
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
            <p className="text-xs text-rose-600 font-medium">
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
            disabled={isSearching}
            id="btn-buscar-car"
            className="w-full py-3.5 px-4 bg-military-300 hover:bg-military-200 text-military-950 font-black rounded-xl text-sm uppercase tracking-wider shadow-md transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
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
                <div className="flex items-center justify-center gap-2 text-amber-500 font-black text-sm uppercase tracking-wider mb-1">
                  <AlertTriangle className="w-5 h-5" />
                  <span>FORAM ENCONTRADOS {searchResults.length} IMÓVEIS SOBREPOSTOS NESTA COORDENADA</span>
                </div>
                <p className="text-xs text-military-300">
                  A coordenada consultada está inserida na poligonal de mais de um cadastro ambiental. Selecione cada CAR abaixo para inspecionar os detalhes:
                </p>

                {/* Overlapping CAR Selection Tabs */}
                <div className="flex items-center justify-center gap-2 mt-3 overflow-x-auto pb-1">
                  {searchResults.map((prop, idx) => {
                    const isSelected = selectedProperty?.id === prop.id;
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
                        CAR {idx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : searchResults.length === 1 ? (
              <div className="bg-emerald-500/15 border border-emerald-500/50 rounded-2xl p-3.5 text-center shadow-sm">
                <div className="flex items-center justify-center gap-2 text-emerald-400 font-black text-xs uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>1 Imóvel Rural Encontrado no SICAR</span>
                </div>
              </div>
            ) : (
              <div className="bg-rose-500/15 border border-rose-500/50 rounded-2xl p-4 text-center shadow-sm">
                <div className="flex items-center justify-center gap-2 text-rose-400 font-black text-xs uppercase tracking-wider mb-1">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Nenhum Imóvel Encontrado</span>
                </div>
                <p className="text-xs text-military-300">
                  A coordenada consultada não intersecta nenhum polígono da base do CAR atualmente carregada.
                </p>
              </div>
            )}

            {/* MAPA INTERATIVO DOS IMÓVEIS ENCONTRADOS */}
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

            {/* DETALHAMENTO DO IMÓVEL SELECIONADO */}
            {selectedProperty && parsedCoord && (
              <div className="bg-military-850 border border-military-700/80 rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-military-750 pb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-military-400" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-military-100">
                      {searchResults.length > 1
                        ? `CAR ${searchResults.findIndex(p => p.id === selectedProperty.id) + 1} de ${searchResults.length}`
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

                {/* Lista formatada exatamente conforme especificado */}
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
                    className="w-full flex items-center justify-between text-xs font-bold text-military-300 hover:text-military-100 transition py-1"
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
