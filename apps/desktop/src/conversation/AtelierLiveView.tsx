import type { Session } from "../shared/models";

// The atelier's LIVE BROWSER view — the newest screenshot the Rust frame
// watcher streamed while an operator (Alfred) drives a headless Chromium. There
// is no OS window to embed (the browser runs headless, by design — background,
// no focus steal), so this is the only way to *watch* it work: a fast data-URL
// image swap as frames arrive. Read-only for now; click-through (forwarding
// clicks back as actions) is a later step.
export function AtelierLiveView({ session }: { session: Session }) {
  const f = session.liveFrame;
  if (!f) return null;
  const live = session.status === "running";
  return (
    <div className="atelier-live">
      <div className="atelier-live-bar">
        <span className={"atelier-live-dot" + (live ? " on" : "")} aria-hidden="true" />
        <span className="atelier-live-lbl">{live ? "Live — browser" : "Browser · last frame"}</span>
        <span className="atelier-live-spacer" />
        <span className="atelier-live-seq">frame {f.seq}</span>
      </div>
      <div className="atelier-live-body">
        {/* key=seq forces a fresh <img> each frame so there's no stale-paint
            flash between swaps; the screenshot fills the pane, letterboxed. */}
        <img
          key={f.seq}
          className="atelier-live-img"
          src={`data:${f.mime};base64,${f.data}`}
          alt="Live browser view"
        />
      </div>
    </div>
  );
}
