import type { Dataset } from "./parse";

/**
 * The imported histories, kept in this browser.
 *
 * IndexedDB rather than the server: a year of one-minute bars is too much to
 * send over the connection this journal is used from, and nothing but the
 * analysis needs it. The typed arrays are stored as they are.
 */
const DB = "flux-databento";
const STORE = "datasets";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "symbol" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => reject(tx.error);
      })
  );
}

export const loadDatasets = () => run<Dataset[]>("readonly", (s) => s.getAll() as IDBRequest<Dataset[]>);
export const loadDataset = (symbol: string) => run<Dataset | undefined>("readonly", (s) => s.get(symbol));
export const saveDataset = (d: Dataset) => run("readwrite", (s) => s.put(d));
export const deleteDataset = (symbol: string) => run("readwrite", (s) => s.delete(symbol));
