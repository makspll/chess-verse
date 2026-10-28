export type Color = 'white' | 'black';
export type Outcome = 'win' | 'draw' | 'loss';
export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'daily';

export const TIME_CLASSES: TimeClass[] = ['bullet', 'blitz', 'rapid', 'daily'];

export interface Game {
  id: string;
  url: string;
  /** Unix seconds. */
  end: number;
  timeClass: TimeClass;
  rated: boolean;
  /** The colour the user played. */
  color: Color;
  outcome: Outcome;
  myRating: number;
  oppRating: number;
  opponent: string;
  eco: string;
  /** Chess.com opening URL; family/line are derived from it on load. */
  ecoUrl?: string;
  family: string;
  line: string;
  /** UCI moves, capped at MAX_PLY. */
  moves: string[];
  sans: string[];
}

export interface Profile {
  username: string;
  avatar?: string;
  /** Archive month URLs that are complete and never need refetching. */
  doneMonths: string[];
  lastSync: number;
}

export interface Tally {
  n: number;
  w: number;
  d: number;
  l: number;
}

export const MAX_PLY = 40;

/** Cached engine verdict on a position. */
export interface PosEval {
  /** Centipawns from White's point of view; mates are folded to large values. */
  cp: number;
  /** Engine's chosen move (UCI), empty for finished games. */
  best: string;
  depth: number;
}
