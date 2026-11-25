import { useState, useRef, useEffect, useCallback, ChangeEvent, PointerEvent } from 'react';
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
  ChevronLeft,
  Crop
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

// Optimized image downscaling helper to prevent Out-Of-Memory (OOM) crashes on low-end smartphones
const resizeImageFile = (file: File, maxDim = 1600, quality = 0.82): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (!src) return reject(new Error('Erro ao carregar arquivo'));
      const img = new Image();
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(src);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export default function FotoPDF({ onBack }: FotoPDFProps) {
  const [images, setImages] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('selection');
  const [currentPhoto, setCurrentPhoto] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
  const [photosPerPage, setPhotosPerPage] = useState<1 | 2>(1);

  // Interactive crop editor state
  const [cropTarget, setCropTarget] = useState<
    { type: 'page'; index: number; src: string } | { type: 'review'; src: string } | null
  >(null);
  const [cropBox, setCropBox] = useState<{ x: number; y: number; w: number; h: number }>({
    x: 0.05,
    y: 0.05,
    w: 0.9,
    h: 0.9,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
  const cropDragRef = useRef<{
    mode: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';
    startX: number;
    startY: number;
    startBox: { x: number; y: number; w: number; h: number };
    rectW: number;
    rectH: number;
  } | null>(null);

  const handleGalleryImport = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files) as File[];
    
    // Convert and downscale all selected images to safe dimensions for low-spec mobile RAM
    const readPromises = fileList.map((file: File) => resizeImageFile(file, 1600, 0.82));

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

  const openCropForPage = (idx: number) => {
    const src = images[idx];
    if (!src) return;
    setCropBox({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
    setCropTarget({ type: 'page', index: idx, src });
  };

  const openCropForReview = () => {
    if (!currentPhoto) return;
    setCropBox({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
    setCropTarget({ type: 'review', src: currentPhoto });
  };

  const rotateCropTarget = (direction: 'left' | 'right') => {
    if (!cropTarget) return;
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
      const rotatedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
      setCropBox({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
      setCropTarget(prev => (prev ? { ...prev, src: rotatedDataUrl } : null));
    };
    imgObj.src = cropTarget.src;
  };

  const handleCropPointerDown = (
    e: PointerEvent<HTMLDivElement>,
    mode: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const imgEl = cropImgRef.current;
    if (!imgEl) return;
    const rect = imgEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if pointer capture is unsupported
    }

    cropDragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startBox: { ...cropBox },
      rectW: rect.width,
      rectH: rect.height,
    };
  };

  const handleCropPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current;
    if (!drag) return;
    e.preventDefault();

    const dx = (e.clientX - drag.startX) / drag.rectW;
    const dy = (e.clientY - drag.startY) / drag.rectH;
    const MIN_SIZE = 0.08;
    const sb = drag.startBox;

    let nx = sb.x;
    let ny = sb.y;
    let nw = sb.w;
    let nh = sb.h;

    if (drag.mode === 'move') {
      nx = Math.max(0, Math.min(1 - sb.w, sb.x + dx));
      ny = Math.max(0, Math.min(1 - sb.h, sb.y + dy));
    } else {
      if (drag.mode.includes('w')) {
        const right = sb.x + sb.w;
        nx = Math.max(0, Math.min(right - MIN_SIZE, sb.x + dx));
        nw = right - nx;
      }
      if (drag.mode.includes('e')) {
        nw = Math.max(MIN_SIZE, Math.min(1 - sb.x, sb.w + dx));
      }
      if (drag.mode.includes('n')) {
        const bottom = sb.y + sb.h;
        ny = Math.max(0, Math.min(bottom - MIN_SIZE, sb.y + dy));
        nh = bottom - ny;
      }
      if (drag.mode.includes('s')) {
        nh = Math.max(MIN_SIZE, Math.min(1 - sb.y, sb.h + dy));
      }
    }

    setCropBox({ x: nx, y: ny, w: nw, h: nh });
  };

  const handleCropPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (cropDragRef.current) {
      cropDragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const handleApplyCrop = async () => {
    if (!cropTarget) return;
    try {
      const imgObj = await loadImage(cropTarget.src);
      const natW = imgObj.naturalWidth || imgObj.width;
      const natH = imgObj.naturalHeight || imgObj.height;

      const sx = Math.max(0, Math.round(cropBox.x * natW));
      const sy = Math.max(0, Math.round(cropBox.y * natH));
      const sw = Math.max(1, Math.min(natW - sx, Math.round(cropBox.w * natW)));
      const sh = Math.max(1, Math.min(natH - sy, Math.round(cropBox.h * natH)));

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(imgObj, sx, sy, sw, sh, 0, 0, sw, sh);
      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.88);

      if (cropTarget.type === 'page') {
        const targetIdx = cropTarget.index;
        setImages(prev => {
          const updated = [...prev];
          updated[targetIdx] = croppedDataUrl;
          return updated;
        });
        if (selectedPageImageIndex === targetIdx) {
          setSelectedPageImageUrl(croppedDataUrl);
        }
      } else {
        setCurrentPhoto(croppedDataUrl);
      }

      setCropTarget(null);
    } catch (err) {
      console.error('Erro ao cortar imagem:', err);
      setCropTarget(null);
    }
  };

  const generatePDF = async () => {
    if (images.length === 0) return;

    // Load all images first to extract precise natural dimensions
    const loadedImagesInfo = await Promise.all(
      images.map(async (img) => {
        try {
          const loadedImg = await loadImage(img);
          const naturalWidth = loadedImg.naturalWidth || loadedImg.width || 1920;
          const naturalHeight = loadedImg.naturalHeight || loadedImg.height || 1080;
          return { img, naturalWidth, naturalHeight };
        } catch (err) {
          console.error('Failed to load image for PDF', err);
          return { img, naturalWidth: 1920, naturalHeight: 1080 };
        }
      })
    );

    let pdf: jsPDF | null = null;

    if (photosPerPage === 2) {
      // A4 Portrait (210mm x 297mm) with 2 balanced image slots per sheet
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 8;
      const gap = 6;
      const slotWidth = pageWidth - margin * 2;
      const slotHeight = (pageHeight - margin * 2 - gap) / 2;

      for (let i = 0; i < loadedImagesInfo.length; i += 2) {
        if (i === 0) {
          pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: [pageWidth, pageHeight]
          });
        } else {
          pdf!.addPage([pageWidth, pageHeight], 'portrait');
        }

        const pair = [loadedImagesInfo[i], loadedImagesInfo[i + 1]].filter(Boolean);
        pair.forEach((item, slotIdx) => {
          const slotTop = margin + slotIdx * (slotHeight + gap);
          const scale = Math.min(slotWidth / item.naturalWidth, slotHeight / item.naturalHeight);
          const drawW = Math.round(item.naturalWidth * scale * 10) / 10;
          const drawH = Math.round(item.naturalHeight * scale * 10) / 10;
          const drawX = Math.round((margin + (slotWidth - drawW) / 2) * 10) / 10;
          const drawY = Math.round((slotTop + (slotHeight - drawH) / 2) * 10) / 10;

          const format = item.img.toLowerCase().includes('png') ? 'PNG' : 'JPEG';
          pdf!.addImage(item.img, format, drawX, drawY, drawW, drawH, undefined, 'FAST');
        });
      }
    } else {
      const margin = 4; // Leve borda branca uniforme de 4mm

      for (let i = 0; i < loadedImagesInfo.length; i++) {
        const { img, naturalWidth, naturalHeight } = loadedImagesInfo[i];
        const isLandscape = naturalWidth >= naturalHeight;
        const orientation = isLandscape ? 'landscape' : 'portrait';

        let pageWidth: number;
        let pageHeight: number;
        let imageWidth: number;
        let imageHeight: number;

        if (isLandscape) {
          pageWidth = 297;
          imageWidth = pageWidth - (margin * 2);
          imageHeight = imageWidth * (naturalHeight / naturalWidth);
          pageHeight = imageHeight + (margin * 2);
        } else {
          pageWidth = 210;
          imageWidth = pageWidth - (margin * 2);
          imageHeight = imageWidth * (naturalHeight / naturalWidth);
          pageHeight = imageHeight + (margin * 2);
        }

        pageWidth = Math.round(pageWidth * 10) / 10;
        pageHeight = Math.round(pageHeight * 10) / 10;
        imageWidth = Math.round(imageWidth * 10) / 10;
        imageHeight = Math.round(imageHeight * 10) / 10;

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
        pdf!.addImage(img, format, margin, margin, imageWidth, imageHeight, undefined, 'FAST');
      }
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

        {/* Rotate & Crop controls row */}
        <div className="grid grid-cols-3 gap-2.5 mt-5 mb-2 max-w-md mx-auto w-full">
          <button
            onClick={() => rotateImage('left')}
            className="flex items-center justify-center gap-1.5 px-3 py-3.5 bg-military-800 hover:bg-military-750 text-military-100 rounded-xl font-black text-[11px] active:scale-95 transition-all cursor-pointer shadow-md border border-military-700"
            title="Girar para Esquerda"
          >
            <RotateCcw size={15} /> GIRAR ESQ
          </button>
          <button
            onClick={() => rotateImage('right')}
            className="flex items-center justify-center gap-1.5 px-3 py-3.5 bg-military-800 hover:bg-military-750 text-military-100 rounded-xl font-black text-[11px] active:scale-95 transition-all cursor-pointer shadow-md border border-military-700"
            title="Girar para Direita"
          >
            <RotateCw size={15} /> GIRAR DIR
          </button>
          <button
            onClick={openCropForReview}
            className="flex items-center justify-center gap-1.5 px-3 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-[11px] active:scale-95 transition-all cursor-pointer shadow-md border border-blue-500"
            title="Cortar Imagem"
          >
            <Crop size={15} /> CORTAR
          </button>
        </div>

        <div className="py-4 grid grid-cols-2 gap-4">
          <button 
            onClick={() => { setCurrentPhoto(null); setMode('camera'); }}
            className="flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-2xl font-bold cursor-pointer hover:bg-red-500/20 active:scale-95 transition-transform"
          >
            <Trash2 size={20} /> EXCLUIR
          </button>
          <button 
            onClick={handleSavePhoto}
            className="flex items-center justify-center gap-2 bg-military-600 hover:bg-military-500 text-white p-4 rounded-2xl font-black shadow-xl"
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
          <h2 className="text-xl font-bold uppercase tracking-tight text-military-100">PDF GERADO</h2>
          <button onClick={() => setMode('selection')} className="p-2 bg-military-800 rounded-lg cursor-pointer hover:bg-military-750 text-military-300">
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
              className="bg-military-600 hover:bg-military-500 text-white p-4 rounded-xl font-black flex items-center justify-center gap-2 shadow-lg text-xs uppercase cursor-pointer active:scale-95 transition-all"
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
          <h3 className="text-xs font-black uppercase tracking-tight">CÂMERA PDF</h3>
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
          <h3 className="text-xs font-black uppercase tracking-tight">IMPORTAR GALERIA</h3>
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
                      openCropForPage(idx);
                    }}
                    className="p-1.5 bg-blue-600/95 border border-blue-500 text-white rounded-lg shadow-md active:scale-90 transition-transform cursor-pointer hover:bg-blue-700"
                    title="Cortar Imagem"
                  >
                    <Crop size={12} />
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
                  <span className="text-[8px] font-bold text-military-300 font-mono uppercase tracking-widest">Ajustar / Ver</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {images.length > 0 && (
          <div className="mt-8 space-y-3">
            {/* Photos per PDF sheet selector */}
            <div className="bg-military-900/75 border border-military-700 rounded-2xl p-3 space-y-2">
              <span className="block text-[10px] font-mono font-black uppercase tracking-wider text-military-300 text-center">
                Imagens por folha no PDF
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPhotosPerPage(1)}
                  className={`py-2.5 px-3 rounded-xl font-mono text-xs font-black uppercase border transition-all cursor-pointer ${
                    photosPerPage === 1
                      ? 'bg-blue-600 border-blue-500 text-white shadow-md'
                      : 'bg-military-850 border-military-700 text-military-300 hover:bg-military-800'
                  }`}
                >
                  1 por folha
                </button>
                <button
                  type="button"
                  onClick={() => setPhotosPerPage(2)}
                  className={`py-2.5 px-3 rounded-xl font-mono text-xs font-black uppercase border transition-all cursor-pointer ${
                    photosPerPage === 2
                      ? 'bg-blue-600 border-blue-500 text-white shadow-md'
                      : 'bg-military-850 border-military-700 text-military-300 hover:bg-military-800'
                  }`}
                >
                  2 por folha
                </button>
              </div>
            </div>

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
              className="p-2 bg-military-800 hover:bg-military-750 text-military-100 rounded-lg cursor-pointer transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 bg-neutral-900 rounded-3xl overflow-hidden shadow-2xl border border-military-800 flex items-center justify-center p-2">
            <img src={selectedPageImageUrl} className="max-w-full max-h-[65vh] object-contain rounded-xl" alt="Page Detail" />
          </div>

          {/* Controls: Girar Esq, Girar Dir, Cortar, Excluir, Concluir */}
          <div className="mt-5 space-y-2.5 w-full max-w-md mx-auto">
            <div className="grid grid-cols-3 gap-2.5">
              <button
                onClick={() => handleRotatePageImage(selectedPageImageIndex, 'left')}
                className="py-3 bg-military-800 hover:bg-military-750 text-military-100 font-black rounded-xl flex flex-col items-center justify-center gap-1 border border-military-700 active:scale-95 transition-all text-[10px] cursor-pointer shadow-md"
                title="Girar para Esquerda"
              >
                <RotateCcw size={16} />
                <span>GIRAR ESQ</span>
              </button>
              <button
                onClick={() => handleRotatePageImage(selectedPageImageIndex, 'right')}
                className="py-3 bg-military-800 hover:bg-military-750 text-military-100 font-black rounded-xl flex flex-col items-center justify-center gap-1 border border-military-700 active:scale-95 transition-all text-[10px] cursor-pointer shadow-md"
                title="Girar para Direita"
              >
                <RotateCw size={16} />
                <span>GIRAR DIR</span>
              </button>
              <button
                onClick={() => openCropForPage(selectedPageImageIndex)}
                className="py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl flex flex-col items-center justify-center gap-1 border border-blue-500 active:scale-95 transition-all text-[10px] cursor-pointer shadow-md"
                title="Cortar Imagem"
              >
                <Crop size={16} />
                <span>CORTAR</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => {
                  setImages(prev => prev.filter((_, i) => i !== selectedPageImageIndex));
                  setSelectedPageImageIndex(null);
                  setSelectedPageImageUrl(null);
                }}
                className="py-3 bg-red-950/40 hover:bg-red-950/60 border border-red-500/30 text-red-400 font-bold rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all text-xs cursor-pointer"
                title="Excluir esta página"
              >
                <Trash2 size={16} />
                <span>EXCLUIR</span>
              </button>
              <button
                onClick={() => { setSelectedPageImageIndex(null); setSelectedPageImageUrl(null); }}
                className="py-3 bg-military-600 hover:bg-military-500 text-white font-black rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all text-xs cursor-pointer shadow-md"
                title="Confirmar e voltar"
              >
                <Check size={16} />
                <span>CONCLUIR</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Image Crop Modal */}
      {cropTarget && (
        <div className="fixed inset-0 z-[140] bg-black/95 flex flex-col p-4 sm:p-6 select-none">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Crop className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-mono font-black tracking-wider text-white uppercase">
                Ajustar Corte da Imagem
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCropTarget(null)}
              className="p-2 bg-military-800 hover:bg-military-750 text-military-100 rounded-lg cursor-pointer transition-colors"
              title="Fechar corte"
            >
              <X size={20} />
            </button>
          </div>

          <p className="text-[11px] font-mono text-military-300 text-center mb-3">
            Arraste as bordas ou cantos para selecionar a área desejada
          </p>

          {/* Image Stage */}
          <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
            <div className="relative inline-block touch-none select-none shadow-2xl">
              <img
                ref={cropImgRef}
                src={cropTarget.src}
                alt="Cortar foto"
                className="block max-w-full max-h-[58vh] w-auto h-auto pointer-events-none rounded-lg"
                draggable={false}
              />

              {/* Darkened areas outside crop rectangle */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.62) 100%)`,
                  clipPath: `polygon(
                    0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
                    ${cropBox.x * 100}% ${cropBox.y * 100}%,
                    ${cropBox.x * 100}% ${(cropBox.y + cropBox.h) * 100}%,
                    ${(cropBox.x + cropBox.w) * 100}% ${(cropBox.y + cropBox.h) * 100}%,
                    ${(cropBox.x + cropBox.w) * 100}% ${cropBox.y * 100}%,
                    ${cropBox.x * 100}% ${cropBox.y * 100}%
                  )`,
                }}
              />

              {/* Active draggable & resizable crop frame */}
              <div
                onPointerDown={e => handleCropPointerDown(e, 'move')}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
                onPointerCancel={handleCropPointerUp}
                style={{
                  left: `${cropBox.x * 100}%`,
                  top: `${cropBox.y * 100}%`,
                  width: `${cropBox.w * 100}%`,
                  height: `${cropBox.h * 100}%`,
                }}
                className="absolute border-2 border-blue-400 cursor-move touch-none"
              >
                {/* Rule-of-thirds guide lines */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/25" />
                  <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/25" />
                  <div className="absolute top-1/3 left-0 right-0 h-px bg-white/25" />
                  <div className="absolute top-2/3 left-0 right-0 h-px bg-white/25" />
                </div>

                {/* Corner Handles */}
                <div
                  onPointerDown={e => handleCropPointerDown(e, 'nw')}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerUp}
                  onPointerCancel={handleCropPointerUp}
                  className="absolute -top-3 -left-3 w-7 h-7 flex items-center justify-center cursor-nwse-resize touch-none"
                >
                  <span className="w-4 h-4 border-t-[3px] border-l-[3px] border-white rounded-tl-sm block shadow" />
                </div>
                <div
                  onPointerDown={e => handleCropPointerDown(e, 'ne')}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerUp}
                  onPointerCancel={handleCropPointerUp}
                  className="absolute -top-3 -right-3 w-7 h-7 flex items-center justify-center cursor-nesw-resize touch-none"
                >
                  <span className="w-4 h-4 border-t-[3px] border-r-[3px] border-white rounded-tr-sm block shadow" />
                </div>
                <div
                  onPointerDown={e => handleCropPointerDown(e, 'sw')}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerUp}
                  onPointerCancel={handleCropPointerUp}
                  className="absolute -bottom-3 -left-3 w-7 h-7 flex items-center justify-center cursor-nesw-resize touch-none"
                >
                  <span className="w-4 h-4 border-b-[3px] border-l-[3px] border-white rounded-bl-sm block shadow" />
                </div>
                <div
                  onPointerDown={e => handleCropPointerDown(e, 'se')}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerUp}
                  onPointerCancel={handleCropPointerUp}
                  className="absolute -bottom-3 -right-3 w-7 h-7 flex items-center justify-center cursor-nwse-resize touch-none"
                >
                  <span className="w-4 h-4 border-b-[3px] border-r-[3px] border-white rounded-br-sm block shadow" />
                </div>

                {/* Edge Midpoint Handles */}
                <div
                  onPointerDown={e => handleCropPointerDown(e, 'n')}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerUp}
                  onPointerCancel={handleCropPointerUp}
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-10 h-5 flex items-center justify-center cursor-ns-resize touch-none"
                >
                  <span className="w-6 h-1 bg-white rounded-full block shadow" />
                </div>
                <div
                  onPointerDown={e => handleCropPointerDown(e, 's')}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerUp}
                  onPointerCancel={handleCropPointerUp}
                  className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-10 h-5 flex items-center justify-center cursor-ns-resize touch-none"
                >
                  <span className="w-6 h-1 bg-white rounded-full block shadow" />
                </div>
                <div
                  onPointerDown={e => handleCropPointerDown(e, 'w')}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerUp}
                  onPointerCancel={handleCropPointerUp}
                  className="absolute top-1/2 -left-2.5 -translate-y-1/2 w-5 h-10 flex items-center justify-center cursor-ew-resize touch-none"
                >
                  <span className="w-1 h-6 bg-white rounded-full block shadow" />
                </div>
                <div
                  onPointerDown={e => handleCropPointerDown(e, 'e')}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerUp}
                  onPointerCancel={handleCropPointerUp}
                  className="absolute top-1/2 -right-2.5 -translate-y-1/2 w-5 h-10 flex items-center justify-center cursor-ew-resize touch-none"
                >
                  <span className="w-1 h-6 bg-white rounded-full block shadow" />
                </div>
              </div>
            </div>
          </div>

          {/* Crop Actions */}
          <div className="mt-4 space-y-2.5 w-full max-w-md mx-auto">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => rotateCropTarget('left')}
                className="py-2.5 bg-military-800 hover:bg-military-750 text-military-100 rounded-xl font-black text-[10px] border border-military-700 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={14} /> GIRAR ESQ
              </button>
              <button
                type="button"
                onClick={() => rotateCropTarget('right')}
                className="py-2.5 bg-military-800 hover:bg-military-750 text-military-100 rounded-xl font-black text-[10px] border border-military-700 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCw size={14} /> GIRAR DIR
              </button>
              <button
                type="button"
                onClick={() => setCropBox({ x: 0, y: 0, w: 1, h: 1 })}
                className="py-2.5 bg-military-800 hover:bg-military-750 text-military-100 rounded-xl font-black text-[10px] border border-military-700 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Maximize size={14} /> INTEIRA
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setCropTarget(null)}
                className="py-3 bg-military-800 hover:bg-military-750 border border-military-700 text-military-200 font-bold rounded-xl text-xs uppercase cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplyCrop}
                className="py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-xs uppercase flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
              >
                <Check size={16} /> Aplicar Corte
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
