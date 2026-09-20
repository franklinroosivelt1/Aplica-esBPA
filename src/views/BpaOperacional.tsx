import React from 'react';
import { ChevronLeft, Shield, Sparkles } from 'lucide-react';

interface BpaOperacionalProps {
  onBack: () => void;
}

export default function BpaOperacional({ onBack }: BpaOperacionalProps) {
  return (
    <div className="flex flex-col min-h-screen bg-military-900 text-military-100 font-sans" id="buscar-car-container">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-military-850/90 backdrop-blur-md border-b border-military-700 px-4 py-3 flex items-center justify-between shadow-sm">
        <button
          onClick={onBack}
          id="btn-voltar-car"
          className="p-2 hover:bg-military-800 rounded-xl transition-colors flex items-center gap-2 group cursor-pointer text-military-300 hover:text-military-100"
        >
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold text-sm">Voltar</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-military-800 border border-military-700 flex items-center justify-center text-military-300">
            <Shield className="w-4 h-4" />
          </div>
          <h1 className="text-sm font-black tracking-tight uppercase">Buscar Dados do CAR</h1>
        </div>

        <div className="w-16" />
      </header>

      {/* Main Content Area ready for new implementation */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto w-full">
        <div className="p-5 bg-military-850 rounded-3xl border border-military-700/80 shadow-lg inline-flex mb-5">
          <Shield className="w-12 h-12 text-military-300" />
        </div>

        <h2 className="text-xl font-black uppercase tracking-tight text-military-100 mb-2">
          Buscar Dados do CAR
        </h2>
        
        <p className="text-xs text-military-400 font-mono uppercase tracking-widest mb-6">
          Módulo em Preparação
        </p>

        <div className="bg-military-850/80 border border-military-700/70 p-5 rounded-2xl text-left w-full text-xs text-military-300 leading-relaxed mb-6 flex flex-col gap-3 shadow-inner">
          <div className="flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-military-100 block mb-1">Módulo Reinicializado</span>
              A lógica anterior foi excluída com sucesso. O módulo está pronto para receber a nova metodologia de busca de dados do Cadastro Ambiental Rural (CAR).
            </div>
          </div>
        </div>

        <button
          onClick={onBack}
          id="btn-retornar-inicio"
          className="w-full py-3.5 px-6 bg-military-300 hover:bg-military-200 text-military-950 font-black rounded-xl uppercase text-xs tracking-wider shadow-md transition active:scale-95 cursor-pointer"
        >
          Retornar ao Menu Inicial
        </button>
      </main>
    </div>
  );
}
