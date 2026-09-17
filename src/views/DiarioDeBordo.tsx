import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  Plus, 
  Trash2, 
  Edit3, 
  Clock, 
  Calendar, 
  Search, 
  X, 
  Check, 
  Copy, 
  Share2, 
  BookOpen, 
  FileText,
  AlertCircle,
  Sparkles,
  Tag
} from 'lucide-react';

export interface DiarioNote {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt?: number;
  category?: string;
}

interface DiarioDeBordoProps {
  onBack: () => void;
}

const STORAGE_KEY = 'bpa_diario_de_bordo_notes';

const CATEGORIES = [
  'Geral',
  'Patrulhamento',
  'Fiscalização',
  'Ocorrência',
  'Abordagem',
  'Vistoria'
];

export default function DiarioDeBordo({ onBack }: DiarioDeBordoProps) {
  const [notes, setNotes] = useState<DiarioNote[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Erro ao carregar anotações do diário:', e);
    }
    // Exemplo inicial padrão de serviço
    return [
      {
        id: 'note-sample-1',
        title: 'Patrulhamento Preventivo - Eixo Ambiental',
        content: 'Equipe em deslocamento para inspeção preventiva no ramal. Viatura abastecida e operando normalmente. Sem alterações no trajeto durante o período matutino.',
        createdAt: Date.now() - 1000 * 60 * 60 * 3, // 3 horas atrás
        category: 'Patrulhamento'
      }
    ];
  });

  const [isEditing, setIsEditing] = useState(false);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [contentInput, setContentInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('Geral');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<DiarioNote | null>(null);

  // Salvar no localStorage sempre que houver alterações
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch (e) {
      console.error('Erro ao persistir notas:', e);
    }
  }, [notes]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Abre editor para nova anotação
  const handleOpenNewNote = () => {
    setCurrentNoteId(null);
    setTitleInput('');
    setContentInput('');
    setCategoryInput('Geral');
    setIsEditing(true);
  };

  // Abre editor para editar anotação existente
  const handleEditNote = (note: DiarioNote) => {
    setCurrentNoteId(note.id);
    setTitleInput(note.title);
    setContentInput(note.content);
    setCategoryInput(note.category || 'Geral');
    setIsEditing(true);
  };

  // Salva a anotação e atualiza a listagem
  const handleSaveNote = () => {
    const trimmedTitle = titleInput.trim();
    const trimmedContent = contentInput.trim();

    if (!trimmedTitle && !trimmedContent) {
      showToast('Preencha ao menos o título ou conteúdo da anotação.');
      return;
    }

    const finalTitle = trimmedTitle || `Anotação de Serviço (${formatSimpleDate(Date.now())})`;

    if (currentNoteId) {
      // Editando nota existente
      setNotes(prev => prev.map(item => {
        if (item.id === currentNoteId) {
          return {
            ...item,
            title: finalTitle,
            content: trimmedContent,
            category: categoryInput,
            updatedAt: Date.now()
          };
        }
        return item;
      }));
      showToast('Anotação atualizada com sucesso!');
    } else {
      // Criando nova nota (sempre no topo da lista)
      const newNote: DiarioNote = {
        id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: finalTitle,
        content: trimmedContent,
        createdAt: Date.now(),
        category: categoryInput
      };
      setNotes(prev => [newNote, ...prev]);
      showToast('Nova anotação salva no Diário de Bordo!');
    }

    setIsEditing(false);
    setCurrentNoteId(null);
  };

  // Ao sair do editor: se o usuário digitou algo novo, salva automaticamente ou fecha
  const handleExitEditor = () => {
    const trimmedTitle = titleInput.trim();
    const trimmedContent = contentInput.trim();

    // Se houve preenchimento e não for uma edição idêntica, salva ao sair
    if (trimmedTitle || trimmedContent) {
      handleSaveNote();
    } else {
      setIsEditing(false);
      setCurrentNoteId(null);
    }
  };

  // Cancela sem salvar
  const handleCancelEditor = () => {
    setIsEditing(false);
    setCurrentNoteId(null);
  };

  // Exclusão
  const confirmDelete = () => {
    if (!noteToDelete) return;
    setNotes(prev => prev.filter(n => n.id !== noteToDelete.id));
    setNoteToDelete(null);
    showToast('Anotação excluída.');
  };

  // Copiar conteúdo da nota
  const handleCopyNote = (note: DiarioNote) => {
    const formatted = `[DIÁRIO DE BORDO - ${formatFullDateTime(note.createdAt)}]\n${note.title.toUpperCase()}\nCategoria: ${note.category || 'Geral'}\n\n${note.content}`;
    navigator.clipboard.writeText(formatted).then(() => {
      setCopiedId(note.id);
      showToast('Anotação copiada para a área de transferência!');
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {
      showToast('Não foi possível copiar o texto.');
    });
  };

  // Compartilhar nota
  const handleShareNote = async (note: DiarioNote) => {
    const formatted = `[DIÁRIO DE BORDO - ${formatFullDateTime(note.createdAt)}]\n${note.title.toUpperCase()}\n\n${note.content}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: note.title,
          text: formatted
        });
      } catch (err) {
        // Usuário cancelou ou navegador não suportou
      }
    } else {
      handleCopyNote(note);
    }
  };

  // Ordenação: sempre as mais recentes no topo ("sempre a mais atual estando na parte superior da lista")
  const sortedNotes = [...notes].sort((a, b) => {
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  // Filtragem por busca
  const filteredNotes = sortedNotes.filter(n => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q) ||
      (n.category && n.category.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col min-h-screen bg-military-900 text-military-100 font-sans pb-24" id="diario-de-bordo-view">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-military-300 text-white font-sans text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl border border-military-200 flex items-center gap-2 max-w-[90vw]"
          >
            <Check className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Fixo */}
      <header className="sticky top-0 z-40 bg-military-850/95 backdrop-blur-md border-b border-military-700/80 px-4 py-3.5 flex items-center justify-between shadow-sm">
        <button 
          onClick={onBack}
          className="p-2 -ml-1 hover:bg-military-800 rounded-xl transition-colors flex items-center gap-1.5 text-military-300 active:scale-95 cursor-pointer border border-transparent hover:border-military-700"
          id="btn-voltar-diario"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="font-bold text-xs uppercase tracking-wider">Início</span>
        </button>

        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5">
            <BookOpen className="w-4 h-4 text-military-500" />
            <h1 className="text-sm font-black uppercase tracking-tight text-military-100">
              DIÁRIO DE BORDO
            </h1>
          </div>
          <p className="text-[9px] text-military-600 uppercase font-mono font-bold tracking-widest">
            Anotações de Serviço • Campo
          </p>
        </div>

        <div className="w-14 flex justify-end">
          <span className="text-[10px] font-mono font-black bg-military-800 border border-military-700 px-2 py-0.5 rounded-full text-military-400">
            {notes.length}
          </span>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="max-w-md mx-auto w-full px-4 pt-4 space-y-4">
        {/* PARTE SUPERIOR: Botão "+ Nova Anotação" */}
        <div className="bg-military-850 border border-military-700/80 p-3.5 rounded-2xl shadow-sm space-y-3">
          <button
            onClick={handleOpenNewNote}
            className="w-full py-3.5 px-4 bg-military-300 hover:bg-military-200 active:bg-military-100 text-white font-sans text-xs font-black uppercase rounded-xl tracking-wider shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 border border-military-400"
            id="btn-nova-anotacao"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Nova Anotação</span>
          </button>

          {/* Campo de Busca Rápida (quando há anotações) */}
          {notes.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-military-600" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar nas anotações..."
                className="w-full pl-9 pr-8 py-2 bg-white border border-military-700 rounded-xl text-xs text-military-100 placeholder-military-600 focus:outline-none focus:border-military-500 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-military-600 hover:text-military-100 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* LISTAGEM DAS ANOTAÇÕES */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-mono font-black uppercase tracking-wider text-military-600 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-military-500" />
              Registros do Diário {filteredNotes.length !== notes.length ? `(${filteredNotes.length} filtradas)` : `(${notes.length})`}
            </span>
            <span className="text-[9px] font-mono text-military-600 uppercase">
              Mais recentes primeiro
            </span>
          </div>

          {filteredNotes.length === 0 ? (
            <div className="bg-military-850 border border-military-700/80 rounded-2xl p-8 text-center space-y-3 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-military-800 border border-military-700 mx-auto flex items-center justify-center text-military-500">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-military-100">
                  {searchQuery ? 'Nenhuma anotação encontrada' : 'Nenhuma anotação criada'}
                </h3>
                <p className="text-[10px] text-military-600 mt-1 max-w-[240px] mx-auto font-medium">
                  {searchQuery 
                    ? 'Tente utilizar outros termos na busca para localizar os registros.'
                    : 'Toque em "+ Nova Anotação" acima para registrar os relatos e observações do serviço.'}
                </p>
              </div>
              {!searchQuery && (
                <button
                  onClick={handleOpenNewNote}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-military-300 text-white rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm hover:bg-military-200 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Criar Primeiro Registro
                </button>
              )}
            </div>
          ) : (
            filteredNotes.map((note) => (
              <motion.article
                key={note.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white border border-military-700/80 rounded-2xl p-4 shadow-sm space-y-3 hover:border-military-600 transition-all"
                id={`card-nota-${note.id}`}
              >
                {/* PARTE SUPERIOR DO CARD: Dia e hora da anotação criada */}
                <div className="flex items-center justify-between border-b border-military-750 pb-2.5 text-[10px] font-mono">
                  <div className="flex items-center gap-1.5 text-military-400 font-bold">
                    <Calendar className="w-3.5 h-3.5 text-military-500 shrink-0" />
                    <span>{formatFullDateTime(note.createdAt)}</span>
                  </div>

                  {note.category && (
                    <span className="bg-military-850 border border-military-700 text-military-400 text-[8.5px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider">
                      {note.category}
                    </span>
                  )}
                </div>

                {/* Título da Anotação */}
                <div>
                  <h2 className="text-xs sm:text-sm font-black text-military-100 uppercase tracking-wide leading-snug">
                    {note.title}
                  </h2>
                </div>

                {/* Conteúdo / Texto da Anotação */}
                <div className="bg-military-900/50 p-3 rounded-xl border border-military-750/70">
                  <p className="text-xs text-military-400 whitespace-pre-wrap font-sans leading-relaxed break-words font-medium">
                    {note.content || <span className="italic text-military-600">Sem descrição detalhada.</span>}
                  </p>
                </div>

                {/* Rodapé com botões de Ação: Editar, Excluir, Copiar */}
                <div className="flex items-center justify-between pt-1 border-t border-military-750/60 text-xs">
                  <div className="flex items-center gap-1.5">
                    {/* Botão EDITAR */}
                    <button
                      onClick={() => handleEditNote(note)}
                      className="px-2.5 py-1.5 rounded-lg bg-military-850 hover:bg-military-750 border border-military-700 text-military-300 font-black uppercase text-[10px] tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                      title="Editar esta anotação"
                      id={`btn-edit-${note.id}`}
                    >
                      <Edit3 className="w-3.5 h-3.5 text-military-500" />
                      <span>Editar</span>
                    </button>

                    {/* Botão EXCLUIR */}
                    <button
                      onClick={() => setNoteToDelete(note)}
                      className="px-2.5 py-1.5 rounded-lg bg-military-850 hover:bg-red-50 border border-military-700 hover:border-red-300 text-military-600 hover:text-red-700 font-black uppercase text-[10px] tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                      title="Excluir anotação"
                      id={`btn-del-${note.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                      <span>Excluir</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Copiar texto */}
                    <button
                      onClick={() => handleCopyNote(note)}
                      className="p-1.5 rounded-lg bg-military-850 hover:bg-military-750 border border-military-700 text-military-600 hover:text-military-100 transition-colors"
                      title="Copiar anotação"
                    >
                      {copiedId === note.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Compartilhar */}
                    <button
                      onClick={() => handleShareNote(note)}
                      className="p-1.5 rounded-lg bg-military-850 hover:bg-military-750 border border-military-700 text-military-600 hover:text-military-100 transition-colors"
                      title="Compartilhar"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.article>
            ))
          )}
        </div>
      </main>

      {/* MODAL / TELA DE CRIAÇÃO E EDIÇÃO */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ duration: 0.2 }}
              className="bg-white border border-military-700 w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
              id="editor-modal"
            >
              {/* Topo do editor */}
              <div className="flex items-center justify-between border-b border-military-750 pb-3 mb-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-military-100 flex items-center gap-1.5">
                    <Edit3 className="w-4 h-4 text-military-500" />
                    {currentNoteId ? 'Editar Anotação' : 'Nova Anotação de Serviço'}
                  </h3>
                  <p className="text-[9px] text-military-600 uppercase font-mono font-bold mt-0.5">
                    {formatFullDateTime(Date.now())}
                  </p>
                </div>

                <button
                  onClick={handleCancelEditor}
                  className="p-1.5 rounded-xl bg-military-850 text-military-600 hover:text-military-100 border border-military-700"
                  title="Fechar sem salvar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Formulário do editor */}
              <div className="space-y-3.5 overflow-y-auto pr-1 flex-1 pb-2">
                {/* Título */}
                <div>
                  <label className="block text-[9px] font-mono font-black uppercase tracking-wider text-military-500 mb-1">
                    Título da Anotação:
                  </label>
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    placeholder="Ex: Patrulhamento Ramal do Espinhara, Ocorrência..."
                    className="w-full px-3 py-2.5 bg-military-900 border border-military-700 rounded-xl text-xs font-bold text-military-100 placeholder-military-600 focus:outline-none focus:border-military-500 uppercase"
                    autoFocus
                  />
                </div>

                {/* Seleção de Categoria */}
                <div>
                  <label className="block text-[9px] font-mono font-black uppercase tracking-wider text-military-500 mb-1">
                    Categoria:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoryInput(cat)}
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border cursor-pointer ${
                          categoryInput === cat
                            ? 'bg-military-300 text-white border-military-200 shadow-xs'
                            : 'bg-military-850 text-military-400 border-military-700 hover:bg-military-750'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conteúdo / Texto do Diário */}
                <div>
                  <label className="block text-[9px] font-mono font-black uppercase tracking-wider text-military-500 mb-1">
                    Relato / Conteúdo da Anotação:
                  </label>
                  <textarea
                    value={contentInput}
                    onChange={(e) => setContentInput(e.target.value)}
                    placeholder="Descreva aqui os detalhes do serviço, fatos constatados, dados da equipe, viatura, horários, coordenadas ou observações importantes de campo..."
                    rows={8}
                    className="w-full p-3 bg-military-900 border border-military-700 rounded-xl text-xs text-military-100 placeholder-military-600 focus:outline-none focus:border-military-500 leading-relaxed font-sans"
                  />
                </div>

                <div className="p-2.5 bg-military-900/60 rounded-xl border border-military-750 text-[9.5px] text-military-600 leading-normal flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-military-500 shrink-0 mt-0.5" />
                  <span>
                    Ao <strong>Salvar ou Sair</strong>, a anotação é gravada e posicionada no topo da listagem, exibindo a data e hora do registro.
                  </span>
                </div>
              </div>

              {/* Botões de Ação do Editor */}
              <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-military-750 mt-2">
                <button
                  type="button"
                  onClick={handleExitEditor}
                  className="py-3 px-3 rounded-xl bg-military-850 hover:bg-military-750 border border-military-700 text-military-300 font-sans text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  id="btn-sair-editor"
                >
                  <span>Sair</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="py-3 px-3 rounded-xl bg-military-300 hover:bg-military-200 active:bg-military-100 text-white font-sans text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-military-200"
                  id="btn-salvar-editor"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Anotação</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      <AnimatePresence>
        {noteToDelete && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white border border-military-700 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3 text-red-600">
                <div className="p-2 rounded-xl bg-red-100 border border-red-200">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-military-100">
                    Excluir Anotação?
                  </h4>
                  <p className="text-[10px] text-military-600 uppercase font-mono">
                    Esta ação não pode ser desfeita
                  </p>
                </div>
              </div>

              <p className="text-xs text-military-400">
                Deseja realmente remover a anotação <strong className="text-military-100">"{noteToDelete.title}"</strong>?
              </p>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={() => setNoteToDelete(null)}
                  className="py-2.5 px-3 bg-military-850 hover:bg-military-750 border border-military-700 text-military-300 font-bold uppercase text-xs rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  className="py-2.5 px-3 bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs rounded-xl transition-all cursor-pointer shadow-sm"
                >
                  Sim, Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Formatadores de data e hora em pt-BR
function formatFullDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} às ${hours}:${minutes}`;
}

function formatSimpleDate(timestamp: number): string {
  const d = new Date(timestamp);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month} ${hours}:${minutes}`;
}
