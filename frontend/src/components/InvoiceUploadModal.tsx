import React, { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  FileText,
  AlertCircle,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Props {
  onClose: () => void;
  onSuccess: (invoiceId: string) => void;
}

export const InvoiceUploadModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const { authFetch } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadStep, setUploadStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const validateAndSetFile = (file: File) => {
    setError(null);
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setError('Invalid file format. Please upload a PDF, PNG, or JPG invoice.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds the 10 MB limit.');
      return;
    }
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError(null);
    setUploadStep('Uploading document to secure AP vault...');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      setTimeout(() => {
        setUploadStep('Extracting text (PDF / Tesseract OCR engine)...');
      }, 700);

      setTimeout(() => {
        setUploadStep('Parsing structured fields & computing per-field confidence...');
      }, 1800);

      const res = await authFetch('/api/invoices/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (res.ok && data.invoice) {
        setUploadStep('Extraction complete!');
        setTimeout(() => {
          onSuccess(data.invoice.id);
        }, 600);
      } else {
        setError(data.message || 'Invoice upload failed');
        setUploading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Network upload error');
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-950 border border-sky-800 flex items-center justify-center text-sky-400">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Upload Inward Invoice</h3>
              <p className="text-[11px] text-slate-400">PDF, PNG, JPG (Max 10 MB)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={uploading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-200 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Drag & Drop Zone */}
        {!uploading ? (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 ${
              dragActive
                ? 'border-sky-500 bg-sky-950/30'
                : selectedFile
                ? 'border-emerald-600 bg-emerald-950/20'
                : 'border-slate-800 hover:border-slate-700 bg-slate-900/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileChange}
              className="hidden"
            />

            {selectedFile ? (
              <div className="space-y-1">
                <FileText className="w-10 h-10 text-emerald-400 mx-auto" />
                <div className="text-xs font-bold text-white">{selectedFile.name}</div>
                <div className="text-[11px] text-slate-400">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB &bull; Ready for extraction
                </div>
                <span className="text-[10px] text-sky-400 hover:underline inline-block mt-1">
                  Click to choose a different file
                </span>
              </div>
            ) : (
              <div className="space-y-1">
                <UploadCloud className="w-10 h-10 text-slate-500 mx-auto" />
                <div className="text-xs font-semibold text-slate-200">
                  Drag and drop invoice document here, or <span className="text-sky-400">browse</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  Supported: PDF (digital or scanned), PNG, JPG &bull; Max 10MB
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 px-4 bg-slate-900/80 border border-slate-800 rounded-2xl text-center space-y-3">
            <div className="w-10 h-10 rounded-full border-2 border-sky-400 border-t-transparent animate-spin mx-auto" />
            <div className="text-xs font-semibold text-white flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
              {uploadStep}
            </div>
            <div className="text-[10px] text-slate-400">
              Generating field confidences and writing hash-chained audit record...
            </div>
          </div>
        )}

        {/* Quick Sample Files Shortcut */}
        {!uploading && (
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400 block">Test Documents:</span>
            <div className="text-[10px] text-slate-400 font-mono space-y-1">
              <div>&bull; <code className="text-sky-300">sample-data/invoices/INV-101.pdf</code> (Supplier A, PO-101, 100kg wood)</div>
              <div>&bull; <code className="text-sky-300">sample-data/invoices/INV-HIST-01.pdf</code> (Overbilling surcharge pattern)</div>
              <div>&bull; <code className="text-amber-300">sample-data/invoices/INV-SCAN-01.pdf</code> (Scanned look, low confidence/missing PO)</div>
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-medium border border-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="inline-flex items-center gap-2 px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-sky-600/20 transition disabled:opacity-50"
          >
            <span>Start Extraction</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceUploadModal;
