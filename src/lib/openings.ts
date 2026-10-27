// Chess.com tags every game with an ECO URL such as
// https://www.chess.com/openings/Sicilian-Defense-Najdorf-Variation-6.Be3
// We split it into a family ("Sicilian Defense") and a line ("Najdorf Variation").

const FAMILY_END = new Set(['Defense', 'Defence', 'Opening', 'Game', 'Gambit', 'Attack', 'System', 'Countergambit']);
const FAMILY_SUFFIX = new Set(['Accepted', 'Declined', 'Refused']);

const PRETTY: Record<string, string> = {
  Kings: "King's",
  Queens: "Queen's",
  Bishops: "Bishop's",
  Petrovs: "Petrov's",
  Alekhines: "Alekhine's",
  Birds: "Bird's",
  Owens: "Owen's",
  Larsens: "Larsen's",
  Philidors: "Philidor's",
  Grobs: "Grob's",
};

// Chess.com tags offbeat starts as ".../openings/Undefined"; name those by White's first move.
const FIRST_MOVE: Record<string, string> = {
  a3: "Anderssen's Opening",
  a4: 'Ware Opening',
  b3: 'Nimzo-Larsen Attack',
  b4: 'Polish Opening',
  c3: 'Saragossa Opening',
  d3: 'Mieses Opening',
  e3: "Van't Kruijs Opening",
  f3: 'Barnes Opening',
  f4: "Bird's Opening",
  g3: 'Hungarian Opening',
  g4: 'Grob Opening',
  h3: 'Clemenz Opening',
  h4: 'Kádas Opening',
  Na3: 'Durkin Opening',
  Nc3: 'Van Geet Opening',
  Nh3: 'Amar Opening',
};

function fromMoves(sans: string[]): { family: string; line: string } {
  if (!sans.length) return { family: 'No moves', line: '' };
  const line = `1.${sans[0]}${sans[1] ? ` ${sans[1]}` : ''}`;
  return { family: FIRST_MOVE[sans[0]] ?? 'Uncommon Opening', line };
}

/** Family/line for a game, falling back to its moves when chess.com has no name. */
export function openingOf(url: string | undefined, sans: string[]): { family: string; line: string } {
  const o = parseOpening(url);
  return o ? o : fromMoves(sans);
}

function parseOpening(url?: string): { family: string; line: string } | null {
  if (!url) return null;
  const slug = decodeURIComponent(url.split('/openings/')[1] ?? '');
  const words: string[] = [];
  for (const w of slug.split('-')) {
    if (!w) continue;
    if (/^\d/.test(w)) break; // move suffix like "6.Be3"
    // Suffix glued to a word, like "Variation...3.exd5".
    const glued = /^(.*?)\.+\d/.exec(w);
    if (glued) {
      if (glued[1]) words.push(PRETTY[glued[1]] ?? glued[1]);
      break;
    }
    words.push(PRETTY[w] ?? w);
  }
  if (!words.length || words[0] === 'Undefined') return null;
  let cut = words.findIndex((w) => FAMILY_END.has(w));
  if (cut === -1) return { family: words.join(' '), line: '' };
  if (FAMILY_SUFFIX.has(words[cut + 1])) cut++;
  return { family: words.slice(0, cut + 1).join(' '), line: words.slice(cut + 1).join(' ') };
}
