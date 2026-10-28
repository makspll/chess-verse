import type { Game } from './types';

const DAY = 86400;
const WEEK = 7 * DAY;

export interface TrendPoint {
  /** Unix seconds. */
  t: number;
  /** Win rate 0..1, or an Elo value. Null where the series has no data yet. */
  v: number | null;
  /** Games behind this point. */
  n: number;
}

export interface TrendSeries {
  name: string;
  points: TrendPoint[];
}

/** Monday 00:00 UTC of the week containing `sec`. The epoch fell on a Thursday, hence the 3-day shift. */
function weekStart(sec: number): number {
  return (Math.floor((sec / DAY + 3) / 7) * 7 - 3) * DAY;
}

/**
 * Win rate by week. `cumulative` reports the running rate over all games up to each week
 * instead of that week alone.
 */
export function winTrend(games: Game[], name: string, cumulative: boolean, from: number, to: number): TrendSeries {
  const wins = new Map<number, [number, number]>();
  for (const g of games) {
    const k = weekStart(g.end);
    const e = wins.get(k) ?? [0, 0];
    e[0]++;
    if (g.outcome === 'win') e[1]++;
    wins.set(k, e);
  }
  const points: TrendPoint[] = [];
  let n = 0;
  let w = 0;
  for (let t = weekStart(from); t <= to; t += WEEK) {
    const e = wins.get(t);
    if (e) {
      n += e[0];
      w += e[1];
    }
    if (cumulative) points.push({ t, v: n ? w / n : null, n: e?.[0] ?? 0 });
    else points.push({ t, v: e ? e[1] / e[0] : null, n: e?.[0] ?? 0 });
  }
  return { name, points };
}

/**
 * Elo as if every game had been rated: starts from the rating of the first game and applies
 * standard Elo updates against each opponent's rating at the time.
 */
export function simulatedElo(games: Game[], k = 20, name = 'Simulated Elo'): TrendSeries {
  const sorted = [...games].sort((a, b) => a.end - b.end);
  const points: TrendPoint[] = [];
  let r = sorted[0]?.myRating ?? 0;
  sorted.forEach((g, i) => {
    if (i === 0) points.push({ t: g.end, v: r, n: 0 });
    r += k * (scoreOf(g) - expectedScore(r, g.oppRating));
    points.push({ t: g.end, v: r, n: i + 1 });
  });
  return { name, points };
}

const expectedScore = (me: number, opp: number) => 1 / (1 + 10 ** ((opp - me) / 400));
const scoreOf = (g: Game) => (g.outcome === 'win' ? 1 : g.outcome === 'draw' ? 0.5 : 0);

/**
 * Least-squares K from real rated games: for consecutive rated games in the same time class,
 * rating change ≈ K · (score − expected). Chess.com archives may report the rating before or
 * after each game, so both alignments are fitted and the better one wins.
 */
export function estimateK(games: Game[]): { k: number; n: number } | null {
  const byClass = new Map<string, Game[]>();
  for (const g of games) {
    if (!g.rated) continue;
    byClass.set(g.timeClass, [...(byClass.get(g.timeClass) ?? []), g]);
  }
  const fit = (after: boolean) => {
    let num = 0;
    let den = 0;
    let n = 0;
    const pairs: [number, number][] = [];
    for (const gs of byClass.values()) {
      gs.sort((a, b) => a.end - b.end);
      for (let i = 0; i + 1 < gs.length; i++) {
        if (gs[i + 1].end - gs[i].end > 3 * 86400) continue; // long gaps inflate rating deviation
        const delta = gs[i + 1].myRating - gs[i].myRating;
        const g = after ? gs[i + 1] : gs[i];
        const e = scoreOf(g) - expectedScore(gs[i].myRating, g.oppRating);
        if (Math.abs(delta) > 100) continue;
        num += delta * e;
        den += e * e;
        n++;
        pairs.push([delta, e]);
      }
    }
    if (!den) return null;
    const k = num / den;
    const sse = pairs.reduce((s, [d, e]) => s + (d - k * e) ** 2, 0);
    return { k, n, sse };
  };
  const a = fit(true);
  const b = fit(false);
  const best = a && b ? (a.sse <= b.sse ? a : b) : (a ?? b);
  if (!best || best.n < 30) return null;
  return { k: Math.min(60, Math.max(4, best.k)), n: best.n };
}

export function actualElo(games: Game[]): TrendSeries {
  const sorted = [...games].filter((g) => g.rated).sort((a, b) => a.end - b.end);
  return { name: 'Actual (rated)', points: sorted.map((g, i) => ({ t: g.end, v: g.myRating, n: i + 1 })) };
}
