import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Editor } from "@tiptap/react";
import { MarkdownEditor } from "./MarkdownEditor";
import type { Artifact } from "../shared/events";

// Injected into the HTML edit iframe. Makes text-bearing elements
// contentEditable, paints a discreet outline on hover/focus, exposes
// postMessage hooks so the parent can extract the cleaned HTML, and
// forwards ⌘S / Esc back to the parent. All injected nodes carry
// `data-split-edit` so they can be stripped on extract — what we write
// back to disk is the agent's HTML with text mutations, nothing else.
const HTML_EDIT_INJECTION = `
<style data-split-edit="1">
  [data-split-edit-area] { cursor: text; }
  [data-split-edit-area]:hover { outline: 1px dashed rgba(255,107,107,0.45); outline-offset: 2px; }
  [data-split-edit-area]:focus { outline: 1.5px solid rgba(255,107,107,0.85); outline-offset: 2px; }
</style>
<script data-split-edit="1">
(function(){
  const ALWAYS = "h1,h2,h3,h4,h5,h6,p,li,td,th,figcaption,blockquote,dd,dt,summary";
  const MAYBE  = "div,footer,section,header,span,strong,em,b,i,a";
  const BLOCK = new Set(["DIV","SECTION","ARTICLE","HEADER","FOOTER","ASIDE","NAV","MAIN","UL","OL","TABLE","TR","TBODY","THEAD","FORM","FIGURE","P","H1","H2","H3","H4","H5","H6","LI","BLOCKQUOTE","PRE"]);
  function isTextLeaf(el){
    for (const c of el.children) if (BLOCK.has(c.tagName)) return false;
    for (const n of el.childNodes) if (n.nodeType===3 && n.textContent.trim()) return true;
    return false;
  }
  function mark(el){ el.setAttribute("contenteditable","true"); el.setAttribute("data-split-edit-area","1"); }
  document.querySelectorAll(ALWAYS).forEach(mark);
  document.querySelectorAll(MAYBE).forEach(el => { if (isTextLeaf(el)) mark(el); });
  function extract(){
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll("[data-split-edit]").forEach(n => n.remove());
    clone.querySelectorAll("[data-split-edit-area]").forEach(el => {
      el.removeAttribute("contenteditable");
      el.removeAttribute("data-split-edit-area");
    });
    return "<!DOCTYPE html>\\n" + clone.outerHTML;
  }
  window.addEventListener("message", (e) => {
    if (e.data === "extract") parent.postMessage({ split: "html", value: extract() }, "*");
  });
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); parent.postMessage({ split: "save" }, "*"); }
    if (e.key === "Escape") { parent.postMessage({ split: "cancel" }, "*"); }
  });
  parent.postMessage({ split: "ready" }, "*");
})();
</script>`;

// Server-side classification echoed back by `read_artifact`. "text" is rendered
// by extension (md → markdown, csv → table, html → iframe, anything else → code
// block); "image" / "pdf" use the embedded data URL; "binary" / fallthrough →
// metadata card with an "open in default app" button.
type Payload =
  | { kind: "text"; size: number; content: string }
  | { kind: "image" | "pdf"; size: number; mime: string; content: string }
  | { kind: "binary"; size: number; mime: string; tooLarge?: boolean };

function extOf(rel: string): string {
  const dot = rel.lastIndexOf(".");
  return dot >= 0 ? rel.slice(dot + 1).toLowerCase() : "";
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function CsvTable({ text }: { text: string }) {
  // Tiny CSV parser — handles quoted fields with embedded commas/newlines.
  // Good enough for agent-generated CSVs (RFC4180-ish). Truncates to 500
  // rows to keep the DOM cheap.
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length && rows.length < 500) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQuotes = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { cur.push(field); field = ""; i++; continue; }
    if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    field += c; i++;
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  if (!rows.length) return <pre className="art-pre">{text}</pre>;
  const [head, ...body] = rows;
  return (
    <div className="art-csv-wrap">
      <table className="art-csv">
        <thead><tr>{head.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
        <tbody>{body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function renderText(rel: string, content: string) {
  const ext = extOf(rel);
  if (ext === "md" || ext === "markdown") {
    return <div className="art-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>;
  }
  if (ext === "csv" || ext === "tsv") return <CsvTable text={content} />;
  if (ext === "html" || ext === "htm") {
    // Render inside a sandboxed srcdoc iframe so the agent's HTML can't
    // touch the host UI but still renders styles/scripts in isolation.
    return <iframe className="art-iframe" sandbox="allow-scripts" srcDoc={content} title={rel} />;
  }
  // Everything else: monospaced. The .art-pre class also wraps long lines.
  return <pre className="art-pre">{content}</pre>;
}

// Extensions the in-app editor handles. .md is the primary use case (the
// persona steers agents to it); the rest are escape hatches for last-mile
// tweaks on whatever else the agent might produce.
const EDITABLE_EXTS = new Set([
  "md", "markdown", "txt", "log",
  "html", "htm", "xml", "svg",
  "json", "yaml", "yml", "toml", "ini", "cfg", "conf", "env",
  "css", "scss", "sass",
  "csv", "tsv", "sql",
  "rs", "ts", "tsx", "js", "jsx", "py", "go", "c", "cpp", "h", "hpp",
  "java", "kt", "swift", "rb", "php", "sh", "bash", "zsh", "fish",
]);

// Formats Split renders visually inside the pane → printable to PDF via the
// browser print API. Binary fallbacks and code dumps can technically also
// be printed but the result is rarely useful, so we hide the button.
const PRINTABLE_EXTS = new Set([
  "md", "markdown", "html", "htm", "csv", "tsv",
  "png", "jpg", "jpeg", "gif", "webp", "svg",
]);

export function ArtifactViewer({ artifact }: { artifact: Artifact }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Edit mode (only meaningful when payload.kind === "text"). `editBuffer`
  // is the in-flight content for the textarea path; HTML edits live in the
  // iframe's DOM and are pulled out on save via postMessage.
  const [editing, setEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState("");
  const [saving, setSaving] = useState(false);
  const editIframeRef = useRef<HTMLIFrameElement | null>(null);
  // Live TipTap instance for `.md` edits. Held by the parent so the save
  // flow can pull `getMarkdown()` without re-rendering on every keystroke.
  const tiptapRef = useRef<Editor | null>(null);

  // Re-fetch whenever the file identity OR its mtime/size changes — the
  // agent may overwrite the same path between turns and we want the viewer
  // to refresh, not stick to the first read. Also exits edit mode so we
  // don't render a stale buffer against a fresh agent edit.
  useEffect(() => {
    let cancelled = false;
    setPayload(null);
    setErr(null);
    setEditing(false);
    invoke<string>("read_artifact", { path: artifact.path })
      .then((raw) => {
        if (cancelled) return;
        try { setPayload(JSON.parse(raw) as Payload); }
        catch (e) { setErr(String(e)); }
      })
      .catch((e) => { if (!cancelled) setErr(String(e)); });
    return () => { cancelled = true; };
  }, [artifact.path, artifact.mtime, artifact.size]);

  const reveal = () => invoke("reveal_artifact", { path: artifact.path });

  const ext = extOf(artifact.rel);
  const isText = payload?.kind === "text";
  const isHtml = ext === "html" || ext === "htm";
  const isMarkdown = ext === "md" || ext === "markdown";
  // Markdown and HTML open straight into the editor — no pencil-button
  // detour. The other text types (code, json, csv…) keep the pencil-then-
  // textarea toggle because their "edit" surface (raw monospace) is much
  // noisier than their preview (syntax-aware, table, etc.) and the user
  // usually wants to read first.
  const directEdit = isText && (isMarkdown || isHtml);
  const inEditMode = directEdit || editing;
  const canEdit = isText && EDITABLE_EXTS.has(ext) && !directEdit;
  const canExport = PRINTABLE_EXTS.has(ext) || payload?.kind === "image";

  function startEdit() {
    if (!isText) return;
    setEditBuffer((payload as { content: string }).content);
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
    setEditBuffer("");
  }
  // Round-trips the cleaned HTML out of the edit iframe. Resolves with the
  // HTML the in-page injection produced, or rejects on a 3s timeout (which
  // really only happens if the iframe never loaded / script was blocked).
  function extractEditedHtml(): Promise<string> {
    return new Promise((resolve, reject) => {
      const iframe = editIframeRef.current;
      const win = iframe?.contentWindow;
      if (!iframe || !win) { reject(new Error("editor iframe unavailable")); return; }
      const onMessage = (e: MessageEvent) => {
        if (e.source !== win) return;
        const d = e.data as { split?: string; value?: string };
        if (d && d.split === "html" && typeof d.value === "string") {
          window.removeEventListener("message", onMessage);
          resolve(d.value);
        }
      };
      window.addEventListener("message", onMessage);
      win.postMessage("extract", "*");
      setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("HTML extract timed out"));
      }, 3000);
    });
  }
  async function saveEdit() {
    setSaving(true);
    try {
      let contentToSave: string;
      if (isHtml && inEditMode) {
        contentToSave = await extractEditedHtml();
      } else if (isMarkdown && inEditMode && tiptapRef.current) {
        // tiptap-markdown stores the serializer on the editor's storage map.
        // `getMarkdown()` is what makes the round-trip lossless — we never
        // persist ProseMirror JSON to disk, only true markdown. The cast
        // is needed because tiptap-markdown doesn't ship a TS augmentation
        // for `Editor.storage`.
        const md = tiptapRef.current.storage as { markdown?: { getMarkdown(): string } };
        const fallback = editBuffer || (payload as { content: string } | null)?.content || "";
        contentToSave = md.markdown?.getMarkdown() ?? fallback;
      } else {
        contentToSave = editBuffer;
      }
      await invoke("write_artifact", { path: artifact.path, content: contentToSave });
      // The on-disk file now matches what we wrote; mirror that into payload
      // so the preview re-renders without a round-trip. The runner's snapshot
      // will catch up on the next agent turn (emits a `modified` event
      // that the reducer upserts — harmless duplicate).
      setPayload({ kind: "text", size: contentToSave.length, content: contentToSave });
      // Direct-edit types stay in edit mode after save — there's no preview
      // to fall back to. The toggle-based types return to read view.
      if (!directEdit) setEditing(false);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }
  // Cmd/Ctrl+S to save, Esc to cancel — standard editor shortcuts.
  function onEditKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); saveEdit(); return; }
    if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  }
  // Same shortcuts when the user is typing inside the edit iframe — its
  // key handler can't reach this component directly, so the injected
  // script forwards intent over postMessage. Active whenever an HTML
  // artifact is open (direct-edit) or has been opened via the pencil.
  useEffect(() => {
    if (!inEditMode || !isHtml) return;
    const iframe = editIframeRef.current;
    const onMessage = (e: MessageEvent) => {
      if (iframe?.contentWindow && e.source !== iframe.contentWindow) return;
      const d = e.data as { split?: string };
      if (!d?.split) return;
      if (d.split === "save") saveEdit();
      else if (d.split === "cancel") cancelEdit();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // saveEdit / cancelEdit close over latest state via closures captured
    // on each render — listener re-binding per render is intentional.
  });
  // PDF export = browser print dialog with our `@media print` rules
  // hiding everything except `.art-print-target`. macOS surfaces a "Save
  // as PDF" destination in the print sheet → one-click PDF, zero deps.
  function exportPdf() { window.print(); }
  // Stable callbacks for the TipTap markdown editor — passing inline
  // closures would re-run the editor's effects on every render.
  const onTiptapReady = useCallback((editor: Editor) => { tiptapRef.current = editor; }, []);
  const onTiptapSave = useCallback(() => { saveEdit(); }, [saveEdit]);
  const onTiptapCancel = useCallback(() => { cancelEdit(); }, [cancelEdit]);

  return (
    <div className="art-pane">
      <div className="art-head">
        <div className="art-title" title={artifact.path}>
          <span className="art-rel">{artifact.rel}</span>
          <span className="art-meta">{humanSize(artifact.size)}</span>
        </div>
        {directEdit && isText ? (
          <>
            <button className="iconbtn on" style={{ width: "auto", padding: "4px 10px" }}
                    onClick={saveEdit} disabled={saving} title="Save (⌘S)">{saving ? "Saving…" : "Save"}</button>
            {canExport && <button className="iconbtn" onClick={exportPdf} title="Export as PDF">⎙</button>}
            <button className="iconbtn" onClick={reveal} title="Open in default app">↗</button>
          </>
        ) : editing ? (
          <>
            <button className="iconbtn" style={{ width: "auto", padding: "4px 10px" }}
                    onClick={cancelEdit} disabled={saving} title="Discard changes (Esc)">Cancel</button>
            <button className="iconbtn on" style={{ width: "auto", padding: "4px 10px" }}
                    onClick={saveEdit} disabled={saving} title="Save (⌘S)">{saving ? "Saving…" : "Save"}</button>
          </>
        ) : (
          <>
            {canEdit && <button className="iconbtn" onClick={startEdit} title="Edit">✎</button>}
            {canExport && <button className="iconbtn" onClick={exportPdf} title="Export as PDF">⎙</button>}
            <button className="iconbtn" onClick={reveal} title="Open in default app">↗</button>
          </>
        )}
      </div>
      <div className="art-body art-print-target">
        {err && <div className="art-fallback">⚠ {err}</div>}
        {!payload && !err && <div className="art-fallback">loading…</div>}
        {payload && payload.kind === "text" && (
          inEditMode ? (
            isHtml ? (
              // Visual edit: render the agent's HTML in the same sandboxed
              // iframe used for preview, with our injection script appended
              // so text leaves become contentEditable. The user clicks on
              // titles / bullets / numbers and types — Save extracts the
              // mutated DOM, stripping our injected style/script/attrs.
              <iframe
                key={artifact.path + ":edit"}
                ref={editIframeRef}
                className="art-iframe"
                sandbox="allow-scripts"
                srcDoc={payload.content + HTML_EDIT_INJECTION}
                title={artifact.rel}
              />
            ) : isMarkdown ? (
              // WYSIWYG markdown: TipTap renders headings/lists/quotes the
              // way ReactMarkdown does in preview, but live-editable. On
              // save we pull `getMarkdown()` so the file on disk stays a
              // real `.md`, never ProseMirror JSON.
              //
              // For direct-edit (.md opens straight into the editor) the
              // `initial` prop reads from payload — there's no pencil-press
              // to seed editBuffer. The stable mount key per artifact path
              // means switching artifacts remounts the editor with fresh
              // content; agent overwrites of the same path don't blow
              // away in-flight user edits (intentional — disk is not the
              // source of truth while the user has the doc open).
              <MarkdownEditor
                key={artifact.path + ":md"}
                initial={directEdit ? payload.content : editBuffer}
                onReady={onTiptapReady}
                onSave={onTiptapSave}
                onCancel={onTiptapCancel}
              />
            ) : (
              <textarea
                className="art-edit"
                value={editBuffer}
                onChange={(e) => setEditBuffer(e.target.value)}
                onKeyDown={onEditKey}
                spellCheck={false}
                autoFocus
              />
            )
          ) : (
            renderText(artifact.rel, payload.content)
          )
        )}
        {payload && payload.kind === "image" && (
          <img className="art-img" src={payload.content} alt={artifact.rel} />
        )}
        {payload && payload.kind === "pdf" && (
          <iframe className="art-iframe" src={payload.content} title={artifact.rel} />
        )}
        {payload && payload.kind === "binary" && (
          <div className="art-fallback">
            <div className="art-fallback-title">{payload.tooLarge ? "Too large to preview" : "Binary file"}</div>
            <div className="art-fallback-meta">{payload.mime} · {humanSize(payload.size)}</div>
            <button className="iconbtn" style={{ width: "auto", padding: "4px 10px", marginTop: 8 }} onClick={reveal}>Open with default app</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ArtifactStrip({
  artifacts, activeArtifact, onPick,
}: {
  artifacts: Artifact[];
  activeArtifact: string | null;
  onPick: (rel: string) => void;
}) {
  if (!artifacts.length) return null;
  return (
    <div className="art-strip" role="tablist" aria-label="Deliverables">
      {artifacts.map((a) => (
        <button
          key={a.rel}
          role="tab"
          aria-selected={a.rel === activeArtifact}
          className={"art-chip" + (a.rel === activeArtifact ? " active" : "")}
          onClick={() => onPick(a.rel)}
          title={a.path}
        >
          📦 {a.rel}
        </button>
      ))}
    </div>
  );
}
