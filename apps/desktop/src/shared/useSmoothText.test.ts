import { describe, expect, it } from "vitest";
import { stabilizeMarkdown } from "./useSmoothText";

describe("stabilizeMarkdown", () => {
  it("leaves balanced text alone", () => {
    expect(stabilizeMarkdown("plain text")).toBe("plain text");
    expect(stabilizeMarkdown("**bold** and `code` done")).toBe("**bold** and `code` done");
    expect(stabilizeMarkdown("```ts\nconst x = 1;\n```")).toBe("```ts\nconst x = 1;\n```");
  });

  it("closes a trailing open bold", () => {
    expect(stabilizeMarkdown("voilà du **gras en cou")).toBe("voilà du **gras en cou**");
  });

  it("closes a trailing open italic without touching bold pairs", () => {
    expect(stabilizeMarkdown("**ok** puis *itali")).toBe("**ok** puis *itali*");
  });

  it("closes a trailing open inline code", () => {
    expect(stabilizeMarkdown("appelle `useSmooth")).toBe("appelle `useSmooth`");
  });

  it("closes an open code fence and skips inline fixes inside it", () => {
    expect(stabilizeMarkdown("intro\n```ts\nconst a = b ** c;")).toBe(
      "intro\n```ts\nconst a = b ** c;\n```"
    );
  });

  it("only balances the last line — earlier lines are already committed prose", () => {
    expect(stabilizeMarkdown("un *astérisque orphelin\nligne suivante ok")).toBe(
      "un *astérisque orphelin\nligne suivante ok"
    );
  });
});
