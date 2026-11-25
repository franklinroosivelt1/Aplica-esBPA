import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
      setUpdateAvailable(true);
    };

    window.addEventListener('pwa-update-available', handleUpdate);

    return () => {
      window.removeEventListener('pwa-update-available', handleUpdate);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div 
      id="update-available-banner"
      className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl bg-blue-700/95 backdrop-blur-md px-4 py-2.5 text-xs font-bold text-white shadow-2xl border border-blue-400/40 animate-in fade-in slide-in-from-top-4"
    >
      <RefreshCw className="w-4 h-4 text-blue-200 animate-spin" />
      <span>Nova versão disponível do aplicativo!</span>
      <button
        onClick={() => window.location.reload()}
        className="px-2.5 py-1 bg-white text-blue-900 rounded-lg text-[11px] font-black uppercase tracking-wider hover:bg-blue-50 transition cursor-pointer"
      >
        Atualizar
      </button>
    </div>
  );
};

