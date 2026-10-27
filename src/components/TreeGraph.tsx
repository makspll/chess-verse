import { useEffect, useMemo, useRef, useState } from 'react';
import { pct, rateColor } from '../lib/colors';
import { sfx } from '../lib/sound';
import { moveLabel, pathOf, winRate, type TreeNode } from '../lib/tree';
import type { Color } from '../lib/types';

interface Props {
  root: TreeNode;
  path: string[];
  color: Color;
  onJump: (path: string[]) => void;
}

interface Placed {
  node: TreeNode;
  x: number;
  y: number;
  r: number;
  onPath: boolean;
  parent: Placed | null;
}

const COL = 112;
const ROW = 30;
const PAD = 36;
const BUDGETS = [120, 300, 700, 1600];

/** The smallest game count that keeps roughly `budget` nodes visible. */
function threshold(root: TreeNode, budget: number): number {
  const counts: number[] = [];
  const stack = [root];
  while (stack.length) {
    const n = stack.pop()!;
    counts.push(n.n);
    for (const c of n.children.values()) stack.push(c);
  }
  if (counts.length <= budget) return 1;
  counts.sort((a, b) => b - a);
  return Math.max(1, counts[budget]  + 1);
}

function layout(root: TreeNode, minN: number, path: string[]) {
  const onPath = new Set<TreeNode>();
  let cur: TreeNode | undefined = root;
  onPath.add(root);
  for (const m of path) {
    cur = cur?.children.get(m);
    if (!cur) break;
    onPath.add(cur);
  }

  const placed: Placed[] = [];
  let leaf = 0;
  let maxPly = 0;
  const visit = (n: TreeNode, parent: Placed | null): Placed => {
    const p: Placed = {
      node: n,
      x: PAD + n.ply * COL,
      y: 0,
      r: 3.5 + 11 * Math.sqrt(n.n / root.n),
      onPath: onPath.has(n),
      parent,
    };
    placed.push(p);
    maxPly = Math.max(maxPly, n.ply);
    const kids = [...n.children.values()].filter((c) => c.n >= minN || onPath.has(c)).sort((a, b) => b.n - a.n);
    if (!kids.length) {
      p.y = PAD + leaf++ * ROW;
    } else {
      const ys = kids.map((k) => visit(k, p).y);
      p.y = (ys[0] + ys[ys.length - 1]) / 2;
    }
    return p;
  };
  visit(root, null);
  return { placed, width: PAD * 2 + maxPly * COL + 80, height: PAD * 2 + Math.max(leaf - 1, 0) * ROW, current: cur };
}

export function TreeGraph({ root, path, color, onJump }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [budget, setBudget] = useState(1);
  const minN = useMemo(() => threshold(root, BUDGETS[budget]), [root, budget]);
  const { placed, width, height, current } = useMemo(() => layout(root, minN, path), [root, minN, path]);
  const pan = useRef<{ x: number; y: number; sl: number; st: number; moved: boolean } | null>(null);

  const cur = placed.find((p) => p.node === current);
  useEffect(() => {
    const el = box.current;
    if (!el || !cur) return;
    el.scrollTo({
      left: cur.x - el.clientWidth * 0.35,
      top: cur.y - el.clientHeight / 2,
      behavior: 'smooth',
    });
  }, [cur?.x, cur?.y]);

  const myParity = color === 'white' ? 1 : 0;

  return (
    <div className="graph-wrap">
      <div className="graph-tools">
        <span className="muted small">
          Showing lines with {minN}+ game{minN === 1 ? '' : 's'}
        </span>
        <div className="seg small">
          {BUDGETS.map((_, i) => (
            <button key={i} className={i === budget ? 'on' : ''} onClick={() => setBudget(i)} title="Detail">
              {'•'.repeat(i + 1)}
            </button>
          ))}
        </div>
      </div>
      <div
        className="graph"
        ref={box}
        onPointerDown={(e) => {
          const el = box.current!;
          pan.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false };
        }}
        onPointerMove={(e) => {
          const p = pan.current;
          if (!p || !(e.buttons & 1)) return;
          const dx = e.clientX - p.x;
          const dy = e.clientY - p.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) p.moved = true;
          box.current!.scrollLeft = p.sl - dx;
          box.current!.scrollTop = p.st - dy;
        }}
        onPointerUp={() => setTimeout(() => (pan.current = null))}
      >
        <svg width={width} height={height}>
          {placed.map(
            (p) =>
              p.parent && (
                <path
                  key={'e' + pathOf(p.node).join('')}
                  d={`M${p.parent.x},${p.parent.y} C${p.parent.x + COL / 2},${p.parent.y} ${p.x - COL / 2},${p.y} ${p.x},${p.y}`}
                  fill="none"
                  stroke={p.onPath ? 'var(--text)' : rateColor(winRate(p.node))}
                  strokeOpacity={p.onPath ? 0.9 : 0.35}
                  strokeWidth={p.onPath ? 3 : 1 + 7 * (p.node.n / root.n)}
                />
              ),
          )}
          {placed.map((p) => {
            const n = p.node;
            const mine = n.ply % 2 === myParity;
            const isCur = n === current;
            return (
              <g
                key={'n' + pathOf(n).join('')}
                className="gnode"
                onClick={() => {
                  if (pan.current?.moved) return;
                  sfx.move();
                  onJump(pathOf(n));
                }}
              >
                <title>
                  {`${n.ply ? moveLabel(n.ply, n.san) : 'Start'} · ${n.n} games · ${pct(winRate(n))} won (${n.w}/${n.d}/${n.l})`}
                </title>
                {isCur && <circle cx={p.x} cy={p.y} r={p.r + 5} fill="none" stroke="var(--text)" strokeWidth={2.5} />}
                <circle cx={p.x} cy={p.y} r={p.r} fill={rateColor(winRate(n))} />
                {n.ply > 0 && (
                  <text
                    x={p.x + p.r + 5}
                    y={p.y - 6}
                    className={'glabel' + (mine ? ' mine' : '') + (p.onPath ? ' path' : '')}
                  >
                    {moveLabel(n.ply, n.san)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
