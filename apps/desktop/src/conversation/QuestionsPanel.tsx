import { useEffect, useMemo, useRef, useState } from "react";
import type { FormQuestion, QuestionForm } from "../shared/questionForm";

// The atelier right-pane surface for an expert's clarifying questions. The
// reducer lifts a `<question-form>` block off the streamed answer onto
// `Session.questionForm`; this renders it as skimmable chips + a free field,
// with a non-blocking auto-continue countdown so it never stalls the work.
// Continue / Skip all / the countdown all land on one `submit` chokepoint.

// Once the form is fully delivered, the boss has this long before we
// auto-continue — submitting whatever's picked (untouched = skipped).
const COUNTDOWN_SECONDS = 120;

type Answers = Record<string, string | string[]>;
export type SubmitSource = "continue" | "skip" | "countdown";

interface Props {
  form: QuestionForm;
  // The form is still streaming in (turn running) — pause the timer and hold
  // Continue until the expert finishes writing it.
  busy: boolean;
  onSubmit: (answers: Answers, source: SubmitSource) => void;
}

export function QuestionsPanel({ form, busy, onSubmit }: Props) {
  const [answers, setAnswers] = useState<Answers>({});
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);
  const firedRef = useRef(false);

  // Reset everything when a different form takes the stage.
  useEffect(() => {
    setAnswers({});
    setRemaining(COUNTDOWN_SECONDS);
    firedRef.current = false;
  }, [form.id]);

  // Countdown ticks only once the form is fully delivered (not mid-stream).
  useEffect(() => {
    if (busy) return;
    const t = window.setInterval(() => setRemaining((r) => (r <= 0 ? 0 : r - 1)), 1000);
    return () => window.clearInterval(t);
  }, [busy]);

  const canContinue = useMemo(() => requiredSatisfied(form, answers), [form, answers]);

  function submit(source: SubmitSource) {
    if (firedRef.current && source !== "countdown") return;
    firedRef.current = true;
    onSubmit(source === "skip" ? {} : answers, source);
  }

  // Auto-continue when the countdown elapses: honour picks if the required
  // fields are in, else skip — so a stray cap can't stall generation.
  useEffect(() => {
    if (!busy && remaining <= 0 && !firedRef.current) {
      firedRef.current = true;
      onSubmit(canContinue ? answers : {}, "countdown");
    }
  }, [busy, remaining, canContinue, answers, onSubmit]);

  function pick(q: FormQuestion, value: string) {
    setAnswers((a) => {
      if (q.type === "checkbox") {
        const cur = new Set((a[q.id] as string[]) ?? []);
        if (cur.has(value)) cur.delete(value);
        else if (!q.maxSelections || cur.size < q.maxSelections) cur.add(value);
        return { ...a, [q.id]: [...cur] };
      }
      return { ...a, [q.id]: a[q.id] === value ? "" : value }; // radio/select/cards toggle-off
    });
  }

  const isSel = (q: FormQuestion, value: string) => {
    const v = answers[q.id];
    return Array.isArray(v) ? v.includes(value) : v === value;
  };
  const isLocked = (q: FormQuestion, value: string) =>
    q.type === "checkbox" &&
    !!q.maxSelections &&
    ((answers[q.id] as string[]) ?? []).length >= q.maxSelections &&
    !isSel(q, value);

  const countdown = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  return (
    <div className="qf-card">
      <div className="qf-head">
        <div className="qf-mark" aria-hidden="true">?</div>
        <div>
          <h2>{form.title}</h2>
          {form.description && <p>{form.description}</p>}
        </div>
      </div>

      <div className="qf-body">
        {form.questions.map((q) => (
          <div key={q.id} className="qf-q">
            <div className="qf-label">
              {q.label}
              {q.required && <span className="qf-req">*</span>}
              {q.type === "checkbox" && q.maxSelections ? <span className="qf-hint">{q.maxSelections} max</span> : null}
            </div>
            {q.help && <div className="qf-help">{q.help}</div>}
            {renderControl(q, isSel, isLocked, pick, setAnswers, answers)}
          </div>
        ))}
        {form.questions.length === 0 && <div className="qf-skeleton">…</div>}
      </div>

      <div className="qf-foot">
        <span className="qf-auto"><span className="qf-pulse" />Se valide tout seul à la fin du minuteur</span>
        <span className="qf-spacer" />
        <button className="qf-skip" onClick={() => submit("skip")} disabled={busy}>
          Tout passer
          {!busy && <span className={"qf-timer" + (remaining <= 20 ? " warn" : "")}>{countdown}</span>}
        </button>
        <button className="qf-cont" onClick={() => submit("continue")} disabled={busy || !canContinue}>
          {form.submitLabel || "Continuer"}
        </button>
      </div>
    </div>
  );
}

function renderControl(
  q: FormQuestion,
  isSel: (q: FormQuestion, v: string) => boolean,
  isLocked: (q: FormQuestion, v: string) => boolean,
  pick: (q: FormQuestion, v: string) => void,
  setAnswers: React.Dispatch<React.SetStateAction<Answers>>,
  answers: Answers,
) {
  if (q.type === "textarea" || q.type === "text") {
    const common = {
      value: (answers[q.id] as string) ?? "",
      placeholder: q.placeholder ?? "",
      onChange: (e: { target: { value: string } }) => setAnswers((a) => ({ ...a, [q.id]: e.target.value })),
    };
    return q.type === "textarea" ? (
      <textarea className="qf-textarea" {...common} />
    ) : (
      <input className="qf-input" type="text" {...common} />
    );
  }

  if (q.type === "direction-cards" && q.cards?.length) {
    return (
      <div className="qf-dcards">
        {q.cards.map((c) => (
          <button
            key={c.id}
            type="button"
            className={"qf-dcard" + (isSel(q, c.id) ? " sel" : "")}
            onClick={() => pick(q, c.id)}
          >
            <div className="qf-dh">{c.label}</div>
            {c.mood && <div className="qf-dm">{c.mood}</div>}
            {c.palette.length > 0 && (
              <div className="qf-sw">
                {c.palette.map((p, i) => (
                  <i key={i} style={{ background: p }} />
                ))}
              </div>
            )}
            <div className="qf-type">
              <span className="qf-aa" style={{ fontFamily: c.displayFont }}>Aa</span>
              <span className="qf-lo" style={{ fontFamily: c.bodyFont }}>{shortFont(c.bodyFont)}</span>
            </div>
            {c.references.length > 0 && <div className="qf-refs">{c.references.join(" · ")}</div>}
          </button>
        ))}
      </div>
    );
  }

  // radio / select / checkbox → chips
  const options = q.options ?? [];
  return (
    <div className="qf-chips">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={"qf-chip" + (isSel(q, o.value) ? " sel" : "") + (isLocked(q, o.value) ? " lock" : "")}
          onClick={() => !isLocked(q, o.value) && pick(q, o.value)}
          title={o.description ?? ""}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function requiredSatisfied(form: QuestionForm, answers: Answers): boolean {
  return form.questions.every((q) => {
    if (!q.required) return true;
    const v = answers[q.id];
    return Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0;
  });
}

// Trim a CSS font stack to its first family for the card's "body" label.
function shortFont(stack: string): string {
  return (stack.split(",")[0] ?? "").replace(/['"]/g, "").trim() || "corps";
}
