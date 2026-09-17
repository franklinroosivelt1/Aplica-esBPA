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
  ExternalLink,
  ChevronLeft
} from 'lucide-react';

interface Mandado {
  id: string;
  nome: string;
  alcunha?: string;
  cpf?: string;
  rg?: string;
  dataNascimento?: string;
  nomeMae?: string;
  nomePai?: string;
  dataExpedicao?: string;
  situacao?: string;
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

function removeAccents(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeNameForSearch(text: string | undefined): string {
  if (!text) return '';
  let clean = removeAccents(text);
  
  // Replace double letters, common phonetics, or writing inconsistencies like ss/sc/xc/ç/z/y/ph/ch
  clean = clean
    .replace(/sc/g, 's')
    .replace(/xc/g, 's')
    .replace(/ss/g, 's')
    .replace(/z/g, 's')
    .replace(/ç/g, 's')
    .replace(/y/g, 'i')
    .replace(/ph/g, 'f')
    .replace(/ch/g, 'x')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return clean;
}

function HighlightedText({ text, query, className = "text-black" }: { text: string; query: string; className?: string }) {
  if (!text) return <span></span>;
  if (!query || !query.trim()) return <span className={className}>{text}</span>;
  
  const cleanQuery = removeAccents(query).trim();
  if (!cleanQuery) return <span className={className}>{text}</span>;
  
  const cleanText = removeAccents(text);
  const index = cleanText.indexOf(cleanQuery);
  
  if (index === -1) {
    const normQ = normalizeNameForSearch(query);
    const normT = normalizeNameForSearch(text);
    if (normQ && normT && normT.includes(normQ)) {
      const textWords = text.split(/\s+/);
      return (
        <span className={className}>
          {textWords.map((word, i) => {
            const isMatch = normalizeNameForSearch(word).includes(normQ) || normQ.includes(normalizeNameForSearch(word));
            return (
              <React.Fragment key={i}>
                {isMatch ? (
                  <mark className="bg-yellow-300 text-black border border-yellow-500/60 px-1 py-0.5 rounded font-black shadow-xs">{word}</mark>
                ) : (
                  <span className={className}>{word}</span>
                )}
                {i < textWords.length - 1 ? ' ' : ''}
              </React.Fragment>
            );
          })}
        </span>
      );
    }
    return <span className={className}>{text}</span>;
  }
  
  const before = text.substring(0, index);
  const match = text.substring(index, index + cleanQuery.length);
  const after = text.substring(index + cleanQuery.length);
  
  return (
    <span className={className}>
      <span className={className}>{before}</span>
      <mark className="bg-yellow-300 text-black border border-yellow-500/60 px-1 py-0.5 rounded font-black shadow-xs">
        {match}
      </mark>
      <HighlightedText text={after} query={query} className={className} />
    </span>
  );
}

// --- DATABASE PERSISTENCE SYSTEM (IndexedDB for high capacity storage without QuotaExceededError) ---
const MANDADOS_DB_NAME = 'BpaMandadosDB_v2';
const MANDADOS_DB_VERSION = 1;

function openMandadosDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error("IndexedDB não disponível."));
      return;
    }
    const req = indexedDB.open(MANDADOS_DB_NAME, MANDADOS_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('mandados')) {
        db.createObjectStore('mandados');
      }
      if (!db.objectStoreNames.contains('attached_files')) {
        db.createObjectStore('attached_files');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveMandadosToStorage(mandadosList: Mandado[]): Promise<void> {
  // Primary save: IndexedDB (virtually unlimited quota)
  try {
    const db = await openMandadosDB();
    const tx = db.transaction('mandados', 'readwrite');
    tx.objectStore('mandados').put(mandadosList, 'current_mandados');
  } catch (err) {
    console.warn("Falha ao salvar no IndexedDB (mandados):", err);
  }

  // Backup save: localStorage (wrapped safely to prevent QuotaExceededError)
  try {
    localStorage.setItem('bpa_mandados_db', JSON.stringify(mandadosList));
  } catch (e) {
    console.warn("localStorage quota excedida para bpa_mandados_db. Dados armazenados com segurança no IndexedDB.");
  }
}

export async function saveAttachedFilesToStorage(filesList: any[]): Promise<void> {
  // Primary save: IndexedDB (virtually unlimited quota for PDF text/lines)
  try {
    const db = await openMandadosDB();
    const tx = db.transaction('attached_files', 'readwrite');
    tx.objectStore('attached_files').put(filesList, 'current_attached_files');
  } catch (err) {
    console.warn("Falha ao salvar no IndexedDB (arquivos anexados):", err);
  }

  // Backup save: try localStorage safely
  try {
    localStorage.setItem('bpa_attached_files', JSON.stringify(filesList));
  } catch (e) {
    console.warn("localStorage quota excedida ao salvar arquivos PDF. Todo o conteúdo foi mantido com sucesso no IndexedDB!");
    // Remove bloated localStorage item to free space for other app utilities
    try {
      localStorage.removeItem('bpa_attached_files');
    } catch (err) {}
  }
}

interface BuscarMandadosProps {
  onBack: () => void;
}

export default function BuscarMandados({ onBack }: BuscarMandadosProps) {
  const [mandados, setMandados] = useState<Mandado[]>(() => {
    try {
      const saved = localStorage.getItem('bpa_mandados_db');
      if (saved) {
        const decoded = JSON.parse(saved);
        if (Array.isArray(decoded) && decoded.length > 0) {
          return decoded;
        }
      }
    } catch (e) {
      // ignore
    }
    return PRE_SEEDED_MANDADOS;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Multiple PDF attachments types & state
  const [attachedFiles, setAttachedFiles] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('bpa_attached_files');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      return [];
    }
    return [];
  });

  // Hydrate asynchronously from IndexedDB on component mount
  useEffect(() => {
    let isMounted = true;
    async function loadDataFromStorage() {
      try {
        const db = await openMandadosDB();

        // 1. Mandados
        const mandadosTx = db.transaction('mandados', 'readonly');
        const mandadosReq = mandadosTx.objectStore('mandados').get('current_mandados');
        mandadosReq.onsuccess = () => {
          if (!isMounted) return;
          if (mandadosReq.result && Array.isArray(mandadosReq.result) && mandadosReq.result.length > 0) {
            setMandados(mandadosReq.result);
          } else if (mandados.length > 0) {
            saveMandadosToStorage(mandados);
          }
        };

        // 2. Attached PDF Files
        const filesTx = db.transaction('attached_files', 'readonly');
        const filesReq = filesTx.objectStore('attached_files').get('current_attached_files');
        filesReq.onsuccess = () => {
          if (!isMounted) return;
          if (filesReq.result && Array.isArray(filesReq.result) && filesReq.result.length > 0) {
            setAttachedFiles(filesReq.result);
          } else if (attachedFiles.length > 0) {
            saveAttachedFilesToStorage(attachedFiles);
          }
        };
      } catch (err) {
        console.warn("Aviso na inicialização do armazenamento IndexedDB:", err);
      }
    }

    loadDataFromStorage();
    return () => { isMounted = false; };
  }, []);

  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  
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

  const extractTipificacaoFromText = (text: string): { motivo: string; artigo: string } => {
    if (!text) return { motivo: "Mandado de Prisão", artigo: "Processo Penal BNMP" };
    const upper = text.toUpperCase();

    // Check explicit field labels
    const tipifMatch = text.match(/(?:TIPIFICAÇÃO PENAL|CAPITULAÇÃO|MOTIVO|DELITO|CRIME|INFRAÇÃO|ASSUNTO|ENQUADRAMENTO)[:\s]+([^\n\r;|]{3,90})/i);
    if (tipifMatch && tipifMatch[1]) {
      const val = tipifMatch[1].trim();
      if (!val.toUpperCase().includes("MANDADO DE PRISÃO") && !val.toUpperCase().includes("NÃO INFORMADO") && val.length > 2) {
        return { motivo: val, artigo: val };
      }
    }

    // Detect common criminal law categories
    let crime = "";
    if (upper.includes("HOMICÍDIO") || upper.includes("HOMICIDIO")) crime = "Homicídio";
    else if (upper.includes("TRÁFICO") || upper.includes("TRAFICO")) crime = "Tráfico de Drogas (Lei 11.343/06)";
    else if (upper.includes("ROUBO")) crime = "Roubo Majorado";
    else if (upper.includes("FURTO")) crime = "Furto";
    else if (upper.includes("ESTUPRO")) crime = "Estupro / Agressão Sexual";
    else if (upper.includes("VIOLÊNCIA DOMÉSTICA") || upper.includes("MARIA DA PENHA")) crime = "Violência Doméstica";
    else if (upper.includes("PORTE ILEGAL") || upper.includes("POSSE ILEGAL")) crime = "Porte/Posse Ilegal de Arma";
    else if (upper.includes("RECEPTAÇÃO") || upper.includes("RECEPTACAO")) crime = "Receptação";
    else if (upper.includes("ESTELIONATO")) crime = "Estelionato";
    else if (upper.includes("ORGANIZAÇÃO CRIMINOSA") || upper.includes("QUADRILHA")) crime = "Organização CriminOSA";
    else if (upper.includes("CRIME AMBIENTAL") || upper.includes("DESMATAMENTO") || upper.includes("9.605")) crime = "Crime Ambiental (Lei 9.605/98)";
    else if (upper.includes("LESÃO CORPORAL") || upper.includes("LESAO CORPORAL")) crime = "Lesão Corporal";
    else if (upper.includes("AMEAÇA") || upper.includes("AMEACA")) crime = "Ameaça";
    else if (upper.includes("CONDENAÇÃO") || upper.includes("PENA")) crime = "Execução de Pena Criminal";

    const artMatch = text.match(/\b(?:ART|ARTIGO|LEI)\.?\s*(\d+[\w\s\/.-]*)/i);

    if (crime && artMatch) {
      return { motivo: `${crime} (${artMatch[0].trim()})`, artigo: artMatch[0].trim() };
    } else if (crime) {
      return { motivo: crime, artigo: crime };
    } else if (artMatch) {
      return { motivo: `Infracao Penal (${artMatch[0].trim()})`, artigo: artMatch[0].trim() };
    }

    return { motivo: "Mandado de Prisão - Ordem Judicial", artigo: "Pendência BNMP" };
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

  const handleMultipleCustomPdfUploads = async (files: FileList | File[]) => {
    setIsParsingPdf(true);
    setParseProgress("Preparando motor PDF.js decodificador...");
    
    let totalExtracted = 0;
    const newAttachedFiles = [...attachedFiles];
    let pdfjsLib;
    try {
      pdfjsLib = await loadPdfJs();
    } catch (e: any) {
      showToast("Falha ao carregar motor PDF.js.");
      setIsParsingPdf(false);
      return;
    }

    const currentMap = new Map<string, Mandado>(mandados.map(w => [w.numeroMandado, w]));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (newAttachedFiles.some(f => f.name === file.name)) {
        continue;
      }
      
      setParseProgress(`Lendo arquivo ${i + 1} de ${files.length}: ${file.name}...`);
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;
        
        const extractedWarrants: Mandado[] = [];
        const pagesData: any[] = [];

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          setParseProgress(`Processando pág. ${pageNum}/${pdfDoc.numPages} de ${file.name}...`);
          const page = await pdfDoc.getPage(pageNum);
          const textContent = await page.getTextContent();
          
          const items = textContent.items.map((item: any) => ({
            str: item.str,
            x: item.transform[4],
            y: item.transform[5]
          }));

          if (items.length === 0) continue;

          // Assemble raw page lines
          const lineGroups: { [key: number]: any[] } = {};
          items.forEach(item => {
            let foundY = Object.keys(lineGroups).find(y => Math.abs(Number(y) - item.y) < 5.0);
            if (foundY) {
              lineGroups[Number(foundY)].push(item);
            } else {
              lineGroups[item.y] = [item];
            }
          });

          const sortedYs = Object.keys(lineGroups).map(Number).sort((a, b) => b - a);
          const pageLines: string[] = [];

          sortedYs.forEach((y, lineIdx) => {
            const rowItems = lineGroups[y];
            rowItems.sort((a, b) => a.x - b.x);

            const lineText = rowItems.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim();
            if (lineText) {
              pageLines.push(lineText);
            }

            // Group cells analyzed by horizontal spaces
            const cells: string[] = [];
            if (rowItems.length > 0) {
              let currentCellText = rowItems[0].str;
              for (let k = 1; k < rowItems.length; k++) {
                const prev = rowItems[k - 1];
                const cur = rowItems[k];
                const prevWidthEst = prev.str.length * 5.2;
                const gap = cur.x - (prev.x + prevWidthEst);
                
                if (gap > 11) {
                  if (currentCellText.trim()) {
                    cells.push(currentCellText.trim());
                  }
                  currentCellText = cur.str;
                } else {
                  currentCellText += " " + cur.str;
                }
              }
              if (currentCellText.trim()) {
                cells.push(currentCellText.trim());
              }
            }

            if (cells.length >= 2) {
              const procCellIdx = cells.findIndex(c => /\d{3,10}-\d{2}/.test(c) || /^\d{5,10}$/.test(c));
              if (procCellIdx !== -1) {
                const numero = cells[procCellIdx].replace(/\s+/g, '');
                let nome = "";
                if (procCellIdx + 1 < cells.length) {
                  nome = cells[procCellIdx + 1].toUpperCase().trim();
                }

                // Verify that nome is not a court header
                const isCourtHeader = /VARA|PLANT[ÃA]O|EXECU[ÇC][ÃA]O|PENAS?|REGIME|FECHADO|COMARCA|TRIBUNAL|DESEMBARGADOR|SECRETARIA|MINIST[ÉE]RIO|PROCESSO|NOME|PESSOAL/i.test(nome);

                if (nome && nome.length > 2 && !isCourtHeader) {
                  const dates = cells.filter(c => /\d{2}\/\d{2}\/\d{4}/.test(c));
                  const nascimento = dates[0] || undefined;
                  const dataExpedicao = dates[1] || undefined;

                  const allRowText = cells.join(' ') + " " + lineText;
                  const cpfRowMatch = allRowText.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/) || allRowText.match(/\b\d{11}\b/);
                  const rowCpf = cpfRowMatch ? cpfRowMatch[0] : undefined;

                  const textCells = cells.slice(procCellIdx + 2).filter(c => 
                    !/\d{2}\/\d{2}\/\d{4}/.test(c) && 
                    !/\d{3,10}-\d{2}/.test(c) &&
                    !/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(c) &&
                    !/^\d{11}$/.test(c) &&
                    c.toUpperCase() !== "NÃO INFORMADO" && 
                    c.toUpperCase() !== "NÃO INFORMADA" &&
                    c.toUpperCase() !== "NÃO CONSTA" &&
                    c.toUpperCase() !== "N/C"
                  );

                  let alcunha = undefined;
                  let nomeMae = undefined;
                  let nomePai = undefined;
                  let situacao = "Pendente de Cumprimento";
                  let expedidor = "Conselho Nacional de Justiça";
                  let peca = "Mandado de Prisão";

                  if (textCells.length > 0) alcunha = textCells[0];
                  if (textCells.length > 1) nomeMae = textCells[1];
                  if (textCells.length > 2) nomePai = textCells[2];

                  cells.forEach(c => {
                    const upperC = c.toUpperCase();
                    if (upperC.includes("PENDENTE") || upperC.includes("CUMPRIDO") || upperC.includes("REVOGADO") || upperC.includes("ATIVO")) {
                      situacao = c;
                    }
                    if (upperC.includes("VARA") || upperC.includes("COMARCA") || upperC.includes("TRIBUNAL") || upperC.includes("CRIMINAL")) {
                      expedidor = c;
                    }
                    if (upperC.includes("MANDADO") || upperC.includes("CONDENAÇÃO") || upperC.includes("PEÇA")) {
                      peca = c;
                    }
                  });

                  const tipifInfo = extractTipificacaoFromText(cells.join(' ') + " " + lineText);

                  extractedWarrants.push({
                    id: `extracted-${numero}-${lineIdx}-${pageNum}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    nome: nome,
                    cpf: rowCpf,
                    alcunha: alcunha !== "Não Informado" && alcunha !== "Não informado" && alcunha !== "NÃO INFORMADO" ? alcunha : undefined,
                    nomeMae: nomeMae,
                    nomePai: nomePai,
                    dataNascimento: nascimento,
                    situacao: situacao,
                    dataExpedicao: dataExpedicao,
                    numeroMandado: numero,
                    naturezaInfracao: peca && peca !== "Mandado de Prisão" ? peca : tipifInfo.motivo,
                    artigoLei: tipifInfo.artigo,
                    orgaoEmissor: expedidor,
                    tipoPrisao: peca.toLowerCase().includes('condenação') ? 'Condenação Definitiva' : peca.toLowerCase().includes('temporária') ? 'Temporária' : 'Preventiva',
                    status: 'Ativo',
                    gravidade: 'Média'
                  });
                }
              }
            }
          });

          // Fallback parsing for certificates on page level
          const pageRawText = pageLines.join(' ');
          const generalWords = pageRawText.toUpperCase();
          if (generalWords.includes("MANDADO") || generalWords.includes("PRISÃO") || generalWords.includes("BNMP")) {
            // First check if there is an explicit labeled name field: NOME: / NOME DA PESSOA: / INDICIADO:
            const labelNameMatch = pageRawText.match(/(?:NOME(?:\s+DA\s+PESSOA|\s+COMPLETO)?|PESSOA\s+PROCURADA|INDICIADO|CONDENADO)\s*[:.]\s*([A-ZÀ-Ú\s]{4,55})/i);
            
            // Extract common BNMP labeled metadata
            const cpfMatch = pageRawText.match(/(?:CPF(?:\/CNPJ)?)\s*[:.]?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i) ||
                             pageRawText.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/);
            const pageCpf = cpfMatch ? cpfMatch[1].trim() : undefined;

            const maeMatch = pageRawText.match(/(?:NOME\s+DA\s+MÃE|MÃE|GENITORA|FILIAÇÃO(?:\s*\(MÃE\))?)\s*[:.]\s*([A-ZÀ-Ú\s]{4,55})/i);
            const pageMae = maeMatch ? maeMatch[1].trim().toUpperCase() : undefined;

            const dataMatch = pageRawText.match(/(?:DATA\s+D[EA]\s+(?:EXPEDIÇÃO|EMISSÃO)|EXPEDIDO\s+EM)\s*[:.]?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
                              pageRawText.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
            const pageDataExp = dataMatch ? dataMatch[1].trim() : undefined;

            let pageSituacao = "PENDENTE DE CUMPRIMENTO";
            const sitMatch = pageRawText.match(/SITUAÇÃO(?:\s+DO\s+MANDADO)?\s*[:.]\s*([A-ZÀ-Ú\s]{4,30})/i);
            if (sitMatch) {
              pageSituacao = sitMatch[1].trim().toUpperCase();
            } else if (generalWords.includes("CUMPRIDO")) {
              pageSituacao = "CUMPRIDO";
            } else if (generalWords.includes("REVOGADO")) {
              pageSituacao = "REVOGADO";
            }

            const procMatch = pageRawText.match(/\b\d{3,7}-\d{2}\.\d{4}\b/) || 
                              pageRawText.match(/\b\d{7,10}-\d{2}\b/) ||
                              pageRawText.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/);
            const numero = procMatch ? procMatch[0] : "BNMP-FALL-" + Date.now().toString().slice(-4) + Math.floor(Math.random() * 10).toString();

            const tipifInfo = extractTipificacaoFromText(pageRawText);

            if (labelNameMatch) {
              const explicitName = labelNameMatch[1].trim().toUpperCase();
              const isInvalid = /VARA|PLANT[ÃA]O|EXECU[ÇC][ÃA]O|PENAS?|REGIME|FECHADO|COMARCA|TRIBUNAL|JUSTI[ÇC]A/i.test(explicitName);
              if (!isInvalid && explicitName.length > 3) {
                const exists = extractedWarrants.some(w => w.nome.toUpperCase() === explicitName);
                if (!exists) {
                  extractedWarrants.push({
                    id: `fall-${numero}-${pageNum}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    nome: explicitName,
                    cpf: pageCpf,
                    nomeMae: pageMae,
                    situacao: pageSituacao,
                    dataExpedicao: pageDataExp,
                    numeroMandado: numero,
                    status: 'Ativo',
                    gravidade: 'Média',
                    artigoLei: tipifInfo.artigo,
                    naturezaInfracao: tipifInfo.motivo,
                    orgaoEmissor: "Conselho Nacional de Justiça",
                    tipoPrisao: "Preventiva"
                  });
                }
              }
            } else {
              // Regex matching with strict exclusions of judicial/administrative terminology
              const euzenMatch = pageRawText.match(/([A-ZÀ-Ú]{3,}\s+[A-ZÀ-Ú\s]{4,45})/g);
              if (euzenMatch) {
                euzenMatch.forEach(nameCandidate => {
                  const cleanCandidate = nameCandidate.trim();
                  const upperCand = cleanCandidate.toUpperCase();
                  const isJudicial = /VARA|PLANT[ÃA]O|EXECU[ÇC][ÃA]O|PENAS?|REGIME|FECHADO|COMARCA|TRIBUNAL|JUSTI[ÇC]A|DOCUMENTO|MANDADO|NACIONAL|PODER|REP[ÚU]BLICA|ESTADO|GABINETE|DESEMBARGADOR|JUIZ|SECRETARIA|SE[ÇC][ÃA]O|MINIST[ÉE]RIO|P[ÚU]BLICO|DEFENSORIA|CART[ÓO]RIO|POL[ÍI]CIA|CIVIL|MILITAR|DELEGACIA|DIRETORIA|INSTITUTO|DIREITO|ASSUNTO|CRIMINAL|C[ÍI]VEL|INF[ÂA]NCIA|JUVENTUDE|ROND[ÔO]NIA|ACRE|AMAZONAS|BRASIL|JUDICI[ÁA]RIO|CERTID[ÃA]O|RELAT[ÓO]RIO|CONSULTA|PORTAL|BANCO|C[ÓO]DIGO|PROCESSO|PENAL|INQU[ÉE]RITO|CUMPRIMENTO|REVOGA[ÇC][ÃA]O|DISTRIBUI[ÇC][ÃA]O|AUTOS|TERMO|AUDI[ÊE]NCIA|PRECAT[ÓO]RIA|OF[ÍI]CIO|ALVAR[ÁA]|SOLTURA|PRIS[ÃA]O/i.test(upperCand);
                  
                  if (cleanCandidate.length > 8 && !isJudicial) {
                    const exists = extractedWarrants.some(w => w.nome.toUpperCase() === upperCand);
                    if (!exists) {
                      extractedWarrants.push({
                        id: `fall-${numero}-${pageNum}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        nome: cleanCandidate.toUpperCase(),
                        cpf: pageCpf,
                        nomeMae: pageMae,
                        situacao: pageSituacao,
                        dataExpedicao: pageDataExp,
                        numeroMandado: numero,
                        status: 'Ativo',
                        gravidade: 'Média',
                        artigoLei: tipifInfo.artigo,
                        naturezaInfracao: tipifInfo.motivo,
                        orgaoEmissor: "Conselho Nacional de Justiça",
                        tipoPrisao: "Preventiva"
                      });
                    }
                  }
                });
              }
            }
          }

          pagesData.push({
            pageNum,
            text: pageRawText,
            lines: pageLines
          });
        }

        const newFileObj = {
          id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          pages: pagesData,
          extractedWarrants
        };

        newAttachedFiles.push(newFileObj);
        totalExtracted += extractedWarrants.length;

        // Auto-merge to the loaded database
        extractedWarrants.forEach(w => {
          if (!currentMap.has(w.numeroMandado)) {
            currentMap.set(w.numeroMandado, w);
          }
        });

      } catch (err: any) {
        console.error("Error parsing file", file.name, err);
        showToast(`Erro ao carregar o arquivo PDF: ${file.name}`);
      }
    }

    setAttachedFiles(newAttachedFiles);
    saveAttachedFilesToStorage(newAttachedFiles);
    
    const mergedList = Array.from(currentMap.values());
    saveMandadosToStorage(mergedList);
    setMandados(mergedList);

    setIsParsingPdf(false);
    showToast(`Concluído! ${files.length} arquivo(s) carregados com ${totalExtracted} mandados encontrados.`);
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
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const pdfs = Array.from(files).filter((file: File) => file.type === "application/pdf") as File[];
      if (pdfs.length > 0) {
        handleMultipleCustomPdfUploads(pdfs);
      } else {
        showToast("Arraste apenas arquivos em formato .PDF!");
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleMultipleCustomPdfUploads(files);
    }
  };

  const handleDeleteAttachedFile = (fileId: string) => {
    const fileToDelete = attachedFiles.find(f => f.id === fileId);
    if (!fileToDelete) return;
    
    const updatedFiles = attachedFiles.filter(f => f.id !== fileId);
    setAttachedFiles(updatedFiles);
    saveAttachedFilesToStorage(updatedFiles);
    
    // Also remove warrants parsed from that file if they are in public state and local storage
    const warrantsToKeep = mandados.filter(m => 
      !fileToDelete.extractedWarrants.some((del: Mandado) => del.numeroMandado === m.numeroMandado)
    );
    setMandados(warrantsToKeep);
    saveMandadosToStorage(warrantsToKeep);
    
    showToast(`Arquivo "${fileToDelete.name}" e seus registros foram excluídos!`);
  };

  const confirmImportWarrants = () => {
    if (parsedWarrants.length === 0) return;
    const currentMap = new Map<string, Mandado>(mandados.map(w => [w.numeroMandado, w]));
    let insertedCount = 0;
    
    parsedWarrants.forEach(w => {
      if (!currentMap.has(w.numeroMandado)) {
        currentMap.set(w.numeroMandado, w);
        insertedCount++;
      }
    });
    
    const merged = Array.from(currentMap.values());
    saveMandadosToStorage(merged);
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
    saveMandadosToStorage(updated);
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
      saveMandadosToStorage(updated);
      setMandados(updated);
      showToast("Mandado de prisão removido com sucesso!");
    }
  };

  const handleResetDB = () => {
    if (confirm("Deseja restaurar os dados de mandados iniciais pré-definidos do sistema?")) {
      saveMandadosToStorage(PRE_SEEDED_MANDADOS);
      setMandados(PRE_SEEDED_MANDADOS);
      showToast("Base de dados restaurada com sucesso!");
    }
  };

  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(mandados, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `mandados_cripto_${Date.now()}.json`);
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
            saveMandadosToStorage(parsed);
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

  const handleSearchClick = () => {
    if (attachedFiles.length === 0) {
      showToast("Por favor, selecione ao menos um arquivo .PDF primeiro!");
      return;
    }
    if (!searchQuery.trim()) {
      showToast("Digite o termo de pesquisa!");
      return;
    }
    setActiveSearchQuery(searchQuery);
  };

  interface FileLineMatch {
    fileName: string;
    pageNum: number;
    lineText: string;
  }

  // Calculate matching lines directly from PDFs and build dynamic warrant items on match
  const fileLinesMatched: FileLineMatch[] = [];
  const extraDynamicFromPdfs: Mandado[] = [];
  const activeQuery = (searchQuery || activeSearchQuery || '').toLowerCase().trim();

  if (activeQuery.length >= 2) {
    const normalizedQ = normalizeNameForSearch(activeQuery);
    
    attachedFiles.forEach(file => {
      if (file.pages && Array.isArray(file.pages)) {
        file.pages.forEach((page: any) => {
          if (page.lines && Array.isArray(page.lines)) {
            page.lines.forEach((lineText: string, lineIdx: number) => {
              const normLine = normalizeNameForSearch(lineText);
              const simpleLine = lineText.toLowerCase();
              
              if (normLine.includes(normalizedQ) || simpleLine.includes(activeQuery)) {
                const alreadyAddedMatch = fileLinesMatched.some(m => 
                  m.fileName === file.name && m.pageNum === page.pageNum && m.lineText === lineText
                );
                if (!alreadyAddedMatch) {
                  fileLinesMatched.push({
                    fileName: file.name,
                    pageNum: page.pageNum,
                    lineText: lineText
                  });
                }

                // Check if candidate is already in mandados
                const existsInMandados = mandados.some(m => 
                  normalizeNameForSearch(m.nome).includes(normalizedQ) ||
                  (m.alcunha && normalizeNameForSearch(m.alcunha).includes(normalizedQ)) ||
                  (m.nomeMae && normalizeNameForSearch(m.nomeMae).includes(normalizedQ)) ||
                  (m.numeroMandado && m.numeroMandado.includes(activeQuery))
                );

                if (!existsInMandados) {
                  const procMatch = lineText.match(/\b\d{3,10}-\d{2}\.\d{4}\b/) || lineText.match(/\b\d{5,10}-\d{2}\b/) || lineText.match(/BNMP[A-Z0-9-]+/i);
                  const numMandado = procMatch ? procMatch[0] : `BNMP-PDF-${page.pageNum}-${lineIdx}`;
                  const tipif = extractTipificacaoFromText(page.text || lineText);
                  const dateMatch = lineText.match(/\b\d{2}\/\d{2}\/\d{4}\b/);

                  let candidateName = lineText
                    .replace(/[\d\-./\\]/g, ' ')
                    .replace(/BNMP|MANDADO|PRISÃO|PENDENTE|CUMPRIMENTO|CONSELHO|NACIONAL|JUSTIÇA|TRIBUNAL|VARA|CRIMINAL/gi, '')
                    .replace(/\s+/g, ' ')
                    .trim();

                  if (candidateName.length >= 3) {
                    const dynamicItem: Mandado = {
                      id: `dynamic-pdf-${file.id}-${page.pageNum}-${lineIdx}`,
                      nome: candidateName.toUpperCase(),
                      numeroMandado: numMandado,
                      naturezaInfracao: tipif.motivo,
                      artigoLei: tipif.artigo,
                      orgaoEmissor: "Conselho Nacional de Justiça",
                      dataExpedicao: dateMatch ? dateMatch[0] : undefined,
                      situacao: "PENDENTE DE CUMPRIMENTO",
                      tipoPrisao: "Preventiva",
                      status: "Ativo",
                      gravidade: "Média"
                    };

                    if (!extraDynamicFromPdfs.some(d => d.nome === dynamicItem.nome || d.numeroMandado === dynamicItem.numeroMandado)) {
                      extraDynamicFromPdfs.push(dynamicItem);
                    }
                  }
                }
              }
            });
          }
        });
      }
    });
  }

  // Combined list for search
  const allPoolMandados = [...mandados, ...extraDynamicFromPdfs];

  // Filter combined pool
  const filteredMandados = allPoolMandados.filter(item => {
    const query = (searchQuery || activeSearchQuery || '').toLowerCase().trim();
    if (!query) {
      return attachedFiles.length > 0 ? true : false;
    }

    const normalizedQuery = normalizeNameForSearch(query);
    const normalizedNome = normalizeNameForSearch(item.nome);
    const normalizedAlcunha = normalizeNameForSearch(item.alcunha);
    const normalizedMae = normalizeNameForSearch(item.nomeMae);
    const normalizedPai = normalizeNameForSearch(item.nomePai);
    const normalizedOrgao = normalizeNameForSearch(item.orgaoEmissor);
    const normalizedInfracao = normalizeNameForSearch(item.naturezaInfracao);
    const normalizedArtigo = normalizeNameForSearch(item.artigoLei);

    const matchNome = normalizedNome.includes(normalizedQuery);
    const matchAlcunha = normalizedAlcunha.includes(normalizedQuery);
    const matchMae = normalizedMae.includes(normalizedQuery);
    const matchPai = normalizedPai.includes(normalizedQuery);
    const matchOrgao = normalizedOrgao.includes(normalizedQuery);
    const matchInfracao = normalizedInfracao.includes(normalizedQuery);
    const matchArtigo = normalizedArtigo.includes(normalizedQuery);

    const querySimple = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const matchCPF = item.cpf?.replace(/[.\-\s]/g, '').includes(query.replace(/[.\-\s]/g, ''));
    const matchRG = item.rg?.toLowerCase().includes(querySimple);
    const matchNum = item.numeroMandado?.replace(/[.\-/]/g, '').includes(query.replace(/[.\-/]/g, ''));
    const matchNasc = item.dataNascimento?.replace(/\//g, '').includes(query.replace(/\//g, ''));
    const matchSituacao = item.situacao?.toLowerCase().includes(querySimple);
    const matchDataExp = item.dataExpedicao?.replace(/\//g, '').includes(query.replace(/\//g, ''));

    return !!(
      matchNome || 
      matchAlcunha || 
      matchMae || 
      matchPai || 
      matchOrgao || 
      matchInfracao || 
      matchArtigo || 
      matchCPF || 
      matchRG || 
      matchNum || 
      matchNasc || 
      matchSituacao ||
      matchDataExp
    );
  });

  const handleAbrirPortal = () => {
    window.open('https://portalbnmp.cnj.jus.br/#/pesquisa-peca', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col min-h-screen bg-military-900 px-4 py-5 font-sans pb-28 text-black">
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[999] bg-emerald-600 border border-emerald-500 text-white px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-center font-mono"
          >
            <UserCheck className="w-4 h-4 text-white animate-pulse" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header bar back button */}
      <div className="flex items-center justify-between pb-4">
        <button 
          onClick={onBack}
          className="px-3 py-1.5 bg-military-800 hover:bg-military-850 border border-military-750 hover:border-military-700 rounded-xl flex items-center gap-2 group transition-all text-military-300 cursor-pointer shadow-sm font-semibold text-xs"
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform text-military-500" />
          <span className="font-bold text-xs uppercase tracking-wider">Voltar</span>
        </button>
      </div>

      {/* Military Plate Header */}
      <div className="w-full relative bg-military-800 border border-military-750 p-5 rounded-2xl mb-5 shadow-sm">
        <h1 className="text-lg font-black text-military-300 uppercase tracking-tight flex items-center gap-2 font-sans">
          <ShieldAlert className="w-5 h-5 text-military-500 flex-shrink-0" />
          MANDADOS DE PRISÃO
        </h1>
      </div>

      {/* Portal Nacional BNMP – Consulta de CPF Online no CNJ */}
      <div className="bg-red-50/50 border border-red-200/80 p-5 rounded-2xl mb-5 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 bg-red-100 text-red-700/90 border-l border-b border-red-200 px-3 py-1 rounded-bl-xl text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-2 h-2 bg-red-500 rounded-full" />
          Conexão Externa
        </div>

        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 bg-red-100 border border-red-150 rounded-xl text-red-700">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h2 className="text-sm font-black text-red-950 uppercase tracking-wider">
              CONSULTAR PORTAL BNMP ONLINE (CNJ)
            </h2>
            <p className="text-xs text-red-700 uppercase font-mono mt-0.5 leading-tight font-semibold">
              Acesso direto ao site oficial
            </p>
          </div>
        </div>

        <p className="text-xs text-red-900 leading-relaxed mb-4 uppercase font-medium">
          Acesse o portal nacional de mandados do Conselho Nacional de Justiça para realizar pesquisas utilizando filtros de CPF, nome de foragidos ou número de processo.
        </p>

        <div className="space-y-3">
          <button
            onClick={handleAbrirPortal}
            className="w-full bg-red-600 hover:bg-red-700 active:scale-[0.99] transition-all text-white font-black text-xs sm:text-sm py-3 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-sm"
          >
            <ExternalLink size={15} className="text-white" />
            <span>Pesquisar no Portal CNJ BNMP ↗</span>
          </button>
        </div>

        <div className="mt-2.5 flex items-center justify-center gap-1 text-[11px] font-mono text-red-700 uppercase font-semibold text-center">
          <span>portalbnmp.cnj.jus.br/#/pesquisa-peca</span>
        </div>
      </div>

      {/* Importador de PDF BNMP (Offline) */}
      <div className="bg-military-800 border border-military-750 p-5 rounded-2xl mb-5 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 bg-emerald-100 text-emerald-800 border-l border-b border-emerald-200 px-3 py-1 rounded-bl-xl text-[10px] font-mono font-black uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          100% OFF-LINE
        </div>

        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700">
            <FileText size={20} />
          </div>
          <div>
            <h2 className="text-sm font-black text-black uppercase tracking-wider">
              IMPORTAR MANDADOS EM PDF (BNMP)
            </h2>
            <p className="text-xs text-military-500 uppercase font-mono mt-0.5 leading-tight font-semibold">
              Processamento seguro local no dispositivo
            </p>
          </div>
        </div>

        <p className="text-xs text-military-600 leading-relaxed mb-4 uppercase font-medium">
          Carregue o arquivo PDF com as Certidões de Mandados de Prisão oficiais do BNMP. O App realizará a extração e inserção dos dados de forma local.
        </p>

        {/* Hidden input field for the PDF file picker */}
        <input 
          id="bnmp-pdf-picker"
          type="file" 
          accept=".pdf" 
          multiple
          className="hidden" 
          onChange={handleFileInputChange}
        />

        {attachedFiles.length === 0 ? (
          <button
            type="button"
            onClick={() => document.getElementById('bnmp-pdf-picker')?.click()}
            className="w-full bg-military-500 hover:bg-military-450 text-white active:scale-[0.98] border border-military-750 transition-all font-black text-xs sm:text-sm py-3.5 px-3 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-sm text-center leading-tight hover:border-military-500"
          >
            <Database size={15} className="text-white flex-shrink-0" />
            <span>SELECIONAR ARQUIVO .PDF PARA BUSCAR OFF-LINE</span>
          </button>
        ) : (
          <div className="space-y-2 mt-2">
            <span className="text-xs font-mono font-bold text-military-500 uppercase tracking-wider block">
              Documentos Anexados:
            </span>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {attachedFiles.map((f) => (
                <div key={f.id} className="flex items-center justify-between px-3 py-2.5 bg-military-900 border border-military-750 rounded-xl gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="w-4 h-4 text-military-500 flex-shrink-0" />
                    <span className="text-xs font-mono font-bold text-military-400 uppercase truncate" title={f.name}>
                      {f.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAttachedFile(f.id)}
                    className="p-1.5 px-2 text-red-600 hover:text-red-500 hover:bg-red-50 rounded transition-all flex items-center justify-center cursor-pointer"
                    title="Excluir arquivo"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => document.getElementById('bnmp-pdf-picker')?.click()}
              className="mt-2 text-center w-full block text-xs font-black text-military-500 hover:text-military-300 cursor-pointer uppercase tracking-wider py-1.5 hover:underline"
            >
              + Anexar outro arquivo PDF
            </button>
          </div>
        )}

        {isParsingPdf && (
          <div className="flex items-center justify-center gap-2 py-3 bg-military-900 border border-military-750 rounded-xl mt-3 animate-pulse">
            <div className="w-4 h-4 border border-military-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-military-500 font-mono font-bold uppercase tracking-wider">
              {parseProgress || "Lendo..."}
            </span>
          </div>
        )}

        {/* Real-time Field Search (Caixa de digitação) integrated in the same area */}
        <div className="relative mt-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por Nome, Vulgo, CPF ou Nº Mandado..."
            className="w-full bg-white text-black border border-military-700 focus:border-emerald-700 focus:outline-none rounded-xl py-3.5 pl-11 pr-4 placeholder-military-600 text-sm tracking-wide uppercase font-bold transition-all shadow-xs"
          />
          <Search className="absolute left-3.5 top-4 w-5 h-5 text-military-400" />
          {searchQuery && (
            <button 
              onClick={() => {
                setSearchQuery('');
                setActiveSearchQuery('');
              }}
              className="absolute right-3.5 top-4 hover:text-white text-military-400 whitespace-nowrap"
            >
              <X size={16} className="hover:scale-110 transition-transform" />
            </button>
          )}
        </div>

        {/* Button to search on local PDF/Warrants database */}
        <button
          type="button"
          onClick={handleSearchClick}
          className="w-full bg-emerald-700 hover:bg-emerald-600 active:scale-[0.99] transition-all text-white font-black text-xs sm:text-sm py-3.5 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-sm border border-emerald-500/30 mt-3"
        >
          <FileText size={16} className="text-emerald-300" />
          <span>Buscar Mandado no Arquivo .PDF</span>
        </button>

        {/* Discovered Warrants Pending Confirmation */}
        {parsedWarrants.length > 0 && (
          <div className="mt-4 bg-military-850 border border-military-750 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-military-750 pb-2">
              <span className="text-xs font-mono font-black text-emerald-700 uppercase tracking-widest flex items-center gap-1.5">
                <UserCheck size={14} />
                Suspeitos Encontrados ({parsedWarrants.length})
              </span>
              <button 
                onClick={() => setParsedWarrants([])}
                className="text-military-450 hover:text-red-600 text-xs font-bold uppercase cursor-pointer"
              >
                Limpar
              </button>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-2.5 pr-1">
              {parsedWarrants.map((item, idx) => (
                <div key={idx} className="bg-white border border-military-700/80 p-3 rounded-xl text-xs space-y-2 shadow-xs">
                  {/* 1. NOME DA PESSOA (PRIORITÁRIO) */}
                  <div className="bg-military-900/60 p-2 rounded-lg border border-military-700/60">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-mono font-black text-emerald-900 uppercase block tracking-wider">
                          1. NOME DA PESSOA:
                        </span>
                        <span 
                          className="font-black uppercase text-sm sm:text-base block leading-tight break-words"
                          style={{ color: '#000000' }}
                        >
                          {item.nome}
                        </span>
                      </div>
                      <span className="bg-emerald-100 border border-emerald-300 text-emerald-950 text-[10px] font-black uppercase px-2 py-0.5 rounded flex-shrink-0">
                        {item.tipoPrisao || 'PREVENTIVA'}
                      </span>
                    </div>
                  </div>
                  
                  {/* 2. CPF & 3. NOME DA MÃE */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-military-900/40 p-2 rounded-lg border border-military-700/40">
                      <span className="text-[10px] font-mono font-black text-emerald-900 uppercase block">2. CPF:</span>
                      <span className="font-mono font-black text-xs sm:text-sm block mt-0.5" style={{ color: '#000000' }}>
                        {item.cpf || <span className="text-military-500 italic font-normal text-xs">NÃO INFORMADO</span>}
                      </span>
                    </div>
                    <div className="bg-military-900/40 p-2 rounded-lg border border-military-700/40">
                      <span className="text-[10px] font-mono font-black text-emerald-900 uppercase block">3. NOME DA MÃE:</span>
                      <span className="font-black text-xs sm:text-sm block truncate uppercase mt-0.5" style={{ color: '#000000' }}>
                        {item.nomeMae || <span className="text-military-500 italic font-normal text-xs">NÃO INFORMADO</span>}
                      </span>
                    </div>
                  </div>

                  {/* 4. SITUAÇÃO & 5. DATA DA EMISSÃO */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-military-900/40 p-2 rounded-lg border border-military-700/40">
                      <span className="text-[10px] font-mono font-black text-emerald-900 uppercase block">4. SITUAÇÃO:</span>
                      <span className="font-black text-emerald-950 text-[10px] sm:text-xs uppercase block bg-emerald-100/90 border border-emerald-300 px-2 py-0.5 rounded mt-0.5 text-center">
                        {item.situacao || 'PENDENTE DE CUMPRIMENTO'}
                      </span>
                    </div>
                    <div className="bg-military-900/40 p-2 rounded-lg border border-military-700/40">
                      <span className="text-[10px] font-mono font-black text-emerald-900 uppercase block">5. DATA DA EMISSÃO:</span>
                      <span className="font-mono font-black text-xs sm:text-sm block mt-0.5" style={{ color: '#000000' }}>
                        {item.dataExpedicao || <span className="text-military-500 italic font-normal text-xs">NÃO INFORMADO</span>}
                      </span>
                    </div>
                  </div>

                  {/* POSTERIORMENTE: DEMAIS DADOS EXISTENTES */}
                  <div className="pt-2 border-t border-military-700/50 text-xs font-mono text-military-600 block truncate uppercase">
                    REGISTRO / PROCESSO: <span className="font-bold text-black">{item.numeroMandado}</span>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={confirmImportWarrants}
              className="w-full bg-emerald-700 hover:bg-emerald-600 transition-all text-white font-black text-xs sm:text-sm py-3 rounded-xl uppercase tracking-wider block text-center cursor-pointer shadow-sm"
            >
              Confirmar Importação de ({parsedWarrants.length}) Mandados
            </button>
          </div>
        )}

        {/* Integrated List of Loaded/Filtered Warrants */}
        {filteredMandados.length > 0 && (
          <div className="mt-5 pt-4 border-t border-military-750 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-military-400 px-0.5 pb-1 font-bold">
              <span className="uppercase tracking-wider flex items-center gap-1.5 text-military-300">
                <Database className="w-4 h-4 text-emerald-700" />
                Mandados Carregados:
              </span>
              <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 px-2.5 py-1 rounded-lg font-black text-xs">
                {filteredMandados.length} ATIVOS LOCAL
              </span>
            </div>

            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {filteredMandados.map((item) => {
                const isExpanded = expandedId === item.id;
                const cardBg = isExpanded
                  ? 'bg-white border-military-600 shadow-md text-black'
                  : 'bg-white hover:border-military-600 border-military-750 text-black transition-all';

                return (
                  <div
                    key={item.id}
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className={`w-full text-left rounded-xl border p-3.5 shadow-xs transition-all relative overflow-hidden cursor-pointer ${cardBg}`}
                  >
                    {/* PRIORIDADE DE EXIBIÇÃO: 1. Nome da pessoa, 2. CPF, 3. Nome da mãe, 4. Situação, 5. Data da Emissão */}
                    <div className="space-y-2.5">
                      {/* 1. NOME DA PESSOA (DESTAQUE PRIORITÁRIO) */}
                      <div className="bg-military-900/60 p-3 rounded-xl border border-military-700/70">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-mono font-black text-emerald-900 uppercase block tracking-wider mb-0.5">
                              1. NOME DA PESSOA:
                            </span>
                            <h4 
                              className="font-black text-base sm:text-lg tracking-wide uppercase leading-snug break-words"
                              style={{ color: '#000000' }}
                            >
                              <HighlightedText text={item.nome} query={searchQuery || activeSearchQuery || ''} className="text-black font-black" />
                            </h4>
                          </div>
                          
                          <div className="text-military-600 flex-shrink-0 pt-0.5">
                            {isExpanded ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-900 bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-300">
                                <ChevronUp className="w-3.5 h-3.5" />
                                Menos detalhes
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-military-600 bg-white px-2.5 py-1 rounded-lg border border-military-700">
                                <ChevronDown className="w-3.5 h-3.5" />
                                Mais detalhes
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 2. CPF & 3. NOME DA MÃE */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="bg-military-900/40 p-2.5 rounded-lg border border-military-700/60">
                          <span className="text-[10px] font-mono font-black text-emerald-900 uppercase block tracking-wider">
                            2. CPF:
                          </span>
                          <p className="font-mono font-black text-sm sm:text-base select-all mt-0.5" style={{ color: '#000000' }}>
                            {item.cpf ? (
                              <HighlightedText text={item.cpf} query={searchQuery || activeSearchQuery || ''} className="text-black font-mono font-black" />
                            ) : (
                              <span className="text-military-500 italic font-normal text-xs">NÃO INFORMADO</span>
                            )}
                          </p>
                        </div>

                        <div className="bg-military-900/40 p-2.5 rounded-lg border border-military-700/60">
                          <span className="text-[10px] font-mono font-black text-emerald-900 uppercase block tracking-wider">
                            3. NOME DA MÃE:
                          </span>
                          <p className="font-black text-sm sm:text-base uppercase truncate mt-0.5" style={{ color: '#000000' }}>
                            {item.nomeMae ? (
                              <HighlightedText text={item.nomeMae} query={searchQuery || activeSearchQuery || ''} className="text-black font-black" />
                            ) : (
                              <span className="text-military-500 italic font-normal text-xs">NÃO INFORMADO</span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* 4. SITUAÇÃO & 5. DATA DA EMISSÃO */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="bg-military-900/40 p-2.5 rounded-lg border border-military-700/60">
                          <span className="text-[10px] font-mono font-black text-emerald-900 uppercase block tracking-wider">
                            4. SITUAÇÃO:
                          </span>
                          <div className="mt-1">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-black uppercase tracking-wider border shadow-xs ${
                              item.situacao?.toUpperCase().includes('CUMPRIDO')
                                ? 'bg-blue-100 text-blue-950 border-blue-400'
                                : item.situacao?.toUpperCase().includes('REVOGADO')
                                ? 'bg-amber-100 text-amber-950 border-amber-400'
                                : 'bg-emerald-100 text-emerald-950 border-emerald-400'
                            }`}>
                              <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                              {item.situacao || 'PENDENTE DE CUMPRIMENTO'}
                            </span>
                          </div>
                        </div>

                        <div className="bg-military-900/40 p-2.5 rounded-lg border border-military-700/60">
                          <span className="text-[10px] font-mono font-black text-emerald-900 uppercase block tracking-wider">
                            5. DATA DA EMISSÃO:
                          </span>
                          <p className="font-mono font-black text-sm sm:text-base mt-0.5" style={{ color: '#000000' }}>
                            {item.dataExpedicao ? (
                              <HighlightedText text={item.dataExpedicao} query={searchQuery || activeSearchQuery || ''} className="text-black font-mono font-black" />
                            ) : (
                              <span className="text-military-500 italic font-normal text-xs">NÃO INFORMADO</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* POSTERIORMENTE: DEMAIS DADOS EXISTENTES */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden mt-3 pt-3 border-t border-military-750/80 space-y-2.5 text-xs text-black"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="bg-military-900/40 p-3.5 rounded-xl border border-military-700/60 space-y-3">
                            <div className="text-xs font-mono font-black text-emerald-900 uppercase tracking-wider border-b border-military-700/60 pb-1.5 flex items-center gap-1.5">
                              <FileText size={14} className="text-emerald-700" />
                              Demais Dados do Mandado
                            </div>

                            {/* Número do Mandado */}
                            <div>
                              <span className="text-[10px] font-mono text-emerald-900 uppercase font-black block tracking-wider">
                                NÚMERO DO MANDADO / PROCESSO:
                              </span>
                              <span className="font-mono font-black text-emerald-900 text-xs sm:text-sm block select-all break-all mt-0.5">
                                {item.numeroMandado}
                              </span>
                            </div>

                            {/* Motivo / Infração */}
                            <div>
                              <span className="text-[10px] font-mono text-emerald-900 uppercase font-black block tracking-wider">
                                MOTIVO / INFRAÇÃO:
                              </span>
                              <span className="font-bold text-xs sm:text-sm block uppercase mt-0.5" style={{ color: '#000000' }}>
                                {item.naturezaInfracao || item.artigoLei || 'MANDADO DE PRISÃO'}
                              </span>
                            </div>

                            {/* Alcunha & Data de Nascimento */}
                            <div className="grid grid-cols-2 gap-2.5 pt-1.5 border-t border-military-700/60">
                              <div>
                                <span className="text-[10px] font-mono text-emerald-900 uppercase font-black block tracking-wider">
                                  ALCUNHA / VULGO:
                                </span>
                                <span className="font-bold text-xs sm:text-sm block uppercase mt-0.5" style={{ color: '#000000' }}>
                                  {item.alcunha ? <HighlightedText text={item.alcunha} query={searchQuery || activeSearchQuery || ''} className="text-black font-bold" /> : 'NÃO INFORMADO'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] font-mono text-emerald-900 uppercase font-black block tracking-wider">
                                  DATA DE NASCIMENTO:
                                </span>
                                <span className="font-bold text-xs sm:text-sm block mt-0.5" style={{ color: '#000000' }}>
                                  {item.dataNascimento || 'NÃO INFORMADO'}
                                </span>
                              </div>
                            </div>

                            {/* Órgão Emissor & Tipo de Prisão */}
                            <div className="grid grid-cols-2 gap-2.5 pt-1.5 border-t border-military-700/60">
                              <div>
                                <span className="text-[10px] font-mono text-emerald-900 uppercase font-black block tracking-wider">
                                  ÓRGÃO EMISSOR:
                                </span>
                                <span className="font-bold text-xs sm:text-sm block uppercase mt-0.5" style={{ color: '#000000' }}>
                                  {item.orgaoEmissor || 'CONSELHO NACIONAL DE JUSTIÇA'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] font-mono text-emerald-900 uppercase font-black block tracking-wider">
                                  TIPO DE PRISÃO:
                                </span>
                                <span className="font-bold text-xs sm:text-sm block uppercase mt-0.5" style={{ color: '#000000' }}>
                                  {item.tipoPrisao || 'PREVENTIVA'}
                                </span>
                              </div>
                            </div>

                            {/* RG & Nome do Pai */}
                            {(item.rg || item.nomePai) && (
                              <div className="grid grid-cols-2 gap-2.5 pt-1.5 border-t border-military-700/60">
                                {item.rg && (
                                  <div>
                                    <span className="text-[10px] font-mono text-emerald-900 uppercase font-black block tracking-wider">
                                      RG:
                                    </span>
                                    <span className="font-mono font-bold text-xs sm:text-sm block mt-0.5" style={{ color: '#000000' }}>
                                      {item.rg}
                                    </span>
                                  </div>
                                )}
                                {item.nomePai && (
                                  <div>
                                    <span className="text-[10px] font-mono text-emerald-900 uppercase font-black block tracking-wider">
                                      NOME DO PAI:
                                    </span>
                                    <span className="font-bold text-xs sm:text-sm block uppercase mt-0.5" style={{ color: '#000000' }}>
                                      {item.nomePai}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Observações */}
                            {item.observacoes && (
                              <div className="pt-1.5 border-t border-military-700/60">
                                <span className="text-[10px] font-mono text-emerald-900 uppercase font-black block tracking-wider">
                                  OBSERVAÇÕES:
                                </span>
                                <p className="text-xs sm:text-sm mt-0.5 leading-relaxed" style={{ color: '#000000' }}>
                                  {item.observacoes}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-end pt-1.5">
                            <button
                              type="button"
                              onClick={(e) => handleDeleteWarrant(item.id, e)}
                              className="px-3 py-1.5 bg-red-100 hover:bg-red-200 border border-red-300 text-red-800 rounded-lg text-xs uppercase font-black flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                            >
                              <Trash2 size={13} className="text-red-700" />
                              Deletar Registro
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Dynamic occurrence listing for matching general words */}
        {activeSearchQuery && fileLinesMatched.length > 0 && (
          <div className="mt-5 pt-4 border-t border-military-800 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-military-450 px-0.5 pb-1 font-bold">
              <span className="uppercase tracking-wider flex items-center gap-1.5">
                <SearchIcon className="w-4 h-4 text-[#e1b12c]" />
                Ocorrências de texto nos documentos:
              </span>
              <span className="bg-yellow-950/80 border border-yellow-800/30 text-yellow-500 px-2.5 py-1 rounded-lg font-black text-xs">
                {fileLinesMatched.length} Trechos
              </span>
            </div>

            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {fileLinesMatched.map((match, idx) => (
                <div key={idx} className="bg-white border border-military-700/80 p-3.5 rounded-xl space-y-2 shadow-xs">
                  <div className="flex items-center justify-between text-[11px] font-mono text-military-600 font-bold">
                    <span className="truncate max-w-[70%] text-emerald-900 font-bold">{match.fileName}</span>
                    <span className="text-military-600 font-mono">Pág. {match.pageNum}</span>
                  </div>
                  <p className="text-xs sm:text-sm font-sans leading-relaxed font-bold" style={{ color: '#000000' }}>
                    <HighlightedText text={match.lineText} query={activeSearchQuery} className="text-black font-semibold" />
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty search matches integrated in the same area */}
        {activeSearchQuery && filteredMandados.length === 0 && fileLinesMatched.length === 0 && (
          <div className="mt-5 pt-4 border-t border-military-750 text-center py-8 px-4 bg-military-850/50 rounded-xl">
            <UserCheck className="w-9 h-9 text-military-500/40 mx-auto mb-2" />
            <p className="text-xs font-bold text-military-400 uppercase tracking-wider mb-1">Nenhum registro encontrado</p>
            <p className="text-xs text-military-500 max-w-xs mx-auto leading-normal uppercase font-medium">
              Sem resultados na pesquisa off-line. Altere os termos da busca ou carregue novas certidões de mandado.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
