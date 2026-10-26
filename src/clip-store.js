const DB_NAME = "signbridge-media";
const DB_VERSION = 1;
const STORE_NAME = "isl-clips";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "intent" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, operation) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = operation(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export function saveClip(intent, blob) {
  return transact("readwrite", (store) => store.put({
    intent,
    blob,
    mimeType: blob.type,
    updatedAt: new Date().toISOString()
  }));
}

export function getClip(intent) {
  return transact("readonly", (store) => store.get(intent));
}

export function deleteClip(intent) {
  return transact("readwrite", (store) => store.delete(intent));
}

export async function listClips() {
  const records = await transact("readonly", (store) => store.getAll());
  return records || [];
}
