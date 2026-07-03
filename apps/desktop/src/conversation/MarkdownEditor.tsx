// TipTap-based markdown editor used in ArtifactViewer for `.md` artifacts.
// Renders as a WYSIWYG (headings look like headings, lists look like lists),
// but reads and writes plain markdown via tiptap-markdown's round-trip so
// what the agent reads on disk stays a real `.md` file. StarterKit covers
// the common nodes (headings, lists, code, blockquote, hr); Link, Placeholder
// and Typography add polish on top — anything richer the user pastes
// (tables, etc.) falls back to the Markdown extension's `html: true` escape
// hatch.
//
// The component exposes the live editor instance to its parent via the
// `onReady` callback so the save flow in ArtifactViewer can pull the
// current markdown without prop-drilling change events on every keystroke.
import { useEffect, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { Markdown } from "tiptap-markdown";
import { MarkdownToolbar } from "./MarkdownToolbar";

interface Props {
  initial: string;
  onReady: (editor: Editor) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function MarkdownEditor({ initial, onReady, onSave, onCancel }: Props) {
  // TipTap's editor instance is created once and never rebuilt — its
  // handlers close over the first render's callbacks. We keep refs to the
  // latest save/cancel callbacks so ⌘S and Esc always reach the current
  // parent state without forcing the editor to re-instantiate (which
  // would wipe the user's in-flight edits).
  const onSaveRef = useRef(onSave);
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onSaveRef.current = onSave; onCancelRef.current = onCancel; });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: "Write your markdown…" }),
      Typography,
      // `html: true` keeps raw HTML the user might have pasted; the editor
      // round-trips it instead of dropping it on save.
      Markdown.configure({ html: true, breaks: true, transformPastedText: true }),
    ],
    content: initial,
    editorProps: {
      // `art-md` reuses the read-mode markdown typography; `md-doc` adds
      // the document-style editor surface (centered, generous, no border).
      attributes: { class: "art-md md-doc" },
      handleKeyDown: (_view, e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); onSaveRef.current(); return true; }
        if (e.key === "Escape") { e.preventDefault(); onCancelRef.current(); return true; }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor) onReady(editor);
  }, [editor, onReady]);

  if (!editor) return <div className="md-shell" />;

  // ⌘K toggles a link on the current selection. Bound at the shell level
  // so we don't have to thread it through ProseMirror's handleKeyDown
  // (which was set up at editor-creation time and can't capture the
  // editor reference cleanly).
  const onShellKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const prev = (editor.getAttributes("link") as { href?: string }).href ?? "";
      const url = window.prompt("Link (empty to remove)", prev);
      if (url === null) return;
      if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
      else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  };

  return (
    <div className="md-shell" onKeyDown={onShellKeyDown}>
      <MarkdownToolbar editor={editor} />
      <BubbleMenu editor={editor} className="md-bubble">
        <button
          type="button"
          className={"md-bubble-btn" + (editor.isActive("bold") ? " on" : "")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <b>B</b>
        </button>
        <button
          type="button"
          className={"md-bubble-btn" + (editor.isActive("italic") ? " on" : "")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <i>I</i>
        </button>
        <button
          type="button"
          className={"md-bubble-btn" + (editor.isActive("code") ? " on" : "")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Code"
        >
          <span className="md-tb-mono">{"</>"}</span>
        </button>
        <button
          type="button"
          className={"md-bubble-btn" + (editor.isActive("link") ? " on" : "")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const prev = (editor.getAttributes("link") as { href?: string }).href ?? "";
            const url = window.prompt("Link (empty to remove)", prev);
            if (url === null) return;
            if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
            else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          }}
          title="Link"
        >
          ↗
        </button>
      </BubbleMenu>
      <div className="md-scroll">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
