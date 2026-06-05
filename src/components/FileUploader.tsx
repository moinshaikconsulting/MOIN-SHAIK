import React, { useState, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, Trash2, CheckCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

// Custom robust CSV parser to avoid third-party issues with Vite/HMR
function parseCSV(text: string): Record<string, any>[] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
      if (char === '\r' && text[i + 1] === '\n') {
        i++;
      }
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  if (lines.length === 0) return [];

  const parseCSVLine = (line: string): string[] => {
    const fields: string[] = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQ = !inQ;
      } else if (char === ',' && !inQ) {
        fields.push(field.trim().replace(/^"|"$/g, '').trim());
        field = '';
      } else {
        field += char;
      }
    }
    fields.push(field.trim().replace(/^"|"$/g, '').trim());
    return fields;
  };

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, any> = {};
    headers.forEach((h, idx) => {
      if (h) {
        row[h] = values[idx] !== undefined && values[idx] !== '' ? values[idx] : null;
      }
    });
    rows.push(row);
  }

  return rows;
}

interface FileUploaderProps {
  label: string;
  onDataLoaded: (fileName: string, headers: string[], rows: any[]) => void;
  onClear: () => void;
  required?: boolean;
}

export default function FileUploader({ label, onDataLoaded, onClear, required }: FileUploaderProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [columnCount, setColumnCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    setError(null);
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension !== 'csv' && extension !== 'xlsx' && extension !== 'xls') {
      setError('Unsupported file type. Please upload a CSV or Excel file.');
      return;
    }

    const reader = new FileReader();

    if (extension === 'csv') {
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const rows = parseCSV(text);
          if (rows.length === 0) {
            throw new Error('CSV file is empty or lacks headers.');
          }
          const headers = Object.keys(rows[0]);
          setFileName(file.name);
          setRowCount(rows.length);
          setColumnCount(headers.length);
          onDataLoaded(file.name, headers, rows);
        } catch (err: any) {
          setError(err.message || 'Failed to parse CSV file.');
        }
      };
      reader.readAsText(file);
    } else {
      // Excel sheets
      reader.onload = (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          const data = new Uint8Array(buffer);
          const workbook = XLSX.read(data, { type: 'array' });
          
          if (workbook.SheetNames.length === 0) {
            throw new Error('Workbook lacks spreadsheet worksheets.');
          }
          
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: null });
          
          if (rows.length === 0) {
            throw new Error('Spreadsheet workspace is blank or missing header labels.');
          }

          const headers = Object.keys(rows[0]);
          setFileName(file.name);
          setRowCount(rows.length);
          setColumnCount(headers.length);
          onDataLoaded(file.name, headers, rows);
        } catch (err: any) {
          setError(err.message || 'Failed to parse Excel sheet.');
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleRemove = () => {
    setFileName(null);
    setRowCount(null);
    setColumnCount(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClear();
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
          {label}
          {required && <span className="text-indigo-400 font-bold">*</span>}
        </label>
        {fileName && (
          <button
            onClick={handleRemove}
            className="text-xs text-rose-300 hover:text-rose-250 hover:bg-rose-950/40 border border-rose-900/30 transition flex items-center gap-1 bg-rose-950/20 px-2.5 py-1 rounded-lg cursor-pointer font-semibold"
          >
            <Trash2 size={13} />
            Remove Raw File
          </button>
        )}
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={fileName ? undefined : triggerFileSelect}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer flex flex-col items-center justify-center min-h-[145px] ${
          fileName
            ? 'border-emerald-500/30 bg-white/[0.04] backdrop-blur-md text-emerald-250 cursor-default shadow-inner'
            : isDragging
            ? 'border-white bg-white/18 backdrop-blur-md shadow-[0_8px_32px_0_rgba(255,255,255,0.1)]'
            : 'border-white/15 hover:border-white/35 bg-white/5 hover:bg-white/10 backdrop-blur-md shadow-[0_8px_32px_0_rgba(255,255,255,0.02)]'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".csv, .xlsx, .xls"
          className="hidden"
        />

        {fileName ? (
          <div className="flex flex-col items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-inner">
              <CheckCircle size={22} />
            </div>
            <div className="max-w-[280px]">
              <p className="text-sm font-semibold text-emerald-250 truncate" title={fileName}>
                {fileName}
              </p>
              <div className="flex items-center justify-center gap-2 mt-1.5 text-xs text-slate-400 font-mono">
                <span className="bg-emerald-950/50 text-emerald-355 border border-emerald-900/30 px-1.5 py-0.5 rounded font-sans font-semibold uppercase text-[10px]">
                  {fileName.split('.').pop()}
                </span>
                <span>•</span>
                <span>{rowCount} rows</span>
                <span>•</span>
                <span>{columnCount} cols</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mb-3 shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.2)]">
              <UploadCloud size={24} className="text-white" />
            </div>
            <p className="text-sm font-medium text-slate-200">Drag & drop your file here, or <span className="text-emerald-450 hover:text-emerald-300 font-bold transition-all underline decoration-dashed decoration-1 underline-offset-4">browse</span></p>
            <p className="text-xs text-slate-450 mt-1.5">Supports CSV, Excel (.xlsx, .xls) files</p>
          </div>
        )}
      </div>

      {error && <span className="text-xs font-semibold text-rose-450 mt-1">{error}</span>}
    </div>
  );
}
