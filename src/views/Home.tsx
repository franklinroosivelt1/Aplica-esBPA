import { motion } from 'motion/react';
import { 
  Camera, 
  Calculator, 
  Shield,
  Map,
  FileImage,
} from 'lucide-react';
type View = 'home' | 'camstamp' | 'cubagem' | 'mandados' | 'fotopdf' | 'mapas' | 'bpaoperacional' | 'verificarcar';
import brandLogo from '../assets/images/batalhao_ambiental_logo_1779854041969.png';

interface HomeProps {
  onNavigate: (view: View) => void;
}

export default function Home({ onNavigate }: HomeProps) {
  const menuItems: { id: View; label: string; icon: any; subtitle: string; description: string; offline: boolean }[] = [
    { 
      id: 'camstamp', 
      label: 'Foto Georreferenciada', 
      icon: Camera,
      subtitle: 'CamStamp - GPS Integrado',
      description: 'Captura fotográfica fiscal com marca d\'água de coordenadas, altitude, data e hora.',
      offline: true
    },
    { 
      id: 'mapas', 
      label: 'Mapas Georreferenciados', 
      icon: Map,
      subtitle: 'Navegação e Camadas Offline',
      description: 'Monitoramento de áreas de interesse, polígonos KML e mapas base offline.',
      offline: true
    },
    { 
      id: 'cubagem', 
      label: 'Cubagem de Madeiras', 
      icon: Calculator,
      subtitle: 'Cálculo de Volume Florestal',
      description: 'Cálculo volumétrico analítico de toras empilhadas ou individuais no campo.',
      offline: true
    },
    { 
      id: 'bpaoperacional', 
      label: 'Buscar Dados do CAR', 
      icon: Shield,
      subtitle: 'Verificação de Imóveis CAR',
      description: 'Consulta georreferenciada instantânea de propriedades a partir de coordenadas GPS.',
      offline: false
    },
    { 
      id: 'mandados', 
      label: 'Buscar Mandado de Prisão', 
      icon: Shield,
      subtitle: 'Consulta de Foragidos Offline',
      description: 'Pesquisa tática e offline de mandados de prisão ativos ou foragidos da justiça de Acre.',
      offline: true
    },
    { 
      id: 'fotopdf', 
      label: 'Foto em PDF', 
      icon: FileImage,
      subtitle: 'Geração de Laudos e Relatórios',
      description: 'Conversão rápida de registros fotográficos de campo em relatórios PDF padronizados.',
      offline: true
    }
  ];

  return (
    <div className="flex flex-col min-h-[92vh] justify-between py-4 bg-[#F8F9FA]" id="home-container">
      {/* Pristine, light-themed high-contrast header */}
      <div className="w-full">
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative bg-white border border-[#E5E7EB] p-6 rounded-[16px] overflow-hidden mb-6 text-center"
          id="header-card"
        >
          {/* Subtle grid pattern for premium field dashboard feel */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(14,116,144,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(14,116,144,0.015)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />
          
          <div className="relative z-10 flex flex-col items-center justify-center gap-3">
            {/* Logo container with elegant layout */}
            <div className="inline-flex items-center justify-center p-1.5 bg-white rounded-2xl border border-[#E5E7EB] shadow-sm w-16 h-16 transition-transform hover:scale-105 duration-200">
              <img 
                src={brandLogo} 
                alt="Batalhão Ambiental Logo" 
                className="w-full h-full object-contain rounded-xl"
                referrerPolicy="no-referrer" 
              />
            </div>

            <div>
              <h1 className="text-xl font-black tracking-tight text-[#111827] uppercase font-sans">
                APLICAÇÕES BPA
              </h1>
              <p className="text-[12px] text-[#4B5563] mt-1 max-w-[280px] mx-auto leading-normal font-sans font-semibold">
                Batalhão de Policiamento Ambiental do Acre • BPA
              </p>
            </div>
          </div>
        </motion.div>

        {/* Modules Navigation Grid */}
        <div className="w-full space-y-4 px-1">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0E7490] px-2 mb-2 flex items-center justify-between">
            <span>Módulos Operacionais</span>
            <span>Estação de Trabalho</span>
          </div>

          <div className="space-y-3.5">
            {menuItems.map((item, index) => {
              const IconComp = item.icon;
              return (
                <motion.button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03, duration: 0.15 }}
                  whileHover={{ y: -1, scale: 1.005 }}
                  whileTap={{ scale: 0.99 }}
                  className="w-full text-left bg-white border border-[#E5E7EB] hover:border-[#0E7490] rounded-[16px] p-5 flex items-start gap-4 transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0E7490] shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                  id={`btn-menu-${item.id}`}
                >
                  {/* Heavy, Minimalist Filled Icon Wrapper */}
                  <div className={`flex-shrink-0 p-3 rounded-xl ${item.offline ? 'bg-[#DCFCE7] text-[#14532D]' : 'bg-[#DBEAFE] text-[#1E3A8A]'} transition-colors`}>
                    <IconComp className="w-6 h-6" fill="currentColor" strokeWidth={1.5} />
                  </div>

                  {/* Text Details with High Contrast */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 justify-between">
                      <h3 className="font-extrabold text-[15px] text-[#111827] uppercase tracking-wide leading-tight">
                        {item.label}
                      </h3>
                      {/* Connection Badge */}
                      {item.offline ? (
                        <span className="inline-flex items-center text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#DCFCE7] text-[#14532D] border border-[#BBF7D0]">
                          [ ⚡ Offline Disponível ]
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#DBEAFE] text-[#1E3A8A] border border-[#BFDBFE]">
                          [ 🌐 Requer Internet ]
                        </span>
                      )}
                    </div>
                    <h4 className="text-[12px] text-[#0E7490] font-extrabold font-sans mt-1">
                      {item.subtitle}
                    </h4>
                    <p className="text-[11px] text-[#374151] mt-1.5 leading-relaxed font-semibold">
                      {item.description}
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modern, high-visibility Footer */}
      <footer className="pt-8 pb-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-1.5">
          <div className="w-1.5 h-1.5 bg-[#0E7490] rounded-full animate-pulse" />
          <span className="text-[10px] font-mono tracking-widest uppercase text-[#111827] font-bold">
            POLÍCIA MILITAR DO ESTADO DO ACRE
          </span>
        </div>
        <p className="text-[9px] font-mono text-[#4B5563] tracking-widest uppercase font-bold">
          Batalhão de Policiamento Ambiental • BPA • v1.6
        </p>
      </footer>
    </div>
  );
}
