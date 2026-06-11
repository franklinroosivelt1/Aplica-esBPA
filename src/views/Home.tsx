import { motion } from 'motion/react';
import { 
  Camera, 
  Calculator, 
  Search, 
  FileImage, 
  Shield,
  Map,
  Trees,
  Compass,
  FileText
} from 'lucide-react';
import { View } from '../App';
import brandLogo from '../assets/images/batalhao_ambiental_logo_1779854041969.png';

interface HomeProps {
  onNavigate: (view: View) => void;
}

export default function Home({ onNavigate }: HomeProps) {
  const menuItems: { id: View; label: string; icon: any; subtitle: string; description: string; badge?: string }[] = [
    { 
      id: 'camstamp', 
      label: 'Foto Georreferenciada', 
      icon: Camera,
      subtitle: 'CamStamp - GPS Integrado',
      description: 'Captura fotográfica fiscal com marca d\'água de coordenadas, altitude, data e hora.',
      badge: 'Câmera'
    },
    { 
      id: 'mapas', 
      label: 'Mapas Georreferenciados', 
      icon: Map,
      subtitle: 'Navegação e Camadas Offline',
      description: 'Monitoramento de áreas de interesse, polígonos KML e mapas base offline.',
      badge: 'Geo'
    },
    { 
      id: 'cubagem', 
      label: 'Cubagem de Madeiras', 
      icon: Calculator,
      subtitle: 'Cálculo de Volume Florestal',
      description: 'Cálculo volumétrico analítico de toras empilhadas ou individuais no campo.',
      badge: 'Cubagem'
    },
    { 
      id: 'bpaoperacional', 
      label: 'Buscar Dados do CAR', 
      icon: Shield,
      subtitle: 'Verificação de Imóveis CAR',
      description: 'Consulta georreferenciada instantânea de propriedades a partir de coordenadas GPS.',
      badge: 'Consulta'
    },
    { 
      id: 'mandados', 
      label: 'Buscar Mandado de Prisão', 
      icon: Shield,
      subtitle: 'Consulta de Foragidos Offline',
      description: 'Pesquisa tática e offline de mandados de prisão ativos ou foragidos da justiça de Acre.',
      badge: 'Mandados'
    },
    { 
      id: 'fotopdf', 
      label: 'Foto em PDF', 
      icon: FileImage,
      subtitle: 'Geração de Laudos e Relatórios',
      description: 'Conversão rápida de registros fotográficos de campo em relatórios PDF padronizados.',
      badge: 'PDF'
    }
  ];

  return (
    <div className="flex flex-col min-h-[92vh] justify-between py-2">
      {/* Modern, light-themed discret header */}
      <div className="w-full">
        <motion.div 
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="relative bg-military-800 border border-military-750 p-6 rounded-3xl shadow-sm overflow-hidden mb-6 text-center"
        >
          {/* Grid pattern for high-end feel */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(60,94,60,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(60,94,60,0.02)_1px,transparent_1px)] bg-[size:14px_14px] pointer-events-none" />
          
          <div className="relative z-10 flex flex-col items-center justify-center gap-3">
            {/* Logo container with elegant layout */}
            <div className="inline-flex items-center justify-center p-1 bg-military-850 rounded-2xl border border-military-700/50 shadow-sm w-16 h-16 transition-transform hover:scale-105 duration-300">
              <img 
                src={brandLogo} 
                alt="Batalhão Ambiental Logo" 
                className="w-full h-full object-contain rounded-xl"
                referrerPolicy="no-referrer" 
              />
            </div>

            <div>
              <h1 className="text-xl font-black tracking-tight text-military-300 uppercase font-sans">
                APLICAÇÕES BPA
              </h1>
              <p className="text-[11px] text-military-550 mt-1 max-w-[240px] mx-auto leading-normal font-sans font-medium">
                Ferramentas especializadas para fiscalização e proteção ambiental
              </p>
            </div>
          </div>
        </motion.div>

        {/* Modules Navigation Matrix */}
        <div className="w-full space-y-4 px-1">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#5c725a] px-2 mb-2 flex items-center justify-between">
            <span>Ferramentas de Campo</span>
            <span>6 Módulos Operacionais</span>
          </div>

          <div className="space-y-4">
            {menuItems.map((item, index) => (
              <motion.button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                whileHover={{ scale: 1.012, y: -2 }}
                whileTap={{ scale: 0.985 }}
                className="w-full group relative overflow-hidden bg-military-800 hover:bg-military-850/40 border border-military-750 hover:border-military-500 p-5 rounded-2xl text-left transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-4 cursor-pointer"
              >
                {/* Lightweight Label Badge */}
                {item.badge && (
                  <div className="absolute top-4 right-4 px-2 py-0.5 rounded bg-military-850 group-hover:bg-military-700/20 border border-military-750 text-[8px] font-mono uppercase tracking-wider text-military-500 transition-colors">
                    {item.badge}
                  </div>
                )}
                
                {/* Lightweight Icon Wrapper with Solid Borders */}
                <div className="flex-shrink-0 p-3 bg-military-900 group-hover:bg-military-500 border border-military-750 group-hover:border-military-500 rounded-xl text-military-500 group-hover:text-white transition-all duration-200 shadow-inner">
                  <item.icon className="w-5 h-5" />
                </div>
                
                {/* Meta details */}
                <div className="pr-12">
                  <h3 className="font-bold text-[14px] uppercase tracking-wide text-military-100 group-hover:text-military-300 transition-colors">
                    {item.label}
                  </h3>
                  <h4 className="text-[11px] text-military-550 font-semibold font-sans leading-tight mt-0.5">
                    {item.subtitle}
                  </h4>
                  <p className="text-[10px] text-military-600 mt-1 lines-clamp-2 leading-relaxed font-medium">
                    {item.description}
                  </p>
                </div>

                {/* Elegant Corner Indicator */}
                <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-military-700/20 group-hover:border-military-500 transition-colors" />
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Modern, discreet Footer */}
      <footer className="pt-12 pb-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-1.5 opacity-60">
          <div className="w-1.5 h-1.5 bg-military-500 rounded-full animate-pulse" />
          <span className="text-[9px] font-mono tracking-widest uppercase text-military-500 font-bold">
            Batalhão de Policiamento Ambiental • BPA
          </span>
        </div>
        <p className="text-[8px] font-mono text-military-600 tracking-widest uppercase opacity-45">
          Unificação de Projetos BPA • Versão Geral v1.5
        </p>
      </footer>
    </div>
  );
}
