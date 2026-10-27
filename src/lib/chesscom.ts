import { Chess } from 'chess.js';
import { parseOpening } from './openings';
import { MAX_PLY, type Color, type Game, type Outcome, type TimeClass } from './types';

const API = 'https://api.chess.com/pub/player';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

interface RawPlayer {
  username: string;
  rating: number;
  result: string;
}

interface RawGame {
  uuid?: string;
  url: string;
  pgn?: string;
  end_time: number;
  time_class: string;
  rated: boolean;
  rules: string;
  initial_setup?: string;
  eco?: string;
  white: RawPlayer;
  black: RawPlayer;
}

/** API data ends up in href/src attributes, so only let plain https links through. */
function httpsOnly(url: unknown): string | undefined {
  return typeof url === 'string' && url.startsWith('https://') ? url : undefined;
}

async function getJson(url: string, attempt = 0): Promise<any> {
  const res = await fetch(url);
  if (res.status === 429 && attempt < 4) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    return getJson(url, attempt + 1);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`chess.com returned ${res.status}`);
  return res.json();
}

export async function fetchProfile(username: string): Promise<{ username: string; avatar?: string }> {
  const p = await getJson(`${API}/${username.toLowerCase()}`);
  if (!p) throw new Error('Player not found on chess.com');
  return { username: p.username ?? username, avatar: httpsOnly(p.avatar) };
}

export async function fetchArchives(username: string): Promise<string[]> {
  const data = await getJson(`${API}/${username.toLowerCase()}/games/archives`);
  return data?.archives ?? [];
}

export async function fetchMonth(url: string): Promise<RawGame[]> {
  // The current month is listed before it has games and returns 404 until then.
  const data = await getJson(url);
  return data?.games ?? [];
}

function movetext(pgn: string): string[] {
  return pgn
    .replace(/^\[.*\]\s*$/gm, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
}

function outcome(result: string): Outcome {
  if (result === 'win') return 'win';
  return DRAWS.has(result) ? 'draw' : 'loss';
}

export function toGame(raw: RawGame, username: string): Game | null {
  const url = httpsOnly(raw.url);
  if (raw.rules !== 'chess' || !raw.pgn || !url) return null;
  if (raw.initial_setup && raw.initial_setup !== START_FEN) return null;
  const user = username.toLowerCase();
  const color: Color = raw.white.username.toLowerCase() === user ? 'white' : 'black';
  const me = raw[color];
  const opp = raw[color === 'white' ? 'black' : 'white'];

  const chess = new Chess();
  const moves: string[] = [];
  const sans: string[] = [];
  for (const tok of movetext(raw.pgn)) {
    if (moves.length >= MAX_PLY) break;
    try {
      const m = chess.move(tok);
      moves.push(m.from + m.to + (m.promotion ?? ''));
      sans.push(m.san);
    } catch {
      break;
    }
  }

  const eco = /\[ECO "([^"]*)"\]/.exec(raw.pgn)?.[1] ?? '';
  const { family, line } = parseOpening(raw.eco);
  return {
    id: raw.uuid ?? url,
    url,
    end: raw.end_time,
    timeClass: raw.time_class as TimeClass,
    rated: raw.rated,
    color,
    outcome: outcome(me.result),
    myRating: me.rating,
    oppRating: opp.rating,
    opponent: opp.username,
    eco,
    ecoUrl: raw.eco,
    family,
    line,
    moves,
    sans,
  };
}

/** A month archive URL ends in /YYYY/MM; it is complete once that month is over. */
export function isPastMonth(archiveUrl: string, now = new Date()): boolean {
  const m = /(\d{4})\/(\d{2})$/.exec(archiveUrl);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return y < now.getUTCFullYear() || (y === now.getUTCFullYear() && mo < now.getUTCMonth() + 1);
}

export function monthLabel(archiveUrl: string): string {
  const m = /(\d{4})\/(\d{2})$/.exec(archiveUrl);
  if (!m) return '';
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
