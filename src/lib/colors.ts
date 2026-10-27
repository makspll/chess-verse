const STOPS: [number, [number, number, number]][] = [
  [0.3, [232, 112, 96]],
  [0.5, [222, 178, 92]],
  [0.7, [78, 192, 146]],
];

/** Coral → sand → mint for a 0..1 win rate. */
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

export const ENGINE_COLOR = 'rgb(95, 180, 255)';

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
