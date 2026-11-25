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
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Crop,
  Pencil
} from 'lucide-react';
import { jsPDF } from 'jspdf';

interface FotoPDFProps {
  onBack: () => void;
}

type Mode = 'selection' | 'camera' | 'review' | 'pdf';

interface PdfSheet {
  id: string;
  slotCount: 1 | 2;
  photos: string[];
}

const makeSheetId = () => `sheet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const getDefaultPdfName = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `Documento_BPA_${y}-${m}-${day}`;
};

const sanitizePdfFileName = (raw: string): string => {
  const cleaned = raw
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim();
  return `${cleaned || 'Documento_BPA'}.pdf`;
};

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
  const [sheets, setSheets] = useState<PdfSheet[]>([]);
  const [mode, setMode] = useState<Mode>('selection');
  const [currentPhoto, setCurrentPhoto] = useState<string | null>(null);
  const [pendingTargetSheetId, setPendingTargetSheetId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>(getDefaultPdfName);

  // Detail modal state
  const [selectedPhotoLoc, setSelectedPhotoLoc] = useState<{ sheetId: string; photoIdx: number } | null>(null);

  // Interactive crop editor state
  const [cropTarget, setCropTarget] = useState<
    { type: 'sheet'; sheetId: string; photoIdx: number; src: string } | { type: 'review'; src: string } | null
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
  const slotFileInputRef = useRef<HTMLInputElement>(null);
  const slotTargetSheetRef = useRef<string | null>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
  const cropDragRef = useRef<{
    mode: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e';
    startX: number;
    startY: number;
    startBox: { x: number; y: number; w: number; h: number };
    rectW: number;
    rectH: number;
  } | null>(null);

  const appendPhotosToSheets = useCallback((newPhotos: string[], targetSheetId: string | null) => {
    if (newPhotos.length === 0) return;
    setSheets(prev => {
      const updated = prev.map(s => ({ ...s, photos: [...s.photos] }));
      let remaining = [...newPhotos];

      if (targetSheetId) {
        const target = updated.find(s => s.id === targetSheetId);
        if (target && target.photos.length < 2) {
          target.slotCount = 2;
          target.photos.push(remaining[0]);
          remaining = remaining.slice(1);
        }
      }

      for (const p of remaining) {
        updated.push({
          id: makeSheetId(),
          slotCount: 1,
          photos: [p],
        });
      }
      return updated;
    });
  }, []);

  const handleGalleryImport = (e: ChangeEvent<HTMLInputElement>, targetSheetId: string | null = null) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files) as File[];
    const readPromises = fileList.map((file: File) => resizeImageFile(file, 1600, 0.82));

    Promise.all(readPromises)
      .then(base64Images => {
        appendPhotosToSheets(base64Images, targetSheetId);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (slotFileInputRef.current) slotFileInputRef.current.value = '';
        slotTargetSheetRef.current = null;
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
            videoRef.current.play().catch(err => console.error('Video play error:', err));
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
      appendPhotosToSheets([currentPhoto], pendingTargetSheetId);
      setCurrentPhoto(null);
      setPendingTargetSheetId(null);
      setMode('selection');
    }
  };

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

  const handleRotateSheetPhoto = (sheetId: string, photoIdx: number, direction: 'left' | 'right') => {
    const targetSheet = sheets.find(s => s.id === sheetId);
    const targetImg = targetSheet?.photos[photoIdx];
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

      setSheets(prev =>
        prev.map(s => {
          if (s.id !== sheetId) return s;
          const nextPhotos = [...s.photos];
          nextPhotos[photoIdx] = rotatedDataUrl;
          return { ...s, photos: nextPhotos };
        })
      );
    };
    imgObj.src = targetImg;
  };

  const handleDeleteSheetPhoto = (sheetId: string, photoIdx: number) => {
    setSheets(prev => {
      const next: PdfSheet[] = [];
      for (const s of prev) {
        if (s.id !== sheetId) {
          next.push(s);
          continue;
        }
        const remainingPhotos = s.photos.filter((_, idx) => idx !== photoIdx);
        if (remainingPhotos.length === 0) {
          // If sheet becomes empty, remove sheet
          continue;
        }
        next.push({
          ...s,
          photos: remainingPhotos,
        });
      }
      return next;
    });

    if (selectedPhotoLoc?.sheetId === sheetId && selectedPhotoLoc?.photoIdx === photoIdx) {
      setSelectedPhotoLoc(null);
    }
  };

  const handleSetSheetSlotCount = (sheetId: string, targetCount: 1 | 2) => {
    setSheets(prev => {
      const idx = prev.findIndex(s => s.id === sheetId);
      if (idx === -1) return prev;
      const current = prev[idx];
      if (current.slotCount === targetCount && (targetCount === 1 || current.photos.length === 2)) {
        return prev;
      }

      const next = prev.map(s => ({ ...s, photos: [...s.photos] }));

      if (targetCount === 2) {
        // Pull photo from immediate next 1-photo sheet if available so pairing existing photos takes 1 tap
        const nextSheet = next[idx + 1];
        if (current.photos.length === 1 && nextSheet && nextSheet.photos.length === 1) {
          next[idx] = {
            ...next[idx],
            slotCount: 2,
            photos: [current.photos[0], nextSheet.photos[0]],
          };
          next.splice(idx + 1, 1);
        } else {
          next[idx] = {
            ...next[idx],
            slotCount: 2,
          };
        }
        return next;
      }

      // Switching back to 1 photo per page: split 2nd photo into its own sheet immediately after
      if (current.photos.length === 2) {
        const secondPhoto = current.photos[1];
        next[idx] = {
          ...next[idx],
          slotCount: 1,
          photos: [current.photos[0]],
        };
        next.splice(idx + 1, 0, {
          id: makeSheetId(),
          slotCount: 1,
          photos: [secondPhoto],
        });
      } else {
        next[idx] = {
          ...next[idx],
          slotCount: 1,
        };
      }
      return next;
    });
  };

  const handleMoveSheet = (idx: number, direction: 'up' | 'down') => {
    setSheets(prev => {
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const updated = [...prev];
      const temp = updated[idx];
      updated[idx] = updated[targetIdx];
      updated[targetIdx] = temp;
      return updated;
    });
  };

  const openCropForSheetPhoto = (sheetId: string, photoIdx: number) => {
    const src = sheets.find(s => s.id === sheetId)?.photos[photoIdx];
    if (!src) return;
    setCropBox({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
    setCropTarget({ type: 'sheet', sheetId, photoIdx, src });
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

      if (cropTarget.type === 'sheet') {
        const { sheetId, photoIdx } = cropTarget;
        setSheets(prev =>
          prev.map(s => {
            if (s.id !== sheetId) return s;
            const nextPhotos = [...s.photos];
            nextPhotos[photoIdx] = croppedDataUrl;
            return { ...s, photos: nextPhotos };
          })
        );
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
    const validSheets = sheets.filter(s => s.photos.length > 0);
    if (validSheets.length === 0) return;

    const loadedSheets = await Promise.all(
      validSheets.map(async sheet => {
        const loadedPhotos = await Promise.all(
          sheet.photos.map(async img => {
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
        return { slotCount: sheet.slotCount, loadedPhotos };
      })
    );

    let pdf: jsPDF | null = null;

    loadedSheets.forEach((sheet, pageIdx) => {
      if (sheet.loadedPhotos.length === 2) {
        // A4 Portrait (210mm x 297mm) with 2 proportional photos stacked neatly on the same sheet
        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 8;
        const gap = 6;
        const slotWidth = pageWidth - margin * 2;
        const slotHeight = (pageHeight - margin * 2 - gap) / 2;

        if (pageIdx === 0) {
          pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: [pageWidth, pageHeight]
          });
        } else {
          pdf!.addPage([pageWidth, pageHeight], 'portrait');
        }

        sheet.loadedPhotos.forEach((item, slotIdx) => {
          const slotTop = margin + slotIdx * (slotHeight + gap);
          const scale = Math.min(slotWidth / item.naturalWidth, slotHeight / item.naturalHeight);
          const drawW = Math.round(item.naturalWidth * scale * 10) / 10;
          const drawH = Math.round(item.naturalHeight * scale * 10) / 10;
          const drawX = Math.round((margin + (slotWidth - drawW) / 2) * 10) / 10;
          const drawY = Math.round((slotTop + (slotHeight - drawH) / 2) * 10) / 10;

          const format = item.img.toLowerCase().includes('png') ? 'PNG' : 'JPEG';
          pdf!.addImage(item.img, format, drawX, drawY, drawW, drawH, undefined, 'FAST');
        });
      } else {
        // Full-page single image preserving exact landscape/portrait orientation
        const item = sheet.loadedPhotos[0];
        const margin = 4;
        const isLandscape = item.naturalWidth >= item.naturalHeight;
        const orientation = isLandscape ? 'landscape' : 'portrait';

        let pageWidth = isLandscape ? 297 : 210;
        let imageWidth = pageWidth - margin * 2;
        let imageHeight = imageWidth * (item.naturalHeight / item.naturalWidth);
        let pageHeight = imageHeight + margin * 2;

        pageWidth = Math.round(pageWidth * 10) / 10;
        pageHeight = Math.round(pageHeight * 10) / 10;
        imageWidth = Math.round(imageWidth * 10) / 10;
        imageHeight = Math.round(imageHeight * 10) / 10;

        if (pageIdx === 0) {
          pdf = new jsPDF({
            orientation,
            unit: 'mm',
            format: [pageWidth, pageHeight]
          });
        } else {
          pdf!.addPage([pageWidth, pageHeight], orientation);
        }

        const format = item.img.toLowerCase().includes('png') ? 'PNG' : 'JPEG';
        pdf!.addImage(item.img, format, margin, margin, imageWidth, imageHeight, undefined, 'FAST');
      }
    });

    if (!pdf) return;

    if (generatedPdfUrl) {
      URL.revokeObjectURL(generatedPdfUrl);
    }
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    setGeneratedPdfUrl(url);
    setMode('pdf');
  };

  const handleShare = async () => {
    if (!generatedPdfUrl) return;
    const finalName = sanitizePdfFileName(pdfFileName);
    const response = await fetch(generatedPdfUrl);
    const blob = await response.blob();
    const file = new File([blob], finalName, { type: 'application/pdf' });

    if (navigator.share) {
      try {
        await navigator.share({
          files: [file],
          title: finalName,
          text: 'PDF gerado via Aplicações Ambientais'
        });
      } catch (err) {
        console.error('Share failed', err);
      }
    } else {
      const link = document.createElement('a');
      link.href = generatedPdfUrl;
      link.download = finalName;
      link.click();
    }
  };

  const handleDownload = () => {
    if (!generatedPdfUrl) return;
    const finalName = sanitizePdfFileName(pdfFileName);
    const link = document.createElement('a');
    link.href = generatedPdfUrl;
    link.download = finalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPhotosCount = sheets.reduce((acc, s) => acc + s.photos.length, 0);
  const selectedPhotoUrl = selectedPhotoLoc
    ? sheets.find(s => s.id === selectedPhotoLoc.sheetId)?.photos[selectedPhotoLoc.photoIdx] || null
    : null;
  const selectedSheetNumber = selectedPhotoLoc
    ? sheets.findIndex(s => s.id === selectedPhotoLoc.sheetId) + 1
    : 0;

  const cropModalElement = cropTarget ? (
    <div className="fixed inset-0 z-[140] bg-black/95 flex flex-col p-4 sm:p-6 select-none text-white">
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
          className="p-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-white rounded-lg cursor-pointer transition-colors"
          title="Fechar corte"
        >
          <X size={20} />
        </button>
      </div>

      <p className="text-[11px] font-mono text-zinc-300 text-center mb-3">
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
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
              <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
              <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
              <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
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
            className="py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-black text-[10px] border border-zinc-600 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw size={14} /> GIRAR ESQ
          </button>
          <button
            type="button"
            onClick={() => rotateCropTarget('right')}
            className="py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-black text-[10px] border border-zinc-600 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCw size={14} /> GIRAR DIR
          </button>
          <button
            type="button"
            onClick={() => setCropBox({ x: 0, y: 0, w: 1, h: 1 })}
            className="py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-black text-[10px] border border-zinc-600 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Maximize size={14} /> INTEIRA
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setCropTarget(null)}
            className="py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-200 font-bold rounded-xl text-xs uppercase cursor-pointer"
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
  ) : null;

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
            onClick={() => {
              setPendingTargetSheetId(null);
              setMode('selection');
            }}
            className="p-3 bg-black/50 backdrop-blur-md rounded-full text-white pointer-events-auto active:scale-95 transition-transform flex items-center gap-1.5 shadow border border-white/20 cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
            <span className="text-xs font-mono font-bold tracking-wider pr-1">VOLTAR</span>
          </button>
        </div>

        {/* Focus Ring */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border-2 border-emerald-400 rounded-full opacity-40 animate-pulse pointer-events-none" />

        {hasPermission === false && (
          <div className="absolute inset-x-6 top-24 bg-red-950/90 border border-red-500 text-white p-4 rounded-2xl text-center text-xs font-mono">
            Permissão de câmera negada ou indisponível. Use Importar Galeria.
          </div>
        )}

        {/* Zoom Controls */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 z-[110] flex flex-col items-center gap-2 bg-black/70 px-2 py-3 rounded-2xl backdrop-blur-md border border-white/15 shadow-2xl">
          <button
            onClick={() => setZoom(z => Math.min(z + 0.2, 3))}
            className="w-8 h-8 bg-white/15 hover:bg-white/25 active:scale-90 text-white rounded-full flex items-center justify-center font-black transition-all cursor-pointer border border-white/10"
            title="Aumentar Zoom (+)"
          >
            <Plus size={14} />
          </button>
          <span className="text-[10px] font-black font-mono text-emerald-300 tracking-tight min-w-[28px] text-center">
            {zoom.toFixed(1)}x
          </span>
          <button
            onClick={() => setZoom(z => Math.max(z - 0.2, 1))}
            className="w-8 h-8 bg-white/15 hover:bg-white/25 active:scale-90 text-white rounded-full flex items-center justify-center font-black transition-all cursor-pointer border border-white/10"
            title="Diminuir Zoom (-)"
          >
            <Minus size={14} />
          </button>
        </div>

        {/* Capture Button */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[110]">
          <button
            onClick={handleTakePhoto}
            className="w-18 h-18 bg-white hover:bg-neutral-100 rounded-full p-1 shadow-2xl active:scale-90 transition-transform relative cursor-pointer"
            title="Capturar Foto"
          >
            <div className="w-full h-full rounded-full border border-black/10 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-700 transition-colors" />
            </div>
          </button>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  if (mode === 'review') {
    return (
      <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col p-6 text-white">
        <h2 className="text-xl font-bold mb-4 uppercase tracking-tight text-center text-white">Conferir Foto</h2>

        <div className="flex-1 bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl relative border border-zinc-700 flex items-center justify-center">
          <img src={currentPhoto!} className="max-w-full max-h-full object-contain" alt="Review" />
        </div>

        {/* Rotate & Crop controls row - High contrast dark buttons with white icons */}
        <div className="grid grid-cols-3 gap-2.5 mt-5 mb-2 max-w-md mx-auto w-full">
          <button
            onClick={() => rotateImage('left')}
            className="flex items-center justify-center gap-1.5 px-3 py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-black text-[11px] active:scale-95 transition-all cursor-pointer shadow-md border border-zinc-600"
            title="Girar para Esquerda"
          >
            <RotateCcw size={15} /> GIRAR ESQ
          </button>
          <button
            onClick={() => rotateImage('right')}
            className="flex items-center justify-center gap-1.5 px-3 py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-black text-[11px] active:scale-95 transition-all cursor-pointer shadow-md border border-zinc-600"
            title="Girar para Direita"
          >
            <RotateCw size={15} /> GIRAR DIR
          </button>
          <button
            onClick={openCropForReview}
            className="flex items-center justify-center gap-1.5 px-3 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-[11px] active:scale-95 transition-all cursor-pointer shadow-md border border-blue-400"
            title="Cortar Imagem"
          >
            <Crop size={15} /> CORTAR
          </button>
        </div>

        <div className="py-4 grid grid-cols-2 gap-4 max-w-md mx-auto w-full">
          <button
            onClick={() => {
              setCurrentPhoto(null);
              setMode('camera');
            }}
            className="flex items-center justify-center gap-2 bg-red-900/60 border border-red-500/60 text-red-100 p-4 rounded-2xl font-bold cursor-pointer hover:bg-red-800/80 active:scale-95 transition-transform"
          >
            <Trash2 size={20} /> EXCLUIR
          </button>
          <button
            onClick={handleSavePhoto}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-2xl font-black shadow-xl cursor-pointer"
          >
            <Check size={24} /> SALVAR
          </button>
        </div>
        {cropModalElement}
      </div>
    );
  }

  if (mode === 'pdf') {
    return (
      <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col p-5 sm:p-6 overflow-hidden text-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white">PDF GERADO</h2>
          <button
            onClick={() => setMode('selection')}
            className="p-2 bg-zinc-800 border border-zinc-700 rounded-lg cursor-pointer hover:bg-zinc-700 text-white"
            title="Voltar para edição"
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 bg-white rounded-2xl shadow-2xl overflow-hidden relative border border-zinc-700 min-h-0">
          <iframe src={generatedPdfUrl!} className="w-full h-full border-none" title="PDF Preview" />
        </div>

        <div className="pt-4 pb-2 flex flex-col gap-3">
          {/* Rename generated PDF input */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-2.5">
            <label className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-300 mb-1.5">
              <Pencil size={12} className="text-blue-400" />
              <span>Renomear arquivo para salvar / baixar</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={pdfFileName}
                onChange={e => setPdfFileName(e.target.value)}
                placeholder="Nome do arquivo PDF..."
                className="flex-1 min-w-0 bg-zinc-950 border border-zinc-600 focus:border-blue-500 rounded-lg px-3 py-2 text-xs font-mono font-bold text-white outline-none"
              />
              <span className="px-2.5 py-2 rounded-lg bg-zinc-800 border border-zinc-700 font-mono text-xs font-black text-zinc-300 shrink-0">
                .pdf
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleShare}
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-3.5 rounded-xl font-black flex items-center justify-center gap-2 shadow-lg text-xs uppercase cursor-pointer active:scale-95 transition-all"
              title="Compartilhar pelo WhatsApp, Telegram, etc."
            >
              <Share2 size={18} /> Compartilhar
            </button>

            <button
              onClick={handleDownload}
              className="bg-blue-600 hover:bg-blue-700 text-white p-3.5 rounded-xl font-black flex items-center justify-center gap-2 shadow-lg text-xs uppercase cursor-pointer active:scale-95 transition-all"
              title="Baixar arquivo PDF no dispositivo"
            >
              <Download size={18} /> Baixar PDF
            </button>
          </div>

          <button
            onClick={() => {
              setSheets([]);
              setPdfFileName(getDefaultPdfName());
              setMode('selection');
            }}
            className="text-zinc-300 hover:text-white text-xs font-bold flex items-center justify-center gap-2 mt-1 cursor-pointer uppercase tracking-wider font-mono transition-colors"
          >
            <RotateCcw size={14} /> Limpar e Novo Documento
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Hidden input for adding photo into a specific 2nd slot */}
      <input
        type="file"
        ref={slotFileInputRef}
        onChange={e => handleGalleryImport(e, slotTargetSheetRef.current)}
        accept="image/*"
        className="hidden"
      />

      {/* Header with only Back button */}
      <div className="flex items-center justify-between pt-2 pb-2">
        <button
          onClick={onBack}
          className="p-2 hover:bg-military-800 rounded-lg flex items-center gap-2 group transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold text-sm uppercase tracking-tight">Voltar</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div
          onClick={() => {
            setPendingTargetSheetId(null);
            setMode('camera');
          }}
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
            onChange={e => handleGalleryImport(e, null)}
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

      <div className="bg-military-800 rounded-3xl p-4 sm:p-6 border border-military-700 shadow-xl">
        <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <FileImage className="w-5 h-5 text-military-300" />
            <h2 className="font-bold text-lg uppercase tracking-tight">Folhas do PDF</h2>
          </div>
          <span className="text-[10px] font-mono bg-military-900 border border-military-700 px-2.5 py-1 rounded font-bold text-military-200">
            {sheets.length} {sheets.length === 1 ? 'FOLHA' : 'FOLHAS'} • {totalPhotosCount} {totalPhotosCount === 1 ? 'FOTO' : 'FOTOS'}
          </span>
        </div>

        {sheets.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-military-600 opacity-60">
            <FileImage size={48} strokeWidth={1} />
            <p className="mt-4 text-xs font-mono uppercase tracking-[0.2em]">Aguardando Captura</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sheets.map((sheet, sheetIdx) => (
              <div
                key={sheet.id}
                className="rounded-2xl border-2 border-military-700 bg-military-900/60 overflow-hidden shadow-md"
              >
                {/* Sheet Header: Page Number + Per-Page 1 or 2 Photos Selector + Order/Delete */}
                <div className="bg-military-850 border-b border-military-700 px-3 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-1 rounded-lg bg-military-300 text-white font-mono text-[10px] font-black uppercase tracking-wider">
                      FOLHA {sheetIdx + 1}
                    </span>

                    {sheets.length > 1 && (
                      <div className="flex items-center gap-1 ml-1">
                        <button
                          type="button"
                          onClick={() => handleMoveSheet(sheetIdx, 'up')}
                          disabled={sheetIdx === 0}
                          className="p-1 rounded-md bg-white border border-military-700 text-military-100 disabled:opacity-35 hover:bg-military-850 cursor-pointer"
                          title="Mover folha para cima"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveSheet(sheetIdx, 'down')}
                          disabled={sheetIdx === sheets.length - 1}
                          className="p-1 rounded-md bg-white border border-military-700 text-military-100 disabled:opacity-35 hover:bg-military-850 cursor-pointer"
                          title="Mover folha para baixo"
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Per-Sheet 1 Foto vs 2 Fotos Selector */}
                  <div className="flex items-center gap-1.5">
                    <div className="inline-flex rounded-xl bg-white border border-military-700 p-0.5 shadow-xs">
                      <button
                        type="button"
                        onClick={() => handleSetSheetSlotCount(sheet.id, 1)}
                        className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-black uppercase transition-all cursor-pointer ${
                          sheet.slotCount === 1
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-military-200 hover:bg-military-850'
                        }`}
                      >
                        1 Foto
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetSheetSlotCount(sheet.id, 2)}
                        className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-black uppercase transition-all cursor-pointer ${
                          sheet.slotCount === 2
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-military-200 hover:bg-military-850'
                        }`}
                      >
                        2 Fotos
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sheet Body: 1 or 2 Photo Slots */}
                <div className={`p-3 grid gap-3 ${sheet.slotCount === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {(sheet.slotCount === 2 ? [0, 1] : [0]).map(photoIdx => {
                    const img = sheet.photos[photoIdx];

                    if (!img) {
                      return (
                        <div
                          key={`empty_${sheet.id}_${photoIdx}`}
                          className="aspect-[3/4] rounded-xl border-2 border-dashed border-military-600/70 bg-white/75 flex flex-col items-center justify-center gap-2.5 p-3 text-center"
                        >
                          <span className="font-mono text-[10px] font-black uppercase text-military-300">
                            2ª Foto da Folha {sheetIdx + 1}
                          </span>
                          <div className="flex flex-col gap-1.5 w-full max-w-[140px]">
                            <button
                              type="button"
                              onClick={() => {
                                setPendingTargetSheetId(sheet.id);
                                setMode('camera');
                              }}
                              className="w-full py-2 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-mono text-[10px] font-bold uppercase flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                            >
                              <Camera size={12} /> Câmera
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                slotTargetSheetRef.current = sheet.id;
                                slotFileInputRef.current?.click();
                              }}
                              className="w-full py-2 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-mono text-[10px] font-bold uppercase flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                            >
                              <Upload size={12} /> Galeria
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`photo_${sheet.id}_${photoIdx}`}
                        onClick={() => setSelectedPhotoLoc({ sheetId: sheet.id, photoIdx })}
                        className={`relative group ${
                          sheet.slotCount === 2 ? 'aspect-[3/4]' : 'aspect-[4/3] max-h-[280px] mx-auto w-full'
                        } rounded-xl overflow-hidden border-2 border-military-700 shadow-md cursor-pointer hover:border-blue-500 transition-all bg-zinc-900`}
                      >
                        <img src={img} className="w-full h-full object-cover" alt={`Folha ${sheetIdx + 1} - Foto ${photoIdx + 1}`} />

                        {/* High-contrast action buttons: Rotate Left, Rotate Right, Crop, Delete */}
                        <div className="absolute top-2 right-2 flex gap-1.5 z-10">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              handleRotateSheetPhoto(sheet.id, photoIdx, 'left');
                            }}
                            className="p-2 bg-zinc-900/95 hover:bg-black border border-white/40 text-white rounded-lg shadow-lg active:scale-90 transition-transform cursor-pointer"
                            title="Girar para Esquerda"
                          >
                            <RotateCcw size={14} strokeWidth={2.5} />
                          </button>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              handleRotateSheetPhoto(sheet.id, photoIdx, 'right');
                            }}
                            className="p-2 bg-zinc-900/95 hover:bg-black border border-white/40 text-white rounded-lg shadow-lg active:scale-90 transition-transform cursor-pointer"
                            title="Girar para Direita"
                          >
                            <RotateCw size={14} strokeWidth={2.5} />
                          </button>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              openCropForSheetPhoto(sheet.id, photoIdx);
                            }}
                            className="p-2 bg-blue-600 hover:bg-blue-700 border border-blue-300/70 text-white rounded-lg shadow-lg active:scale-90 transition-transform cursor-pointer"
                            title="Cortar Imagem"
                          >
                            <Crop size={14} strokeWidth={2.5} />
                          </button>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              handleDeleteSheetPhoto(sheet.id, photoIdx);
                            }}
                            className="p-2 bg-red-600 hover:bg-red-700 border border-red-300/70 text-white rounded-lg shadow-lg active:scale-90 transition-transform cursor-pointer"
                            title="Excluir Imagem"
                          >
                            <Trash2 size={14} strokeWidth={2.5} />
                          </button>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 px-2.5 py-1.5 bg-black/80 backdrop-blur-sm flex justify-between items-center">
                          <span className="text-[10px] font-mono text-white font-bold">
                            {sheet.slotCount === 2 ? `FOTO ${photoIdx + 1}` : 'FOLHA INTEIRA'}
                          </span>
                          <span className="text-[9px] font-bold text-white/90 font-mono uppercase tracking-wider">
                            Ampliar
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPhotosCount > 0 && (
          <div className="mt-6 space-y-3">
            {/* PDF File Name Input */}
            <div className="bg-military-900 border border-military-700 rounded-2xl p-3">
              <label className="flex items-center gap-1.5 text-[10px] font-mono font-black uppercase tracking-wider text-military-200 mb-1.5">
                <Pencil size={12} className="text-blue-600" />
                <span>Nome do arquivo PDF</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={pdfFileName}
                  onChange={e => setPdfFileName(e.target.value)}
                  placeholder="Digite o nome do PDF..."
                  className="flex-1 min-w-0 bg-white border border-military-700 focus:border-blue-600 rounded-xl px-3 py-2 text-xs font-mono font-bold text-military-100 outline-none"
                />
                <span className="px-2.5 py-2 rounded-xl bg-military-850 border border-military-700 font-mono text-xs font-black text-military-200 shrink-0">
                  .pdf
                </span>
              </div>
            </div>

            <button
              onClick={generatePDF}
              className="w-full bg-military-300 hover:bg-military-200 text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] cursor-pointer"
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
      {selectedPhotoLoc && selectedPhotoUrl && (
        <div className="fixed inset-0 z-[120] bg-black/95 flex flex-col p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono font-bold tracking-widest text-zinc-300 uppercase">
              Folha {selectedSheetNumber} — Foto {selectedPhotoLoc.photoIdx + 1}
            </span>
            <button
              onClick={() => setSelectedPhotoLoc(null)}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-white rounded-lg cursor-pointer transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-zinc-700 flex items-center justify-center p-2">
            <img src={selectedPhotoUrl} className="max-w-full max-h-[65vh] object-contain rounded-xl" alt="Page Detail" />
          </div>

          {/* Controls: Girar Esq, Girar Dir, Cortar, Excluir, Concluir */}
          <div className="mt-5 space-y-2.5 w-full max-w-md mx-auto">
            <div className="grid grid-cols-3 gap-2.5">
              <button
                onClick={() => handleRotateSheetPhoto(selectedPhotoLoc.sheetId, selectedPhotoLoc.photoIdx, 'left')}
                className="py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-black rounded-xl flex flex-col items-center justify-center gap-1 border border-zinc-600 active:scale-95 transition-all text-[10px] cursor-pointer shadow-md"
                title="Girar para Esquerda"
              >
                <RotateCcw size={16} />
                <span>GIRAR ESQ</span>
              </button>
              <button
                onClick={() => handleRotateSheetPhoto(selectedPhotoLoc.sheetId, selectedPhotoLoc.photoIdx, 'right')}
                className="py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-black rounded-xl flex flex-col items-center justify-center gap-1 border border-zinc-600 active:scale-95 transition-all text-[10px] cursor-pointer shadow-md"
                title="Girar para Direita"
              >
                <RotateCw size={16} />
                <span>GIRAR DIR</span>
              </button>
              <button
                onClick={() => openCropForSheetPhoto(selectedPhotoLoc.sheetId, selectedPhotoLoc.photoIdx)}
                className="py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl flex flex-col items-center justify-center gap-1 border border-blue-400 active:scale-95 transition-all text-[10px] cursor-pointer shadow-md"
                title="Cortar Imagem"
              >
                <Crop size={16} />
                <span>CORTAR</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => handleDeleteSheetPhoto(selectedPhotoLoc.sheetId, selectedPhotoLoc.photoIdx)}
                className="py-3 bg-red-900/60 hover:bg-red-800/80 border border-red-500/60 text-red-100 font-bold rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all text-xs cursor-pointer"
                title="Excluir esta foto"
              >
                <Trash2 size={16} />
                <span>EXCLUIR</span>
              </button>
              <button
                onClick={() => setSelectedPhotoLoc(null)}
                className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all text-xs cursor-pointer shadow-md"
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
      {cropModalElement}
    </div>
  );
}
