// Teams — the Discord-style "team workspace" view. Renders the live Chief-of-Staff
// transcript (from useTeam) + member presence (derived from sessions[]). Same data,
// second renderer: each member here is a real session that also shows in Simple.
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { H, brandOf } from "../shared/harnesses";
import { vars } from "../shared/ui";
import { activityOf, type Session } from "../shared/models";
import type { TeamState, TeamMember } from "./useTeam";
import "./teams.css";

const CHIEF = "chief_of_staff";

// Per-role accent so members stay distinct even on one engine (mirrors the mockup).
const ACCENT: Record<string, string> = {
  chief_of_staff: "#eaf0f7", engineer: "#a3e635", scientist: "#4cc9f0",
  consultant: "#f5b14c", analyst: "#fb7185", researcher: "#c084fc",
};
const accentOf = (key: string, harness: string) => ACCENT[key] || brandOf(harness);
const initials = (name: string) => {
  const w = name.trim().split(/\s+/);
  return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : name.slice(0, 2)).toUpperCase();
};

type Presence = "working" | "online" | "idle";
function presenceOf(m: TeamMember, sessions: Session[]): Presence {
  if (!m.sessionId) return "idle";
  const s = sessions.find((x) => x.id === m.sessionId);
  if (!s) return "idle";
  const a = activityOf(s);
  return a === "idle" || a === "ended" ? "online" : "working";
}

function Avatar({ k, harness, size = 40, working }: { k: string; harness: string; size?: number; working?: boolean }) {
  return (
    <span
      className={"tm-av" + (working ? " working" : "")}
      style={vars({ "--c": accentOf(k, harness), "--z": `${size}px` })}
    >
      {initials(k === CHIEF ? "Chief Staff" : (k[0].toUpperCase() + k.slice(1)))}
    </span>
  );
}

export default function Teams({
  team, sessions, workspace, wsName, onPickWorkspace, onOpenWorkspace, onBrief, onOpen, onStopTeam,
}: {
  team: TeamState;
  sessions: Session[];
  workspace: string;
  wsName: string;
  onPickWorkspace: () => void;
  onOpenWorkspace: () => void;
  onBrief: (goal: string) => void;
  onOpen: (id: string) => void;
  onStopTeam: () => void;
}) {
  const [value, setValue] = useState("");
  const running = team.status === "running";
  const roster = team.roster.length
    ? team.roster
    : [{ key: CHIEF, name: "Chief of Staff", role: "orchestrator", harness: "codex" } as TeamMember];

  const nameOf = (key: string) => roster.find((m) => m.key === key)?.name || key;
  const harnessOfKey = (key: string) => roster.find((m) => m.key === key)?.harness || "codex";

  const groups: Record<Presence, TeamMember[]> = { working: [], online: [], idle: [] };
  for (const m of roster) groups[presenceOf(m, sessions)].push(m);
  const workingCount = groups.working.length;

  const activeSession = team.activeSessionId ? sessions.find((s) => s.id === team.activeSessionId) : null;

  function brief() {
    const t = value.trim();
    if (!t || running) return;
    setValue("");
    onBrief(t);
  }

  return (
    <div className="tm">
      {/* ---- channels sidebar ---- */}
      <div className="tm-side">
        <div className="tm-side-head">
          <b>My Team</b>
          <span className={"tm-work" + (workingCount ? " on" : "")}>
            <i /> {workingCount ? `${workingCount} working` : "idle"}
          </span>
        </div>
        <div className="tm-side-scroll">
          <div className="tm-group">Channels</div>
          <div className="tm-chan"><span className="h">#</span> general</div>
          <div className="tm-chan active"><span className="h">#</span> {team.channel || "team"}{running && <i className="tm-live" />}</div>
          <div className="tm-group">Project workspace</div>
          <div className="tm-ws" title={workspace || "Default app folder"}>
            <span className="tm-ws-ic">📁</span>
            <span className="tm-ws-name">{wsName}</span>
          </div>
          <div className="tm-ws-note">shared by the whole team</div>
          <div className="tm-ws-acts">
            <button onClick={onPickWorkspace}>change…</button>
            <button onClick={onOpenWorkspace}>open</button>
          </div>
        </div>
        <div className="tm-you"><span className="tm-av you">PB</span><div><b>You</b><small>manager</small></div></div>
      </div>

      {/* ---- main ---- */}
      <div className="tm-main">
        <div className="tm-head">
          <div className="tm-ttl"><span className="h">#</span> {team.channel || "team"}</div>
          <div className="tm-topic">{team.goal ? <><b>Goal:</b> {team.goal}</> : "Brief your Chief of Staff to start"}</div>
          <span className="tm-spacer" />
          {running && <button className="tm-stop" onClick={onStopTeam} title="Stop the team">■ stop</button>}
        </div>

        <div className="tm-stream">
          {team.transcript.length === 0 && !running && (
            <div className="tm-intro">
              <div className="tm-intro-ic">⬡</div>
              <h3>Your AI team's server</h3>
              <p>Brief the <b>Chief of Staff</b> with a goal. It decides which experts to call,
                delegates, and hands you back one synthesized answer — you just watch.</p>
            </div>
          )}

          {team.transcript.map((t) => {
            const isDelegation = t.key === CHIEF && !t.synthesis && t.mentions.length > 0;
            return (
              <div key={t.tid} className={"tm-msg" + (t.synthesis ? " synth" : "")} style={vars({ "--c": accentOf(t.key, t.harness) })}>
                <Avatar k={t.key} harness={t.harness} />
                <div className="tm-bd">
                  <div className="tm-meta">
                    <span className="tm-nm">{t.name}</span>
                    {t.key === CHIEF && <span className="tm-lead">lead</span>}
                    <span className="tm-role">{H[t.harness]?.label || t.harness}</span>
                  </div>
                  {isDelegation ? (
                    <div className="tm-txt">
                      <span className="tm-deleg">delegates to
                        <span className="tm-chip" style={vars({ "--c": accentOf(t.mentions[0], harnessOfKey(t.mentions[0])) })}>@{nameOf(t.mentions[0])}</span>
                      </span>
                      <div className="tm-task">{t.text}</div>
                    </div>
                  ) : t.synthesis ? (
                    <div className="tm-txt">
                      <span className="tm-synth-badge">✓ synthesis for you</span>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.text}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="tm-txt"><ReactMarkdown remarkPlugins={[remarkGfm]}>{t.text}</ReactMarkdown></div>
                  )}
                </div>
              </div>
            );
          })}

          {running && team.activeKey && (
            <div className="tm-typing" style={vars({ "--c": accentOf(team.activeKey, harnessOfKey(team.activeKey)) })}>
              <Avatar k={team.activeKey} harness={harnessOfKey(team.activeKey)} working />
              <div className="tm-bubble">
                <span className="tm-dots"><i /><i /><i /></span>
                {team.activeKey === CHIEF ? "Chief of Staff is deciding…" : `${nameOf(team.activeKey)} is working…`}
                {activeSession && activeSession.cost != null && <span className="tm-tok">· ${activeSession.cost.toFixed(3)}</span>}
              </div>
            </div>
          )}
        </div>

        <div className="tm-compose">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") brief(); }}
            placeholder={running ? "Chief of Staff is on it — wait for the synthesis…" : "Give the team a goal — the Chief of Staff dispatches the experts…"}
            disabled={running}
          />
          <button className="tm-run" onClick={brief} disabled={running} title="Brief the Chief of Staff">▶</button>
        </div>
      </div>

      {/* ---- members rail ---- */}
      <div className="tm-members">
        <div className="tm-mh"><b>Team — {roster.length}</b><small>{workingCount} working · {groups.online.length} online · {groups.idle.length} idle</small></div>
        <div className="tm-mscroll">
          {(["working", "online", "idle"] as Presence[]).map((g) =>
            groups[g].length ? (
              <div key={g}>
                <div className="tm-mgroup">{g === "working" ? "Working" : g === "online" ? "Online" : "Idle"} — {groups[g].length}</div>
                {groups[g].map((m) => (
                  <div
                    key={m.key}
                    className={"tm-member " + g}
                    style={vars({ "--c": accentOf(m.key, m.harness) })}
                    onClick={() => m.sessionId && onOpen(m.sessionId)}
                  >
                    <Avatar k={m.key} harness={m.harness} size={36} working={g === "working"} />
                    <div className="tm-minfo">
                      <b>{m.name}{m.key === CHIEF && <span className="tm-crown">♦</span>}</b>
                      <small>{m.key === CHIEF ? "orchestrator" : m.role} · {H[m.harness]?.label || m.harness}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : null
          )}
        </div>
        <div className="tm-guard">cost guard · stops after the goal, capped at 5 delegations</div>
      </div>
    </div>
  );
}
