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

  it("accumulates streamed thoughts and commits them before the answer on idle", () => {
    let s = base();
    s = applyEvent(s, { type: "thought", text: "let me " });
    s = applyEvent(s, { type: "thought", text: "think…" });
    s = applyEvent(s, { type: "say", text: "the answer" });
    expect(s.thoughts).toBe("let me think…");
    expect(s.answer).toBe("the answer");
    s = applyEvent(s, { type: "status", status: "idle" });
    expect(s.thoughts).toBe("");
    expect(s.answer).toBe("");
    const last2 = s.thread.slice(-2);
    expect(last2[0]).toEqual({ role: "thought", text: "let me think…" });
    expect(last2[1]).toEqual({ role: "agent", text: "the answer" });
  });

  it("does not append an empty agent turn when there is no answer", () => {
    const before = base();
    const s = applyEvent(before, { type: "status", status: "idle" });
    expect(s.thread).toEqual(before.thread); // unchanged
  });

  it("anchors the turn clock across the turn and clears it at idle", () => {
    let s = base();
    expect(s.turnStartedAt).not.toBeNull(); // a new session starts mid-turn
    const anchor = s.turnStartedAt;
    s = applyEvent(s, { type: "say", text: "a" });
    s = applyEvent(s, { type: "step", title: "tool", status: "in_progress" });
    expect(s.turnStartedAt).toBe(anchor); // preserved while running
    s = applyEvent(s, { type: "status", status: "idle" });
    expect(s.turnStartedAt).toBeNull(); // cleared at turn end
    s = applyEvent(s, { type: "thought", text: "next turn" });
    expect(s.turnStartedAt).not.toBeNull(); // fresh anchor on re-entry
    expect(s.turnStartedAt).toBeGreaterThanOrEqual(anchor!);
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

  it("collects artifacts and tracks the latest as active", () => {
    let s = base();
    s = applyEvent(s, { type: "artifact", rel: "essay.md", path: "/ws/essay.md", op: "created", size: 120, mtime: 1 });
    s = applyEvent(s, { type: "artifact", rel: "notes.md", path: "/ws/notes.md", op: "created", size: 80, mtime: 2 });
    expect(s.artifacts.map((a) => a.rel)).toEqual(["essay.md", "notes.md"]);
    expect(s.activeArtifact).toBe("notes.md");
    // Modification keeps single entry, refreshes ordering, becomes active again.
    s = applyEvent(s, { type: "artifact", rel: "essay.md", path: "/ws/essay.md", op: "modified", size: 140, mtime: 3 });
    expect(s.artifacts.map((a) => a.rel)).toEqual(["notes.md", "essay.md"]);
    expect(s.activeArtifact).toBe("essay.md");
    // Deletion drops the entry, falls back to the last remaining one.
    s = applyEvent(s, { type: "artifact", rel: "essay.md", path: "/ws/essay.md", op: "deleted", size: 0, mtime: 4 });
    expect(s.artifacts.map((a) => a.rel)).toEqual(["notes.md"]);
    expect(s.activeArtifact).toBe("notes.md");
  });

  it("filters out working files (logs/scripts/manifests), keeping only deliverables", () => {
    let s = base();
    s = applyEvent(s, { type: "artifact", rel: "trailer.mp4", path: "/ws/trailer.mp4", op: "created", size: 999, mtime: 1 });
    // working files are ignored entirely — no entry, and they don't steal `activeArtifact`
    for (const rel of ["gen_video.sh", "make_cards.py", "score/score.json", "shots/shot-1.log", "narration.txt"]) {
      s = applyEvent(s, { type: "artifact", rel, path: "/ws/" + rel, op: "created", size: 10, mtime: 2 });
    }
    expect(s.artifacts.map((a) => a.rel)).toEqual(["trailer.mp4"]);
    expect(s.activeArtifact).toBe("trailer.mp4");
    // another media deliverable still lands and becomes active
    s = applyEvent(s, { type: "artifact", rel: "score/score.mp3", path: "/ws/score/score.mp3", op: "created", size: 999, mtime: 3 });
    expect(s.artifacts.map((a) => a.rel)).toEqual(["trailer.mp4", "score/score.mp3"]);
    expect(s.activeArtifact).toBe("score/score.mp3");
  });
});
