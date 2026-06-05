export interface TaskMetadata {
  id: number;
  taskName: string;
  tableName: string;
  fileAName: string;
  fileBName: string;
  createdAt: string;
  expiresAt: string;
  isSaved: boolean;
}

export type RowData = Record<string, any>;

export interface Dataset {
  name: string;
  headers: string[];
  rows: RowData[];
}

export interface DiscrepancyField {
  field: string;
  valA: any;
  valB: any;
}

export interface DiscrepancyRow {
  primaryKey: string;
  rowAIndex: number;
  rowBIndex: number;
  discrepancies: DiscrepancyField[];
}

export interface ReconciliationResult {
  taskName: string;
  fileAName: string;
  fileBName: string;
  primaryKeyA: string;
  primaryKeyB: string;
  counts: {
    datasetARows: number;
    datasetBRows: number;
    matches: number;
    mismatches: number;
    missingInA: number;
    missingInB: number;
    totalDiscrepantCells?: number;
    fieldDiscrepancyCounts?: Record<string, number>;
  };
  matches: RowData[]; // exact matches
  mismatches: DiscrepancyRow[]; // primary key matches but other column values differ
  missingInA: RowData[]; // rows in B but not in A (based on primary key check)
  missingInB: RowData[]; // rows in A but not in B (based on primary key check)
}

export interface SavedTaskListItem {
  id: number;
  taskName: string;
  tableName: string;
  fileAName: string;
  fileBName: string;
  createdAt: string;
  expiresAt: string;
  isSaved: boolean;
  status: 'active' | 'expired';
}

export interface User {
  id: number;
  username: string;
  worksCount: number;
  licenseExpiresAt: string | null;
  createdAt: string;
}

export interface LicenseKey {
  id: number;
  keyValue: string;
  expiresAt: string;
  isUsed: boolean;
  usedBy: string | null;
  createdAt: string;
}

