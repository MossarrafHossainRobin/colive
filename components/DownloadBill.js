'use client'

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileImage, FileText, Printer, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { captureElement } from '@/lib/downloadHelper';

export default function DownloadBill({ targetRef, fileName, title, author }) {
  const [showMenu, setShowMenu] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [done, setDone] = useState(false);

  const downloadPNG = useCallback(async () => {
    if (!targetRef?.current) return;
    setShowMenu(false);
    setIsProcessing(true);
    try {
      const canvas = await captureElement(targetRef.current, 2);
      // Direct download - no popup
      const link = document.createElement('a');
      link.download = `${fileName}.png`;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDone(true);
      toast.success('PNG downloaded!');
      setTimeout(() => setDone(false), 2000);
    } catch (e) {
      console.error(e);
      toast.error('Download failed');
    } finally {
      setIsProcessing(false);
    }
  }, [targetRef, fileName]);

  const downloadPDF = useCallback(async () => {
    if (!targetRef?.current) return;
    setShowMenu(false);
    setIsProcessing(true);
    try {
      const canvas = await captureElement(targetRef.current, 2);
      const imgData = canvas.toDataURL('image/png');
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height * w) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, w, h);
      // Direct download - no popup
      pdf.save(`${fileName}.pdf`);
      setDone(true);
      toast.success('PDF downloaded!');
      setTimeout(() => setDone(false), 2000);
    } catch (e) {
      console.error(e);
      toast.error('Download failed');
    } finally {
      setIsProcessing(false);
    }
  }, [targetRef, fileName]);

  const handlePrint = useCallback(() => {
    setShowMenu(false);
    window.print();
  }, []);

  return (
    <div className="relative">
      <button onClick={() => setShowMenu(!showMenu)} disabled={isProcessing}
        className={`p-2 sm:p-2.5 rounded-xl transition-all duration-200 disabled:opacity-50 ${done ? 'bg-green-100 text-green-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
        {isProcessing ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : 
         done ? <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" /> : 
         <Download className="w-4 h-4 sm:w-5 sm:h-5" />}
      </button>
      <AnimatePresence>
        {showMenu && (
          <motion.div initial={{ opacity: 0, scale: 0.95, y: -5 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -5 }}
            className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-50">
            <button onClick={downloadPNG} className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><FileImage className="w-4 h-4 text-blue-600" /> Download PNG</button>
            <button onClick={downloadPDF} className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><FileText className="w-4 h-4 text-red-600" /> Download PDF</button>
            <div className="border-t border-gray-100 my-1" />
            <button onClick={handlePrint} className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><Printer className="w-4 h-4 text-gray-600" /> Print</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}