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
import CamStamp from './views/CamStamp';
import CubagemBPA from './views/CubagemBPA';
import FotoPDF from './views/FotoPDF';
import BpaOperacional from './views/BpaOperacional';
import PresidentMaps from './views/PresidentMaps';

export type View = 'home' | 'camstamp' | 'cubagem' | 'identificacao' | 'fotopdf' | 'mapas' | 'bpaoperacional';

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
      case 'identificacao':
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
            <Trees className="w-16 h-16 text-military-500 mb-4" />
            <h2 className="text-xl font-bold uppercase tracking-tighter mb-2">Identificação de Madeiras</h2>
            <p className="text-sm text-military-400 uppercase tracking-widest font-mono">Em desenvolvimento</p>
            <button 
              onClick={() => setCurrentView('home')}
              className="mt-8 px-6 py-2 bg-military-800 rounded-lg text-military-300 font-bold uppercase text-xs tracking-widest"
            >
              Voltar
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
      {currentView !== 'home' && currentView !== 'camstamp' && currentView !== 'mapas' && currentView !== 'fotopdf' && currentView !== 'cubagem' && currentView !== 'bpaoperacional' && (
        <header className="sticky top-0 z-50 bg-military-800/80 backdrop-blur-md border-b border-military-700 px-4 py-3 flex items-center justify-between">
          <button 
            onClick={() => setCurrentView('home')}
            className="p-2 hover:bg-military-700 rounded-lg transition-colors flex items-center gap-2 group"
          >
            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium text-sm">Voltar</span>
          </button>
          
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-military-400" />
            <h1 className="text-sm font-bold tracking-tight uppercase">APLICAÇÕES BPA</h1>
          </div>
          
          <div className="w-10" /> {/* Spacer */}
        </header>
      )}

      <main className={`${currentView === 'camstamp' || currentView === 'fotopdf' || currentView === 'cubagem' || currentView === 'bpaoperacional' || currentView === 'mapas' ? 'w-full' : 'max-w-md mx-auto'} min-h-screen`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={currentView === 'camstamp' || currentView === 'fotopdf' || currentView === 'cubagem' || currentView === 'bpaoperacional' || currentView === 'mapas' ? '' : 'p-4 pt-6'}
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
