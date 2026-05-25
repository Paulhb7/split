import { describe, expect, it } from "vitest";
import { activityOf, newSession, type Session } from "./models";

const withStatusSummary = (status: Session["status"], summary: string): Session => ({
  ...newSession("s1", "claude", "consultant", "Consultant", "hi"),
  status,
  summary,
});

describe("activityOf", () => {
  it("maps terminal statuses directly", () => {
    expect(activityOf(withStatusSummary("auth", ""))).toBe("auth");
    expect(activityOf(withStatusSummary("error", ""))).toBe("error");
    expect(activityOf(withStatusSummary("ended", ""))).toBe("ended");
    expect(activityOf(withStatusSummary("idle", "done"))).toBe("idle");
  });

  it("refines a running session from its summary", () => {
    expect(activityOf(withStatusSummary("running", "→ web_search · run"))).toBe("tool");
    expect(activityOf(withStatusSummary("running", "writing · …"))).toBe("writing");
    expect(activityOf(withStatusSummary("running", "thinking…"))).toBe("thinking");
  });
});

describe("newSession", () => {
  it("starts running with the first user turn in the thread", () => {
    const s = newSession("s1", "claude", "consultant", "Consultant", "research EVs");
    expect(s.status).toBe("running");
    expect(s.thread).toEqual([{ role: "user", text: "research EVs", files: undefined }]);
    expect(s.answer).toBe("");
    expect(s.cost).toBeNull();
  });

  it("keeps an empty thread when there is no first text and no files", () => {
    const s = newSession("s1", "claude", "consultant", "Consultant", "");
    expect(s.thread).toEqual([]);
  });
});
