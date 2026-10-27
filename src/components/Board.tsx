import { Chess, type Square } from 'chess.js';
import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Color } from '../lib/types';
import { Piece } from './pieces';

export interface BoardArrow {
  from: string;
  to: string;
  color: string;
  /** Shaft width in board units (a square is 100). */
  width: number;
  opacity: number;
  label?: string;
  sublabel?: string;
  /** Engine arrows sit in a different corner and are drawn as outlines. */
  engine?: boolean;
}

export interface BoardAnim {
  from: string;
  to: string;
}

interface Props {
  fen: string;
  orientation: Color;
  arrows: BoardArrow[];
  lastMove?: [string, string];
  selected: string | null;
  onSelect: (sq: string | null) => void;
  onMove: (uci: string, dragged: boolean) => void;
  /** Slide the piece now on `anim.to` in from `anim.from` when the fen changes. */
  anim?: BoardAnim | null;
  /** Only pieces of this colour can be picked up (e.g. while a bot is to move). */
  allow?: Color;
}

const FILES = 'abcdefgh';
const S = 100;

function sqXY(sq: string, o: Color): [number, number] {
  const f = FILES.indexOf(sq[0]);
  const r = Number(sq[1]) - 1;
  return o === 'white' ? [f * S, (7 - r) * S] : [(7 - f) * S, r * S];
}

function xySq(x: number, y: number, o: Color): string | null {
  const c = Math.floor(x / S);
  const r = Math.floor(y / S);
  if (c < 0 || c > 7 || r < 0 || r > 7) return null;
  return o === 'white' ? FILES[c] + (8 - r) : FILES[7 - c] + (r + 1);
}

function arrowGeometry(a: BoardArrow, o: Color) {
  const [x1, y1] = sqXY(a.from, o).map((v) => v + S / 2);
  const [x2, y2] = sqXY(a.to, o).map((v) => v + S / 2);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const pts: [number, number][] = [[x1, y1]];
  const knight = (Math.abs(dx) === S && Math.abs(dy) === 2 * S) || (Math.abs(dx) === 2 * S && Math.abs(dy) === S);
  if (knight) pts.push(Math.abs(dx) > Math.abs(dy) ? [x2, y1] : [x1, y2]);
  const [px, py] = pts[pts.length - 1];
  const len = Math.hypot(x2 - px, y2 - py);
  const ux = (x2 - px) / len;
  const uy = (y2 - py) / len;
  const head = Math.max(a.width * 1.7, 26);
  const headW = Math.max(a.width * 2.3, 30);
  const tip: [number, number] = [x2 - ux * 8, y2 - uy * 8];
  const base: [number, number] = [tip[0] - ux * head, tip[1] - uy * head];
  pts.push(base);
  const nx = -uy;
  const ny = ux;
  const headPts = [
    tip,
    [base[0] + (nx * headW) / 2, base[1] + (ny * headW) / 2],
    [base[0] - (nx * headW) / 2, base[1] - (ny * headW) / 2],
  ];
  return {
    shaft: pts.map((p) => p.join(',')).join(' '),
    head: headPts.map((p) => p.join(',')).join(' '),
  };
}

export function Board({ fen, orientation, arrows, lastMove, selected, onSelect, onMove, anim, allow }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pieceRefs = useRef(new Map<string, SVGGElement>());
  const [drag, setDrag] = useState<{ from: string; x: number; y: number; active: boolean; wasSelected: boolean } | null>(
    null,
  );

  const chess = useMemo(() => new Chess(fen), [fen]);
  const turn = chess.turn() === 'w' ? 'white' : 'black';

  const legal = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const mv of chess.moves({ verbose: true })) {
      if (mv.promotion && mv.promotion !== 'q') continue;
      if (!m.has(mv.from)) m.set(mv.from, new Map());
      m.get(mv.from)!.set(mv.to, mv.from + mv.to + (mv.promotion ?? ''));
    }
    return m;
  }, [chess]);

  const pieces = useMemo(() => {
    const out: { sq: string; code: string }[] = [];
    chess.board().forEach((row) =>
      row.forEach((p) => {
        if (p) out.push({ sq: p.square, code: p.color + p.type.toUpperCase() });
      }),
    );
    return out;
  }, [chess]);

  const checkSq = useMemo(() => {
    if (!chess.inCheck()) return null;
    return pieces.find((p) => p.code === (chess.turn() + 'K'))?.sq ?? null;
  }, [chess, pieces]);

  useLayoutEffect(() => {
    if (!anim) return;
    const el = pieceRefs.current.get(anim.to);
    if (!el) return;
    const [fx, fy] = sqXY(anim.from, orientation);
    const [tx, ty] = sqXY(anim.to, orientation);
    el.style.transition = 'none';
    el.style.transform = `translate(${fx - tx}px, ${fy - ty}px)`;
    el.getBoundingClientRect();
    el.style.transition = 'transform 160ms cubic-bezier(.2,.8,.3,1)';
    el.style.transform = '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  const point = (e: RPointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 8 * S, ((e.clientY - r.top) / r.height) * 8 * S] as const;
  };

  const tryMove = (from: string, to: string, dragged: boolean) => {
    const uci = legal.get(from)?.get(to);
    if (!uci) return false;
    onSelect(null);
    onMove(uci, dragged);
    return true;
  };

  const onDown = (e: RPointerEvent) => {
    if (e.button !== 0) return;
    const [x, y] = point(e);
    const sq = xySq(x, y, orientation);
    if (!sq) return;
    if (selected && selected !== sq && tryMove(selected, sq, false)) return;
    const p = chess.get(sq as Square);
    if (p && (p.color === 'w' ? 'white' : 'black') === turn && (!allow || allow === turn)) {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDrag({ from: sq, x, y, active: false, wasSelected: selected === sq });
      if (selected !== sq) onSelect(sq);
    } else {
      onSelect(null);
    }
  };

  const onMoveEvt = (e: RPointerEvent) => {
    if (!drag) return;
    const [x, y] = point(e);
    const active = drag.active || Math.hypot(x - drag.x, y - drag.y) > 12;
    setDrag({ ...drag, x, y, active });
  };

  const onUp = (e: RPointerEvent) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.active) {
      const [x, y] = point(e);
      const sq = xySq(x, y, orientation);
      if (sq && sq !== d.from) tryMove(d.from, sq, true);
    } else if (d.wasSelected) {
      onSelect(null);
    }
  };

  const targets = selected ? legal.get(selected) : undefined;
  const engineArrows = arrows.filter((a) => a.engine);
  const gameArrows = arrows.filter((a) => !a.engine);
  const labelled = arrows.filter((a) => a.label);

  return (
    <svg
      ref={svgRef}
      className="board"
      viewBox={`0 0 ${8 * S} ${8 * S}`}
      onPointerDown={onDown}
      onPointerMove={onMoveEvt}
      onPointerUp={onUp}
      onPointerCancel={() => setDrag(null)}
    >
      {Array.from({ length: 64 }, (_, i) => {
        const c = i % 8;
        const r = Math.floor(i / 8);
        const light = (c + r) % 2 === 0;
        return <rect key={i} x={c * S} y={r * S} width={S} height={S} fill={light ? 'var(--sq-light)' : 'var(--sq-dark)'} />;
      })}

      {lastMove?.map((sq) => {
        const [x, y] = sqXY(sq, orientation);
        return <rect key={'lm' + sq} x={x} y={y} width={S} height={S} fill="var(--sq-hl)" />;
      })}
      {selected && (() => {
        const [x, y] = sqXY(selected, orientation);
        return <rect x={x} y={y} width={S} height={S} fill="var(--sq-hl)" />;
      })()}
      {checkSq && (() => {
        const [x, y] = sqXY(checkSq, orientation);
        return <rect x={x} y={y} width={S} height={S} fill="url(#check)" />;
      })()}

      {Array.from({ length: 8 }, (_, i) => {
        const file = orientation === 'white' ? FILES[i] : FILES[7 - i];
        const rank = orientation === 'white' ? 8 - i : i + 1;
        return (
          <g key={'c' + i} className="coord">
            <text x={4} y={i * S + 20} fill={i % 2 === 0 ? 'var(--sq-dark)' : 'var(--sq-light)'}>
              {rank}
            </text>
            <text x={i * S + S - 4} y={8 * S - 6} textAnchor="end" fill={i % 2 === 1 ? 'var(--sq-dark)' : 'var(--sq-light)'}>
              {file}
            </text>
          </g>
        );
      })}

      {pieces.map(({ sq, code }) => {
        const [x, y] = sqXY(sq, orientation);
        const hidden = drag?.active && drag.from === sq;
        return (
          <g
            key={sq}
            ref={(el) => {
              if (el) pieceRefs.current.set(sq, el);
              else pieceRefs.current.delete(sq);
            }}
            style={{ opacity: hidden ? 0.25 : 1 }}
          >
            <Piece code={code} x={x} y={y} size={S} />
          </g>
        );
      })}

      {targets &&
        [...targets.keys()].map((to) => {
          const [x, y] = sqXY(to, orientation);
          const occupied = !!chess.get(to as Square);
          return occupied ? (
            <circle key={'t' + to} cx={x + S / 2} cy={y + S / 2} r={S / 2 - 5} fill="none" stroke="var(--dot)" strokeWidth={9} />
          ) : (
            <circle key={'t' + to} cx={x + S / 2} cy={y + S / 2} r={S / 6.5} fill="var(--dot)" />
          );
        })}

      <g className="arrows">
        {gameArrows.map((a) => {
          const g = arrowGeometry(a, orientation);
          return (
            <g key={'a' + a.from + a.to} opacity={a.opacity}>
              <polyline points={g.shaft} fill="none" stroke={a.color} strokeWidth={a.width} strokeLinejoin="round" />
              <polygon points={g.head} fill={a.color} />
            </g>
          );
        })}
        {engineArrows.map((a) => {
          const g = arrowGeometry(a, orientation);
          return (
            <g key={'e' + a.from + a.to} opacity={a.opacity}>
              <polyline points={g.shaft} fill="none" stroke={a.color} strokeWidth={a.width} strokeDasharray="14 8" strokeLinejoin="round" />
              <polygon points={g.head} fill={a.color} />
            </g>
          );
        })}
      </g>

      <g className="labels">
        {labelled.map((a) => {
          const [x, y] = sqXY(a.to, orientation);
          const w = Math.max((a.label ?? '').length * 12 + 16, (a.sublabel ?? '').length * 7.4 + 14);
          // Keep the pill inside the board when the target is on an edge file.
          const cx = Math.min(Math.max(a.engine ? x + w / 2 + 2 : x + S - w / 2 - 2, w / 2 + 2), 8 * S - w / 2 - 2);
          const cy = a.engine ? y + S - 20 : y + 20;
          return (
            <g key={'l' + a.from + a.to + (a.engine ? 'e' : '')} transform={`translate(${cx},${cy})`}>
              <rect
                x={-w / 2}
                y={-16}
                width={w}
                height={a.sublabel ? 46 : 32}
                rx={8}
                fill={a.color}
                stroke="rgba(17,18,21,0.55)"
                strokeWidth={2}
              />
              <text y={6} textAnchor="middle" className="label-main">
                {a.label}
              </text>
              {a.sublabel && (
                <text y={23} textAnchor="middle" className="label-sub">
                  {a.sublabel}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {drag?.active && (() => {
        const p = chess.get(drag.from as Square);
        if (!p) return null;
        return (
          <g style={{ pointerEvents: 'none' }}>
            <Piece code={p.color + p.type.toUpperCase()} x={drag.x - S * 0.55} y={drag.y - S * 0.55} size={S * 1.1} />
          </g>
        );
      })()}

      <defs>
        <radialGradient id="check">
          <stop offset="0%" stopColor="#ff6a55" stopOpacity="0.95" />
          <stop offset="50%" stopColor="#e4503c" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#c43a2a" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}
