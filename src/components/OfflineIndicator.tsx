import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi, CheckCircle2, ShieldCheck } from 'lucide-react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
    } else if (wasOffline) {
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
        setWasOffline(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (isOnline && !showReconnected) return null;

  if (showReconnected) {
    return (
      <div 
        id="reconnected-banner"
        className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-emerald-700/95 backdrop-blur-md px-4 py-2 text-xs font-bold text-white shadow-xl border border-emerald-500/40 transition-all duration-300 animate-in fade-in slide-in-from-top-4"
      >
        <Wifi className="w-4 h-4 text-emerald-200" />
        <span>Conexão Restabelecida — Sincronizado</span>
      </div>
    );
  }

  return (
    <div 
      id="offline-banner"
      className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:w-auto z-50 flex items-center justify-between gap-3 rounded-xl bg-military-850/95 backdrop-blur-md px-4 py-2.5 text-xs font-semibold text-military-100 shadow-2xl border border-amber-600/40"
    >
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
        </span>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 font-black text-amber-400 uppercase text-[11px] tracking-wider">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Modo Off-line Ativo</span>
          </div>
          <span className="text-[11px] text-military-300 font-medium">
            Operando 100% autônomo sem internet
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-military-900 px-2 py-1 rounded-md border border-military-750">
        <ShieldCheck className="w-3 h-3 text-emerald-400" />
        <span>Local OK</span>
      </div>
    </div>
  );
};
