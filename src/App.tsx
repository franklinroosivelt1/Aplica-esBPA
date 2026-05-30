import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Calculator, 
  Trees, 
  FileImage, 
  ChevronLeft,
  Settings,
  Shield
} from 'lucide-react';
import { Map } from 'lucide-react';
import Home from './views/Home';
import brandLogo from './assets/images/batalhao_ambiental_logo_1779854041969.png';

import CamStamp from './views/CamStamp';
import CubagemBPA from './views/CubagemBPA';
import FotoPDF from './views/FotoPDF';
import BpaOperacional from './views/BpaOperacional';
import PresidentMaps from './views/PresidentMaps';
import BuscarMandados from './views/BuscarMandados';

function LoadingView({ message = "Carregando módulo..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 bg-military-900 border border-military-850 rounded-3xl m-4">
      <div className="w-12 h-12 border-4 border-military-800 border-t-military-300 rounded-full animate-spin mb-4" />
      <h2 className="text-lg font-bold uppercase tracking-wider text-military-100">{message}</h2>
      <p className="text-[10px] text-military-450 uppercase tracking-widest font-mono mt-1">Sistemas BPA • Otimizado</p>
    </div>
  );
}


export type View = 'home' | 'camstamp' | 'cubagem' | 'mandados' | 'fotopdf' | 'mapas' | 'bpaoperacional' | 'verificarcar';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('home');

  const renderView = () => {
    switch (currentView) {
      case 'home':
        return <Home onNavigate={setCurrentView} />;
      case 'camstamp':
        return <CamStamp onBack={() => setCurrentView('home')} />;
      case 'cubagem':
        return <CubagemBPA onBack={() => setCurrentView('home')} />;
      case 'mandados':
        return <BuscarMandados onBack={() => setCurrentView('home')} />;
      case 'verificarcar':
        return (
          <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-6 bg-military-900 border border-military-850 rounded-3xl m-4">
            <div className="p-4 bg-military-800 rounded-3xl border border-military-700/60 inline-flex mb-4">
              <Shield className="w-12 h-12 text-military-300 animate-pulse" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-military-100">Verificar CAR</h2>
            <p className="text-[10px] text-military-450 uppercase tracking-widest font-black mt-1 mb-6">Consulta de Coordenada Geográfica</p>
            
            <div className="bg-black/50 border border-military-850 p-5 rounded-2xl text-left w-full max-w-sm text-xs font-mono text-military-200 leading-relaxed mb-8 flex flex-col gap-3">
              <div>
                <span className="text-yellow-500 font-black uppercase block mb-1">🔍 Nota Operacional:</span>
                Verificação de imóvel rural no Cadastro Ambiental Rural (CAR) a partir de coordenadas geográficas de satélite.
              </div>
              <div className="border-t border-military-800/60 pt-2 text-[10px] text-military-450 italic">
                * Conectividade com sistemas externos integrada com sucesso. O processamento dos polígonos será tratado em etapa subsequente.
              </div>
            </div>

            <button 
              onClick={() => setCurrentView('home')}
              className="px-6 py-3 bg-military-300 hover:bg-military-200 text-military-950 font-black rounded-xl uppercase text-xs tracking-widest shadow-lg transition-all active:scale-95"
            >
              Voltar de Imóveis
            </button>
          </div>
        );
      case 'fotopdf':
        return <FotoPDF onBack={() => setCurrentView('home')} />;
      case 'mapas':
        return <PresidentMaps onBack={() => setCurrentView('home')} />;
      case 'bpaoperacional':
        return <BpaOperacional onBack={() => setCurrentView('home')} />;
      default:
        return <Home onNavigate={setCurrentView} />;
    }
  };

  return (
    <div className="min-h-screen bg-military-900 text-military-100 font-sans selection:bg-military-500 selection:text-white">
      {/* App Header (Sticky when not in home, camstamp, view maps, fotopdf, cubagem, or bpaoperacional) */}
      {currentView !== 'home' && currentView !== 'camstamp' && currentView !== 'mapas' && currentView !== 'fotopdf' && currentView !== 'cubagem' && currentView !== 'bpaoperacional' && currentView !== 'mandados' && (
        <header className="sticky top-0 z-50 bg-military-800/80 backdrop-blur-md border-b border-military-700 px-4 py-3 flex items-center justify-between">
          <button 
            onClick={() => setCurrentView('home')}
            className="p-2 hover:bg-military-700 rounded-lg transition-colors flex items-center gap-2 group"
          >
            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium text-sm">Voltar</span>
          </button>
          
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 flex items-center justify-center overflow-hidden rounded-md border border-military-700">
              <img 
                src={brandLogo} 
                alt="Batalhão Ambiental Logo" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer" 
              />
            </div>
            <h1 className="text-sm font-bold tracking-tight uppercase">APLICAÇÕES BPA</h1>
          </div>
          
          <div className="w-10" /> {/* Spacer */}
        </header>
      )}

      <main className={`${currentView === 'camstamp' || currentView === 'fotopdf' || currentView === 'cubagem' || currentView === 'bpaoperacional' || currentView === 'mapas' || currentView === 'mandados' ? 'w-full' : 'max-w-md mx-auto'} min-h-screen`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={currentView === 'camstamp' || currentView === 'fotopdf' || currentView === 'cubagem' || currentView === 'bpaoperacional' || currentView === 'mapas' || currentView === 'mandados' ? '' : 'p-4 pt-6'}
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </main>
      
      {/* Background Decals */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] overflow-hidden -z-10">
        <div className="absolute -top-24 -left-24 w-96 h-96 border-[40px] border-military-500 rounded-full" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 border-[40px] border-military-500 rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-military-500/20 rotate-45" />
      </div>
    </div>
  );
}
