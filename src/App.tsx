import { useState, type ReactElement } from 'react';
import { setBulkPaused, useBulkAnalysis, useBulkStatus } from './lib/bulk';
import { useClassify } from './lib/settings';
import { isMuted, setMuted, sfx } from './lib/sound';
import { ImportPage } from './pages/ImportPage';
import { StatsPage } from './pages/StatsPage';
import { TrainingPage } from './pages/TrainingPage';
import { go, useRoute, type Page } from './router';
import { useStore } from './store';

const NAV: { page: Page; label: string; icon: ReactElement }[] = [
  {
    page: 'train',
    label: 'Training Ground',
    icon: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="4.5" r="2.2" />
        <circle cx="5" cy="19" r="2.2" />
        <circle cx="12" cy="19" r="2.2" />
        <circle cx="19" cy="19" r="2.2" />
        <path d="M12 6.5v4M12 10.5 5 17M12 10.5V17M12 10.5 19 17" fill="none" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    page: 'stats',
    label: 'Stats',
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="3" y="12" width="4" height="9" rx="1" />
        <rect x="10" y="7" width="4" height="14" rx="1" />
        <rect x="17" y="3" width="4" height="18" rx="1" />
      </svg>
    ),
  },
  {
    page: 'import',
    label: 'Import',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M12 3v11m0 0-4.5-4.5M12 14l4.5-4.5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function App() {
  const { ready, games, profile } = useStore();
  const route = useRoute();
  const [muted, setMutedState] = useState(isMuted());
  const page: Page = route.page ?? (games.length ? 'train' : 'import');
  const [classify, setClassify] = useClassify();
  const bulk = useBulkStatus();
  useBulkAnalysis(games, classify);

  return (
    <div className="shell">
      <nav className="side">
        <div className="logo" onClick={() => go('train')}>
          <img src="./favicon.svg" alt="" />
          <span>Multiverse</span>
        </div>
        {NAV.map((n) => (
          <a
            key={n.page}
            className={'nav' + (page === n.page ? ' on' : '')}
            href={`#/${n.page}`}
            onClick={() => page !== n.page && sfx.select()}
          >
            {n.icon}
            <span>{n.label}</span>
          </a>
        ))}
        <div className="quality">
          <button
            className={'tool' + (classify ? ' on' : '')}
            onClick={() => {
              sfx.select();
              setClassify(!classify);
            }}
            title="Rate each move as engine move, good, normal, bad or very bad"
          >
            Move quality: {classify ? 'on' : 'off'}
          </button>
          {classify && bulk.running && (
            <div className="muted small bulk">
              <span>
                Pre-analysing {bulk.done.toLocaleString()} / {bulk.total.toLocaleString()}
              </span>
              <button className="link" onClick={() => setBulkPaused(!bulk.paused)}>
                {bulk.paused ? 'Resume' : 'Pause'}
              </button>
            </div>
          )}
        </div>
        <div className="side-foot">
          {profile && (
            <div className="who" title={profile.username}>
              {profile.avatar ? <img src={profile.avatar} alt="" /> : <div className="avatar-dot" />}
              <span>{profile.username}</span>
            </div>
          )}
          <button
            className="icon-btn"
            title={muted ? 'Unmute' : 'Mute'}
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
              if (muted) sfx.move();
            }}
          >
            <svg viewBox="0 0 24 24">
              <path d="M4 9h4l5-4v14l-5-4H4z" />
              {muted ? (
                <path d="m16 9 5 6m0-6-5 6" fill="none" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </nav>
      <main className="main">
        {!ready ? null : page === 'import' ? (
          <ImportPage />
        ) : page === 'stats' ? (
          <StatsPage />
        ) : (
          <TrainingPage params={route.params} />
        )}
      </main>
    </div>
  );
}
