import { motion } from 'motion/react';
import { 
  Camera, 
  Calculator, 
  Search, 
  FileImage, 
  Shield,
  Map,
  Trees
} from 'lucide-react';
import { View } from '../App';
import brandLogo from '../assets/images/batalhao_ambiental_logo_1779854041969.png';

interface HomeProps {
  onNavigate: (view: View) => void;
}

export default function Home({ onNavigate }: HomeProps) {
  const menuItems: { id: View; label: string; icon: any; description: string }[] = [
    { 
      id: 'camstamp', 
      label: 'Foto Georreferenciada', 
      icon: Camera,
      description: 'CamStamp - Captura de imagens com dados de GPS'
    },
    { 
      id: 'mapas', 
      label: 'Mapas Georreferenciados', 
      icon: Map,
      description: 'Visualização de mapas e camadas geocodificadas'
    },
    { 
      id: 'cubagem', 
      label: 'Cubagem de Madeiras', 
      icon: Calculator,
      description: 'Cálculo de volume para fiscalização ambiental'
    },
    { 
      id: 'bpaoperacional', 
      label: 'Buscar Dados do CAR', 
      icon: Shield,
      description: 'Verificar dados de uma propriedade a partir de uma coordenada geográfica.'
    },
    { 
      id: 'fotopdf', 
      label: 'Foto em PDF', 
      icon: FileImage,
      description: 'Conversão de imagens em documentos PDF'
    },
    { 
      id: 'identificacao', 
      label: 'Identificação de Madeiras', 
      icon: Trees,
      description: 'Guia para reconhecimento de espécies'
    }
  ];

  return (
    <div className="flex flex-col items-center pt-8 pb-12">
      {/* Header Section */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-10 w-full"
      >
        <div className="inline-flex items-center justify-center p-0 bg-[#121911] rounded-2xl mb-4 border border-military-700 shadow-xl overflow-hidden w-16 h-16">
          <img 
            src={brandLogo} 
            alt="Batalhão Ambiental Logo" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer" 
          />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-military-100 uppercase">
          APLICAÇÕES BPA
        </h1>
        <div className="mt-4 border-t-2 border-military-700 w-2/3 mx-auto" />
      </motion.div>

      {/* Buttons List */}
      <div className="w-full space-y-4 px-2">
        {menuItems.map((item, index) => (
          <motion.button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full group relative overflow-hidden bg-military-800 hover:bg-military-700 border-2 border-military-700 hover:border-military-500 p-5 rounded-xl text-left transition-all shadow-lg active:shadow-inner"
          >
            {/* Background Texture Effect */}
            <div className="absolute top-0 right-0 p-1 opacity-10 group-hover:opacity-20 transition-opacity">
              <item.icon size={80} />
            </div>
            
            <div className="relative flex items-center gap-4">
              <div className="p-3 bg-military-700 group-hover:bg-military-600 rounded-lg text-military-200 transition-colors">
                <item.icon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg uppercase tracking-wide group-hover:text-military-200 transition-colors">
                  {item.label}
                </h3>
                <p className="text-xs text-military-400 font-medium">
                  {item.description}
                </p>
              </div>
            </div>
            
            {/* "Rugged" Corner Decal */}
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-military-600 group-hover:border-military-400 rounded-tr-xl transition-colors" />
          </motion.button>
        ))}
      </div>

      {/* Footer / Version Info */}
      <footer className="mt-auto pt-16 text-center opacity-40">
        <p className="text-[10px] font-mono tracking-widest uppercase">
          Unificação de Projetos BPA © 2026
        </p>
      </footer>
    </div>
  );
}
