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
  options: [string, string | number | boolean][];
  go: string;
  onUpdate?: (lines: EngineLine[]) => void;
  onDone?: (lines: EngineLine[], best: string) => void;
  /** Called when a newer job (or stop) replaces this one before it finished. */
  onCancel?: () => void;
}

/** Stockfish's own strength limiter doesn't go below this. */
export const MIN_UCI_ELO = 1320;

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

  private cancelPending() {
    const pending = this.current ?? this.waiting;
    this.current = null;
    this.waiting = null;
    pending?.onCancel?.();
  }

  private run(job: Omit<Job, 'gen'>) {
    const w = this.ensure();
    this.cancelPending();
    this.gen++;
    this.current = null;
    this.waiting = { ...job, gen: this.gen };
    w.postMessage('stop');
    w.postMessage('isready');
  }

  /** Full-strength analysis, streaming lines as the search deepens. */
  analyse(fen: string, multipv: number, depth: number, onUpdate: (lines: EngineLine[]) => void) {
    this.run({
      fen,
      multipv,
      options: [['UCI_LimitStrength', false]],
      go: `go depth ${depth}`,
      onUpdate,
    });
  }

  /** A strength-limited search; resolves with the engine's top lines and its chosen move. */
  search(fen: string, opts: { multipv: number; go: string; elo?: number }): Promise<{ lines: EngineLine[]; best: string }> {
    return new Promise((resolve, reject) => {
      const options: Job['options'] = opts.elo
        ? [['UCI_LimitStrength', true], ['UCI_Elo', Math.max(opts.elo, MIN_UCI_ELO)]]
        : [['UCI_LimitStrength', false]];
      this.run({
        fen,
        multipv: opts.multipv,
        options,
        go: opts.go,
        onDone: (lines, best) => resolve({ lines, best }),
        onCancel: () => reject(new Error('cancelled')),
      });
    });
  }

  stop() {
    this.cancelPending();
    this.gen++;
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
      for (const [k, v] of job.options) w.postMessage(`setoption name ${k} value ${v}`);
      w.postMessage(`position fen ${job.fen}`);
      w.postMessage(job.go);
      return;
    }
    const job = this.current;
    if (!job || job.gen !== this.gen) return;

    if (line.startsWith('bestmove')) {
      const best = line.split(' ')[1];
      if (!this.legal.has(best)) return;
      this.current = null;
      job.onDone?.(this.lines.filter(Boolean), best);
      return;
    }
    if (!line.startsWith('info ') || !line.includes(' pv ')) return;

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
    job.onUpdate?.(this.lines.filter(Boolean).slice(0, job.multipv));
  }
}

export const engine = new Engine();
/** Separate workers so classification and the background job never cancel live analysis. */
export const evalEngine = new Engine();
export const bulkEngine = new Engine();

export function formatEval(l: EngineLine): string {
  if (l.mate !== undefined) return `${l.mate > 0 ? '' : '-'}M${Math.abs(l.mate)}`;
  const v = (l.cp ?? 0) / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

/** Centipawns from White's view, with mates mapped to large values. */
export function evalCp(l: EngineLine): number {
  if (l.mate !== undefined) return Math.sign(l.mate) * (10000 - Math.abs(l.mate) * 10);
  return l.cp ?? 0;
}
