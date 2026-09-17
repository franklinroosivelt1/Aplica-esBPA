import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  Plus, 
  Trash2, 
  Edit3, 
  Calendar, 
  Search, 
  X, 
  Check, 
  Copy, 
  Share2, 
  BookOpen, 
  FileText,
  AlertCircle
} from 'lucide-react';

export interface DiarioNote {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt?: number;
}

interface DiarioDeBordoProps {
  onBack: () => void;
}

const STORAGE_KEY = 'bpa_diario_de_bordo_notes';

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
    // Exemplo inicial de serviço
    return [
      {
        id: 'note-sample-1',
        title: 'Patrulhamento Preventivo - Eixo Ambiental',
        content: 'Equipe em deslocamento para inspeção preventiva no ramal. Viatura abastecida e operando normalmente. Sem alterações no trajeto durante o período matutino.',
        createdAt: Date.now() - 1000 * 60 * 60 * 3 // 3 horas atrás
      }
    ];
  });

  const [isEditing, setIsEditing] = useState(false);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [contentInput, setContentInput] = useState('');
  
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
    setIsEditing(true);
  };

  // Abre editor para editar anotação existente
  const handleEditNote = (note: DiarioNote) => {
    setCurrentNoteId(note.id);
    setTitleInput(note.title || '');
    setContentInput(note.content || '');
    setIsEditing(true);
  };

  // Salva a anotação e atualiza a listagem
  const handleSaveNote = () => {
    const trimmedTitle = titleInput.trim();
    const trimmedContent = contentInput.trim();

    if (!trimmedTitle && !trimmedContent) {
      showToast('Digite ao menos o relato ou o título da anotação.');
      return;
    }

    // Se o usuário não inserir um título, deve ficar em branco (não preencher com data ou texto automático)
    const finalTitle = trimmedTitle;

    if (currentNoteId) {
      // Editando nota existente
      setNotes(prev => prev.map(item => {
        if (item.id === currentNoteId) {
          return {
            ...item,
            title: finalTitle,
            content: trimmedContent,
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
        createdAt: Date.now()
      };
      setNotes(prev => [newNote, ...prev]);
      showToast('Nova anotação salva no Diário de Bordo!');
    }

    setIsEditing(false);
    setCurrentNoteId(null);
  };

  // Ao sair do editor: se o usuário digitou algo novo, salva automaticamente
  const handleExitEditor = () => {
    const trimmedTitle = titleInput.trim();
    const trimmedContent = contentInput.trim();

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
    const titleHeader = note.title ? `${note.title.toUpperCase()}\n\n` : '';
    const formatted = `[DIÁRIO DE BORDO - ${formatFullDateTime(note.createdAt)}]\n${titleHeader}${note.content}`;
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
    const titleHeader = note.title ? `${note.title.toUpperCase()}\n\n` : '';
    const formatted = `[DIÁRIO DE BORDO - ${formatFullDateTime(note.createdAt)}]\n${titleHeader}${note.content}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: note.title || 'Diário de Bordo',
          text: formatted
        });
      } catch {
        // Cancelado ou não suportado
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
      (n.title && n.title.toLowerCase().includes(q)) ||
      (n.content && n.content.toLowerCase().includes(q))
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
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-military-300 text-white font-sans text-sm font-bold px-4 py-2.5 rounded-xl shadow-xl border border-military-200 flex items-center gap-2 max-w-[90vw]"
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
          <span className="font-bold text-sm uppercase tracking-wider">Início</span>
        </button>

        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5">
            <BookOpen className="w-5 h-5 text-military-500" />
            <h1 className="text-base font-black uppercase tracking-tight text-military-100">
              DIÁRIO DE BORDO
            </h1>
          </div>
          <p className="text-xs text-military-400 uppercase font-mono font-bold tracking-wider">
            Anotações de Serviço • Campo
          </p>
        </div>

        <div className="w-14 flex justify-end">
          <span className="text-xs font-mono font-black bg-military-800 border border-military-700 px-2.5 py-0.5 rounded-full text-military-300">
            {notes.length}
          </span>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="max-w-md mx-auto w-full px-4 pt-4 space-y-4">
        {/* PARTE SUPERIOR: Botão "+ Nova Anotação" */}
        <div className="bg-military-850 border border-military-700/80 p-4 rounded-2xl shadow-sm space-y-3">
          <button
            onClick={handleOpenNewNote}
            className="w-full py-3.5 px-4 bg-military-300 hover:bg-military-200 active:bg-military-100 text-white font-sans text-sm font-black uppercase rounded-xl tracking-wider shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 border border-military-400"
            id="btn-nova-anotacao"
          >
            <Plus className="w-5 h-5 stroke-[3]" />
            <span>+ Nova Anotação</span>
          </button>

          {/* Campo de Busca Rápida (quando há anotações) */}
          {notes.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-military-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar nas anotações..."
                className="w-full pl-10 pr-9 py-2.5 bg-white border border-military-700 rounded-xl text-sm text-black placeholder-military-500 focus:outline-none focus:border-military-500 font-medium shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-military-500 hover:text-black p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* LISTAGEM DAS ANOTAÇÕES */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-mono font-black uppercase tracking-wider text-military-400 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-military-500" />
              Registros {filteredNotes.length !== notes.length ? `(${filteredNotes.length} filtradas)` : `(${notes.length})`}
            </span>
            <span className="text-[11px] font-mono text-military-500 uppercase font-semibold">
              Mais recentes primeiro
            </span>
          </div>

          {filteredNotes.length === 0 ? (
            <div className="bg-military-850 border border-military-700/80 rounded-2xl p-8 text-center space-y-3 shadow-sm">
              <div className="w-14 h-14 rounded-full bg-military-800 border border-military-700 mx-auto flex items-center justify-center text-military-500">
                <BookOpen className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-military-100">
                  {searchQuery ? 'Nenhuma anotação encontrada' : 'Nenhuma anotação criada'}
                </h3>
                <p className="text-xs text-military-400 mt-1 max-w-[260px] mx-auto font-medium leading-normal">
                  {searchQuery 
                    ? 'Tente outros termos na busca para localizar os registros.'
                    : 'Toque em "+ Nova Anotação" acima para registrar relatos e anotações do serviço.'}
                </p>
              </div>
              {!searchQuery && (
                <button
                  onClick={handleOpenNewNote}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-military-300 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm hover:bg-military-200 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
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
                className="bg-white border border-military-700/80 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 hover:border-military-600 transition-all text-black"
                id={`card-nota-${note.id}`}
              >
                {/* PARTE SUPERIOR DO CARD: Dia e hora da anotação criada */}
                <div className="flex items-center justify-between border-b border-military-200/80 pb-2.5">
                  <div className="flex items-center gap-1.5 text-military-700 font-mono text-xs font-bold">
                    <Calendar className="w-4 h-4 text-emerald-800 shrink-0" />
                    <span>{formatFullDateTime(note.createdAt)}</span>
                  </div>

                  {note.updatedAt && (
                    <span className="text-[11px] font-mono text-military-500 font-semibold">
                      (editado)
                    </span>
                  )}
                </div>

                {/* Título da Anotação (Se o usuário não inseriu título, fica em branco) */}
                {note.title && note.title.trim().length > 0 && (
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-black uppercase tracking-wide leading-snug">
                      {note.title}
                    </h2>
                  </div>
                )}

                {/* Relato / Conteúdo da Anotação com Fonte Aumentada e Alto Contraste */}
                <div className="bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200/90">
                  <p className="text-[15px] sm:text-base text-slate-900 font-sans leading-relaxed whitespace-pre-wrap break-words font-medium">
                    {note.content || <span className="italic text-slate-400">Sem relato preenchido.</span>}
                  </p>
                </div>

                {/* Rodapé com botões de Ação: Editar, Excluir, Copiar, Compartilhar */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
                  <div className="flex items-center gap-2">
                    {/* Botão EDITAR */}
                    <button
                      onClick={() => handleEditNote(note)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-black uppercase text-xs tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="Editar esta anotação"
                      id={`btn-edit-${note.id}`}
                    >
                      <Edit3 className="w-4 h-4 text-emerald-700" />
                      <span>Editar</span>
                    </button>

                    {/* Botão EXCLUIR */}
                    <button
                      onClick={() => setNoteToDelete(note)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-red-50 border border-slate-300 hover:border-red-300 text-slate-700 hover:text-red-700 font-black uppercase text-xs tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="Excluir anotação"
                      id={`btn-del-${note.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                      <span>Excluir</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Copiar texto */}
                    <button
                      onClick={() => handleCopyNote(note)}
                      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 hover:text-black transition-colors shadow-2xs"
                      title="Copiar anotação"
                    >
                      {copiedId === note.id ? (
                        <Check className="w-4 h-4 text-emerald-700" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>

                    {/* Compartilhar */}
                    <button
                      onClick={() => handleShareNote(note)}
                      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 hover:text-black transition-colors shadow-2xs"
                      title="Compartilhar anotação"
                    >
                      <Share2 className="w-4 h-4" />
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
              className="bg-white border border-military-700 w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-black"
              id="editor-modal"
            >
              {/* Topo do editor */}
              <div className="flex items-center justify-between border-b border-military-200 pb-3 mb-4">
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                    <Edit3 className="w-5 h-5 text-emerald-800" />
                    {currentNoteId ? 'Editar Anotação' : 'Nova Anotação de Serviço'}
                  </h3>
                  <p className="text-xs text-military-600 uppercase font-mono font-bold mt-0.5">
                    {formatFullDateTime(Date.now())}
                  </p>
                </div>

                <button
                  onClick={handleCancelEditor}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-black border border-slate-300 transition-colors"
                  title="Fechar sem salvar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Formulário do editor */}
              <div className="space-y-4 overflow-y-auto pr-1 flex-1 pb-2">
                {/* Título (Opcional - se vazio fica em branco) */}
                <div>
                  <label className="block text-xs font-mono font-black uppercase tracking-wider text-military-700 mb-1.5">
                    Título da Anotação (Opcional):
                  </label>
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    placeholder="Deixe em branco ou informe um título..."
                    className="w-full px-3.5 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-black placeholder-slate-400 focus:outline-none focus:border-emerald-700 uppercase"
                    autoFocus
                  />
                </div>

                {/* Relato / Conteúdo da Anotação com Fonte Aumentada */}
                <div>
                  <label className="block text-xs font-mono font-black uppercase tracking-wider text-military-700 mb-1.5">
                    Relato / Conteúdo da Anotação:
                  </label>
                  <textarea
                    value={contentInput}
                    onChange={(e) => setContentInput(e.target.value)}
                    placeholder="Descreva os detalhes do serviço, fatos constatados, dados da equipe, viatura, horários, coordenadas ou observações de campo..."
                    rows={9}
                    className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-[15px] sm:text-base text-black placeholder-slate-400 focus:outline-none focus:border-emerald-700 leading-relaxed font-sans font-medium shadow-inner"
                  />
                </div>

                <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-700 leading-normal flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
                  <span>
                    Ao <strong>Salvar ou Sair</strong>, a anotação é gravada e posicionada no topo da listagem com dia e hora. Se o título não for preenchido, o registro será exibido sem título.
                  </span>
                </div>
              </div>

              {/* Botões de Ação do Editor */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200 mt-2">
                <button
                  type="button"
                  onClick={handleExitEditor}
                  className="py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-sans text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  id="btn-sair-editor"
                >
                  <span>Sair</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="py-3 px-3 rounded-xl bg-emerald-800 hover:bg-emerald-700 active:bg-emerald-900 text-white font-sans text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 border border-emerald-700"
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
              className="bg-white border border-military-700 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 text-black"
            >
              <div className="flex items-center gap-3 text-red-600">
                <div className="p-2.5 rounded-xl bg-red-100 border border-red-200">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase tracking-wider text-black">
                    Excluir Anotação?
                  </h4>
                  <p className="text-xs text-slate-500 uppercase font-mono">
                    Esta ação não pode ser desfeita
                  </p>
                </div>
              </div>

              <p className="text-sm text-slate-700 font-medium">
                Deseja realmente remover esta anotação{noteToDelete.title ? ` ("${noteToDelete.title}")` : ''}?
              </p>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  onClick={() => setNoteToDelete(null)}
                  className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-bold uppercase text-xs rounded-xl transition-all cursor-pointer"
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

// Formatador de data e hora em pt-BR
function formatFullDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} às ${hours}:${minutes}`;
}
