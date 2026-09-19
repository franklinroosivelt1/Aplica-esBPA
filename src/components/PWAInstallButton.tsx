import React, { useState } from 'react';
import { Download, Smartphone, X, Check, Share } from 'lucide-react';
import { usePWAInstall } from '../utils/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If already running in standalone PWA or native APK, hide the install prompt
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    setInstalling(true);
    try {
      await install();
    } finally {
      setInstalling(false);
    }
  };

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <div 
        id="pwa-install-banner"
        className="w-full bg-military-800 border border-military-500/60 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-md mb-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-military-500 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-black uppercase text-military-100 tracking-wide">
              Instalar Aplicativo no Celular
            </h4>
            <p className="text-[11px] text-military-400 font-medium truncate">
              Funciona 100% off-line sem sinal de rede
            </p>
          </div>
        </div>

        <button
          onClick={handleInstallClick}
          disabled={installing}
          id="btn-install-pwa"
          className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-military-300 hover:bg-military-200 text-military-950 font-black text-xs uppercase tracking-wider shadow-sm transition active:scale-95 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{installing ? 'Instalando...' : 'Instalar'}</span>
        </button>
      </div>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <div 
          id="pwa-install-banner-ios"
          className="w-full bg-military-800 border border-military-700 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-md mb-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-military-700 text-military-200 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-black uppercase text-military-100 tracking-wide">
                Usar Aplicativo Off-line (iOS)
              </h4>
              <p className="text-[11px] text-military-400 font-medium truncate">
                Adicione à Tela de Início do iPhone
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowIOSGuide(true)}
            id="btn-install-ios"
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-military-700 hover:bg-military-600 text-military-100 font-bold text-xs uppercase tracking-wider transition active:scale-95 cursor-pointer"
          >
            <span>Instruções</span>
          </button>
        </div>

        {showIOSGuide && (
          <div 
            id="ios-install-modal"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in"
          >
            <div className="w-full max-w-sm rounded-2xl bg-military-850 border border-military-700 p-5 shadow-2xl text-military-100">
              <div className="flex items-center justify-between pb-3 border-b border-military-750">
                <h3 className="text-sm font-black uppercase tracking-wider text-military-100">
                  Instalar no iPhone / iPad
                </h3>
                <button 
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg hover:bg-military-750 text-military-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="py-4 space-y-3 text-xs text-military-300">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-military-700 text-military-100 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                  <p>
                    No navegador Safari, toque no botão <strong>Compartilhar</strong> <Share className="w-3.5 h-3.5 inline mx-1" /> na barra inferior.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-military-700 text-military-100 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                  <p>
                    Role para baixo e selecione a opção <strong>Adicionar à Tela de Início</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-military-700 text-military-100 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                  <p>
                    Confirme tocando em <strong>Adicionar</strong> no canto superior direito.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-military-300 hover:bg-military-200 text-military-950 font-black text-xs uppercase tracking-wider shadow-md transition"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
