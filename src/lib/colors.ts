const STOPS: [number, [number, number, number]][] = [
  [0.3, [224, 90, 71]],
  [0.5, [214, 170, 62]],
  [0.7, [129, 182, 76]],
];

/** Red → amber → green for a 0..1 win rate. */
export function rateColor(r: number): string {
  if (r <= STOPS[0][0]) return `rgb(${STOPS[0][1].join(',')})`;
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i];
    const [p0, c0] = STOPS[i - 1];
    if (r <= p1) {
      const t = (r - p0) / (p1 - p0);
      return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * t)).join(',')})`;
    }
  }
  return `rgb(${STOPS[STOPS.length - 1][1].join(',')})`;
}

export const ENGINE_COLOR = 'rgb(76, 160, 230)';

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
