import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// High limit on payload to support larger CSV/Excel files
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ----------------------------------------------------
// Database Connectivity & Simulated Storage Fallback
// ----------------------------------------------------
let dbPool: Pool | null = null;
let useSimulatedDb = false;

// Simulated in-memory database structure
interface SimulatedTask {
  id: number;
  task_name: string;
  table_name: string;
  file_a_name: string;
  file_b_name: string;
  created_at: Date;
  expires_at: Date;
  is_saved: boolean;
  dataset_a_rows: any[];
  dataset_b_rows: any[];
  owner?: string;
}

interface SimulatedUser {
  id: number;
  username: string;
  password_hash: string;
  works_count: number;
  license_expires_at: Date | null;
  created_at: Date;
}

interface SimulatedLicenseKey {
  id: number;
  key_value: string;
  expires_at: Date;
  is_used: boolean;
  used_by: string | null;
  created_at: Date;
}

let simulatedTasksTable: SimulatedTask[] = [];
let simulatedUsers: SimulatedUser[] = [];
let simulatedLicenseKeys: SimulatedLicenseKey[] = [];


function initDb() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  const database = process.env.DB_DATABASE || 'reconciliation_db';
  const user = process.env.DB_USER || 'recon_user';
  const password = process.env.DB_PASSWORD || 'secure_password';

  try {
    dbPool = new Pool({
      host,
      port,
      database,
      user,
      password,
      connectionTimeoutMillis: 3000,
    });

    dbPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });

    console.log(`Database pool configured for ${host}:${port}/${database}`);
  } catch (error) {
    console.error('Could not initiate PostgreSQL pool, enabling local simulation fallback:', error);
    useSimulatedDb = true;
  }
}

async function verifySchemaAndConnection() {
  if (useSimulatedDb || !dbPool) return;

  try {
    console.log('Attempting connection to PostgreSQL...');
    const client = await dbPool.connect();
    console.log('Successfully connected to PostgreSQL!');
    
    // Create the master metadata registry table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reconciliation_metadata (
        id SERIAL PRIMARY KEY,
        task_name VARCHAR(255) NOT NULL,
        table_name VARCHAR(255) NOT NULL UNIQUE,
        file_a_name VARCHAR(255) NOT NULL,
        file_b_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        is_saved BOOLEAN DEFAULT TRUE
      );
    `);

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        works_count INT DEFAULT 0,
        license_expires_at TIMESTAMP DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create license_keys table
    await client.query(`
      CREATE TABLE IF NOT EXISTS license_keys (
        id SERIAL PRIMARY KEY,
        key_value VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        used_by VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration for adding owner field to tracking metadata
    await client.query(`
      ALTER TABLE reconciliation_metadata ADD COLUMN IF NOT EXISTS owner VARCHAR(255) DEFAULT 'anonymous';
    `);
    
    client.release();
    console.log('PostgreSQL schema verification completed successfully.');
  } catch (error) {
    console.warn(
      'PostgreSQL is not reachable or database does not exist. ' +
      'Using high-performance simulated in-memory storage for AI Studio preview environment.',
      error
    );
    useSimulatedDb = true;
  }
}

// ----------------------------------------------------
// Automatic Cleanup Logic (7-day rule)
// ----------------------------------------------------
async function runAutoCleanup() {
  const now = new Date();
  
  if (useSimulatedDb) {
    // 1. Memory simulation cleanup
    const beforeCount = simulatedTasksTable.length;
    simulatedTasksTable = simulatedTasksTable.filter(task => {
      const expired = new Date(task.expires_at) < now && task.is_saved;
      if (expired) {
        console.log(`[Simulation Cleanup] Dropping expired memory table: ${task.table_name}`);
      }
      return !expired;
    });
    const droppedCount = beforeCount - simulatedTasksTable.length;
    if (droppedCount > 0) {
      console.log(`[Simulation Cleanup] Completed. Dropped ${droppedCount} expired task(s).`);
    }
    return;
  }

  // 2. PostgreSQL active cleanup
  if (!dbPool) return;
  let client;
  try {
    client = await dbPool.connect();
    
    const expiredTasksQuery = await client.query(
      `SELECT id, table_name, task_name FROM reconciliation_metadata WHERE expires_at < NOW()`
    );
    
    for (const task of expiredTasksQuery.rows) {
      const tableName = task.table_name;
      console.log(`[PostgreSQL Cleanup] Dropping expired task table: ${tableName} ("${task.task_name}")`);
      
      // Sanitized drop identifier query
      const sanitizedName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
      await client.query(`DROP TABLE IF EXISTS ${sanitizedName}`);
      
      // Remove metadata entry
      await client.query(`DELETE FROM reconciliation_metadata WHERE id = $1`, [task.id]);
    }
  } catch (err) {
    console.error('Error executing automated database table cleanup:', err);
  } finally {
    if (client) client.release();
  }
}

// Helper to sanitize dynamic string to valid SQL table name
function sanitizeSqlIdentifier(str: string): string {
  const clean = str.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  // Ensure starts with a letter or underscore
  if (/^[0-9]/.test(clean)) {
    return 'task_' + clean;
  }
  return clean || 'task_reconcile';
}

// ----------------------------------------------------
// Core Reconciliation Calculation Engine
// ----------------------------------------------------
interface ComparisonPayload {
  taskName: string;
  fileAName: string;
  fileBName: string;
  primaryKeyA: string;
  primaryKeyB: string;
  datasetA: any[];
  datasetB: any[];
}

function reconcileDatasets(payload: ComparisonPayload) {
  const { taskName, fileAName, fileBName, primaryKeyA, primaryKeyB, datasetA, datasetB } = payload;
  
  const normalizeKey = (val: any): string => {
    if (val === undefined || val === null) return '';
    const s = String(val).trim();
    const n = Number(s);
    if (!isNaN(n) && s !== '') {
      return String(n);
    }
    return s.toLowerCase();
  };

  const mapA = new Map<string, { row: any; idx: number }>();
  const mapB = new Map<string, { row: any; idx: number }>();
  
  const keyCountsA = new Map<string, number>();
  const keyCountsB = new Map<string, number>();

  // Map rows of Dataset A with Case-Insensitive Suffix Occurrence mapping
  datasetA.forEach((row, idx) => {
    const rawVal = row[primaryKeyA];
    let baseKey = normalizeKey(rawVal);
    if (baseKey === '') {
      baseKey = '__blank__';
    }
    
    const occurrence = keyCountsA.get(baseKey) || 0;
    keyCountsA.set(baseKey, occurrence + 1);
    
    const finalKey = `${baseKey}__occ_${occurrence}`;
    mapA.set(finalKey, { row, idx });
  });

  // Map rows of Dataset B with Case-Insensitive Suffix Occurrence mapping
  datasetB.forEach((row, idx) => {
    const rawVal = row[primaryKeyB];
    let baseKey = normalizeKey(rawVal);
    if (baseKey === '') {
      baseKey = '__blank__';
    }
    
    const occurrence = keyCountsB.get(baseKey) || 0;
    keyCountsB.set(baseKey, occurrence + 1);
    
    const finalKey = `${baseKey}__occ_${occurrence}`;
    mapB.set(finalKey, { row, idx });
  });

  // Calculate loose column pairings automatically aligning matching headers (e.g. "Amount" matches "amount")
  const columnPairs: { colA: string; colB: string; label: string }[] = [];
  const keysA = datasetA.length > 0 ? Object.keys(datasetA[0]) : [];
  const keysB = datasetB.length > 0 ? Object.keys(datasetB[0]) : [];

  const candidateKeysA = keysA.filter(k => k !== primaryKeyA);
  const candidateKeysB = keysB.filter(k => k !== primaryKeyB);

  const normalizeHeader = (s: string): string => {
    return s.toLowerCase().replace(/[^a-zA-Z0-9]/g, '').trim();
  };

  const usedB = new Set<string>();

  candidateKeysA.forEach(colA => {
    // 1. Level-1: Direct exact character matches
    const exactMatch = candidateKeysB.find(colB => colB === colA && !usedB.has(colB));
    if (exactMatch) {
      columnPairs.push({ colA, colB: exactMatch, label: colA });
      usedB.add(exactMatch);
      return;
    }

    // 2. Level-2: Case-insensitive & trimmed character matches
    const caseMatch = candidateKeysB.find(
      colB => colB.trim().toLowerCase() === colA.trim().toLowerCase() && !usedB.has(colB)
    );
    if (caseMatch) {
      columnPairs.push({ colA, colB: caseMatch, label: colA });
      usedB.add(caseMatch);
      return;
    }

    // 3. Level-3: Normalized string (clearing symbols, underscores, lowercase)
    const normalizedMatch = candidateKeysB.find(
      colB => normalizeHeader(colB) === normalizeHeader(colA) && !usedB.has(colB)
    );
    if (normalizedMatch) {
      columnPairs.push({ colA, colB: normalizedMatch, label: colA });
      usedB.add(normalizedMatch);
    }
  });

  const exactMatches: any[] = [];
  const mismatches: any[] = [];
  const missingInA: any[] = [];
  const missingInB: any[] = [];

  // Comparison helper supporting floating numbers and cleaned-up characters
  const isEqual = (val1: any, val2: any): boolean => {
    if (val1 === val2) return true;
    if (val1 === null || val1 === undefined || val2 === null || val2 === undefined) {
      return (val1 === null || val1 === undefined) && (val2 === null || val2 === undefined);
    }
    const num1 = Number(val1);
    const num2 = Number(val2);
    if (!isNaN(num1) && !isNaN(num2) && String(val1).trim() !== '' && String(val2).trim() !== '') {
      return num1 === num2;
    }
    return String(val1).trim() === String(val2).trim();
  };

  // Field discrepancy counter (Transpose breakdown of discrepancies)
  const fieldDiscrepancyCounts: Record<string, number> = {};
  columnPairs.forEach(pair => {
    fieldDiscrepancyCounts[pair.label] = 0;
  });

  // Compare A to B (Exact matches, Mismatches, and Missing in B)
  mapA.forEach(({ row: rowA, idx: idxA }, key) => {
    const matchB = mapB.get(key);
    if (!matchB) {
      missingInB.push(rowA);
    } else {
      const { row: rowB, idx: idxB } = matchB;
      const discrepancies: any[] = [];

      columnPairs.forEach(pair => {
        const valA = rowA[pair.colA];
        const valB = rowB[pair.colB];
        if (!isEqual(valA, valB)) {
          discrepancies.push({
            field: pair.label,
            valA: valA === undefined ? null : valA,
            valB: valB === undefined ? null : valB,
          });
          fieldDiscrepancyCounts[pair.label] = (fieldDiscrepancyCounts[pair.label] || 0) + 1;
        }
      });

      if (discrepancies.length === 0) {
        exactMatches.push(rowA);
      } else {
        // Label clean key representation
        let pkDisplay = String(rowA[primaryKeyA] ?? '');
        if (pkDisplay.trim() === '') {
          pkDisplay = '<blank>';
        }
        
        // Suffix occurrence check if there are duplicates
        const occIndex = key.indexOf('__occ_');
        const occNum = occIndex !== -1 ? parseInt(key.substring(occIndex + 6), 10) : 0;
        if (occNum > 0) {
          pkDisplay += ` (Instance #${occNum + 1})`;
        }

        mismatches.push({
          primaryKey: pkDisplay,
          rowAIndex: idxA,
          rowBIndex: idxB,
          discrepancies,
        });
      }
    }
  });

  // Detect Missing in A (Keys in B that don't exist in A)
  mapB.forEach(({ row: rowB }, key) => {
    if (!mapA.has(key)) {
      missingInA.push(rowB);
    }
  });

  const totalDiscrepantCells = mismatches.reduce((sum, m) => sum + m.discrepancies.length, 0);

  return {
    taskName,
    fileAName,
    fileBName,
    primaryKeyA,
    primaryKeyB,
    counts: {
      datasetARows: datasetA.length,
      datasetBRows: datasetB.length,
      matches: exactMatches.length,
      mismatches: mismatches.length,
      missingInA: missingInA.length,
      missingInB: missingInB.length,
      totalDiscrepantCells,
      fieldDiscrepancyCounts,
    },
    matches: exactMatches,
    mismatches,
    missingInA,
    missingInB,
  };
}

// ----------------------------------------------------
// API REST Endpoints
// ----------------------------------------------------

/**
 * Health Endpoints
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    database: useSimulatedDb ? 'simulation' : 'postgres' 
  });
});

// ----------------------------------------------------
// Authentication & License Helper Functions
// ----------------------------------------------------
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateLicenseKeyValue(): string {
  const rand = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  return `RECON-${rand()}-${rand()}-${rand()}`;
}

async function getCurrentUser(req: express.Request) {
  const username = req.headers['x-username'];
  if (!username) return null;
  
  const cleanUsername = String(username).trim();
  if (!cleanUsername) return null;

  if (useSimulatedDb) {
    const user = simulatedUsers.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
    return user ? {
      id: user.id,
      username: user.username,
      works_count: user.works_count,
      license_expires_at: user.license_expires_at ? user.license_expires_at.toISOString() : null,
      created_at: user.created_at.toISOString()
    } : null;
  }

  if (!dbPool) return null;
  try {
    const { rows } = await dbPool.query('SELECT id, username, works_count, license_expires_at, created_at FROM users WHERE LOWER(username) = LOWER($1)', [cleanUsername]);
    if (rows.length === 0) return null;
    
    const r = rows[0];
    return {
      id: r.id,
      username: r.username,
      works_count: r.works_count,
      license_expires_at: r.license_expires_at ? new Date(r.license_expires_at).toISOString() : null,
      created_at: new Date(r.created_at).toISOString()
    };
  } catch (e) {
    console.error('Error fetching current user:', e);
    return null;
  }
}

/**
 * Auth & License endpoints
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const cleanUsername = username.trim();
    if (cleanUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
    }

    const hashedPassword = hashPassword(password);

    if (useSimulatedDb) {
      const exists = simulatedUsers.some(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
      if (exists) {
        return res.status(400).json({ error: 'Username already registered.' });
      }

      const newUser: SimulatedUser = {
        id: Date.now(),
        username: cleanUsername,
        password_hash: hashedPassword,
        works_count: 0,
        license_expires_at: null,
        created_at: new Date()
      };
      simulatedUsers.push(newUser);
      
      return res.json({
        success: true,
        user: {
          id: newUser.id,
          username: newUser.username,
          worksCount: newUser.works_count,
          licenseExpiresAt: null,
          createdAt: newUser.created_at.toISOString()
        }
      });
    }

    if (!dbPool) {
      throw new Error('Database pool not configured.');
    }

    // Check if user exists
    const checkQuery = await dbPool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [cleanUsername]);
    if (checkQuery.rows.length > 0) {
      return res.status(400).json({ error: 'Username already registered.' });
    }

    // Insert user
    const insertQuery = await dbPool.query(
      `INSERT INTO users (username, password_hash, works_count, license_expires_at) 
       VALUES ($1, $2, 0, NULL) RETURNING id, username, works_count, license_expires_at, created_at`,
      [cleanUsername, hashedPassword]
    );

    const createdUser = insertQuery.rows[0];
    return res.json({
      success: true,
      user: {
        id: createdUser.id,
        username: createdUser.username,
        worksCount: createdUser.works_count,
        licenseExpiresAt: createdUser.license_expires_at,
        createdAt: createdUser.created_at
      }
    });

  } catch (err: any) {
    console.error('Error in register:', err);
    res.status(500).json({ error: 'Failed to process registration.', details: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const cleanUsername = username.trim();
    const hashedPassword = hashPassword(password);

    if (useSimulatedDb) {
      const match = simulatedUsers.find(
        u => u.username.toLowerCase() === cleanUsername.toLowerCase() && u.password_hash === hashedPassword
      );
      if (!match) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      return res.json({
        success: true,
        user: {
          id: match.id,
          username: match.username,
          worksCount: match.works_count,
          licenseExpiresAt: match.license_expires_at ? match.license_expires_at.toISOString() : null,
          createdAt: match.created_at.toISOString()
        }
      });
    }

    if (!dbPool) {
      throw new Error('Database pool not configured.');
    }

    const { rows } = await dbPool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [cleanUsername]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const user = rows[0];
    if (user.password_hash !== hashedPassword) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        worksCount: user.works_count,
        licenseExpiresAt: user.license_expires_at ? new Date(user.license_expires_at).toISOString() : null,
        createdAt: new Date(user.created_at).toISOString()
      }
    });

  } catch (err: any) {
    console.error('Error in login:', err);
    res.status(500).json({ error: 'Failed to authenticate user.', details: err.message });
  }
});

app.get('/api/auth/profile', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized. Please login again.' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        worksCount: user.works_count,
        licenseExpiresAt: user.license_expires_at,
        createdAt: user.created_at
      }
    });
  } catch (err: any) {
    console.error('Error in profile fetch:', err);
    res.status(500).json({ error: 'Failed to fetch user state.', details: err.message });
  }
});

// Keys Administration & Viewer Section for User/Admin
app.get('/api/admin/keys', async (req, res) => {
  try {
    if (useSimulatedDb) {
      const keysList = simulatedLicenseKeys.map(k => ({
        id: k.id,
        keyValue: k.key_value,
        expiresAt: k.expires_at.toISOString(),
        isUsed: k.is_used,
        usedBy: k.used_by,
        createdAt: k.created_at.toISOString()
      }));
      return res.json(keysList);
    }

    if (!dbPool) {
      throw new Error('Database pool not configured.');
    }

    const { rows } = await dbPool.query('SELECT * FROM license_keys ORDER BY created_at DESC');
    const keysList = rows.map(r => ({
      id: r.id,
      keyValue: r.key_value,
      expiresAt: new Date(r.expires_at).toISOString(),
      isUsed: r.is_used,
      usedBy: r.used_by,
      createdAt: new Date(r.created_at).toISOString()
    }));

    res.json(keysList);
  } catch (err: any) {
    console.error('Error listing license keys:', err);
    res.status(500).json({ error: 'Failed to load license keys.' });
  }
});

app.post('/api/admin/keys/generate', async (req, res) => {
  try {
    const { daysCount } = req.body;
    const days = parseInt(daysCount || '365', 10);
    const code = generateLicenseKeyValue();
    
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + days);

    if (useSimulatedDb) {
      const newKey: SimulatedLicenseKey = {
        id: Date.now(),
        key_value: code,
        expires_at: expDate,
        is_used: false,
        used_by: null,
        created_at: new Date()
      };
      simulatedLicenseKeys.push(newKey);
      
      return res.json({
        success: true,
        key: {
          id: newKey.id,
          keyValue: newKey.key_value,
          expiresAt: newKey.expires_at.toISOString(),
          isUsed: newKey.is_used,
          usedBy: newKey.used_by,
          createdAt: newKey.created_at.toISOString()
        }
      });
    }

    if (!dbPool) {
      throw new Error('Database pool not configured.');
    }

    const insertResult = await dbPool.query(
      `INSERT INTO license_keys (key_value, expires_at, is_used, used_by) 
       VALUES ($1, $2, FALSE, NULL) RETURNING *`,
      [code, expDate]
    );

    const r = insertResult.rows[0];
    return res.json({
      success: true,
      key: {
        id: r.id,
        keyValue: r.key_value,
        expiresAt: new Date(r.expires_at).toISOString(),
        isUsed: r.is_used,
        usedBy: r.used_by,
        createdAt: new Date(r.created_at).toISOString()
      }
    });

  } catch (err: any) {
    console.error('Error generating activation key:', err);
    res.status(500).json({ error: 'Failed to generate activation key.' });
  }
});

app.post('/api/auth/activate', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized. Please login again.' });
    }

    const { licenseKey } = req.body;
    if (!licenseKey) {
      return res.status(400).json({ error: 'Please enter a valid activation key.' });
    }

    const cleanKey = String(licenseKey).trim();

    if (useSimulatedDb) {
      const match = simulatedLicenseKeys.find(k => k.key_value === cleanKey);
      if (!match) {
        return res.status(400).json({ error: 'The key is invalid or not registered in our database.' });
      }
      if (match.is_used) {
        return res.status(400).json({ error: 'This activation key has already been consumed.' });
      }
      if (new Date() > match.expires_at) {
        return res.status(400).json({ error: 'This activation key has already expired.' });
      }

      // Consume key
      match.is_used = true;
      match.used_by = user.username;

      // Update user license expiry (yearly)
      const exactNextYear = new Date();
      exactNextYear.setFullYear(exactNextYear.getFullYear() + 1);

      const simUser = simulatedUsers.find(u => u.username.toLowerCase() === user.username.toLowerCase());
      if (simUser) {
        simUser.license_expires_at = exactNextYear;
      }

      return res.json({
        success: true,
        message: 'License key activated successfully! Yearly full-access granted.',
        user: {
          id: user.id,
          username: user.username,
          worksCount: simUser ? simUser.works_count : user.works_count,
          licenseExpiresAt: exactNextYear.toISOString(),
          createdAt: user.created_at
        }
      });
    }

    if (!dbPool) {
      throw new Error('Database pool not configured.');
    }

    // Connect database transaction to activate
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      
      const { rows } = await client.query('SELECT * FROM license_keys WHERE key_value = $1 FOR UPDATE', [cleanKey]);
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'The key is invalid or not registered in our database.' });
      }

      const keyRecord = rows[0];
      if (keyRecord.is_used) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'This activation key has already been consumed.' });
      }
      if (new Date() > new Date(keyRecord.expires_at)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'This activation key has already expired.' });
      }

      // Mark as used
      await client.query(
        'UPDATE license_keys SET is_used = TRUE, used_by = $1 WHERE id = $2',
        [user.username, keyRecord.id]
      );

      // Add 1 year license
      const exactNextYear = new Date();
      exactNextYear.setFullYear(exactNextYear.getFullYear() + 1);

      await client.query(
        'UPDATE users SET license_expires_at = $1 WHERE id = $2',
        [exactNextYear, user.id]
      );

      await client.query('COMMIT');

      // Fetch updated user to return latest state
      const updatedUserQuery = await dbPool.query('SELECT * FROM users WHERE id = $1', [user.id]);
      const updatedUser = updatedUserQuery.rows[0];

      return res.json({
        success: true,
        message: 'License key activated successfully! Yearly full-access granted.',
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          worksCount: updatedUser.works_count,
          licenseExpiresAt: updatedUser.license_expires_at ? new Date(updatedUser.license_expires_at).toISOString() : null,
          createdAt: new Date(updatedUser.created_at).toISOString()
        }
      });

    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

  } catch (err: any) {
    console.error('Error activating key:', err);
    res.status(500).json({ error: 'Could not process license activation, try again.' });
  }
});

/**
 * List all Saved Tasks
 */
app.get('/api/tasks', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required. Please login.' });
    }

    await runAutoCleanup(); // Perform expired table scans

    if (useSimulatedDb) {
      const list = simulatedTasksTable
        .filter(t => !t.owner || t.owner.toLowerCase() === user.username.toLowerCase())
        .map(t => ({
          id: t.id,
          taskName: t.task_name,
          tableName: t.table_name,
          fileAName: t.file_a_name,
          fileBName: t.file_b_name,
          createdAt: t.created_at.toISOString(),
          expiresAt: t.expires_at.toISOString(),
          isSaved: t.is_saved,
          status: new Date() < t.expires_at ? 'active' : 'expired'
        }));
      return res.json(list);
    }

    if (!dbPool) {
      throw new Error('Database pool not initialized.');
    }

    const { rows } = await dbPool.query(
      `SELECT * FROM reconciliation_metadata 
       WHERE is_saved = TRUE AND (LOWER(owner) = LOWER($1) OR owner = 'anonymous') 
       ORDER BY created_at DESC`,
      [user.username]
    );

    const list = rows.map(r => ({
      id: r.id,
      taskName: r.task_name,
      tableName: r.table_name,
      fileAName: r.file_a_name,
      fileBName: r.file_b_name,
      createdAt: new Date(r.created_at).toISOString(),
      expiresAt: new Date(r.expires_at).toISOString(),
      isSaved: r.is_saved,
      status: new Date() < new Date(r.expires_at) ? 'active' : 'expired'
    }));

    res.json(list);
  } catch (error: any) {
    console.error('Error displaying saved tasks list:', error);
    res.status(500).json({ error: 'Database query failing on saved tasks.' });
  }
});

/**
 * Stage 1: File parsed initialization post schema & save-type options
 */
app.post('/api/tasks/init', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required. Please login.' });
    }

    // License Check
    const trialCompleted = user.works_count >= 10;
    const hasLicense = user.license_expires_at && new Date(user.license_expires_at) > new Date();

    if (trialCompleted && !hasLicense) {
      return res.status(403).json({ 
        error: 'Free trial limit reached (10 works completed). You must purchase a yearly registration key from the admin to activate this app.',
        trialExceeded: true
      });
    }

    await runAutoCleanup(); // Clean before doing heavy storage tasks

    const { taskName, fileAName, fileBName, datasetA, datasetB, isSaved } = req.body;

    if (!taskName || typeof taskName !== 'string') {
      return res.status(400).json({ error: 'Task Name must be provided as a non-empty string.' });
    }
    if (!datasetA || !Array.isArray(datasetA) || !datasetB || !Array.isArray(datasetB)) {
      return res.status(400).json({ error: 'Both datasets must be submitted under arrays.' });
    }

    const cleanTaskName = taskName.trim() || 'unnamed_reconciliation';
    
    // Header parsing - supporting explicit parameters fallback from body
    const headersA = (req.body.headersA && req.body.headersA.length > 0) 
      ? req.body.headersA 
      : (datasetA.length > 0 ? Object.keys(datasetA[0]) : []);
    const headersB = (req.body.headersB && req.body.headersB.length > 0) 
      ? req.body.headersB 
      : (datasetB.length > 0 ? Object.keys(datasetB[0]) : []);

    const expiresAtDate = new Date();
    expiresAtDate.setDate(expiresAtDate.getDate() + 7); // 7-day policy

    if (!isSaved) {
      // Increment works count
      if (useSimulatedDb) {
        const simUser = simulatedUsers.find(u => u.username.toLowerCase() === user.username.toLowerCase());
        if (simUser) simUser.works_count += 1;
      } else if (dbPool) {
        await dbPool.query('UPDATE users SET works_count = works_count + 1 WHERE id = $1', [user.id]);
      }

      // Proceed Without Save logic
      console.log(`[Engine] Proceed with in-memory calculation task: "${cleanTaskName}"`);
      return res.json({
        taskId: `temp_${Date.now()}`,
        taskName: cleanTaskName,
        tableName: 'in_memory_transient',
        fileAName,
        fileBName,
        headersA,
        headersB,
        datasetA,
        datasetB,
        expiresAt: null,
        isSaved: false
      });
    }

    // SAVED Logic
    const timestampId = Date.now();
    const sanitizedDbIdentifier = `t_rec_${timestampId}_${sanitizeSqlIdentifier(cleanTaskName)}`;

    if (useSimulatedDb) {
      // Memory persistence simulator
      const simulatedTaskRecord: SimulatedTask = {
        id: timestampId,
        task_name: cleanTaskName,
        table_name: sanitizedDbIdentifier,
        file_a_name: fileAName || 'dataset_a.csv',
        file_b_name: fileBName || 'dataset_b.csv',
        created_at: new Date(),
        expires_at: expiresAtDate,
        is_saved: true,
        dataset_a_rows: datasetA,
        dataset_b_rows: datasetB,
        owner: user.username
      };

      simulatedTasksTable.unshift(simulatedTaskRecord);

      // Increment works count
      const simUser = simulatedUsers.find(u => u.username.toLowerCase() === user.username.toLowerCase());
      if (simUser) simUser.works_count += 1;

      console.log(`[Simulation] Registered saved memory-table: "${sanitizedDbIdentifier}"`);

      return res.json({
        taskId: timestampId,
        taskName: cleanTaskName,
        tableName: sanitizedDbIdentifier,
        fileAName: fileAName || 'dataset_a.csv',
        fileBName: fileBName || 'dataset_b.csv',
        headersA,
        headersB,
        expiresAt: expiresAtDate.toISOString(),
        isSaved: true
      });
    }

    // Active PostgreSQL Storage persistence
    if (!dbPool) {
      throw new Error('Database connection manager is uninitialized.');
    }

    let client;
    try {
      client = await dbPool.connect();

      // Start Transaction
      await client.query('BEGIN');

      // 1. Insert Metadata Into Registry with owner field
      const metadataResult = await client.query(
        `INSERT INTO reconciliation_metadata (task_name, table_name, file_a_name, file_b_name, expires_at, is_saved, owner)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6) RETURNING id`,
        [cleanTaskName, sanitizedDbIdentifier, fileAName || 'dataset_a.csv', fileBName || 'dataset_b.csv', expiresAtDate, user.username]
      );
      
      const newTaskId = metadataResult.rows[0].id;

      // 2. Create Custom Table Named After The Task
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${sanitizedDbIdentifier} (
          id SERIAL PRIMARY KEY,
          dataset_type VARCHAR(1) NOT NULL, -- 'A' or 'B'
          row_index INTEGER NOT NULL,
          row_data JSONB NOT NULL
        )
      `);

      // 3. Batch Loading Row Inserts
      // Write Dataset A
      for (let i = 0; i < datasetA.length; i++) {
        await client.query(
          `INSERT INTO ${sanitizedDbIdentifier} (dataset_type, row_index, row_data) VALUES ($1, $2, $3)`,
          ['A', i, JSON.stringify(datasetA[i])]
        );
      }

      // Write Dataset B
      for (let i = 0; i < datasetB.length; i++) {
        await client.query(
          `INSERT INTO ${sanitizedDbIdentifier} (dataset_type, row_index, row_data) VALUES ($1, $2, $3)`,
          ['B', i, JSON.stringify(datasetB[i])]
        );
      }

      await client.query('COMMIT');
      console.log(`[PostgreSQL] Saved task "${cleanTaskName}" created table "${sanitizedDbIdentifier}" containing datasets.`);

      // Increment works count
      await dbPool.query('UPDATE users SET works_count = works_count + 1 WHERE id = $1', [user.id]);

      return res.json({
        taskId: newTaskId,
        taskName: cleanTaskName,
        tableName: sanitizedDbIdentifier,
        fileAName: fileAName || 'dataset_a.csv',
        fileBName: fileBName || 'dataset_b.csv',
        headersA,
        headersB,
        expiresAt: expiresAtDate.toISOString(),
        isSaved: true
      });

    } catch (txError) {
      if (client) await client.query('ROLLBACK');
      throw txError;
    } finally {
      if (client) client.release();
    }

  } catch (error: any) {
    console.error('Error during dataset initialization storage task:', error);
    res.status(500).json({ error: 'Failed to ingest datasets on backend.', details: error.message });
  }
});

/**
 * Run Reconciliation comparison computation
 */
app.post('/api/tasks/reconcile', async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required. Please login.' });
    }

    // License Check
    const trialCompleted = user.works_count >= 10;
    const hasLicense = user.license_expires_at && new Date(user.license_expires_at) > new Date();

    if (trialCompleted && !hasLicense) {
      return res.status(403).json({ 
        error: 'Free trial limit reached (10 works completed). You must purchase a yearly registration key from the admin to activate this app.',
        trialExceeded: true
      });
    }

    const { taskId, isSaved, primaryKeyA, primaryKeyB, datasetA, datasetB, taskName, fileAName, fileBName, tableName } = req.body;

    if (!primaryKeyA || !primaryKeyB) {
      return res.status(400).json({ error: 'Both Primary Key A and Primary Key B must be configured.' });
    }

    if (!isSaved) {
      // In-memory reconciliation directly from user parameters
      if (!datasetA || !datasetB) {
        return res.status(400).json({ error: 'Unsaved calculations require sending the raw datasets.' });
      }

      const report = reconcileDatasets({
        taskName: taskName || 'Unnamed Reconciliation',
        fileAName: fileAName || 'dataset_a.csv',
        fileBName: fileBName || 'dataset_b.csv',
        primaryKeyA,
        primaryKeyB,
        datasetA,
        datasetB
      });

      return res.json({ report });
    }

    // SAVED reconciliation: fetch table rows from database or simulated state
    let activeA: any[] = [];
    let activeB: any[] = [];
    let currentTaskName = taskName;
    let currentFileA = fileAName;
    let currentFileB = fileBName;

    if (useSimulatedDb) {
      const simMatch = simulatedTasksTable.find(t => t.table_name === tableName || t.id === Number(taskId));
      if (!simMatch) {
        return res.status(404).json({ error: 'Task datasets have expired or could not be found.' });
      }
      activeA = simMatch.dataset_a_rows;
      activeB = simMatch.dataset_b_rows;
      currentTaskName = simMatch.task_name;
      currentFileA = simMatch.file_a_name;
      currentFileB = simMatch.file_b_name;
    } else {
      if (!dbPool) {
        throw new Error('Database connection lacks initialization.');
      }

      // 1. Fetch metadata to ensure accuracy
      const metaQuery = await dbPool.query(
        `SELECT * FROM reconciliation_metadata WHERE table_name = $1 OR id = $2`,
        [tableName, isNaN(Number(taskId)) ? -1 : Number(taskId)]
      );

      if (metaQuery.rows.length === 0) {
        return res.status(404).json({ error: 'Reconciliation task metadata not tracked by server.' });
      }

      const meta = metaQuery.rows[0];
      const selectedTableName = meta.table_name;
      currentTaskName = meta.task_name;
      currentFileA = meta.file_a_name;
      currentFileB = meta.file_b_name;

      // 2. Query dynamic table row entries
      const sanitizedName = selectedTableName.replace(/[^a-zA-Z0-9_]/g, '');
      const datasetRowsQuery = await dbPool.query(
        `SELECT dataset_type, row_data FROM ${sanitizedName} ORDER BY row_index`
      );

      datasetRowsQuery.rows.forEach(r => {
        if (r.dataset_type === 'A') {
          activeA.push(r.row_data);
        } else if (r.dataset_type === 'B') {
          activeB.push(r.row_data);
        }
      });
    }

    // Run reconciliation matching algorithm
    const report = reconcileDatasets({
      taskName: currentTaskName || 'Saved Reconciliation Task',
      fileAName: currentFileA || 'dataset_a.csv',
      fileBName: currentFileB || 'dataset_b.csv',
      primaryKeyA,
      primaryKeyB,
      datasetA: activeA,
      datasetB: activeB
    });

    res.json({ report });

  } catch (error: any) {
    console.error('Error running calculated reconciliation report:', error);
    res.status(500).json({ error: 'Failed to compile reconciliation report on server.', details: error.message });
  }
});

/**
 * Fetch columns list and name information for a specific task
 */
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id;

    if (useSimulatedDb) {
      const match = simulatedTasksTable.find(t => t.id === Number(taskId) || t.table_name === taskId);
      if (!match) {
        return res.status(404).json({ error: 'Task is missing.' });
      }

      const headersA = match.dataset_a_rows.length > 0 ? Object.keys(match.dataset_a_rows[0]) : [];
      const headersB = match.dataset_b_rows.length > 0 ? Object.keys(match.dataset_b_rows[0]) : [];

      return res.json({
        id: match.id,
        taskName: match.task_name,
        tableName: match.table_name,
        fileAName: match.file_a_name,
        fileBName: match.file_b_name,
        headersA,
        headersB,
        expiresAt: match.expires_at.toISOString(),
        isSaved: match.is_saved
      });
    }

    if (!dbPool) {
      throw new Error('Database unreachable.');
    }

    const { rows } = await dbPool.query(`SELECT * FROM reconciliation_metadata WHERE id = $1`, [taskId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Registry does not contain matches.' });
    }

    const task = rows[0];
    const tableName = task.table_name;
    const sanitizedName = tableName.replace(/[^a-zA-Z0-9_]/g, '');

    // Fetch brief record of schemas from target table separately for Dataset A and Dataset B to avoid LIMIT overshadow bounds
    const sampleRowsA = await dbPool.query(
      `SELECT row_data FROM ${sanitizedName} WHERE dataset_type = 'A' LIMIT 1`
    );
    const sampleRowsB = await dbPool.query(
      `SELECT row_data FROM ${sanitizedName} WHERE dataset_type = 'B' LIMIT 1`
    );

    const sampleA = sampleRowsA.rows[0]?.row_data;
    const sampleB = sampleRowsB.rows[0]?.row_data;

    const headersA = sampleA ? Object.keys(sampleA) : [];
    const headersB = sampleB ? Object.keys(sampleB) : [];

    res.json({
      id: task.id,
      taskName: task.task_name,
      tableName: task.table_name,
      fileAName: task.file_a_name,
      fileBName: task.file_b_name,
      headersA,
      headersB,
      expiresAt: new Date(task.expires_at).toISOString(),
      isSaved: task.is_saved
    });

  } catch (error: any) {
    console.error('Error fetching dynamic schema details:', error);
    res.status(500).json({ error: 'Server could not trace columns for dataset primary fields.' });
  }
});

/**
 * Remove a saved task and drop associated dataset tables
 */
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const taskIdString = req.params.id;

    if (useSimulatedDb) {
      const sizeBefore = simulatedTasksTable.length;
      simulatedTasksTable = simulatedTasksTable.filter(
        t => t.id !== Number(taskIdString) && t.table_name !== taskIdString
      );
      if (simulatedTasksTable.length === sizeBefore) {
        return res.status(404).json({ error: 'Task of standard indices missing.' });
      }
      return res.json({ success: true, message: 'Removed simulated transient task datasets.' });
    }

    if (!dbPool) {
      throw new Error('Database pool not configured.');
    }

    const { rows } = await dbPool.query(
      `SELECT id, table_name FROM reconciliation_metadata WHERE id = $1`,
      [taskIdString]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Target reconciliation table registration untrackable.' });
    }

    const { table_name } = rows[0];
    const sanitizedName = table_name.replace(/[^a-zA-Z0-9_]/g, '');

    // Connect Client to drop
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DROP TABLE IF EXISTS ${sanitizedName}`);
      await client.query(`DELETE FROM reconciliation_metadata WHERE id = $1`, [taskIdString]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.json({ success: true, message: `Task drops complete. Dropped table "${table_name}".` });

  } catch (error: any) {
    console.error('Error removing reconciliation table:', error);
    res.status(500).json({ error: 'Failed to cleanly purge dynamic schemas and clean drop tables.' });
  }
});

// ----------------------------------------------------
// Start Application Lifecycle
// ----------------------------------------------------
async function startServer() {
  initDb();
  await verifySchemaAndConnection();

  // Vite development middleware versus production assets
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Mounted Vite SPA development live server middlewares.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Serving production-ready application bundles statically.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server runs successfully on http://localhost:${PORT}`);
  });
}

startServer();
