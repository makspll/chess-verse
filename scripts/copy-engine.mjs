// Copies the single-threaded lite Stockfish build into public/ so Vite serves it as-is.
import { copyFileSync, mkdirSync } from 'node:fs';

const src = 'node_modules/stockfish/bin';
const out = 'public/engine';
mkdirSync(out, { recursive: true });
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) copyFileSync(`${src}/${f}`, `${out}/${f}`);
copyFileSync('node_modules/stockfish/Copying.txt', `${out}/COPYING.txt`);
