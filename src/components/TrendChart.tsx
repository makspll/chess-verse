import { useMemo, useState } from 'react';
import { pct } from '../lib/colors';
import { actualElo, estimateK, simulatedElo, winTrend, type TrendSeries } from '../lib/trend';
import type { Game } from '../lib/types';
import { Segmented } from './ui';

type Metric = 'win' | 'elo';
type Span = 'weekly' | 'total';

const PALETTE = ['#9a8cff', '#4ec092', '#deb25c', '#5fb4ff', '#e87060', '#e58fd0'];
const W = 800;
const H = 280;
const PAD = { l: 44, r: 14, t: 12, b: 26 };
const SPLIT_COUNT = 5;

interface Line extends TrendSeries {
  color: string;
  dashed?: boolean;
}

function fmtDate(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

export function TrendChart({ games, allGames }: { games: Game[]; allGames: Game[] }) {
  const est = useMemo(() => estimateK(allGames), [allGames]);
  const k = est?.k ?? 20;
  const [metric, setMetric] = useState<Metric>('win');
  const [span, setSpan] = useState<Span>('weekly');
  const [split, setSplit] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const lines: Line[] = useMemo(() => {
    if (!games.length) return [];
    let from = Infinity;
    let to = -Infinity;
    for (const g of games) {
      if (g.end < from) from = g.end;
      if (g.end > to) to = g.end;
    }
    if (metric === 'elo') {
      // Ratings are per time class, so simulate each class on its own.
      const classes = [...new Set(games.map((g) => g.timeClass))];
      const out: Line[] = classes.map((tc, i) => ({
        ...simulatedElo(games.filter((g) => g.timeClass === tc), k, classes.length > 1 ? `Simulated ${tc}` : 'Simulated Elo'),
        color: PALETTE[i % PALETTE.length],
      }));
      const real = actualElo(games);
      if (classes.length === 1 && real.points.length > 1) out.push({ ...real, color: '#878a91', dashed: true });
      return out;
    }
    const cumulative = span === 'total';
    if (!split) return [{ ...winTrend(games, 'All games', cumulative, from, to), color: PALETTE[0] }];
    const byFamily = new Map<string, Game[]>();
    for (const g of games) byFamily.set(g.family, [...(byFamily.get(g.family) ?? []), g]);
    return [...byFamily]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, SPLIT_COUNT)
      .map(([name, gs], i) => ({ ...winTrend(gs, name, cumulative, from, to), color: PALETTE[i % PALETTE.length] }));
  }, [games, metric, span, split, k]);

  const geo = useMemo(() => {
    const all = lines.flatMap((l) => l.points.filter((p) => p.v !== null));
    if (!all.length) return null;
    const t0 = Math.min(...all.map((p) => p.t));
    const t1 = Math.max(...all.map((p) => p.t));
    let lo: number;
    let hi: number;
    if (metric === 'win') {
      lo = 0;
      hi = 1;
    } else {
      const vs = all.map((p) => p.v!);
      lo = Math.floor((Math.min(...vs) - 20) / 50) * 50;
      hi = Math.ceil((Math.max(...vs) + 20) / 50) * 50;
    }
    const x = (t: number) => PAD.l + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    const step = metric === 'win' ? 0.25 : Math.max(50, Math.ceil((hi - lo) / 4 / 50) * 50);
    const ticks: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
    return { t0, t1, x, y, ticks };
  }, [lines, metric]);

  const fmt = (v: number) => (metric === 'win' ? pct(v) : Math.round(v).toString());

  // Hover snaps to the nearest x position of the first line (all win lines share week positions).
  const hoverInfo = useMemo(() => {
    if (hover === null || !geo || !lines.length) return null;
    const t = geo.t0 + ((hover - PAD.l) / (W - PAD.l - PAD.r)) * (geo.t1 - geo.t0);
    const base = lines[0].points.filter((p) => p.v !== null);
    if (!base.length) return null;
    const near = base.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
    const rows = lines.map((l) => {
      const p = l.points.reduce<(typeof l.points)[number] | null>(
        (a, b) => (b.v === null ? a : !a || Math.abs(b.t - near.t) < Math.abs(a.t - near.t) ? b : a),
        null,
      );
      return { l, p: p && Math.abs(p.t - near.t) <= 4 * 86400 * 7 ? p : null };
    });
    return { t: near.t, rows };
  }, [hover, geo, lines]);

  const path = (l: Line) => {
    let d = '';
    let pen = false;
    for (const p of l.points) {
      if (p.v === null || !geo) {
        if (metric === 'win' && span === 'weekly') pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${geo.x(p.t).toFixed(1)},${geo.y(p.v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  const xTicks = geo ? Array.from({ length: 5 }, (_, i) => geo.t0 + ((geo.t1 - geo.t0) * i) / 4) : [];

  return (
    <div className="card trend">
      <div className="toolbar">
        <h2 className="trend-title">{metric === 'win' ? 'Win rate over time' : 'Simulated Elo'}</h2>
        <div className="grow" />
        <Segmented
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'win', label: 'Win rate' },
            { value: 'elo', label: 'Simulated Elo' },
          ]}
        />
        {metric === 'win' && (
          <>
            <Segmented
              value={span}
              onChange={setSpan}
              options={[
                { value: 'weekly', label: 'By week' },
                { value: 'total', label: 'Running total' },
              ]}
            />
            <button className={'chip' + (split ? ' on' : '')} onClick={() => setSplit(!split)}>
              Split by opening
            </button>
          </>
        )}
      </div>

      {!geo ? (
        <div className="muted small trend-empty">Not enough games for the current filters.</div>
      ) : (
        <>
          <svg
            className="trend-svg"
            viewBox={`0 0 ${W} ${H}`}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setHover(((e.clientX - r.left) / r.width) * W);
            }}
            onMouseLeave={() => setHover(null)}
          >
            {geo.ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(v)} y2={geo.y(v)} className="trend-grid" />
                <text x={PAD.l - 8} y={geo.y(v) + 4} textAnchor="end" className="trend-axis">
                  {fmt(v)}
                </text>
              </g>
            ))}
            {xTicks.map((t, i) => (
              <text
                key={i}
                x={geo.x(t)}
                y={H - 6}
                textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
                className="trend-axis"
              >
                {fmtDate(t)}
              </text>
            ))}
            {metric === 'win' && (
              <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(0.5)} y2={geo.y(0.5)} className="trend-half" />
            )}
            {lines.map((l) => (
              <path
                key={l.name}
                d={path(l)}
                fill="none"
                stroke={l.color}
                strokeWidth={2}
                strokeDasharray={l.dashed ? '4 4' : undefined}
                strokeLinejoin="round"
              />
            ))}
            {metric === 'win' &&
              span === 'weekly' &&
              lines.map((l) =>
                l.points.map((p) =>
                  p.v === null ? null : (
                    <circle key={l.name + p.t} cx={geo.x(p.t)} cy={geo.y(p.v)} r={lines.length > 1 ? 2.5 : 3} fill={l.color} />
                  ),
                ),
              )}
            {hoverInfo && (
              <>
                <line x1={geo.x(hoverInfo.t)} x2={geo.x(hoverInfo.t)} y1={PAD.t} y2={H - PAD.b} className="trend-cursor" />
                {hoverInfo.rows.map(({ l, p }) =>
                  p && p.v !== null ? <circle key={l.name} cx={geo.x(p.t)} cy={geo.y(p.v)} r={4} fill={l.color} /> : null,
                )}
              </>
            )}
          </svg>

          <div className="trend-legend">
            {lines.map((l) => (
              <span key={l.name} className="trend-key">
                <i style={{ background: l.color }} />
                {l.name}
              </span>
            ))}
            <span className="grow" />
            <span className="muted small">
              {hoverInfo
                ? `${fmtDate(hoverInfo.t)} · ` +
                  hoverInfo.rows
                    .filter((r) => r.p && r.p.v !== null)
                    .map(({ l, p }) =>
                      metric === 'win' && span === 'weekly'
                        ? `${lines.length > 1 ? l.name + ' ' : ''}${fmt(p!.v!)} (${p!.n}g)`
                        : `${lines.length > 1 ? l.name + ' ' : ''}${fmt(p!.v!)}`,
                    )
                    .join(' · ')
                : metric === 'elo'
                  ? `K=${k.toFixed(1)} ${est ? `fitted from ${est.n} rated games` : '(default, too few rated games to fit)'}`
                  : span === 'weekly'
                    ? 'Win rate per week'
                    : 'Win rate across all games so far'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
