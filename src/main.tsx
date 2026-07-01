// Global error display helper
function displayFatalError(error: Error | string) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding: 20px; background: #FEF2F2; border: 2px solid #EF4444; color: #991B1B; font-family: monospace; border-radius: 8px; margin: 20px;">
        <h2 style="margin-top: 0; color: #B91C1C;">⚠️ Erro de Inicialização do App</h2>
        <pre style="white-space: pre-wrap; word-break: break-all; background: #FEE2E2; padding: 10px; border-radius: 4px;">${error instanceof Error ? error.stack || error.message : error}</pre>
        <p style="font-size: 12px; color: #7F1D1D; margin-bottom: 0;">Por favor, relate este erro para correção.</p>
      </div>
    `;
  }
}

window.addEventListener('error', (event) => {
  displayFatalError(event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  displayFatalError(event.reason);
});

import React, {StrictMode, ErrorInfo, ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';


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

// Register Service Worker for robust off-grid offline capabilities
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[BPA Office Offline] Service Worker registrado com sucesso:', reg.scope))
      .catch(err => console.error('[BPA Office Offline] Falha ao registrar Service Worker:', err));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);


