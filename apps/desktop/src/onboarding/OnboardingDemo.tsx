import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Crest } from "../shared/Crest";
import type { ExpertKind } from "../shared/experts";

// A scripted, looping walkthrough of the core Split loop — a fictitious cursor
// drives a miniature atelier so a first-launch user *sees* how it works before
// they configure anything: pick an expert → brief them → watch them think →
// a deliverable lands. Pure presentation, no real sessions; it never touches
// the runner. Honours prefers-reduced-motion by rendering the finished frame.

type DemoExpert = { slug: string; label: string; kind: ExpertKind; role: string };
const CAST: DemoExpert[] = [
  { slug: "consultant", label: "Consultant", kind: "advisor", role: "Strategy" },
  { slug: "engineer", label: "Engineer", kind: "builder", role: "Build" },
  { slug: "designer", label: "Designer", kind: "creator", role: "Craft" },
];
const HERO = CAST[0];

const BRIEF = "Draft a go-to-market plan for our new app.";
const REPLY =
  "On it. Three moves: a tight ICP, a launch-week sequence, and a pricing test. Full brief filed in your vault.";
const STEPS = ["Reading the brief", "Mapping the market", "Drafting the plan"];
const DELIVERABLE = { name: "gtm-plan.md", tag: "Strategy brief" };

// One scripted beat. The loop awaits each beat's duration; React state drives
// the DOM and the cursor's CSS transition animates the moves between targets.
type Phase =
  | "idle"
  | "arm"
  | "toInput"
  | "typing"
  | "toSend"
  | "sent"
  | "thinking"
  | "replying"
  | "deliver"
  | "hold";

export function OnboardingDemo() {
  const stageRef = useRef<HTMLDivElement>(null);
  const expertRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);

  const [cursor, setCursor] = useState({ x: 38, y: 32, down: false });
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState("");
  const [sent, setSent] = useState(false);
  const [stepN, setStepN] = useState(-1); // index of the in-flight step (-1 = none)
  const [reply, setReply] = useState("");
  const [delivered, setDelivered] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Park the cursor over the centre of a target element, in stage coordinates.
  const aimAt = (el: HTMLElement | null, down = false) => {
    const stage = stageRef.current;
    if (!stage || !el) return;
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setCursor({ x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, down });
  };

  // Reduced-motion: paint the finished frame once and stop.
  useLayoutEffect(() => {
    if (!reduced) return;
    setArmed(true);
    setTyped(BRIEF);
    setSent(true);
    setStepN(STEPS.length);
    setReply(REPLY);
    setDelivered(true);
    setPhase("hold");
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const sleep = (ms: number) =>
      new Promise<void>((res) => setTimeout(res, ms));

    async function run() {
      while (!cancelled) {
        // reset to the empty stage
        setArmed(false);
        setTyped("");
        setSent(false);
        setStepN(-1);
        setReply("");
        setDelivered(false);
        setPhase("idle");
        setCursor({ x: 38, y: 32, down: false });
        await sleep(900);
        if (cancelled) return;

        // 1 — pick the expert
        setPhase("arm");
        aimAt(expertRef.current);
        await sleep(820);
        if (cancelled) return;
        setCursor((c) => ({ ...c, down: true }));
        await sleep(150);
        setArmed(true);
        setCursor((c) => ({ ...c, down: false }));
        await sleep(620);
        if (cancelled) return;

        // 2 — move to the composer & type the brief
        setPhase("toInput");
        aimAt(inputRef.current);
        await sleep(720);
        if (cancelled) return;
        setPhase("typing");
        for (let i = 1; i <= BRIEF.length; i++) {
          if (cancelled) return;
          setTyped(BRIEF.slice(0, i));
          await sleep(34);
        }
        await sleep(420);
        if (cancelled) return;

        // 3 — send
        setPhase("toSend");
        aimAt(sendRef.current);
        await sleep(560);
        if (cancelled) return;
        setCursor((c) => ({ ...c, down: true }));
        await sleep(160);
        setCursor((c) => ({ ...c, down: false }));
        setPhase("sent");
        setSent(true);
        setTyped("");
        await sleep(700);
        if (cancelled) return;

        // 4 — the expert thinks (steps tick over)
        setPhase("thinking");
        for (let i = 0; i < STEPS.length; i++) {
          if (cancelled) return;
          setStepN(i);
          await sleep(720);
        }
        setStepN(STEPS.length);
        await sleep(280);
        if (cancelled) return;

        // 5 — stream the reply
        setPhase("replying");
        for (let i = 1; i <= REPLY.length; i++) {
          if (cancelled) return;
          setReply(REPLY.slice(0, i));
          await sleep(16);
        }
        await sleep(420);
        if (cancelled) return;

        // 6 — the deliverable lands
        setPhase("deliver");
        setDelivered(true);
        setPhase("hold");
        await sleep(3200);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [reduced]);

  const thinking = phase === "thinking";

  return (
    <div className="obd-stage" ref={stageRef} aria-hidden="true">
      {/* faux window chrome */}
      <div className="obd-bar">
        <span className="obd-light r" />
        <span className="obd-light y" />
        <span className="obd-light g" />
        <span className="obd-bar-title">Split — atelier</span>
      </div>

      <div className="obd-body">
        {/* left rail: the hired team */}
        <div className="obd-rail">
          <div className="obd-rail-cap">Agents</div>
          {CAST.map((e) => {
            const on = armed && e.slug === HERO.slug;
            return (
              <button
                key={e.slug}
                ref={e.slug === HERO.slug ? expertRef : undefined}
                type="button"
                tabIndex={-1}
                className={"obd-chip" + (on ? " on" : "")}
              >
                <span className="obd-chip-crest">
                  <Crest kind={e.kind} seed={e.slug} size={34} />
                </span>
                <span className="obd-chip-id">
                  <span className="obd-chip-nm">{e.label}</span>
                  <span className="obd-chip-rl">{e.role}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* main: the thread + composer */}
        <div className="obd-main">
          <div className="obd-thread">
            {!sent && !armed && (
              <div className="obd-empty">Pick an expert, then brief them →</div>
            )}
            {!sent && armed && (
              <div className="obd-empty on">
                <b>{HERO.label}</b> is ready — type a brief below.
              </div>
            )}

            {sent && (
              <div className="obd-msg me">
                <div className="obd-bubble me">{BRIEF}</div>
              </div>
            )}

            {sent && (thinking || stepN >= 0) && (
              <div className="obd-steps">
                {STEPS.map((s, i) => {
                  const state = i < stepN ? "done" : i === stepN ? "run" : "wait";
                  if (state === "wait") return null;
                  return (
                    <div key={s} className={"obd-step " + state}>
                      <span className="obd-step-dot" />
                      {s}
                    </div>
                  );
                })}
              </div>
            )}

            {reply && (
              <div className="obd-msg ex">
                <span className="obd-avatar">
                  <Crest kind={HERO.kind} seed={HERO.slug} size={26} />
                </span>
                <div className="obd-bubble ex">
                  {reply}
                  {phase === "replying" && <span className="obd-caret" />}
                </div>
              </div>
            )}

            {delivered && (
              <div className="obd-deliverable">
                <span className="obd-file-ic">📄</span>
                <span className="obd-file-meta">
                  <span className="obd-file-nm">{DELIVERABLE.name}</span>
                  <span className="obd-file-tag">{DELIVERABLE.tag} · kept in vault</span>
                </span>
                <span className="obd-file-open">Open ↗</span>
              </div>
            )}
          </div>

          <div className="obd-composer">
            <div className="obd-input" ref={inputRef}>
              {typed ? (
                <span className="obd-input-txt">
                  {typed}
                  {phase === "typing" && <span className="obd-caret" />}
                </span>
              ) : (
                <span className="obd-input-ph">Brief {HERO.label}…</span>
              )}
            </div>
            <button ref={sendRef} type="button" tabIndex={-1} className="obd-send">
              Send
            </button>
          </div>
        </div>
      </div>

      {/* the fictitious cursor */}
      {!reduced && (
        <div
          className={"obd-cursor" + (cursor.down ? " down" : "")}
          style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M5 3 L5 19 L9.2 15 L12 21.5 L14.6 20.3 L11.9 14 L17.5 14 Z"
              fill="#fff"
              stroke="rgba(0,0,0,0.55)"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
