import type { Game, Profile } from './types';

const DB_NAME = 'chess-multiverse';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('games', { keyPath: 'id' });
      db.createObjectStore('meta');
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

export async function clearAll(): Promise<void> {
  const db = await open();
  const tx = db.transaction(['games', 'meta'], 'readwrite');
  tx.objectStore('games').clear();
  tx.objectStore('meta').clear();
  await done(tx);
}
