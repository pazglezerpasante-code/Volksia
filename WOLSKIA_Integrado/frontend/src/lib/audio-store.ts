const NAME = "volksia-audio";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("recordings");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("No se pudo abrir el almacenamiento de audio."));
  });
}
export async function saveAudio(id: string, blob: Blob): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("recordings", "readwrite");
      tx.objectStore("recordings").put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error("No hay espacio para guardar el audio."));
      tx.onabort = () => reject(new Error("No se guardó el audio."));
    });
  } finally {
    db.close();
  }
}
export async function readAudio(id: string): Promise<Blob | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("recordings").objectStore("recordings").get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(new Error("No se pudo recuperar el audio."));
    });
  } finally {
    db.close();
  }
}
export async function removeAudio(id: string): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("recordings", "readwrite");
      tx.objectStore("recordings").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
