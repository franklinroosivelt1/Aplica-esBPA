import { useState, useEffect } from 'react';
import { ClipboardList, Plus, Trash2, ChevronLeft, LayoutGrid, Trees, Info } from 'lucide-react';

interface WoodEntry {
  id: string;
  type: 'tora' | 'bloco';
  volume: number;
  details: string;
  species: string;
  createdAt: number;
  selected: boolean;
  length?: number;
  d1?: number;
  d2?: number;
  d3?: number;
  d4?: number;
  width?: number;
  height?: number;
}

interface CubagemBPAProps {
  onBack: () => void;
}

export default function CubagemBPA({ onBack }: CubagemBPAProps) {
  const [activeTab, setActiveTab] = useState<'tora' | 'bloco'>('tora');
  const [entries, setEntries] = useState<WoodEntry[]>(() => {
    const saved = localStorage.getItem('bpa_wood_entries');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('bpa_wood_entries', JSON.stringify(entries));
    } catch (e) {
      console.warn("localStorage setItem failed:", e);
    }
  }, [entries]);

  // Shared fields
  const [species, setSpecies] = useState('');

  // Tora fields
  const [lengthTora, setLengthTora] = useState('');
  const [d1, setD1] = useState('');
  const [d2, setD2] = useState('');
  const [d3, setD3] = useState('');
  const [d4, setD4] = useState('');

  // Bloco fields
  const [lengthBloco, setLengthBloco] = useState('');
  const [widthBloco, setWidthBloco] = useState('');
  const [heightBloco, setHeightBloco] = useState('');

  const calculateToraVolume = () => {
    const l = parseFloat(lengthTora);
    const vD1 = parseFloat(d1);
    const vD2 = parseFloat(d2);
    const vD3 = parseFloat(d3);
    const vD4 = parseFloat(d4);

    if (isNaN(l) || isNaN(vD1) || isNaN(vD2) || isNaN(vD3) || isNaN(vD4)) return;

    // Diâmetro médio topo e base
    const dTop = (vD1 + vD2) / 2;
    const dBase = (vD3 + vD4) / 2;

    // Áreas (em metros quadrados, diâmetro está em cm)
    const areaTop = Math.PI * Math.pow((dTop / 100) / 2, 2);
    const areaBase = Math.PI * Math.pow((dBase / 100) / 2, 2);

    // Método Smalian
    const volume = ((areaTop + areaBase) / 2) * l;
    
    const newEntry: WoodEntry = {
      id: crypto.randomUUID(),
      type: 'tora',
      volume,
      details: `${l}m | Topo: ${dTop.toFixed(1)}cm | Base: ${dBase.toFixed(1)}cm`,
      species: species || 'Não informada',
      createdAt: Date.now(),
      selected: true,
      length: l,
      d1: vD1,
      d2: vD2,
      d3: vD3,
      d4: vD4
    };

    setEntries(prev => {
      const updated = [newEntry, ...prev];
      return updated.slice(0, 50); // Keep only the latest 50
    });
    setLengthTora('');
    setD1('');
    setD2('');
    setD3('');
    setD4('');
    setSpecies('');
  };

  const calculateBlocoVolume = () => {
    const l = parseFloat(lengthBloco);
    const w = parseFloat(widthBloco);
    const h = parseFloat(heightBloco);

    if (isNaN(l) || isNaN(w) || isNaN(h)) return;

    const volume = l * w * h;

    const newEntry: WoodEntry = {
      id: crypto.randomUUID(),
      type: 'bloco',
      volume,
      details: `${l}m x ${w}m x ${h}m`,
      species: species || 'Não informada',
      createdAt: Date.now(),
      selected: true,
      length: l,
      width: w,
      height: h
    };

    setEntries(prev => {
      const updated = [newEntry, ...prev];
      return updated.slice(0, 50); // Keep only the latest 50
    });
    setLengthBloco('');
    setWidthBloco('');
    setHeightBloco('');
    setSpecies('');
  };

  const filteredEntries = entries.filter(e => e.type === activeTab);
  const selectedEntries = filteredEntries.filter(e => e.selected);
  const totalVolume = selectedEntries.reduce((acc, curr) => acc + curr.volume, 0);

  const toggleSelection = (id: string) => {
    setEntries(prev => prev.map(entry => 
      entry.id === id ? { ...entry, selected: !entry.selected } : entry
    ));
  };

  // Group entries by date
  const groupedEntries = filteredEntries.reduce((groups, entry) => {
    const date = new Date(entry.createdAt).toLocaleDateString('pt-BR');
    if (!groups[date]) groups[date] = [];
    groups[date].push(entry);
    return groups;
  }, {} as Record<string, WoodEntry[]>);

  const getDayLabel = (dateStr: string) => {
    const today = new Date().toLocaleDateString('pt-BR');
    if (dateStr === today) return 'Hoje';
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('pt-BR');
    if (dateStr === yesterdayStr) return 'Ontem';
    
    return dateStr;
  };

  return (
    <div className="flex flex-col space-y-6 pb-20 px-4 pt-4">
      {/* Header com botão Voltar */}
      <div className="flex items-center justify-between">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-military-800 rounded-lg flex items-center gap-2 group transition-colors"
        >
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold text-sm uppercase tracking-tight">Voltar</span>
        </button>
      </div>

      <div className="text-center space-y-1 py-4">
        <h1 className="text-2xl font-black text-military-100 uppercase tracking-tighter">SISTEMA DE CUBAGEM</h1>
        <p className="text-xs text-military-400 font-bold uppercase tracking-widest leading-none">Madeiras BPA</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-military-800 p-1 rounded-2xl border border-military-700 shadow-lg">
        <button 
          onClick={() => setActiveTab('tora')}
          className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl text-xs font-black uppercase tracking-tight transition-all ${activeTab === 'tora' ? 'bg-military-600 text-white shadow-md' : 'text-military-400 hover:text-military-200'}`}
        >
          <Trees size={16} /> Cubagem em Tora
        </button>
        <button 
          onClick={() => setActiveTab('bloco')}
          className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl text-xs font-black uppercase tracking-tight transition-all ${activeTab === 'bloco' ? 'bg-military-600 text-white shadow-md' : 'text-military-400 hover:text-military-200'}`}
        >
          <LayoutGrid size={16} /> Blocos / Serrada
        </button>
      </div>

      {/* Form Section */}
      <div className="bg-military-800 rounded-3xl p-6 border border-military-700 shadow-2xl space-y-6">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-military-400 uppercase tracking-[0.2em] px-1">Espécie da Madeira</label>
          <input 
            type="text" value={species} onChange={e => setSpecies(e.target.value)}
            className="w-full bg-military-900 border border-military-700 rounded-2xl px-5 py-4 text-military-100 focus:outline-none focus:border-military-500 transition-colors"
            placeholder="Ex: Ipê, Mogno, Cedro..."
          />
        </div>

        {activeTab === 'tora' ? (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-military-400 uppercase tracking-[0.2em] px-1">Comprimento da Tora (m)</label>
              <input 
                type="number" step="0.01" value={lengthTora} onChange={e => setLengthTora(e.target.value)}
                className="w-full bg-military-900 border border-military-700 rounded-2xl px-5 py-4 text-military-100 focus:outline-none focus:border-military-500 transition-colors font-mono"
                placeholder="Ex: 5.40"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-military-400 uppercase tracking-[0.2em] px-1">D1 (Topo cm)</label>
                <input 
                  type="number" value={d1} onChange={e => setD1(e.target.value)}
                  className="w-full bg-military-900 border border-military-700 rounded-2xl px-5 py-4 text-military-100 font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-military-400 uppercase tracking-[0.2em] px-1">D2 (Topo cm)</label>
                <input 
                  type="number" value={d2} onChange={e => setD2(e.target.value)}
                  className="w-full bg-military-900 border border-military-700 rounded-2xl px-5 py-4 text-military-100 font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-military-400 uppercase tracking-[0.2em] px-1">D3 (Base cm)</label>
                <input 
                  type="number" value={d3} onChange={e => setD3(e.target.value)}
                  className="w-full bg-military-900 border border-military-700 rounded-2xl px-5 py-4 text-military-100 font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-military-400 uppercase tracking-[0.2em] px-1">D4 (Base cm)</label>
                <input 
                  type="number" value={d4} onChange={e => setD4(e.target.value)}
                  className="w-full bg-military-900 border border-military-700 rounded-2xl px-5 py-4 text-military-100 font-mono"
                />
              </div>
            </div>
            <button 
              onClick={calculateToraVolume}
              className="w-full bg-military-600 hover:bg-military-500 text-white font-black py-5 rounded-2xl shadow-xl transition-all active:scale-[0.98] uppercase text-sm tracking-widest"
            >
              Adicionar à Lista
            </button>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-military-400 uppercase tracking-[0.2em] px-1">Comprimento (m)</label>
              <input 
                type="number" step="0.01" value={lengthBloco} onChange={e => setLengthBloco(e.target.value)}
                className="w-full bg-military-900 border border-military-700 rounded-2xl px-5 py-4 text-military-100 font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-military-400 uppercase tracking-[0.2em] px-1">Largura (m)</label>
              <input 
                type="number" step="0.01" value={widthBloco} onChange={e => setWidthBloco(e.target.value)}
                className="w-full bg-military-900 border border-military-700 rounded-2xl px-5 py-4 text-military-100 font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-military-400 uppercase tracking-[0.2em] px-1">Altura (m)</label>
              <input 
                type="number" step="0.01" value={heightBloco} onChange={e => setHeightBloco(e.target.value)}
                className="w-full bg-military-900 border border-military-700 rounded-2xl px-5 py-4 text-military-100 font-mono"
              />
            </div>
            <button 
              onClick={calculateBlocoVolume}
              className="w-full bg-military-600 hover:bg-military-500 text-white font-black py-5 rounded-2xl shadow-xl transition-all active:scale-[0.98] uppercase text-sm tracking-widest"
            >
              Adicionar à Lista
            </button>
          </>
        )}
      </div>

      {/* Totals Section (Moved up) */}
      {filteredEntries.length > 0 && (
        <div className="bg-military-800 rounded-3xl p-6 border border-military-700 shadow-2xl space-y-4 relative overflow-hidden">
           <div className="flex justify-between items-center mb-1">
             <span className="text-[10px] font-black uppercase tracking-widest text-military-400">Resumo da Seleção ({selectedEntries.length} itens)</span>
           </div>
           
           <div className="flex flex-col p-3 bg-military-900/50 rounded-xl border border-military-700/50 gap-1.5 shadow-inner">
              <div className="flex justify-between items-baseline">
                 <span className="text-xs font-black uppercase tracking-widest text-military-400">Volume Total:</span>
                 <span className="text-2xl font-bold font-mono text-military-100">{totalVolume.toFixed(4)} m³</span>
              </div>
              {activeTab === 'tora' && (
                <div className="text-[8.5px] font-bold text-military-400 uppercase font-mono tracking-wider text-right border-t border-military-700/30 pt-1 mt-1 flex items-center justify-end gap-1 select-none">
                  <Info size={10} className="text-military-450" />
                  <span>Método de Cálculo: Smalian</span>
                </div>
              )}
           </div>

           <div className="space-y-3 pt-2">
             <div className="flex justify-between items-center px-2">
                <span className="text-[10px] font-black uppercase tracking-tighter text-military-400">Total com Desconto (10%):</span>
                <span className="text-lg font-bold font-mono text-military-100">{(totalVolume * 0.9).toFixed(4)} m³</span>
             </div>
             
             <div className="flex justify-between items-start px-2">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-tighter text-military-400">Total com Desconto (30%):</span>
                  <div className="flex items-center gap-1 opacity-60">
                    <Info size={10} className="text-military-450" />
                    <span className="text-[7px] uppercase font-bold text-military-450 tracking-tighter">Resol. CONAMA 411/09, ART 9º, § 7</span>
                  </div>
                </div>
                <span className="text-lg font-bold font-mono text-military-100">{(totalVolume * 0.7).toFixed(4)} m³</span>
             </div>
           </div>
        </div>
      )}

      {/* History List */}
      <div className="bg-military-800 rounded-3xl overflow-hidden border border-military-700 shadow-2xl">
        <div className="bg-military-700/30 px-6 py-4 flex items-center gap-2 border-b border-military-700">
           <ClipboardList className="w-4 h-4 text-military-400" />
           <h2 className="text-[10px] font-black uppercase tracking-widest text-military-300">
             Histórico {activeTab === 'tora' ? 'de Toras' : 'de Blocos (Madeira Serrada)'}
           </h2>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {filteredEntries.length === 0 ? (
            <div className="p-10 text-center text-military-500 text-xs font-mono uppercase tracking-widest opacity-50">Nenhum registro</div>
          ) : (
            (Object.entries(groupedEntries) as [string, WoodEntry[]][]).map(([date, items]) => (
              <div key={date} className="relative">
                <div className="sticky top-0 bg-military-800/90 backdrop-blur-sm px-6 py-2 border-y border-military-700/50 z-10">
                  <span className="text-[9px] font-black uppercase tracking-widest text-military-400">{getDayLabel(date)}</span>
                </div>
                <div className="divide-y divide-military-700/50">
                  {items.map((item, idx) => (
                    <div key={item.id} className="p-4 flex justify-between items-center gap-4 group transition-colors hover:bg-military-700/20">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {/* Selection Checkbox */}
                        <div className="flex items-center flex-shrink-0">
                          <input 
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => toggleSelection(item.id)}
                            className="w-5 h-5 rounded border-military-600 bg-military-900 text-military-500 focus:ring-military-500 cursor-pointer"
                          />
                        </div>

                        {item.type === 'tora' ? (
                          <div className="flex flex-col text-left flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-[10px] font-bold text-military-400 uppercase tracking-tighter">
                                {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="text-xs font-black text-military-100 uppercase truncate max-w-[150px]">{item.species}</span>
                              <span className="px-1.5 py-0.5 border border-military-700 bg-military-900/50 text-[8px] font-mono text-military-300 uppercase rounded font-bold font-mono">
                                Tora
                              </span>
                            </div>
                            
                            {item.length !== undefined && item.d1 !== undefined ? (
                              <div className="text-[11px] font-mono text-military-300 space-y-1 bg-military-900/30 p-2.5 rounded-xl border border-military-750/30 mt-1">
                                <div>
                                  <span className="font-bold text-military-450 uppercase">Comp:</span>{' '}
                                  <span className="text-military-100 font-extrabold">{item.length.toFixed(2)}m</span>
                                </div>
                                <div className="grid grid-cols-12 gap-x-2 items-baseline">
                                  <div className="col-span-4">
                                    <span className="font-bold text-military-450">D1:</span>{' '}
                                    <span className="text-military-100">{item.d1}cm</span>
                                  </div>
                                  <div className="col-span-4">
                                    <span className="font-bold text-military-450">D2:</span>{' '}
                                    <span className="text-military-100">{item.d2}cm</span>
                                  </div>
                                  <div className="col-span-4 text-right">
                                    <span className="font-bold text-military-450 uppercase text-[9px]">Total:</span>{' '}
                                    <span className="text-military-100 font-extrabold">{item.volume.toFixed(4)} m³</span>
                                  </div>
                                </div>
                                <div className="grid grid-cols-12 gap-x-2 items-baseline">
                                  <div className="col-span-4">
                                    <span className="font-bold text-military-450">D3:</span>{' '}
                                    <span className="text-military-100">{item.d3}cm</span>
                                  </div>
                                  <div className="col-span-4">
                                    <span className="font-bold text-military-450">D4:</span>{' '}
                                    <span className="text-military-100">{item.d4}cm</span>
                                  </div>
                                  <div className="col-span-4 text-right text-[8px] text-military-500 font-bold tracking-tight">
                                    M. Smalian
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs font-mono text-military-100 mt-1 block">{item.details}</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col text-left flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-[10px] font-bold text-military-400 uppercase tracking-tighter">
                                {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="text-xs font-black text-military-100 uppercase truncate max-w-[150px]">{item.species}</span>
                              <span className="px-1.5 py-0.5 border border-military-700 bg-military-900/50 text-[8px] font-mono text-military-300 uppercase rounded font-bold font-mono">
                                Bloco
                              </span>
                            </div>
                            
                            {item.length !== undefined && item.width !== undefined ? (
                              <div className="text-[11px] font-mono text-military-300 space-y-1 bg-military-900/30 p-2.5 rounded-xl border border-military-750/30 mt-1">
                                <div>
                                  <span className="font-bold text-military-450 uppercase">Comp:</span>{' '}
                                  <span className="text-military-100 font-extrabold">{item.length.toFixed(2)}m</span>
                                </div>
                                <div className="grid grid-cols-12 gap-x-2 items-baseline">
                                  <div className="col-span-4">
                                    <span className="font-bold text-military-450">Larg:</span>{' '}
                                    <span className="text-military-100">{item.width.toFixed(2)}m</span>
                                  </div>
                                  <div className="col-span-4">
                                    <span className="font-bold text-military-450">Alt:</span>{' '}
                                    <span className="text-military-100">{item.height ? item.height.toFixed(2) : ''}m</span>
                                  </div>
                                  <div className="col-span-4 text-right">
                                    <span className="font-bold text-military-450 uppercase text-[9px]">Total:</span>{' '}
                                    <span className="text-military-100 font-extrabold">{item.volume.toFixed(4)} m³</span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs font-mono text-military-100 mt-1 block">{item.details}</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4 flex-shrink-0">
                        {item.length === undefined && (
                          <span className="font-mono font-extrabold text-military-100 whitespace-nowrap">{item.volume.toFixed(4)} m³</span>
                        )}
                        <button 
                          onClick={() => setEntries(entries.filter(e => e.id !== item.id))} 
                          className="text-military-500 hover:text-red-400 p-2 hover:bg-red-400/10 rounded-xl transition-all cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
