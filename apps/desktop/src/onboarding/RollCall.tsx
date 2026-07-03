import { useLayoutEffect, useRef, useState } from "react";
import { isActiveExpert, type ExpertMap } from "../shared/experts";
import { vars } from "../shared/ui";

// Page 0 — the Roll Call: the roster streams upward in two mono columns behind
// the welcome copy, like end credits at a première. Built from the live expert
// registry so the names (and the header count) never drift from the roster.
// Decorative only (aria-hidden); hovering a column pauses its stream.

const pad2 = (n: number) => String(n + 1).padStart(2, "0");

// Rows that periodically "catch the light" (a brand flash every 14s), offset
// per row — the cadence the design board uses (final-flow.html, p0).
const HL_LEFT: Record<number, string> = { 2: "2s", 6: "7s", 10: "11s" };
const HL_RIGHT: Record<number, string> = { 1: "3s", 5: "8s", 10: "12s" };

type Row = { label: string; kind: string };

function Stream({ names, start, right, dur, hl }: {
  names: Row[];
  start: number;
  right?: boolean;
  dur: string;
  hl: Record<number, string>;
}) {
  const ulRef = useRef<HTMLUListElement>(null);
  // The stream keyframe translates to -50%, so the loop is seamless only when
  // it holds an EVEN number of copies spanning ≥ ~2.2× the viewport height.
  // Re-measured on resize: onboarding mounts in the small boot window and only
  // then goes fullscreen, and the right column starts hidden (≤900px media).
  const [copies, setCopies] = useState(2);
  useLayoutEffect(() => {
    const el = ulRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.offsetHeight;
      if (!h) return;
      let need = Math.ceil((window.innerHeight * 2.2) / h);
      if (need % 2) need++;
      setCopies(Math.max(2, need));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [names.length]);

  const rows = names.map((e, i) => {
    const ix = <span className="ix">{pad2(start + i)}</span>;
    const kd = <span className="kd">{e.kind}</span>;
    return (
      <li key={i} className={hl[i] ? "hl" : undefined} style={hl[i] ? vars({ "--hd": hl[i] }) : undefined}>
        {right ? <>{kd}{e.label}{ix}</> : <>{ix}{e.label}{kd}</>}
      </li>
    );
  });

  return (
    <div className={"roll " + (right ? "right" : "left")} style={vars({ "--t": dur })} aria-hidden="true">
      <div className="stream">
        {Array.from({ length: copies }, (_, c) => (
          <ul key={c} ref={c === 0 ? ulRef : undefined}>{rows}</ul>
        ))}
      </div>
    </div>
  );
}

export function RollCall({ experts }: { experts: ExpertMap }) {
  const slugs = Object.keys(experts).filter((s) => isActiveExpert(experts, s));
  const row = (s: string): Row => ({ label: experts[s].label, kind: experts[s].kind });
  const left = slugs.filter((s) => (experts[s].category ?? "super") !== "genius").map(row);
  const right = slugs.filter((s) => (experts[s].category ?? "super") === "genius").map(row);
  return (
    <>
      <Stream names={left} start={0} dur="96s" hl={HL_LEFT} />
      <Stream names={right} start={left.length} right dur="74s" hl={HL_RIGHT} />
    </>
  );
}
