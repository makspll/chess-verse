import { Chess } from 'chess.js';

export interface EngineLine {
  multipv: number;
  depth: number;
  /** Centipawns from White's point of view. */
  cp?: number;
  /** Mate in N from White's point of view (negative = Black mates). */
  mate?: number;
  pv: string[];
}

interface Job {
  gen: number;
  fen: string;
  multipv: number;
  depth: number;
  onUpdate: (lines: EngineLine[]) => void;
}

// Stockfish (lite, single-threaded WASM) running in a Web Worker.
// Single-threaded because GitHub Pages can't send the COOP/COEP headers
// SharedArrayBuffer needs.
class Engine {
  private worker: Worker | null = null;
  private gen = 0;
  private waiting: Job | null = null;
  private current: Job | null = null;
  private lines: EngineLine[] = [];
  private legal = new Set<string>();

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`);
    w.onmessage = (e) => this.onLine(String(e.data));
    w.postMessage('uci');
    this.worker = w;
    return w;
  }

  analyse(fen: string, multipv: number, depth: number, onUpdate: (lines: EngineLine[]) => void) {
    const w = this.ensure();
    this.gen++;
    this.current = null;
    this.waiting = { gen: this.gen, fen, multipv, depth, onUpdate };
    w.postMessage('stop');
    w.postMessage('isready');
  }

  stop() {
    this.gen++;
    this.current = null;
    this.waiting = null;
    this.worker?.postMessage('stop');
  }

  private onLine(line: string) {
    if (line === 'readyok' && this.waiting && this.waiting.gen === this.gen) {
      const job = this.waiting;
      this.waiting = null;
      this.current = job;
      this.lines = [];
      this.legal = new Set(new Chess(job.fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? '')));
      const w = this.worker!;
      w.postMessage(`setoption name MultiPV value ${job.multipv}`);
      w.postMessage(`position fen ${job.fen}`);
      w.postMessage(`go depth ${job.depth}`);
      return;
    }
    const job = this.current;
    if (!job || job.gen !== this.gen || !line.startsWith('info ') || !line.includes(' pv ')) return;

    const tok = line.split(' ');
    const at = (k: string) => tok.indexOf(k);
    const pv = tok.slice(at('pv') + 1);
    // Drop stray output from a search that was still winding down.
    if (!this.legal.has(pv[0])) return;
    const multipv = at('multipv') >= 0 ? Number(tok[at('multipv') + 1]) : 1;
    const depth = Number(tok[at('depth') + 1]);
    const sign = job.fen.split(' ')[1] === 'w' ? 1 : -1;
    const s = at('score');
    const l: EngineLine = { multipv, depth, pv };
    if (tok[s + 1] === 'cp') l.cp = Number(tok[s + 2]) * sign;
    else if (tok[s + 1] === 'mate') l.mate = Number(tok[s + 2]) * sign;
    this.lines[multipv - 1] = l;
    job.onUpdate(this.lines.filter(Boolean).slice(0, job.multipv));
  }
}

export const engine = new Engine();

export function formatEval(l: EngineLine): string {
  if (l.mate !== undefined) return `${l.mate > 0 ? '' : '-'}M${Math.abs(l.mate)}`;
  const v = (l.cp ?? 0) / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}
