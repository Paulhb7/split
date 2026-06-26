import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Editor } from "@tiptap/react";
import { MarkdownEditor } from "./MarkdownEditor";
import { SpectrePlayer } from "./SpectrePlayer";
import type { Artifact } from "../shared/events";

// Tagline carried by the Share intent when the artifact has no public URL yet.
// LinkedIn ignores text params and just renders the OG card from this URL;
// X uses both. Keeping the same string in one place so the two intents stay in
// sync — and the URL doubles as a soft promo for Split itself.
const SHARE_PROMO_URL = "https://split-app.dev";
const SHARE_PROMO_TAG = "Made with Split";

// Light-theme stylesheet inlined into the HTML we hand to the native PDF
// renderer for *non-HTML* artifacts (md / csv / image). Their rendered DOM
// carries Split's dark-theme classes, which would print white-on-black; this
// gives the hidden export webview a clean paper look without dragging the app
// stylesheet in. (HTML artifacts are self-contained and printed verbatim.)
const PDF_DOC_CSS = `
  :root { color-scheme: light; }
  body { margin: 32px; font: 14px/1.6 -apple-system, system-ui, sans-serif; color: #111; background: #fff; }
  h1, h2, h3, h4 { letter-spacing: -0.01em; line-height: 1.25; }
  a { color: #04457a; }
  img { max-width: 100%; height: auto; }
  pre { background: #f4f4f4; padding: 12px 14px; border-radius: 8px; white-space: pre-wrap; word-break: break-word; font: 12px/1.5 ui-monospace, monospace; }
  code { background: #f0f0f0; padding: 1px 5px; border-radius: 4px; font: 12px ui-monospace, monospace; }
  table { border-collapse: collapse; font: 12px ui-monospace, monospace; }
  th, td { border: 1px solid #ccc; padding: 5px 9px; text-align: left; }
  th { background: #f4f4f4; }
`;

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
// block); "image" / "pdf" use the embedded data URL; "audio" / "video" stream
// off disk via the asset protocol (no inline content — the URL is built from
// the artifact path); "binary" / fallthrough → metadata card with an "open in
// default app" button.
type Payload =
  | { kind: "text"; size: number; content: string }
  | { kind: "image" | "pdf"; size: number; mime: string; content: string }
  | { kind: "audio" | "video"; size: number; mime: string }
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

function renderText(rel: string, content: string, htmlSrc?: string) {
  const ext = extOf(rel);
  if (ext === "md" || ext === "markdown") {
    return <div className="art-md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>;
  }
  if (ext === "csv" || ext === "tsv") return <CsvTable text={content} />;
  if (ext === "html" || ext === "htm") {
    // Render the agent's HTML off disk via the asset protocol (`htmlSrc`), NOT
    // inline. That hands it a real-but-FOREIGN origin (`asset://…`), so the
    // browser APIs games rely on — localStorage/sessionStorage for scores and
    // save state — keep working (no SecurityError, no mid-game freeze), WHILE
    // the same-origin policy isolates it from Split: its JS can't reach
    // `window.parent`, the app's localStorage, or the Tauri `invoke` bridge, so
    // a prompt-injected deliverable can't read your files or drive the app.
    // (This previously used a same-origin `srcdoc`, which handed agent HTML the
    // keys to the app.) `?v=<mtime>` in `htmlSrc` busts the webview cache when a
    // turn overwrites the file; `allow-pointer-lock` keeps FPS mouse-capture.
    return <iframe className="art-iframe" sandbox="allow-scripts allow-pointer-lock" src={htmlSrc} title={rel} />;
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

// Cheap heuristic: does this HTML behave like an *app/game* rather than a
// *document*? PDF export = window.print(), which captures one static frame —
// useful for a fiche or report, nonsense for a canvas game (you get a blank or
// a single frozen frame). Presence of a drawing surface, an animation loop,
// pointer-lock, or audio is a strong tell that the page is interactive, so we
// hide the PDF button for it. False positives are cheap (the user can still
// "open in browser" + print there); false negatives just mean a document that
// happens to use a canvas keeps the button — also fine.
function htmlLooksInteractive(html: string): boolean {
  return /<canvas[\s/>]/i.test(html)
    || /requestAnimationFrame/.test(html)
    || /requestPointerLock/.test(html)
    || /\bnew\s+(?:webkit)?AudioContext\b/.test(html);
}

export function ArtifactViewer({ artifact }: { artifact: Artifact }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Edit mode (only meaningful when payload.kind === "text"). `editBuffer`
  // is the in-flight content for the textarea path; HTML edits live in the
  // iframe's DOM and are pulled out on save via postMessage.
  const [editing, setEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState("");
  const [saving, setSaving] = useState(false);
  // Transient confirmation after "Keep in vault" — holds the absolute path of
  // the copy in the vault, shown briefly and clickable to reveal it.
  const [kept, setKept] = useState<string | null>(null);
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
  // Markdown opens straight into the WYSIWYG editor — there's nothing to
  // "play", so an always-on editor is the right default. HTML is the opposite:
  // a generated page or game must stay interactive (clicks drive the game, not
  // a contentEditable text node), so it opens in preview/play and the user
  // flips into edit via the floating pencil (bottom-left, over the preview).
  // The other text types (code, json, csv…) keep the pencil-then-textarea
  // toggle because their "edit" surface (raw monospace) is noisier than their
  // preview (syntax-aware, table, etc.) and the user usually wants to read first.
  const directEdit = isText && isMarkdown;
  const inEditMode = directEdit || editing;
  const canEdit = isText && EDITABLE_EXTS.has(ext) && !directEdit;
  // An interactive HTML page (game/app) prints to a useless static frame —
  // suppress PDF export for it (the bottom bar's "open in browser" is the
  // right escape hatch if they really want to print).
  const interactiveHtml = isHtml && payload?.kind === "text" && htmlLooksInteractive(payload.content);
  const canExport = (PRINTABLE_EXTS.has(ext) || payload?.kind === "image") && !interactiveHtml;
  // HTML opens in interactive preview/play: its actions live in a floating
  // bottom bar over the page (next to Edit), not the top chrome — so the
  // generated page's own header in the top corners stays clear.
  const htmlBar = isHtml && payload?.kind === "text" && !inEditMode;

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
  // PDF export. WKWebView ignores `window.print()` (silent no-op), so we hand
  // the rendered HTML to the native `export_artifact_pdf` command, which lays
  // it out in a hidden webview and calls WKWebView's `createPDF`. The user
  // first picks the destination via the OS save panel — closing the "where do
  // I save it" gap the old print-dialog approach left open.
  async function exportPdf() {
    if (!payload || payload.kind === "binary") return;
    // HTML artifacts are self-contained — print verbatim. Everything else
    // (md / csv / image) is already rendered in the pane DOM; wrap that body
    // in a clean paper stylesheet so it doesn't print Split's dark theme.
    let doc: string;
    if (isHtml && payload.kind === "text") {
      doc = payload.content;
    } else {
      const body = document.querySelector(".art-body")?.innerHTML ?? "";
      doc = `<!doctype html><html><head><meta charset="utf-8"><style>${PDF_DOC_CSS}</style></head><body>${body}</body></html>`;
    }
    const base = (artifact.rel.split("/").pop() || "artifact").replace(/\.[^.]+$/, "");
    const target = await saveDialog({
      defaultPath: `${base}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!target) return;
    try {
      await invoke("export_artifact_pdf", { html: doc, targetPath: target });
    } catch (e) {
      setErr(String(e));
    }
  }

  // Save-a-copy flow. The OS save panel returns the user-chosen absolute path
  // (or null on cancel); the Rust side writes the content there. For text
  // artifacts we already have the bytes in payload — no need to round-trip
  // through disk. For binary/image the button is hidden (v1 — no base64 path).
  async function saveAs() {
    if (!payload || payload.kind !== "text") return;
    const defaultName = artifact.rel.split("/").pop() || artifact.rel;
    const ext = extOf(artifact.rel);
    const target = await saveDialog({
      defaultPath: defaultName,
      filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined,
    });
    if (!target) return;
    try {
      await invoke("save_artifact_as", { targetPath: target, content: payload.content });
    } catch (e) {
      setErr(String(e));
    }
  }

  // Share popover state — small dropdown anchored under the Share button,
  // closes on outside-click and on Esc. Two destinations (LinkedIn, X), each
  // opens the platform's web-intent composer in the default browser.
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!shareOpen) return;
    function onDoc(e: MouseEvent) {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShareOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setShareOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [shareOpen]);
  function shareTo(platform: "linkedin" | "x") {
    const title = artifact.rel.split("/").pop() || artifact.rel;
    const text = `${SHARE_PROMO_TAG} — ${title}`;
    const url = SHARE_PROMO_URL;
    let intent: string;
    if (platform === "linkedin") {
      // LinkedIn deprecated the title/summary params — modern share-offsite
      // only honours `url`, then fetches the OG card from that URL. Pointing
      // at split-app.dev means LinkedIn renders Split's preview; the user
      // adds their own commentary in LinkedIn's composer.
      intent = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    } else {
      // X's tweet intent takes both `text` and `url` — we send a pre-filled
      // tweet with the tagline + artifact name + Split URL, user can edit
      // before posting.
      intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    }
    invoke("open_url", { target: intent }).catch((e) => setErr(String(e)));
    setShareOpen(false);
  }
  // Save-a-copy / Share are meaningful for any artifact except the binary
  // fallback (no in-memory text content to write or to caption).
  const canSaveAs = payload?.kind === "text";
  const canShare = !!payload && payload.kind !== "binary";
  // Stable callbacks for the TipTap markdown editor — passing inline
  // closures would re-run the editor's effects on every render.
  const onTiptapReady = useCallback((editor: Editor) => { tiptapRef.current = editor; }, []);
  const onTiptapSave = useCallback(() => { saveEdit(); }, [saveEdit]);
  const onTiptapCancel = useCallback(() => { cancelEdit(); }, [cancelEdit]);
  // Auto-dismiss the "kept in vault" confirmation.
  useEffect(() => {
    if (!kept) return;
    const t = setTimeout(() => setKept(null), 3500);
    return () => clearTimeout(t);
  }, [kept]);

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
            {canSaveAs && <button className="iconbtn" onClick={saveAs} title="Save a copy…">⤓</button>}
            {canShare && <ShareControl shareRef={shareRef} open={shareOpen} setOpen={setShareOpen} onPick={shareTo} />}
            <KeepControl artifact={artifact} onSaved={setKept} onErr={setErr} />
            <button className="iconbtn" onClick={reveal} title="Open in default app">↗</button>
          </>
        ) : editing ? (
          <>
            <button className="iconbtn" style={{ width: "auto", padding: "4px 10px" }}
                    onClick={cancelEdit} disabled={saving} title="Discard changes (Esc)">Cancel</button>
            <button className="iconbtn on" style={{ width: "auto", padding: "4px 10px" }}
                    onClick={saveEdit} disabled={saving} title="Save (⌘S)">{saving ? "Saving…" : "Save"}</button>
          </>
        ) : htmlBar ? (
          // HTML preview: actions live in the floating bottom bar, header is
          // title-only.
          null
        ) : (
          <>
            {canEdit && !isHtml && <button className="iconbtn" onClick={startEdit} title="Edit">✎</button>}
            {canExport && <button className="iconbtn" onClick={exportPdf} title="Export as PDF">⎙</button>}
            {canSaveAs && <button className="iconbtn" onClick={saveAs} title="Save a copy…">⤓</button>}
            {canShare && <ShareControl shareRef={shareRef} open={shareOpen} setOpen={setShareOpen} onPick={shareTo} />}
            <KeepControl artifact={artifact} onSaved={setKept} onErr={setErr} />
            <button className="iconbtn" onClick={reveal} title="Open in default app">↗</button>
          </>
        )}
      </div>
      <div className="art-body">
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
            renderText(artifact.rel, payload.content, `${convertFileSrc(artifact.path)}?v=${artifact.mtime}`)
          )
        )}
        {payload && payload.kind === "image" && (
          <img className="art-img" src={payload.content} alt={artifact.rel} />
        )}
        {payload && payload.kind === "pdf" && (
          <iframe className="art-iframe" src={payload.content} title={artifact.rel} />
        )}
        {payload && payload.kind === "audio" && (
          <SpectrePlayer
            src={convertFileSrc(artifact.path)}
            name={artifact.rel.split("/").pop() || artifact.rel}
            metaText={`${payload.mime} · ${humanSize(payload.size)}`}
            onReveal={reveal}
          />
        )}
        {payload && payload.kind === "video" && (
          <div className="art-media">
            <video
              className="art-video"
              src={convertFileSrc(artifact.path)}
              controls
              preload="metadata"
            />
            <div className="art-media-meta">
              {payload.mime} · {humanSize(payload.size)}
              {" · "}
              <button className="art-media-link" onClick={reveal}>open in default app</button>
            </div>
          </div>
        )}
        {payload && payload.kind === "binary" && (
          <div className="art-fallback">
            <div className="art-fallback-title">{payload.tooLarge ? "Too large to preview" : "Binary file"}</div>
            <div className="art-fallback-meta">{payload.mime} · {humanSize(payload.size)}</div>
            <button className="iconbtn" style={{ width: "auto", padding: "4px 10px", marginTop: 8 }} onClick={reveal}>Open with default app</button>
          </div>
        )}
      </div>
      {/* Floating action bar for HTML — the page stays in interactive
          preview/play mode, so every action it could need (edit, open in
          browser, export, save, share, keep) lives in one pill parked
          bottom-left over the preview, clear of the agent's own UI in the top
          corners. Popovers (share/keep) open upward via the `up` flag. */}
      {htmlBar && (
        <div className="art-actionbar">
          <button
            className="art-edit-fab"
            onClick={startEdit}
            title="Edit this page"
            aria-label="Edit this page"
          >
            <span className="art-edit-fab-ico" aria-hidden="true">✎</span>
            <span>Edit</span>
          </button>
          <button className="iconbtn" onClick={reveal} title="Ouvrir dans le navigateur">⤢</button>
          {canExport && <button className="iconbtn" onClick={exportPdf} title="Export as PDF">⎙</button>}
          {canSaveAs && <button className="iconbtn" onClick={saveAs} title="Save a copy…">⤓</button>}
          {canShare && <ShareControl up shareRef={shareRef} open={shareOpen} setOpen={setShareOpen} onPick={shareTo} />}
          <KeepControl up artifact={artifact} onSaved={setKept} onErr={setErr} />
        </div>
      )}
      {kept && (
        <button
          className="art-kept-toast"
          onClick={() => { invoke("reveal_artifact", { path: kept }); setKept(null); }}
          title={kept}
        >
          ✓ Gardé dans le vault — révéler
        </button>
      )}
    </div>
  );
}

// Small share control: a button + a popover that anchors to it. Lives in this
// file because it's tightly coupled to ArtifactViewer's wiring — it doesn't
// own the open state (the parent does, so outside-click can close it from any
// header layout) and just routes the chosen platform back via onPick.
function ShareControl({
  shareRef, open, setOpen, onPick, up,
}: {
  shareRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  setOpen: (v: boolean) => void;
  onPick: (platform: "linkedin" | "x") => void;
  up?: boolean;
}) {
  return (
    <div className={"art-share-wrap" + (up ? " up" : "")} ref={shareRef}>
      <button
        className={"iconbtn" + (open ? " on" : "")}
        onClick={() => setOpen(!open)}
        title="Share…"
        aria-haspopup="menu"
        aria-expanded={open}
      >⤴</button>
      {open && (
        <div className="art-share-menu" role="menu">
          <button role="menuitem" className="art-share-item" onClick={() => onPick("linkedin")}>
            <span className="art-share-mark" aria-hidden="true">in</span>
            <span>Share on LinkedIn</span>
          </button>
          <button role="menuitem" className="art-share-item" onClick={() => onPick("x")}>
            <span className="art-share-mark" aria-hidden="true">𝕏</span>
            <span>Share on X</span>
          </button>
        </div>
      )}
    </div>
  );
}

// "Keep in vault" control: a 🗃️ button + a popover that files the open
// artifact into the boss's curated vault. `notes/` is the one-click default;
// the popover also lists existing `projects/<slug>/` (read live from
// `vault_tree`) and offers an inline "new project" field. The heavy lifting
// (file vs folder copy, slugify, dir creation) is the `keep_in_vault` command.
function KeepControl({
  artifact, onSaved, onErr, up,
}: {
  artifact: Artifact;
  onSaved: (path: string) => void;
  onErr: (e: string) => void;
  up?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  // Pull existing project folders when the menu opens (cheap, and keeps the
  // list fresh if the agent created a project mid-session).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    invoke<string>("vault_tree")
      .then((raw) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(raw) as { tree: VaultNode[] };
          const projectsNode = data.tree.find((n) => n.name === "projects" && n.dir);
          const slugs = (projectsNode?.children ?? [])
            .filter((c) => c.dir)
            .map((c) => c.name)
            .sort((a, b) => a.localeCompare(b));
          setProjects(slugs);
        } catch { /* empty list is fine */ }
      })
      .catch(() => { /* overlay never opened the vault yet — empty list */ });
    return () => { cancelled = true; };
  }, [open]);

  // Outside-click / Esc close.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function keep(project: string | null) {
    setBusy(true);
    try {
      const dest = await invoke<string>("keep_in_vault", {
        sourcePath: artifact.path,
        rel: artifact.rel,
        project,
      });
      setOpen(false);
      setShowNew(false);
      setNewSlug("");
      onSaved(dest);
    } catch (e) {
      onErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={"art-share-wrap" + (up ? " up" : "")} ref={ref}>
      <button
        className={"iconbtn" + (open ? " on" : "")}
        onClick={() => setOpen(!open)}
        title="Keep in vault"
        aria-haspopup="menu"
        aria-expanded={open}
      >🗃️</button>
      {open && (
        <div className="art-share-menu art-keep-menu" role="menu">
          <div className="art-keep-head">Garder dans le vault</div>
          <button role="menuitem" className="art-share-item" disabled={busy} onClick={() => keep(null)}>
            <span className="art-share-mark" aria-hidden="true">📝</span>
            <span>Notes <span className="art-keep-def">· défaut</span></span>
          </button>
          {projects.length > 0 && <div className="art-keep-sep">Projets</div>}
          {projects.map((p) => (
            <button key={p} role="menuitem" className="art-share-item" disabled={busy} onClick={() => keep(p)}>
              <span className="art-share-mark" aria-hidden="true">📁</span>
              <span>{p}</span>
            </button>
          ))}
          {showNew ? (
            <form
              className="art-keep-new"
              onSubmit={(e) => { e.preventDefault(); if (newSlug.trim()) keep(newSlug.trim()); }}
            >
              <input
                autoFocus
                className="art-keep-input"
                placeholder="nom du projet…"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                disabled={busy}
              />
              <button type="submit" className="iconbtn on" disabled={busy || !newSlug.trim()} title="Créer + garder">↵</button>
            </form>
          ) : (
            <button role="menuitem" className="art-share-item" disabled={busy} onClick={() => setShowNew(true)}>
              <span className="art-share-mark" aria-hidden="true">＋</span>
              <span>Nouveau projet…</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Minimal shape of the vault tree nodes returned by `vault_tree` — only the
// fields KeepControl reads (the Vault overlay owns the full type).
interface VaultNode { name: string; dir: boolean; children: VaultNode[]; }
