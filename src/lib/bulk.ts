import { Chess } from 'chess.js';
import { useEffect, useSyncExternalStore } from 'react';
import { bulkEngine, evalCp } from './engine';
import { BULK_DEPTH, flushEvals, isLiveBusy, notifyEvals, peekEval, storeEval, warmEvals } from './evals';
import { buildTree, type TreeNode } from './tree';
import type { Game } from './types';

/** Only positions at least this many games reached, and only this deep. */
const MIN_GAMES = 2;
const MAX_PLY_BULK = 24;

export interface BulkStatus {
  done: number;
  total: number;
  running: boolean;
  paused: boolean;
}

let status: BulkStatus = { done: 0, total: 0, running: false, paused: false };
const listeners = new Set<() => void>();
let userPaused = false;

function setStatus(patch: Partial<BulkStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export function useBulkStatus(): BulkStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
  );
}

export function setBulkPaused(p: boolean) {
  userPaused = p;
  setStatus({ paused: p });
}

/** Positions reached by enough games, most visited first. Walks the tree, so one move per node. */
function positions(games: Game[]): string[] {
  const root = buildTree(games);
  const chess = new Chess();
  const out: { fen: string; n: number }[] = [];
  const seen = new Set<string>();
  const visit = (node: TreeNode) => {
    const fen = chess.fen();
    const key = fen.split(' ').slice(0, 4).join(' ');
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ fen, n: node.n });
    }
    if (node.ply >= MAX_PLY_BULK) return;
    for (const c of node.children.values()) {
      if (c.n < MIN_GAMES) continue;
      try {
        chess.move({ from: c.uci.slice(0, 2), to: c.uci.slice(2, 4), promotion: c.uci[4] });
      } catch {
        continue;
      }
      visit(c);
      chess.undo();
    }
  };
  visit(root);
  return out.sort((a, b) => b.n - a.n).map((p) => p.fen);
}

/** Resolves once nothing else needs the CPU: tab visible, not user-paused, no live analysis running. */
async function idle(cancelled: () => boolean) {
  while (!cancelled() && (userPaused || document.hidden || isLiveBusy())) {
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function run(games: Game[], cancelled: () => boolean) {
  await warmEvals();
  if (cancelled()) return;
  const fens = positions(games);
  let done = fens.filter((f) => (peekEval(f)?.depth ?? 0) >= BULK_DEPTH).length;
  setStatus({ done, total: fens.length, running: done < fens.length });
  let sinceFlush = 0;
  try {
    for (const fen of fens) {
      if ((peekEval(fen)?.depth ?? 0) >= BULK_DEPTH) continue;
      await idle(cancelled);
      if (cancelled()) return;
      try {
        const { lines, best } = await bulkEngine.search(fen, { multipv: 1, go: `go depth ${BULK_DEPTH}` });
        if (lines[0]) storeEval(fen, { cp: evalCp(lines[0]), best, depth: lines[0].depth });
      } catch {
        if (cancelled()) return;
        continue;
      }
      done++;
      if (++sinceFlush >= 25) {
        sinceFlush = 0;
        await flushEvals();
        notifyEvals();
      }
      if (done % 5 === 0) setStatus({ done });
    }
    setStatus({ done: fens.length, running: false });
  } finally {
    await flushEvals();
    notifyEvals();
    bulkEngine.stop();
  }
}

/** Background pre-classification of the positions in your games. Mount once. */
export function useBulkAnalysis(games: Game[], enabled: boolean) {
  useEffect(() => {
    if (!enabled || !games.length) {
      setStatus({ running: false });
      return;
    }
    let stop = false;
    void run(games, () => stop);
    return () => {
      stop = true;
      bulkEngine.stop();
    };
  }, [games, enabled]);
}
