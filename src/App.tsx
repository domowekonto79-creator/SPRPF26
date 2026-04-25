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
    const dataStr = JSON.stringify(userNotes, null, 2);
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
          setUserNotes(prev => ({ ...prev, ...imported }));
          alert('Notatki zostały pomyślnie zaimportowane.');
        } else {
          throw new Error('Nieprawidłowy format pliku');
        }
      } catch (err) {
        alert('Błąd podczas importu notatek. Upewnij się, że plik jest poprawnym plikiem JSON.');
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
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
              <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-200">
                <FileUp className="w-6 h-6 text-white" />
              </div>
              SmartImport <span className="text-blue-600">Pro</span>
            </h1>
            <p className="text-slate-500 font-medium">Automatyczny ekstraktor danych z arkuszy Excel</p>
          </div>
          
          {fileData && (
            <div className="flex gap-3">
              <button
                onClick={downloadCSV}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg shadow-blue-100 transition-all active:scale-95"
              >
                <Download className="w-4 h-4" />
                Pobierz CSV
              </button>

              <div className="flex flex-col gap-2">
                <button
                  onClick={exportNotes}
                  className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-full border border-emerald-200 transition-all active:scale-95 whitespace-nowrap"
                >
                  <FileJson className="w-3 h-3" />
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
                    className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-full border border-amber-200 transition-all active:scale-95 whitespace-nowrap w-full"
                  >
                    <Upload className="w-3 h-3" />
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
                  className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-full border border-blue-200 transition-all active:scale-95"
                >
                  <FileUp className="w-4 h-4" />
                  {compareFilesData.length > 0 ? "Dodaj kolejny plik do porównania" : "Importuj plik do porównania"}
                </button>
              </div>

              <button
                onClick={reset}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-red-600 bg-white border border-slate-200 rounded-full shadow-sm hover:shadow-md transition-all"
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
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative group h-[500px]"
          >
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="h-full border-2 border-dashed border-slate-300 group-hover:border-blue-500 bg-white rounded-[2rem] flex flex-col items-center justify-center gap-8 transition-all duration-300 shadow-xl shadow-slate-200/50">
              <div className="relative">
                <div className="absolute -inset-4 bg-blue-100 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative p-8 bg-blue-50 rounded-3xl group-hover:bg-blue-100 transition-colors">
                  <FileUp className="w-16 h-16 text-blue-600" />
                </div>
              </div>
              <div className="text-center space-y-3">
                <h3 className="text-2xl font-black">Wybierz plik Excel do obróbki</h3>
                <p className="text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Automatycznie pobieramy dane z zakładki <span className="font-bold text-slate-600">I_01.02</span>,<br />
                  skanując kolumny <span className="font-bold text-slate-600">C, D, E</span> od 5. wiersza.
                </p>
              </div>
              <div className="flex gap-2">
                <span className="px-4 py-1.5 bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-full">System Expert Edition</span>
              </div>
            </div>
          </motion.div>
        ) : (
          /* Step 2: Immediate Preview */
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Stats Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                  <TableIcon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Liczba mierników</p>
                  <p className="text-xl font-black">{processedRecords.length}</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Wierszy w arkuszu</p>
                  <p className="text-xl font-black">{fileData.rows.length}</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-slate-50 text-slate-600 rounded-2xl">
                  <Download className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Źródło</p>
                  <p className="text-sm font-bold truncate max-w-[150px]">{fileData.fileName}</p>
                </div>
              </div>
            </div>

            {/* Main Table Preview */}
            <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-black">Wynik importu</h2>
                    <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full uppercase tracking-tighter">Podgląd na żywo</span>
                  </div>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-2xl">
                  <button
                    onClick={() => setViewTab('processed')}
                    className={cn(
                      "px-6 py-2 rounded-xl text-xs font-black transition-all uppercase tracking-widest",
                      viewTab === 'processed' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Analiza Mierników
                  </button>
                  <button
                    onClick={() => setViewTab('raw')}
                    className={cn(
                      "px-6 py-2 rounded-xl text-xs font-black transition-all uppercase tracking-widest",
                      viewTab === 'raw' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Surowe Dane (Pełne)
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto min-h-[400px]">
                <AnimatePresence mode="wait">
                  {viewTab === 'processed' ? (
                    <motion.div
                      key="processed"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="p-8 space-y-6"
                    >
                      {/* Search Bar */}
                      <div className="relative">
                        <X className={cn("absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 cursor-pointer hover:text-red-500 transition-colors", !searchQuery && "hidden")} onClick={() => setSearchQuery('')} />
                        <input 
                          type="text" 
                          placeholder="Filtruj mierniki (nazwa, wartość...)" 
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-6 pr-12 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                        />
                      </div>

                      {compareFilesData.length > 0 && (
                        <div className="flex items-center gap-3 px-2">
                          <button
                            onClick={() => setShowOnlyDifferences(!showOnlyDifferences)}
                            className={cn(
                              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                              showOnlyDifferences ? "bg-blue-600" : "bg-slate-200"
                            )}
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                showOnlyDifferences ? "translate-x-4" : "translate-x-0"
                              )}
                            />
                          </button>
                          <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">Pokaż tylko różnice w wartościach</span>
                        </div>
                      )}

                      <div className="space-y-4">
                        {compareFilesData.length > 0 && (
                          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm p-4 -mx-4 px-8 border-b border-slate-100 flex flex-col md:flex-row gap-6 items-center mb-6">
                            <div className="flex-1 min-w-[200px]">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Lista Mierników</span>
                            </div>
                            <div className="flex items-center gap-0 shrink-0 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200">
                              <div className="min-w-[200px] text-center px-4">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block truncate" title={fileData?.fileName}>{fileData?.fileName}</span>
                              </div>
                              
                              {compareFilesData.map((file, cIdx) => (
                                <Fragment key={cIdx}>
                                  <div className="w-[1px] h-6 bg-blue-500/30 shrink-0" />
                                  <div className="min-w-[240px] flex items-center justify-between gap-3 bg-blue-50/50 px-4 py-2 mx-2 rounded-xl border border-blue-100 shrink-0">
                                    <span className="text-[10px] font-black text-blue-600 truncate max-w-[160px] uppercase tracking-tight" title={file.fileName}>
                                      {file.fileName}
                                    </span>
                                    <button 
                                      onClick={() => removeCompareFile(cIdx)}
                                      className="p-1.5 hover:bg-red-500 hover:text-white text-blue-400 bg-white border border-blue-100 rounded-lg transition-all shadow-sm active:scale-95 shrink-0"
                                      title="Usuń z porównania"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                </Fragment>
                              ))}
                            </div>
                          </div>
                        )}

                        {filteredRecords.map((record, idx) => (
                          <div key={idx} className="group p-6 bg-white hover:bg-blue-50/50 rounded-2xl border border-slate-100 transition-all flex flex-col md:flex-row gap-6 items-start md:items-center shadow-sm overflow-hidden">
                            <div className="flex-1 space-y-1 min-w-[200px]">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded uppercase">Nazwa miernika</span>
                                
                                <div className="relative group/note">
                                  {editingNote === record.name ? (
                                    <div className="flex items-center gap-2 bg-white border border-blue-200 rounded-lg p-1 shadow-sm">
                                      <input 
                                        type="text" 
                                        value={tempNote}
                                        onChange={(e) => setTempNote(e.target.value)}
                                        placeholder="Dodaj notatkę..."
                                        className="text-[10px] font-medium outline-none px-1 w-32"
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && saveNote(record.name)}
                                      />
                                      <button onClick={() => saveNote(record.name)} className="text-emerald-500 hover:text-emerald-600">
                                        <Save size={12} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <button 
                                        onClick={() => startEditing(record.name)}
                                        className={cn(
                                          "p-1 rounded-md transition-all",
                                          userNotes[record.name] ? "bg-blue-600 text-white" : "text-slate-300 hover:text-blue-500 hover:bg-blue-50"
                                        )}
                                      >
                                        <StickyNote size={12} />
                                      </button>
                                      
                                      {userNotes[record.name] && (
                                        <div className="absolute left-full ml-2 invisible group-hover/note:visible opacity-0 group-hover/note:opacity-100 transition-all z-50 bg-slate-800 text-white text-[10px] py-2 px-3 rounded-xl shadow-xl min-w-[150px] pointer-events-none">
                                          <p className="font-bold mb-1 border-b border-slate-700 pb-1 flex items-center justify-between">
                                            NOTATKA
                                          </p>
                                          {userNotes[record.name]}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <h4 className="text-slate-900 font-bold leading-snug">{record.name}</h4>
                            </div>
                            
                            <div className="flex items-center gap-0 shrink-0 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-none">
                              <div className="flex items-center gap-8 min-w-[200px] px-4 md:border-l md:border-slate-100">
                                <div className="text-center min-w-[80px]">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 md:hidden">Wartość</p>
                                  <p className={cn(
                                    "text-lg font-black",
                                    record.value !== '-' ? "text-blue-600" : "text-slate-400"
                                  )}>{record.value}</p>
                                </div>
                                
                                <div className="min-w-[120px]">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 md:hidden">Wyjaśnienie</p>
                                  <p className="text-xs text-slate-500 font-medium italic leading-relaxed max-w-[150px] truncate">{record.note || '-'}</p>
                                </div>
                              </div>
                              
                              {record.comparisons.map((comp, cIdx) => (
                                <Fragment key={cIdx}>
                                  <div className="w-[1px] h-10 bg-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.2)] self-center shrink-0" />
                                  <div className="flex items-center gap-8 bg-blue-50/30 p-3 mx-2 rounded-xl border border-blue-100/50 min-w-[240px] shrink-0">
                                    <div className="text-center min-w-[70px]">
                                      <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-0.5 md:hidden">Wartość</p>
                                      <p className={cn(
                                        "text-base font-black",
                                        comp.value !== '-' ? "text-blue-600" : "text-slate-400"
                                      )}>{comp.value}</p>
                                    </div>
                                    
                                    <div className="min-w-[100px]">
                                      <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-0.5 md:hidden">Wyjaśnienie</p>
                                      <p className="text-[10px] text-slate-500 font-medium italic leading-tight max-w-[120px] truncate">{comp.note || '-'}</p>
                                    </div>
                                  </div>
                                </Fragment>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {filteredRecords.length === 0 && (
                        <div className="py-20 text-center text-slate-400">
                          Nie znaleziono mierników spełniających kryteria.
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.table
                      key="raw"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="w-full text-left border-separate border-spacing-0"
                    >
                      <thead>
                        <tr className="bg-slate-50/50">
                          <th className="sticky left-0 bg-slate-50 px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-r border-slate-100 w-16 text-center">#</th>
                          {fileData.headers.map((h, i) => (
                            <th key={i} className="px-8 py-5 text-[11px] font-black text-slate-900 uppercase tracking-[0.1em] border-b border-slate-100">
                              <div className="flex items-center gap-2">
                                <span className={cn("w-2 h-2 rounded-full", [2,3,4].includes(i) ? "bg-blue-500" : "bg-slate-300")} />
                                {h}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {fileData.rows.map((row, rowIdx) => (
                          <tr key={rowIdx} className="group hover:bg-blue-50/30 transition-colors">
                            <td className="sticky left-0 bg-white group-hover:bg-blue-50/30 px-6 py-4 text-xs font-bold text-slate-300 border-r border-slate-100 text-center transition-colors">
                              {rowIdx + 1}
                            </td>
                            {fileData.headers.map((_, colIdx) => (
                              <td key={colIdx} className={cn(
                                "px-8 py-4 text-sm font-medium",
                                [2,3,4].includes(colIdx) ? "text-slate-900" : "text-slate-400"
                              )}>
                                {row[colIdx]?.toString() || '-'}
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
                  <AlertCircle className="w-12 h-12 text-slate-200" />
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Brak danych w wybranym zakresie</p>
                </div>
              )}
            </div>

            <p className="text-center text-xs text-slate-400 font-medium">
              System automatycznie zignorował puste wiersze oraz nagłówki systemowe powyżej 5. linii.
            </p>
          </motion.div>
        )}

      </div>

      {/* Processing Backdrop */}
      {isProcessing && (
        <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-md z-[2000] flex items-center justify-center">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-6 text-center animate-in zoom-in-95 duration-200">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-slate-900 font-black text-lg text-nowrap">Analiza arkusza I_01.02</p>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Ekstrakcja kolumn C-E od wiersza 5</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
