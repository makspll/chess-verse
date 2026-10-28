import { useMemo, useState } from 'react';
import { PieceIcon } from '../components/pieces';
import { TrendChart } from '../components/TrendChart';
import { Empty, FilterBar, Segmented, WDLBar } from '../components/ui';
import { pct, rateColor } from '../lib/colors';
import { sfx } from '../lib/sound';
import { emptyTally, tallyAdd, winRate } from '../lib/tree';
import type { Color, Game, Tally } from '../lib/types';
import { go } from '../router';
import { applyFilters, useStore } from '../store';

interface Row extends Tally {
  name: string;
  opp: number;
  lines: Row[];
}

function group(games: Game[], key: (g: Game) => string): Map<string, Game[]> {
  const m = new Map<string, Game[]>();
  for (const g of games) {
    const k = key(g);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(g);
  }
  return m;
}

function tally(games: Game[]): Tally {
  const t = emptyTally();
  for (const g of games) tallyAdd(t, g.outcome);
  return t;
}

function rows(games: Game[]): Row[] {
  return [...group(games, (g) => g.family)].map(([name, gs]) => ({
    name,
    ...tally(gs),
    opp: Math.round(gs.reduce((s, g) => s + g.oppRating, 0) / gs.length),
    lines: [...group(gs, (g) => g.line || '—')].map(([ln, lg]) => ({
      name: ln,
      ...tally(lg),
      opp: Math.round(lg.reduce((s, g) => s + g.oppRating, 0) / lg.length),
      lines: [],
    })),
  }));
}

type Sort = 'n' | 'win';

function sortRows(r: Row[], s: Sort): Row[] {
  return [...r].sort((a, b) => (s === 'n' ? b.n - a.n : winRate(b) - winRate(a) || b.n - a.n));
}

function Summary({ label, t, icon }: { label: string; t: Tally; icon?: string }) {
  return (
    <div className="card stat">
      <div className="muted small stat-label">
        {icon && <PieceIcon code={icon} size={18} />}
        {label}
      </div>
      <div className="stat-big">
        <span style={{ color: rateColor(winRate(t)) }}>{pct(winRate(t))}</span>
        <span className="muted small"> won · {t.n.toLocaleString()} games</span>
      </div>
      <WDLBar t={t} />
    </div>
  );
}

export function StatsPage() {
  const { games, filters, setFilters } = useStore();
  const [color, setColor] = useState<Color>(() => (localStorage.getItem('side') as Color) || 'white');
  const [sort, setSort] = useState<Sort>('n');
  const [open, setOpen] = useState<string | null>(null);

  const filtered = useMemo(() => applyFilters(games, filters), [games, filters]);
  const side = useMemo(() => filtered.filter((g) => g.color === color), [filtered, color]);
  const table = useMemo(() => rows(side), [side]);

  const minGames = Math.max(5, Math.round(side.length * 0.02));
  const ranked = useMemo(
    () => table.filter((r) => r.n >= minGames).sort((a, b) => winRate(b) - winRate(a)),
    [table, minGames],
  );

  if (!games.length) {
    return (
      <div className="page center">
        <Empty>
          <p>Import your games to see stats.</p>
          <button className="btn primary" onClick={() => go('import')}>
            Import from chess.com
          </button>
        </Empty>
      </div>
    );
  }

  const train = (family: string) => {
    sfx.move();
    go('train', { color, family });
  };

  return (
    <div className="page stats">
      <div className="toolbar">
        <h1>Stats</h1>
        <div className="grow" />
        <FilterBar filters={filters} onChange={setFilters} />
      </div>

      <div className="summary">
        <Summary label="All games" t={tally(filtered)} />
        <Summary label="As White" icon="wK" t={tally(filtered.filter((g) => g.color === 'white'))} />
        <Summary label="As Black" icon="bK" t={tally(filtered.filter((g) => g.color === 'black'))} />
      </div>

      <TrendChart games={filtered} allGames={games} />

      <div className="toolbar">
        <Segmented
          value={color}
          onChange={(c) => {
            setColor(c);
            setOpen(null);
          }}
          options={[
            { value: 'white', label: <><PieceIcon code="wK" size={20} /> As White</> },
            { value: 'black', label: <><PieceIcon code="bK" size={20} /> As Black</> },
          ]}
        />
      </div>

      {ranked.length >= 4 && (
        <div className="highlights">
          <div className="card">
            <div className="muted small">Strongest</div>
            {ranked.slice(0, 3).map((r) => (
              <button key={r.name} className="hl-row" onClick={() => train(r.name)}>
                <span className="grow">{r.name}</span>
                <span className="muted small">{r.n}</span>
                <span className="rate" style={{ color: rateColor(winRate(r)) }}>{pct(winRate(r))}</span>
              </button>
            ))}
          </div>
          <div className="card">
            <div className="muted small">Needs work</div>
            {ranked.slice(-3).reverse().map((r) => (
              <button key={r.name} className="hl-row" onClick={() => train(r.name)}>
                <span className="grow">{r.name}</span>
                <span className="muted small">{r.n}</span>
                <span className="rate" style={{ color: rateColor(winRate(r)) }}>{pct(winRate(r))}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card table">
        <div className="trow head muted small">
          <span>Opening</span>
          <button className={sort === 'n' ? 'on' : ''} onClick={() => setSort('n')}>Games</button>
          <span className="hide-sm">Opp. avg</span>
          <span>Results</span>
          <button className={sort === 'win' ? 'on' : ''} onClick={() => setSort('win')}>Win</button>
          <span />
        </div>
        {sortRows(table, sort).map((r) => (
          <div key={r.name} className={'tgroup' + (open === r.name ? ' open' : '')}>
            <div
              className="trow"
              onClick={() => {
                sfx.select();
                setOpen(open === r.name ? null : r.name);
              }}
            >
              <span className="tname">
                <span className="caret">{r.lines.length > 1 ? '›' : ''}</span>
                {r.name}
              </span>
              <span>{r.n}</span>
              <span className="muted hide-sm">{r.opp}</span>
              <WDLBar t={r} thin />
              <span className="rate" style={{ color: rateColor(winRate(r)) }}>{pct(winRate(r))}</span>
              <button
                className="btn small"
                onClick={(e) => {
                  e.stopPropagation();
                  train(r.name);
                }}
              >
                Train
              </button>
            </div>
            {open === r.name &&
              r.lines.length > 1 &&
              sortRows(r.lines, sort).map((l) => (
                <div key={l.name} className="trow sub">
                  <span className="tname">{l.name}</span>
                  <span>{l.n}</span>
                  <span className="muted hide-sm">{l.opp}</span>
                  <WDLBar t={l} thin />
                  <span className="rate" style={{ color: rateColor(winRate(l)) }}>{pct(winRate(l))}</span>
                  <span />
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
