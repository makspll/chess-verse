import { Chess } from 'chess.js';
import { fenAfter, sanOf } from './chessutil';
import { ENGINE_COLOR } from './colors';
import { peekEval, winChance } from './evals';
import type { Color, PosEval } from './types';

export type MoveClass = 'engine' | 'good' | 'normal' | 'bad' | 'terrible';

export const CLASS_INFO: Record<MoveClass, { label: string; color: string; glyph: string }> = {
  engine: { label: 'Engine move', color: ENGINE_COLOR, glyph: '★' },
  good: { label: 'Good move', color: '#4ec092', glyph: '✓' },
  normal: { label: 'Normal move', color: '#878a91', glyph: '•' },
  bad: { label: 'Bad move', color: '#e5a24a', glyph: '?' },
  terrible: { label: 'Very bad move', color: '#e87060', glyph: '??' },
};

export interface Judgement {
  cls: MoveClass;
  mover: Color;
  before: PosEval;
  after: PosEval;
  /** Engine's preferred move in SAN, when it differs from the one played. */
  bestSan: string | null;
}

/** Below this win chance the game counts as lost. */
const LOSING = 0.25;

/** Thresholds are win-chance lost against the engine's line, from the mover's side. */
export function classify(wpBefore: number, wpAfter: number, isTop: boolean): MoveClass {
  const loss = Math.max(0, wpBefore - wpAfter);
  if (isTop || loss <= 0.01) return 'engine';
  if (loss <= 0.03) return 'good';
  if ((wpBefore >= LOSING && wpAfter < LOSING) || loss >= 0.25) return 'terrible';
  if (loss <= 0.08) return 'normal';
  return 'bad';
}

/** Verdict on `uci` played from `beforeFen`, or null until both positions are evaluated. */
export function judge(beforeFen: string, uci: string): Judgement | null {
  const afterFen = fenAfter(beforeFen, uci);
  if (!afterFen) return null;
  const before = peekEval(beforeFen);
  const after = peekEval(afterFen);
  if (!before || !after) return null;
  const mover: Color = new Chess(beforeFen).turn() === 'w' ? 'white' : 'black';
  const mine = (cp: number) => (mover === 'white' ? winChance(cp) : 1 - winChance(cp));
  const isTop = before.best === uci;
  return {
    cls: classify(mine(before.cp), mine(after.cp), isTop),
    mover,
    before,
    after,
    bestSan: !isTop && before.best ? sanOf(beforeFen, before.best) : null,
  };
}
