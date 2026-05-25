import { useState, useEffect } from 'react';
import { Shield, ExternalLink, Link, Edit2, Info, ChevronLeft, CheckCircle2 } from 'lucide-react';

interface BpaOperacionalProps {
  onBack: () => void;
}

export default function BpaOperacional({ onBack }: BpaOperacionalProps) {
  const [projectUrl, setProjectUrl] = useState<string>(() => {
    return localStorage.getItem('bpa_operacional_url') || '';
  });
  const [inputUrl, setInputUrl] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    if (projectUrl) {
      setInputUrl(projectUrl);
    }
  }, [projectUrl]);

  const handleSave = () => {
    setErrorMessage('');
    if (!inputUrl.trim()) {
      setErrorMessage('Por favor, insira uma URL válida.');
      return;
    }

    // Basic URL validation
    try {
      const url = new URL(inputUrl.trim());
      if (!url.protocol.startsWith('http')) {
        setErrorMessage('A URL deve começar com http:// ou https://');
        return;
      }
    } catch (e) {
      setErrorMessage('Insira um formato de link (URL) válido.');
      return;
    }

    localStorage.setItem('bpa_operacional_url', inputUrl.trim());
    setProjectUrl(inputUrl.trim());
    setIsEditing(false);
  };

  const handleClear = () => {
    if (confirm('Tem certeza que deseja remover o link configurado?')) {
      localStorage.removeItem('bpa_operacional_url');
      setProjectUrl('');
      setInputUrl('');
      setIsEditing(false);
      setErrorMessage('');
    }
  };

  const handleLaunch = () => {
    if (projectUrl) {
      window.open(projectUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="flex flex-col space-y-6 pb-20 px-4 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button 
          onClick={onBack}
          className="p-3 bg-military-800 hover:bg-military-700 border border-military-700 hover:border-military-500 rounded-2xl text-military-200 active:scale-95 transition-all flex items-center gap-2 group"
          id="btn-back-bpaop"
        >
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="text-xs font-black uppercase tracking-widest px-1">Voltar</span>
        </button>
        
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-military-400 animate-pulse" />
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-military-400">Plataforma BPA</span>
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-military-800 rounded-3xl p-6 border border-military-700 shadow-2xl space-y-6 relative overflow-hidden">
        {/* Decorative background overlay */}
        <div className="absolute -top-12 -right-12 p-8 opacity-5 pointer-events-none">
          <Shield size={160} className="text-white" />
        </div>

        <div className="text-center space-y-3 relative z-10">
          <div className="inline-flex p-4 bg-military-900/60 border border-military-700 rounded-3xl text-military-300">
            <Shield className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-military-100">BPA Operacional</h2>
          <p className="text-xs text-military-400 font-mono tracking-widest uppercase">Integração de Sistemas</p>
        </div>

        {/* Dynamic Display based on configuration */}
        {!projectUrl || isEditing ? (
          <div className="space-y-4 bg-military-900/40 p-5 rounded-2xl border border-military-700/60">
            <h3 className="text-xs font-bold text-military-300 uppercase tracking-wider flex items-center gap-2">
              <Link className="w-4 h-4 text-military-400" />
              Configurar Acesso ao Projeto
            </h3>
            
            <p className="text-xs text-military-400 leading-relaxed text-justify">
              Este módulo permite acessar diretamente o seu projeto correspondente <span className="text-military-300 font-bold">BPA Operacional</span> hospedado nesta plataforma. Para ativar, insira o link de compartilhamento ou visualização do aplicativo no campo abaixo.
            </p>

            <div className="space-y-2 pt-2">
              <label className="text-[9px] font-black text-military-400 uppercase tracking-[0.2em] px-1">
                URL do Projeto (BPA Operacional)
              </label>
              <input 
                type="url" 
                value={inputUrl} 
                onChange={e => setInputUrl(e.target.value)}
                className="w-full bg-military-900 border border-military-700 rounded-2xl px-4 py-4 text-xs font-mono text-military-100 placeholder-military-600 focus:outline-none focus:border-military-400 transition-colors"
                placeholder="https://ais-pre-XXXXXXXXXXX-297304034185.us-west1.run.app"
              />
              {errorMessage && (
                <p className="text-[10px] font-bold text-red-400 px-1">{errorMessage}</p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                className="flex-1 bg-military-500 hover:bg-military-400 text-military-950 font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all active:scale-[0.98]"
              >
                Salvar Link
              </button>
              {projectUrl && (
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 bg-military-700 text-military-300 hover:bg-military-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Success state */}
            <div className="flex items-start gap-3 bg-military-900/60 p-4 rounded-2xl border border-military-600/30">
              <CheckCircle2 className="w-5 h-5 text-military-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="text-xs font-black uppercase text-military-200 tracking-wider">Projeto Vinculado</span>
                <p className="text-[11px] text-military-400 font-mono break-all line-clamp-1 select-all">{projectUrl}</p>
              </div>
            </div>

            {/* Launch Action */}
            <button
              onClick={handleLaunch}
              className="w-full bg-military-300 hover:bg-military-200 text-military-950 font-black py-5 rounded-2xl shadow-xl transition-all active:scale-[0.98] uppercase text-xs tracking-[0.15em] flex items-center justify-center gap-2 group border border-white/20"
            >
              <span>Acessar BPA Operacional</span>
              <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>

            {/* Options Row */}
            <div className="flex justify-between items-center px-1 pt-1">
              <button
                onClick={() => setIsEditing(true)}
                className="text-[10px] font-bold text-military-400 hover:text-military-300 uppercase tracking-widest flex items-center gap-1.5 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Alterar Link
              </button>
              
              <button
                onClick={handleClear}
                className="text-[10px] font-bold text-red-500 hover:text-red-400 uppercase tracking-widest transition-all"
              >
                Remover Link
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Guide Banner */}
      <div className="bg-military-850/60 border border-military-700/50 rounded-2xl p-4 flex gap-3 text-military-400">
        <Info className="w-5 h-5 text-military-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-left">
          <span className="text-[10px] font-black uppercase tracking-wider text-military-300">Como obter o link?</span>
          <p className="text-[11px] leading-relaxed">
            Abra o projeto <span className="font-bold text-military-300">BPA Operacional</span> nesta plataforma. Copie o link (URL) exibido na barra de endereços do seu navegador ou clique em <span className="font-bold text-military-300">Remix</span> / <span className="font-bold text-military-300">Share App</span> e copie a URL gerada pelo sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
