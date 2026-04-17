/**
 * IndexedDB-backed file storage for user assets (images, etc.).
 *
 * Files are keyed per template and synchronised with Typst's VFS via mapShadow.
 */

const DB_NAME = 'endfield-docmaker-files';
const DB_VERSION = 1;
const STORE_NAME = 'files';

export interface StoredFile {
  /** Unique key: `${templateId}/${fileName}` */
  id: string;
  templateId: string;
  name: string;
  data: Uint8Array;
  mimeType: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('templateId', 'templateId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function fileId(templateId: string, name: string): string {
  return `${templateId}/${name}`;
}

/** Get all files for a given template. */
export async function getFiles(templateId: string): Promise<StoredFile[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const idx = store.index('templateId');
    const req = idx.getAll(templateId);
    req.onsuccess = () => resolve(req.result as StoredFile[]);
    req.onerror = () => reject(req.error);
  });
}

/** Add or overwrite a file. Returns the stored file record. */
export async function putFile(
  templateId: string,
  name: string,
  data: Uint8Array,
  mimeType: string
): Promise<StoredFile> {
  const db = await openDB();
  const file: StoredFile = { id: fileId(templateId, name), templateId, name, data, mimeType };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(file);
    req.onsuccess = () => resolve(file);
    req.onerror = () => reject(req.error);
  });
}

/** Rename a file. Data is preserved. */
export async function renameFile(
  templateId: string,
  oldName: string,
  newName: string
): Promise<StoredFile | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(fileId(templateId, oldName));
    getReq.onsuccess = () => {
      const existing = getReq.result as StoredFile | undefined;
      if (!existing) {
        resolve(null);
        return;
      }
      const delReq = store.delete(fileId(templateId, oldName));
      delReq.onsuccess = () => {
        const updated: StoredFile = {
          ...existing,
          id: fileId(templateId, newName),
          name: newName
        };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = () => reject(putReq.error);
      };
      delReq.onerror = () => reject(delReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/** Remove a file by name. */
export async function removeFile(templateId: string, name: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(fileId(templateId, name));
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
