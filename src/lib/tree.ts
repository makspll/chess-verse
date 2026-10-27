import type { Game, Outcome, Tally } from './types';

export interface TreeNode extends Tally {
  uci: string;
  san: string;
  /** Ply count from the start position (root = 0). */
  ply: number;
  parent: TreeNode | null;
  children: Map<string, TreeNode>;
}

function node(uci: string, san: string, ply: number, parent: TreeNode | null): TreeNode {
  return { uci, san, ply, parent, children: new Map(), n: 0, w: 0, d: 0, l: 0 };
}

export function tallyAdd(t: Tally, o: Outcome) {
  t.n++;
  if (o === 'win') t.w++;
  else if (o === 'draw') t.d++;
  else t.l++;
}

export function emptyTally(): Tally {
  return { n: 0, w: 0, d: 0, l: 0 };
}

export function winRate(t: Tally): number {
  return t.n ? t.w / t.n : 0;
}

/** Score counts a draw as half a point, which is what actually moves your rating. */
export function score(t: Tally): number {
  return t.n ? (t.w + t.d / 2) / t.n : 0;
}

export function buildTree(games: Game[]): TreeNode {
  const root = node('', '', 0, null);
  for (const g of games) {
    let cur = root;
    tallyAdd(cur, g.outcome);
    for (let i = 0; i < g.moves.length; i++) {
      let next = cur.children.get(g.moves[i]);
      if (!next) {
        next = node(g.moves[i], g.sans[i], i + 1, cur);
        cur.children.set(g.moves[i], next);
      }
      tallyAdd(next, g.outcome);
      cur = next;
    }
  }
  return root;
}

export function walk(root: TreeNode, path: string[]): TreeNode | null {
  let cur: TreeNode | null = root;
  for (const m of path) {
    cur = cur.children.get(m) ?? null;
    if (!cur) return null;
  }
  return cur;
}

export function pathOf(n: TreeNode): string[] {
  const out: string[] = [];
  for (let c: TreeNode | null = n; c && c.parent; c = c.parent) out.push(c.uci);
  return out.reverse();
}

export function sortedChildren(n: TreeNode): TreeNode[] {
  return [...n.children.values()].sort((a, b) => b.n - a.n);
}

export function moveLabel(ply: number, san: string): string {
  const num = Math.ceil(ply / 2);
  return ply % 2 === 1 ? `${num}.${san}` : `${num}…${san}`;
}
