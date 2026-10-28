import { Chess } from 'chess.js';
import { sfx } from './sound';
import { moveLabel } from './tree';
import type { Color } from './types';

function apply(chess: Chess, uci: string) {
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

/** Replays a path of UCI moves; stops at the first illegal one. */
export function replay(path: string[]) {
  const chess = new Chess();
  const sans: string[] = [];
  for (const uci of path) {
    try {
      sans.push(apply(chess, uci).san);
    } catch {
      break;
    }
  }
  return { chess, fen: chess.fen(), sans, turn: (chess.turn() === 'w' ? 'white' : 'black') as Color };
}

export function sanOf(fen: string, uci: string): string {
  try {
    return apply(new Chess(fen), uci).san;
  } catch {
    return uci;
  }
}

export function fenAfter(fen: string, uci: string): string | null {
  try {
    const c = new Chess(fen);
    apply(c, uci);
    return c.fen();
  } catch {
    return null;
  }
}

/** FEN before the first move and after each move of the path. */
export function fensOf(path: string[]): string[] {
  const chess = new Chess();
  const out = [chess.fen()];
  for (const uci of path) {
    try {
      apply(chess, uci);
    } catch {
      break;
    }
    out.push(chess.fen());
  }
  return out;
}

export function pvSan(fen: string, pv: string[], max = 6): string {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, max)) {
    try {
      const ply = (c.moveNumber() - 1) * 2 + (c.turn() === 'w' ? 1 : 2);
      const m = apply(c, uci);
      out.push(out.length === 0 || ply % 2 === 1 ? moveLabel(ply, m.san) : m.san);
    } catch {
      break;
    }
  }
  return out.join(' ');
}

export function moveSound(san: string) {
  if (san.includes('+') || san.includes('#')) sfx.check();
  else if (san.includes('x')) sfx.capture();
  else sfx.move();
}
