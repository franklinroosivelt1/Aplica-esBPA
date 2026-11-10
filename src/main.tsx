// Global error logging (non-destructive: prevents UI wipe-out on non-fatal DOM events or network drops)
window.addEventListener('error', (event) => {
  console.warn('[BPA App] Evento de erro interceptado:', event.error || event.message || event);
});

window.addEventListener('unhandledrejection', (event) => {
  console.warn('[BPA App] Rejeição de promessa interceptada:', event.reason);
});

import React, {StrictMode, ErrorInfo, ReactNode, Component} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';

// Register Service Worker immediately for 100% off-grid reliability
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[BPA PWA] Nova versão detectada');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pwa-update-available'));
    }
  },
  onOfflineReady() {
    console.log('[BPA PWA] Aplicativo 100% pronto para uso off-line');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pwa-offline-ready'));
    }
  },
  onRegisterError(error) {
    console.error('[BPA PWA] Falha ao registrar Service Worker:', error);
  },
});


interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  loadCachedVersion: boolean;
}

class OfflineCacheErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { 
    hasError: false, 
    error: null, 
    loadCachedVersion: false 
  };
  props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    return { 
      hasError: true, 
      error, 
      loadCachedVersion: isOffline || Boolean(typeof localStorage !== 'undefined' && localStorage.getItem('bpa_force_offline_cache'))
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("[BPA PWA] ErrorBoundary interceptou falha:", error, errorInfo);
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    
    // Se a rede estiver indisponível, força o modo offline e o carregamento do cache
    if (isOffline) {
      try {
        localStorage.setItem('bpa_force_offline_cache', 'true');
        sessionStorage.setItem('bpa_offline_mode', 'true');
      } catch (e) {
        // ignore storage errors
      }
    }
  }

  forceCachedApp = () => {
    try {
      localStorage.setItem('bpa_force_offline_cache', 'true');
      sessionStorage.setItem('bpa_offline_mode', 'true');
    } catch (e) {}
    // Recarrega forçando a ativação dos recursos armazenados em cache pelo Service Worker
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      return (
        <div className="min-h-screen bg-military-900 text-military-100 flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="w-full max-w-sm bg-military-850 border border-military-700 rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
              <span className="text-2xl font-black">⚡</span>
            </div>

            <div>
              <h2 className="text-base font-black uppercase tracking-wider text-military-100">
                {isOffline ? 'Rede Indisponível' : 'Recuperação Off-line'}
              </h2>
              <p className="text-xs text-military-300 mt-2 leading-relaxed">
                {isOffline
                  ? 'Dispositivo sem conexão com a rede. Carregando a versão em cache local do aplicativo para operação contínua em campo.'
                  : 'Falha momentânea de rede. Deseja forçar o carregamento da versão armazenada em cache do aplicativo?'}
              </p>
            </div>

            <div className="w-full space-y-2 pt-2">
              <button
                type="button"
                onClick={this.forceCachedApp}
                className="w-full py-3 px-4 bg-military-300 hover:bg-military-200 text-military-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                Carregar Versão em Cache Off-line
              </button>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full py-2.5 px-4 bg-military-800 hover:bg-military-750 border border-military-700 text-military-200 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
              >
                Recarregar Página
              </button>
            </div>

            <p className="text-[10px] font-mono text-military-450 uppercase tracking-widest pt-1">
              BPA • Operação Autônoma Off-line
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OfflineCacheErrorBoundary>
      <App />
    </OfflineCacheErrorBoundary>
  </StrictMode>,
);


