import { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ExternalLink,
  ShieldCheck,
  WifiOff,
  Copy,
  Check,
  Globe,
} from 'lucide-react';

interface ValidarDOFProps {
  onBack: () => void;
  offlineMode?: boolean;
}

const IBAMA_DOF_URL = 'https://dof.ibama.gov.br/autenticidade/';

export default function ValidarDOF({ onBack, offlineMode }: ValidarDOFProps) {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine && !offlineMode : !offlineMode
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const syncStatus = () => {
      setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine && !offlineMode : !offlineMode);
    };
    syncStatus();
    window.addEventListener('online', syncStatus);
    window.addEventListener('offline', syncStatus);
    return () => {
      window.removeEventListener('online', syncStatus);
      window.removeEventListener('offline', syncStatus);
    };
  }, [offlineMode]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(IBAMA_DOF_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-military-900 px-4 py-5 font-sans pb-24 text-military-100">
      <div className="max-w-md w-full mx-auto space-y-4">
        {/* Header bar back button */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="px-3 py-1.5 bg-military-800 hover:bg-military-850 border border-military-750 hover:border-military-700 rounded-xl flex items-center gap-2 group transition-all text-military-300 cursor-pointer shadow-sm font-semibold text-xs"
          >
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform text-military-500" />
            <span className="font-bold text-xs uppercase tracking-wider">Voltar</span>
          </button>
        </div>

        {/* Module Title Card */}
        <div className="w-full bg-military-800 border border-military-750 p-5 rounded-2xl shadow-sm">
          <h1 className="text-lg font-black text-military-300 uppercase tracking-tight flex items-center gap-2.5 font-sans">
            <ShieldCheck className="w-5 h-5 text-military-500 flex-shrink-0" />
            VALIDAR DOF
          </h1>
        </div>

        {/* Offline Warning */}
        {!isOnline && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-center gap-3 text-amber-900 shadow-sm">
            <WifiOff className="w-5 h-5 text-amber-700 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wide">
              Sem conexão — Conecte-se à internet para consultar no IBAMA
            </span>
          </div>
        )}

        {/* Portal IBAMA Card */}
        <div className="bg-military-800 border border-military-750 p-5 rounded-2xl shadow-sm relative overflow-hidden space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-military-900 border border-military-750 rounded-xl text-military-500">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black text-military-100 uppercase tracking-wider">
                  IBAMA • DOF
                </h2>
                <p className="text-[11px] font-mono font-bold text-military-500 uppercase">
                  Autenticidade Oficial
                </p>
              </div>
            </div>

            <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider shrink-0">
              Sistema Oficial
            </span>
          </div>

          {/* Query fields badge summary */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-military-900 border border-military-750 rounded-xl px-3 py-2.5 text-center">
              <span className="block text-[10px] font-mono font-bold uppercase text-military-600">
                Campo 1
              </span>
              <span className="text-xs font-black uppercase text-military-300">
                Órgão
              </span>
            </div>
            <div className="bg-military-900 border border-military-750 rounded-xl px-3 py-2.5 text-center">
              <span className="block text-[10px] font-mono font-bold uppercase text-military-600">
                Campo 2
              </span>
              <span className="text-xs font-black uppercase text-military-300">
                Número do DOF
              </span>
            </div>
          </div>

          {/* Primary Action Link */}
          <a
            href={IBAMA_DOF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-military-500 hover:bg-military-450 active:scale-[0.99] transition-all text-white font-black text-xs sm:text-sm py-3.5 px-4 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm"
          >
            <ExternalLink className="w-4 h-4 text-white shrink-0" />
            <span>Acessar Consulta DOF (IBAMA)</span>
          </a>

          {/* URL Display & Copy */}
          <div className="flex items-center justify-between gap-2 bg-military-900 border border-military-750 rounded-xl px-3 py-2">
            <span className="text-[11px] font-mono text-military-400 font-semibold truncate">
              {IBAMA_DOF_URL}
            </span>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="px-2.5 py-1 bg-military-800 hover:bg-military-850 border border-military-700 rounded-lg text-[10px] font-bold uppercase tracking-wider text-military-300 flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
