// Teams — the project/channel workspace. Sidebar lists the project's channels
// (each channel = one Chief-of-Staff run on a goal); main renders the ACTIVE
// channel; members rail derives presence from the active channel's sessions.
// Composer always creates a NEW channel — multiple can run in parallel.
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { H, brandOf } from "../shared/harnesses";
import { vars } from "../shared/ui";
import { activityOf, type Session } from "../shared/models";
import type { Channel, Project, TeamMember } from "./useTeam";
import "./teams.css";

const CHIEF = "toscanini";

const ACCENT: Record<string, string> = {
  toscanini: "#eaf0f7", engineer: "#a3e635", scientist: "#4cc9f0",
  consultant: "#f5b14c", analyst: "#fb7185", researcher: "#c084fc",
};
const accentOf = (key: string, harness: string) => ACCENT[key] || brandOf(harness);
const initials = (key: string) =>
  (key === CHIEF ? "CS" : key.slice(0, 2)).toUpperCase();

type Presence = "working" | "online" | "idle";
function presenceOf(memberKey: string, channel: Channel | null, sessions: Session[]): Presence {
  if (!channel) return "idle";
  const sid = channel.sessionIds[memberKey];
  if (!sid) return "idle";
  const s = sessions.find((x) => x.id === sid);
  if (!s) return "idle";
  const a = activityOf(s);
  return a === "idle" || a === "ended" ? "online" : "working";
}

function Avatar({ k, harness, size = 40, working }: { k: string; harness: string; size?: number; working?: boolean }) {
  return (
    <span className={"tm-av" + (working ? " working" : "")}
      style={vars({ "--c": accentOf(k, harness), "--z": `${size}px` })}>
      {initials(k)}
    </span>
  );
}

export default function Teams({
  project, channels, activeChannel, activeRoster, sessions,
  onNewChannel, onSelectChannel, onStopChannel, onRemoveChannel,
}: {
  project: Project;
  channels: Channel[];
  activeChannel: Channel | null;
  activeRoster: TeamMember[];
  sessions: Session[];
  onNewChannel: (goal: string) => void;
  onSelectChannel: (id: string) => void;
  onStopChannel: (id: string) => void;
  onRemoveChannel: (id: string) => void;
}) {
  const [value, setValue] = useState("");

  // newest-first in the channel list (most recent conversation on top)
  const sortedChannels = [...channels].sort((a, b) => b.createdAt - a.createdAt);
  const runningCount = channels.filter((c) => c.status === "running").length;
  const noChannels = channels.length === 0;
  const activeRunning = activeChannel?.status === "running";

  const nameOf = (key: string) => activeRoster.find((m) => m.key === key)?.name || key;
  const harnessOfKey = (key: string) => activeRoster.find((m) => m.key === key)?.harness || "codex";

  const groups: Record<Presence, TeamMember[]> = { working: [], online: [], idle: [] };
  for (const m of activeRoster) groups[presenceOf(m.key, activeChannel, sessions)].push(m);
  const workingMembers = groups.working.length;

  function brief() {
    const t = value.trim();
    if (!t) return;
    setValue("");
    onNewChannel(t);
  }

  return (
    <div className="tm">
      {/* ---- channels sidebar ---- */}
      <div className="tm-side">
        <div className="tm-side-head">
          <div className="tm-side-titles">
            <b>{project.name}</b>
            <span className="tm-experimental" title="Teams mode is a spike: agents don't self-stop reliably, turn-cap is mandatory, roster editing is hardcoded.">#experimental</span>
          </div>
          <span className={"tm-work" + (runningCount ? " on" : "")}>
            <i /> {runningCount ? `${runningCount} conversation${runningCount === 1 ? "" : "s"} en cours` : "idle"}
          </span>
        </div>
        <div className="tm-side-scroll">
          <div className="tm-group">
            <span>Channels</span>
            <span className="tm-group-add" title="New conversation — type the goal in the composer below">+</span>
          </div>
          {sortedChannels.length === 0 ? (
            <div className="tm-empty-chan">no conversation yet</div>
          ) : sortedChannels.map((c) => (
            <div key={c.id}
              className={"tm-chan" + (c.id === activeChannel?.id ? " active" : "")}
              onClick={() => onSelectChannel(c.id)}>
              <span className="h">#</span>
              <span className="tm-chan-name">{c.name}</span>
              {c.status === "running" && <span className="tm-live" title="live" />}
              {c.status === "done" && c.stopped === "cap" && <span className="tm-cap" title="capped">⏸</span>}
              <button className="tm-chan-x" title="Remove conversation"
                onClick={(e) => { e.stopPropagation(); onRemoveChannel(c.id); }}>✕</button>
            </div>
          ))}

        </div>
        <div className="tm-you"><span className="tm-av you">PB</span><div><b>You</b><small>manager</small></div></div>
      </div>

      {/* ---- main ---- */}
      <div className="tm-main">
        <div className="tm-head">
          {activeChannel ? (
            <>
              <div className="tm-ttl"><span className="h">#</span> {activeChannel.name}</div>
              <div className="tm-topic"><b>Goal:</b> {activeChannel.goal}</div>
              <span className="tm-spacer" />
              {activeRunning && (
                <button className="tm-stop" onClick={() => onStopChannel(activeChannel.id)} title="Stop this conversation">■ stop</button>
              )}
            </>
          ) : (
            <>
              <div className="tm-ttl">your team's server</div>
              <span className="tm-spacer" />
            </>
          )}
        </div>

        <div className="tm-stream">
          {noChannels ? (
            <div className="tm-intro">
              <div className="tm-intro-ic">⬡</div>
              <h3>Your AI team's project</h3>
              <p>Brief the <b>Chief of Staff</b> below with a goal. Each goal opens a new
                <b> conversation</b> (channel) — the CoS decides who to call, delegates, and
                hands you back one synthesized answer. You can run several in parallel.</p>
            </div>
          ) : !activeChannel ? (
            <div className="tm-intro">
              <p>Pick a conversation on the left, or start a new one below.</p>
            </div>
          ) : (
            <>
              {activeChannel.transcript.map((t) => {
                const isDelegation = t.key === CHIEF && !t.synthesis && t.mentions.length > 0;
                return (
                  <div key={t.tid}
                    className={"tm-msg" + (t.synthesis ? " synth" : "")}
                    style={vars({ "--c": accentOf(t.key, t.harness) })}>
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

              {activeRunning && activeChannel.activeKey && (
                <div className="tm-typing" style={vars({ "--c": accentOf(activeChannel.activeKey, harnessOfKey(activeChannel.activeKey)) })}>
                  <Avatar k={activeChannel.activeKey} harness={harnessOfKey(activeChannel.activeKey)} working />
                  <div className="tm-bubble">
                    <span className="tm-dots"><i /><i /><i /></span>
                    {activeChannel.activeKey === CHIEF ? "Chief of Staff is deciding…" : `${nameOf(activeChannel.activeKey)} is working…`}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="tm-compose">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") brief(); }}
            placeholder={noChannels
              ? "Brief your Chief of Staff to start — give a goal…"
              : "Open a new conversation — give the team a goal…"}
          />
          <button className="tm-run" onClick={brief} title="Open a new conversation">▶</button>
        </div>
      </div>

      {/* ---- members rail ---- */}
      <div className="tm-members">
        <div className="tm-mh">
          <b>Équipe — {activeRoster.length}</b>
          <small>{workingMembers} working · {groups.online.length} online · {groups.idle.length} idle</small>
        </div>
        <div className="tm-mscroll">
          {(["working", "online", "idle"] as Presence[]).map((g) =>
            groups[g].length ? (
              <div key={g}>
                <div className="tm-mgroup">{g === "working" ? "En train de bosser" : g === "online" ? "En ligne" : "Idle"} — {groups[g].length}</div>
                {groups[g].map((m) => {
                  const sid = activeChannel?.sessionIds[m.key];
                  return (
                    <div key={m.key} className={"tm-member " + g}
                      style={vars({ "--c": accentOf(m.key, m.harness) })}
                      onClick={() => sid && onSelectChannel(activeChannel!.id)}>
                      <Avatar k={m.key} harness={m.harness} size={36} working={g === "working"} />
                      <div className="tm-minfo">
                        <b>{m.name}{m.key === CHIEF && <span className="tm-crown">♦</span>}</b>
                        <small>{m.key === CHIEF ? "orchestrator" : m.role} · {H[m.harness]?.label || m.harness}</small>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null
          )}
        </div>
        <div className="tm-guard">cost guard · stops after the goal, capped at 5 delegations per conversation</div>
      </div>
    </div>
  );
}
