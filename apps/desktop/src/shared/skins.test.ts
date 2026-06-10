import { describe, it, expect } from "vitest";
import { SKINS, isSkin, isNight, nightId } from "./skins";

describe("night window (auto-Minuit)", () => {
  it("opens at 21:00 and closes at 07:00", () => {
    expect(isNight(new Date(2026, 5, 10, 20, 59))).toBe(false);
    expect(isNight(new Date(2026, 5, 10, 21, 0))).toBe(true);
    expect(isNight(new Date(2026, 5, 11, 3, 30))).toBe(true);
    expect(isNight(new Date(2026, 5, 11, 6, 59))).toBe(true);
    expect(isNight(new Date(2026, 5, 11, 7, 0))).toBe(false);
    expect(isNight(new Date(2026, 5, 11, 12, 0))).toBe(false);
  });

  it("nightId pins the whole night to the evening's date", () => {
    // 23:00 on the 10th and 03:00 on the 11th are the same night
    expect(nightId(new Date(2026, 5, 10, 23, 0))).toBe("2026-06-10");
    expect(nightId(new Date(2026, 5, 11, 3, 0))).toBe("2026-06-10");
    // …but 22:00 on the 11th is the next one
    expect(nightId(new Date(2026, 5, 11, 22, 0))).toBe("2026-06-11");
  });

  it("nightId crosses month boundaries", () => {
    expect(nightId(new Date(2026, 6, 1, 2, 0))).toBe("2026-06-30");
  });
});

describe("skin registry", () => {
  it("accepts the new ids and still rejects junk", () => {
    expect(isSkin("parisian")).toBe(true);
    expect(isSkin("noir")).toBe(true);
    expect(isSkin("minuit")).toBe(true);
    expect(isSkin("")).toBe(true);
    expect(isSkin("disco")).toBe(false);
    expect(isSkin(null)).toBe(false);
  });

  it("keeps every SKINS entry id valid and unique", () => {
    const ids = SKINS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isSkin(id)).toBe(true);
  });

  it("places Parisian right after Bright, and flags the special skins", () => {
    expect(SKINS[0].id).toBe("bright");
    expect(SKINS[1].id).toBe("parisian");
    expect(SKINS.find((s) => s.id === "noir")?.hidden).toBe(true);
    expect(SKINS.find((s) => s.id === "minuit")?.night).toBe(true);
  });
});
