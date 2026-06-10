import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { composeTurn, type Attachment } from "./util";
import { isActiveExpert, type ExpertMap } from "./experts";

// The shared composer brain: the input value + attachments, the three
// type-ahead pickers (`@` expert mention, `#` vault project, `/` slash
// command), the pinned-project + attachment chips, and `takeTurn()` — the
// one consumer of all that state. The same instance backs both the home
// composer and the focused conversation's reply input (one draft at a time,
// same as before the extraction); App.tsx wires the results into Composer /
// Conversation and keeps launch/reply/submit + Escape routing.
export function useComposer(opts: {
  experts: ExpertMap;
  // True while a session is focused — the `#project` picker and its chip are
  // home-composer-only (the pin shapes the persona projected at session
  // START, so it's meaningless on a reply input).
  inConversation: boolean;
  // Arm this expert for the next session (App owns the slug state).
  armExpert: (slug: string) => void;
}) {
  const { experts, inConversation, armExpert } = opts;

  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [menu, setMenu] = useState<"engine" | "expert" | "slash" | "project" | null>(null);
  // `@` type-ahead state: when the cursor sits inside an `@…` mention with no
  // whitespace between the `@` and the cursor, this holds the text typed after
  // the `@` (so the expert dropdown can filter). null = not in mention mode.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  // Query after the `/` at the cursor — null when no slash is active. Drives
  // the slash-command palette in the focused conversation composer.
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  // `#` type-ahead state (home composer only): query after the `#` at the
  // cursor, null when inactive. Drives the vault-project picker.
  const [projectQuery, setProjectQuery] = useState<string | null>(null);
  // Vault project pinned on the NEXT session (the `#project` chip). Per
  // session-start only: the persona is projected once, so a pin can't change
  // mid-session.
  const [pinnedProject, setPinnedProject] = useState<string | null>(null);
  // Project slugs read from the vault's projects/ folder, refreshed each
  // time the `#` menu opens.
  const [vaultProjects, setVaultProjects] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  const expertEntries = useMemo(() => Object.entries(experts).filter(([slug]) => isActiveExpert(experts, slug)), [experts]);

  // The expert list shown in the dropdown: full when the menu was opened by
  // clicking the chip; case-insensitive prefix-filtered by `mentionQuery` when
  // the menu was triggered by typing `@…` in the input.
  const filteredExperts = useMemo(() => {
    if (mentionQuery == null || mentionQuery === "") return expertEntries;
    const q = mentionQuery.toLowerCase();
    return expertEntries.filter(([, x]) => x.label.toLowerCase().startsWith(q));
  }, [expertEntries, mentionQuery]);

  // Refresh the vault's project list each time the `#` picker opens — the
  // vault changes underneath us (agents create projects mid-flight).
  useEffect(() => {
    if (menu !== "project") return;
    invoke<string>("vault_tree")
      .then((raw) => {
        const data = JSON.parse(raw) as { tree: { name: string; dir: boolean; children: { name: string; dir: boolean }[] }[] };
        const projects = data.tree.find((n) => n.dir && n.name === "projects");
        setVaultProjects((projects?.children ?? []).filter((c) => c.dir).map((c) => c.name));
      })
      .catch(() => setVaultProjects([]));
  }, [menu]);

  const filteredProjects = useMemo(() => {
    if (projectQuery == null || projectQuery === "") return vaultProjects;
    const q = projectQuery.toLowerCase();
    return vaultProjects.filter((p) => p.toLowerCase().startsWith(q));
  }, [vaultProjects, projectQuery]);

  // Detect an active `@…` mention at the cursor and sync menu state. Called
  // from every input's onChange (the home composer and the conv reply input).
  function handleInputChange(newValue: string, cursorPos: number | null) {
    setValue(newValue);
    const cursor = cursorPos ?? newValue.length;
    // Walk back from the cursor until whitespace or start; if we hit `@` or `/`
    // first, we're in a mention / slash command. Slash only activates at the
    // very start of the input (ACP slash commands are first-token, like in IRC).
    let i = cursor - 1;
    while (i >= 0 && !/\s/.test(newValue[i])) {
      if (newValue[i] === "@") {
        setMentionQuery(newValue.slice(i + 1, cursor));
        setMenu("expert");
        if (slashQuery !== null) { setSlashQuery(null); }
        if (projectQuery !== null) { setProjectQuery(null); }
        return;
      }
      // `#project` picker — home composer only: the pin shapes the persona
      // projected at session START, so it's meaningless on a focused
      // session's reply input.
      if (newValue[i] === "#" && !inConversation) {
        setProjectQuery(newValue.slice(i + 1, cursor));
        setMenu("project");
        if (mentionQuery !== null) { setMentionQuery(null); }
        if (slashQuery !== null) { setSlashQuery(null); }
        return;
      }
      if (newValue[i] === "/" && i === 0) {
        setSlashQuery(newValue.slice(i + 1, cursor));
        setMenu("slash");
        if (mentionQuery !== null) { setMentionQuery(null); }
        if (projectQuery !== null) { setProjectQuery(null); }
        return;
      }
      i--;
    }
    // Cursor is not inside a mention or slash command — close any open menus.
    if (mentionQuery !== null) {
      setMentionQuery(null);
      if (menu === "expert") setMenu(null);
    }
    if (projectQuery !== null) {
      setProjectQuery(null);
      if (menu === "project") setMenu(null);
    }
    if (slashQuery !== null) {
      setSlashQuery(null);
      if (menu === "slash") setMenu(null);
    }
  }

  // Apply an expert pick. If a mention is active, replace `@<query>` in the
  // input with `@<ExpertLabel> ` and restore the cursor after the inserted
  // text. Otherwise just arm this expert as the default for the next session
  // (the old chip-click behaviour).
  function pickExpert(slug: string) {
    const exp = experts[slug];
    armExpert(slug);
    setMenu(null);
    const wasMention = mentionQuery !== null;
    setMentionQuery(null);
    if (!exp || !wasMention) {
      inputRef.current?.focus();
      return;
    }
    const input = inputRef.current;
    const cursor = input?.selectionStart ?? value.length;
    // Find the `@` that opened the mention (same walk-back as above).
    let i = cursor - 1;
    while (i >= 0 && !/\s/.test(value[i]) && value[i] !== "@") i--;
    if (i < 0 || value[i] !== "@") {
      inputRef.current?.focus();
      return;
    }
    const before = value.slice(0, i);
    const after = value.slice(cursor);
    const inserted = `@${exp.label} `;
    const next = before + inserted + after;
    setValue(next);
    const newCursor = before.length + inserted.length;
    setTimeout(() => {
      input?.focus();
      input?.setSelectionRange(newCursor, newCursor);
    }, 0);
  }

  // Apply a project pick: strip the `#<query>` from the input (the pin lives
  // in the chip, not in the prompt text) and arm `pinnedProject` for the next
  // session start.
  function pickProject(slug: string) {
    setMenu(null);
    const wasHash = projectQuery !== null;
    setProjectQuery(null);
    setPinnedProject(slug);
    if (!wasHash) {
      inputRef.current?.focus();
      return;
    }
    const input = inputRef.current;
    const cursor = input?.selectionStart ?? value.length;
    // Find the `#` that opened the picker (same walk-back as above).
    let i = cursor - 1;
    while (i >= 0 && !/\s/.test(value[i]) && value[i] !== "#") i--;
    if (i < 0 || value[i] !== "#") {
      inputRef.current?.focus();
      return;
    }
    const before = value.slice(0, i);
    const after = value.slice(cursor);
    const next = (before + after).replace(/\s{2,}/g, " ");
    setValue(next);
    const newCursor = before.length;
    setTimeout(() => {
      input?.focus();
      input?.setSelectionRange(newCursor, newCursor);
    }, 0);
  }

  // Fill the composer with a slash command and refocus (used by the
  // Conversation slash palette).
  function pickCommand(name: string) {
    setValue(`/${name} `);
    setSlashQuery(null);
    setMenu(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  // While the @-mention (or #-project) picker is open, Enter picks the top
  // filtered entry instead of submitting the brief. Returns true when the
  // keystroke was consumed; the caller's onKey falls through otherwise.
  function handlePickerEnter(e: React.KeyboardEvent): boolean {
    if (e.key !== "Enter") return false;
    if (menu === "expert" && mentionQuery !== null && filteredExperts.length > 0) {
      e.preventDefault();
      pickExpert(filteredExperts[0][0]);
      return true;
    }
    if (menu === "project" && projectQuery !== null && filteredProjects.length > 0) {
      e.preventDefault();
      pickProject(filteredProjects[0]);
      return true;
    }
    return false;
  }

  // Close every picker + the menu (Escape, or after a send).
  function closePickers() {
    setMenu(null);
    setMentionQuery(null);
    setSlashQuery(null);
    setProjectQuery(null);
  }

  // Append files dropped on the window (App's drag-drop listener feeds this).
  function addAttachments(files: Attachment[]) {
    if (files.length) setAttachments((p) => [...p, ...files]);
    inputRef.current?.focus();
  }

  const canSubmit = !!value.trim() || attachments.length > 0;

  // Compose the pending draft into a turn and reset the composer. The pin is
  // only consumed on a session START (`consumeProject`) — a reply while a pin
  // is armed leaves it waiting for the next home launch.
  function takeTurn(o?: { consumeProject?: boolean }): { turn: ReturnType<typeof composeTurn>; project?: string } | null {
    const t = value.trim();
    if (!t && !attachments.length) return null;
    const turn = composeTurn(t, attachments);
    setValue("");
    setAttachments([]);
    setMenu(null);
    let project: string | undefined;
    if (o?.consumeProject) {
      project = pinnedProject ?? undefined;
      setPinnedProject(null);
    }
    return { turn, project };
  }

  // shared chips: the pinned vault project (home composer only) + attachments
  const projectChip = pinnedProject && !inConversation ? (
    <span className="chip chip-project" title={`Pinned vault project — this session writes to projects/${pinnedProject}/`}>
      #{pinnedProject}
      <button className="xbtn" onMouseDown={(e) => { e.preventDefault(); setPinnedProject(null); }}>✕</button>
    </span>
  ) : null;
  const chips = (
    <>
      {projectChip}
      {attachments.map((a, i) => (
        <span key={i} className="chip">
          📎 {a.name}
          <button className="xbtn" onMouseDown={(e) => { e.preventDefault(); setAttachments((p) => p.filter((_, k) => k !== i)); }}>✕</button>
        </span>
      ))}
    </>
  );

  return {
    value, menu, setMenu, slashQuery, inputRef, chips, canSubmit,
    filteredExperts, filteredProjects,
    handleInputChange, pickExpert, pickProject, pickCommand,
    handlePickerEnter, closePickers, addAttachments, takeTurn,
  };
}
