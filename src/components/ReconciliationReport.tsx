import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Search, 
  Download, 
  HelpCircle, 
  CheckCircle, 
  AlertTriangle, 
  FolderMinus, 
  ArrowLeftRight,
  TrendingDown,
  TrendingUp,
  Sparkles,
  FileText,
  Activity
} from 'lucide-react';
import { ReconciliationResult, RowData, DiscrepancyRow } from '../types';

interface ReconciliationReportProps {
  result: ReconciliationResult;
  onReset: () => void;
}

type TabType = 'analytics' | 'discrepancies' | 'matches' | 'missing_in_a' | 'missing_in_b';

export default function ReconciliationReport({ result, onReset }: ReconciliationReportProps) {
  const [activeTab, setActiveTab] = useState<TabType>('analytics');
  const [searchQuery, setSearchQuery] = useState('');

  const { counts, matches, mismatches, missingInA, missingInB, fileAName, fileBName, primaryKeyA, primaryKeyB } = result;

  const matchesCount = counts.matches;
  const mismatchesCount = counts.mismatches;
  const missingACount = counts.missingInA;
  const missingBCount = counts.missingInB;
  const totalDiscrepancies = counts.totalDiscrepantCells ?? 0;

  // Derive field-level discrepancy fallback count if not provided directly
  const fieldDiscrepanciesFallback: Record<string, number> = {};
  mismatches.forEach(m => {
    m.discrepancies.forEach(d => {
      fieldDiscrepanciesFallback[d.field] = (fieldDiscrepanciesFallback[d.field] || 0) + 1;
    });
  });

  const fieldDiscounts = counts.fieldDiscrepancyCounts || fieldDiscrepanciesFallback;

  // Process potential numeric column sums and average variances
  const numericVariances: { field: string; sumA: number; sumB: number; netDiff: number; avgVariance: number }[] = [];
  const numericFields = new Set<string>();

  mismatches.forEach(m => {
    m.discrepancies.forEach(d => {
      const numA = Number(d.valA);
      const numB = Number(d.valB);
      if (!isNaN(numA) && !isNaN(numB) && String(d.valA).trim() !== '' && String(d.valB).trim() !== '') {
        numericFields.add(d.field);
      }
    });
  });

  numericFields.forEach(f => {
    let sumA = 0;
    let sumB = 0;
    let matchCount = 0;
    mismatches.forEach(m => {
      m.discrepancies.forEach(d => {
        if (d.field === f) {
          sumA += Number(d.valA) || 0;
          sumB += Number(d.valB) || 0;
          matchCount++;
        }
      });
    });
    numericVariances.push({
      field: f,
      sumA,
      sumB,
      netDiff: sumB - sumA,
      avgVariance: matchCount > 0 ? (sumB - sumA) / matchCount : 0
    });
  });

  // Calculate high-level metrics
  const totalA = counts.datasetARows;
  const totalB = counts.datasetBRows;
  const maxRows = Math.max(totalA, totalB) || 1;
  const harmonyRate = Math.round((counts.matches / maxRows) * 100);

  // Generate dynamic offline comprehensive HTML report workbook
  const exportToExecutiveHTML = () => {
    const fieldDiscsList = Object.entries(fieldDiscounts)
      .map(([f, count]) => `<li>Attribute <strong>"${f}"</strong> has <strong>${count} value mismatch${count === 1 ? '' : 'es'}</strong> (${Math.round((count / (counts.mismatches || 1)) * 100)}% of total discrepancies).</li>`)
      .join('');

    let discrepancyRowsHTML = '';
    mismatches.forEach((m) => {
      m.discrepancies.forEach((d) => {
        discrepancyRowsHTML += `
          <tr style="border-bottom: 1px solid #e2e8f0; font-size: 13px;">
            <td style="padding: 12px 10px; font-weight: bold; color: #1e293b;">${m.primaryKey}</td>
            <td style="padding: 12px 10px; color: #475569; font-family: monospace;">A#${m.rowAIndex + 1} / B#${m.rowBIndex + 1}</td>
            <td style="padding: 12px 10px; font-weight: 600; color: #4f46e5; font-family: monospace;">${d.field}</td>
            <td style="padding: 12px 10px; color: #b91c1c; background: #fef2f2; font-family: monospace;">${d.valA === null || d.valA === undefined ? '<blank>' : String(d.valA)}</td>
            <td style="padding: 12px 10px; color: #15803d; background: #f0fdf4; font-family: monospace;">${d.valB === null || d.valB === undefined ? '<blank>' : String(d.valB)}</td>
          </tr>
        `;
      });
    });

    if (mismatches.length === 0) {
      discrepancyRowsHTML = `<tr><td colspan="5" style="padding: 24px; text-align: center; color: #64748b; font-style: italic;">No cell value discrepancies found. Solid parity.</td></tr>`;
    }

    let missingA_HTML = '';
    missingInA.forEach((row, idx) => {
      const keys = Object.keys(row).slice(0, 4);
      const cells = keys.map(k => `<td style="padding: 10px; font-family: monospace; color: #334155;">${row[k] === null || row[k] === undefined ? '-' : String(row[k])}</td>`).join('');
      missingA_HTML += `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 13px;">
          <td style="padding: 10px; font-weight: bold; color: #d97706;">${row[primaryKeyB] ?? ''}</td>
          ${cells}
        </tr>
      `;
    });
    if (missingInA.length === 0) {
      missingA_HTML = `<tr><td colspan="5" style="padding: 24px; text-align: center; color: #64748b; font-style: italic;">No records extra in Dataset B.</td></tr>`;
    }

    let missingB_HTML = '';
    missingInB.forEach((row, idx) => {
      const keys = Object.keys(row).slice(0, 4);
      const cells = keys.map(k => `<td style="padding: 10px; font-family: monospace; color: #334155;">${row[k] === null || row[k] === undefined ? '-' : String(row[k])}</td>`).join('');
      missingB_HTML += `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 13px;">
          <td style="padding: 10px; font-weight: bold; color: #b91c1c;">${row[primaryKeyA] ?? ''}</td>
          ${cells}
        </tr>
      `;
    });
    if (missingInB.length === 0) {
      missingB_HTML = `<tr><td colspan="5" style="padding: 24px; text-align: center; color: #64748b; font-style: italic;">No records deleted / missing in Dataset B.</td></tr>`;
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Executive Audit Parity & Reconciliation Report: ${result.taskName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.5; padding: 40px; background: #f8fafc; }
    .container { max-width: 1000px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 40px; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.05); }
    .header { border-bottom: 2px solid #f1f5f9; padding-bottom: 25px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: start; }
    .badge { display: inline-block; padding: 6px 12px; font-size: 10px; font-weight: bold; text-transform: uppercase; border-radius: 20px; letter-spacing: 0.05em; }
    .badge-success { background: #d1fae5; color: #065f46; }
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; }
    .card-val { font-size: 28px; font-weight: 800; color: #1e1b4b; margin-top: 5px; }
    .card-lbl { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
    th { background: #f8fafc; padding: 14px 10px; font-size: 11px; text-transform: uppercase; font-weight: bold; color: #475569; text-align: left; border-bottom: 2px solid #e2e8f0; }
    .sec-title { border-left: 5px solid #4f46e5; padding-left: 12px; font-size: 20px; font-weight: bold; color: #0f172a; margin: 40px 0 20px 0; }
    .print-btn { background: #4f46e5; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: all 0.15s ease; box-shadow: 0 4px 6px -1px rgb(79 70 229 / 0.1); }
    .print-btn:hover { background: #4338ca; }
    @media print {
      body { background: white; padding: 0; }
      .container { border: none; box-shadow: none; padding: 0; }
      .print-btn { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px;">
      <span class="badge badge-success">DATA RECON SUITE V2.4</span>
      <button class="print-btn" onclick="window.print()">Print Report / Save PDF</button>
    </div>
    
    <div class="header">
      <div>
        <h1 style="margin: 0; font-size: 28px; font-weight: 900; letter-spacing: -0.02em; color: #0f172a;">${result.taskName}</h1>
        <p style="margin: 6px 0 0 0; color: #4f46e5; font-size: 14px; font-weight: 600;">Executive Reconciliation Audit Ledger</p>
        <p style="margin: 10px 0 0 0; color: #475569; font-size: 13px; line-height: 1.6;">
          Dataset A (Left Source): <strong>${fileAName}</strong> (${totalA} rows | Key: <span style="font-family: monospace;">${primaryKeyA}</span>)<br/>
          Dataset B (Right Scope): <strong>${fileBName}</strong> (${totalB} rows | Key: <span style="font-family: monospace;">${primaryKeyB}</span>)
        </p>
      </div>
      <div style="text-align: right; font-size: 13px; color: #475569; line-height: 1.6;">
        <strong>Audit Scheduled:</strong> ${new Date().toLocaleDateString()}<br/>
        <strong>Parity Score:</strong> <span style="font-size: 16px; font-weight: 800; color: ${harmonyRate === 100 ? '#16a34a' : '#ef4444'}">${harmonyRate}% ALIGNED</span>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-lbl">Total Exact Matches</div>
        <div class="card-val" style="color: #16a34a;">${matchesCount}</div>
        <span style="font-size: 11px; color: #16a34a;">Identical mappings</span>
      </div>
      <div class="card">
        <div class="card-lbl">Value Discrepancies</div>
        <div class="card-val" style="color: #4f46e5;">${mismatchesCount}</div>
        <span style="font-size: 11px; color: #6366f1;">${totalDiscrepancies} discrepant cells</span>
      </div>
      <div class="card">
        <div class="card-lbl">Missing in Dataset A</div>
        <div class="card-val" style="color: #d97706;">${missingACount}</div>
        <span style="font-size: 11px; color: #d97706;">Extra in Dataset B</span>
      </div>
      <div class="card">
        <div class="card-lbl">Missing in Dataset B</div>
        <div class="card-val" style="color: #b91c1c;">${missingBCount}</div>
         <span style="font-size: 11px; color: #ef4444;">Deleted / Extra in Dataset A</span>
      </div>
    </div>

    <!-- Observations Card -->
    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-style: dashed; padding: 25px; border-radius: 12px; margin-bottom: 35px;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: bold; color: #0f172a; display: flex; align-items: center; gap: 8px;">
        🔍 Executive Observations & Diagnosis Summary
      </h3>
      <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.7;">
        <li>Concurrence analysis evaluates system cohesion at exactly <strong>${harmonyRate}% alignment</strong>.</li>
        ${missingBCount > 0 ? `<li><strong>Audit Gap (System A Deletions)</strong>: Exactly <strong>${missingBCount} records</strong> in Dataset A are absent (likely deleted) in Dataset B.</li>` : `<li>No deletions or missing references flagged in Dataset B.</li>`}
        ${missingACount > 0 ? `<li><strong>Audit Gap (System B Additions)</strong>: Exactly <strong>${missingACount} new records</strong> exist inside Dataset B with no counterpart in Dataset A.</li>` : `<li>No additions or unmapped rows in Dataset B.</li>`}
        ${mismatchesCount > 0 ? `<li><strong>Dynamic Data Divergences</strong>: <strong>${mismatchesCount} mapped rows</strong> have mismatching cell metadata across <strong>${totalDiscrepancies} individual fields</strong>.</li>` : `<li>Zero localized data divergences identified in mapped entries.</li>`}
        ${fieldDiscsList ? `<li><strong>Discrepant Attributes Breakdown</strong>:<ul>${fieldDiscsList}</ul></li>` : ''}
      </ul>
    </div>

    <div class="sec-title">Ledger Value Discrepancies Statement (${mismatchesCount})</div>
    <table>
      <thead>
        <tr>
          <th>Primary Key</th>
          <th>Physical Indices</th>
          <th>Discrepant Field</th>
          <th>dataset A (${fileAName})</th>
          <th>dataset B (${fileBName})</th>
        </tr>
      </thead>
      <tbody>
        ${discrepancyRowsHTML}
      </tbody>
    </table>

    <div class="sec-title">Records Missing in Dataset A (Dataset B Extras) (${missingACount})</div>
    <table>
      <thead>
        <tr>
          <th>Key Value (${primaryKeyB})</th>
          <th colspan="4">Record Context (First 4 Columns)</th>
        </tr>
      </thead>
      <tbody>
        ${missingA_HTML}
      </tbody>
    </table>

    <div class="sec-title">Records Missing in Dataset B (Dataset A Extras / Deleted) (${missingBCount})</div>
    <table>
      <thead>
        <tr>
          <th>Key Value (${primaryKeyA})</th>
          <th colspan="4">Record Context (First 4 Columns)</th>
        </tr>
      </thead>
      <tbody>
        ${missingB_HTML}
      </tbody>
    </table>

    <div style="margin-top: 60px; border-top: 1px solid #e2e8f0; padding-top: 25px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b;">
      <span>Compiled securely by <strong>DataRecon Suite</strong> Workspace Engine</span>
      <span>Timestamp: ${new Date().toLocaleString()}</span>
    </div>
  </div>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `executive_reconciliation_report_${result.taskName}.html`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Exporter handler
  const exportToCSV = (type: TabType) => {
    let headers: string[] = [];
    let rows: any[] = [];
    let filename = `reconciliation_${type}_report.csv`;

    if (type === 'matches') {
      if (matches.length > 0) {
        headers = Object.keys(matches[0]);
        rows = matches;
      } else {
        headers = ['Info'];
        rows = [{ Info: 'No exact matches found' }];
      }
    } else if (type === 'missing_in_a') {
      if (missingInA.length > 0) {
        headers = Object.keys(missingInA[0]);
        rows = missingInA;
      } else {
        headers = ['Info'];
        rows = [{ Info: 'No missing rows in Dataset A' }];
      }
    } else if (type === 'missing_in_b') {
      if (missingInB.length > 0) {
        headers = Object.keys(missingInB[0]);
        rows = missingInB;
      } else {
        headers = ['Info'];
        rows = [{ Info: 'No missing rows in Dataset B' }];
      }
    } else if (type === 'discrepancies') {
      headers = ['Primary Key (A/B Matching Value)', 'Field with Discrepancy', `Value in ${fileAName} (A)`, `Value in ${fileBName} (B)`];
      if (mismatches.length > 0) {
        mismatches.forEach(m => {
          m.discrepancies.forEach(d => {
            rows.push({
              'Primary Key (A/B Matching Value)': m.primaryKey,
              'Field with Discrepancy': d.field,
              [`Value in ${fileAName} (A)`]: d.valA === null ? '<null>' : d.valA,
              [`Value in ${fileBName} (B)`]: d.valB === null ? '<null>' : d.valB,
            });
          });
        });
      } else {
        rows = [{ 'Primary Key (A/B Matching Value)': 'No field discrepancies identified' }];
      }
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(row => headers.map(h => {
        const val = row[h] === undefined || row[h] === null ? '' : String(row[h]);
        if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filters results based on search keywords
  const filterMismatches = mismatches.filter(m => {
    if (!searchQuery) return true;
    const term = searchQuery.toLowerCase();
    const pkMatch = m.primaryKey.toLowerCase().includes(term);
    const colMatch = m.discrepancies.some(d => d.field.toLowerCase().includes(term) || String(d.valA).toLowerCase().includes(term) || String(d.valB).toLowerCase().includes(term));
    return pkMatch || colMatch;
  });

  const filterRows = (rowsList: RowData[], primaryKeyName: string) => {
    return rowsList.filter(r => {
      if (!searchQuery) return true;
      const term = searchQuery.toLowerCase();
      const pkVal = String(r[primaryKeyName] || '').toLowerCase();
      const anyCell = Object.values(r).some(val => String(val || '').toLowerCase().includes(term));
      return pkVal.includes(term) || anyCell;
    });
  };

  const currentMatchesFiltered = filterRows(matches, primaryKeyA);
  const currentMissingAFiltered = filterRows(missingInA, primaryKeyB);
  const currentMissingBFiltered = filterRows(missingInB, primaryKeyA);

  return (
    <div className="flex flex-col gap-6 text-white">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
        <div>
          <span className="text-xs text-indigo-400 font-bold tracking-wider uppercase flex items-center gap-1.5">
            <Activity size={13} className="text-indigo-450 animate-pulse" />
            Audit Report Output
          </span>
          <h2 className="text-2xl font-black text-white bg-gradient-to-r from-white via-indigo-150 to-slate-200 bg-clip-text text-transparent mt-1 leading-snug">{result.taskName}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-xs text-slate-400 font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 shadow-md shadow-indigo-550/50"></span>
              Dataset A (Primary: <span className="font-mono text-indigo-300 bg-indigo-950/45 px-1.5 py-0.5 rounded text-[11.5px] font-bold border border-indigo-900/40">{primaryKeyA}</span>): {fileAName} (Total Rows: <span className="font-bold text-white font-mono">{totalA}</span>)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-violet-500 shadow-md shadow-violet-550/50"></span>
              Dataset B (Primary: <span className="font-mono text-violet-300 bg-violet-950/45 px-1.5 py-0.5 rounded text-[11.5px] font-bold border border-violet-900/40">{primaryKeyB}</span>): {fileBName} (Total Rows: <span className="font-bold text-white font-mono">{totalB}</span>)
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={exportToExecutiveHTML}
            className="flex items-center gap-1.5 text-xs font-bold text-[#cbcfdc] glass-button px-4 py-2.5 rounded-xl transition shadow-xl cursor-pointer"
          >
            <FileText size={15} className="text-indigo-400" />
            Extract Executive Report (Print/PDF)
          </button>
          
          <button
            onClick={onReset}
            className="text-xs font-bold text-white glass-button-primary px-4 py-2.5 rounded-xl transition cursor-pointer"
          >
            Reconcile New Files
          </button>
        </div>
      </div>

      {/* Grid count cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Dataset A Count */}
        <div 
          className="glass-panel border border-white/[0.04] p-5 rounded-2xl flex flex-col gap-2 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Dataset A Total</span>
            <span className="h-7 w-7 rounded-full bg-[#0b0f19] border border-white/5 flex items-center justify-center shadow-inner">
              <FileSpreadsheet size={14} className="text-indigo-400" />
            </span>
          </div>
          <span className="text-2xl font-black text-indigo-300 font-mono">{counts.datasetARows}</span>
          <span className="text-[10px] text-slate-400 font-semibold truncate" title={fileAName}>{fileAName}</span>
        </div>

        {/* Dataset B Count */}
        <div 
          className="glass-panel border border-white/[0.04] p-5 rounded-2xl flex flex-col gap-2 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Dataset B Total</span>
            <span className="h-7 w-7 rounded-full bg-[#0b0f19] border border-white/5 flex items-center justify-center shadow-inner">
              <FileSpreadsheet size={14} className="text-violet-400" />
            </span>
          </div>
          <span className="text-2xl font-black text-violet-300 font-mono">{counts.datasetBRows}</span>
          <span className="text-[10px] text-slate-400 font-semibold truncate" title={fileBName}>{fileBName}</span>
        </div>

        {/* Exact Matches Cards */}
        <div 
          onClick={() => setActiveTab('matches')}
          className={`cursor-pointer border p-5 rounded-2xl transition flex flex-col gap-2 shadow-2xl ${
            activeTab === 'matches' 
              ? 'bg-emerald-500/[0.08] border-emerald-500/40 text-emerald-200' 
              : 'glass-panel border-white/[0.04] hover:bg-white/4 hover:border-white/10 text-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Exact Matches</span>
            <span className="h-7 w-7 rounded-full bg-emerald-950/50 text-emerald-400 border border-emerald-900/40 flex items-center justify-center shadow-inner">
              <CheckCircle size={15} />
            </span>
          </div>
          <span className="text-2xl font-black text-slate-100 font-mono">{counts.matches}</span>
          <span className="text-[10px] text-slate-450 font-semibold">Rows fully matching</span>
        </div>

        {/* Value Discrepancies */}
        <div 
          onClick={() => setActiveTab('discrepancies')}
          className={`cursor-pointer border p-5 rounded-2xl transition flex flex-col gap-2 shadow-2xl ${
            activeTab === 'discrepancies' 
              ? 'bg-rose-500/[0.08] border-rose-500/40 text-rose-200' 
              : 'glass-panel border-white/[0.04] hover:bg-white/4 hover:border-white/10 text-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Discrepancies</span>
            <span className="h-7 w-7 rounded-full bg-rose-950/50 text-rose-450 border border-rose-900/40 flex items-center justify-center shadow-inner">
              <ArrowLeftRight size={14} />
            </span>
          </div>
          <span className="text-2xl font-black text-slate-100 font-mono">{counts.mismatches}</span>
          <span className="text-[10px] text-rose-400 font-bold">
            {counts.totalDiscrepantCells ?? 0} discrepant cell{(counts.totalDiscrepantCells ?? 0) === 1 ? '' : 's'}
          </span>
        </div>

        {/* Missing in A */}
        <div 
          onClick={() => setActiveTab('missing_in_a')}
          className={`cursor-pointer border p-5 rounded-2xl transition flex flex-col gap-2 shadow-2xl ${
            activeTab === 'missing_in_a' 
              ? 'bg-amber-500/[0.08] border-amber-500/40 text-amber-200' 
              : 'glass-panel border-white/[0.04] hover:bg-white/4 hover:border-white/10 text-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Missing in A (Added B)</span>
            <span className="h-7 w-7 rounded-full bg-amber-950/50 text-amber-400 border border-amber-900/40 flex items-center justify-center shadow-inner">
              <AlertTriangle size={14} />
            </span>
          </div>
          <span className="text-2xl font-black text-slate-100 font-mono">{counts.missingInA}</span>
          <span className="text-[10px] text-slate-450 font-semibold">Added in B only</span>
        </div>

        {/* Missing in B (Deleted B) */}
        <div 
          onClick={() => setActiveTab('missing_in_b')}
          className={`cursor-pointer border p-5 rounded-2xl transition flex flex-col gap-2 shadow-2xl ${
            activeTab === 'missing_in_b' 
              ? 'bg-indigo-500/[0.08] border-indigo-500/40 text-indigo-200' 
              : 'glass-panel border-white/[0.04] hover:bg-white/4 hover:border-white/10 text-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Missing in B (Deleted)</span>
            <span className="h-7 w-7 rounded-full bg-indigo-950/50 text-indigo-400 border border-indigo-900/40 flex items-center justify-center shadow-inner">
              <FolderMinus size={14} />
            </span>
          </div>
          <span className="text-2xl font-black text-slate-100 font-mono">{counts.missingInB}</span>
          <span className="text-[10px] text-slate-450 font-semibold">Missing/deleted in B</span>
        </div>
      </div>

      {/* Explorer Controls */}
      <div className="glass-panel border border-white/[0.04] rounded-2xl shadow-2xl flex flex-col mt-2 overflow-hidden">
        <div className="p-5 border-b border-white/[0.06] flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-white/[0.02]">
          <div className="flex items-center gap-3 overflow-x-auto pb-2 lg:pb-0">
            <div className="flex rounded-xl border border-white/5 bg-slate-950 p-0.5">
              <button
                onClick={() => { setActiveTab('analytics'); setSearchQuery(''); }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                  activeTab === 'analytics' ? 'bg-indigo-600/80 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/3'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Activity size={13} />
                  Analytics & Insights
                </div>
              </button>
              <button
                onClick={() => { setActiveTab('discrepancies'); setSearchQuery(''); }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                  activeTab === 'discrepancies' ? 'bg-indigo-600/80 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/3'
                }`}
              >
                Discrepancies ({counts.mismatches})
              </button>
              <button
                onClick={() => { setActiveTab('matches'); setSearchQuery(''); }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                  activeTab === 'matches' ? 'bg-indigo-600/80 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/3'
                }`}
              >
                Exact Matches ({counts.matches})
              </button>
              <button
                onClick={() => { setActiveTab('missing_in_a'); setSearchQuery(''); }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                  activeTab === 'missing_in_a' ? 'bg-indigo-600/80 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/3'
                }`}
              >
                Missing in A ({counts.missingInA})
              </button>
              <button
                onClick={() => { setActiveTab('missing_in_b'); setSearchQuery(''); }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                  activeTab === 'missing_in_b' ? 'bg-indigo-600/80 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/3'
                }`}
              >
                Missing in B ({counts.missingInB})
              </button>
            </div>
          </div>

          {activeTab !== 'analytics' && (
            <div className="flex items-center gap-2">
              {/* Search Input */}
              <div className="relative flex-1 sm:w-56">
                <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
                <input
                  type="text"
                  placeholder="Search table rows..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full text-white bg-slate-900/60 focus:bg-[#070b14] border border-white/10 rounded-xl pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:border-indigo-400 font-semibold placeholder-slate-500"
                />
              </div>
              {/* Download Export */}
              <button
                onClick={() => exportToCSV(activeTab)}
                className="flex items-center gap-1.5 text-xs text-[#cbcfdc] glass-button rounded-xl px-4 py-2 hover:bg-white/5 transition-all font-bold cursor-pointer"
              >
                <Download size={14} className="text-indigo-400" />
                Export CSV
              </button>
            </div>
          )}
        </div>

        {/* Tab display list grids */}
        <div className="overflow-x-auto min-h-[220px]">
          
          {/* TAB 0: ANALYTICS DASHBOARD */}
          {activeTab === 'analytics' && (
            <div className="p-6 flex flex-col gap-8 bg-[#070b14]/10">
              
              {/* Row 1: score cards and visual proportional stacked bar */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Score Dial Gauge */}
                <div className="glass-panel border border-white/[0.04] rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center justify-between min-h-[240px]">
                  <div>
                    <h4 className="text-xs font-bold text-slate-350 uppercase tracking-widest">Alignment Score</h4>
                    <p className="text-[11px] text-slate-400 mt-1.5 max-w-[200px] leading-relaxed">Parity percentage of total aligned primary keys between data sources</p>
                  </div>
                  
                  {/* Circular visual Dial SVG */}
                  <div className="relative w-32 h-32 my-2 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r="52"
                        className="stroke-white/5"
                        strokeWidth="11"
                        fill="none"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="52"
                        style={{
                          strokeDasharray: '326.7',
                          strokeDashoffset: `${326.7 - (326.7 * (harmonyRate ?? 0)) / 100}`,
                          transition: 'stroke-dashoffset 1s ease-in-out',
                        }}
                        className={`stroke-indigo-450 ${harmonyRate === 100 ? 'stroke-emerald-400' : 'stroke-indigo-455'}`}
                        strokeWidth="11"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-black text-white leading-none font-mono">{harmonyRate}%</span>
                      <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-450 mt-1.5">Parity</span>
                    </div>
                  </div>

                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    harmonyRate === 100 
                      ? 'bg-emerald-50 text-emerald-800' 
                      : harmonyRate > 80 
                      ? 'bg-blue-50 text-blue-800' 
                      : 'bg-rose-50/80 text-rose-850'
                  }`}>
                    {harmonyRate === 100 ? 'System Flawless' : harmonyRate > 80 ? 'System Moderate Parity' : 'Discrepant Disjunct'}
                  </span>
                </div>

                {/* Stacked Proportional Distribution Bar */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs flex flex-col justify-between col-span-1 lg:col-span-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Core Parity Distribution Statement</h4>
                    <p className="text-[11px] text-slate-500 mt-1">Numerical breakdown of matched references, deletes, additions, or field modifications relative to total workspace capacity ({counts.matches + counts.mismatches + counts.missingInA + counts.missingInB} slots)</p>
                  </div>

                  <div className="my-6">
                    {/* Multi-segment stacked horizontal bar */}
                    <div className="h-7 w-full bg-slate-100 rounded-xl overflow-hidden flex shadow-xs border border-slate-200">
                      {counts.matches > 0 && (
                        <div 
                          style={{ width: `${(counts.matches / maxRows) * 100}%` }} 
                          className="bg-emerald-400 h-full hover:brightness-105 transition-all text-white flex items-center justify-center text-[10px] font-bold shadow-inner"
                          title={`Exact Matches: ${counts.matches}`}
                        >
                          {Math.round((counts.matches / maxRows) * 100) > 8 ? `${Math.round((counts.matches / maxRows) * 100)}% Match` : ''}
                        </div>
                      )}
                      {counts.mismatches > 0 && (
                        <div 
                          style={{ width: `${(counts.mismatches / maxRows) * 100}%` }} 
                          className="bg-indigo-500 h-full hover:brightness-105 transition-all text-white flex items-center justify-center text-[10px] font-bold"
                          title={`Value Discrepancies: ${counts.mismatches}`}
                        >
                          {Math.round((counts.mismatches / maxRows) * 100) > 8 ? `Discrepant` : ''}
                        </div>
                      )}
                      {counts.missingInA > 0 && (
                        <div 
                          style={{ width: `${(counts.missingInA / maxRows) * 100}%` }} 
                          className="bg-amber-400 h-full hover:brightness-105 transition-all text-white flex items-center justify-center text-[10px] font-bold"
                          title={`Added in B: ${counts.missingInA}`}
                        >
                          {Math.round((counts.missingInA / maxRows) * 100) > 8 ? `Adds` : ''}
                        </div>
                      )}
                      {counts.missingInB > 0 && (
                        <div 
                          style={{ width: `${(counts.missingInB / maxRows) * 100}%` }} 
                          className="bg-rose-500 h-full hover:brightness-105 transition-all text-white flex items-center justify-center text-[10px] font-bold"
                          title={`Missing/Deleted in B: ${counts.missingInB}`}
                        >
                          {Math.round((counts.missingInB / maxRows) * 100) > 8 ? `Delete` : ''}
                        </div>
                      )}
                    </div>

                    {/* Chart Legend Labels */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-[11px] font-semibold text-slate-650">
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded bg-emerald-400"></span>
                        Exact Parity Matches ({counts.matches} rows)
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded bg-indigo-500"></span>
                        Value Discrepancies ({counts.mismatches} rows)
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded bg-amber-400"></span>
                        Added B / Missing A ({counts.missingInA} rows)
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded bg-rose-500"></span>
                        Deleted B / Missing B ({counts.missingInB} rows)
                      </span>
                    </div>
                  </div>

                  {/* Summary quick observations statement */}
                  <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 flex items-start gap-2.5">
                    <Sparkles size={14} className="text-indigo-650 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                      Parity ratio evaluation specifies that <strong>{counts.matches}</strong> elements have matched perfectly, while exactly <strong>{counts.missingInB} records from file A were deleted/missing</strong> in B, and <strong>{counts.missingInA} records are added</strong> extras in dataset B.
                    </p>
                  </div>
                </div>
              </div>

              {/* Row 2: Transpose Discrepancy analysis of fields & numeric variations */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Transpose field level frequency analysis bar charts */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs flex flex-col gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Transpose Discrepancy Analysis (Counts by Column)</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">Cell discrepancy sum counts calculated and grouped per column/field attribute matches</p>
                  </div>

                  <div className="space-y-4 pt-2">
                    {Object.keys(fieldDiscounts).length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400 italic">No field differences recognized across mapped registries.</div>
                    ) : (
                      Object.entries(fieldDiscounts).map(([field, count], index) => {
                        const totalMismatches = counts.mismatches || 1;
                        const pctOfMismatches = Math.round((count / totalMismatches) * 100);
                        return (
                          <div key={index} className="flex flex-col gap-1.5 hover:bg-slate-50/40 p-1.5 rounded transition">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-mono bg-indigo-50/50 text-indigo-700 px-2 py-0.5 rounded font-bold border border-indigo-100/50">{field}</span>
                              <span className="text-slate-500 font-bold font-mono">
                                {count} differences <span className="text-[10px] text-slate-400">({pctOfMismatches}%)</span>
                              </span>
                            </div>
                            
                            {/* Horizontal progress visualization */}
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                style={{ width: `${pctOfMismatches}%` }}
                                className="bg-indigo-550 h-full rounded-full transition-all"
                              ></div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Numerical column sum variance (Financial audit insights) */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs flex flex-col justify-between min-h-[250px]">
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cumulative Numerical Variance Tracker</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">Math sum aggregates of numeric cols (Amount, Balance) across divergent rows</p>
                  </div>

                  <div className="flex-1 my-4 space-y-3.5 max-h-[160px] overflow-y-auto pr-1">
                    {numericVariances.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-4">
                        <span className="text-slate-350 text-xl font-bold">Parity</span>
                        <p className="text-[11px] text-slate-400 max-w-[250px] mt-1 italic">No float or numerical differences detected across records.</p>
                      </div>
                    ) : (
                      numericVariances.map((variance, idx) => {
                        const isB_Higher = variance.netDiff > 0;
                        const isNearZero = Math.abs(variance.netDiff) < 0.001;
                        return (
                          <div key={idx} className="bg-slate-50 border border-slate-150 p-3.5 rounded-xl flex flex-col gap-2">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-750">
                              <span className="text-slate-800">Field: <span className="font-mono text-xs bg-slate-200 px-1 py-0.5 rounded font-bold">{variance.field}</span></span>
                              <span className={`flex items-center gap-1 font-mono font-bold ${
                                isNearZero 
                                  ? 'text-slate-500' 
                                  : isB_Higher 
                                  ? 'text-emerald-600' 
                                  : 'text-rose-600'
                              }`}>
                                {isNearZero ? '' : isB_Higher ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                                {variance.netDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} (Net Diff)
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-[10px]">
                              <div className="flex flex-col gap-0.5 border-r border-slate-200">
                                <span className="text-slate-400 uppercase font-bold">Sum in {fileAName} (A)</span>
                                <span className="font-mono font-bold text-slate-700">{variance.sumA.toLocaleString()}</span>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-slate-400 uppercase font-bold">Sum in {fileBName} (B)</span>
                                <span className="font-mono font-bold text-slate-700">{variance.sumB.toLocaleString()}</span>
                              </div>
                            </div>
                            
                            <div className="text-[10px] text-slate-500 border-t border-slate-150 pt-1.5 flex justify-between font-medium">
                              <span>Average discrepant segment variance:</span>
                              <span className="font-mono font-bold text-slate-700">{variance.avgVariance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <p className="text-[10px] text-slate-400 leading-normal italic font-medium">
                    Calculated directly through the mathematical aggregate summation of matched rows containing contrasting numeric types.
                  </p>
                </div>

              </div>

            </div>
          )}

          {/* TAB 1: VALUE DISCREPANCIES */}
          {activeTab === 'discrepancies' && (
            <div className="p-0">
              {filterMismatches.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-xs font-semibold text-slate-500">
                    {mismatches.length === 0 ? 'Hooray! No mismatched fields found.' : 'No search results match current keyword.'}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] font-bold border-b border-slate-100">
                      <th className="py-3 px-6">Row Index (A/B)</th>
                      <th className="py-3 px-6">Primary Key Value</th>
                      <th className="py-3 px-6">Audited Discrepant Field</th>
                      <th className="py-3 px-6 bg-rose-50/20 text-rose-800 font-semibold border-r border-slate-100">Dataset A: {fileAName}</th>
                      <th className="py-3 px-6 bg-emerald-50/20 text-emerald-800 font-bold">Dataset B: {fileBName}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filterMismatches.map((m, idx) => (
                      <React.Fragment key={idx}>
                        {m.discrepancies.map((d, dIdx) => (
                          <tr key={`${idx}-${dIdx}`} className="hover:bg-slate-50/55 transition-colors">
                            {dIdx === 0 && (
                              <td 
                                className="py-3 px-6 text-xs text-slate-500 border-r border-slate-50 font-mono align-middle"
                                rowSpan={m.discrepancies.length}
                              >
                                Row #{m.rowAIndex + 1} / #{m.rowBIndex + 1}
                              </td>
                            )}
                            {dIdx === 0 && (
                              <td 
                                className="py-3 px-6 text-sm font-bold text-slate-800 border-r border-slate-50 align-middle"
                                rowSpan={m.discrepancies.length}
                              >
                                {m.primaryKey}
                              </td>
                            )}
                            <td className="py-3 px-6 text-sm font-semibold text-slate-600">
                              <span className="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-xs">
                                {d.field}
                              </span>
                            </td>
                            <td className="py-3 px-6 text-xs bg-rose-50/10 text-rose-600 font-semibold font-mono border-r border-slate-100">
                              {d.valA === null || d.valA === undefined ? (
                                <span className="text-slate-400 italic font-sans text-[11px]">&lt;blank&gt;</span>
                              ) : (
                                String(d.valA)
                              )}
                            </td>
                            <td className="py-3 px-6 text-xs bg-emerald-50/10 text-emerald-600 font-semibold font-mono">
                              {d.valB === null || d.valB === undefined ? (
                                <span className="text-slate-400 italic font-sans text-[11px]">&lt;blank&gt;</span>
                              ) : (
                                String(d.valB)
                              )}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 2: EXACT MATCHES */}
          {activeTab === 'matches' && (
            <div className="p-0">
              {currentMatchesFiltered.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-xs font-semibold text-slate-500">
                    {matches.length === 0 ? 'No fully matched documents identified.' : 'No rows match current search.'}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] font-bold border-b border-slate-100">
                      <th className="py-3 px-6">Row Item</th>
                      <th className="py-3 px-6">Primary Key Value ({primaryKeyA})</th>
                      {Object.keys(matches[0] || {})
                        .filter(col => col !== primaryKeyA)
                        .slice(0, 4)
                        .map((col, idx) => (
                          <th key={idx} className="py-3 px-6 font-medium text-slate-600">{col}</th>
                        ))}
                      {Object.keys(matches[0] || {}).length > 5 && (
                        <th className="py-3 px-6 text-slate-400 font-light italic">+{Object.keys(matches[0]).length - 5} cols</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentMatchesFiltered.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/40 text-xs">
                        <td className="py-3 px-6 text-xs text-slate-400 font-mono">#{idx + 1}</td>
                        <td className="py-3 px-6 font-bold text-slate-800">{String(row[primaryKeyA] || '')}</td>
                        {Object.keys(row)
                          .filter(col => col !== primaryKeyA)
                          .slice(0, 4)
                          .map((col, colIdx) => (
                            <td key={colIdx} className="py-3 px-6 text-slate-600 font-mono truncate max-w-[150px]">
                              {row[col] === null || row[col] === undefined ? '-' : String(row[col])}
                            </td>
                          ))}
                        {Object.keys(row).length > 5 && (
                          <td className="py-3 px-6 text-slate-400 italic text-[11px]">...</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 3: MISSING IN A */}
          {activeTab === 'missing_in_a' && (
            <div className="p-0">
              {currentMissingAFiltered.length === 0 ? (
                <div className="py-12 text-center text-slate-450">
                  <p className="text-xs font-semibold text-slate-500">
                    {missingInA.length === 0 ? `Zero discrepancies. All rows from ${fileBName} match keys in ${fileAName}.` : 'No search rows match keyword.'}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="px-6 py-3 bg-amber-50 text-amber-800 text-xs font-semibold flex items-center gap-1.5 border-b border-amber-100">
                    <AlertTriangle size={13} className="text-amber-500 mt-0.5" />
                    These records exist inside Dataset B: {fileBName} but do NOT have corresponding primary keys in A: {fileAName}.
                  </div>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] font-bold border-b border-slate-100">
                        <th className="py-3 px-6">Row Index</th>
                        <th className="py-3 px-6">Primary Key Value ({primaryKeyB})</th>
                        {Object.keys(missingInA[0] || {})
                          .filter(col => col !== primaryKeyB)
                          .slice(0, 4)
                          .map((col, idx) => (
                            <th key={idx} className="py-3 px-6 font-medium text-slate-600">{col}</th>
                          ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentMissingAFiltered.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/40 text-xs animation-fade">
                          <td className="py-3 px-6 text-xs text-slate-400 font-mono">#{idx + 1}</td>
                          <td className="py-3 px-6 font-bold text-amber-700 bg-amber-50/10">{String(row[primaryKeyB] || '')}</td>
                          {Object.keys(row)
                            .filter(col => col !== primaryKeyB)
                            .slice(0, 4)
                            .map((col, colIdx) => (
                              <td key={colIdx} className="py-3 px-6 text-slate-600 font-mono truncate max-w-[150px]">
                                {row[col] === null || row[col] === undefined ? '-' : String(row[col])}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MISSING IN B */}
          {activeTab === 'missing_in_b' && (
            <div className="p-0">
              {currentMissingBFiltered.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-xs font-semibold text-slate-500">
                    {missingInB.length === 0 ? `Zero discrepancies. All rows from ${fileAName} match keys in ${fileBName}.` : 'No search rows match keyword.'}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="px-6 py-3 bg-rose-50 text-rose-800 text-xs font-semibold flex items-center gap-1.5 border-b border-rose-100">
                    <FolderMinus size={13} className="text-rose-500" />
                    These records exist inside Dataset A: {fileAName} but do NOT have corresponding primary keys in B: {fileBName} (records deleted in Dataset B).
                  </div>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] font-bold border-b border-slate-100">
                        <th className="py-3 px-6">Row Index</th>
                        <th className="py-3 px-6">Primary Key Value ({primaryKeyA})</th>
                        {Object.keys(missingInB[0] || {})
                          .filter(col => col !== primaryKeyA)
                          .slice(0, 4)
                          .map((col, idx) => (
                            <th key={idx} className="py-3 px-6 font-medium text-slate-600">{col}</th>
                          ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentMissingBFiltered.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/40 text-xs animation-fade">
                          <td className="py-3 px-6 text-xs text-slate-400 font-mono">#{idx + 1}</td>
                          <td className="py-3 px-6 font-bold text-rose-700 bg-rose-50/10">{String(row[primaryKeyA] || '')}</td>
                          {Object.keys(row)
                            .filter(col => col !== primaryKeyA)
                            .slice(0, 4)
                            .map((col, colIdx) => (
                              <td key={colIdx} className="py-3 px-6 text-slate-600 font-mono truncate max-w-[150px]">
                                {row[col] === null || row[col] === undefined ? '-' : String(row[col])}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
