#!/usr/bin/env python3
"""Split — soft-handoff team spike.

Proves the "Teams mode" v1: several real ACP sessions (split.runner subprocesses)
talking to each other. No new protocol — the handoff is *soft*:

  agent finishes a turn (status:idle)  ->  we read its full `say`
  ->  parse @Mentions  ->  feed the message as the NEXT turn to the mentioned agent

This is exactly the seam we'd later swap for A2A: today it serializes a handoff
to a prompt; the routing decision (who's next) is the only thing the orchestrator
owns. Cost guard: hard turn cap + a `DONE` stop word.

Run from anywhere:  .venv/bin/python mockups/team_demo.py
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from collections import deque

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PYTHON = os.path.join(REPO_ROOT, ".venv", "bin", "python")

# --- the team: key -> (harness, expert, ansi color) --------------------------
# All on codex (the authed harness here); swap harness per agent freely.
TEAM = {
    "consultant": ("codex", "consultant", "\033[38;5;179m"),  # gold  — lead
    "engineer":   ("codex", "engineer",   "\033[38;5;149m"),  # green — build
    "scientist":  ("codex", "scientist",  "\033[38;5;75m"),   # cyan  — research
}
NAME = {"consultant": "Consultant", "engineer": "Engineer", "scientist": "Scientist"}
RESET, DIM, BOLD = "\033[0m", "\033[2m", "\033[1m"

TURN_CAP = 7          # hard stop — agents talking = tokens burning
MIN_TURNS = 3         # don't honor DONE before the chain actually happened
ASK_TIMEOUT = 200     # seconds per turn before we bail

SEED = (
    "You are @Consultant, the lead in the channel #build-auth-flow. Start a team "
    "discussion to decide the refresh-token TTL and rotation approach for our "
    "passwordless auth.\n\n"
    "Write ONLY your own opening message, first person, 2-3 sentences. Do NOT write "
    "other people's replies or simulate the discussion — you are only @Consultant. "
    "End your message with exactly ONE @mention of who should respond next "
    "(@Engineer or @Scientist). Do not write DONE yet."
)


class Agent:
    def __init__(self, key: str) -> None:
        self.key = key
        self.harness, self.expert, self.color = TEAM[key]
        self.proc: asyncio.subprocess.Process | None = None
        self.buf: list[str] = []
        self.idle = asyncio.Event()
        self.error: str | None = None
        self.last_used = 0

    async def start(self) -> None:
        self.proc = await asyncio.create_subprocess_exec(
            PYTHON, "-m", "split.runner", "--harness", self.harness, "--expert", self.expert,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            cwd=REPO_ROOT, env={**os.environ, "SPLIT_SID": f"team-{self.key}"},
        )
        asyncio.create_task(self._reader())

    async def _reader(self) -> None:
        assert self.proc and self.proc.stdout
        while True:
            raw = await self.proc.stdout.readline()
            if not raw:
                self.idle.set()
                break
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("VEVT "):
                continue
            try:
                ev = json.loads(line[5:])
            except Exception:
                continue
            t = ev.get("type")
            if t == "say":
                self.buf.append(ev.get("text", ""))
            elif t == "status" and ev.get("status") == "idle":
                self.idle.set()
            elif t == "status" and ev.get("status") == "error":
                self.error = ev.get("error", "?")
                self.idle.set()
            elif t == "auth_required":
                self.error = f"needs auth ({self.harness})"
                self.idle.set()
            elif t == "usage":
                self.last_used = ev.get("used") or self.last_used

    async def ask(self, text: str) -> str:
        assert self.proc and self.proc.stdin
        self.buf.clear()
        self.idle.clear()
        self.proc.stdin.write((json.dumps({"text": text}) + "\n").encode())
        await self.proc.stdin.drain()
        try:
            await asyncio.wait_for(self.idle.wait(), ASK_TIMEOUT)
        except asyncio.TimeoutError:
            return "(timeout — no reply)"
        if self.error:
            return f"(error: {self.error})"
        return "".join(self.buf).strip()

    async def stop(self) -> None:
        if self.proc and self.proc.stdin:
            try:
                self.proc.stdin.close()
            except Exception:
                pass
        if self.proc:
            try:
                self.proc.kill()
            except Exception:
                pass


def mentions_in(text: str, exclude: str) -> list[str]:
    """Map every @Name in `text` back to an agent key (case-insensitive), in order."""
    found, seen = [], set()
    for raw in re.findall(r"@(\w+)", text):
        for key, label in NAME.items():
            if raw.lower() == label.lower() and key != exclude and key not in seen:
                found.append(key)
                seen.add(key)
    return found


def wrap(frm: str, to: str, body: str) -> str:
    mates = ", ".join(f"@{NAME[k]}" for k in TEAM if k != to)
    return (
        f"#build-auth-flow — new message from @{NAME[frm]}:\n\"{body}\"\n\n"
        f"You are @{NAME[to]}. Reply with ONLY your own message, first person, 2-3 "
        f"sentences. Do NOT speak for anyone else or simulate their replies. End with "
        f"exactly ONE @mention of who should respond next ({mates}). Write DONE only "
        f"if the decision is fully agreed AND it is your call to close it."
    )


def show(key: str, text: str) -> None:
    a = TEAM[key]
    # color any @Mention inside the body with that teammate's color
    def paint(m):
        for k, label in NAME.items():
            if m.group(1).lower() == label.lower():
                return f"{TEAM[k][2]}{BOLD}@{label}{RESET}"
        return m.group(0)
    body = re.sub(r"@(\w+)", paint, text)
    print(f"\n{a[2]}{BOLD}  {NAME[key]}{RESET}{a[2]}  ·  {a[1]} (codex){RESET}")
    print(f"  {body}\n")


async def main() -> None:
    print(f"{BOLD}── Split · #build-auth-flow ── soft-handoff (@mention → turn) ──{RESET}")
    print(f"{DIM}  team: {', '.join(NAME[k] for k in TEAM)}  ·  cap {TURN_CAP} turns  ·  stop word DONE{RESET}")

    agents = {k: Agent(k) for k in TEAM}
    await asyncio.gather(*(a.start() for a in agents.values()))
    print(f"{DIM}  3 sessions ACP up. seeding the lead…{RESET}")

    transcript = {
        "channel": "build-auth-flow",
        "objective": "Refresh-token TTL & rotation for passwordless auth",
        "team": [{"key": k, "name": NAME[k], "expert": TEAM[k][1], "harness": TEAM[k][0]} for k in TEAM],
        "turns": [],
        "stopped": "cap",
    }

    queue: deque[tuple[str, str, str]] = deque()
    queue.append(("system", "consultant", SEED))
    turns = 0

    while queue and turns < TURN_CAP:
        frm, to, text = queue.popleft()
        reply = await agents[to].ask(text)
        turns += 1
        show(to, reply)

        nxt = mentions_in(reply, exclude=to)
        transcript["turns"].append({
            "key": to, "name": NAME[to], "harness": TEAM[to][0],
            "text": reply, "mentions": nxt, "used": agents[to].last_used,
        })

        if "DONE" in reply.upper() and turns >= MIN_TURNS:
            transcript["stopped"] = "done"
            print(f"{DIM}  → '{NAME[to]}' a clôturé (DONE). stop.{RESET}")
            break

        target = nxt[0] if nxt else None      # single-threaded chain (route to first @)
        if target is None:
            if turns < MIN_TURNS:             # keep the chain alive early
                target = next(k for k in TEAM if k != to)
            else:
                transcript["stopped"] = "ended"
                print(f"{DIM}  → aucun @mention. stop.{RESET}")
                break
        queue.append((to, target, wrap(to, target, reply)))

    else:
        if turns >= TURN_CAP:
            print(f"{DIM}  → cap de {TURN_CAP} tours atteint (garde-fou coût). stop.{RESET}")

    transcript["turns_count"] = turns
    out_path = os.path.join(REPO_ROOT, "mockups", "transcript.js")
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write("window.TRANSCRIPT = " + json.dumps(transcript, ensure_ascii=False, indent=2) + ";\n")
    print(f"{DIM}  → transcript: {out_path}{RESET}")

    print(f"{DIM}  closing sessions…{RESET}")
    await asyncio.gather(*(a.stop() for a in agents.values()))
    print(f"{BOLD}── fin · {turns} tours ──{RESET}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
