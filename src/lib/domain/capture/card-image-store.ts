const DB_NAME = "conninter-card-images";
const STORE = "images";
const DB_VERSION = 1;

export type PendingCardImage = {
  key: string;
  imageBase64: string;
  mimeType: string;
  leadId?: string;
  createdAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export async function putPendingCardImage(entry: PendingCardImage): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB put failed"));
  });
  db.close();
}

export async function getPendingCardImage(key: string): Promise<PendingCardImage | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  const result = await new Promise<PendingCardImage | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as PendingCardImage) ?? null);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB get failed"));
  });
  db.close();
  return result;
}

export async function deletePendingCardImage(key: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
  });
  db.close();
}

export async function listPendingCardImages(): Promise<PendingCardImage[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  const result = await new Promise<PendingCardImage[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as PendingCardImage[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB list failed"));
  });
  db.close();
  return result;
}

/** Compress a data URL JPEG for storage/upload. */
export async function compressDataUrl(
  dataUrl: string,
  quality = 0.85,
  maxWidth = 1600,
): Promise<{ dataUrl: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const out = canvas.toDataURL("image/jpeg", quality);
      resolve({ dataUrl: out, mimeType: "image/jpeg" });
    };
    img.onerror = () => reject(new Error("Could not load image for compression"));
    img.src = dataUrl;
  });
}
