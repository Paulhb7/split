import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Crest } from "../shared/Crest";
import type { ExpertKind } from "../shared/experts";

// Page 4 — the Cinema: a spotlit miniature atelier driven by a scripted cursor,
// with a beat rail (01 pick · 02 brief · 03 watch · 04 deliver) synced to the
// loop. Pure presentation, no real sessions; it never touches the runner.
// Honours prefers-reduced-motion by painting the finished frame once.

type DemoExpert = { slug: string; label: string; kind: ExpertKind; role: string };
const CAST: DemoExpert[] = [
  { slug: "consultant", label: "Consultant", kind: "researcher", role: "Strategy" },
  { slug: "engineer", label: "Engineer", kind: "builder", role: "Build" },
  { slug: "designer", label: "Designer", kind: "creator", role: "Craft" },
];
const HERO = CAST[0];

const BRIEF = "Draft a go-to-market plan for our new app.";
const REPLY =
  "On it. Three moves: a tight ICP, a launch-week sequence, and a pricing test. Full brief filed in your vault.";
const STEPS = ["Reading the brief", "Mapping the market", "Drafting the plan"];
const BEATS = ["pick", "brief", "watch", "deliver"];

export function Cinema() {
  const stageRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);

  const [cursor, setCursor] = useState({ x: 36, y: 30, down: false });
  const [beat, setBeat] = useState(-1);
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState("");
  const [sent, setSent] = useState(false);
  const [stepN, setStepN] = useState(-1); // -1 none · 0..2 running index · 3 all done
  const [reply, setReply] = useState("");
  const [replyDone, setReplyDone] = useState(false);
  const [delivered, setDelivered] = useState(false);

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Park the cursor near the centre of a target, in stage coordinates. The CSS
  // transition on .fcur's transform animates the glide.
  const aim = (el: HTMLElement | null) => {
    const stage = stageRef.current;
    if (!stage || !el) return;
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setCursor((c) => ({ ...c, x: r.left - s.left + r.width / 2 - 3, y: r.top - s.top + r.height / 2 - 2 }));
  };

  // Reduced-motion: the finished, legible still.
  useLayoutEffect(() => {
    if (!reduced) return;
    setArmed(true);
    setSent(true);
    setStepN(STEPS.length);
    setReply(REPLY);
    setReplyDone(true);
    setDelivered(true);
    setBeat(3);
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

    async function run() {
      while (!cancelled) {
        // reset to the empty stage
        setBeat(-1);
        setArmed(false);
        setTyped("");
        setSent(false);
        setStepN(-1);
        setReply("");
        setReplyDone(false);
        setDelivered(false);
        setCursor({ x: 36, y: 30, down: false });
        await sleep(850);
        if (cancelled) return;

        // BEAT 01 — pick
        setBeat(0);
        aim(chipRef.current);
        await sleep(760);
        if (cancelled) return;
        setCursor((c) => ({ ...c, down: true }));
        await sleep(150);
        setArmed(true);
        setCursor((c) => ({ ...c, down: false }));
        await sleep(620);
        if (cancelled) return;

        // BEAT 02 — brief
        setBeat(1);
        aim(inputRef.current);
        await sleep(680);
        if (cancelled) return;
        for (let i = 1; i <= BRIEF.length; i++) {
          if (cancelled) return;
          setTyped(BRIEF.slice(0, i));
          await sleep(32);
        }
        await sleep(380);
        if (cancelled) return;
        aim(sendRef.current);
        await sleep(560);
        if (cancelled) return;
        setCursor((c) => ({ ...c, down: true }));
        await sleep(160);
        setCursor((c) => ({ ...c, down: false }));
        setTyped("");
        setSent(true);
        await sleep(640);
        if (cancelled) return;

        // BEAT 03 — watch
        setBeat(2);
        for (let s = 0; s < STEPS.length; s++) {
          if (cancelled) return;
          setStepN(s);
          await sleep(740);
        }
        setStepN(STEPS.length);
        await sleep(260);
        if (cancelled) return;
        for (let i = 1; i <= REPLY.length; i++) {
          if (cancelled) return;
          setReply(REPLY.slice(0, i));
          await sleep(15);
        }
        setReplyDone(true);
        await sleep(380);
        if (cancelled) return;

        // BEAT 04 — deliver
        setBeat(3);
        setDelivered(true);
        await sleep(3100);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [reduced]);

  return (
    <>
      <div className="cin-tag"><i />scripted run — hands off</div>

      <div className="cin-stage" ref={stageRef}>
        <div className="cw" aria-hidden="true">
          <div className="cw-bar">
            <span className="cw-light r" />
            <span className="cw-light y" />
            <span className="cw-light g" />
            <span className="cw-title">Split — atelier</span>
          </div>
          <div className="cw-body">
            <div className="cw-rail">
              <div className="cw-cap">Agents</div>
              {CAST.map((e) => {
                const on = armed && e.slug === HERO.slug;
                return (
                  <div key={e.slug} ref={e.slug === HERO.slug ? chipRef : undefined} className={"cw-chip" + (on ? " on" : "")}>
                    <span className="cw-crest"><Crest kind={e.kind} seed={e.slug} size={30} /></span>
                    <span className="cw-id">
                      <span className="cw-nm">{e.label}</span>
                      <span className="cw-rl">{e.role}</span>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="cw-main">
              <div className="cw-thread">
                {!sent && (
                  <div className="cw-empty">
                    {armed ? <><b>{HERO.label}</b> is ready — type a brief below.</> : <>Pick an expert, then brief them →</>}
                  </div>
                )}
                {sent && (
                  <div className="cw-msg me"><div className="cw-bubble me">{BRIEF}</div></div>
                )}
                {sent && stepN >= 0 && (
                  <div className="cw-steps">
                    {STEPS.map((s, i) => {
                      const st = i < stepN ? "done" : i === stepN ? "run" : null;
                      if (!st) return null;
                      return (
                        <div key={s} className={"cw-step " + st}>
                          <span className="st-ic">
                            {st === "done"
                              ? <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              : <i className="st-dot" />}
                          </span>
                          {s}
                        </div>
                      );
                    })}
                  </div>
                )}
                {reply && (
                  <div className="cw-msg ex">
                    <span className="cw-avatar"><Crest kind={HERO.kind} seed={HERO.slug} size={22} /></span>
                    <div className="cw-bubble ex">{reply}{!replyDone && <span className="caret" />}</div>
                  </div>
                )}
                {delivered && (
                  <div className="cw-deliv in">
                    <span className="cw-deliv-ic">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4" /><path d="M9 12.5h6M9 15.5h6" />
                      </svg>
                    </span>
                    <span className="cw-file">
                      <span className="cw-file-nm">gtm-plan.md</span>
                      <span className="cw-file-tag">Strategy brief · kept in vault</span>
                    </span>
                    <span className="cw-open">Open ↗</span>
                  </div>
                )}
              </div>

              <div className="cw-composer">
                <div className="cw-input" ref={inputRef}>
                  {typed
                    ? <span className="typed">{typed}<span className="caret" /></span>
                    : <span className="ph">Brief {HERO.label}…</span>}
                </div>
                <button ref={sendRef} type="button" tabIndex={-1} className="cw-send">Send</button>
              </div>
            </div>
          </div>
        </div>

        {!reduced && (
          <div className={"fcur" + (cursor.down ? " down" : "")} style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}>
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

      <div className="beats" aria-hidden="true">
        {BEATS.map((b, i) => (
          <Fragment key={b}>
            {i > 0 && <span className="sep">·</span>}
            <span className={"beat" + (reduced || beat === i ? " on" : beat > i ? " past" : "")}>
              <span className="bn">0{i + 1}</span>{b}
            </span>
          </Fragment>
        ))}
      </div>
    </>
  );
}
