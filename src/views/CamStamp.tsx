import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Camera as CameraIcon, 
  MapPin, 
  RefreshCcw, 
  ShieldAlert, 
  Image,
  ChevronLeft,
  Settings as SettingsIcon,
  X,
  Check,
  Signal,
  Eye,
  Type,
  Trash2,
  FolderOpen,
  Download,
  Share2
} from 'lucide-react';
import { decimalToDMS, decimalToUTM } from '../utils/coords';
import { CameraSettings, DEFAULT_SETTINGS, CoordFormat, InfoPosition, FontSize } from '../types/settings';

interface CamStampProps {
  onBack: () => void;
}

export default function CamStamp({ onBack }: CamStampProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [timestamp, setTimestamp] = useState<string>(() => new Date().toLocaleString('pt-BR'));
  const [settings, setSettings] = useState<CameraSettings>(() => {
    const saved = localStorage.getItem('bpa_camera_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [gallery, setGallery] = useState<{ id: string; url: string; timestamp: string }[]>(() => {
    const saved = localStorage.getItem('bpa_camera_gallery');
    return saved ? JSON.parse(saved) : [];
  });
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Persistence
  useEffect(() => {
    localStorage.setItem('bpa_camera_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    // Limit saved gallery size in localStorage to 12 items to prevent QuotaExceededError and keep synchronous loading fast on low-spec phones
    const limitedGallery = gallery.slice(0, 12);
    localStorage.setItem('bpa_camera_gallery', JSON.stringify(limitedGallery));
  }, [gallery]);

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        activeStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(err => console.error("Video play error:", err));
        }
        setHasPermission(true);
        setIsSimulated(false);
      } catch (err) {
        console.error("Camera error, fallback to simulated view:", err);
        // Fallback to beautiful simulated 1x camera proportion scene so it is always functional!
        setHasPermission(true);
        setIsSimulated(true);
      }
    }

    let watchId: number | null = null;
    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition((position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      }, (err) => console.error(err), { enableHighAccuracy: true });
    }

    const timer = setInterval(() => {
      setTimestamp(new Date().toLocaleString('pt-BR'));
    }, 1000);

    startCamera();
    return () => {
      clearInterval(timer);
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      } else {
        const stream = videoRef.current?.srcObject as MediaStream;
        stream?.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleCapture = useCallback(async () => {
    if (!canvasRef.current) return;
    setIsCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsCapturing(false);
      return;
    }

    if (isSimulated) {
      // Use HD standard photo capture dimensions
      canvas.width = 1280;
      canvas.height = 720;

      // High quality local abstract forest profile canvas painting offline fallback
      // Sky
      ctx.fillStyle = '#0f140e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Stars
      ctx.fillStyle = 'rgba(171, 195, 166, 0.4)';
      ctx.beginPath();
      ctx.arc(200, 180, 2, 0, Math.PI * 2);
      ctx.arc(500, 100, 1.5, 0, Math.PI * 2);
      ctx.arc(950, 150, 2.5, 0, Math.PI * 2);
      ctx.arc(1100, 220, 1.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Distant Mountains
      ctx.fillStyle = '#1b231a';
      ctx.beginPath();
      ctx.moveTo(-100, canvas.height);
      ctx.lineTo(300, 280);
      ctx.lineTo(700, 550);
      ctx.lineTo(1100, 340);
      ctx.lineTo(1400, canvas.height);
      ctx.closePath();
      ctx.fill();

      // Midground Hills
      ctx.fillStyle = '#242f22';
      ctx.beginPath();
      ctx.moveTo(-50, canvas.height);
      ctx.lineTo(200, 420);
      ctx.lineTo(550, 620);
      ctx.lineTo(850, 460);
      ctx.lineTo(1350, canvas.height);
      ctx.closePath();
      ctx.fill();

      // Simple Trees Silhouettes
      ctx.fillStyle = '#1b231a';
      // Tree 1
      ctx.beginPath(); ctx.moveTo(150, 495); ctx.lineTo(160, 460); ctx.lineTo(170, 495); ctx.closePath(); ctx.fill();
      // Tree 2
      ctx.beginPath(); ctx.moveTo(180, 500); ctx.lineTo(195, 450); ctx.lineTo(210, 500); ctx.closePath(); ctx.fill();

      // Foreground Hills
      ctx.fillStyle = '#2c362a';
      ctx.beginPath();
      ctx.moveTo(-50, canvas.height);
      ctx.lineTo(400, 580);
      ctx.lineTo(900, 600);
      ctx.lineTo(1350, canvas.height);
      ctx.closePath();
      ctx.fill();

      // Winding River
      ctx.fillStyle = 'rgba(171, 195, 166, 0.7)';
      ctx.beginPath();
      ctx.moveTo(600, 580);
      ctx.bezierCurveTo(580, 610, 520, 630, 400, 720);
      ctx.lineTo(410, 720);
      ctx.bezierCurveTo(525, 632, 575, 610, 608, 580);
      ctx.closePath();
      ctx.fill();

      // HUD Text Indicator
      ctx.fillStyle = '#abc3a6';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('BPA GPS SIMULATOR v2.5 ONSITE', 40, 50);
      ctx.fillText('● MODO SEGURO OFFLINE', 40, 80);
    } else if (video) {
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      // Draw video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    // Prepare overlay data
    const coordStr = settings.coordFormat === 'DMS' 
      ? (coords ? `${decimalToDMS(coords.lat, 'lat')} ${decimalToDMS(coords.lng, 'lng')}` : 'Buscando satélites...')
      : (coords ? decimalToUTM(coords.lat, coords.lng) : 'Buscando satélites...');
    
    // Order requested: Data/Hora, Coordenada, Texto personalizado (caso haja)
    const infoText = [
      settings.showDateTime ? timestamp : '',
      coordStr,
      settings.customText,
    ].filter(Boolean);

    // Font styles based on setting
    const baseFontSize = settings.fontSize === 'Small' ? 20 : settings.fontSize === 'Medium' ? 30 : 40;
    ctx.font = `bold ${baseFontSize}px Inter, sans-serif`;
    ctx.fillStyle = 'white';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    const padding = 40;
    const lineHeight = baseFontSize * 1.3;

    // Calculate position
    let x = padding;
    let y = padding + baseFontSize;

    if (settings.position.includes('Right')) {
      x = canvas.width - padding;
      ctx.textAlign = 'right';
    } else {
      ctx.textAlign = 'left';
    }

    if (settings.position.includes('Bottom')) {
      y = canvas.height - (infoText.length * lineHeight) - padding;
    }

    // Draw background for info
    const bgPadding = 15;
    const maxWidth = Math.max(...infoText.map(t => ctx.measureText(t).width));
    const bgX = settings.position.includes('Right') ? x - maxWidth - bgPadding : x - bgPadding;
    const bgY = y - baseFontSize;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillRect(bgX, bgY, maxWidth + (bgPadding * 2), (infoText.length * lineHeight) + bgPadding);
    
    // Draw text
    ctx.fillStyle = 'white';
    infoText.forEach((line, i) => {
      ctx.fillText(line, x, y + (i * lineHeight));
    });

    // Save/Download
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    
    // Add to gallery
    const newPhoto = {
      id: Date.now().toString(),
      url: dataUrl,
      timestamp: new Date().toLocaleString('pt-BR')
    };
    setGallery(prev => [newPhoto, ...prev]);

    // Use Blob Object URL for extremely robust mobile device savings and downloads
    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.download = `BPA_CAMSTAMP_${Date.now()}.jpeg`;
      link.href = objectUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      console.error("Auto download fallback:", err);
      // Fallback to legacy link click just in case
      const link = document.createElement('a');
      link.download = `BPA_CAMSTAMP_${Date.now()}.jpeg`;
      link.href = dataUrl;
      link.click();
    }

    setTimeout(() => setIsCapturing(false), 500);
  }, [coords, settings, timestamp]);

  const handleSharePhoto = async (photoUrl: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      if (navigator.share) {
        // Convert base64 dataUrl to File object for native sharing
        const response = await fetch(photoUrl);
        const blob = await response.blob();
        const file = new File([blob], `BPA_PHOTO_${Date.now()}.jpeg`, { type: 'image/jpeg' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Foto Georreferenciada BPA',
            text: 'Compartilhado via BPA SisGeo'
          });
          return;
        }
      }
      
      // Fallback: download and alert
      const link = document.createElement('a');
      link.download = `BPA_PHOTO_${Date.now()}.jpeg`;
      link.href = photoUrl;
      link.click();
      alert('Seu navegador não suporta compartilhamento direto de arquivos. A foto foi salva e baixada no dispositivo.');
    } catch (err) {
      console.log('Compartilhamento cancelado ou indisponível:', err);
    }
  };

  const renderOverlay = () => {
    const coordStr = settings.coordFormat === 'DMS' 
      ? (coords ? `${decimalToDMS(coords.lat, 'lat')} ${decimalToDMS(coords.lng, 'lng')}` : 'Localizando...')
      : (coords ? decimalToUTM(coords.lat, coords.lng) : 'Localizando...');

    const posClasses = {
      TopLeft: 'top-16 left-4 z-[50]',
      TopRight: 'top-16 right-4 text-right z-[50]',
      BottomLeft: 'bottom-28 left-4 z-[50]',
      BottomRight: 'bottom-28 right-4 text-right z-[50]'
    };

    const sizeClasses = {
      Small: 'text-[10px]',
      Medium: 'text-[12px]',
      Large: 'text-[14px]'
    };

    return (
      <div className={`absolute ${posClasses[settings.position]} bg-black/50 backdrop-blur-sm p-3 rounded-lg border border-white/10 text-white font-mono pointer-events-none transition-all`}>
        <div className="flex flex-col gap-0.5">
          {settings.showDateTime && <div className={sizeClasses[settings.fontSize]}>{timestamp}</div>}
          <div className={sizeClasses[settings.fontSize]}>{coordStr}</div>
          {settings.customText && (
            <div className={`font-bold flex items-center gap-1 ${sizeClasses[settings.fontSize]} text-military-300 ${settings.position.includes('Right') ? 'justify-end text-right' : ''}`}>
              {settings.customText}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 h-screen w-screen bg-black overflow-hidden">
      {/* Full Screen Camera */}
      <div className="absolute inset-0">
        {hasPermission === false ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-military-900">
            <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
            <h3 className="text-xl font-bold mb-2">Permissão Negada</h3>
            <p className="text-sm text-military-400">
              O acesso à câmera e localização são necessários.
            </p>
            <button 
              onClick={onBack}
              className="mt-6 px-6 py-2 bg-military-800 rounded-full text-military-100 flex items-center gap-2"
            >
              <ChevronLeft size={18} /> Voltar
            </button>
          </div>
        ) : (
          <>
            {isSimulated ? (
              <div className="w-full h-full relative select-none bg-black">
                {/* SVG Beautiful Offline-friendly Forest Landscape */}
                <svg className="w-full h-full object-cover" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                  {/* Sky / Ambient background */}
                  <rect width="1280" height="720" fill="#0f140e" />
                  
                  {/* Stars / nodes */}
                  <circle cx="200" cy="180" r="1.5" fill="#abc3a6" opacity="0.3" />
                  <circle cx="500" cy="100" r="1" fill="#abc3a6" opacity="0.2" />
                  <circle cx="950" cy="150" r="2" fill="#abc3a6" opacity="0.4" />
                  <circle cx="1100" cy="220" r="1" fill="#abc3a6" opacity="0.2" />

                  {/* Distant Mountains */}
                  <path d="M-100 720 L300 280 L700 550 L1100 340 L1400 720 Z" fill="#1b231a" />
                  
                  {/* Midground Hills */}
                  <path d="M-50 720 L200 420 L550 620 L850 460 L1350 720 Z" fill="#242f22" />

                  {/* Dense trees silhouettes on hills */}
                  <path d="M150 495 L160 460 L170 495 Z" fill="#1b231a" />
                  <path d="M180 500 L195 450 L210 500 Z" fill="#1b231a" />
                  <path d="M130 510 L145 470 L160 510 Z" fill="#1b231a" />
                  <path d="M820 480 L830 445 L840 480 Z" fill="#242f22" />
                  <path d="M850 475 L865 435 L880 475 Z" fill="#242f22" />

                  {/* Foreground Hills */}
                  <path d="M-50 720 L400 580 L900 600 L1350 720 Z" fill="#2c362a" />

                  {/* Winding River */}
                  <path d="M600 580 Q580 610 520 630 T400 720 L550 720 Q660 640 680 600 Z" fill="#414e3e" opacity="0.5" />
                  <path d="M595 580 Q575 610 515 630 T390 720 L410 720 Q525 632 585 582 Z" fill="#abc3a6" opacity="0.7" />

                  {/* Large Foreground Pine Trees (Left) */}
                  <g transform="translate(100, 480)">
                    <rect x="22" y="100" width="6" height="40" fill="#192018" />
                    <polygon points="25,50 5,85 45,85" fill="#364233" />
                    <polygon points="25,25 10,65 40,65" fill="#414e3e" />
                    <polygon points="25,5 15,40 35,40" fill="#61725b" />
                  </g>
                  <g transform="translate(40, 520)">
                    <rect x="22" y="100" width="6" height="40" fill="#192018" />
                    <polygon points="25,40 2,80 48,80" fill="#242f22" />
                    <polygon points="25,15 8,55 42,55" fill="#364233" />
                  </g>

                  {/* Large Foreground Pine Trees (Right) */}
                  <g transform="translate(1100, 450)">
                    <rect x="22" y="120" width="8" height="60" fill="#192018" />
                    <polygon points="26,60 2,105 50,105" fill="#364233" />
                    <polygon points="26,30 8,80 44,80" fill="#414e3e" />
                    <polygon points="26,5 15,50 37,50" fill="#61725b" />
                  </g>

                  {/* HUD Info */}
                  <rect x="40" y="40" width="220" height="4" fill="#abc3a6" opacity="0.3" />
                  <text x="50" y="30" fill="#abc3a6" fontSize="10" fontFamily="monospace" letterSpacing="2">BPA GPS SIMULATOR v2.5</text>
                  <text x="50" y="60" fill="#abc3a6" fontSize="10" fontFamily="monospace" opacity="0.7">● MODO SEGURO OFFLINE</text>
                </svg>

                {/* 1X camera reticle overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                  <div className="w-16 h-16 border border-white rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full" />
                  </div>
                </div>
              </div>
            ) : (
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted
                className="w-full h-full object-cover"
              />
            )}

            {renderOverlay()}
            <canvas ref={canvasRef} className="hidden" />
          </>
        )}

        {isCapturing && (
          <div className="absolute inset-0 bg-white/20 animate-pulse pointer-events-none" />
        )}
      </div>

      {/* Floating Controls - Back Button */}
      <div className="absolute top-6 left-6 pointer-events-none">
        <button 
          onClick={onBack}
          className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white pointer-events-auto active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      </div>

      {/* Bottom Control Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-military-800/90 backdrop-blur-md border-t border-military-700 px-6 py-4 pb-8 flex items-center justify-between">
        {/* Gallery Preview */}
        <button 
          onClick={() => setShowGallery(true)}
          className="w-10 h-10 rounded-lg border border-military-600 overflow-hidden active:scale-95 transition-transform bg-military-900 group"
        >
          {gallery.length > 0 ? (
            <img src={gallery[0].url} alt="Galeria" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-military-600">
              <FolderOpen size={18} />
            </div>
          )}
        </button>

        {/* Capture Button */}
        <button 
          onClick={handleCapture}
          disabled={isCapturing}
          className="w-16 h-16 bg-white rounded-full p-1 shadow-xl disabled:opacity-50 active:scale-90 transition-transform relative"
        >
          <div className="w-full h-full rounded-full border-4 border-military-900 flex items-center justify-center">
            <div className={`w-10 h-10 rounded-full ${isCapturing ? 'bg-red-500 animate-pulse' : 'bg-military-800'} transition-colors`} />
          </div>
        </button>

        {/* Settings Button */}
        <button 
          onClick={() => setShowSettings(true)}
          className="w-10 h-10 bg-military-700/50 hover:bg-military-700 rounded-lg flex items-center justify-center text-military-200 active:scale-95 transition-all"
        >
          <SettingsIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Gallery Modal */}
      {showGallery && (
        <div className="fixed inset-0 z-[200] bg-[#0c100b] p-0 flex flex-col">
          <header className="p-6 bg-military-900 border-b border-military-800 flex items-center justify-between">
            <h2 className="text-xl font-bold uppercase tracking-tight flex items-center gap-2">
              <FolderOpen className="text-military-400" /> Galeria de Fotos
            </h2>
            <button onClick={() => setShowGallery(false)} className="p-2 hover:bg-military-800 rounded-lg">
              <X className="w-6 h-6" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-4 content-start">
            {gallery.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-military-500 opacity-50">
                <Image className="w-16 h-16 mb-4" />
                <p className="font-mono uppercase tracking-widest text-xs">Nenhuma foto encontrada</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {gallery.map(item => (
                  <div key={item.id} className="relative group rounded-xl overflow-hidden border border-military-800 active:scale-95 transition-transform" onClick={() => setSelectedImage(item.url)}>
                    <img src={item.url} alt={item.timestamp} className="w-full aspect-[3/4] object-cover" />
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-black/60 backdrop-blur-sm">
                      <p className="text-[10px] font-mono text-white truncate">{item.timestamp}</p>
                    </div>
                    {/* Share icon on item top-left */}
                    <button 
                      onClick={(e) => handleSharePhoto(item.url, e)}
                      className="absolute top-2 left-2 p-2 bg-blue-600/80 hover:bg-blue-600 rounded-lg text-white shadow active:scale-95 transition-all"
                      title="Compartilhar imagem"
                    >
                      <Share2 size={16} />
                    </button>
                    {/* Trash icon on item top-right */}
                    <button 
                      onClick={(e) => { e.stopPropagation(); setGallery(prev => prev.filter(p => p.id !== item.id)); }}
                      className="absolute top-2 right-2 p-2 bg-red-500/80 hover:bg-red-600 rounded-lg text-white shadow active:scale-95 transition-transform"
                      title="Excluir imagem"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedImage && (
            <div className="fixed inset-0 z-[300] bg-black flex flex-col items-center justify-center p-4">
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute top-6 right-6 p-3 bg-white/10 backdrop-blur-md rounded-full text-white"
              >
                <X size={24} />
              </button>
              <img src={selectedImage} className="max-w-full max-h-[80vh] rounded-xl shadow-2xl" alt="Preview Full" />
              <div className="mt-8 flex gap-4">
                <button 
                  onClick={() => handleSharePhoto(selectedImage)}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold uppercase tracking-wide rounded-xl flex items-center gap-2 shadow-md active:scale-95 transition-all"
                >
                  <Share2 size={20} /> Compartilhar
                </button>
                <button 
                  onClick={async () => {
                    try {
                      const response = await fetch(selectedImage);
                      const blob = await response.blob();
                      const objectUrl = URL.createObjectURL(blob);
                      
                      const link = document.createElement('a');
                      link.download = `BPA_PHOTO_${Date.now()}.jpeg`;
                      link.href = objectUrl;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      
                      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
                    } catch (e) {
                      console.error("Gallery download fallback:", e);
                      const link = document.createElement('a');
                      link.download = `BPA_PHOTO_${Date.now()}.jpeg`;
                      link.href = selectedImage;
                      link.click();
                    }
                  }}
                  className="px-6 py-3 bg-military-300 hover:bg-military-200 text-military-950 font-bold rounded-xl flex items-center gap-2 active:scale-95 transition-transform"
                >
                  <Download size={20} /> Baixar Foto
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-[#0c100b]/95 backdrop-blur-md p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-military-300" />
              <h2 className="text-xl font-bold uppercase tracking-tight">AJUSTES CAMERA</h2>
            </div>
            <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-military-800 rounded-lg">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-8">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-military-500 uppercase tracking-widest flex items-center gap-2">
                <MapPin size={10} /> Formato Coordenada
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['DMS', 'UTM'] as CoordFormat[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setSettings({ ...settings, coordFormat: f })}
                    className={`py-3 rounded-xl border-2 font-bold transition-all ${
                      settings.coordFormat === f ? 'bg-military-300 text-military-950 border-military-300' : 'bg-military-800 border-military-700 text-military-400'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-military-500 uppercase tracking-widest flex items-center gap-2">
                <Type size={10} /> Tamanho da Fonte
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Small', 'Medium', 'Large'] as FontSize[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setSettings({ ...settings, fontSize: s })}
                    className={`py-3 rounded-xl border-2 font-bold text-xs transition-all ${
                      settings.fontSize === s ? 'bg-military-300 text-military-950 border-military-300' : 'bg-military-800 border-military-700 text-military-400'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-military-500 uppercase tracking-widest flex items-center gap-2">
                 Legenda Personalizada
              </label>
              <input 
                type="text"
                value={settings.customText}
                onChange={(e) => setSettings({ ...settings, customText: e.target.value })}
                className="w-full bg-military-800 border-2 border-military-700 rounded-xl px-4 py-3 focus:outline-none focus:border-military-500"
              />
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-military-500 uppercase tracking-widest">
                Posição das Informações
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight'] as InfoPosition[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setSettings({ ...settings, position: p })}
                    className={`py-3 rounded-xl border-2 font-bold text-[10px] transition-all ${
                      settings.position === p ? 'bg-military-300 text-military-950 border-military-300' : 'bg-military-800 border-military-700 text-military-400'
                    }`}
                  >
                    {p === 'TopLeft' && 'SUP. ESQUERDO'}
                    {p === 'TopRight' && 'SUP. DIREITO'}
                    {p === 'BottomLeft' && 'INF. ESQUERDO'}
                    {p === 'BottomRight' && 'INF. DIREITO'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-military-800 rounded-2xl border border-military-700">
              <div className="flex items-center gap-3">
                <Eye className="w-5 h-5 text-military-400" />
                <span className="font-bold text-sm">Exibir Data e Hora</span>
              </div>
              <button 
                onClick={() => setSettings({ ...settings, showDateTime: !settings.showDateTime })}
                className={`w-12 h-6 rounded-full relative transition-colors ${settings.showDateTime ? 'bg-military-300' : 'bg-military-700'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.showDateTime ? 'right-1' : 'left-1'}`} />
              </button>
            </div>

            <button 
              onClick={() => {
                localStorage.setItem('bpa_camera_settings', JSON.stringify(settings));
                setShowSettings(false);
              }}
              className="w-full py-4 bg-military-300 text-military-950 font-black rounded-2xl shadow-xl flex items-center justify-center gap-2"
            >
              <Check size={20} /> SALVAR CONFIGURAÇÕES
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
