import { useEffect, useMemo, useRef, useState } from 'react';
import { botMove, type BotMove, type BotSettings } from '../lib/bot';
import { moveSound, replay, sanOf } from '../lib/chessutil';
import { pct, rateColor } from '../lib/colors';
import { engine, MIN_UCI_ELO } from '../lib/engine';
import { sfx } from '../lib/sound';
import { moveLabel, sortedChildren, walk, winRate, type TreeNode } from '../lib/tree';
import type { Color } from '../lib/types';
import { Board, type BoardAnim } from './Board';

interface Props {
  tree: TreeNode;
  startPath: string[];
  color: Color;
  onExit: (path: string[]) => void;
}

interface Over {
  result: 'win' | 'loss' | 'draw';
  reason: string;
}

interface ReviewRow {
  ply: number;
  san: string;
  /** Your past results with this move here, or null if you'd never played it. */
  mine: TreeNode | null;
  /** Your best-scoring move here, when it clearly beats what you played. */
  better: TreeNode | null;
}

const DEFAULTS: BotSettings = { elo: 1500, nemesis: 2 };

function readSettings(): BotSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('bot') ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

function gameOver(chess: ReturnType<typeof replay>['chess'], color: Color): Over | null {
  if (chess.isCheckmate()) {
    const loser = chess.turn() === 'w' ? 'white' : 'black';
    return { result: loser === color ? 'loss' : 'win', reason: 'Checkmate' };
  }
  if (chess.isStalemate()) return { result: 'draw', reason: 'Stalemate' };
  if (chess.isInsufficientMaterial()) return { result: 'draw', reason: 'Insufficient material' };
  if (chess.isThreefoldRepetition()) return { result: 'draw', reason: 'Repetition' };
  if (chess.isDraw()) return { result: 'draw', reason: '50-move rule' };
  return null;
}

function review(tree: TreeNode, path: string[], from: number, color: Color) {
  const rows: ReviewRow[] = [];
  let leftAt: number | null = null;
  const sans = replay(path).sans;
  for (let i = from; i < path.length; i++) {
    const before = walk(tree, path.slice(0, i));
    if (!before || !before.n) {
      leftAt = i;
      break;
    }
    const moverIsMe = (i % 2 === 0) === (color === 'white');
    if (!moverIsMe) continue;
    const mine = before.children.get(path[i]) ?? null;
    // Smoothed so "3 games, 100%" doesn't outrank a solid 60% over 200 games.
    const smooth = (t: TreeNode) => (t.w + 1) / (t.n + 2);
    const best = sortedChildren(before)
      .filter((c) => c.n >= 5)
      .sort((a, b) => smooth(b) - smooth(a))[0];
    const better = best && best !== mine && smooth(best) - (mine ? smooth(mine) : 0) >= 0.1 ? best : null;
    rows.push({ ply: i + 1, san: sans[i], mine, better });
  }
  return { rows, leftAt, sans };
}

export function Practice({ tree, startPath, color, onExit }: Props) {
  const [path, setPath] = useState(startPath);
  const [settings, setSettings] = useState(readSettings);
  const [thinking, setThinking] = useState(false);
  const [last, setLast] = useState<BotMove | null>(null);
  const [anim, setAnim] = useState<BoardAnim | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [resigned, setResigned] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => localStorage.setItem('bot', JSON.stringify(settings)), [settings]);

  const pos = useMemo(() => replay(path), [path]);
  const over: Over | null = resigned ? { result: 'loss', reason: 'Resigned' } : gameOver(pos.chess, color);
  const botTurn = !over && pos.turn !== color;

  const push = (uci: string, dragged = false) => {
    moveSound(sanOf(pos.fen, uci));
    setAnim(dragged ? null : { from: uci.slice(0, 2), to: uci.slice(2, 4) });
    setPath((p) => [...p, uci]);
    setSelected(null);
  };

  // The bot replies after a short, slightly random pause so it feels like an opponent.
  useEffect(() => {
    if (!botTurn) return;
    let cancelled = false;
    setThinking(true);
    const started = Date.now();
    const node = walk(tree, path);
    botMove(pos.fen, node, settingsRef.current)
      .then(async (m) => {
        const wait = 350 + Math.random() * 500 - (Date.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (cancelled) return;
        setLast(m);
        setThinking(false);
        push(m.uci);
      })
      .catch(() => {
        if (!cancelled) setThinking(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, botTurn]);

  useEffect(() => () => engine.stop(), []);

  useEffect(() => {
    if (!over) return;
    if (over.result === 'win') sfx.success();
    else if (over.result === 'loss') sfx.error();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over?.result, over?.reason]);

  const restart = () => {
    engine.stop();
    sfx.back();
    setResigned(false);
    setLast(null);
    setThinking(false);
    setAnim(null);
    setPath(startPath);
  };

  const takeBack = () => {
    engine.stop();
    sfx.back();
    let p = path;
    // Undo the bot's reply and your move, back to your previous turn.
    do p = p.slice(0, -1);
    while (p.length > startPath.length && replay(p).turn !== color);
    setResigned(false);
    setThinking(false);
    setAnim(null);
    setPath(p);
  };

  const node = walk(tree, path);
  const inHistory = !!node && node.n > 0;
  const rev = useMemo(() => (over ? review(tree, path, startPath.length, color) : null), [over, tree, path, startPath, color]);
  const lastMove = path.length ? ([path[path.length - 1].slice(0, 2), path[path.length - 1].slice(2, 4)] as [string, string]) : undefined;

  return (
    <div className="arena">
      <div className="board-col">
        <div className="board-box">
          <Board
            fen={pos.fen}
            orientation={color}
            arrows={[]}
            lastMove={lastMove}
            selected={selected}
            onSelect={(sq) => {
              if (sq) sfx.select();
              setSelected(sq);
            }}
            onMove={push}
            anim={anim}
            allow={over ? undefined : color}
          />
        </div>
        <div className="board-nav">
          <span className={'turn ' + (over ? 'them' : botTurn ? 'them' : 'me')}>
            {over ? over.reason : botTurn ? 'Bot is thinking…' : 'Your move'}
          </span>
          <div className="grow" />
          <button className="btn small" onClick={takeBack} disabled={path.length <= startPath.length || thinking}>
            Take back
          </button>
          {!over && (
            <button className="btn small" onClick={() => setResigned(true)}>
              Resign
            </button>
          )}
        </div>
      </div>

      <aside className="panel">
        <div className="pos-head">
          <div className="practice-title">
            <span className="pos-name">Practice vs bot</span>
            <button className="link" onClick={() => onExit(path)}>
              Back to explorer
            </button>
          </div>
          <div className="muted small">
            {over
              ? ''
              : inHistory
                ? `In your games · ${node!.n} reached this position`
                : 'Past your games · engine takes over'}
          </div>
        </div>

        <div className="practice-settings">
          <label>
            <span>Bot strength</span>
            <strong>{settings.elo}</strong>
            <input
              type="range"
              min={400}
              max={2800}
              step={50}
              value={settings.elo}
              onChange={(e) => setSettings({ ...settings, elo: Number(e.target.value) })}
            />
          </label>
          <label>
            <span>Aim for your weak lines</span>
            <strong>{['Off', 'Light', 'Medium', 'Strong', 'Ruthless'][Math.round(settings.nemesis)]}</strong>
            <input
              type="range"
              min={0}
              max={4}
              step={1}
              value={settings.nemesis}
              onChange={(e) => setSettings({ ...settings, nemesis: Number(e.target.value) })}
            />
          </label>
          {settings.elo < MIN_UCI_ELO && <div className="muted small">Below {MIN_UCI_ELO} the bot picks from Stockfish's top moves with extra mistakes.</div>}
        </div>

        {last && !over && (
          <div className="bot-source muted small">
            <span className={'src-dot ' + last.source} />
            {last.source === 'history'
              ? `Last reply came from your games (${last.games} game${last.games === 1 ? '' : 's'} here)`
              : `Last reply came from the engine (~${settings.elo})`}
          </div>
        )}

        {over && rev ? (
          <div className="review">
            <div className={'result ' + over.result}>
              {over.result === 'win' ? 'You won' : over.result === 'loss' ? 'You lost' : 'Draw'}
              <span className="muted small"> · {over.reason}</span>
            </div>
            {rev.rows.length > 0 && <div className="muted small">Your moves vs. your history</div>}
            {rev.rows.map((r) => (
              <div key={r.ply} className="rev-row">
                <span className="san">{moveLabel(r.ply, r.san)}</span>
                <span className="small">
                  {r.mine ? (
                    <>
                      {r.mine.n} game{r.mine.n === 1 ? '' : 's'} ·{' '}
                      <b style={{ color: rateColor(winRate(r.mine)) }}>{pct(winRate(r.mine))}</b>
                    </>
                  ) : (
                    <span className="muted">new here</span>
                  )}
                </span>
                {r.better ? (
                  <span className="small better">
                    try {moveLabel(r.ply, r.better.san)}{' '}
                    <b style={{ color: rateColor(winRate(r.better)) }}>{pct(winRate(r.better))}</b>
                  </span>
                ) : (
                  <span />
                )}
              </div>
            ))}
            {rev.leftAt !== null && rev.leftAt > startPath.length && (
              <div className="muted small">
                Left your games after {moveLabel(rev.leftAt, rev.sans[rev.leftAt - 1])}.
              </div>
            )}
            <div className="review-actions">
              <button className="btn primary" onClick={restart}>
                Play again
              </button>
              <button className="btn" onClick={() => onExit(path)}>
                Study this game
              </button>
            </div>
          </div>
        ) : (
          <div className="practice-moves">
            {pos.sans.slice(startPath.length).map((s, i) => {
              const ply = startPath.length + i + 1;
              return (
                <span key={ply} className={ply === path.length ? 'on' : ''}>
                  {ply % 2 === 1 || i === 0 ? moveLabel(ply, s) : s}
                </span>
              );
            })}
            {path.length === startPath.length && <span className="muted small">Moves will appear here.</span>}
          </div>
        )}
      </aside>
    </div>
  );
}
