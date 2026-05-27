#!/usr/bin/env python3
"""Split — Chief-of-Staff orchestrator (the smart router).

Evolves team_demo.py: instead of a dumb regex router (parse @mentions, route),
a real **Chief of Staff agent** owns the routing. Hub-and-spoke:

  boss gives a goal -> CoS decides which expert to call (JSON) -> we run that
  expert -> feed the reply back to the CoS -> CoS decides again -> ... -> CoS
  emits a final synthesis for the boss.

This fixes the two findings from the soft-handoff spike:
  - "who routes?"          -> the CoS decides, turn by turn.
  - "they never stop"      -> the CoS is told to converge; it emits `finish`.

The CoS speaks a tiny JSON protocol so the orchestrator can act on its decision:
  {"action":"delegate","to":"engineer","task":"..."}      (call one expert)
  {"action":"finish","summary":"..."}                     (done — answer the boss)

Writes the same mockups/transcript.js the Discord view replays (chief turns +
worker replies, hub-and-spoke).  Run:  .venv/bin/python mockups/team_chief.py
"""
from __future__ import annotations

import asyncio
import json
import os
import re

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PYTHON = os.path.join(REPO_ROOT, ".venv", "bin", "python")

CHIEF = ("codex", "chief_of_staff", "\033[38;5;231m")          # platinum — the lead
WORKERS = {
    "engineer":  ("codex", "engineer",  "\033[38;5;149m"),    # green — build
    "scientist": ("codex", "scientist", "\033[38;5;75m"),     # cyan  — research
}
NAME = {"chief": "Chief of Staff", "engineer": "Engineer", "scientist": "Scientist"}
ROLE = {"engineer": "build / implementation", "scientist": "security / research"}
RESET, DIM, BOLD = "\033[0m", "\033[2m", "\033[1m"

MAX_DELEG = 5          # cost guard — max expert calls before forced synthesis
ASK_TIMEOUT = 200

GOAL = ("Decide the refresh-token TTL and rotation approach for our passwordless "
        "auth, and give the boss a final recommendation.")


class Agent:
    def __init__(self, key: str, harness: str, expert: str) -> None:
        self.key, self.harness, self.expert = key, harness, expert
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
            cwd=REPO_ROOT, env={**os.environ, "SPLIT_SID": f"chief-{self.key}"},
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
            return "(timeout)"
        return f"(error: {self.error})" if self.error else "".join(self.buf).strip()

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


def parse_decision(text: str) -> dict | None:
    """Pull the first JSON object out of the CoS reply (it may wrap it in prose)."""
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def norm_to(s: str) -> str | None:
    s = (s or "").lower()
    for k in WORKERS:
        if k in s or NAME[k].lower() in s:
            return k
    return None


# --- console ----------------------------------------------------------------
def color_of(key: str) -> str:
    return CHIEF[2] if key == "chief" else WORKERS[key][2]

def show(key: str, text: str, tag: str = "") -> None:
    c = color_of(key)
    head = f"{c}{BOLD}  {NAME[key]}{RESET}{c}"
    head += f"  ·  {tag}{RESET}" if tag else f"{RESET}"
    print(f"\n{head}\n  {text}\n")


CHIEF_RULES = (
    'Respond with ONLY a JSON object, no prose, no code fence. Either:\n'
    '  {"action":"delegate","to":"engineer"|"scientist","task":"<one concise instruction>"}\n'
    '  {"action":"finish","summary":"<final recommendation for the boss, 3-5 sentences>"}\n'
    "Delegate ONE expert at a time. Build on what you already heard. Finish as "
    "soon as you can answer the goal."
)


async def main() -> None:
    print(f"{BOLD}── Split · #build-auth-flow ── Chief-of-Staff orchestration ──{RESET}")
    print(f"{DIM}  boss goal: {GOAL}{RESET}")
    print(f"{DIM}  team: {', '.join(NAME[k] for k in WORKERS)}  ·  max {MAX_DELEG} delegations{RESET}")

    chief = Agent("chief", *CHIEF[:2])
    workers = {k: Agent(k, WORKERS[k][0], WORKERS[k][1]) for k in WORKERS}
    await asyncio.gather(chief.start(), *(w.start() for w in workers.values()))
    print(f"{DIM}  sessions up (1 chief + {len(workers)} experts). briefing the chief…{RESET}")

    roster = "; ".join(f"{NAME[k]} = {ROLE[k]}" for k in WORKERS)
    transcript = {
        "channel": "build-auth-flow",
        "objective": "Refresh-token TTL & rotation (Chief-of-Staff orchestrated)",
        "team": [{"key": "chief", "name": NAME["chief"], "expert": "chief_of_staff", "harness": "codex"}]
                + [{"key": k, "name": NAME[k], "expert": WORKERS[k][1], "harness": WORKERS[k][0]} for k in WORKERS],
        "turns": [],
        "stopped": "cap",
    }

    cos_msg = (
        f"You are the Chief of Staff. Your boss's goal: {GOAL}\n"
        f"Your team — {roster}.\n\n{CHIEF_RULES}"
    )
    delegations = 0
    summary = None

    while delegations < MAX_DELEG:
        raw = await chief.ask(cos_msg)
        dec = parse_decision(raw)

        if not dec or dec.get("action") == "finish":
            summary = (dec or {}).get("summary") or raw
            transcript["stopped"] = "done"
            break

        if dec.get("action") == "delegate":
            to = norm_to(dec.get("to", ""))
            task = (dec.get("task") or "").strip()
            if not to:
                to = next(iter(WORKERS))  # fallback
            delegations += 1
            show("chief", f"→ @{NAME[to]}: {task}", tag=f"delegation {delegations}/{MAX_DELEG}")
            transcript["turns"].append({
                "key": "chief", "name": NAME["chief"], "harness": "codex",
                "text": f"@{NAME[to]} {task}", "mentions": [to], "used": chief.last_used,
            })

            wrapped = (
                f"You are @{NAME[to]} ({ROLE[to]}). The Chief of Staff asks:\n\"{task}\"\n\n"
                f"Answer in 3-4 sentences, concrete and decisive. You report to the "
                f"Chief of Staff — no need to @mention anyone, just give your answer."
            )
            reply = await workers[to].ask(wrapped)
            show(to, reply, tag=f"{WORKERS[to][1]} (codex)")
            transcript["turns"].append({
                "key": to, "name": NAME[to], "harness": WORKERS[to][0],
                "text": reply, "mentions": ["chief"], "used": workers[to].last_used,
            })

            cos_msg = (
                f"@{NAME[to]} replied:\n\"{reply}\"\n\n"
                f"Decide the next step. {CHIEF_RULES}"
            )
    else:
        # hit the delegation budget — force a synthesis
        raw = await chief.ask(
            "You have reached the delegation budget. Now finish: respond with ONLY "
            '{"action":"finish","summary":"<final recommendation for the boss>"}.'
        )
        dec = parse_decision(raw)
        summary = (dec or {}).get("summary") or raw

    # final synthesis for the boss
    show("chief", summary, tag="SYNTHESIS for the boss")
    transcript["turns"].append({
        "key": "chief", "name": NAME["chief"], "harness": "codex",
        "text": summary, "mentions": [], "used": chief.last_used, "synthesis": True,
    })

    transcript["turns_count"] = len(transcript["turns"])
    out_path = os.path.join(REPO_ROOT, "mockups", "transcript.js")
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write("window.TRANSCRIPT = " + json.dumps(transcript, ensure_ascii=False, indent=2) + ";\n")
    print(f"{DIM}  → transcript: {out_path}{RESET}")

    await asyncio.gather(chief.stop(), *(w.stop() for w in workers.values()))
    print(f"{BOLD}── fin · {delegations} délégations + synthèse ──{RESET}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
