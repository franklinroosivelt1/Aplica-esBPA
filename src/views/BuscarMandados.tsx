import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  User, 
  FileText, 
  ShieldAlert, 
  Download, 
  Upload, 
  Plus, 
  X, 
  ChevronDown, 
  ChevronUp, 
  AlertTriangle,
  UserCheck,
  ClipboardList,
  Database,
  Trash2,
  Lock,
  SearchIcon,
  ExternalLink
} from 'lucide-react';

interface Mandado {
  id: string;
  nome: string;
  alcunha?: string;
  cpf?: string;
  rg?: string;
  dataNascimento?: string;
  nomeMae?: string;
  numeroMandado: string;
  naturezaInfracao: string;
  artigoLei: string;
  orgaoEmissor: string;
  tipoPrisao: 'Preventiva' | 'Temporária' | 'Condenação Definitiva';
  status: 'Ativo' | 'Cumprido' | 'Revogado';
  observacoes?: string;
  gravidade: 'Alta' | 'Média' | 'Baixa';
}

// Realistic pre-seeded general & environmental warrants in Acre state (all simulated data)
const PRE_SEEDED_MANDADOS: Mandado[] = [];

interface BuscarMandadosProps {
  onBack: () => void;
}

export default function BuscarMandados({ onBack }: BuscarMandadosProps) {
  const [mandados, setMandados] = useState<Mandado[]>(() => {
    const saved = localStorage.getItem('bpa_mandados_db');
    if (saved) {
      try {
        const decoded = JSON.parse(saved);
        if (Array.isArray(decoded)) {
          return decoded;
        }
      } catch (e) {
        // ignore
      }
    }
    return PRE_SEEDED_MANDADOS;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // PDF.js active parsing states
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [parseProgress, setParseProgress] = useState('');
  const [parsedWarrants, setParsedWarrants] = useState<Mandado[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // Load PDF.js dynamically
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
      script.onerror = (e) => reject(new Error("Erro ao carregar o motor PDF (PDF.js)"));
      document.head.appendChild(script);
    });
  };

  const extractField = (text: string, keys: string[]): string | null => {
    const upperText = text.toUpperCase();
    for (const key of keys) {
      const idx = upperText.indexOf(key);
      if (idx !== -1) {
        const start = idx + key.length;
        let end = text.length;
        
        const searchSub = text.substring(start).trim();
        const delimiterRegex = /[\n\r;|]|\bCPF\b|\bRG\b|\bNASCIMENTO\b|\bMÃE\b|\bMANDADO\b/i;
        const match = searchSub.match(delimiterRegex);
        if (match && match.index !== undefined) {
          end = start + match.index;
        } else {
          end = start + 80;
        }
        
        let val = text.substring(start, end).replace(/[:.]/g, '').trim();
        val = val.replace(/\s+/g, ' ');
        if (val.length > 2) {
          return val;
        }
      }
    }
    return null;
  };

  const extractCPF = (text: string): string | null => {
    const match = text.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
    if (match) return match[0];
    const rawMatch = text.match(/\b\d{11}\b/);
    if (rawMatch) {
      return rawMatch[0].replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    }
    return null;
  };

  const extractRG = (text: string): string | null => {
    const match = text.match(/\b\d{4,9}-?[A-Z0-9]{1,2}\b/);
    return match ? match[0] : null;
  };

  const extractDate = (text: string): string | null => {
    const match = text.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
    return match ? match[0] : null;
  };

  const handleCustomPdfUpload = async (file: File) => {
    setIsParsingPdf(true);
    setParsedWarrants([]);
    setParseProgress("Preparando motor PDF.js decodificador...");
    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdfDoc = await loadingTask.promise;
      
      let fullText = "";
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        setParseProgress(`Lendo páginas do BNMP - cargamento página ${i} de ${pdfDoc.numPages}...`);
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + "\n---PAGE_BREAK---\n";
      }
      
      setParseProgress("Buscando padrões de mandados (CNJ BNMP)...");
      
      const extracted: Mandado[] = [];
      const cnjRegex = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g;
      const warrantNumbers = Array.from(new Set(fullText.match(cnjRegex) || []));
      
      if (warrantNumbers.length > 0) {
        for (let i = 0; i < warrantNumbers.length; i++) {
          const currentWarrant = warrantNumbers[i];
          const nextWarrant = warrantNumbers[i + 1];
          const startIdx = fullText.indexOf(currentWarrant);
          const endIdx = nextWarrant ? fullText.indexOf(nextWarrant) : fullText.length;
          const segment = fullText.substring(startIdx, endIdx);
          
          const nome = extractField(segment, [
            'NOME DO INDIVÍDUO:',
            'NOME DO INDIVIDUO:',
            'NOME DO RÉU:',
            'NOME DO REU:',
            'NOME DA PESSOA:',
            'PESSOA PROCURADA:',
            'QUALIFICAÇÃO:',
            'PROCURADO:',
            'REU:',
            'NOME:'
          ]);
          const cpf = extractCPF(segment);
          const rg = extractRG(segment);
          const mae = extractField(segment, ['NOME DA MÃE:', 'NOME DA MAE:', 'MÃE DE:', 'MAE:', 'FILIAÇÃO:', 'FILIACAO:', 'GENITORA:']);
          const nasc = extractDate(segment);
          const artigo = extractField(segment, ['ARTIGO DO ENQUADRAMENTO:', 'ARTIGO DE LEI:', 'TIPIFICAÇÃO PENAL:', 'TIPIFICACAO:', 'ARTIGO:', 'ART.', 'ENQUADRAMENTO:']) || "Art. da Lei 9.605/98 (Crime Ambiental)";
          const orgao = extractField(segment, ['ÓRGÃO EXPEDIDOR:', 'ORGAO EXPEDIDOR:', 'EXPEDIDOR:', 'VARA:', 'EMITIDO POR:']) || "Vara Criminal - Tribunal de Justiça";
          const infracao = extractField(segment, ['NATUREZA DA INFRAÇÃO:', 'NATUREZA DA INFRACAO:', 'DELITO:', 'CRIME:', 'ASSUNTO:']) || "Mandado de Busca / Prisão";
          
          if (nome && nome.length > 3) {
            extracted.push({
              id: `extracted-${currentWarrant}-${i}-${Date.now()}`,
              nome: nome.toUpperCase().trim(),
              numeroMandado: currentWarrant,
              cpf: cpf || undefined,
              rg: rg || undefined,
              nomeMae: mae || undefined,
              dataNascimento: nasc || undefined,
              artigoLei: artigo,
              naturezaInfracao: infracao,
              orgaoEmissor: orgao,
              tipoPrisao: segment.toLowerCase().includes('condenação') ? 'Condenação Definitiva' : segment.toLowerCase().includes('temporária') ? 'Temporária' : 'Preventiva',
              status: 'Ativo',
              gravidade: segment.toLowerCase().includes('homicídio') || segment.toLowerCase().includes('tráfico') || segment.toLowerCase().includes('desmatamento grave') ? 'Alta' : 'Média'
            });
          }
        }
      } else {
        // Find people by CPF as a backup
        const cpfRegex = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
        const cpfs = Array.from(new Set(fullText.match(cpfRegex) || []));
        
        if (cpfs.length > 0) {
          for (let i = 0; i < cpfs.length; i++) {
            const currentCpf = cpfs[i];
            const nextCpf = cpfs[i + 1];
            const startIdx = fullText.indexOf(currentCpf);
            const endIdx = nextCpf ? fullText.indexOf(nextCpf) : fullText.length;
            const segment = fullText.substring(Math.max(0, startIdx - 150), Math.min(fullText.length, endIdx));
            
            const nome = extractField(segment, [
              'NOME COMPLETO:',
              'NOME DO INDIVIDUO:',
              'NOME DO REU:',
              'REU:',
              'PROCURADO:',
              'NOME DA PESSOA:',
              'PESSOA PROCURADA:',
              'QUALIFICAÇÃO:',
              'NOME:'
            ]);
            if (nome && nome.length > 3) {
              const randWarrant = `BNMP-${Math.floor(100000 + Math.random() * 900000)}-${Date.now().toString().slice(-4)}`;
              extracted.push({
                id: `extracted-cpf-${i}-${Date.now()}`,
                nome: nome.toUpperCase().trim(),
                numeroMandado: randWarrant,
                cpf: currentCpf,
                artigoLei: "Art. da Lei 9.605/98",
                naturezaInfracao: "Importado via Lista PDF (BNMP)",
                orgaoEmissor: "Base Operacional BNMP Offline",
                tipoPrisao: "Preventiva",
                status: 'Ativo',
                gravidade: 'Média'
              });
            }
          }
        }
      }
      
      if (extracted.length === 0) {
        showToast("Nenhum padrão compatível de mandado ou CPF foi encontrado no PDF.");
      } else {
        // Automatically insert into local dataset to make them immediately searchable
        setMandados(prev => {
          const currentMap = new Map(prev.map(w => [w.numeroMandado, w]));
          let insertedCount = 0;
          extracted.forEach(w => {
            if (!currentMap.has(w.numeroMandado)) {
              currentMap.set(w.numeroMandado, w);
              insertedCount++;
            }
          });
          const updatedList = Array.from(currentMap.values());
          localStorage.setItem('bpa_mandados_db', JSON.stringify(updatedList));
          return updatedList;
        });
        setParsedWarrants(extracted);
        showToast(`Identificado e importado ${extracted.length} mandado(s) com sucesso na base off-line!`);
      }
    } catch (error: any) {
      console.error(error);
      showToast("Falha técnica ao extrair textos do arquivo PDF.");
    } finally {
      setIsParsingPdf(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === "application/pdf") {
      handleCustomPdfUpload(file);
    } else {
      showToast("Arraste apenas arquivos em formato .PDF!");
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleCustomPdfUpload(file);
    }
  };

  const confirmImportWarrants = () => {
    if (parsedWarrants.length === 0) return;
    const currentMap = new Map(mandados.map(w => [w.numeroMandado, w]));
    let insertedCount = 0;
    
    parsedWarrants.forEach(w => {
      if (!currentMap.has(w.numeroMandado)) {
        currentMap.set(w.numeroMandado, w);
        insertedCount++;
      }
    });
    
    const merged = Array.from(currentMap.values());
    localStorage.setItem('bpa_mandados_db', JSON.stringify(merged));
    setMandados(merged);
    setParsedWarrants([]);
    showToast(`Operação concluída: ${insertedCount} novos mandados adicionados off-line!`);
  };

  // States for adding a custom warrant in field
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMandado, setNewMandado] = useState<Partial<Mandado>>({
    nome: '',
    alcunha: '',
    cpf: '',
    rg: '',
    dataNascimento: '',
    nomeMae: '',
    numeroMandado: '',
    naturezaInfracao: '',
    artigoLei: '',
    orgaoEmissor: 'Tribunal de Justiça do Acre',
    tipoPrisao: 'Preventiva',
    status: 'Ativo',
    observacoes: '',
    gravidade: 'Média'
  });

  const [toastMsg, setToastMsg] = useState<string | null>(null);



  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleAddWarrant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMandado.nome || !newMandado.numeroMandado) {
      showToast("Insira o nome completo e número do mandado!");
      return;
    }

    const created: Mandado = {
      id: Date.now().toString(),
      nome: newMandado.nome.toUpperCase(),
      alcunha: newMandado.alcunha || undefined,
      cpf: newMandado.cpf || undefined,
      rg: newMandado.rg || undefined,
      dataNascimento: newMandado.dataNascimento || undefined,
      nomeMae: newMandado.nomeMae || undefined,
      numeroMandado: newMandado.numeroMandado,
      naturezaInfracao: newMandado.naturezaInfracao || 'Infração Ambiental Geral',
      artigoLei: newMandado.artigoLei || 'Art. da Lei 9.605/98',
      orgaoEmissor: newMandado.orgaoEmissor || 'Vara Criminal de Acre',
      tipoPrisao: newMandado.tipoPrisao as any || 'Preventiva',
      status: 'Ativo',
      observacoes: newMandado.observacoes || undefined,
      gravidade: newMandado.gravidade as any || 'Média'
    };

    const updated = [created, ...mandados];
    localStorage.setItem('bpa_mandados_db', JSON.stringify(updated));
    setMandados(updated);
    setShowAddForm(false);
    setNewMandado({
      nome: '',
      alcunha: '',
      cpf: '',
      rg: '',
      dataNascimento: '',
      nomeMae: '',
      numeroMandado: '',
      naturezaInfracao: '',
      artigoLei: '',
      orgaoEmissor: 'Tribunal de Justiça do Acre',
      tipoPrisao: 'Preventiva',
      status: 'Ativo',
      observacoes: '',
      gravidade: 'Média'
    });
    showToast("Mandando salvo na base local offline!");
  };

  const handleDeleteWarrant = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Deseja realmente remover este mandado da base do smartphone?")) {
      const updated = mandados.filter(item => item.id !== id);
      localStorage.setItem('bpa_mandados_db', JSON.stringify(updated));
      setMandados(updated);
      showToast("Mandado de prisão removido com sucesso!");
    }
  };

  const handleResetDB = () => {
    if (confirm("Deseja restaurar os dados de mandados iniciais pré-definidos do BPA?")) {
      localStorage.setItem('bpa_mandados_db', JSON.stringify(PRE_SEEDED_MANDADOS));
      setMandados(PRE_SEEDED_MANDADOS);
      showToast("Base de dados restaurada para padrão operacional!");
    }
  };

  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(mandados, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `bpa_mandados_cripto_${Date.now()}.json`);
    dlAnchorElem.click();
    showToast("Mandados exportados com sucesso!");
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (Array.isArray(parsed)) {
            localStorage.setItem('bpa_mandados_db', JSON.stringify(parsed));
            setMandados(parsed);
            showToast(`Sincronizados ${parsed.length} mandados locais com sucesso!`);
          } else {
            showToast("Estrutura de arquivo JSON corrompida ou inválida!");
          }
        } catch (err) {
          showToast("Erro na leitura do arquivo enviado!");
        }
      };
    }
  };

  // Safe search and match - only active when user searches (transient history)
  const filteredMandados = mandados.filter(item => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      return false;
    }
    const matchNome = item.nome?.toLowerCase().includes(query);
    const matchAlcunha = item.alcunha?.toLowerCase().includes(query);
    const matchCPF = item.cpf?.replace(/[.\-\s]/g, '').includes(query.replace(/[.\-\s]/g, ''));
    const matchRG = item.rg?.toLowerCase().includes(query);
    const matchNum = item.numeroMandado?.replace(/[.\-/]/g, '').includes(query.replace(/[.\-/]/g, ''));

    return !!(matchNome || matchAlcunha || matchCPF || matchRG || matchNum);
  });

  const handleAbrirPortal = () => {
    window.open('https://portalbnmp.cnj.jus.br/#/captcha/', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#0d110d] px-4 py-5 font-sans pb-28 text-white">
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[999] bg-emerald-800 border border-emerald-500 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-center font-mono"
          >
            <UserCheck className="w-4 h-4 text-white animate-pulse" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Military Plate Header */}
      <div className="w-full relative bg-gradient-to-b from-[#1b2518] to-[#121a11] border border-military-750 p-5 rounded-2xl mb-5 shadow-lg">
        <div className="absolute top-3 right-3 flex items-center gap-1">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
          <span className="text-[7.5px] font-mono text-emerald-400 font-bold tracking-widest uppercase">
            BANCO OFFLINE ATIVO
          </span>
        </div>

        <span className="text-[8.5px] font-mono font-bold text-military-300 uppercase tracking-widest block mb-0.5">
          POLÍCIA MILITAR DO ACRE • BPA
        </span>
        <h1 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2 font-sans">
          <ShieldAlert className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          MANDADOS DE PRISÃO
        </h1>
        <p className="text-[10px] text-military-400/90 leading-relaxed font-medium mt-1 uppercase font-sans">
          Módulo Operacional BNMP Offline de Campo
        </p>
      </div>

      {/* Portal Nacional BNMP – Consulta de CPF Online no CNJ */}
      <div className="bg-[#1c1313] border border-red-900/60 p-5 rounded-2xl mb-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 bg-red-950 text-red-400 border-l border-b border-red-900/50 px-2.5 py-1 rounded-bl-xl text-[8px] font-mono font-black uppercase tracking-wider animate-pulse flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
          Conexão Externa
        </div>

        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 bg-red-950/80 border border-red-800/60 rounded-xl text-red-400">
            <ShieldAlert size={18} />
          </div>
          <div>
            <h2 className="text-xs font-extrabold text-white uppercase tracking-wider">
              CONSULTAR PORTAL BNMP ONLINE (CNJ)
            </h2>
            <p className="text-[9px] text-[#dbbbbb] uppercase font-mono mt-0.5 leading-tight">
              Acesso direto ao site oficial
            </p>
          </div>
        </div>

        <p className="text-[10px] text-military-400/90 leading-relaxed mb-4 uppercase">
          Acesse o portal nacional de mandados do Conselho Nacional de Justiça para realizar pesquisas utilizando filtros de CPF, nome de foragidos ou número de processo.
        </p>

        <div className="space-y-3">
          <button
            onClick={handleAbrirPortal}
            className="w-full bg-red-900 hover:bg-red-800 active:scale-[0.99] transition-all border border-red-600/50 text-white font-black text-xs py-3 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            <ExternalLink size={14} />
            <span>Pesquisar no Portal CNJ BNMP ↗</span>
          </button>
        </div>

        <div className="mt-2.5 flex items-center justify-center gap-1 text-[8.5px] font-mono text-red-400/80 uppercase font-bold text-center">
          <span>portalbnmp.cnj.jus.br/#/captcha</span>
        </div>
      </div>

      {/* Importador de PDF BNMP (Offline) */}
      <div className="bg-[#121911] border border-emerald-950/80 p-4.5 rounded-2xl mb-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 bg-[#1c2c19] text-emerald-400 border-l border-b border-emerald-900/50 px-2.5 py-1 rounded-bl-xl text-[8px] font-mono font-black uppercase tracking-wider flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          100% OFF-LINE
        </div>

        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 bg-[#1b2b18] border border-emerald-800/60 rounded-xl text-emerald-400">
            <FileText size={18} />
          </div>
          <div>
            <h2 className="text-xs font-extrabold text-white uppercase tracking-wider">
              IMPORTAR MANDADOS EM PDF (BNMP)
            </h2>
            <p className="text-[9px] text-military-300 uppercase font-mono mt-0.5 leading-tight">
              Processamento seguro local no dispositivo
            </p>
          </div>
        </div>

        <p className="text-[10px] text-military-400/90 leading-relaxed mb-4 uppercase">
          Carregue o arquivo PDF com as Certidões de Mandados de Prisão oficiais do BNMP. O App realizará a extração e inserção dos dados de forma local.
        </p>

        {/* Horizontal Row for Both Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Main button: SELECIONAR ARQUIVO.PDF PARA BUSCAR OFF LINE */}
          <button
            type="button"
            onClick={() => document.getElementById('bnmp-pdf-picker')?.click()}
            className="w-full bg-[#1b2518] hover:bg-[#253321] text-emerald-300 active:scale-[0.98] border border-military-750 transition-all font-black text-[9.5px] py-3.5 px-3 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md text-center leading-tight hover:border-emerald-500/40"
          >
            <Database size={13} className="text-emerald-400 flex-shrink-0" />
            <span>SELECIONAR ARQUIVO.PDF PARA BUSCAR OFF LINE</span>
          </button>

          {/* Small button format container with drag & drop */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('bnmp-pdf-picker')?.click()}
            className={`border border-dashed rounded-xl px-4 py-2 flex items-center justify-center text-center transition-all cursor-pointer ${
              dragOver 
                ? 'border-emerald-400 bg-emerald-950/40 text-emerald-300' 
                : 'border-military-850 bg-[#0a0d0a] hover:border-military-700/60 text-military-450 hover:text-white'
            }`}
          >
            <input 
              id="bnmp-pdf-picker"
              type="file" 
              accept=".pdf" 
              className="hidden" 
              onChange={handleFileInputChange}
            />
            
            {isParsingPdf ? (
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-[9px] text-emerald-400 font-mono font-bold uppercase tracking-wider">
                  Lendo...
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-1.5 py-1">
                <Upload className="w-3.5 h-3.5 text-military-500 animate-pulse flex-shrink-0" />
                <span className="text-[9.5px] font-bold uppercase select-none leading-none">
                  Arraste o PDF ou toque para selecionar
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Real-time Field Search (Caixa de digitação) integrated in the same area */}
        <div className="relative mt-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por Nome, Vulgo, CPF ou Nº Mandado..."
            className="w-full bg-[#0a0f09] text-white border border-military-750 focus:border-military-500 focus:outline-none rounded-xl py-3 pl-10 pr-4 placeholder-military-450 text-xs tracking-wide uppercase font-semibold transition-all"
          />
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-military-400" />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-3.5 hover:text-white text-military-400 whitespace-nowrap"
            >
              <X size={14} className="hover:scale-110 transition-transform" />
            </button>
          )}
        </div>

        {/* Button to search on local PDF/Warrants database */}
        <button
          type="button"
          onClick={() => document.getElementById('bnmp-pdf-picker')?.click()}
          className="w-full bg-emerald-700 hover:bg-emerald-600 active:scale-[0.99] transition-all text-white font-black text-xs py-3 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-sm border border-emerald-500/30 mt-3"
        >
          <FileText size={14} className="text-emerald-300" />
          <span>Buscar Mandado no Arquivo .PDF</span>
        </button>

        {/* Discovered Warrants Pending Confirmation */}
        {parsedWarrants.length > 0 && (
          <div className="mt-4 bg-[#141b12] border border-emerald-900/60 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-military-850 pb-2">
              <span className="text-[9px] font-mono font-extrabold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                <UserCheck size={11} />
                Suspeitos Encontrados ({parsedWarrants.length})
              </span>
              <button 
                onClick={() => setParsedWarrants([])}
                className="text-military-400 hover:text-red-400 text-[9px] font-bold uppercase cursor-pointer"
              >
                Limpar
              </button>
            </div>

            <div className="max-h-44 overflow-y-auto space-y-2.5 pr-1">
              {parsedWarrants.map((item, idx) => (
                <div key={idx} className="bg-black/45 border border-military-850 p-2.5 rounded-lg text-xs">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-extrabold text-white uppercase text-[11px] block">{item.nome}</span>
                    <span className="bg-emerald-950/80 border border-emerald-500/30 text-emerald-500 text-[8px] font-bold uppercase px-1 rounded">
                      {item.tipoPrisao}
                    </span>
                  </div>
                  
                  {item.cpf && (
                    <span className="text-[9px] font-mono text-military-300 block mt-0.5">
                      CPF: <span className="text-emerald-400 font-black">{item.cpf}</span>
                    </span>
                  )}
                  {item.rg && (
                    <span className="text-[9px] font-mono text-military-300 block">
                      RG: {item.rg}
                    </span>
                  )}
                  <span className="text-[8px] font-mono text-military-450 block truncate mt-1 uppercase">
                    REGISTRO: {item.numeroMandado}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={confirmImportWarrants}
              className="w-full bg-emerald-700 hover:bg-emerald-600 transition-all text-white font-extrabold text-xs py-2.5 rounded-lg uppercase tracking-wider block text-center cursor-pointer shadow opacity-90 hover:opacity-100"
            >
              Confirmar Importação de ({parsedWarrants.length}) Mandados
            </button>
          </div>
        )}

        {/* Integrated List of Loaded/Filtered Warrants */}
        {filteredMandados.length > 0 && (
          <div className="mt-5 pt-4 border-t border-military-800 space-y-3">
            <div className="flex items-center justify-between text-[10px] font-mono text-military-400 px-0.5 pb-1 font-bold">
              <span className="uppercase tracking-widest flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-emerald-500" />
                Mandados Carregados:
              </span>
              <span className="bg-military-800/80 text-military-300 px-2 py-0.5 rounded font-black">
                {filteredMandados.length} ATIVOS LOCAL
              </span>
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {filteredMandados.map((item) => {
                const isExpanded = expandedId === item.id;
                const cardBg = item.gravidade === 'Alta' 
                  ? 'bg-[#1e1313]/95 border-red-900/60' 
                  : item.gravidade === 'Média' 
                    ? 'bg-[#1d1b11]/95 border-yellow-800/40' 
                    : 'bg-[#0f140f]/95 border-military-800';

                const severityBadge = item.gravidade === 'Alta'
                  ? 'bg-red-950/80 text-red-400 border-red-500/40'
                  : item.gravidade === 'Média'
                    ? 'bg-yellow-950/80 text-yellow-500 border-yellow-500/30'
                    : 'bg-emerald-950/80 text-emerald-500 border-emerald-500/30';

                return (
                  <div
                    key={item.id}
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className={`w-full text-left rounded-xl border p-3 shadow-sm transition-all relative overflow-hidden cursor-pointer ${cardBg}`}
                  >
                    <div className="flex items-start justify-between gap-3 pr-4">
                      <div className="space-y-0.5">
                        <span className="text-[7.5px] font-mono uppercase tracking-widest text-military-450 block font-black">
                          BNMP: {item.numeroMandado.slice(0, 18)}...
                        </span>
                        <h4 className="font-black text-[12px] tracking-wide text-white uppercase leading-tight">
                          {item.nome}
                        </h4>
                        {item.alcunha && (
                          <span className="text-[9px] text-yellow-500 font-mono font-bold uppercase block">
                            VULGO: "{item.alcunha.toUpperCase()}"
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider border ${severityBadge}`}>
                          {item.gravidade}
                        </span>
                        <span className="bg-black/40 text-military-300 border border-military-850 px-1 py-0.5 rounded text-[7.5px] font-mono uppercase font-semibold">
                          {item.tipoPrisao}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-2 mt-2 pt-2 border-t border-military-850/35 text-[9.5px]">
                      <div>
                        <span className="text-[7px] font-mono text-military-450 uppercase block">MOTIVO/DELITO</span>
                        <p className="text-military-200 truncate uppercase mt-0.5 font-medium">{item.naturezaInfracao}</p>
                      </div>
                      <div>
                        <span className="text-[7px] font-mono text-military-450 uppercase block">CPF / RG</span>
                        <p className="font-mono text-military-300 font-bold mt-0.5">
                          {item.cpf || 'DIVERGENTE'} / {item.rg || 'DIVERGENTE'}
                        </p>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden mt-3 pt-3 border-t border-military-800 space-y-3 text-xs text-military-200"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="grid grid-cols-2 gap-2 bg-black/45 p-2 rounded-lg border border-military-850">
                            <div>
                              <span className="text-[7px] font-mono text-military-450 uppercase block">NATUREZA DO CRIME</span>
                              <p className="font-semibold text-white/95 text-[10px] uppercase">{item.naturezaInfracao}</p>
                            </div>
                            <div>
                              <span className="text-[7px] font-mono text-military-450 uppercase block">DISPOSITIVO PENAL</span>
                              <p className="font-bold text-yellow-500 font-mono text-[10px]">{item.artigoLei}</p>
                            </div>
                          </div>

                          <div className="space-y-2 px-1 text-[10px]/relaxed">
                            <div>
                              <span className="text-[7.5px] font-mono text-military-450 uppercase block">CÓDIGO INTEGRADO CNJ:</span>
                              <span className="font-mono font-bold text-white block select-all break-all bg-black/55 p-1.5 rounded border border-military-850 mt-0.5 text-[10.5px]">
                                {item.numeroMandado}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-[7.5px] font-mono text-military-450 uppercase block">DT. NASCIMENTO:</span>
                                <span className="font-bold text-military-200">{item.dataNascimento || 'NÃO CONFIGURADO'}</span>
                              </div>
                              <div>
                                <span className="text-[7.5px] font-mono text-military-450 uppercase block">GENITORA:</span>
                                <span className="font-bold text-military-200 uppercase">{item.nomeMae || 'NÃO CONFIGURADO'}</span>
                              </div>
                            </div>

                            <div>
                              <span className="text-[7.5px] font-mono text-military-450 uppercase block">JUÍZO EXPEDIDOR:</span>
                              <span className="font-bold text-military-200 uppercase">{item.orgaoEmissor}</span>
                            </div>

                            {item.observacoes && (
                              <div className="bg-[#191107] border border-orange-950/45 p-2 rounded-lg mt-1">
                                <span className="text-[7.5px] font-mono text-orange-400 uppercase tracking-widest font-black block mb-0.5">
                                  ⚠️ REGISTRO ADICIONAL:
                                </span>
                                <p className="text-[10px] text-orange-200 leading-normal leading-relaxed uppercase">
                                  {item.observacoes}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-end pt-2 border-t border-military-850">
                            <button
                              onClick={(e) => handleDeleteWarrant(item.id, e)}
                              className="px-2.5 py-1 bg-red-950 hover:bg-red-900 border border-red-900/40 text-red-200 rounded-md text-[8px] uppercase font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                            >
                              <Trash2 size={10} className="text-red-400" />
                              Deletar Registro
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="absolute bottom-3 right-4 text-military-500">
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty search matches integrated in the same area */}
        {searchQuery && filteredMandados.length === 0 && (
          <div className="mt-5 pt-4 border-t border-military-850 text-center py-8 px-4 bg-[#121911]/20 rounded-xl">
            <UserCheck className="w-8 h-8 text-military-600/40 mx-auto mb-2" />
            <p className="text-[11px] text-military-400 font-bold uppercase tracking-wider mb-0.5">Nenhum registro encontrado</p>
            <p className="text-[9px] text-military-500 max-w-xs mx-auto leading-normal uppercase">
              Sem resultados na pesquisa off-line. Altere os termos da busca ou carregue novas certidões de mandado.
            </p>
          </div>
        )}
      </div>

      {/* Persistent Floating Back Button */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-xs px-4">
        <button
          onClick={onBack}
          className="w-full bg-[#1b2518] hover:bg-[#253321] border-2 border-military-500 text-white font-black py-3 rounded-full uppercase tracking-widest shadow-2xl transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 text-xs cursor-pointer bg-gradient-to-t from-[#121911] to-[#1d2719]"
        >
          <X className="w-4 h-4 text-military-300" />
          Voltar ao Menu Principal
        </button>
      </div>
    </div>
  );
}
