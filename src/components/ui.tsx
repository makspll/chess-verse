import type { ReactNode } from 'react';
import { pct } from '../lib/colors';
import { sfx } from '../lib/sound';
import { TIME_CLASSES, type Tally } from '../lib/types';
import type { Filters, Period } from '../store';

export function WDLBar({ t, thin }: { t: Tally; thin?: boolean }) {
  if (!t.n) return <div className={'wdl' + (thin ? ' thin' : '')} />;
  const w = (t.w / t.n) * 100;
  const d = (t.d / t.n) * 100;
  const l = 100 - w - d;
  return (
    <div className={'wdl' + (thin ? ' thin' : '')} title={`${t.w}W · ${t.d}D · ${t.l}L`}>
      <span className="w" style={{ width: `${w}%` }}>{!thin && w >= 14 ? pct(t.w / t.n) : ''}</span>
      <span className="d" style={{ width: `${d}%` }}>{!thin && d >= 14 ? pct(t.d / t.n) : ''}</span>
      <span className="l" style={{ width: `${l}%` }}>{!thin && l >= 14 ? pct(t.l / t.n) : ''}</span>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          className={o.value === value ? 'on' : ''}
          onClick={() => {
            if (o.value !== value) sfx.select();
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const PERIODS: { value: Period; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '1y', label: '1 year' },
  { value: '6m', label: '6 months' },
  { value: '3m', label: '3 months' },
  { value: '1m', label: '30 days' },
];

export function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const toggle = (tc: (typeof TIME_CLASSES)[number]) => {
    const has = filters.timeClasses.includes(tc);
    const next = has ? filters.timeClasses.filter((x) => x !== tc) : [...filters.timeClasses, tc];
    if (next.length) {
      sfx.select();
      onChange({ ...filters, timeClasses: next });
    }
  };
  return (
    <div className="filters">
      <div className="chips">
        {TIME_CLASSES.map((tc) => (
          <button key={tc} className={'chip' + (filters.timeClasses.includes(tc) ? ' on' : '')} onClick={() => toggle(tc)}>
            {tc}
          </button>
        ))}
      </div>
      <select value={filters.period} onChange={(e) => onChange({ ...filters, period: e.target.value as Period })}>
        {PERIODS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      <select value={filters.rated} onChange={(e) => onChange({ ...filters, rated: e.target.value as Filters['rated'] })}>
        <option value="all">Rated &amp; casual</option>
        <option value="rated">Rated</option>
        <option value="casual">Casual</option>
      </select>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
