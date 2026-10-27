import { PIECE_SVG } from './pieceSvg';

export function Piece({ code, x, y, size }: { code: string; x: number; y: number; size: number }) {
  return (
    <svg x={x} y={y} width={size} height={size} viewBox="0 0 45 45" dangerouslySetInnerHTML={{ __html: PIECE_SVG[code] }} />
  );
}

/** Standalone icon for use outside the board. */
export function PieceIcon({ code, size = 22 }: { code: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 45 45" dangerouslySetInnerHTML={{ __html: PIECE_SVG[code] }} />;
}
