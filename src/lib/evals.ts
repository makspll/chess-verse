import { Chess } from 'chess.js';
import { useSyncExternalStore } from 'react';
import { loadEvals, putEvals } from './db';
import { evalCp, evalEngine } from './engine';
import type { PosEval } from './types';

export const LIVE_DEPTH = 14;
export const BULK_DEPTH = 12;
const MATE = 10000;

const cache = new Map<string, PosEval>();
const unsaved: [string, PosEval][] = [];
const listeners = new Set<() => void>();
let version = 0;
let loading: Promise<void> | null = null;

/** Position key: FEN without the move counters, so transpositions share an entry. */
export const evalKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export function notifyEvals() {
  version++;
  listeners.forEach((l) => l());
}

/** Loads persisted evals once; resolves when the cache is warm. */
export function warmEvals(): Promise<void> {
  loading ??= loadEvals()
    .then((rows) => {
      for (const { k, ...e } of rows) if (!cache.has(k)) cache.set(k, e);
      notifyEvals();
    })
    .catch(() => {});
  return loading;
}

function terminal(fen: string): PosEval | null {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { cp: c.turn() === 'w' ? -MATE : MATE, best: '', depth: 99 };
  if (c.isStalemate() || c.isInsufficientMaterial()) return { cp: 0, best: '', depth: 99 };
  return null;
}

export function peekEval(fen: string): PosEval | undefined {
  const k = evalKey(fen);
  const hit = cache.get(k);
  if (hit) return hit;
  const t = terminal(fen);
  if (t) cache.set(k, t);
  return t ?? undefined;
}

/** Stores a result unless the cache already holds a deeper search of the position. */
export function storeEval(fen: string, e: PosEval) {
  const k = evalKey(fen);
  const old = cache.get(k);
  if (old && old.depth > e.depth) return;
  cache.set(k, e);
  unsaved.push([k, e]);
}

export async function flushEvals() {
  if (!unsaved.length) return;
  const batch = unsaved.splice(0);
  try {
    await putEvals(batch);
  } catch {
    // The cache is only an optimisation; a failed write just means recomputing later.
  }
}

export function useEvalVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
}

/** Win chance (0..1) for White from centipawns; the same curve Lichess uses. */
export function winChance(cp: number): number {
  return 1 / (1 + Math.exp(-0.00368208 * cp));
}

export function fmtEval(cp: number): string {
  if (Math.abs(cp) >= MATE - 500) return `${cp > 0 ? '' : '-'}M${Math.round((MATE - Math.abs(cp)) / 10)}`;
  const v = cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

// --- Live (on-demand) evaluation ---

let task = 0;
let busy = false;

/** True while on-demand analysis is running, so the background job can step aside. */
export const isLiveBusy = () => busy;

/**
 * Evaluates `fens` in order on the live eval worker, replacing any earlier request.
 * The first `critical` positions are re-searched to LIVE_DEPTH if cached shallower;
 * the rest are only filled in when missing.
 */
export function requestEvals(fens: string[], critical = 2) {
  const id = ++task;
  void (async () => {
    busy = true;
    try {
      for (let i = 0; i < fens.length; i++) {
        if (id !== task) return;
        const fen = fens[i];
        const have = peekEval(fen);
        const want = i < critical ? LIVE_DEPTH : BULK_DEPTH;
        if (have && have.depth >= want) continue;
        const { lines, best } = await evalEngine.search(fen, { multipv: 1, go: `go depth ${want}` });
        if (id !== task || !lines[0]) return;
        storeEval(fen, { cp: evalCp(lines[0]), best, depth: lines[0].depth });
        notifyEvals();
      }
    } catch {
      // Superseded by a newer request.
    } finally {
      if (id === task) {
        busy = false;
        void flushEvals();
      }
    }
  })();
}

export function cancelEvals() {
  task++;
  busy = false;
  evalEngine.stop();
  void flushEvals();
}
