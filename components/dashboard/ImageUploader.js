'use client'

import { useState, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, ZoomIn, ZoomOut, Save, Trash2, Upload } from 'lucide-react';

export default function ImageUploader({ currentPhoto, onPhotoUpdate, displayName, isActive }) {
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const cropImageRef = useRef(null);
  
  const [showCropper, setShowCropper] = useState(false);
  const [imageSrc, setImageSrc] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showMenu, setShowMenu] = useState(false);

  const MAX_FILE_SIZE = 1.5 * 1024 * 1024;

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setShowMenu(false);

    if (file.size > MAX_FILE_SIZE) { toast.error('Image must be less than 1.5MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }

    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setCropPosition({ x: 0, y: 0 });
    setZoom(1);
    setImageLoaded(false);
    setShowCropper(true);
    e.target.value = '';
  };

  const handleRemovePhoto = async () => {
    if (!user) return;
    setShowMenu(false);
    setUploading(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { photo: '', updatedAt: new Date() });
      if (onPhotoUpdate) onPhotoUpdate(null);
      toast.success('Photo removed');
    } catch { toast.error('Failed to remove photo'); }
    finally { setUploading(false); }
  };

  const handleCropAndUpload = () => {
    const img = cropImageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !imageLoaded) { toast.error('Please wait'); return; }

    const outputSize = 300;
    const radius = outputSize / 2;
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, outputSize, outputSize);
    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.clip();

    const imgW = img.naturalWidth / zoom;
    const imgH = img.naturalHeight / zoom;
    const scale = Math.min(outputSize / imgW, outputSize / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const dx = (outputSize - drawW) / 2 - (cropPosition.x * scale / zoom);
    const dy = (outputSize - drawH) / 2 - (cropPosition.y * scale / zoom);

    try { ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, dx, dy, drawW, drawH); }
    catch { toast.error('Failed to crop'); return; }

    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      const base64Size = Math.round((dataUrl.length * 3) / 4);
      if (base64Size > 700 * 1024) { toast.error('Image too large'); return; }
      saveToFirestore(dataUrl);
    } catch { toast.error('Failed to process'); }
  };

  const saveToFirestore = async (dataUrl) => {
    if (!user) return;
    setUploading(true);
    setShowCropper(false);
    try {
      await updateDoc(doc(db, "users", user.uid), { photo: dataUrl, updatedAt: new Date() });
      if (onPhotoUpdate) onPhotoUpdate(dataUrl);
      toast.success('Photo updated!');
    } catch { toast.error('Failed to save'); }
    finally {
      setUploading(false);
      if (imageSrc) URL.revokeObjectURL(imageSrc);
      setImageSrc(null);
    }
  };

  const handleMouseDown = (e) => { setIsDragging(true); setDragStart({ x: e.clientX - cropPosition.x, y: e.clientY - cropPosition.y }); };
  const handleMouseMove = (e) => { if (!isDragging) return; setCropPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); };
  const handleMouseUp = () => setIsDragging(false);
  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - cropPosition.x, y: touch.clientY - cropPosition.y });
  };
  const handleTouchMove = (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    setCropPosition({ x: touch.clientX - dragStart.x, y: touch.clientY - dragStart.y });
  };
  const handleTouchEnd = () => setIsDragging(false);

  const closeCropper = () => {
    setShowCropper(false);
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageSrc(null);
    setImageLoaded(false);
    setError(null);
  };

  const getInitials = () => { const name = displayName || 'User'; return name.trim().charAt(0).toUpperCase() || '?'; };
  const getAvatarColor = () => {
    const colors = ['bg-blue-500','bg-red-500','bg-green-500','bg-purple-500','bg-pink-500','bg-indigo-500','bg-teal-500','bg-orange-500'];
    return colors[(displayName || 'User').charCodeAt(0) % colors.length];
  };

  return (
    <>
      {/* Centered Avatar */}
      <div className="flex flex-col items-center">
        <div 
          className="relative group cursor-pointer inline-block"
          onClick={() => setShowMenu(!showMenu)}
        >
          {/* Avatar Circle */}
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 mx-auto">
            {currentPhoto ? (
              <img 
                src={currentPhoto} 
                alt="" 
                referrerPolicy="no-referrer"
                className="w-full h-full rounded-full object-cover ring-4 ring-gray-100 shadow-lg"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.parentElement.innerHTML = `<div class="w-full h-full ${getAvatarColor()} rounded-full flex items-center justify-center text-3xl font-bold text-white ring-4 ring-gray-100 shadow-lg">${getInitials()}</div>`;
                }}
              />
            ) : (
              <div className={`w-full h-full ${getAvatarColor()} rounded-full flex items-center justify-center text-3xl font-bold text-white ring-4 ring-gray-100 shadow-lg`}>
                {getInitials()}
              </div>
            )}

            {/* Active Status Dot */}
            <span className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-3 border-white z-10 ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />

            {/* Hover Overlay */}
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
            </div>
          </div>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-xl border border-gray-200 py-1 z-50 min-w-[150px]"
              >
                <button
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Upload className="w-4 h-4 text-gray-500" /> Change Photo
                </button>
                {currentPhoto && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemovePhoto(); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Remove Photo
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />

      {error && !showCropper && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-3 rounded-xl shadow-lg z-50 text-sm font-medium">
          {error} <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Cropper Modal - works on mobile touch too */}
      <AnimatePresence>
        {showCropper && imageSrc && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) closeCropper(); }}
          >
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
              <div className="p-4 border-b flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">Adjust Photo</h3>
                <button onClick={closeCropper} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              <div 
                className="relative w-full h-72 bg-gray-900 overflow-hidden cursor-move touch-none"
                onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
              >
                {!imageLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="w-10 h-10 rounded-full border-3 border-white border-t-transparent animate-spin" />
                  </div>
                )}
                <img ref={cropImageRef} src={imageSrc} alt="Crop" onLoad={() => setImageLoaded(true)}
                  onError={() => { toast.error('Failed to load'); closeCropper(); }}
                  className="absolute max-w-none select-none" draggable={false}
                  style={{ transform: `translate(${cropPosition.x}px, ${cropPosition.y}px) scale(${zoom})`, transformOrigin: 'center center', width: '100%', top: '50%', left: '50%', marginLeft: '-50%', marginTop: '-50%' }}
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-56 h-56 rounded-full border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <div className="p-4 bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button onClick={() => setZoom(prev => Math.max(prev - 0.1, 0.5))} className="p-2 bg-white rounded-xl border border-gray-200 hover:bg-gray-100"><ZoomOut className="w-4 h-4 text-gray-600" /></button>
                  <span className="text-xs font-bold text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom(prev => Math.min(prev + 0.1, 3))} className="p-2 bg-white rounded-xl border border-gray-200 hover:bg-gray-100"><ZoomIn className="w-4 h-4 text-gray-600" /></button>
                </div>
                <button onClick={handleCropAndUpload} disabled={!imageLoaded} className="px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-black transition-colors flex items-center gap-2 disabled:opacity-50">
                  <Save className="w-4 h-4" /> Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}