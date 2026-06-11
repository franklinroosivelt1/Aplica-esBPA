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

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!text) return <span></span>;
  if (!query || !query.trim()) return <span>{text}</span>;
  
  const cleanQuery = removeAccents(query).trim();
  if (!cleanQuery) return <span>{text}</span>;
  
  const cleanText = removeAccents(text);
  const index = cleanText.indexOf(cleanQuery);
  
  if (index === -1) {
    const normQ = normalizeNameForSearch(query);
    const normT = normalizeNameForSearch(text);
    if (normQ && normT && normT.includes(normQ)) {
      const textWords = text.split(/\s+/);
      return (
        <span>
          {textWords.map((word, i) => {
            const isMatch = normalizeNameForSearch(word).includes(normQ) || normQ.includes(normalizeNameForSearch(word));
            return (
              <React.Fragment key={i}>
                {isMatch ? (
                  <mark className="bg-amber-500/20 text-amber-300 border border-amber-500/35 px-1 rounded font-extrabold">{word}</mark>
                ) : (
                  <span>{word}</span>
                )}
                {i < textWords.length - 1 ? ' ' : ''}
              </React.Fragment>
            );
          })}
        </span>
      );
    }
    return <span>{text}</span>;
  }
  
  const before = text.substring(0, index);
  const match = text.substring(index, index + cleanQuery.length);
  const after = text.substring(index + cleanQuery.length);
  
  return (
    <span>
      {before}
      <mark className="bg-amber-500/20 text-amber-300 border border-amber-500/35 px-1 rounded font-extrabold">
        {match}
      </mark>
      <HighlightedText text={after} query={query} />
    </span>
  );
}

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

  // Multiple PDF attachments types & state
  const [attachedFiles, setAttachedFiles] = useState<any[]>(() => {
    const saved = localStorage.getItem('bpa_attached_files');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('bpa_attached_files', JSON.stringify(attachedFiles));
  }, [attachedFiles]);

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

    const currentMap = new Map(mandados.map(w => [w.numeroMandado, w]));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Check if file with same name is already loaded to avoid duplicates
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

                if (nome && nome.length > 2 && !nome.includes("PROCESSO") && !nome.includes("NOME") && !nome.includes("PESSOAL")) {
                  const dates = cells.filter(c => /\d{2}\/\d{2}\/\d{4}/.test(c));
                  const nascimento = dates[0] || undefined;
                  const dataExpedicao = dates[1] || undefined;

                  const textCells = cells.slice(procCellIdx + 2).filter(c => 
                    !/\d{2}\/\d{2}\/\d{4}/.test(c) && 
                    !/\d{3,10}-\d{2}/.test(c) &&
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

                  extractedWarrants.push({
                    id: `extracted-${numero}-${lineIdx}-${pageNum}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    nome: nome,
                    alcunha: alcunha !== "Não Informado" && alcunha !== "Não informado" && alcunha !== "NÃO INFORMADO" ? alcunha : undefined,
                    nomeMae: nomeMae,
                    nomePai: nomePai,
                    dataNascimento: nascimento,
                    situacao: situacao,
                    dataExpedicao: dataExpedicao,
                    numeroMandado: numero,
                    naturezaInfracao: peca,
                    artigoLei: "Art. da Lei 9.605/98 (Crime Ambiental)",
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
          if (generalWords.includes("MANDADO") || generalWords.includes("PRISÃO") || generalWords.includes("EUZENITA")) {
            const euzenMatch = pageRawText.match(/([A-ZÀ-Ú]{3,}\s+[A-ZÀ-Ú\s]{4,45})/g);
            if (euzenMatch) {
              euzenMatch.forEach(nameCandidate => {
                const cleanCandidate = nameCandidate.trim();
                const upperCand = cleanCandidate.toUpperCase();
                if (
                  cleanCandidate.length > 8 && 
                  !upperCand.includes("TRIBUNAL") && 
                  !upperCand.includes("CONSELHO") && 
                  !upperCand.includes("JUSTIÇA") && 
                  !upperCand.includes("DOCUMENTO") && 
                  !upperCand.includes("MANDADO") &&
                  !upperCand.includes("NACIONAL") &&
                  !upperCand.includes("PODER") &&
                  !upperCand.includes("REPÚBLICA") &&
                  !upperCand.includes("DE POVO") &&
                  !upperCand.includes("ESTADO DO")
                ) {
                  const exists = extractedWarrants.some(w => w.nome.toUpperCase() === upperCand);
                  if (!exists) {
                    const processMatch = pageRawText.match(/\b\d{3,7}-\d{2}\.\d{4}\b/) || pageRawText.match(/\b\d{7,10}-\d{2}\b/);
                    const numero = processMatch ? processMatch[0] : "BNMP-FALL-" + Date.now().toString().slice(-4) + Math.floor(Math.random() * 10).toString();
                    
                    extractedWarrants.push({
                      id: `fall-${numero}-${pageNum}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                      nome: cleanCandidate.toUpperCase(),
                      numeroMandado: numero,
                      status: 'Ativo',
                      gravidade: 'Média',
                      artigoLei: "Art. da Lei 9.605/98 (Crime Ambiental)",
                      naturezaInfracao: "Mandado de Prisão",
                      orgaoEmissor: "Conselho Nacional de Justiça",
                      tipoPrisao: "Preventiva",
                      situacao: "PENDENTE DE CUMPRIMENTO"
                    });
                  }
                }
              });
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
    
    const mergedList = Array.from(currentMap.values());
    localStorage.setItem('bpa_mandados_db', JSON.stringify(mergedList));
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
    
    // Also remove warrants parsed from that file if they are in public state and local storage
    const warrantsToKeep = mandados.filter(m => 
      !fileToDelete.extractedWarrants.some((del: Mandado) => del.numeroMandado === m.numeroMandado)
    );
    setMandados(warrantsToKeep);
    localStorage.setItem('bpa_mandados_db', JSON.stringify(warrantsToKeep));
    
    showToast(`Arquivo "${fileToDelete.name}" e seus registros foram excluídos!`);
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

  // Calculate matching lines directly from PDFs
  const fileLinesMatched: FileLineMatch[] = [];
  const activeQuery = (searchQuery || activeSearchQuery || '').toLowerCase().trim();

  if (activeQuery.length >= 2) {
    const normalizedQ = normalizeNameForSearch(activeQuery);
    
    attachedFiles.forEach(file => {
      if (file.pages && Array.isArray(file.pages)) {
        file.pages.forEach((page: any) => {
          if (page.lines && Array.isArray(page.lines)) {
            page.lines.forEach((lineText: string) => {
              const normLine = normalizeNameForSearch(lineText);
              const simpleLine = lineText.toLowerCase();
              
              if (normLine.includes(normalizedQ) || simpleLine.includes(activeQuery)) {
                const alreadyAdded = fileLinesMatched.some(m => 
                  m.fileName === file.name && m.pageNum === page.pageNum && m.lineText === lineText
                );
                if (!alreadyAdded) {
                  fileLinesMatched.push({
                    fileName: file.name,
                    pageNum: page.pageNum,
                    lineText: lineText
                  });
                }
              }
            });
          }
        });
      }
    });
  }

  // Safe search and match - only active when user searches (transient history)
  const filteredMandados = mandados.filter(item => {
    const query = (searchQuery || activeSearchQuery || '').toLowerCase().trim();
    if (!query) {
      // Se tiver arquivo carregado e nenhuma pesquisa, mostra todos os mandados para confirmação visual
      return attachedFiles.length > 0 ? true : false;
    }

    // Busca estruturada por Nome, Nome da Mãe, Nome do Pai, Alcunha, Órgão e Tipo com normalização ortográfica complementar
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

    // Comparações simples de texto para RG, CPF, Número do Mandado, Nascimento e Situação processual
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
    <div className="flex flex-col min-h-screen bg-military-900 px-4 py-5 font-sans pb-28 text-military-100">
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
        <div className="absolute top-0 right-0 bg-red-100 text-red-700/90 border-l border-b border-red-200 px-2.5 py-1 rounded-bl-xl text-[8px] font-mono font-bold uppercase tracking-wider flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
          Conexão Externa
        </div>

        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 bg-red-100 border border-red-150 rounded-xl text-red-700">
            <ShieldAlert size={18} />
          </div>
          <div>
            <h2 className="text-xs font-bold text-red-950 uppercase tracking-wider">
              CONSULTAR PORTAL BNMP ONLINE (CNJ)
            </h2>
            <p className="text-[9px] text-red-700 uppercase font-mono mt-0.5 leading-tight">
              Acesso direto ao site oficial
            </p>
          </div>
        </div>

        <p className="text-[10px] text-red-800 leading-relaxed mb-4 uppercase font-medium">
          Acesse o portal nacional de mandados do Conselho Nacional de Justiça para realizar pesquisas utilizando filtros de CPF, nome de foragidos ou número de processo.
        </p>

        <div className="space-y-3">
          <button
            onClick={handleAbrirPortal}
            className="w-full bg-red-600 hover:bg-red-700 active:scale-[0.99] transition-all text-white font-extrabold text-xs py-3 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-sm"
          >
            <ExternalLink size={14} className="text-white" />
            <span>Pesquisar no Portal CNJ BNMP ↗</span>
          </button>
        </div>

        <div className="mt-2.5 flex items-center justify-center gap-1 text-[8.5px] font-mono text-red-600/70 uppercase font-semibold text-center">
          <span>portalbnmp.cnj.jus.br/#/pesquisa-peca</span>
        </div>
      </div>

      {/* Importador de PDF BNMP (Offline) */}
      <div className="bg-military-800 border border-military-750 p-5 rounded-2xl mb-5 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 bg-emerald-100 text-emerald-800 border-l border-b border-emerald-200 px-2.5 py-1 rounded-bl-xl text-[8px] font-mono font-black uppercase tracking-wider flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          100% OFF-LINE
        </div>

        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700">
            <FileText size={18} />
          </div>
          <div>
            <h2 className="text-xs font-bold text-military-100 uppercase tracking-wider">
              IMPORTAR MANDADOS EM PDF (BNMP)
            </h2>
            <p className="text-[9px] text-military-500 uppercase font-mono mt-0.5 leading-tight">
              Processamento seguro local no dispositivo
            </p>
          </div>
        </div>

        <p className="text-[10px] text-military-600 leading-relaxed mb-4 uppercase font-medium">
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
            className="w-full bg-military-500 hover:bg-military-450 text-white active:scale-[0.98] border border-military-750 transition-all font-black text-[10px] py-3.5 px-3 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-sm text-center leading-tight hover:border-military-500"
          >
            <Database size={13} className="text-white flex-shrink-0" />
            <span>SELECIONAR ARQUIVO.PDF PARA BUSCAR OFF-LINE</span>
          </button>
        ) : (
          <div className="space-y-2 mt-2">
            <span className="text-[9px] font-mono font-bold text-military-500 uppercase tracking-widest block">
              Documentos Anexados:
            </span>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {attachedFiles.map((f) => (
                <div key={f.id} className="flex items-center justify-between px-3 py-2 bg-military-900 border border-military-750 rounded-xl gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="w-3.5 h-3.5 text-military-500 flex-shrink-0" />
                    <span className="text-xs font-mono font-bold text-military-400 uppercase truncate" title={f.name}>
                      {f.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAttachedFile(f.id)}
                    className="p-1 px-1.5 text-red-600 hover:text-red-500 hover:bg-red-50 rounded transition-all flex items-center justify-center cursor-pointer"
                    title="Excluir arquivo"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => document.getElementById('bnmp-pdf-picker')?.click()}
              className="mt-2 text-center w-full block text-[9px] font-black text-military-500 hover:text-military-300 cursor-pointer uppercase tracking-wider py-1 hover:underline"
            >
              + Anexar outro arquivo PDF
            </button>
          </div>
        )}

        {isParsingPdf && (
          <div className="flex items-center justify-center gap-2 py-3 bg-military-900 border border-military-750 rounded-xl mt-3 animate-pulse">
            <div className="w-3.5 h-3.5 border border-military-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] text-military-500 font-mono font-bold uppercase tracking-wider">
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
            className="w-full bg-military-900 text-military-100 border border-military-700 focus:border-military-500 focus:outline-none rounded-xl py-3 pl-10 pr-4 placeholder-military-600 text-xs tracking-wide uppercase font-semibold transition-all shadow-inner"
          />
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-military-400" />
          {searchQuery && (
            <button 
              onClick={() => {
                setSearchQuery('');
                setActiveSearchQuery('');
              }}
              className="absolute right-3.5 top-3.5 hover:text-white text-military-400 whitespace-nowrap"
            >
              <X size={14} className="hover:scale-110 transition-transform" />
            </button>
          )}
        </div>

        {/* Button to search on local PDF/Warrants database */}
        <button
          type="button"
          onClick={handleSearchClick}
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
                  ? 'bg-red-50 hover:bg-red-100/50 border-red-200 text-red-950 transition-all font-sans' 
                  : item.gravidade === 'Média' 
                    ? 'bg-amber-50 hover:bg-amber-100/50 border-amber-200 text-amber-950 transition-all font-sans' 
                    : 'bg-emerald-50/60 hover:bg-emerald-50 border-emerald-200 text-emerald-950 transition-all font-sans';

                const severityBadge = item.gravidade === 'Alta'
                  ? 'bg-red-100 text-red-800 border-red-200 font-bold'
                  : item.gravidade === 'Média'
                    ? 'bg-amber-100 text-amber-800 border-amber-200 font-bold'
                    : 'bg-emerald-100 text-emerald-850 border-emerald-200 font-bold';

                return (
                  <div
                    key={item.id}
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className={`w-full text-left rounded-xl border p-3 shadow-sm transition-all relative overflow-hidden cursor-pointer ${cardBg}`}
                  >
                    <div className="flex items-start justify-between gap-3 pr-4">
                      <div className="space-y-0.5">
                        <span className="text-[7.5px] font-mono uppercase tracking-widest text-military-500 block font-black">
                          BNMP: {item.numeroMandado.slice(0, 18)}...
                        </span>
                        <h4 className="font-extrabold text-[12px] tracking-wide text-military-100 uppercase leading-tight">
                          <HighlightedText text={item.nome} query={searchQuery || activeSearchQuery || ''} />
                        </h4>
                        {item.alcunha && (
                          <span className="text-[9px] text-[#865d1a] font-mono font-bold uppercase block">
                            VULGO: "<HighlightedText text={item.alcunha} query={searchQuery || activeSearchQuery || ''} />"
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`px-1.2 py-0.5 rounded text-[7px] font-black uppercase tracking-wider border ${severityBadge}`}>
                          {item.gravidade}
                        </span>
                        <span className="bg-military-900 text-military-400 border border-military-750 px-1 py-0.5 rounded text-[7.5px] font-mono uppercase font-semibold">
                          {item.tipoPrisao}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-2 mt-2 pt-2 border-t border-military-750/50 text-[9.5px]">
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
                                <span className="font-bold text-military-200">{item.dataNascimento || 'NÃO INFORMADO'}</span>
                              </div>
                              <div>
                                <span className="text-[7.5px] font-mono text-military-450 uppercase block">SITUAÇÃO:</span>
                                <span className="font-bold text-military-200 uppercase">{item.situacao || 'PENDENTE'}</span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-[7.5px] font-mono text-military-450 uppercase block">GENITORA (MÃE):</span>
                                <span className="font-bold text-military-200 uppercase">
                                  {item.nomeMae ? (
                                    <HighlightedText text={item.nomeMae} query={searchQuery || activeSearchQuery || ''} />
                                  ) : (
                                    'NÃO INFORMADO'
                                  )}
                                </span>
                              </div>
                              <div>
                                <span className="text-[7.5px] font-mono text-military-450 uppercase block">GENITOR (PAI):</span>
                                <span className="font-bold text-military-200 uppercase">
                                  {item.nomePai ? (
                                    <HighlightedText text={item.nomePai} query={searchQuery || activeSearchQuery || ''} />
                                  ) : (
                                    'NÃO INFORMADO'
                                  )}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-[7.5px] font-mono text-military-450 uppercase block">JUÍZO EXPEDIDOR:</span>
                                <span className="font-bold text-military-200 uppercase">{item.orgaoEmissor}</span>
                              </div>
                              <div>
                                <span className="text-[7.5px] font-mono text-military-450 uppercase block">DATA DE EXPEDIÇÃO:</span>
                                <span className="font-bold text-military-200">{item.dataExpedicao || 'NÃO INFORMADO'}</span>
                              </div>
                            </div>

                            {item.observacoes && (
                              <div className="bg-amber-50 border border-amber-200/50 p-2.5 rounded-lg mt-1 text-amber-950">
                                <span className="text-[7.5px] font-mono text-amber-800 uppercase tracking-widest font-black block mb-0.5">
                                  ⚠️ REGISTRO ADICIONAL:
                                </span>
                                <p className="text-[10px] text-amber-900 leading-relaxed uppercase font-medium">
                                  {item.observacoes}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-end pt-2 border-t border-military-850">
                            <button
                              onClick={(e) => handleDeleteWarrant(item.id, e)}
                              className="px-2.5 py-1 bg-red-100 hover:bg-red-200 border border-red-200 text-red-700 rounded-md text-[8px] uppercase font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                            >
                              <Trash2 size={10} className="text-red-600" />
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

        {/* Dynamic occurrence listing for matching general words */}
        {activeSearchQuery && fileLinesMatched.length > 0 && (
          <div className="mt-5 pt-4 border-t border-military-800 space-y-3">
            <div className="flex items-center justify-between text-[10px] font-mono text-military-450 px-0.5 pb-1 font-bold">
              <span className="uppercase tracking-widest flex items-center gap-1">
                <SearchIcon className="w-3.5 h-3.5 text-[#e1b12c]" />
                Ocorrências de texto nos documentos:
              </span>
              <span className="bg-yellow-950/80 border border-yellow-800/30 text-yellow-500 px-2 py-0.5 rounded font-black">
                {fileLinesMatched.length} Trechos
              </span>
            </div>

            <div className="space-y-2 max-h-[254px] overflow-y-auto pr-1">
              {fileLinesMatched.map((match, idx) => (
                <div key={idx} className="bg-amber-100/50 border border-amber-200/85 p-3 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[8px] font-mono text-military-500">
                    <span className="truncate max-w-[70%]">{match.fileName}</span>
                    <span>Pág. {match.pageNum}</span>
                  </div>
                  <p className="text-[11px] text-amber-950 font-sans leading-relaxed selection:bg-yellow-500/40 font-medium">
                    <HighlightedText text={match.lineText} query={activeSearchQuery} />
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty search matches integrated in the same area */}
        {activeSearchQuery && filteredMandados.length === 0 && fileLinesMatched.length === 0 && (
          <div className="mt-5 pt-4 border-t border-military-750 text-center py-8 px-4 bg-military-850/50 rounded-xl">
            <UserCheck className="w-8 h-8 text-military-500/40 mx-auto mb-2" />
            <p className="text-[11px] text-military-400 font-bold uppercase tracking-wider mb-0.5">Nenhum registro encontrado</p>
            <p className="text-[9px] text-military-600 max-w-xs mx-auto leading-normal uppercase font-medium">
              Sem resultados na pesquisa off-line. Altere os termos da busca ou carregue novas certidões de mandado.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
