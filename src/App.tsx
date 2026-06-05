import { useState, useEffect } from 'react';
import { 
  Database,
  ArrowRight,
  Sparkles,
  HelpCircle,
  FileSpreadsheet,
  AlertCircle,
  Play,
  RotateCcw,
  CheckCircle2,
  BookmarkCheck,
  ChevronRight
} from 'lucide-react';
import { SavedTaskListItem, ReconciliationResult, RowData, User } from './types';
import FileUploader from './components/FileUploader';
import SavedTaskList from './components/SavedTaskList';
import ReconciliationReport from './components/ReconciliationReport';
import AuthScreen from './components/AuthScreen';
import LicenseModal from './components/LicenseModal';


/**
 * Safely parses response JSON, falling back to clean text errors if response is HTML or plain text
 */
async function safeParseJson(response: Response, defaultMessage: string = 'Network error occurred') {
  try {
    const contentType = response.headers.get('content-type');
    const text = await response.text();
    if (contentType && contentType.includes('application/json')) {
      try {
        return JSON.parse(text);
      } catch {
        return { error: 'Failed to parse JSON response.' };
      }
    }
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // Fallback
      }
    }
    if (trimmed.startsWith('<')) {
      return { error: `${defaultMessage} (Server returned HTTP ${response.status} ${response.statusText})` };
    }
    return { error: text || `${defaultMessage} (HTTP ${response.status})` };
  } catch (err: any) {
    return { error: err.message || defaultMessage };
  }
}

export default function App() {
  // Authentication & Licensing State
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('reconciliation_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [isLicenseOpen, setIsLicenseOpen] = useState(false);

  // Navigation / Workflow Step
  const [activeStep, setActiveStep] = useState<'upload' | 'primary_key' | 'report'>('upload');

  // Input States
  const [taskName, setTaskName] = useState('');
  const [fileA, setFileA] = useState<{ name: string; headers: string[]; rows: any[] } | null>(null);
  const [fileB, setFileB] = useState<{ name: string; headers: string[]; rows: any[] } | null>(null);
  const [primaryKeyA, setPrimaryKeyA] = useState('');
  const [primaryKeyB, setPrimaryKeyB] = useState('');

  // Save / Persistence Meta
  const [isSaved, setIsSaved] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<number | string | null>(null);
  const [currentTableName, setCurrentTableName] = useState<string | null>(null);

  // Loaded database tasks
  const [savedTasks, setSavedTasks] = useState<SavedTaskListItem[]>([]);
  const [isTasksLoading, setIsTasksLoading] = useState(false);

  // Process / State Management
  const [isLoading, setIsLoading] = useState(false);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [reconciliationResult, setReconciliationResult] = useState<ReconciliationResult | null>(null);

  // Fetch the active saved lists on load or user change
  useEffect(() => {
    if (currentUser) {
      fetchSavedTasks();
    }
  }, [currentUser]);

  const fetchSavedTasks = async () => {
    if (!currentUser) return;
    setIsTasksLoading(true);
    try {
      const response = await fetch('/api/tasks', {
        headers: {
          'x-username': currentUser.username
        }
      });
      if (response.ok) {
        const data = await safeParseJson(response, 'Failed to parse saved tasks database response.');
        if (Array.isArray(data)) {
          setSavedTasks(data);
        } else if (data && data.error) {
          console.warn('Backend returned error reading saved tasks:', data.error);
        }
      } else {
        console.warn('Backend failed to return saved PostgreSQL records.');
      }
    } catch (err) {
      console.error('Failed to communicate with DB API:', err);
    } finally {
      setIsTasksLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (!currentUser) return;
    try {
      const response = await fetch('/api/auth/profile', {
        headers: {
          'x-username': currentUser.username
        }
      });
      if (response.ok) {
        const data = await safeParseJson(response, 'Failed to fetch user profile.');
        if (data && data.user) {
          setCurrentUser(data.user);
          localStorage.setItem('reconciliation_user', JSON.stringify(data.user));
        }
      }
    } catch (err) {
      console.error('Failed to refresh user profile:', err);
    }
  };

  const handleSelectSavedTable = async (taskId: number) => {
    setIsLoading(true);
    setSystemError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        headers: {
          'x-username': currentUser?.username || ''
        }
      });
      const data = await safeParseJson(response, 'Could not parse target table definitions from PostgreSQL.');
      if (!response.ok) {
        throw new Error(data.error || 'Could not parse target table definitions from PostgreSQL.');
      }
      
      // Setup the context for primary key selection
      setTaskName(data.taskName);
      setFileA({ name: data.fileAName, headers: data.headersA, rows: [] });
      setFileB({ name: data.fileBName, headers: data.headersB, rows: [] });
      setIsSaved(true);
      setCurrentTaskId(data.id);
      setCurrentTableName(data.tableName);
      
      // Auto pre-select primary keys if they match typical field candidates (lowercase check)
      const likelyPK_A = data.headersA.find((h: string) => ['id', 'uuid', 'key', 'code', 'email', 'primarykey', 'pk'].includes(h.toLowerCase().trim())) || '';
      const likelyPK_B = data.headersB.find((h: string) => ['id', 'uuid', 'key', 'code', 'email', 'primarykey', 'pk'].includes(h.toLowerCase().trim())) || '';
      setPrimaryKeyA(likelyPK_A);
      setPrimaryKeyB(likelyPK_B);

      setActiveStep('primary_key');
    } catch (err: any) {
      setSystemError(err.message || 'Error occurred loading the saved PostgreSQL task datasets.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSavedTable = async (taskId: number) => {
    if (!confirm('Are you sure you want to drop this task dataset from PostgreSQL? This action is irreversible.')) {
      return;
    }
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          'x-username': currentUser?.username || ''
        }
      });
      if (response.ok) {
        setSavedTasks(prev => prev.filter(t => t.id !== taskId));
      } else {
        const data = await safeParseJson(response, 'Failed to drop PostgreSQL table.');
        alert(data.error || 'Failed to drop PostgreSQL table.');
      }
    } catch (err) {
      console.error('Error issuing drop query:', err);
      alert('Network issue drop-command execution failed.');
    }
  };

  const handleProceedInit = async (saveOption: boolean) => {
    setValidationError(null);
    setSystemError(null);

    if (!taskName.trim()) {
      setValidationError('Please specify a Task Name before processing.');
      return;
    }
    if (!fileA || !fileB) {
      setValidationError('Both Dataset A and Dataset B must be successfully loaded.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/tasks/init', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': currentUser?.username || ''
        },
        body: JSON.stringify({
          taskName: taskName.trim(),
          fileAName: fileA.name,
          fileBName: fileB.name,
          datasetA: fileA.rows,
          datasetB: fileB.rows,
          headersA: fileA.headers,
          headersB: fileB.headers,
          isSaved: saveOption
        }),
      });

      const resData = await safeParseJson(response, 'Failed to initialize reconciliation task on server.');
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to initialize reconciliation task on server.');
      }

      setIsSaved(saveOption);
      setCurrentTaskId(resData.taskId);
      setCurrentTableName(resData.tableName);

      // Auto pre-select primary keys if similarities are present
      const likelyPK_A = resData.headersA.find((h: string) => ['id', 'uuid', 'key', 'code', 'email', 'primarykey', 'pk'].includes(h.toLowerCase().trim())) || '';
      const likelyPK_B = resData.headersB.find((h: string) => ['id', 'uuid', 'key', 'code', 'email', 'primarykey', 'pk'].includes(h.toLowerCase().trim())) || '';
      setPrimaryKeyA(likelyPK_A);
      setPrimaryKeyB(likelyPK_B);

      // If proceed without save, we pass raw rows inside state
      if (!saveOption) {
        setFileA({ name: fileA.name, headers: resData.headersA, rows: resData.datasetA });
        setFileB({ name: fileB.name, headers: resData.headersB, rows: resData.datasetB });
      }

      setActiveStep('primary_key');
      refreshProfile(); // Update works counter
      fetchSavedTasks(); // Refresh list background 7-day checks
    } catch (err: any) {
      setSystemError(err.message || 'Critical server error when saving or caching datasets.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunReconciliation = async () => {
    setValidationError(null);
    setSystemError(null);

    if (!primaryKeyA || !primaryKeyB) {
      setValidationError('Please select the corresponding primary key columns for both files.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/tasks/reconcile', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-username': currentUser?.username || ''
        },
        body: JSON.stringify({
          taskId: currentTaskId,
          isSaved,
          primaryKeyA,
          primaryKeyB,
          tableName: currentTableName,
          taskName: taskName.trim(),
          fileAName: fileA?.name,
          fileBName: fileB?.name,
          datasetA: isSaved ? undefined : fileA?.rows,
          datasetB: isSaved ? undefined : fileB?.rows,
        })
      });

      const data = await safeParseJson(response, 'Failed to complete reconciliation.');
      if (!response.ok) {
        throw new Error(data.error || 'Failed to complete reconciliation.');
      }
      setReconciliationResult(data.report);
      setActiveStep('report');
    } catch (err: any) {
      setSystemError(err.message || 'Comparison logic failed on server compilation.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setActiveStep('upload');
    setTaskName('');
    setFileA(null);
    setFileB(null);
    setPrimaryKeyA('');
    setPrimaryKeyB('');
    setIsSaved(false);
    setCurrentTaskId(null);
    setCurrentTableName(null);
    setReconciliationResult(null);
    setValidationError(null);
    setSystemError(null);
    fetchSavedTasks();
  };

  // Step checks for sidebar progress indicator
  const isStep1Done = !!taskName.trim();
  const isStep2Done = !!fileA && !!fileB;
  const isStep3Done = activeStep === 'report' || (!!primaryKeyA && !!primaryKeyB);
  const isStep4Done = activeStep === 'report';

  if (!currentUser) {
    return <AuthScreen onLoginSuccess={(u) => setCurrentUser(u)} />;
  }

  return (
    <div className="h-screen w-full flex flex-col bg-[#070b14] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.12),rgba(255,255,255,0))] font-sans text-slate-200 overflow-hidden">
      
      {/* Top Navigation Bar from "Professional Polish" Design theme */}
      <nav className="h-16 bg-[#070b14]/75 backdrop-blur-md text-white flex items-center justify-between px-8 shrink-0 border-b border-white/[0.06] z-10">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center font-black text-white shadow-md shadow-indigo-550/15">
            DR
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              DataRecon Pro <span className="text-white/20 text-xs font-normal">|</span> <span className="bg-gradient-to-r from-indigo-350 to-violet-300 bg-clip-text text-transparent font-semibold">Audit Workspace</span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* License Status Badge indicator */}
          <button
            onClick={() => setIsLicenseOpen(true)}
            className="flex items-center gap-2.5 px-3 py-1.5 bg-white/3 hover:bg-white/7 transition text-[11px] rounded-lg border border-white/8 text-left cursor-pointer transition-all"
          >
            <div className={`w-2.5 h-2.5 rounded-full ${currentUser.worksCount >= 10 ? 'bg-red-500 shadow-md shadow-red-500/50 animate-pulse' : 'bg-emerald-400 shadow-md shadow-emerald-400/50'}`}></div>
            <div>
              <span className="text-slate-400">Runs Completed: </span>
              <span className="font-bold text-white font-mono">{currentUser.worksCount} / 10</span>
            </div>
          </button>

          <button
            onClick={() => setIsLicenseOpen(true)}
            className="glass-button bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-550/30 text-indigo-300 font-bold font-mono py-1.5 px-3 text-[10px] uppercase rounded-lg tracking-wider cursor-pointer"
          >
            Licensing & Admin
          </button>

          <div 
            onClick={() => {
              if (confirm('Do you want to log out of your workspace?')) {
                localStorage.removeItem('reconciliation_user');
                setCurrentUser(null);
              }
            }}
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-red-950/40 border border-white/10 hover:border-red-500/30 transition-all flex items-center justify-center cursor-pointer relative group shrink-0"
            title="Click to logout"
          >
            <span className="text-xs font-bold text-indigo-305 group-hover:hidden font-mono">
              {currentUser.username.substring(0, 2).toUpperCase()}
            </span>
            <span className="text-[9px] font-bold text-red-400 hidden group-hover:inline uppercase tracking-wider font-semibold">
              Exit
            </span>
          </div>
        </div>
      </nav>

      {/* Main Workspace Frame container */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Sidebar Workflow Navigation from theme */}
        <aside className="w-72 bg-[#070b14]/40 backdrop-blur-md border-r border-white/[0.06] flex flex-col shrink-0 hidden md:flex">
          <div className="p-6 space-y-8 flex-1 overflow-y-auto">
            
            {/* Steps Workflow Widget */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-4 block">
                Current Workflow
              </label>
              
              <div className="space-y-4">
                {/* Step 1: Initialize Task */}
                <div className={`flex items-start gap-3 transition-opacity ${activeStep === 'upload' ? 'opacity-100' : 'opacity-70'}`}>
                  {isStep1Done ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0 text-[10px] font-bold">
                      ✓
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 text-[10px] font-bold ring-4 ring-indigo-950/35">
                      1
                    </div>
                  )}
                  <div>
                    <p className={`text-sm font-semibold ${activeStep === 'upload' && !taskName ? 'text-indigo-350' : 'text-slate-200'}`}>
                      Initialize Task
                    </p>
                    <p className="text-xs text-slate-450 truncate max-w-[170px]" title={taskName || 'Specify job tracker'}>
                      {taskName ? `ID: ${taskName}` : 'Specify job tracker'}
                    </p>
                  </div>
                </div>

                {/* Step 2: Data Ingestion */}
                <div className={`flex items-start gap-3 transition-opacity ${activeStep === 'upload' ? 'opacity-100' : 'opacity-70'}`}>
                  {isStep2Done ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0 text-[10px] font-bold">
                      ✓
                    </div>
                  ) : (
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                      isStep1Done ? 'bg-indigo-650 text-white ring-4 ring-indigo-950/35' : 'bg-white/5 border border-white/5 text-slate-500'
                    }`}>
                      2
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-200">Data Ingestion</p>
                    <p className="text-xs text-slate-455 truncate max-w-[170px]">
                      {isStep2Done ? '2 csv/xls uploaded' : 'Load registries'}
                    </p>
                  </div>
                </div>

                {/* Step 3: Key Mapping */}
                <div className={`flex items-start gap-3 transition-opacity ${activeStep === 'primary_key' ? 'opacity-100' : 'opacity-55'}`}>
                  {isStep3Done && activeStep !== 'primary_key' ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0 text-[10px] font-bold">
                      ✓
                    </div>
                  ) : (
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                      activeStep === 'primary_key' ? 'bg-indigo-650 text-white ring-4 ring-indigo-950/35' : 'bg-white/5 border border-white/5 text-slate-500'
                    }`}>
                      3
                    </div>
                  )}
                  <div>
                    <p className={`text-sm font-semibold ${activeStep === 'primary_key' ? 'text-indigo-350 font-bold' : 'text-slate-200'}`}>
                      Key Mapping
                    </p>
                    <p className="text-xs text-slate-450 truncate max-w-[170px]">
                      {primaryKeyA && primaryKeyB ? `Keys: B.${primaryKeyB} ↔ A.${primaryKeyA}` : 'Map unique identifiers'}
                    </p>
                  </div>
                </div>

                {/* Step 4: Analysis & Report */}
                <div className={`flex items-start gap-3 transition-opacity ${activeStep === 'report' ? 'opacity-100 bg-indigo-950/20 p-1.5 rounded-lg border-l-2 border-indigo-500' : 'opacity-40'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                    activeStep === 'report' ? 'bg-indigo-650 text-white ring-4 ring-indigo-950/35' : 'bg-white/5 border border-white/5 text-slate-500'
                  }`}>
                    {activeStep === 'report' ? '✓' : '4'}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${activeStep === 'report' ? 'text-indigo-350 font-bold' : 'text-slate-200'}`}>
                      Analysis & Report
                    </p>
                    <p className="text-xs text-slate-450">
                      {activeStep === 'report' ? 'Review results' : 'Generate audit summary'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Retention alert block */}
            <div className="pt-8 border-t border-white/5">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3 block">
                Retention Policy
              </label>
              <div className="bg-amber-950/20 border border-amber-500/20 p-3.5 rounded-xl">
                <p className="text-[11px] leading-relaxed text-amber-300">
                  <span className="font-bold uppercase block text-[9px] text-amber-450 mb-1">💡 Sandbox Clean-Up</span>
                  Metadata schemas and transaction log tables are retained for <span className="font-bold text-white">7 days</span> before automatic purging of sandbox resources.
                </p>
              </div>
            </div>

          </div>

          {/* Cancel button in sidebar drawer foot */}
          <div className="p-6 bg-slate-950/20 border-t border-white/5">
            <button
              onClick={handleReset}
              className="w-full py-2.5 glass-button text-xs font-bold rounded-lg cursor-pointer text-center block"
            >
              Cancel / Reset Job
            </button>
          </div>
        </aside>

        {/* Actionable workspace viewport */}
        <main className="flex-1 p-6 md:p-8 flex flex-col gap-6 overflow-y-auto">
          
          {/* Main Action Headers block depending on state */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest block mb-0.5">
                {activeStep === 'upload' ? 'Workflow Step 1 of 3 (Intake)' : activeStep === 'primary_key' ? 'Workflow Step 2 of 3 (Alignment)' : 'Workflow Step 3 of 3 (Audit)'}
              </span>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-205 bg-clip-text text-transparent drop-shadow-sm">
                {activeStep === 'upload' && 'Seamless Reconciliation Across Systems'}
                {activeStep === 'primary_key' && 'Primary Key Field Mapping'}
                {activeStep === 'report' && 'Discrepancy Audit Statement'}
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                {activeStep === 'upload' && 'Define task context and drop CSV/Excel dataset sheets to initiate transactional comparisons.'}
                {activeStep === 'primary_key' && 'Align columns dynamically below. Select fields representing unique records (e.g. Transaction ID, Email).'}
                {activeStep === 'report' && 'Interactive ledger discrepancies list. Drill down into value discrepancies, missing items, or download statements.'}
              </p>
            </div>

            {/* Quick-action primary trigger block */}
            {activeStep === 'primary_key' && (
              <div className="flex gap-2.5">
                <button
                  onClick={() => setActiveStep('upload')}
                  className="px-4 py-2.5 glass-button text-xs font-bold rounded-lg cursor-pointer"
                >
                  Configure Files
                </button>
                <button
                  onClick={handleRunReconciliation}
                  disabled={!primaryKeyA || !primaryKeyB}
                  className="px-6 py-2.5 glass-button-primary disabled:opacity-40 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer font-sans"
                >
                  <Play size={13} className="text-white" />
                  Run Reconciliation
                </button>
              </div>
            )}
          </div>

          {/* Notifications and Warning banners */}
          {systemError && (
            <div className="bg-rose-950/20 border border-rose-900/30 text-rose-300 rounded-xl p-4 flex items-start gap-3 shadow-lg">
              <AlertCircle className="text-rose-450 mt-0.5 shrink-0" size={18} />
              <div>
                <h4 className="text-sm font-bold text-rose-200">Job Aborted</h4>
                <p className="text-xs text-rose-450 mt-0.5">{systemError}</p>
              </div>
            </div>
          )}

          {/* ========================================== */}
          {/* STEP 1: CONFIGURE & UPLOAD FILES STATUS */}
          {/* ========================================== */}
          {activeStep === 'upload' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
                {/* Left Column: Config Forms */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                <div className="glass-panel rounded-2xl p-6 shadow-xl flex flex-col gap-6 text-white">
                  
                  {/* Task Name Box */}
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                      Auditing Context / Task Name <span className="text-indigo-400 font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full glass-input rounded-xl px-4 py-3 text-sm font-semibold text-white outline-none placeholder-slate-500"
                      value={taskName}
                      onChange={e => setTaskName(e.target.value)}
                      placeholder="e.g. FY24_Q3_AUDIT_FINAL"
                    />
                  </div>

                  {/* Combined file drag panels */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <FileUploader
                      label="Dataset A (Source Registry)"
                      onDataLoaded={(name, headers, rows) => setFileA({ name, headers, rows })}
                      onClear={() => setFileA(null)}
                      required
                    />
                    <FileUploader
                      label="Dataset B (Target Comparison)"
                      onDataLoaded={(name, headers, rows) => setFileB({ name, headers, rows })}
                      onClear={() => setFileB(null)}
                      required
                    />
                  </div>

                  {validationError && (
                    <span className="text-xs font-semibold text-rose-300 bg-rose-950/25 px-4 py-2.5 rounded-lg border border-rose-900/40 flex items-center gap-1.5 backdrop-blur-md">
                      <AlertCircle size={14} className="shrink-0 text-rose-450" />
                      {validationError}
                    </span>
                  )}

                  {/* Option Buttons */}
                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-white/5 mt-2">
                    
                    {/* Save to PG Table */}
                    <button
                      disabled={!fileA || !fileB || !taskName.trim()}
                      onClick={() => handleProceedInit(true)}
                      className="w-full sm:flex-1 cursor-pointer glass-button-primary disabled:opacity-30 disabled:pointer-events-none font-bold text-xs rounded-xl px-5 py-3.5 flex items-center justify-center gap-2"
                    >
                      <BookmarkCheck size={15} />
                      Save & Proceed
                    </button>

                    {/* Proceed Without Saving */}
                    <button
                      disabled={!fileA || !fileB || !taskName.trim()}
                      onClick={() => handleProceedInit(false)}
                      className="w-full sm:flex-1 cursor-pointer glass-button disabled:opacity-30 disabled:pointer-events-none font-bold text-xs rounded-xl px-5 py-3.5 flex items-center justify-center gap-2"
                    >
                      <Play size={14} className="text-slate-350 shrink-0" />
                      Proceed Without Saving
                    </button>
                  </div>
                </div>
              </div>

              {/* Sidebar Database Jobs list */}
              <div className="lg:col-span-1">
                <SavedTaskList
                  tasks={savedTasks}
                  isLoading={isTasksLoading}
                  onSelectTask={handleSelectSavedTable}
                  onDeleteTask={handleDeleteSavedTable}
                  onRefresh={fetchSavedTasks}
                />
              </div>

            </div>
          )}

          {/* ========================================== */}
          {/* STEP 2: PRIMARY KEY SELECTION SCREEN */}
          {/* ========================================== */}
          {activeStep === 'primary_key' && (
            <div className="flex flex-col gap-6">
              
              {/* Interactive headers columns selection panel from theme */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
                
                {/* Dataset A headers list */}
                <div className="glass-panel rounded-2xl shadow-2xl flex flex-col min-h-[350px] overflow-hidden border border-white/[0.04]">
                  <div className="p-4 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 shadow-md shadow-indigo-400/50"></div>
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Dataset A Columns</span>
                    </div>
                    <span className="text-xs font-mono font-semibold text-slate-400 truncate max-w-[150px] block" title={fileA?.name}>
                      {fileA?.name}
                    </span>
                  </div>
                  
                  {/* Selectors dropdown option */}
                  <div className="p-4 border-b border-white/[0.06] bg-white/[0.01]">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Choose Field Selector:
                    </label>
                    <select
                      value={primaryKeyA}
                      onChange={e => setPrimaryKeyA(e.target.value)}
                      className="w-full bg-[#0b0f19] border border-white/10 rounded-xl px-3 py-2.5 text-xs font-semibold text-white focus:border-indigo-400 focus:outline-none cursor-pointer"
                    >
                      <option value="" className="bg-[#0b0f19] text-gray-400">-- Choose Key Column --</option>
                      {fileA?.headers.map((h, i) => (
                        <option key={i} value={h} className="bg-[#0b0f19] text-white">{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Interactive key tiles */}
                  <div className="p-4 flex-1 overflow-y-auto max-h-[300px]">
                    <div className="space-y-1.5">
                      {fileA?.headers.map((h, i) => {
                        const isSelected = primaryKeyA === h;
                        return (
                          <div
                            key={i}
                            onClick={() => setPrimaryKeyA(h)}
                            className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition ${
                              isSelected
                                ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-250 shadow-md'
                                : 'border border-transparent hover:border-white/5 hover:bg-white/4 text-slate-350 hover:text-white'
                            }`}
                          >
                            <span className={`text-xs ${isSelected ? 'font-bold' : 'font-semibold'}`}>{h}</span>
                            {isSelected && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-indigo-550 border border-indigo-500/30 text-indigo-300 rounded font-bold uppercase tracking-wider">
                                Core PK
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Dataset B headers list */}
                <div className="glass-panel rounded-2xl shadow-2xl flex flex-col min-h-[350px] overflow-hidden border border-white/[0.04]">
                  <div className="p-4 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-violet-400 shadow-md shadow-violet-500/50"></div>
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Dataset B Columns</span>
                    </div>
                    <span className="text-xs font-mono font-semibold text-slate-400 truncate max-w-[150px] block" title={fileB?.name}>
                      {fileB?.name}
                    </span>
                  </div>

                  {/* Selectors dropdown option */}
                  <div className="p-4 border-b border-white/[0.06] bg-white/[0.01]">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Choose Field Selector:
                    </label>
                    <select
                      value={primaryKeyB}
                      onChange={e => setPrimaryKeyB(e.target.value)}
                      className="w-full bg-[#0b0f19] border border-white/10 rounded-xl px-3 py-2.5 text-xs font-semibold text-white focus:border-indigo-400 focus:outline-none cursor-pointer"
                    >
                      <option value="" className="bg-[#0b0f19] text-gray-400">-- Choose Key Column --</option>
                      {fileB?.headers.map((h, i) => (
                        <option key={i} value={h} className="bg-[#0b0f19] text-white">{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Interactive key tiles */}
                  <div className="p-4 flex-1 overflow-y-auto max-h-[300px]">
                    <div className="space-y-1.5">
                      {fileB?.headers.map((h, i) => {
                        const isSelected = primaryKeyB === h;
                        return (
                          <div
                            key={i}
                            onClick={() => setPrimaryKeyB(h)}
                            className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition ${
                              isSelected
                                ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-250 shadow-md'
                                : 'border border-transparent hover:border-white/5 hover:bg-white/4 text-slate-350 hover:text-white'
                            }`}
                          >
                            <span className={`text-xs ${isSelected ? 'font-bold' : 'font-semibold'}`}>{h}</span>
                            {isSelected && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-indigo-550 border border-indigo-500/30 text-indigo-300 rounded font-bold uppercase tracking-wider">
                                Core PK
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

              </div>

              {validationError && (
                <span className="text-xs font-bold text-rose-350 bg-rose-950/20 px-3/5 py-2.5 rounded-lg border border-rose-900/40 flex items-center gap-1.5 font-sans">
                  <AlertCircle size={14} className="text-rose-450 shrink-0" />
                  {validationError}
                </span>
              )}

              {/* Summary Forecast Section directly matched from design theme */}
              <div className="glass-panel rounded-2xl p-6 flex flex-col md:flex-row gap-6 items-stretch md:items-center text-white border border-white/[0.04] shadow-2xl">
                <div className="flex-1 md:border-r border-white/10 md:pr-8">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                    Record Forecast & Capacity
                  </h4>
                  <div className="grid grid-cols-3 gap-6">
                    <div>
                      <p className="text-2xl font-semibold tracking-tight text-white font-mono">
                        {fileA?.rows?.length ? fileA.rows.length.toLocaleString() : 'Loaded'}
                      </p>
                      <p className="text-[9px] text-slate-450 uppercase tracking-widest font-black mt-1.5 font-sans">Dataset A rows</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold tracking-tight text-emerald-450 font-mono">
                        {fileB?.rows?.length ? fileB.rows.length.toLocaleString() : 'Loaded'}
                      </p>
                      <p className="text-[9px] text-slate-450 uppercase tracking-widest font-black mt-1.5 font-sans">Dataset B rows</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold tracking-tight text-indigo-400">
                        {isSaved ? 'Persistent' : 'In-Memory'}
                      </p>
                      <p className="text-[9px] text-slate-450 uppercase tracking-widest font-black mt-1.5 font-sans">Schema Scope</p>
                    </div>
                  </div>
                </div>
                
                <div className="md:w-80 flex flex-col justify-center">
                  <p className="text-xs leading-relaxed text-slate-300">
                    The audit scheduler compiles keys through <span className="font-bold text-white">PostgreSQL schema joins</span> to align matching entries, highlighting non-identical cells.
                  </p>
                  <div className="mt-4">
                    <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5">
                      <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 w-[75%] transition-all"></div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ========================================== */}
          {/* STEP 3: SUMMARY AUDIT REPORT VIEW */}
          {/* ========================================== */}
          {activeStep === 'report' && reconciliationResult && (
            <ReconciliationReport 
              result={reconciliationResult}
              onReset={handleReset}
            />
          )}

        </main>
      </div>

      {/* Global Loading Overlay Screen */}
      {isLoading && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-50 animate-fadeIn">
          <div className="glass-panel rounded-2xl p-6.5 shadow-2xl flex flex-col items-center gap-4 text-center border border-white/5 max-w-sm text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-400"></div>
            <div>
              <p className="text-sm font-bold text-slate-100">Processing SQL Statements...</p>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Writing tables, performing comparisons and building the discrepancy report.</p>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Footer Status Bar from theme */}
      <footer className="h-8 bg-[#070b14]/90 backdrop-blur-md border-t border-white/[0.06] px-6 shrink-0 flex items-center justify-between text-[10px] text-slate-400 font-medium">
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5 text-slate-350">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/50"></span> Postgres Engine Active
          </span>
          <span className="hidden sm:inline opacity-30">•</span>
          <span className="hidden sm:inline opacity-80 text-slate-450">Schema Sandbox: compliant</span>
        </div>
        <div>DataRecon Suite v2.4.0-stable</div>
      </footer>

      {/* Licensing, Account Activation & Keys Console Modal */}
      <LicenseModal
        isOpen={isLicenseOpen}
        onClose={() => setIsLicenseOpen(false)}
        currentUser={currentUser}
        onUserUpdate={(updatedUser) => setCurrentUser(updatedUser)}
      />
    </div>
  );
}
