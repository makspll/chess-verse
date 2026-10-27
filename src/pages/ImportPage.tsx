import { useState } from 'react';
import { sfx } from '../lib/sound';
import { go } from '../router';
import { useStore, type SyncProgress } from '../store';

function ago(ms: number): string {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function ImportPage() {
  const { profile, games, sync, reset } = useStore();
  const [name, setName] = useState(profile?.username ?? '');
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState('');
  const busy = progress !== null;

  const run = async (username: string) => {
    if (!username.trim() || busy) return;
    setError('');
    setProgress({ done: 0, total: 0, month: '', added: 0, failed: 0 });
    try {
      const { failed } = await sync(username, setProgress);
      if (failed) setError(`${failed} month${failed === 1 ? '' : 's'} couldn't be fetched. Resync to retry.`);
      sfx.success();
    } catch (e) {
      sfx.error();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const frac = progress && progress.total ? progress.done / progress.total : 0;

  return (
    <div className="page center">
      <div className="card import">
        <h1>{profile ? 'Your games' : 'Import your games'}</h1>

        {profile && !busy && (
          <div className="profile-row">
            {profile.avatar ? <img src={profile.avatar} alt="" /> : <div className="avatar-dot big" />}
            <div className="grow">
              <div className="strong">{profile.username}</div>
              <div className="muted">
                {games.length.toLocaleString()} games · synced {ago(profile.lastSync)}
              </div>
            </div>
            <button className="btn" onClick={() => run(profile.username)}>
              Resync
            </button>
          </div>
        )}

        {!profile && !busy && (
          <form
            className="import-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(name);
            }}
          >
            <input autoFocus placeholder="Chess.com username" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn primary" disabled={!name.trim()}>
              Import
            </button>
          </form>
        )}

        {busy && (
          <div className="progress">
            <div className="bar">
              <span style={{ width: `${Math.max(frac * 100, 3)}%` }} />
            </div>
            <div className="muted">
              {progress.total
                ? `${progress.month || 'Fetching'} · ${progress.added.toLocaleString()} games`
                : 'Finding your archives…'}
            </div>
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {profile && !busy && (
          <div className="import-foot">
            <button className="btn primary wide" onClick={() => go('train')}>
              Open Training Ground
            </button>
            <button
              className="link"
              onClick={() => {
                if (confirm('Remove all imported games from this browser?')) void reset();
              }}
            >
              Remove data
            </button>
          </div>
        )}

        {!profile && <p className="muted small">Games are fetched from the public chess.com API and stay in this browser.</p>}
      </div>
    </div>
  );
}
