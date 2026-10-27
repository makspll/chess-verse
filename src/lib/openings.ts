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

export function parseOpening(url?: string): { family: string; line: string } {
  if (!url) return { family: 'Unknown', line: '' };
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
  if (!words.length) return { family: 'Unknown', line: '' };
  let cut = words.findIndex((w) => FAMILY_END.has(w));
  if (cut === -1) return { family: words.join(' '), line: '' };
  if (FAMILY_SUFFIX.has(words[cut + 1])) cut++;
  return { family: words.slice(0, cut + 1).join(' '), line: words.slice(cut + 1).join(' ') };
}
