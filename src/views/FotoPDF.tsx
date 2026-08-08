import { useState, useRef, useEffect, useCallback, ChangeEvent } from 'react';
import { 
  FileImage, 
  Upload, 
  FileText, 
  Download, 
  Trash2, 
  Camera, 
  RotateCcw,
  RotateCw,
  Plus,
  Minus,
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

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
};

export default function FotoPDF({ onBack }: FotoPDFProps) {
  const [images, setImages] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('selection');
  const [currentPhoto, setCurrentPhoto] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleGalleryImport = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files) as File[];
    
    // Convert all selected images to base64 data URLs
    const readPromises = fileList.map((file: File) => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result && typeof event.target.result === 'string') {
            resolve(event.target.result);
          } else {
            reject(new Error('Falha ao ler arquivo'));
          }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readPromises)
      .then(base64Images => {
        setImages(prev => [...prev, ...base64Images]);
        if (fileInputRef.current) {
          fileInputRef.current.value = ''; // Reset input so the same file can be chosen again
        }
      })
      .catch(err => {
        console.error('Erro ao importar imagens da galeria:', err);
      });
  };

  // Start/Stop Camera
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    if (mode === 'camera') {
      async function startCamera() {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
          });
          activeStream = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(err => console.error("Video play error:", err));
          }
          setHasPermission(true);
        } catch (err) {
          console.error(err);
          setHasPermission(false);
        }
      }
      startCamera();
      return () => {
        if (activeStream) {
          activeStream.getTracks().forEach(track => track.stop());
        } else {
          const stream = videoRef.current?.srcObject as MediaStream;
          stream?.getTracks().forEach(track => track.stop());
        }
      };
    }
  }, [mode]);

  const handleTakePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;

    if (zoom > 1) {
      const zoomedWidth = width / zoom;
      const zoomedHeight = height / zoom;
      const sx = (width - zoomedWidth) / 2;
      const sy = (height - zoomedHeight) / 2;
      ctx.drawImage(video, sx, sy, zoomedWidth, zoomedHeight, 0, 0, width, height);
    } else {
      ctx.drawImage(video, 0, 0);
    }
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCurrentPhoto(dataUrl);
    setMode('review');
  }, [zoom]);

  const handleSavePhoto = () => {
    if (currentPhoto) {
      setImages([...images, currentPhoto]);
      setCurrentPhoto(null);
      setMode('selection');
    }
  };

  const [selectedPageImageIndex, setSelectedPageImageIndex] = useState<number | null>(null);
  const [selectedPageImageUrl, setSelectedPageImageUrl] = useState<string | null>(null);

  const rotateImage = (direction: 'left' | 'right') => {
    if (!currentPhoto) return;
    const imgObj = new Image();
    imgObj.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      canvas.width = imgObj.height;
      canvas.height = imgObj.width;
      
      if (direction === 'right') {
        ctx.translate(canvas.width, 0);
        ctx.rotate(Math.PI / 2);
      } else {
        ctx.translate(0, canvas.height);
        ctx.rotate(-Math.PI / 2);
      }
      
      ctx.drawImage(imgObj, 0, 0);
      const rotatedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCurrentPhoto(rotatedDataUrl);
    };
    imgObj.src = currentPhoto;
  };

  const handleRotatePageImage = (idx: number, direction: 'left' | 'right') => {
    const targetImg = images[idx];
    if (!targetImg) return;
    
    const imgObj = new Image();
    imgObj.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      canvas.width = imgObj.height;
      canvas.height = imgObj.width;
      
      if (direction === 'right') {
        ctx.translate(canvas.width, 0);
        ctx.rotate(Math.PI / 2);
      } else {
        ctx.translate(0, canvas.height);
        ctx.rotate(-Math.PI / 2);
      }
      
      ctx.drawImage(imgObj, 0, 0);
      const rotatedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      
      setImages(prev => {
        const updated = [...prev];
        updated[idx] = rotatedDataUrl;
        return updated;
      });
      
      // If this was the previewed image, update the preview state too
      if (selectedPageImageIndex === idx) {
        setSelectedPageImageUrl(rotatedDataUrl);
      }
    };
    imgObj.src = targetImg;
  };

  const generatePDF = async () => {
    if (images.length === 0) return;

    // Load all images first to extract natural dimensions
    const loadedImagesInfo = await Promise.all(
      images.map(async (img) => {
        try {
          const loadedImg = await loadImage(img);
          const naturalWidth = loadedImg.naturalWidth || loadedImg.width || 1280;
          const naturalHeight = loadedImg.naturalHeight || loadedImg.height || 720;
          return { img, naturalWidth, naturalHeight };
        } catch (err) {
          console.error('Failed to load image for PDF', err);
          return { img, naturalWidth: 1280, naturalHeight: 720 };
        }
      })
    );

    let pdf: jsPDF | null = null;
    const margin = 5; // 5mm light white border

    for (let i = 0; i < loadedImagesInfo.length; i++) {
      const { img, naturalWidth, naturalHeight } = loadedImagesInfo[i];
      const isLandscape = naturalWidth > naturalHeight;
      const ratio = naturalWidth / naturalHeight;

      // Calculate target image dimensions fitting standard page proportion with light border
      const imageWidth = isLandscape ? 287 : 200;
      const imageHeight = imageWidth / ratio;

      const pageWidth = imageWidth + (margin * 2);
      const pageHeight = imageHeight + (margin * 2);
      const orientation = isLandscape ? 'l' : 'p';

      if (i === 0) {
        pdf = new jsPDF({
          orientation: orientation,
          unit: 'mm',
          format: [pageWidth, pageHeight]
        });
      } else {
        pdf!.addPage([pageWidth, pageHeight], orientation);
      }

      const format = img.toLowerCase().includes('png') ? 'PNG' : 'JPEG';
      pdf!.addImage(img, format, margin, margin, imageWidth, imageHeight);
    }

    if (!pdf) return;

    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    setGeneratedPdfUrl(url);
    setMode('pdf');
  };

  const handleShare = async () => {
    if (!generatedPdfUrl) return;
    const response = await fetch(generatedPdfUrl);
    const blob = await response.blob();
    const file = new File([blob], 'DOCUMENTO_AMBIENTAL.pdf', { type: 'application/pdf' });

    if (navigator.share) {
      try {
        await navigator.share({
          files: [file],
          title: 'Relatório Georreferenciado',
          text: 'PDF gerado via Aplicações Ambientais'
        });
      } catch (err) {
        console.error('Share failed', err);
      }
    } else {
      const link = document.createElement('a');
      link.href = generatedPdfUrl;
      link.download = 'DOCUMENTO_AMBIENTAL.pdf';
      link.click();
    }
  };

  const handleDownload = () => {
    if (!generatedPdfUrl) return;
    const link = document.createElement('a');
    link.href = generatedPdfUrl;
    link.download = `documento_ambiental_${Date.now()}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (mode === 'camera') {
    return (
      <div className="fixed inset-0 z-[100] bg-black overflow-hidden flex items-center justify-center">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          className="w-full h-full object-cover transition-transform duration-200" 
          style={{ transform: `scale(${zoom})` }}
        />
        
        {/* Floating Back Button */}
        <div className="absolute top-6 left-6 z-[110]">
          <button 
            onClick={() => setMode('selection')}
            className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white pointer-events-auto active:scale-95 transition-transform flex items-center gap-1.5 shadow border border-white/10 cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
            <span className="text-xs font-mono font-bold tracking-wider pr-1">VOLTAR</span>
          </button>
        </div>

        {/* Focus Ring Mock */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border-2 border-military-300 rounded-full opacity-30 animate-pulse pointer-events-none" />
        
        {/* Zoom Controls floating vertically on the right side */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 z-[110] flex flex-col items-center gap-2 bg-black/65 px-2 py-3 rounded-2xl backdrop-blur-md border border-white/10 shadow-2xl">
          <button 
            onClick={() => setZoom(z => Math.min(z + 0.2, 3))} 
            className="w-8 h-8 bg-white/10 hover:bg-white/20 active:scale-90 text-white rounded-full flex items-center justify-center font-black transition-all cursor-pointer border border-white/5"
            title="Aumentar Zoom (+)"
          >
            <Plus size={14} />
          </button>
          <span className="text-[10px] font-black font-mono text-military-300 tracking-tight min-w-[28px] text-center">
            {zoom.toFixed(1)}x
          </span>
          <button 
            onClick={() => setZoom(z => Math.max(z - 0.2, 1))} 
            className="w-8 h-8 bg-white/10 hover:bg-white/20 active:scale-90 text-white rounded-full flex items-center justify-center font-black transition-all cursor-pointer border border-white/5"
            title="Diminuir Zoom (-)"
          >
            <Minus size={14} />
          </button>
        </div>

        {/* Floating Capture Button (No bottom bar) */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[110]">
          <button 
            onClick={handleTakePhoto}
            className="w-18 h-18 bg-white hover:bg-neutral-100 rounded-full p-1 shadow-2xl active:scale-90 transition-transform relative cursor-pointer"
            title="Capturar Foto"
          >
            <div className="w-full h-full rounded-full border border-black/10 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-military-300 hover:bg-military-200 transition-colors" />
            </div>
          </button>
        </div>
        
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  if (mode === 'review') {
    return (
      <div className="fixed inset-0 z-[100] bg-military-950 flex flex-col p-6">
        <h2 className="text-xl font-bold mb-4 uppercase tracking-tight text-center">Conferir Foto</h2>
        
        <div className="flex-1 bg-neutral-900 rounded-3xl overflow-hidden shadow-2xl relative border border-military-700 flex items-center justify-center">
          <img src={currentPhoto!} className="max-w-full max-h-full object-contain" alt="Review" />
        </div>

        {/* Rotate controls row - High Contrast Style */}
        <div className="flex justify-center gap-4 mt-5 mb-2">
          <button
            onClick={() => rotateImage('left')}
            className="flex items-center gap-2 px-5 py-3.5 bg-military-300 hover:bg-military-200 text-military-950 rounded-xl font-black text-xs active:scale-95 transition-all cursor-pointer shadow-md border border-military-450"
            title="Girar para Esquerda"
          >
            <RotateCcw size={16} /> GIRAR ESQUERDA
          </button>
          <button
            onClick={() => rotateImage('right')}
            className="flex items-center gap-2 px-5 py-3.5 bg-military-300 hover:bg-military-200 text-military-950 rounded-xl font-black text-xs active:scale-95 transition-all cursor-pointer shadow-md border border-military-450"
            title="Girar para Direita"
          >
            <RotateCw size={16} /> GIRAR DIREITA
          </button>
        </div>

        <div className="py-4 grid grid-cols-2 gap-4">
          <button 
            onClick={() => { setCurrentPhoto(null); setMode('camera'); }}
            className="flex items-center justify-center gap-2 bg-red-500/10 border-2 border-red-500/50 text-red-500 p-4 rounded-2xl font-bold cursor-pointer hover:bg-red-500/20 active:scale-95 transition-transform"
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
      <div className="fixed inset-0 z-[100] bg-military-950 flex flex-col p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold uppercase tracking-tight">PDF GERADO</h2>
          <button onClick={() => setMode('selection')} className="p-2 bg-military-800 rounded-lg cursor-pointer hover:bg-military-750">
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 bg-white rounded-2xl shadow-2xl overflow-hidden relative border border-military-800">
          <iframe src={generatedPdfUrl!} className="w-full h-full border-none" title="PDF Preview" />
        </div>

        <div className="py-6 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={handleShare}
              className="bg-emerald-600 hover:bg-emerald-550 text-white p-4 rounded-xl font-black flex items-center justify-center gap-2 shadow-lg text-xs uppercase cursor-pointer active:scale-95 transition-all"
              title="Compartilhar pelo WhatsApp, Telegram, etc."
            >
              <Share2 size={18} /> Compartilhar
            </button>
            
            <button 
              onClick={handleDownload}
              className="bg-military-300 hover:bg-military-200 text-military-950 p-4 rounded-xl font-black flex items-center justify-center gap-2 shadow-lg text-xs uppercase cursor-pointer active:scale-95 transition-all"
              title="Baixar arquivo PDF no dispositivo"
            >
              <Download size={18} /> Baixar PDF
            </button>
          </div>
          
          <button 
            onClick={() => { setImages([]); setMode('selection'); }}
            className="text-military-500 hover:text-military-400 text-xs font-bold flex items-center justify-center gap-2 mt-2 cursor-pointer uppercase tracking-wider font-mono transition-colors"
          >
            <RotateCcw size={14} /> Limpar e Novo Documento
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

      <div className="grid grid-cols-2 gap-4">
        <div 
          onClick={() => setMode('camera')}
          className="cursor-pointer text-center px-4 py-6 bg-military-800/30 border-2 border-dashed border-military-700 rounded-3xl group hover:border-military-500 transition-all active:scale-95 flex flex-col justify-center items-center"
        >
          <div className="w-14 h-14 bg-military-800 rounded-full flex items-center justify-center mb-3 border border-military-700 shadow-xl group-hover:scale-110 transition-transform">
            <Camera className="w-5 h-5 text-military-400 group-hover:text-military-300" />
          </div>
          <h3 className="text-xs font-black mb-1 uppercase tracking-tight">CÂMERA PDF</h3>
          <p className="text-[9px] text-military-500 max-w-[150px] mx-auto uppercase tracking-widest font-mono">
            Escanear
          </p>
        </div>

        <div 
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer text-center px-4 py-6 bg-military-800/30 border-2 border-dashed border-military-700 rounded-3xl group hover:border-military-500 transition-all active:scale-95 flex flex-col justify-center items-center relative"
        >
          <input 
            type="file"
            ref={fileInputRef}
            onChange={handleGalleryImport}
            accept="image/*"
            multiple
            className="hidden"
          />
          <div className="w-14 h-14 bg-military-800 rounded-full flex items-center justify-center mb-3 border border-military-700 shadow-xl group-hover:scale-110 transition-transform">
            <Upload className="w-5 h-5 text-military-400 group-hover:text-military-300" />
          </div>
          <h3 className="text-xs font-black mb-1 uppercase tracking-tight">IMPORTAR GALERIA</h3>
          <p className="text-[9px] text-military-500 max-w-[150px] mx-auto uppercase tracking-widest font-mono">
            smartphone
          </p>
        </div>
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
              <div 
                key={idx} 
                onClick={() => { setSelectedPageImageIndex(idx); setSelectedPageImageUrl(img); }}
                className="relative group aspect-[3/4] rounded-xl overflow-hidden border-2 border-military-700 shadow-lg cursor-pointer hover:border-military-500 transition-all active:scale-[0.98]"
              >
                <img src={img} className="w-full h-full object-cover" alt="Preview" />
                
                {/* Floating controls inside thumbnail */}
                <div className="absolute top-2 right-2 flex gap-1 z-10">
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      handleRotatePageImage(idx, 'left'); 
                    }}
                    className="p-1.5 bg-military-900/90 border border-military-700 text-white rounded-lg shadow-md active:scale-90 transition-transform cursor-pointer hover:bg-military-850"
                    title="Girar Esquerda"
                  >
                    <RotateCcw size={12} />
                  </button>
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      handleRotatePageImage(idx, 'right'); 
                    }}
                    className="p-1.5 bg-military-900/90 border border-military-700 text-white rounded-lg shadow-md active:scale-90 transition-transform cursor-pointer hover:bg-military-850"
                    title="Girar Direita"
                  >
                    <RotateCw size={12} />
                  </button>
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setImages(images.filter((_, i) => i !== idx)); 
                    }}
                    className="p-1.5 bg-red-600 text-white rounded-lg shadow-md active:scale-90 transition-transform cursor-pointer hover:bg-red-500"
                    title="Excluir Página"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/60 backdrop-blur-sm flex justify-between items-center">
                  <p className="text-[10px] font-mono text-white/90 font-bold">PÁG {idx + 1}</p>
                  <span className="text-[8px] font-bold text-military-300 font-mono uppercase tracking-widest">Ver foto</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {images.length > 0 && (
          <div className="mt-8 space-y-3">
            <button 
              onClick={generatePDF}
              className="w-full bg-military-600 hover:bg-military-500 text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] cursor-pointer"
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

      {/* Detailed page image preview modal */}
      {selectedPageImageIndex !== null && selectedPageImageUrl && (
        <div className="fixed inset-0 z-[120] bg-black/95 flex flex-col p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono font-bold tracking-widest text-military-450 uppercase">
              Visualização - Página {selectedPageImageIndex + 1}
            </span>
            <button 
              onClick={() => { setSelectedPageImageIndex(null); setSelectedPageImageUrl(null); }}
              className="p-2 bg-military-300 hover:bg-military-200 text-military-950 rounded-lg cursor-pointer transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 bg-neutral-900 rounded-3xl overflow-hidden shadow-2xl border border-military-800 flex items-center justify-center p-2">
            <img src={selectedPageImageUrl} className="max-w-full max-h-[65vh] object-contain rounded-xl" alt="Page Detail" />
          </div>

          {/* Controls next to delete button - Beautiful High Contrast style */}
          <div className="mt-6 grid grid-cols-4 gap-2.5 w-full max-w-md mx-auto">
            <button
              onClick={() => handleRotatePageImage(selectedPageImageIndex, 'left')}
              className="py-3 bg-military-300 hover:bg-military-200 text-military-950 font-black rounded-xl flex flex-col items-center justify-center gap-1 border border-military-450 active:scale-95 transition-all text-[10px] cursor-pointer shadow-md"
              title="Girar para Esquerda"
            >
              <RotateCcw size={16} />
              <span>GIRAR ESQ</span>
            </button>
            <button
              onClick={() => handleRotatePageImage(selectedPageImageIndex, 'right')}
              className="py-3 bg-military-300 hover:bg-military-200 text-military-950 font-black rounded-xl flex flex-col items-center justify-center gap-1 border border-military-450 active:scale-95 transition-all text-[10px] cursor-pointer shadow-md"
              title="Girar para Direita"
            >
              <RotateCw size={16} />
              <span>GIRAR DIR</span>
            </button>
            <button
              onClick={() => {
                setImages(prev => prev.filter((_, i) => i !== selectedPageImageIndex));
                setSelectedPageImageIndex(null);
                setSelectedPageImageUrl(null);
              }}
              className="py-3 bg-red-950/40 hover:bg-red-950/60 border border-red-500/30 text-red-400 font-bold rounded-xl flex flex-col items-center justify-center gap-1 active:scale-95 transition-all text-[10px] cursor-pointer"
              title="Excluir esta página"
            >
              <Trash2 size={16} />
              <span>EXCLUIR</span>
            </button>
            <button
              onClick={() => { setSelectedPageImageIndex(null); setSelectedPageImageUrl(null); }}
              className="py-3 bg-military-300 hover:bg-military-200 text-military-950 font-bold rounded-xl flex flex-col items-center justify-center gap-1 active:scale-95 transition-all text-[10px] cursor-pointer"
              title="Confirmar e voltar"
            >
              <Check size={16} />
              <span>OK</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
