import { describe, expect, it } from "vitest";
import {
  formatFormAnswers,
  parsePartialQuestionForm,
  parseQuestionForm,
  visibleAnswer,
} from "./questionForm";

const FORM = `<question-form id="discovery" title="Brief express">
{
  "description": "Laisse vide ce qui ne s'applique pas.",
  "questions": [
    { "id": "angle", "label": "Quel angle ?", "type": "radio", "required": true,
      "options": ["Panorama", "Investissement"] },
    { "id": "ton", "label": "Ton visuel", "type": "checkbox", "maxSelections": 2,
      "options": ["Tech", "Minimal", "Editorial"] },
    { "id": "points", "label": "Points", "type": "textarea" }
  ]
}
</question-form>`;

describe("parseQuestionForm", () => {
  it("parses a closed form's attrs + questions", () => {
    const f = parseQuestionForm(`Voici quelques questions :\n${FORM}`);
    expect(f).not.toBeNull();
    expect(f!.id).toBe("discovery");
    expect(f!.title).toBe("Brief express");
    expect(f!.description).toContain("Laisse vide");
    expect(f!.questions.map((q) => q.id)).toEqual(["angle", "ton", "points"]);
    expect(f!.questions[0]).toMatchObject({ type: "radio", required: true });
    expect(f!.questions[1]).toMatchObject({ type: "checkbox", maxSelections: 2 });
    expect(f!.questions[0]!.options).toEqual([
      { label: "Panorama", value: "Panorama" },
      { label: "Investissement", value: "Investissement" },
    ]);
  });

  it("returns null when there is no form or it is unterminated", () => {
    expect(parseQuestionForm("just prose, no form")).toBeNull();
    expect(parseQuestionForm(`<question-form>{"questions":[{"id":"a","label":"A"}]`)).toBeNull();
  });

  it("accepts the <ask-question> alias and a ```json fenced body", () => {
    const fenced = `<ask-question title="Quick">\n\`\`\`json\n{"questions":[{"id":"x","label":"X","type":"text"}]}\n\`\`\`\n</ask-question>`;
    const f = parseQuestionForm(fenced);
    expect(f).not.toBeNull();
    expect(f!.title).toBe("Quick");
    expect(f!.questions[0]).toMatchObject({ id: "x", type: "text" });
  });

  it("maps object options with stable values + descriptions", () => {
    const f = parseQuestionForm(
      `<question-form>{"questions":[{"id":"brand","label":"Brand","type":"radio","options":[{"label":"Pick for me","value":"pick_direction","description":"I'll choose"}]}]}</question-form>`,
    );
    expect(f!.questions[0]!.options![0]).toEqual({
      label: "Pick for me",
      value: "pick_direction",
      description: "I'll choose",
    });
  });
});

describe("parsePartialQuestionForm (streaming)", () => {
  it("renders a titled frame before any question has closed", () => {
    const f = parsePartialQuestionForm(`<question-form id="d" title="Brief">\n{ "questions": [ { "id": "ang`);
    expect(f).not.toBeNull();
    expect(f!.title).toBe("Brief");
    expect(f!.questions).toHaveLength(0);
  });

  it("surfaces only the question objects that have fully streamed", () => {
    const partial = `<question-form id="d" title="Brief">
{ "questions": [
  { "id": "angle", "label": "Quel angle ?", "type": "radio", "options": ["A","B"] },
  { "id": "ton", "label": "Ton vis`;
    const f = parsePartialQuestionForm(partial);
    expect(f!.questions.map((q) => q.id)).toEqual(["angle"]); // the in-flight one is held back
  });

  it("returns null when no open tag is present yet", () => {
    expect(parsePartialQuestionForm("Got it — pitch deck.")).toBeNull();
  });
});

describe("visibleAnswer", () => {
  it("drops a closed form block but keeps the prose around it", () => {
    expect(visibleAnswer(`Got it — pitch deck.\n${FORM}`)).toBe("Got it — pitch deck.");
  });

  it("hides a trailing, still-open form mid-stream (no raw markup flash)", () => {
    expect(visibleAnswer(`One line.\n<question-form id="d" title="T">\n{ "quest`)).toBe("One line.");
  });

  it("leaves plain prose untouched", () => {
    expect(visibleAnswer("just an answer")).toBe("just an answer");
  });
});

describe("formatFormAnswers", () => {
  it("formats answers with the stable prefix and marks skips", () => {
    const f = parseQuestionForm(FORM)!;
    const out = formatFormAnswers(f, { angle: "Panorama", ton: ["Tech", "Minimal"] });
    expect(out).toBe(
      "[form answers — discovery]\n- Quel angle ?: Panorama\n- Ton visuel: Tech, Minimal\n- Points: (skipped)",
    );
  });

  it("surfaces an option's stable value when it differs from the label", () => {
    const f = parseQuestionForm(
      `<question-form id="b">{"questions":[{"id":"brand","label":"Brand","type":"radio","options":[{"label":"Pick for me","value":"pick_direction"}]}]}</question-form>`,
    )!;
    expect(formatFormAnswers(f, { brand: "pick_direction" })).toContain(
      "Brand: Pick for me [value: pick_direction]",
    );
  });
});
