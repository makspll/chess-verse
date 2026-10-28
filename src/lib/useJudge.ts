import { useEffect, useMemo } from 'react';
import { fenAfter } from './chessutil';
import { judge, type Judgement } from './classify';
import { cancelEvals, requestEvals, useEvalVersion } from './evals';

/**
 * Verdict on the move `uci` played from `beforeFen`. Once those two positions are queued,
 * `extra` positions follow so the next move you step to is usually classified already.
 */
export function useJudge(beforeFen: string | null, uci: string | null, enabled: boolean, extra: string[]): Judgement | null {
  useEvalVersion();
  const afterFen = useMemo(() => (beforeFen && uci ? fenAfter(beforeFen, uci) : null), [beforeFen, uci]);
  const extraKey = extra.join('|');

  useEffect(() => {
    if (!enabled || !beforeFen || !afterFen) return;
    requestEvals([beforeFen, afterFen, ...extra]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, beforeFen, afterFen, extraKey]);

  useEffect(() => cancelEvals, []);

  return enabled && beforeFen && uci ? judge(beforeFen, uci) : null;
}
