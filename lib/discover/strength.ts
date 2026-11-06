// A theme's strength (Default, milestone 6 brief): the share of its source it rests on. Conversations for
// interview and input themes, distinct people who wrote or agreed for Four Helpful Lists themes, respondents
// for survey findings. Strong at 40 percent or more and not thin. Worked out in code from the counts.
import { thin, type Counts } from "./thin";

export const STRONG_SHARE = 0.4;

export type Strength = { share: number | null; percent: number | null; strong: boolean; thin: boolean; thinReason: string };

export function strength(counts: Counts): Strength {
  const t = thin(counts);
  const n = Math.max(0, counts.restsOn || 0);
  const share = counts.outOf && counts.outOf > 0 ? Math.min(1, n / counts.outOf) : null;
  return {
    share,
    percent: share === null ? null : Math.round(share * 100),
    strong: !t.thin && share !== null && share >= STRONG_SHARE,
    thin: t.thin,
    thinReason: t.reason,
  };
}
