import type { Game, PosEval, Profile } from './types';

type EvalRow = PosEval & { k: string };

const DB_NAME = 'chess-multiverse';
const VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('games')) db.createObjectStore('games', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('evals')) db.createObjectStore('evals', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadGames(): Promise<Game[]> {
  const db = await open();
  return result(db.transaction('games').objectStore('games').getAll() as IDBRequest<Game[]>);
}

export async function putGames(games: Game[]): Promise<void> {
  const db = await open();
  const tx = db.transaction('games', 'readwrite');
  const store = tx.objectStore('games');
  for (const g of games) store.put(g);
  await done(tx);
}

export async function loadProfile(): Promise<Profile | null> {
  const db = await open();
  const p = await result(db.transaction('meta').objectStore('meta').get('profile'));
  return (p as Profile) ?? null;
}

export async function saveProfile(p: Profile): Promise<void> {
  const db = await open();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put(p, 'profile');
  await done(tx);
}

export async function loadEvals(): Promise<EvalRow[]> {
  const db = await open();
  return result(db.transaction('evals').objectStore('evals').getAll() as IDBRequest<EvalRow[]>);
}

export async function putEvals(entries: [string, PosEval][]): Promise<void> {
  const db = await open();
  const tx = db.transaction('evals', 'readwrite');
  const store = tx.objectStore('evals');
  for (const [k, e] of entries) store.put({ k, ...e });
  await done(tx);
}

export async function clearAll(): Promise<void> {
  const db = await open();
  const tx = db.transaction(['games', 'meta'], 'readwrite');
  tx.objectStore('games').clear();
  tx.objectStore('meta').clear();
  await done(tx);
}
