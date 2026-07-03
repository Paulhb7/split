import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";

// Fixed top toolbar for the markdown editor. Mirrors the StarterKit nodes
// the editor supports — anything more exotic (tables, images) falls back to
// raw markdown via the Markdown extension's html escape hatch.
//
// Subscribes to the editor's `selectionUpdate`/`transaction` events so the
// active state of each button (bold-on, h1-on, in-bullet-list…) reflects the
// caret in real time. Without this hook the buttons would look dead.
export function MarkdownToolbar({ editor }: { editor: Editor }) {
  const [, force] = useState(0);
  useEffect(() => {
    const tick = () => force((x) => x + 1);
    editor.on("selectionUpdate", tick);
    editor.on("transaction", tick);
    return () => {
      editor.off("selectionUpdate", tick);
      editor.off("transaction", tick);
    };
  }, [editor]);

  const is = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs);
  const run = (fn: () => void) => () => {
    fn();
    editor.commands.focus();
  };
  const promptLink = () => {
    const prev = (editor.getAttributes("link") as { href?: string }).href ?? "";
    const url = window.prompt("Link (empty to remove)", prev);
    if (url === null) return;
    if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="md-tb" role="toolbar" aria-label="Formatting">
      <Group>
        <Btn on={is("bold")} onClick={run(() => editor.chain().focus().toggleBold().run())} title="Bold (⌘B)">
          <b>B</b>
        </Btn>
        <Btn on={is("italic")} onClick={run(() => editor.chain().focus().toggleItalic().run())} title="Italic (⌘I)">
          <i>I</i>
        </Btn>
        <Btn on={is("strike")} onClick={run(() => editor.chain().focus().toggleStrike().run())} title="Strikethrough">
          <s>S</s>
        </Btn>
        <Btn on={is("code")} onClick={run(() => editor.chain().focus().toggleCode().run())} title="Inline code">
          <span className="md-tb-mono">{"</>"}</span>
        </Btn>
      </Group>
      <Sep />
      <Group>
        <Btn on={is("heading", { level: 1 })} onClick={run(() => editor.chain().focus().toggleHeading({ level: 1 }).run())} title="Heading 1">
          H1
        </Btn>
        <Btn on={is("heading", { level: 2 })} onClick={run(() => editor.chain().focus().toggleHeading({ level: 2 }).run())} title="Heading 2">
          H2
        </Btn>
        <Btn on={is("heading", { level: 3 })} onClick={run(() => editor.chain().focus().toggleHeading({ level: 3 }).run())} title="Heading 3">
          H3
        </Btn>
      </Group>
      <Sep />
      <Group>
        <Btn on={is("bulletList")} onClick={run(() => editor.chain().focus().toggleBulletList().run())} title="Bullet list">
          •
        </Btn>
        <Btn on={is("orderedList")} onClick={run(() => editor.chain().focus().toggleOrderedList().run())} title="Numbered list">
          1.
        </Btn>
        <Btn on={is("blockquote")} onClick={run(() => editor.chain().focus().toggleBlockquote().run())} title="Quote">
          ❝
        </Btn>
        <Btn on={is("codeBlock")} onClick={run(() => editor.chain().focus().toggleCodeBlock().run())} title="Code block">
          <span className="md-tb-mono">{ }</span>
        </Btn>
      </Group>
      <Sep />
      <Group>
        <Btn on={is("link")} onClick={promptLink} title="Link (⌘K)">
          ↗
        </Btn>
        <Btn onClick={run(() => editor.chain().focus().setHorizontalRule().run())} title="Divider">
          —
        </Btn>
      </Group>
      <div className="md-tb-spacer" />
      <Group>
        <Btn onClick={run(() => editor.chain().focus().undo().run())} disabled={!editor.can().undo()} title="Undo (⌘Z)">
          ↶
        </Btn>
        <Btn onClick={run(() => editor.chain().focus().redo().run())} disabled={!editor.can().redo()} title="Redo (⌘⇧Z)">
          ↷
        </Btn>
      </Group>
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="md-tb-group">{children}</div>;
}
function Sep() {
  return <div className="md-tb-sep" aria-hidden="true" />;
}
function Btn({
  children, onClick, on, disabled, title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  on?: boolean;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      className={"md-tb-btn" + (on ? " on" : "")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={on}
    >
      {children}
    </button>
  );
}
