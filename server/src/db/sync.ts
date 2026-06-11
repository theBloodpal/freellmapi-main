import fs from 'fs';
import path from 'path';
import { DB_PATH } from './index.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET ?? 'database';

const isSyncEnabled = !!(SUPABASE_URL && SUPABASE_KEY);

/**
 * Downloads the database file from Supabase Storage on startup.
 */
export async function restoreDbBackup(): Promise<void> {
  if (!isSyncEnabled) {
    console.log('Supabase sync parameters not set. Skipping restore.');
    return;
  }

  const url = `${SUPABASE_URL}/storage/v1/object/authenticated/${SUPABASE_BUCKET}/freeapi.db`;
  console.log(`Checking remote database backup at ${url}...`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (response.status === 200) {
      const buffer = await response.arrayBuffer();
      
      // Ensure directory exists
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(DB_PATH, Buffer.from(buffer));
      console.log(`Database successfully restored from Supabase storage (${buffer.byteLength} bytes).`);
    } else if (response.status === 404 || response.status === 400) {
      console.log('No existing remote database backup found. A new one will be created.');
    } else {
      console.error(`Failed to restore database. Status: ${response.status} - ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error during database restore from Supabase:', error);
  }
}

/**
 * Uploads the local database file to Supabase Storage.
 */
async function uploadDbBackup(): Promise<void> {
  if (!isSyncEnabled || !fs.existsSync(DB_PATH)) return;

  const url = `${SUPABASE_URL}/storage/v1/object/authenticated/${SUPABASE_BUCKET}/freeapi.db`;
  console.log(`Uploading database backup to ${url}...`);

  try {
    const fileBuffer = fs.readFileSync(DB_PATH);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'x-upsert': 'true', // Overwrite existing file
      },
      body: fileBuffer,
    });

    if (response.ok) {
      console.log(`Database backup successfully saved to Supabase storage (${fileBuffer.length} bytes).`);
    } else {
      const errMsg = await response.text();
      console.error(`Failed to upload database backup: ${response.status} - ${errMsg}`);
    }
  } catch (error) {
    console.error('Error uploading database to Supabase:', error);
  }
}

let uploadTimeout: NodeJS.Timeout | null = null;
const DEBOUNCE_MS = 2000; // Wait 2 seconds of silence before uploading to avoid hammering

/**
 * Programmatically queues a database backup upload with a debounce.
 */
export function queueDbBackup(): void {
  if (!isSyncEnabled) return;

  if (uploadTimeout) {
    clearTimeout(uploadTimeout);
  }

  uploadTimeout = setTimeout(async () => {
    await uploadDbBackup();
  }, DEBOUNCE_MS);
}

/**
 * Watches the local database file for changes and uploads it with a debounce.
 */
export function startDbBackupWatcher(): void {
  if (!isSyncEnabled) return;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log(`Starting file watcher for SQLite database at ${DB_PATH}...`);

  fs.watch(dir, (eventType, filename) => {
    if (filename === 'freeapi.db' || filename === 'freeapi.db-wal') {
      queueDbBackup();
    }
  });

  // Also hook into process exit to save database
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Performing final database backup...');
    if (uploadTimeout) clearTimeout(uploadTimeout);
    await uploadDbBackup();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received. Performing final database backup...');
    if (uploadTimeout) clearTimeout(uploadTimeout);
    await uploadDbBackup();
    process.exit(0);
  });
}
