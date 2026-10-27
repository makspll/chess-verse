import { Chess } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board, type BoardAnim, type BoardArrow } from '../components/Board';
import { PieceIcon } from '../components/pieces';
import { TreeGraph } from '../components/TreeGraph';
import { Empty, FilterBar, Segmented, WDLBar } from '../components/ui';
import { ENGINE_COLOR, pct, rateColor } from '../lib/colors';
import { engine, formatEval, type EngineLine } from '../lib/engine';
import { sfx } from '../lib/sound';
import { buildTree, moveLabel, sortedChildren, walk, winRate, type TreeNode } from '../lib/tree';
import type { Color, Game } from '../lib/types';
import { go } from '../router';
import { applyFilters, useStore } from '../store';

interface EngineSettings {
  on: boolean;
  lines: number;
  depth: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? '{}') };
  } catch {
    return fallback;
  }
}

/** Replays a path of UCI moves; stops at the first illegal one. */
function replay(path: string[]) {
  const chess = new Chess();
  const sans: string[] = [];
  for (const uci of path) {
    try {
      sans.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san);
    } catch {
      break;
    }
  }
  return { fen: chess.fen(), sans, turn: (chess.turn() === 'w' ? 'white' : 'black') as Color };
}

function sanOf(fen: string, uci: string): string {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return uci;
  }
}

function pvSan(fen: string, pv: string[], max = 6): string {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, max)) {
    try {
      const ply = (c.moveNumber() - 1) * 2 + (c.turn() === 'w' ? 1 : 2);
      const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      out.push(out.length === 0 || ply % 2 === 1 ? moveLabel(ply, m.san) : m.san);
    } catch {
      break;
    }
  }
  return out.join(' ');
}

function moveSound(san: string) {
  if (san.includes('+') || san.includes('#')) sfx.check();
  else if (san.includes('x')) sfx.capture();
  else sfx.move();
}

/** Name shown for a position: only when most games here agree on it. */
function positionName(games: Game[]): string {
  if (!games.length) return '';
  const fam = new Map<string, number>();
  const line = new Map<string, number>();
  for (const g of games) {
    fam.set(g.family, (fam.get(g.family) ?? 0) + 1);
    const k = g.line ? `${g.family}: ${g.line}` : g.family;
    line.set(k, (line.get(k) ?? 0) + 1);
  }
  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])[0];
  const [l, ln] = top(line);
  if (ln / games.length >= 0.6) return l;
  const [f, fn] = top(fam);
  return fn / games.length >= 0.6 ? f : '';
}

export function TrainingPage({ params }: { params: URLSearchParams }) {
  const { games, filters, setFilters } = useStore();
  const [color, setColor] = useState<Color>(
    () => (params.get('color') as Color) || (localStorage.getItem('side') as Color) || 'white',
  );
  const [family, setFamily] = useState(params.get('family') ?? '');
  const [path, setPath] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [anim, setAnim] = useState<BoardAnim | null>(null);
  const [view, setView] = useState<'moves' | 'graph'>(() => (localStorage.getItem('view') as 'graph') || 'moves');
  const [showFilters, setShowFilters] = useState(false);
  const [eng, setEng] = useState<EngineSettings>(() => readJson('engine', { on: false, lines: 3, depth: 16 }));
  const [lines, setLines] = useState<EngineLine[]>([]);

  useEffect(() => localStorage.setItem('side', color), [color]);
  useEffect(() => localStorage.setItem('view', view), [view]);
  useEffect(() => localStorage.setItem('engine', JSON.stringify(eng)), [eng]);

  // URL params (from Stats "Train" links) win over saved state.
  useEffect(() => {
    const c = params.get('color') as Color | null;
    if (c) setColor(c);
    if (params.has('family')) setFamily(params.get('family') ?? '');
  }, [params]);

  const sidePool = useMemo(
    () => applyFilters(games, filters).filter((g) => g.color === color),
    [games, filters, color],
  );
  const families = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of sidePool) m.set(g.family, (m.get(g.family) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [sidePool]);
  const pool = useMemo(() => (family ? sidePool.filter((g) => g.family === family) : sidePool), [sidePool, family]);
  const tree = useMemo(() => buildTree(pool), [pool]);

  // Opening an opening jumps past the moves (nearly) every game in it shares;
  // the few that transpose in by another move order shouldn't stop that.
  const lastFamily = useRef<string | null>(null);
  useEffect(() => {
    const key = `${color}:${family}`;
    if (lastFamily.current === key) return;
    lastFamily.current = key;
    if (!family) return;
    const auto: string[] = [];
    let n: TreeNode = tree;
    for (;;) {
      const top = sortedChildren(n)[0];
      if (!top || top.n < n.n * 0.9) break;
      n = top;
      auto.push(n.uci);
    }
    setPath(auto);
    setFuture([]);
    setAnim(null);
  }, [family, color, tree]);

  const pos = useMemo(() => replay(path), [path]);
  const node = useMemo(() => walk(tree, path), [tree, path]);
  const myTurn = pos.turn === color;
  const children = useMemo(() => (node ? sortedChildren(node) : []), [node]);

  const gamesHere = useMemo(
    () => pool.filter((g) => path.every((m, i) => g.moves[i] === m)),
    [pool, path],
  );
  const name = useMemo(() => positionName(gamesHere), [gamesHere]);

  // Engine
  useEffect(() => {
    setLines([]);
    if (!eng.on) {
      engine.stop();
      return;
    }
    const t = setTimeout(() => engine.analyse(pos.fen, eng.lines, eng.depth, setLines), 120);
    return () => clearTimeout(t);
  }, [pos.fen, eng]);
  useEffect(() => () => engine.stop(), []);

  const play = useCallback(
    (uci: string, dragged = false) => {
      const san = sanOf(pos.fen, uci);
      moveSound(san);
      setAnim(dragged ? null : { from: uci.slice(0, 2), to: uci.slice(2, 4) });
      setPath((p) => [...p, uci]);
      setFuture((f) => (f[0] === uci ? f.slice(1) : []));
      setSelected(null);
      setHover(null);
    },
    [pos.fen],
  );

  const back = useCallback(() => {
    if (!path.length) return;
    const last = path[path.length - 1];
    sfx.back();
    setAnim({ from: last.slice(2, 4), to: last.slice(0, 2) });
    setPath(path.slice(0, -1));
    setFuture((f) => [last, ...f]);
    setSelected(null);
  }, [path]);

  const forward = useCallback(() => {
    const next = future[0] ?? children[0]?.uci;
    if (next) play(next);
  }, [future, children, play]);

  const jump = useCallback((p: string[]) => {
    setAnim(null);
    setPath(p);
    setFuture([]);
    setSelected(null);
  }, []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      if (e.key === 'ArrowLeft') back();
      else if (e.key === 'ArrowRight') forward();
      else if (e.key === 'ArrowUp' || e.key === 'Home') {
        sfx.back();
        jump([]);
      } else return;
      e.preventDefault();
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [back, forward, jump]);

  const arrows = useMemo(() => {
    const out: BoardArrow[] = [];
    if (node && node.n) {
      const focus = hover ? (c: TreeNode) => c.uci === hover : selected ? (c: TreeNode) => c.uci.startsWith(selected) : null;
      for (const c of children.slice(0, 12)) {
        const freq = c.n / node.n;
        const focused = focus?.(c) ?? false;
        out.push({
          from: c.uci.slice(0, 2),
          to: c.uci.slice(2, 4),
          color: rateColor(winRate(c)),
          width: 7 + 22 * freq,
          opacity: focus ? (focused ? 0.95 : 0.1) : 0.62,
          label: focused ? pct(winRate(c)) : undefined,
          sublabel: focused ? `${c.n} game${c.n === 1 ? '' : 's'}` : undefined,
        });
      }
      // Draw the focused arrows last so they sit on top.
      out.sort((a, b) => a.opacity - b.opacity);
    }
    if (eng.on) {
      for (const l of lines) {
        const uci = l.pv[0];
        const dim = selected && !uci.startsWith(selected);
        out.push({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          color: ENGINE_COLOR,
          width: l.multipv === 1 ? 9 : 6,
          opacity: dim ? 0.2 : l.multipv === 1 ? 0.9 : 0.6,
          label: dim ? undefined : formatEval(l),
          engine: true,
        });
      }
    }
    return out;
  }, [node, children, selected, hover, lines, eng.on]);

  const lastMove = path.length ? ([path[path.length - 1].slice(0, 2), path[path.length - 1].slice(2, 4)] as [string, string]) : undefined;

  if (!games.length) {
    return (
      <div className="page center">
        <Empty>
          <p>No games yet.</p>
          <button className="btn primary" onClick={() => go('import')}>
            Import from chess.com
          </button>
        </Empty>
      </div>
    );
  }

  return (
    <div className={'page train ' + view}>
      <div className="toolbar">
        <Segmented
          value={color}
          onChange={(c) => setColor(c)}
          options={[
            { value: 'white', label: <><PieceIcon code="wK" size={20} /> White</> },
            { value: 'black', label: <><PieceIcon code="bK" size={20} /> Black</> },
          ]}
        />
        <select className="opening-select" value={family} onChange={(e) => setFamily(e.target.value)}>
          <option value="">All openings · {sidePool.length}</option>
          {families.map(([f, n]) => (
            <option key={f} value={f}>
              {f} · {n}
            </option>
          ))}
        </select>
        <div className="grow" />
        <button className={'tool' + (showFilters ? ' on' : '')} onClick={() => setShowFilters(!showFilters)}>
          Filters
        </button>
        <button
          className={'tool engine' + (eng.on ? ' on' : '')}
          onClick={() => {
            sfx.select();
            setEng({ ...eng, on: !eng.on });
          }}
          title="Stockfish"
        >
          Engine
        </button>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'moves', label: 'Moves' },
            { value: 'graph', label: 'Multiverse' },
          ]}
        />
      </div>

      {(showFilters || eng.on) && (
        <div className="subbar">
          {showFilters && <FilterBar filters={filters} onChange={setFilters} />}
          {eng.on && (
            <div className="engine-opts">
              <span className="muted small">Engine lines</span>
              <Segmented
                value={String(eng.lines)}
                onChange={(v) => setEng({ ...eng, lines: Number(v) })}
                options={['1', '2', '3'].map((v) => ({ value: v, label: v }))}
              />
              <span className="muted small">Depth</span>
              <Segmented
                value={String(eng.depth)}
                onChange={(v) => setEng({ ...eng, depth: Number(v) })}
                options={['12', '16', '20'].map((v) => ({ value: v, label: v }))}
              />
            </div>
          )}
        </div>
      )}

      <div className="arena">
        <div className="board-col">
          <div className="board-box">
            <Board
              fen={pos.fen}
              orientation={color}
              arrows={arrows}
              lastMove={lastMove}
              selected={selected}
              onSelect={(sq) => {
                if (sq) sfx.select();
                setSelected(sq);
              }}
              onMove={play}
              anim={anim}
            />
          </div>
          <div className="board-nav">
            <span className={'turn ' + (myTurn ? 'me' : 'them')}>{myTurn ? 'Your move' : 'Their reply'}</span>
            <div className="grow" />
            <button className="icon-btn" onClick={() => { sfx.back(); jump([]); }} title="Start (↑)" disabled={!path.length}>
              <svg viewBox="0 0 24 24"><path d="M6 5v14M19 5l-9 7 9 7z" /></svg>
            </button>
            <button className="icon-btn" onClick={back} title="Back (←)" disabled={!path.length}>
              <svg viewBox="0 0 24 24"><path d="M16 5l-9 7 9 7z" /></svg>
            </button>
            <button className="icon-btn" onClick={forward} title="Forward (→)" disabled={!future.length && !children.length}>
              <svg viewBox="0 0 24 24"><path d="M8 5l9 7-9 7z" /></svg>
            </button>
          </div>
        </div>

        <aside className="panel">
          <div className="pos-head">
            <div className="pos-name">{name || (path.length ? ' ' : 'Starting position')}</div>
            {node && node.n > 0 ? (
              <div className="pos-stats">
                <span className="muted">{node.n.toLocaleString()} game{node.n === 1 ? '' : 's'}</span>
                <WDLBar t={node} />
              </div>
            ) : (
              <div className="pos-stats muted">None of your games reached this position.</div>
            )}
          </div>

          {path.length > 0 && (
            <div className="crumbs">
              {pos.sans.map((s, i) => (
                <button key={i} className={i === path.length - 1 ? 'on' : ''} onClick={() => { sfx.move(); jump(path.slice(0, i + 1)); }}>
                  {i % 2 === 0 ? moveLabel(i + 1, s) : s}
                </button>
              ))}
            </div>
          )}

          {view === 'graph' ? (
            <TreeGraph root={tree} path={path} color={color} onJump={jump} />
          ) : (
            <>
              {eng.on && (
                <div className="engine-lines">
                  {lines.length === 0 && <div className="muted small">Thinking…</div>}
                  {lines.map((l) => (
                    <button key={l.multipv} className="eline" onClick={() => play(l.pv[0])}>
                      <span className={'eval' + ((l.cp ?? (l.mate ?? 0) * 1000) < 0 ? ' neg' : '')}>{formatEval(l)}</span>
                      <span className="pv">{pvSan(pos.fen, l.pv)}</span>
                      <span className="muted small">d{l.depth}</span>
                    </button>
                  ))}
                </div>
              )}

              {children.length > 0 ? (
                <div className="moves">
                  <div className="moves-head muted small">
                    <span>{myTurn ? 'You played' : 'They played'}</span>
                    <span>Games</span>
                    <span />
                    <span>Win</span>
                  </div>
                  {children.map((c) => (
                    <button
                      key={c.uci}
                      className={'mrow' + (hover === c.uci ? ' hl' : '')}
                      onMouseEnter={() => setHover(c.uci)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => play(c.uci)}
                    >
                      <span className="san">{moveLabel(c.ply, c.san)}</span>
                      <span className="cnt">
                        {c.n}
                        <span className="muted"> · {pct(c.n / node!.n)}</span>
                      </span>
                      <WDLBar t={c} thin />
                      <span className="rate" style={{ color: rateColor(winRate(c)) }}>
                        {pct(winRate(c))}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                node && <div className="muted small pad">No further moves recorded from here.</div>
              )}

              {gamesHere.length > 0 && (
                <div className="recent">
                  <div className="muted small">Recent games here</div>
                  {gamesHere.slice(0, 5).map((g) => (
                    <a key={g.id} className="grow-row" href={g.url} target="_blank" rel="noreferrer">
                      <span className={'dot ' + g.outcome} />
                      <span className="grow">{g.opponent}</span>
                      <span className="muted">{g.oppRating}</span>
                      <span className="muted small">{new Date(g.end * 1000).toLocaleDateString()}</span>
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
