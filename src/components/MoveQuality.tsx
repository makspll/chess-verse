import { CLASS_INFO, type Judgement } from '../lib/classify';
import { fmtEval } from '../lib/evals';

/** Compact verdict on the move just made: label, eval swing and the engine's alternative. */
export function MoveQuality({ j, san }: { j: Judgement; san: string }) {
  const info = CLASS_INFO[j.cls];
  return (
    <div className="mq" style={{ ['--mq' as string]: info.color }}>
      <span className="mq-glyph">{info.glyph}</span>
      <div className="mq-text">
        <div>
          <b>{san}</b> · {info.label}
        </div>
        <div className="muted small">
          {fmtEval(j.before.cp)} → {fmtEval(j.after.cp)}
          {j.bestSan && j.cls !== 'engine' && <> · engine prefers {j.bestSan}</>}
        </div>
      </div>
    </div>
  );
}
