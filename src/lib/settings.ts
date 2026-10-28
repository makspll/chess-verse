import { useSyncExternalStore } from 'react';

const KEY = 'classify';
const listeners = new Set<() => void>();
let override: boolean | null = null;

function read(): boolean {
  if (override !== null) return override;
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setClassify(on: boolean) {
  override = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Not persisted; the in-memory value still applies for this session.
  }
  listeners.forEach((l) => l());
}

/** Move classification (live badges and the background job). On by default. */
export function useClassify(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, read);
  return [on, setClassify];
}
