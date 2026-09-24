// Global error logging (non-destructive: prevents UI wipe-out on non-fatal DOM events or network drops)
window.addEventListener('error', (event) => {
  console.warn('[BPA App] Evento de erro interceptado:', event.error || event.message || event);
});

window.addEventListener('unhandledrejection', (event) => {
  console.warn('[BPA App] Rejeição de promessa interceptada:', event.reason);
});

import React, {StrictMode, ErrorInfo, ReactNode} from 'react';
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
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-5 bg-red-50 border-2 border-red-500 text-red-900 rounded-xl m-5 font-mono">
          <h2 className="text-lg font-bold text-red-700 mb-2">⚠️ Erro na Renderização</h2>
          <pre className="bg-red-100 p-3 rounded text-xs overflow-auto max-h-96 whitespace-pre-wrap">
            {this.state.error?.stack || this.state.error?.message}
          </pre>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs"
          >
            Recarregar Página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);


