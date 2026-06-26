// The Vault overlay — the boss's window into everything the experts know and
// produce. Two panes, same fullscreen treatment as Cabinet: left a file tree
// over $SPLIT_VAULT (scopes → indexes → facts/deliverables), right the
// selected file in the TipTap markdown editor (same component as the
// artifact viewer, so editing a memory feels exactly like editing a
// deliverable). The filesystem is the source of truth on both sides: a save
// here is what the agents read at their next session boot.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Editor } from "@tiptap/react";
import { MarkdownEditor } from "../conversation/MarkdownEditor";
import "./vault.css";

interface VaultNode {
  name: string;
  path: string;
  rel: string;
  dir: boolean;
  size: number;
  mtime: number;
  description: string | null;
  children: VaultNode[];
}

interface VaultPayload {
  root: string;
  tree: VaultNode[];
}

interface FilePayload {
  kind: "text" | "image" | "pdf" | "audio" | "video" | "binary";
  size: number;
  mime?: string;
  content?: string;
  tooLarge?: boolean;
}

// "3 j" / "5 sem" age chip + a stale flag past three weeks — memories are
// point-in-time observations, the chip is the "verify before trusting" cue.
function ageOf(mtime: number): { label: string; stale: boolean } {
  if (!mtime) return { label: "", stale: false };
  const days = Math.max(0, Math.floor(Date.now() / 1000 - mtime) / 86400);
  if (days < 1) return { label: "auj.", stale: false };
  if (days < 7) return { label: `${Math.floor(days)} j`, stale: false };
  const weeks = Math.floor(days / 7);
  return { label: `${weeks} sem`, stale: days > 21 };
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  selected,
  onSelect,
}: {
  node: VaultNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (rel: string) => void;
  selected: string | null;
  onSelect: (node: VaultNode) => void;
}) {
  const open = expanded.has(node.rel);
  const age = ageOf(node.mtime);
  const isIndex = !node.dir && (node.name === "INDEX.md" || node.name === "MEMORY.md");
  return (
    <>
      <div
        className={
          "vault-row" +
          (selected === node.rel ? " on" : "") +
          (node.dir ? " is-dir" : "")
        }
        style={{ paddingLeft: 10 + depth * 16 }}
        title={node.description ?? node.rel}
        onClick={() => (node.dir ? onToggle(node.rel) : onSelect(node))}
      >
        <span className={"vault-chev" + (open ? " open" : "")}>
          {node.dir ? "▸" : ""}
        </span>
        <span className="vault-ic">
          {node.dir ? (open ? "📂" : "🗂") : isIndex ? "🧭" : node.name.endsWith(".md") ? "🧠" : "📄"}
        </span>
        <span className="vault-name">{node.name}</span>
        {!node.dir && age.label && (
          <span className={"vault-age" + (age.stale ? " stale" : "")}>
            {age.stale ? `${age.label} ⚠` : age.label}
          </span>
        )}
      </div>
      {node.dir && open &&
        node.children.map((c) => (
          <TreeRow
            key={c.rel}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

export function VaultOverlay({ onClose }: { onClose: () => void }) {
  const [vault, setVault] = useState<VaultPayload | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<VaultNode | null>(null);
  const [payload, setPayload] = useState<FilePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Bumped on cancel to remount the editor on the on-disk content.
  const [editGen, setEditGen] = useState(0);
  const tiptapRef = useRef<Editor | null>(null);

  const refreshTree = useCallback(async (selectIndex: boolean) => {
    try {
      const raw = await invoke<string>("vault_tree");
      const data = JSON.parse(raw) as VaultPayload;
      setVault(data);
      // First load: open the top-level dirs and land on INDEX.md so the
      // overlay opens on the scope list, not on a blank pane.
      if (selectIndex) {
        setExpanded(new Set(data.tree.filter((n) => n.dir).map((n) => n.rel)));
        const index = data.tree.find((n) => !n.dir && n.name === "INDEX.md");
        if (index) setSel(index);
      }
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    void refreshTree(true);
  }, [refreshTree]);

  // Load the selected file's content.
  useEffect(() => {
    if (!sel) return;
    setPayload(null);
    setErr(null);
    setSaved(false);
    invoke<string>("read_artifact", { path: sel.path })
      .then((raw) => setPayload(JSON.parse(raw) as FilePayload))
      .catch((e) => setErr(String(e)));
  }, [sel]);

  // Esc closes the overlay — except while the markdown editor has focus
  // (there Esc is "cancel edit", handled by the editor itself).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement;
      if (el && el.closest(".vault-doc .md-shell")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onToggle = useCallback((rel: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rel)) next.delete(rel);
      else next.add(rel);
      return next;
    });
  }, []);

  const isMd = !!sel && sel.name.endsWith(".md");
  const isHtml = !!sel && /\.html?$/.test(sel.name);

  const saveMd = useCallback(async () => {
    if (!sel || !tiptapRef.current) return;
    const storage = tiptapRef.current.storage as {
      markdown?: { getMarkdown(): string };
    };
    const md = storage.markdown?.getMarkdown();
    if (md === undefined) return;
    try {
      await invoke("write_artifact", { path: sel.path, content: md });
      // Keep the in-memory payload in sync so a later cancel (which
      // remounts the editor on `payload.content`) reverts to the saved
      // state, not to the pre-save read.
      setPayload((p) => (p ? { ...p, content: md } : p));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
      void refreshTree(false);
    } catch (e) {
      setErr(String(e));
    }
  }, [sel, refreshTree]);

  const onEditorReady = useCallback((ed: Editor) => {
    tiptapRef.current = ed;
  }, []);
  const onEditorCancel = useCallback(() => setEditGen((g) => g + 1), []);

  const age = sel ? ageOf(sel.mtime) : null;
  const rootLabel = useMemo(
    () => (vault ? vault.root.replace(/^\/Users\/[^/]+/, "~") : ""),
    [vault],
  );

  // Create a note (default into notes/) or a project folder. window.prompt
  // keeps it dependency-free — same convention as the editor's link dialog.
  const createNote = useCallback(async () => {
    if (!vault) return;
    const today = new Date().toISOString().slice(0, 10);
    const name = window.prompt(
      "Nouveau fichier (chemin relatif au vault)",
      `notes/${today}-note.md`,
    );
    if (!name) return;
    try {
      await invoke("vault_create", { rel: name, dir: false });
      await refreshTree(false);
      const rel = name.replace(/^\/+|\/+$/g, "");
      setSel({
        name: rel.split("/").pop() ?? rel,
        path: `${vault.root}/${rel}`,
        rel,
        dir: false,
        size: 0,
        mtime: Math.floor(Date.now() / 1000),
        description: null,
        children: [],
      });
    } catch (e) {
      setErr(String(e));
    }
  }, [vault, refreshTree]);

  const createProject = useCallback(async () => {
    const slug = window.prompt("Slug du nouveau projet (projects/<slug>/)", "");
    if (!slug) return;
    try {
      await invoke("vault_create", { rel: `projects/${slug.trim()}`, dir: true });
      await refreshTree(false);
      setExpanded((prev) => new Set(prev).add("projects"));
    } catch (e) {
      setErr(String(e));
    }
  }, [refreshTree]);

  const deleteSelected = useCallback(async () => {
    if (!sel) return;
    if (!window.confirm(`Supprimer ${sel.rel} ? (définitif)`)) return;
    try {
      await invoke("vault_delete", { rel: sel.rel });
      setSel(null);
      setPayload(null);
      await refreshTree(false);
    } catch (e) {
      setErr(String(e));
    }
  }, [sel, refreshTree]);

  return (
    <div className="vault-overlay">
      <div className="vault-rail">
        <div className="vault-rail-head">
          <span className="vault-title">🗃️ Vault</span>
          <span className="vault-root" title={vault?.root}>{rootLabel}</span>
        </div>
        <div className="vault-tree">
          {vault?.tree.map((n) => (
            <TreeRow
              key={n.rel}
              node={n}
              depth={0}
              expanded={expanded}
              onToggle={onToggle}
              selected={sel?.rel ?? null}
              onSelect={setSel}
            />
          ))}
        </div>
        <div className="vault-rail-foot">
          <button className="vault-foot-btn" onClick={() => void createNote()} title="Créer un fichier dans le vault">
            ＋ note
          </button>
          <button className="vault-foot-btn" onClick={() => void createProject()} title="Créer projects/<slug>/ (MEMORY.md seedé)">
            ＋ projet
          </button>
          <button
            className="vault-foot-btn"
            onClick={() => vault && invoke("reveal_artifact", { path: vault.root })}
            title="Open the vault folder in Finder"
          >
            Finder
          </button>
        </div>
      </div>

      <div className="vault-main">
        <div className="vault-head">
          {sel ? (
            <>
              <div className="vault-head-meta">
                <b>{sel.name}</b>
                {sel.description && <small>{sel.description}</small>}
              </div>
              {age?.label && (
                <span className={"vault-age big" + (age.stale ? " stale" : "")}>
                  {age.stale ? `${age.label} ⚠ stale` : age.label}
                </span>
              )}
              {isMd && (
                <button className="vault-save" onClick={() => void saveMd()}>
                  {saved ? "Saved ✓" : "Save"}
                </button>
              )}
              <button className="vault-close" onClick={() => void deleteSelected()} title="Supprimer ce fichier">🗑</button>
            </>
          ) : (
            <div className="vault-head-meta">
              <b>Vault</b>
              <small>tout ce que tes experts savent et produisent</small>
            </div>
          )}
          <button className="vault-close" onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        <div className="vault-doc">
          {err && <div className="vault-empty">⚠ {err}</div>}
          {!err && sel && !payload && <div className="vault-empty">…</div>}
          {!err && !sel && (
            <div className="vault-empty">
              Choisis un fichier dans l'arbre — l'index d'un projet, un fait,
              un livrable.
            </div>
          )}
          {!err && sel && payload?.kind === "text" && isMd && (
            <MarkdownEditor
              key={sel.path + ":" + editGen}
              initial={payload.content ?? ""}
              onReady={onEditorReady}
              onSave={() => void saveMd()}
              onCancel={onEditorCancel}
            />
          )}
          {!err && sel && payload?.kind === "text" && !isMd && isHtml && (
            // Same sandbox as the ArtifactViewer preview: vault HTML is the
            // user's own expert-produced deliverables (interactive dashboards,
            // games), so scripts must run, storage must have a real origin,
            // and pointer lock must be grantable (first-person games gate on
            // it — without the token the "click to play" silently no-ops).
            <iframe
              className="vault-html"
              sandbox="allow-scripts allow-same-origin allow-pointer-lock"
              srcDoc={payload.content ?? ""}
              title={sel.name}
            />
          )}
          {!err && sel && payload?.kind === "text" && !isMd && !isHtml && (
            <pre className="vault-pre">{payload.content}</pre>
          )}
          {!err && sel && payload?.kind === "image" && (
            <img className="vault-img" src={payload.content} alt={sel.name} />
          )}
          {!err && sel && payload?.kind === "pdf" && (
            <iframe className="vault-html" src={payload.content} title={sel.name} />
          )}
          {!err && sel && payload?.kind === "audio" && (
            <div className="vault-media">
              <audio className="vault-audio" src={convertFileSrc(sel.path)} controls preload="metadata" />
            </div>
          )}
          {!err && sel && payload?.kind === "video" && (
            <div className="vault-media">
              <video className="vault-video" src={convertFileSrc(sel.path)} controls preload="metadata" />
            </div>
          )}
          {!err && sel && payload?.kind === "binary" && (
            <div className="vault-empty">
              {payload.tooLarge ? "Fichier trop volumineux pour l'aperçu." : "Aperçu indisponible pour ce format."}
              <button
                className="vault-foot-btn"
                onClick={() => invoke("reveal_artifact", { path: sel.path })}
              >
                Ouvrir avec l'app par défaut
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
