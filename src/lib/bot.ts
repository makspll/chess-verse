import { Chess } from 'chess.js';
import { engine, evalCp, MIN_UCI_ELO } from './engine';
import { sortedChildren, type TreeNode } from './tree';

export interface BotSettings {
  elo: number;
  /** 0 = replay opponents' moves at their usual frequency; higher = steer into lines you lose. */
  nemesis: number;
}

export interface BotMove {
  uci: string;
  source: 'history' | 'engine';
  /** Games of yours that reached the position, for history moves. */
  games?: number;
}

function pick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Choose among the replies your opponents actually played here, weighted by how
 * often they were played and, via `nemesis`, by how badly you did against them.
 * The +1/+2 smoothing stops a single loss from counting as a 100% weakness.
 */
export function historyMove(node: TreeNode | null, nemesis: number): TreeNode | null {
  if (!node || !node.n) return null;
  const kids = sortedChildren(node);
  if (!kids.length) return null;
  const weights = kids.map((c) => c.n * Math.pow((c.l + c.d / 2 + 1) / (c.n + 2), nemesis));
  return pick(kids, weights);
}

/**
 * Stockfish limits itself well from 1320 up. Below that we take its top few moves
 * at low depth and sample them with a temperature that grows as the rating drops,
 * plus the odd outright random move at the very bottom.
 */
export async function engineMove(fen: string, elo: number): Promise<string> {
  if (elo >= MIN_UCI_ELO) {
    const { best } = await engine.search(fen, { multipv: 1, elo, go: 'go movetime 700' });
    return best;
  }
  const legal = new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''));
  if (Math.random() < Math.max(0, (900 - elo) / 2500)) return legal[Math.floor(Math.random() * legal.length)];

  const { lines, best } = await engine.search(fen, { multipv: 5, go: 'go depth 8' });
  if (!lines.length) return best;
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
  const scores = lines.map((l) => sign * evalCp(l));
  const top = Math.max(...scores);
  const temp = 40 + (MIN_UCI_ELO - elo) * 0.35;
  return pick(
    lines.map((l) => l.pv[0]),
    scores.map((s) => Math.exp((s - top) / temp)),
  );
}

export async function botMove(fen: string, node: TreeNode | null, s: BotSettings): Promise<BotMove> {
  const h = historyMove(node, s.nemesis);
  if (h) return { uci: h.uci, source: 'history', games: node!.n };
  return { uci: await engineMove(fen, s.elo), source: 'engine' };
}
