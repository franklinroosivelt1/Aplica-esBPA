import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  FileImage, 
  Upload, 
  FileText, 
  Download, 
  Trash2, 
  Camera, 
  RotateCcw,
  Check,
  X,
  Share2,
  Maximize,
  Minimize,
  ChevronLeft
} from 'lucide-react';
import { jsPDF } from 'jspdf';

interface FotoPDFProps {
  onBack: () => void;
}

type Mode = 'selection' | 'camera' | 'review' | 'pdf';

export default function FotoPDF({ onBack }: FotoPDFProps) {
  const [images, setImages] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('selection');
  const [currentPhoto, setCurrentPhoto] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Start/Stop Camera
  useEffect(() => {
    if (mode === 'camera') {
      async function startCamera() {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          setHasPermission(true);
        } catch (err) {
          console.error(err);
          setHasPermission(false);
        }
      }
      startCamera();
      return () => {
        const stream = videoRef.current?.srcObject as MediaStream;
        stream?.getTracks().forEach(track => track.stop());
      };
    }
  }, [mode]);

  const handleTakePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCurrentPhoto(dataUrl);
    setMode('review');
  }, []);

  const handleSavePhoto = () => {
    if (currentPhoto) {
      setImages([...images, currentPhoto]);
      setCurrentPhoto(null);
      setMode('selection');
    }
  };

  const generatePDF = async () => {
    if (images.length === 0) return;
    
    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4'
    });

    for (let i = 0; i < images.length; i++) {
      if (i > 0) pdf.addPage();
      
      const img = images[i];
      // Simple logic to fit image in A4
      const imgProps = pdf.getImageProperties(img);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const ratio = imgProps.width / imgProps.height;
      
      let width = pdfWidth - 20;
      let height = width / ratio;
      
      if (height > pdfHeight - 20) {
        height = pdfHeight - 20;
        width = height * ratio;
      }

      pdf.addImage(img, 'JPEG', 10, 10, width, height);
    }

    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    setGeneratedPdfUrl(url);
    setMode('pdf');
  };

  const handleShare = async () => {
    if (!generatedPdfUrl) return;
    const response = await fetch(generatedPdfUrl);
    const blob = await response.blob();
    const file = new File([blob], 'BPA_DOCUMENTO.pdf', { type: 'application/pdf' });

    if (navigator.share) {
      try {
        await navigator.share({
          files: [file],
          title: 'Documento BPA',
          text: 'PDF gerado via App BPA'
        });
      } catch (err) {
        console.error('Share failed', err);
      }
    } else {
      const link = document.createElement('a');
      link.href = generatedPdfUrl;
      link.download = 'BPA_DOCUMENTO.pdf';
      link.click();
    }
  };

  if (mode === 'camera') {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col">
        <div className="flex-1 relative">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
          
          {/* Focus Ring Mock */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border-2 border-military-300 rounded-full opacity-30 animate-pulse pointer-events-none" />
          
          {/* Zoom Controls */}
          <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-4 bg-black/40 p-2 rounded-full backdrop-blur-sm">
            <button onClick={() => setZoom(z => Math.min(z + 0.1, 2))} className="p-2 text-white hover:bg-white/20 rounded-full">
              <Maximize size={20} />
            </button>
            <div className="h-20 w-1 bg-white/20 mx-auto rounded-full relative">
              <div className="absolute bottom-0 w-full bg-military-300 rounded-full transition-all" style={{ height: `${(zoom - 1) * 100}%` }} />
            </div>
            <button onClick={() => setZoom(z => Math.max(z - 0.1, 1))} className="p-2 text-white hover:bg-white/20 rounded-full">
              <Minimize size={20} />
            </button>
          </div>
        </div>

        <div className="h-32 bg-military-950 flex items-center justify-around px-8">
          <button onClick={() => setMode('selection')} className="p-4 text-white hover:bg-military-800 rounded-full">
            <X size={28} />
          </button>
          
          <button onClick={handleTakePhoto} className="w-20 h-20 bg-white rounded-full p-2">
            <div className="w-full h-full rounded-full border-4 border-military-950" />
          </button>
          
          <div className="w-14" />
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  if (mode === 'review') {
    return (
      <div className="fixed inset-0 z-[100] bg-military-950 flex flex-col p-6">
        <h2 className="text-xl font-bold mb-4 uppercase tracking-tight text-center">Conferir Foto</h2>
        <div className="flex-1 bg-neutral-900 rounded-3xl overflow-hidden shadow-2xl relative border border-military-700">
          <img src={currentPhoto!} className="w-full h-full object-contain" alt="Review" />
        </div>
        <div className="py-8 grid grid-cols-2 gap-4">
          <button 
            onClick={() => { setCurrentPhoto(null); setMode('camera'); }}
            className="flex items-center justify-center gap-2 bg-red-500/10 border-2 border-red-500/50 text-red-500 p-4 rounded-2xl font-bold"
          >
            <Trash2 size={20} /> EXCLUIR
          </button>
          <button 
            onClick={handleSavePhoto}
            className="flex items-center justify-center gap-2 bg-military-300 text-military-950 p-4 rounded-2xl font-bold shadow-xl shadow-military-300/20"
          >
            <Check size={24} /> SALVAR
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'pdf') {
    return (
      <div className="fixed inset-0 z-[100] bg-military-950 flex flex-col p-6">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-bold uppercase tracking-tight">PDF GERADO</h2>
          <button onClick={() => setMode('selection')} className="p-2 bg-military-800 rounded-lg">
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 bg-white rounded-2xl shadow-2xl overflow-hidden relative">
          <iframe src={generatedPdfUrl!} className="w-full h-full border-none" title="PDF Preview" />
        </div>

        <div className="py-8 flex flex-col gap-4">
          <button 
            onClick={handleShare}
            className="bg-military-300 text-military-950 p-5 rounded-2xl font-black flex items-center justify-center gap-3 shadow-2xl"
          >
            <Share2 size={24} /> COMPARTILHAR PDF
          </button>
          
          <button 
            onClick={() => { setImages([]); setMode('selection'); }}
            className="text-military-500 text-sm font-bold flex items-center justify-center gap-2"
          >
            <RotateCcw size={16} /> NOVO DOCUMENTO
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with only Back button */}
      <div className="flex items-center justify-between pt-2 pb-2">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-military-800 rounded-lg flex items-center gap-2 group transition-colors"
        >
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold text-sm uppercase tracking-tight">Voltar</span>
        </button>
      </div>

      <div 
        onClick={() => setMode('camera')}
        className="cursor-pointer text-center px-4 py-8 bg-military-800/30 border-2 border-dashed border-military-700 rounded-3xl group hover:border-military-500 transition-all active:scale-95"
      >
        <div className="w-20 h-20 bg-military-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-military-700 shadow-xl group-hover:scale-110 transition-transform">
          <Camera className="w-8 h-8 text-military-400 group-hover:text-military-300" />
        </div>
        <h3 className="text-xl font-bold mb-2 uppercase tracking-tighter">CÂMERA PDF</h3>
        <p className="text-xs text-military-500 mb-6 max-w-[200px] mx-auto uppercase tracking-widest font-mono">
          Toque para escanear
        </p>
      </div>

      <div className="bg-military-800 rounded-3xl p-6 border border-military-700 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <FileImage className="w-5 h-5 text-military-300" />
            <h2 className="font-bold text-lg uppercase tracking-tight">Páginas</h2>
          </div>
          <span className="text-[10px] font-mono bg-military-900 border border-military-700 px-2 py-1 rounded">
            {images.length} ARQUIVOS
          </span>
        </div>

        {images.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-military-600 opacity-50">
            <FileImage size={48} strokeWidth={1} />
            <p className="mt-4 text-xs font-mono uppercase tracking-[0.2em]">Aguardando Captura</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {images.map((img, idx) => (
              <div key={idx} className="relative group aspect-[3/4] rounded-xl overflow-hidden border-2 border-military-700 shadow-lg">
                <img src={img} className="w-full h-full object-cover" alt="Preview" />
                <button 
                  onClick={(e) => { e.stopPropagation(); setImages(images.filter((_, i) => i !== idx)); }}
                  className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-xl shadow-lg"
                >
                  <Trash2 size={16} />
                </button>
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/60 backdrop-blur-sm">
                  <p className="text-[10px] font-mono text-white/90">PÁG {idx + 1}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {images.length > 0 && (
          <div className="mt-8 space-y-3">
            <button 
              onClick={generatePDF}
              className="w-full bg-military-600 hover:bg-military-500 text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
            >
              <FileText className="w-6 h-6" />
              GERAR DOCUMENTO PDF
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 p-4 bg-military-700/20 border border-military-700 rounded-2xl">
        <Download className="w-5 h-5 text-military-300" />
        <p className="text-[10px] text-military-400 uppercase font-bold tracking-wider">Compilação de páginas para PDF oficial.</p>
      </div>
    </div>
  );
}
