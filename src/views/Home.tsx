import { motion } from 'motion/react';
import { 
  Camera, 
  Calculator, 
  Shield,
  Map,
  FileImage,
  BookOpen,
  ChevronRight,
  Sparkles
} from 'lucide-react';
type View = 'home' | 'camstamp' | 'cubagem' | 'mandados' | 'fotopdf' | 'mapas' | 'bpaoperacional' | 'verificarcar' | 'diariodebordo';

interface HomeProps {
  onNavigate: (view: View) => void;
}

export default function Home({ onNavigate }: HomeProps) {
  const menuItems: { id: View; label: string; icon: any; subtitle: string; description: string; isPrimary?: boolean }[] = [
    { 
      id: 'camstamp', 
      label: 'Foto Georreferenciada', 
      icon: Camera,
      subtitle: 'CamStamp com Carimbo GPS e Altitude',
      description: 'Captura fotográfica fiscal com marca d\'água de coordenadas, altitude, data e hora.',
      isPrimary: true
    },
    { 
      id: 'mapas', 
      label: 'Mapas Georreferenciados', 
      icon: Map,
      subtitle: 'Navegação Tática, KML e Trilha GPS',
      description: 'Monitoramento de áreas de interesse, polígonos KML e mapas base offline com gravação de trilha.'
    },
    { 
      id: 'cubagem', 
      label: 'Cubagem de Madeiras', 
      icon: Calculator,
      subtitle: 'Cálculo Florestal em Tora e Bloco',
      description: 'Cálculo volumétrico analítico Smalian para toras e peças serradas no campo.'
    },
    { 
      id: 'bpaoperacional', 
      label: 'Buscar Dados do CAR', 
      icon: Shield,
      subtitle: 'Pesquisa e Dossiê Territorial do Acre',
      description: 'Consulta georreferenciada de propriedades e SICAR a partir de coordenadas GPS.'
    },
    { 
      id: 'mandados', 
      label: 'Buscar Mandado de Prisão', 
      icon: Shield,
      subtitle: 'Consulta de Segurança Pública e BNMP',
      description: 'Pesquisa rápida, precisa e offline de mandados de prisão ativos no Acre.'
    },
    { 
      id: 'fotopdf', 
      label: 'Fotos em PDF', 
      icon: FileImage,
      subtitle: 'Gerador de Relatórios e Laudos Fotográficos',
      description: 'Conversão rápida de imagens de campo em documentos PDF com enquadramento ajustável.'
    },
    { 
      id: 'diariodebordo', 
      label: 'Diário de Bordo', 
      icon: BookOpen,
      subtitle: 'Bloco de Anotações e Registros de Serviço',
      description: 'Registro de ocorrências, relatos operacionais e anotações com data e hora.'
    }
  ];

  return (
    <div className="flex flex-col min-h-[90vh] justify-between pb-8 pt-1" id="home-container">
      <div className="w-full space-y-3.5">
        {/* Header com identidade BPA militar - Sem ícone quadrado para elevar botões */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative bg-military-850 border border-military-700/80 py-3 px-5 rounded-2xl overflow-hidden text-center shadow-md"
          id="header-card"
        >
          <div className="relative z-10 flex flex-col items-center justify-center">
            <h1 className="text-xl font-black tracking-tight text-military-100 uppercase font-sans">
              APLICAÇÕES AMBIENTAIS
            </h1>
            <p className="text-[11px] text-military-400 mt-0.5 max-w-[300px] mx-auto leading-normal font-bold uppercase tracking-widest">
              Plataforma de Gestão de Campo e Fiscalização
            </p>
          </div>
        </motion.div>

        {/* Modules Navigation - List Style Buttons */}
        <div className="w-full space-y-2.5 px-0.5" id="menu-list-container">
          {menuItems.map((item, index) => {
            const IconComp = item.icon;
            const isPrimary = item.isPrimary;

            return (
              <motion.button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03, duration: 0.15 }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className={`w-full text-left rounded-2xl p-4 flex items-center justify-between gap-3.5 transition-all duration-150 cursor-pointer shadow-lg group border ${
                  isPrimary
                    ? 'bg-military-600 hover:bg-military-500 text-white border-military-500 ring-2 ring-military-500/20 shadow-military-900/40'
                    : 'bg-military-850 hover:bg-military-800 text-military-100 border-military-700/80 hover:border-military-600'
                }`}
                id={`btn-menu-${item.id}`}
              >
                {/* Left Icon */}
                <div className={`p-3 rounded-xl shrink-0 transition-colors flex items-center justify-center ${
                  isPrimary
                    ? 'bg-military-700/70 text-white border border-military-400/40'
                    : 'bg-military-900 text-military-400 border border-military-750 group-hover:text-military-200 group-hover:border-military-600'
                }`}>
                  <IconComp className="w-5 h-5" strokeWidth={2.2} />
                </div>

                {/* Center Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-black text-[13px] uppercase tracking-wide leading-tight truncate ${
                      isPrimary ? 'text-white' : 'text-military-100 group-hover:text-white'
                    }`}>
                      {item.label}
                    </h3>
                    {isPrimary && (
                      <span className="bg-white/20 text-white text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0">
                        Principal
                      </span>
                    )}
                  </div>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 truncate ${
                    isPrimary ? 'text-military-200' : 'text-military-400'
                  }`}>
                    {item.subtitle}
                  </p>
                </div>

                {/* Right Arrow / Action Indicator */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  isPrimary
                    ? 'bg-military-500/60 text-white group-hover:translate-x-0.5'
                    : 'bg-military-900 border border-military-750 text-military-400 group-hover:text-military-200 group-hover:border-military-600 group-hover:translate-x-0.5'
                }`}>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <footer className="pt-6 pb-2 text-center" id="footer">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="w-1.5 h-1.5 bg-military-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-mono tracking-widest uppercase text-military-400 font-extrabold">
            BPA • Operação e Fiscalização Integrada
          </span>
        </div>
        <p className="text-[9px] text-military-500 uppercase tracking-widest font-mono">
          Acre • Suporte Offline Ativo
        </p>
      </footer>
    </div>
  );
}
