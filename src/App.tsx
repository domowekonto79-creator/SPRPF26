import { useState, useCallback, useMemo, Fragment, useEffect } from 'react';
import { 
  FileUp, 
  Table as TableIcon, 
  Map as MapIcon, 
  CheckCircle2, 
  AlertCircle,
  X,
  GripVertical,
  ChevronRight,
  Download,
  Database,
  StickyNote,
  Edit2,
  Save,
  Upload,
  FileJson
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { 
  DndContext, 
  DragOverlay, 
  useDraggable, 
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent
} from '@dnd-kit/core';

import { cn } from './lib/utils';
import { RawData, TargetField, Mapping } from './types';

// Standardowe pola docelowe (można je później zmienić w UI)
const DEFAULT_TARGET_FIELDS: TargetField[] = [
  { id: 'first_name', name: 'Imię', required: true },
  { id: 'last_name', name: 'Nazwisko', required: true },
  { id: 'email', name: 'Email', required: true },
  { id: 'phone', name: 'Telefon' },
  { id: 'city', name: 'Miasto' },
  { id: 'total_spent', name: 'Kwota Wydana' },
];

/**
 * Draggable Column Item
 */
function DraggableColumn({ colIndex, name, isMapped }: { colIndex: number; name: string; isMapped: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `col-${colIndex}`,
    data: { colIndex, name }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 50,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-400 transition-colors group",
        isDragging && "opacity-50",
        isMapped && "bg-slate-50 border-dashed opacity-60"
      )}
    >
      <GripVertical className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
      <span className="text-sm font-medium text-slate-700 truncate">
        {name || `Kolumna ${colIndex + 1}`}
      </span>
    </div>
  );
}

/**
 * Droppable Target Field
 */
function DroppableField({ 
  field, 
  mappedColumn, 
  onUnmap 
}: { 
  field: TargetField; 
  mappedColumn?: { index: number; name: string };
  onUnmap: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `target-${field.id}`,
    data: { fieldId: field.id }
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative p-4 rounded-xl border-2 transition-all min-h-[100px] flex flex-col gap-2",
        isOver ? "border-blue-500 bg-blue-50 shadow-inner scale-[1.02]" : "border-slate-100 bg-slate-50/50",
        mappedColumn ? "border-emerald-200 bg-emerald-50/30" : "border-dashed"
      )}
    >
      <div className="flex justify-between items-center">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
          {field.name}
          {field.required && <span className="text-red-500">*</span>}
        </label>
        {mappedColumn && (
          <button 
            onClick={unmapField}
            type="button"
            className="p-1 hover:bg-emerald-100 rounded text-emerald-600 transition-colors pointer-events-auto"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {mappedColumn ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex items-center gap-2 p-2 bg-white border border-emerald-200 rounded-lg text-emerald-700 shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm font-semibold truncate">{mappedColumn.name}</span>
          </motion.div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 italic text-xs">
            Przeciągnij kolumnę tutaj
          </div>
        )}
      </AnimatePresence>
    </div>
  );

  function unmapField(e: React.MouseEvent) {
    e.stopPropagation();
    onUnmap();
  }
}

export default function App() {
  const [fileData, setFileData] = useState<RawData | null>(null);
  const [compareFilesData, setCompareFilesData] = useState<RawData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOnlyDifferences, setShowOnlyDifferences] = useState(false);
  const [viewTab, setViewTab] = useState<'raw' | 'processed'>('processed');
  const [searchQuery, setSearchQuery] = useState('');
  const [userNotes, setUserNotes] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('smartimport_pro_notes');
    return saved ? JSON.parse(saved) : {};
  });
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [tempNote, setTempNote] = useState('');

  useEffect(() => {
    localStorage.setItem('smartimport_pro_notes', JSON.stringify(userNotes));
  }, [userNotes]);

  const saveNote = (metricName: string) => {
    setUserNotes(prev => ({ ...prev, [metricName]: tempNote }));
    setEditingNote(null);
  };

  const startEditing = (metricName: string) => {
    setTempNote(userNotes[metricName] || '');
    setEditingNote(metricName);
  };

  const exportNotes = () => {
    // Create a base object with ALL current indicators from combinedRecords
    const exportData: Record<string, string> = {};
    
    // Add all indicators currently visible in the analysis
    combinedRecords.forEach(r => {
      exportData[r.name] = userNotes[r.name] || "";
    });

    // Also include any existing notes that might not be in the current view/file
    Object.keys(userNotes).forEach(key => {
      if (!(key in exportData)) {
        exportData[key] = userNotes[key];
      }
    });

    const dataStr = JSON.stringify(exportData, null, 2);
    // Use Blob with UTF-8 BOM to ensure Polish characters work in all editors
    const blob = new Blob(["\ufeff", dataStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_notatek_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importNotes = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const imported = JSON.parse(content);
        
        if (typeof imported === 'object' && imported !== null) {
          const keys = Object.keys(imported);
          setUserNotes(prev => ({ ...prev, ...imported }));
          alert(`Sukces! Zaimportowano notatki dla ${keys.length} wskaźników.`);
        } else {
          throw new Error('Nieprawidłowy format pliku');
        }
      } catch (err) {
        alert('Błąd podczas importu! Upewnij się, że plik jest poprawnym plikiem JSON wygenerowanym przez aplikację.');
      }
      e.target.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Universal processor for both files
  const processExcelData = (bstr: any, fileName: string) => {
    const wb = XLSX.read(bstr, { type: 'binary' });
    let sheetName = wb.SheetNames.find(name => name === 'I_01.02');
    if (!sheetName) sheetName = wb.SheetNames[wb.SheetNames.length - 1];
    
    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
    
    if (rawRows.length >= 5) {
      const dataRows = rawRows.slice(4);
      const maxCols = Math.max(...dataRows.map(r => r ? r.length : 0), 5);
      const headers = Array.from({ length: maxCols }, (_, i) => {
        let label = "";
        let j = i;
        while (j >= 0) {
          label = String.fromCharCode((j % 26) + 65) + label;
          j = Math.floor(j / 26) - 1;
        }
        return label;
      });

      return {
        fileName,
        headers,
        rows: dataRows
      };
    }
    return null;
  };

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const reader = new FileReader();

    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const data = processExcelData(bstr, file.name);
      if (data) {
        setFileData(data);
        setViewTab('processed');
      }
      setIsProcessing(false);
    };
    reader.readAsBinaryString(file);
  }, []);

  const handleCompareUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (compareFilesData.length >= 5) {
      alert("Można dodać maksymalnie 5 plików do porównania.");
      return;
    }

    setIsProcessing(true);
    const reader = new FileReader();

    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const data = processExcelData(bstr, file.name);
      if (data) {
        setCompareFilesData(prev => [...prev, data]);
      }
      setIsProcessing(false);
    };
    reader.readAsBinaryString(file);
    // Reset input
    e.target.value = '';
  }, [compareFilesData]);

  const removeCompareFile = (index: number) => {
    setCompareFilesData(prev => prev.filter((_, i) => i !== index));
  };

  // Inteligentne przetwarzanie rekordów (Mierników)
  const extractRecords = (data: RawData | null) => {
    if (!data) return [];

    const records: { name: string; value: string; note: string }[] = [];
    let currentRecord: { name: string; value: string; note: string } | null = null;

    data.rows.forEach(row => {
      if (!row) return;

      const colCRaw = row[2];
      const colERaw = row[4];
      
      const colC = (colCRaw !== undefined && colCRaw !== null) ? colCRaw.toString().trim() : '';
      const colE = (colERaw !== undefined && colERaw !== null) ? colERaw.toString().trim() : '';

      if (colC === '' && colE === '') return;
      
      const normC = colC.toLowerCase();
      if (normC === 'nazwa miernika' || normC === 'legenda' || normC === 'spis treści') return;

      const isValueLabel = normC.includes('wartość') || normC.includes('wynik');
      const isNoteLabel = normC.includes('wyjaśnienie') || normC.includes('brak') || normC.includes('notatka');

      if (colC !== '' && !isValueLabel && !isNoteLabel) {
        if (currentRecord) records.push(currentRecord);
        currentRecord = { name: colC, value: '-', note: '-' };
      } 
      else if (currentRecord) {
        if (isValueLabel) {
          currentRecord.value = colE === '' ? '-' : colE;
        } else if (isNoteLabel) {
          currentRecord.note = colE === '' ? '-' : colE;
        }
      }
    });

    if (currentRecord) records.push(currentRecord);
    return records;
  };

  const processedRecords = useMemo(() => extractRecords(fileData), [fileData]);

  const combinedRecords = useMemo(() => {
    // Each record will have a 'comparisons' array matching the index of compareFilesData
    return processedRecords.map(r => {
      const comparisons = compareFilesData.map(compareData => {
        const cRecords = extractRecords(compareData);
        const match = cRecords.find(cr => cr.name.toLowerCase() === r.name.toLowerCase());
        return {
          value: match ? match.value : '-',
          note: match ? match.note : '-'
        };
      });

      return {
        ...r,
        comparisons
      };
    });
  }, [processedRecords, compareFilesData]);

  const filteredRecords = useMemo(() => {
    let result = combinedRecords;

    if (showOnlyDifferences && compareFilesData.length > 0) {
      result = result.filter(r => 
        r.comparisons.some(c => c.value !== r.value)
      );
    }

    if (!searchQuery) return result;
    const q = searchQuery.toLowerCase();
    return result.filter(r => 
      r.name.toLowerCase().includes(q) || 
      r.value.toLowerCase().includes(q) || 
      r.note.toLowerCase().includes(q) ||
      (userNotes[r.name] && userNotes[r.name].toLowerCase().includes(q)) ||
      r.comparisons.some(c => 
        c.value.toLowerCase().includes(q) || 
        c.note.toLowerCase().includes(q)
      )
    );
  }, [combinedRecords, searchQuery, showOnlyDifferences, compareFilesData.length, userNotes]);

  const downloadCSV = () => {
    if (!processedRecords.length) return;
    
    const csv = Papa.unparse({
      fields: ["Nazwa Miernika", "Wartość", "Wyjaśnienie"],
      data: processedRecords.map(r => [r.name, r.value, r.note])
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `import_miernikow_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const reset = () => {
    setFileData(null);
    setCompareFilesData([]);
    setSearchQuery('');
    setShowOnlyDifferences(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-zinc-200">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-slate-900 rounded-lg shadow-sm">
              <FileUp className="w-6 h-6 text-white" />
            </div>
            <div className="space-y-0.5">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Raport <span className="text-indigo-600">KNF SPRPF26 i 27</span>
              </h1>
              <p className="text-[13px] text-slate-500 font-medium">Automatyczny ekstraktor danych z arkuszy Excel</p>
            </div>
          </div>
          
          {fileData && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={downloadCSV}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-all active:scale-95 shadow-sm"
              >
                <Download className="w-4 h-4" />
                Pobierz CSV
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={exportNotes}
                  className="inline-flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-slate-600 bg-white hover:bg-slate-50 rounded-md border border-slate-200 transition-all active:scale-95 whitespace-nowrap shadow-sm"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  Eksportuj notatki
                </button>
                <div className="relative">
                  <input
                    type="file"
                    accept=".json"
                    onChange={importNotes}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <button
                    className="inline-flex items-center gap-2 px-3 py-2 text-[11px] font-bold text-slate-600 bg-white hover:bg-slate-50 rounded-md border border-slate-200 transition-all active:scale-95 whitespace-nowrap w-full shadow-sm"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Importuj notatki
                  </button>
                </div>
              </div>
              
              <div className="relative">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleCompareUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  id="compare-upload"
                />
                <button
                  disabled={compareFilesData.length >= 5}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-slate-700 bg-white hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-md border border-slate-200 transition-all active:scale-95 shadow-sm"
                >
                  <FileUp className="w-4 h-4" />
                  {compareFilesData.length > 0 ? "Dodaj kolejny plik" : "Porównaj pliki"}
                </button>
              </div>

              <button
                onClick={reset}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-md transition-all"
              >
                <X className="w-4 h-4" />
                Zmień plik
              </button>
            </div>
          )}
        </header>

        {!fileData ? (
          /* Step 1: Upload */
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative group h-[450px]"
          >
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="h-full border border-dashed border-zinc-300 group-hover:border-indigo-500 bg-white rounded-xl flex flex-col items-center justify-center gap-8 transition-all duration-300 shadow-sm overflow-hidden">
              <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] pointer-events-none" />
              <div className="relative">
                <div className="p-8 bg-zinc-50 rounded-2xl group-hover:bg-indigo-50 transition-colors border border-zinc-100 group-hover:border-indigo-100">
                  <FileUp className="w-12 h-12 text-zinc-400 group-hover:text-indigo-600 transition-colors" />
                </div>
              </div>
              <div className="text-center space-y-2 relative">
                <h3 className="text-xl font-bold text-slate-900 px-4">Wybierz plik Excel do obróbki</h3>
                <p className="text-slate-500 text-sm max-w-sm mx-auto leading-relaxed px-4">
                  Automatycznie pobieramy dane z zakładki <span className="font-semibold text-slate-700">I_01.02</span>,<br />
                  skanując kolumny <span className="font-semibold text-slate-700">C, D, E</span> od 5. wiersza.
                </p>
              </div>
              <div className="flex gap-2 relative">
                <span className="px-3 py-1 bg-zinc-100 text-zinc-500 text-[10px] font-bold uppercase tracking-widest rounded border border-zinc-200">System Expert Edition</span>
              </div>
            </div>
          </motion.div>
        ) : (
          /* Step 2: Immediate Preview */
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Stats Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-5 rounded-xl border border-zinc-200 shadow-sm flex items-center gap-4">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
                  <TableIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Liczba mierników</p>
                  <p className="text-lg font-bold text-slate-900">{processedRecords.length}</p>
                </div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-zinc-200 shadow-sm flex items-center gap-4">
                <div className="p-2.5 bg-slate-50 text-slate-600 rounded-lg">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Wierszy w arkuszu</p>
                  <p className="text-lg font-bold text-slate-900">{fileData.rows.length}</p>
                </div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-zinc-200 shadow-sm flex items-center gap-4">
                <div className="p-2.5 bg-zinc-50 text-zinc-600 rounded-lg">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Źródło</p>
                  <p className="text-sm font-semibold truncate max-w-[150px] text-slate-900">{fileData.fileName}</p>
                </div>
              </div>
            </div>

            {/* Main Table Preview */}
            <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
              <div className="p-6 border-b border-zinc-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-slate-900 leading-none">Wynik importu</h2>
                    <span className="px-2 py-0.5 bg-zinc-100 text-zinc-500 text-[10px] font-bold rounded uppercase tracking-wide border border-zinc-200">Podgląd na żywo</span>
                  </div>
                </div>

                <div className="flex bg-zinc-100 p-1 rounded-lg border border-zinc-200 shadow-sm">
                  <button
                    onClick={() => setViewTab('processed')}
                    className={cn(
                      "px-5 py-1.5 rounded-md text-[11px] font-bold transition-all uppercase tracking-widest",
                      viewTab === 'processed' ? "bg-white text-indigo-600 shadow-sm shadow-zinc-200" : "text-zinc-500 hover:text-zinc-700"
                    )}
                  >
                    Analiza Mierników
                  </button>
                  <button
                    onClick={() => setViewTab('raw')}
                    className={cn(
                      "px-5 py-1.5 rounded-md text-[11px] font-bold transition-all uppercase tracking-widest",
                      viewTab === 'raw' ? "bg-white text-indigo-600 shadow-sm shadow-zinc-200" : "text-zinc-500 hover:text-zinc-700"
                    )}
                  >
                    Surowe Dane
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto min-h-[400px]">
                <AnimatePresence mode="wait">
                  {viewTab === 'processed' ? (
                    <motion.div
                      key="processed"
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 5 }}
                      className="p-6 space-y-6"
                    >
                      {/* Search Bar */}
                      <div className="relative group">
                        <X 
                          className={cn("absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 cursor-pointer hover:text-red-500 transition-colors z-20", !searchQuery && "hidden")} 
                          onClick={() => setSearchQuery('')} 
                        />
                        <input 
                          type="text" 
                          placeholder="Filtruj mierniki (nazwa, wartość...)" 
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-6 pr-12 py-3 bg-zinc-50 border border-zinc-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:font-normal placeholder:text-zinc-400"
                        />
                      </div>

                      {compareFilesData.length > 0 && (
                        <div className="flex items-center gap-3 px-1">
                          <button
                            onClick={() => setShowOnlyDifferences(!showOnlyDifferences)}
                            className={cn(
                              "relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                              showOnlyDifferences ? "bg-indigo-600" : "bg-zinc-200"
                            )}
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                                showOnlyDifferences ? "translate-x-4" : "translate-x-0"
                              )}
                            />
                          </button>
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Pokaż tylko różnice</span>
                        </div>
                      )}

                      <div className="space-y-1">
                        <div className="sticky top-0 z-20 bg-zinc-50/95 backdrop-blur-sm p-3 -mx-2 px-6 border-y border-zinc-200 flex flex-col md:flex-row gap-6 items-center">
                          <div className="flex-1 min-w-[200px]">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">Miernik / Notatka</span>
                          </div>
                          <div className="flex items-center gap-0 shrink-0 overflow-x-auto scrollbar-none">
                            <div className="w-[240px] flex flex-col md:border-l md:border-zinc-200 px-4">
                              <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest block truncate text-center mb-2 px-2 py-1 bg-white rounded border border-zinc-200 shadow-sm" title={fileData?.fileName}>
                                {fileData?.fileName}
                              </span>
                              <div className="grid grid-cols-[80px_120px] gap-4 px-2">
                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-tight text-center">Wartość</span>
                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-tight">Wyjaśnienie</span>
                              </div>
                            </div>
                            
                            {compareFilesData.map((file, cIdx) => (
                              <Fragment key={cIdx}>
                                <div className="w-[1px] h-10 bg-zinc-200 shrink-0 self-center" />
                                <div className="w-[240px] flex flex-col px-4 shrink-0">
                                  <div className="flex items-center justify-between gap-2 mb-2 px-2 py-1 bg-indigo-50/50 rounded border border-indigo-100">
                                    <span className="text-[10px] font-bold text-indigo-700 truncate max-w-[140px] uppercase tracking-tight" title={file.fileName}>
                                      {file.fileName}
                                    </span>
                                    <button 
                                      onClick={() => removeCompareFile(cIdx)}
                                      className="p-1 hover:bg-red-500 hover:text-white text-indigo-400 bg-white border border-indigo-100 rounded transition-all active:scale-95 shrink-0"
                                      title="Usuń"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-[80px_120px] gap-4 px-2">
                                    <span className="text-[9px] font-bold text-indigo-400/80 uppercase tracking-tight text-center">Wartość</span>
                                    <span className="text-[9px] font-bold text-indigo-400/80 uppercase tracking-tight">Wyjaśnienie</span>
                                  </div>
                                </div>
                              </Fragment>
                            ))}
                          </div>
                        </div>

                        {filteredRecords.map((record, idx) => (
                          <div key={idx} className="group p-3 bg-white hover:bg-zinc-50 rounded-lg border-b border-zinc-100 transition-all flex flex-col md:flex-row gap-6 items-start md:items-center overflow-hidden">
                            <div className="flex-1 space-y-1 min-w-[200px] pl-2">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[9px] font-bold text-zinc-400 bg-white px-1.5 py-0.5 rounded border border-zinc-200 uppercase tracking-tight">Miernik</span>
                                
                                <div className="relative group/note">
                                  {editingNote === record.name ? (
                                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded p-1 shadow-sm">
                                      <input 
                                        type="text" 
                                        value={tempNote}
                                        onChange={(e) => setTempNote(e.target.value)}
                                        placeholder="Dodaj notatkę..."
                                        className="text-[10px] font-medium outline-none px-1 w-36 bg-transparent"
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && saveNote(record.name)}
                                      />
                                      <button onClick={() => saveNote(record.name)} className="text-emerald-600 hover:text-emerald-700">
                                        <Save size={12} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <button 
                                        onClick={() => startEditing(record.name)}
                                        className={cn(
                                          "p-1 rounded transition-all",
                                          userNotes[record.name] ? "bg-indigo-600 text-white shadow-sm" : "text-zinc-300 hover:text-indigo-600 hover:bg-indigo-50"
                                        )}
                                      >
                                        <StickyNote size={12} />
                                      </button>
                                      
                                      {userNotes[record.name] && (
                                        <div className="absolute left-full ml-3 invisible group-hover/note:visible opacity-0 group-hover/note:opacity-100 transition-all z-50 bg-slate-900 border border-slate-700 text-white text-[11px] py-3 px-4 rounded-lg shadow-xl min-w-[200px] pointer-events-none">
                                          <p className="font-bold mb-1.5 border-b border-slate-800 pb-1.5 text-[9px] text-indigo-400 uppercase tracking-widest">
                                            Twoja Notatka
                                          </p>
                                          <span className="leading-relaxed opacity-90">{userNotes[record.name]}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <h4 className="text-slate-900 font-semibold leading-snug text-[13px]">{record.name}</h4>
                            </div>
                            
                            <div className="flex items-center gap-0 shrink-0 w-full md:w-auto overflow-x-auto md:pb-0 scrollbar-none">
                              <div className="grid grid-cols-[80px_120px] gap-4 w-[240px] px-4 md:border-l md:border-zinc-100 items-center">
                                <div className="text-center">
                                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1 md:hidden text-center">Wartość</p>
                                  <p className={cn(
                                    "text-sm font-bold",
                                    record.value !== '-' ? "text-slate-950 font-extrabold" : "text-zinc-300"
                                  )}>{record.value}</p>
                                </div>
                                
                                <div>
                                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1 md:hidden">Wyjaśnienie</p>
                                  <p className="text-[11px] text-slate-500 font-medium italic leading-snug line-clamp-2" title={record.note}>
                                    {record.note || '-'}
                                  </p>
                                </div>
                              </div>
                              
                              {record.comparisons.map((comp, cIdx) => (
                                <Fragment key={cIdx}>
                                  <div className="w-[1px] h-8 bg-zinc-100 self-center shrink-0" />
                                  <div className="grid grid-cols-[80px_120px] gap-4 w-[240px] px-4 items-center">
                                    <div className="text-center">
                                      <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1 md:hidden">Wartość</p>
                                      <p className={cn(
                                        "text-sm font-bold",
                                        comp.value !== '-' ? "text-indigo-600" : "text-zinc-300"
                                      )}>{comp.value}</p>
                                    </div>
                                    
                                    <div>
                                      <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1 md:hidden">Wyjaśnienie</p>
                                      <p className="text-[11px] text-slate-500/80 font-medium italic leading-snug line-clamp-2" title={comp.note}>
                                        {comp.note || '-'}
                                      </p>
                                    </div>
                                  </div>
                                </Fragment>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {filteredRecords.length === 0 && (
                        <div className="py-24 text-center">
                          <AlertCircle className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
                          <p className="text-zinc-400 text-sm font-medium">Nie znaleziono mierników spełniających kryteria.</p>
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.table
                      key="raw"
                      initial={{ opacity: 0, x: 5 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -5 }}
                      className="w-full text-left border-separate border-spacing-0"
                    >
                      <thead>
                        <tr className="bg-zinc-50/50">
                          <th className="sticky left-0 bg-zinc-50 border-r border-zinc-200 px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] border-b w-16 text-center">#</th>
                          {fileData.headers.map((h, i) => (
                            <th key={i} className="px-8 py-4 text-[11px] font-bold text-slate-700 uppercase tracking-[0.1em] border-b border-zinc-200">
                              <div className="flex items-center gap-2">
                                <span className={cn("w-1.5 h-1.5 rounded-full", [2,3,4].includes(i) ? "bg-indigo-500" : "bg-zinc-300")} />
                                {h}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fileData.rows.map((row, rowIdx) => (
                          <tr key={rowIdx} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="sticky left-0 bg-white group-hover:bg-zinc-50 px-6 py-3 text-[10px] font-bold text-zinc-400 border-b border-r border-zinc-200 text-center">
                              {rowIdx + 5}
                            </td>
                            {fileData.headers.map((_, colIdx) => (
                              <td key={colIdx} className={cn(
                                "px-8 py-3 text-[12px] border-b border-zinc-100 max-w-[300px] truncate transition-colors",
                                [2,3,4].includes(colIdx) ? "bg-indigo-50/10 font-bold text-slate-950" : "text-zinc-500"
                              )}>
                                {row[colIdx]?.toString() || <span className="opacity-10 italic">null</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </motion.table>
                  )}
                </AnimatePresence>
              </div>
              
              {fileData.rows.length === 0 && (
                <div className="p-20 flex flex-col items-center justify-center text-center gap-4">
                  <AlertCircle className="w-10 h-10 text-zinc-200" />
                  <p className="text-zinc-400 font-bold uppercase tracking-widest text-[10px]">Brak danych w wybranym arkuszu</p>
                </div>
              )}
            </div>

            <p className="text-center text-[10px] text-zinc-400 font-bold uppercase tracking-widest opacity-80 pb-8">
              Algorytm Ekstrakcji v4.2 • I_01.02 • Col C-E • Start Row 5
            </p>
          </motion.div>
        )}

      </div>

      {/* Processing Backdrop */}
      {isProcessing && (
        <div className="fixed inset-0 bg-slate-950/20 backdrop-blur-sm z-[2000] flex items-center justify-center">
          <div className="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-6 text-center border border-zinc-200">
            <div className="relative">
              <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
            </div>
            <div className="space-y-1">
              <p className="text-slate-950 font-bold text-base">Analiza danych...</p>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Ekstrakcja struktury KNF SPRPF</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
