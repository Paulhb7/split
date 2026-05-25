import { describe, expect, it } from "vitest";
import { applyEvent } from "./reducer";
import { newSession, type Session } from "./models";

const base = (): Session => newSession("s1", "claude", "consultant", "Consultant", "hi");

describe("applyEvent", () => {
  it("streams `say` text into answer and flags running", () => {
    let s = base();
    s = applyEvent(s, { type: "say", text: "Hel" });
    s = applyEvent(s, { type: "say", text: "lo" });
    expect(s.answer).toBe("Hello");
    expect(s.status).toBe("running");
    expect(s.summary.startsWith("writing · ")).toBe(true);
  });

  it("commits the streamed answer into the thread on status:idle", () => {
    let s = applyEvent(base(), { type: "say", text: "the answer" });
    s = applyEvent(s, { type: "status", status: "idle" });
    expect(s.status).toBe("idle");
    expect(s.answer).toBe(""); // cleared after commit
    expect(s.thread[s.thread.length - 1]).toEqual({ role: "agent", text: "the answer" });
  });

  it("does not append an empty agent turn when there is no answer", () => {
    const before = base();
    const s = applyEvent(before, { type: "status", status: "idle" });
    expect(s.thread).toEqual(before.thread); // unchanged
  });

  it("summarizes a tool step with the → prefix", () => {
    const s = applyEvent(base(), { type: "step", title: "web_search", status: "in_progress" });
    expect(s.status).toBe("running");
    expect(s.summary).toBe("→ web_search · in_progress");
  });

  it("records cost from usage but ignores null", () => {
    expect(applyEvent(base(), { type: "usage", used: 100, size: 1000, cost: 0.12 }).cost).toBe(0.12);
    expect(applyEvent(base(), { type: "usage", used: 0, size: 0, cost: null }).cost).toBeNull();
  });

  it("enters auth state on auth_required", () => {
    const s = applyEvent(base(), {
      type: "auth_required",
      harness: "codex",
      methods: [],
      hasLogin: true,
      note: "run codex login",
    });
    expect(s.status).toBe("auth");
    expect(s.auth).toMatchObject({ harness: "codex", hasLogin: true });
  });

  it("clears the auth prompt on a successful auth_result", () => {
    let s = applyEvent(base(), { type: "auth_required", harness: "codex", methods: [], hasLogin: true, note: "" });
    s = applyEvent(s, { type: "auth_result", harness: "codex", ok: true });
    expect(s.auth).toBeNull();
  });

  it("surfaces an error on status:error", () => {
    const s = applyEvent(base(), { type: "status", status: "error", error: "boom" });
    expect(s.status).toBe("error");
    expect(s.summary).toContain("boom");
  });
});
