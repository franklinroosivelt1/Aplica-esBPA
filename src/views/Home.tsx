import { motion } from 'motion/react';
import { 
  Camera, 
  Calculator, 
  Shield, 
  ShieldCheck,
  Map, 
  FileImage, 
  BookOpen, 
  ChevronRight
} from 'lucide-react';
import { PWAInstallButton } from '../components/PWAInstallButton';
type View = 'home' | 'camstamp' | 'cubagem' | 'mandados' | 'fotopdf' | 'mapas' | 'validardof' | 'diariodebordo';

interface MenuItem {
  id: View;
  label: string;
  icon: any;
  externalUrl?: string;
}

interface HomeProps {
  onNavigate: (view: View) => void;
  offlineMode?: boolean;
}

export default function Home({ onNavigate, offlineMode }: HomeProps) {
  const menuItems: MenuItem[] = [
    { 
      id: 'camstamp', 
      label: 'Foto Georreferenciada', 
      icon: Camera,
    },
    { 
      id: 'mapas', 
      label: 'Mapas Georreferenciados', 
      icon: Map,
    },
    { 
      id: 'cubagem', 
      label: 'Cubagem de Madeiras', 
      icon: Calculator,
    },
    { 
      id: 'validardof', 
      label: 'Validar DOF', 
      icon: ShieldCheck,
      externalUrl: 'https://dof.ibama.gov.br/autenticidade/',
    },
    { 
      id: 'mandados', 
      label: 'Buscar Mandado de Prisão', 
      icon: Shield,
    },
    { 
      id: 'fotopdf', 
      label: 'Fotos em PDF', 
      icon: FileImage,
    },
    { 
      id: 'diariodebordo', 
      label: 'Diário de Bordo', 
      icon: BookOpen,
    }
  ];

  return (
    <div className="flex flex-col min-h-[90vh] justify-between pb-8 pt-1" id="home-container">
      <div className="w-full space-y-3.5">
        {/* Header com identidade BPA militar */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative bg-military-850 border border-military-700/80 py-3 px-5 rounded-2xl overflow-hidden text-center shadow-md"
          id="header-card"
        >
          <div className="relative z-10 flex flex-col items-center justify-center">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-military-100 uppercase font-sans">
              APLICAÇÕES AMBIENTAIS
            </h1>
            <p className="text-xs sm:text-[13px] text-military-300 mt-1 max-w-[340px] mx-auto leading-normal font-bold uppercase tracking-wider">
              Plataforma de Gestão de Campo e Fiscalização
            </p>
          </div>
        </motion.div>

        {/* Modules Navigation - List Style Buttons com apenas o nome principal */}
        <div className="w-full space-y-2 px-0.5" id="menu-list-container">
          {menuItems.map((item, index) => {
            const IconComp = item.icon;
            const sharedClassName = 'w-full text-left rounded-2xl p-3.5 flex items-center justify-between gap-3.5 transition-all duration-150 cursor-pointer shadow-lg group border bg-military-850 hover:bg-military-800 text-military-100 border-military-700/80 hover:border-military-600';

            const innerContent = (
              <>
                {/* Left Icon */}
                <div className="p-2.5 rounded-xl shrink-0 transition-colors flex items-center justify-center bg-military-900 text-military-300 border border-military-750 group-hover:text-military-100 group-hover:border-military-600">
                  <IconComp className="w-5 h-5" strokeWidth={2.2} />
                </div>

                {/* Center Content - Apenas o nome principal do botão */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-sm sm:text-base uppercase tracking-wide leading-tight truncate text-military-100 group-hover:text-white">
                      {item.label}
                    </h3>
                  </div>
                </div>

                {/* Right Arrow / Action Indicator */}
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all bg-military-900 border border-military-750 text-military-300 group-hover:text-military-100 group-hover:border-military-600 group-hover:translate-x-0.5">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </>
            );

            if (item.externalUrl && !offlineMode) {
              return (
                <motion.a
                  key={item.id}
                  href={item.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onNavigate(item.id)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03, duration: 0.15 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className={sharedClassName}
                  id={`btn-menu-${item.id}`}
                >
                  {innerContent}
                </motion.a>
              );
            }

            return (
              <motion.button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03, duration: 0.15 }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className={sharedClassName}
                id={`btn-menu-${item.id}`}
              >
                {innerContent}
              </motion.button>
            );
          })}
        </div>

        {/* PWA In-App Install Prompt posicionado no final da página do aplicativo */}
        <div className="pt-2" id="bottom-pwa-install-container">
          <PWAInstallButton />
        </div>
      </div>

      {/* Footer */}
      <footer className="pt-6 pb-2 text-center" id="footer">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-xs font-mono tracking-wider uppercase text-military-300 font-extrabold">
            BPA • Operação e Fiscalização Integrada
          </span>
        </div>
        <p className="text-[11px] text-military-400 uppercase tracking-widest font-mono font-medium">
          Acre • Suporte Offline Ativo
        </p>
      </footer>
    </div>
  );
}
