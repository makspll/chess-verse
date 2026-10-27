import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchArchives, fetchMonth, fetchProfile, isPastMonth, monthLabel, toGame } from './lib/chesscom';
import { openingOf } from './lib/openings';
import { clearAll, loadGames, loadProfile, putGames, saveProfile } from './lib/db';
import { TIME_CLASSES, type Game, type Profile, type TimeClass } from './lib/types';

export type Period = 'all' | '1y' | '6m' | '3m' | '1m';

export interface Filters {
  timeClasses: TimeClass[];
  rated: 'all' | 'rated' | 'casual';
  period: Period;
}

export interface SyncProgress {
  done: number;
  total: number;
  month: string;
  added: number;
  failed: number;
}

const DEFAULT_FILTERS: Filters = { timeClasses: [...TIME_CLASSES], rated: 'all', period: 'all' };

const PERIOD_DAYS: Record<Period, number> = { all: Infinity, '1y': 365, '6m': 182, '3m': 91, '1m': 30 };

/** Re-derive opening names so naming fixes apply without a reimport. */
async function loadSorted(): Promise<Game[]> {
  const games = await loadGames();
  for (const g of games) Object.assign(g, openingOf(g.ecoUrl, g.sans));
  return games.sort((a, b) => b.end - a.end);
}

export function applyFilters(games: Game[], f: Filters): Game[] {
  const since = f.period === 'all' ? 0 : Date.now() / 1000 - PERIOD_DAYS[f.period] * 86400;
  return games.filter(
    (g) =>
      f.timeClasses.includes(g.timeClass) &&
      g.end >= since &&
      (f.rated === 'all' || (f.rated === 'rated') === g.rated),
  );
}

interface Store {
  ready: boolean;
  profile: Profile | null;
  games: Game[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  sync: (username: string, onProgress: (p: SyncProgress) => void) => Promise<{ total: number; failed: number }>;
  reset: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

function readFilters(): Filters {
  try {
    return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem('filters') ?? '{}') };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [filters, setFiltersState] = useState<Filters>(readFilters);

  useEffect(() => {
    Promise.all([loadProfile(), loadSorted()])
      .then(([p, g]) => {
        setProfile(p);
        setGames(g);
      })
      .finally(() => setReady(true));
  }, []);

  const setFilters = useCallback((f: Filters) => {
    setFiltersState(f);
    localStorage.setItem('filters', JSON.stringify(f));
  }, []);

  const sync = useCallback(
    async (username: string, onProgress: (p: SyncProgress) => void) => {
      const name = username.trim();
      let prof = await loadProfile();
      if (prof && prof.username.toLowerCase() !== name.toLowerCase()) {
        await clearAll();
        prof = null;
      }
      const info = await fetchProfile(name);
      const archives = await fetchArchives(name);
      const doneMonths = new Set(prof?.doneMonths ?? []);
      const todo = archives.filter((a) => !doneMonths.has(a)).reverse(); // newest first
      let added = 0;
      let finished = 0;
      let failed = 0;
      onProgress({ done: 0, total: todo.length, month: '', added, failed });

      // A few months in flight at once; chess.com rate-limits parallel bursts.
      const queue = [...todo];
      const worker = async () => {
        for (let url = queue.shift(); url; url = queue.shift()) {
          try {
            const raws = await fetchMonth(url);
            const parsed = raws.map((r) => toGame(r, name)).filter((g): g is Game => g !== null);
            await putGames(parsed);
            if (isPastMonth(url)) doneMonths.add(url);
            added += parsed.length;
          } catch {
            // Not marked done, so the next resync retries this month.
            failed++;
          }
          finished++;
          onProgress({ done: finished, total: todo.length, month: monthLabel(url), added, failed });
        }
      };
      await Promise.all([worker(), worker(), worker()]);

      const next: Profile = {
        username: info.username,
        avatar: info.avatar,
        doneMonths: [...doneMonths],
        lastSync: Date.now(),
      };
      await saveProfile(next);
      const all = await loadSorted();
      setProfile(next);
      setGames(all);
      return { total: all.length, failed };
    },
    [],
  );

  const reset = useCallback(async () => {
    await clearAll();
    setProfile(null);
    setGames([]);
  }, []);

  const value = useMemo(
    () => ({ ready, profile, games, filters, setFilters, sync, reset }),
    [ready, profile, games, filters, setFilters, sync, reset],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
