// The waiting line shown while a turn is in flight — Split's take on the
// terminal-spinner pattern: a chess piece climbing pawn→queen, a persona verb
// swept by a glimmer, and an elapsed-time + token odometer. One leaf component
// owns the animation clock so Conversation stays out of the hot loop; it
// mounts at `status:running` and unmounts at idle, which is what scopes the
// per-turn verb pick and the timer.
import { useEffect, useRef, useState } from "react";
import type { ExpertKind } from "./experts";

// Pawn climbs to queen and back — ping-pong, one step per 170ms.
const PIECES = ["♟", "♞", "♝", "♜", "♛"];
const FRAMES = [...PIECES, ...[...PIECES].reverse()];
const GLYPH_MS = 170;

// Persona verbs by expert kind. Picked once per turn; the live `summary`
// overrides them whenever a tool step is running ("→ ddg-search").
const VERBS: Record<ExpertKind | "default", string[]> = {
  researcher: ["Triangulating", "Cross-checking", "Surveying", "Synthesizing", "Mapping", "Digging"],
  advisor: ["Weighing", "Deliberating", "Reviewing", "Caveating", "Counseling"],
  analyst: ["Crunching", "Charting", "Slicing", "Modeling", "Reconciling"],
  builder: ["Scaffolding", "Wiring", "Forging", "Assembling", "Shipping"],
  finder: ["Scouting", "Sleuthing", "Sifting", "Trailing"],
  operator: ["Orchestrating", "Buttling", "Arranging", "Tending", "Dispatching"],
  organizer: ["Sorting", "Filing", "Tidying", "Scheduling"],
  creator: ["Sketching", "Composing", "Drafting", "Sculpting", "Dreaming"],
  recruiter: ["Headhunting", "Screening", "Shortlisting", "Vetting"],
  coach: ["Pacing", "Drilling", "Spotting", "Cheering"],
  default: ["Working", "Considering", "Shaping", "Brewing"],
};

const pickVerb = (kind?: ExpertKind): string => {
  const list = (kind && VERBS[kind]) || VERBS.default;
  return list[Math.floor(Math.random() * list.length)];
};

const SHOW_TOKENS_AFTER_MS = 10_000;

const fmtDur = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};
const fmtTok = (n: number): string => (n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`);

interface Props {
  kind?: ExpertKind;
  /** Live one-line status from the reducer — "→ tool · status" overrides the verb. */
  summary: string;
  /** Chars streamed so far this turn (answer + thoughts) — tokens ≈ chars/4. */
  streamedChars: number;
  /** COT chars streamed so far — growth means the expert is reasoning. */
  thoughtChars: number;
  /**
   * Epoch ms of the turn's start (Session.turnStartedAt). Anchors the elapsed
   * clock to the SESSION, not this component's mount — navigating home and
   * back remounts the spinner mid-turn, and without this the counter restarts
   * at 0s. null (session hydrated mid-turn) → fall back to mount time.
   */
  startedAt: number | null;
}

export function TurnSpinner({ kind, summary, streamedChars, thoughtChars, startedAt }: Props) {
  // One pick per mount = one verb per turn (the block is conditionally
  // rendered on status === "running").
  const [verb] = useState(() => pickVerb(kind));
  const mountStart = useRef(Date.now());
  const turnStart = startedAt ?? mountStart.current;

  // The 50ms clock. Everything below derives from `now`; the odometer keeps
  // its rolling value in a ref so re-renders don't reset the catch-up.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(id);
  }, []);

  // Token odometer: roll toward the live estimate instead of jumping.
  const target = Math.round(streamedChars / 4);
  const shown = useRef(0);
  const lastStep = useRef(now);
  {
    const steps = Math.floor((now - lastStep.current) / 50);
    if (steps > 0) {
      lastStep.current += steps * 50;
      for (let i = 0; i < steps && shown.current < target; i++) {
        const gap = target - shown.current;
        shown.current += gap < 70 ? 1 : gap < 200 ? Math.max(2, Math.ceil(gap * 0.15)) : 50;
      }
      if (shown.current > target) shown.current = target;
    }
  }

  const elapsed = Math.max(0, now - turnStart);
  const glyph = FRAMES[Math.floor(elapsed / GLYPH_MS) % FRAMES.length];

  // A tool step takes over the line; otherwise the persona verb runs.
  const toolStep = summary.startsWith("→");
  const message = toolStep
    ? summary.replace(/ · $/, "").slice(0, 48)
    : `${verb}…`;

  // Glimmer: a bright spot sweeping right-to-left across the message.
  // Fractional position (no floor) + a smooth per-char falloff, so the
  // highlight glides instead of stepping; the CSS color transition blends
  // between 50ms ticks.
  const cycle = message.length + 20;
  const spot = message.length + 10 - ((elapsed / 200) % cycle);

  const showTokens = shown.current > 0 && elapsed > SHOW_TOKENS_AFTER_MS;

  // "thinking" status: growth of `thoughtChars` opens a thinking window;
  // 1s without growth closes it. The pulse shows ≥2s (no flicker on short
  // bursts), then "thought for Ns" holds 2s before clearing. A later burst
  // starts a fresh window.
  const think = useRef({ start: 0, lastGrowth: 0, lastChars: 0, doneShownAt: 0 });
  {
    const th = think.current;
    if (thoughtChars > th.lastChars) {
      th.lastChars = thoughtChars;
      th.lastGrowth = now;
      th.doneShownAt = 0;
      if (th.start === 0) th.start = now;
    }
  }
  let thinkText: string | null = null;
  let thinkPulse = false;
  {
    const th = think.current;
    if (th.start > 0) {
      if (now - th.lastGrowth < 1000 || now - th.start < 2000) {
        thinkText = "thinking";
        thinkPulse = true;
      } else {
        if (th.doneShownAt === 0) th.doneShownAt = now;
        if (now - th.doneShownAt < 2000) {
          thinkText = `thought for ${Math.max(1, Math.round((th.lastGrowth - th.start) / 1000))}s`;
        } else {
          think.current = { start: 0, lastGrowth: 0, lastChars: th.lastChars, doneShownAt: 0 };
        }
      }
    }
  }

  return (
    <div className="thinking spin">
      <span className="spin-glyph">{glyph}</span>
      <span className="spin-verb">
        {[...message].map((ch, i) => {
          // 0..1 brightness, fading out over ~2.5 chars around the spot.
          const k = Math.max(0, 1 - Math.abs(i - spot) / 2.5);
          return (
            <span
              key={i}
              style={k > 0 ? { color: `color-mix(in srgb, var(--brand) ${Math.round(100 - 72 * k)}%, #fff)` } : undefined}
            >
              {ch}
            </span>
          );
        })}
      </span>
      <span className="spin-meta">
        ({fmtDur(elapsed)}
        {showTokens && ` · ↓ ${fmtTok(shown.current)} tokens`}
        {thinkText && (
          <>
            {" · "}
            <span className={thinkPulse ? "spin-think" : undefined}>{thinkText}</span>
          </>
        )}
        )
      </span>
    </div>
  );
}
