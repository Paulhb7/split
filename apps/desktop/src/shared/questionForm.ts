// Parser for inline `<question-form>…</question-form>` blocks an expert emits
// to ask the boss a structured set of clarifying questions before building.
// The block is plain assistant text (not a tool call), so it works on every
// ACP harness with nothing native: the reducer detects it in the streamed
// `say` text, lifts the parsed form onto `Session.questionForm` (rendered in
// the atelier's right pane), and strips the markup from the visible thread.
//
// Body is JSON. Example the expert emits:
//
//   <question-form id="discovery" title="Brief express — 30 secondes">
//   {
//     "description": "Je verrouille ça puis je construis. Laisse vide ce qui ne s'applique pas.",
//     "questions": [
//       { "id": "angle", "label": "Quel angle ?", "type": "radio",
//         "options": ["Panorama", "Investissement", "Pédagogique"], "required": true },
//       { "id": "points", "label": "Points à couvrir", "type": "textarea" }
//     ]
//   }
//   </question-form>
//
// `<ask-question>` is accepted as an alias (models drift to it).

export type QuestionType = "radio" | "checkbox" | "select" | "text" | "textarea" | "direction-cards";

// Rich card for a `direction-cards` option — a swatch row + a type sample + a
// mood blurb so the boss scans visual directions instead of squinting at radio
// labels. Emitted inline in the form JSON; mapped to `options` by `id`.
export interface DirectionCard {
  id: string; // the radio value — must match a label/value in `options`
  label: string;
  mood: string;
  references: string[];
  palette: string[]; // hex / oklch swatch strings
  displayFont: string; // headline stack, rendered as the live "Aa" sample
  bodyFont: string;
}

export interface FormOption {
  label: string;
  value: string;
  description?: string;
}

export interface FormQuestion {
  id: string;
  label: string;
  type: QuestionType;
  options?: FormOption[];
  placeholder?: string;
  required?: boolean;
  help?: string;
  maxSelections?: number; // checkbox only — caps selected options
  cards?: DirectionCard[]; // direction-cards only
}

export interface QuestionForm {
  id: string;
  title: string;
  description?: string;
  questions: FormQuestion[];
  submitLabel?: string;
}

// `question-form` is canonical; `ask-question` an alias. Capture the name so
// the close tag matches; case-insensitive so `<Question-Form>` still parses.
const OPEN_RE = /<(question-form|ask-question)\b([^>]*)>/i;

// Locate `closeTag` at/after `from`, in the original `text` coordinate space.
// Char-by-char + per-slice lowercasing keeps the index aligned (a whole-string
// toLowerCase can shift offsets — some code points expand under it).
function findCloseTag(text: string, from: number, closeTag: string): number {
  const lower = closeTag.toLowerCase();
  const len = closeTag.length;
  for (let i = from; i <= text.length - len; i++) {
    if (text.slice(i, i + len).toLowerCase() === lower) return i;
  }
  return -1;
}

function parseAttrs(raw: string): Record<string, string> {
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) out[m[1] as string] = (m[2] ?? m[3] ?? "");
  return out;
}

function normalizeType(raw: unknown): QuestionType {
  const t = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  if (t === "radio" || t === "single" || t === "choice") return "radio";
  if (t === "checkbox" || t === "multi" || t === "multiple") return "checkbox";
  if (t === "select" || t === "dropdown") return "select";
  if (t === "textarea" || t === "long" || t === "paragraph") return "textarea";
  if (t === "direction-cards" || t === "directions" || t === "cards" || t === "direction") return "direction-cards";
  return "text";
}

function parseOption(raw: unknown): FormOption | null {
  if (typeof raw === "string") {
    const label = raw.trim();
    return label ? { label, value: label } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = typeof o.label === "string" ? o.label.trim() : "";
  if (!label) return null;
  const value = typeof o.value === "string" && o.value.trim() ? o.value.trim() : label;
  const description = typeof o.description === "string" && o.description.trim() ? o.description.trim() : undefined;
  return { label, value, ...(description ? { description } : {}) };
}

function parseOptions(raw: unknown): FormOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.map(parseOption).filter((o): o is FormOption => o !== null);
  return out.length ? out : undefined;
}

function parseDirectionCards(raw: unknown): DirectionCard[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: DirectionCard[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const c = e as Record<string, unknown>;
    const id = typeof c.id === "string" && c.id.trim() ? c.id.trim() : null;
    const label = typeof c.label === "string" ? c.label : null;
    if (id === null || label === null) continue;
    out.push({
      id,
      label,
      mood: typeof c.mood === "string" ? c.mood : "",
      references: Array.isArray(c.references) ? c.references.filter((r): r is string => typeof r === "string").slice(0, 6) : [],
      palette: Array.isArray(c.palette) ? c.palette.filter((p): p is string => typeof p === "string").slice(0, 8) : [],
      displayFont: typeof c.displayFont === "string" ? c.displayFont : "Georgia, serif",
      bodyFont: typeof c.bodyFont === "string" ? c.bodyFont : "system-ui, sans-serif",
    });
  }
  return out.length ? out : undefined;
}

function mapRawQuestion(raw: unknown, index: number): FormQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Record<string, unknown>;
  const id = typeof q.id === "string" && q.id.trim() ? q.id.trim() : `q${index + 1}`;
  const label = typeof q.label === "string" ? q.label : id;
  const type = normalizeType(q.type);
  const options = parseOptions(q.options);
  const placeholder = typeof q.placeholder === "string" ? q.placeholder : undefined;
  const help = typeof q.help === "string" ? q.help : undefined;
  const required = q.required === true;
  const cards = parseDirectionCards(q.cards);
  const maxSelections =
    typeof q.maxSelections === "number" && Number.isInteger(q.maxSelections) && q.maxSelections > 0
      ? q.maxSelections
      : undefined;
  return {
    id,
    label,
    type,
    ...(options ? { options } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(help ? { help } : {}),
    ...(required ? { required } : {}),
    ...(maxSelections !== undefined && type === "checkbox" ? { maxSelections } : {}),
    ...(cards ? { cards } : {}),
  };
}

// Shape a parsed top-level object into a QuestionForm. Shared by the final and
// partial parsers. Returns null if there isn't at least one usable question.
function shapeForm(data: unknown, attrs: Record<string, string>, allowEmpty: boolean): QuestionForm | null {
  if (!data || typeof data !== "object") return allowEmpty ? framedEmpty(attrs) : null;
  const obj = data as Record<string, unknown>;
  const rawQs = Array.isArray(obj.questions) ? obj.questions : [];
  const questions: FormQuestion[] = [];
  rawQs.forEach((q, i) => {
    const mapped = mapRawQuestion(q, i);
    if (mapped) questions.push(mapped);
  });
  if (!questions.length && !allowEmpty) return null;
  const id = attrs.id ?? (typeof obj.id === "string" ? obj.id : "discovery");
  const title = attrs.title ?? (typeof obj.title === "string" ? obj.title : "Quelques questions");
  const description = typeof obj.description === "string" ? obj.description : undefined;
  const submitLabel = typeof obj.submitLabel === "string" ? obj.submitLabel : undefined;
  return { id, title, questions, ...(description ? { description } : {}), ...(submitLabel ? { submitLabel } : {}) };
}

function framedEmpty(attrs: Record<string, string>): QuestionForm {
  return { id: attrs.id ?? "discovery", title: attrs.title ?? "Quelques questions", questions: [] };
}

function stripFences(body: string): string {
  return body
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

// Return the substring for the balanced `{…}` starting at `start`, or null if
// it never closes. String-aware so braces inside strings don't count.
function extractBalancedObject(s: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

// Final parse: the form's `<question-form>…</question-form>` must be closed and
// its body valid JSON. Returns the first parseable form in `input`, or null.
export function parseQuestionForm(input: string): QuestionForm | null {
  let cursor = 0;
  while (cursor < input.length) {
    const m = OPEN_RE.exec(input.slice(cursor));
    if (!m) return null;
    const tag = (m[1] ?? "question-form").toLowerCase();
    const openEnd = cursor + m.index + m[0].length;
    const closeIdx = findCloseTag(input, openEnd, `</${tag}>`);
    if (closeIdx === -1) return null;
    let data: unknown;
    try {
      data = JSON.parse(stripFences(input.slice(openEnd, closeIdx)));
    } catch {
      data = null;
    }
    const form = shapeForm(data, parseAttrs(m[2] ?? ""), false);
    if (form) return form;
    cursor = closeIdx + tag.length + 3;
  }
  return null;
}

// Streaming parse: tolerant of an unterminated / still-arriving body. Reads the
// title/id from the open tag's attrs (available the instant the tag streams in)
// and surfaces however many *complete* question objects have arrived, so the
// Questions panel renders a frame immediately and fills in progressively
// instead of flashing a skeleton then a finished table. Null only when no open
// tag is present yet.
export function parsePartialQuestionForm(input: string): QuestionForm | null {
  const m = OPEN_RE.exec(input);
  if (!m) return null;
  const tag = (m[1] ?? "question-form").toLowerCase();
  const attrs = parseAttrs(m[2] ?? "");
  const openEnd = m.index + m[0].length;
  const closeIdx = findCloseTag(input, openEnd, `</${tag}>`);
  const body = stripFences(closeIdx === -1 ? input.slice(openEnd) : input.slice(openEnd, closeIdx));

  // Whole body already valid → full shape (covers "JSON done, close tag not
  // here yet" and the just-closed case).
  try {
    const data = JSON.parse(body);
    return shapeForm(data, attrs, true);
  } catch {
    /* fall through to incremental extraction */
  }

  // Incremental: pull each closed `{…}` object out of the `"questions": [ … ]`
  // region; skip the trailing in-flight one.
  const arr = /"questions"\s*:\s*\[/.exec(body);
  const rawQuestions: unknown[] = [];
  if (arr) {
    let i = arr.index + arr[0].length;
    while (i < body.length) {
      while (i < body.length && /[\s,]/.test(body[i] as string)) i++;
      if (i >= body.length || body[i] === "]") break;
      if (body[i] !== "{") break;
      const obj = extractBalancedObject(body, i);
      if (!obj) break; // trailing object hasn't closed yet
      try {
        rawQuestions.push(JSON.parse(obj));
      } catch {
        /* skip a malformed complete object */
      }
      i += obj.length;
    }
  }
  const descM = /"description"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(body);
  const description = descM ? safeJsonString(descM[1] as string) : undefined;
  return shapeForm({ questions: rawQuestions, ...(description ? { description } : {}) }, attrs, true);
}

function safeJsonString(inner: string): string {
  try {
    return JSON.parse(`"${inner}"`) as string;
  } catch {
    return inner;
  }
}

// Split `input` into ordered prose/form segments. A block that doesn't parse
// stays as prose, so malformed markup is shown rather than swallowed.
type Segment = { kind: "text"; text: string } | { kind: "form"; form: QuestionForm };

function splitSegments(input: string): Segment[] {
  const out: Segment[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    const slice = input.slice(cursor);
    const m = OPEN_RE.exec(slice);
    if (!m) {
      out.push({ kind: "text", text: slice });
      break;
    }
    const tag = (m[1] ?? "question-form").toLowerCase();
    const openStart = cursor + m.index;
    const openEnd = openStart + m[0].length;
    const closeIdx = findCloseTag(input, openEnd, `</${tag}>`);
    if (closeIdx === -1) {
      // Unterminated — leave the rest as prose so we don't swallow it.
      out.push({ kind: "text", text: slice });
      break;
    }
    if (openStart > cursor) out.push({ kind: "text", text: input.slice(cursor, openStart) });
    let data: unknown;
    try {
      data = JSON.parse(stripFences(input.slice(openEnd, closeIdx)));
    } catch {
      data = null;
    }
    const blockEnd = closeIdx + tag.length + 3;
    const form = shapeForm(data, parseAttrs(m[2] ?? ""), false);
    out.push(form ? { kind: "form", form } : { kind: "text", text: input.slice(openStart, blockEnd) });
    cursor = blockEnd;
  }
  return out;
}

// The text to show in the thread: closed `<question-form>` blocks removed (they
// render in the side panel), and a trailing not-yet-closed block dropped so the
// chat never flashes raw `<question-form>{…` mid-stream.
export function visibleAnswer(input: string): string {
  let text = splitSegments(input)
    .filter((s): s is { kind: "text"; text: string } => s.kind === "text")
    .map((s) => s.text)
    .join("");
  // Drop a trailing, still-open form block.
  const m = OPEN_RE.exec(text);
  if (m) {
    const tag = (m[1] ?? "question-form").toLowerCase();
    if (findCloseTag(text, m.index + m[0].length, `</${tag}>`) === -1) {
      text = text.slice(0, m.index);
    }
  }
  return text.replace(/\s+$/, "");
}

// Format finished answers into a prose user message the expert reads next turn.
// The `[form answers — <id>]` prefix is stable enough that the expert can
// recognise the form was answered without any structured wrapper.
export function formatFormAnswers(form: QuestionForm, answers: Record<string, string | string[]>): string {
  const lines = [`[form answers — ${form.id}]`];
  for (const q of form.questions) {
    const v = answers[q.id];
    let display: string;
    if (Array.isArray(v)) display = v.length ? v.map((x) => labelFor(q, x)).join(", ") : "(skipped)";
    else if (typeof v === "string" && v.trim()) display = labelFor(q, v.trim());
    else display = "(skipped)";
    lines.push(`- ${q.label}: ${display}`);
  }
  return lines.join("\n");
}

function labelFor(q: FormQuestion, value: string): string {
  const match = q.options?.find((o) => o.value === value || o.label === value);
  if (!match) return value;
  return match.value === match.label ? match.label : `${match.label} [value: ${match.value}]`;
}
