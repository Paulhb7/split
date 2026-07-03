import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { H, brandOf, logoUrl } from "../shared/harnesses";
import { vars } from "../shared/ui";
import type { Session } from "../shared/models";

// Blocking sign-in modal for a session whose agent reported `auth_required`.
// Offers the ACP-advertised auth methods plus, when the harness supports it,
// a browser-OAuth fallback. Dismissable three ways (✕ / backdrop / Esc) — the
// session stays parked on its in-thread sign-in ask, the window isn't hostage.
export function AuthModal({ session, onPick, onClose }: { session: Session; onPick: (methodId: string) => void; onClose: () => void }) {
  const a = session.auth!;
  const h = H[a.harness];
  // Esc dismisses — same window-level listener pattern as the Vault overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="am" onClick={(e) => e.stopPropagation()} style={vars({ "--brand": brandOf(a.harness) })}>
        <button className="am-close" onClick={onClose} title="Dismiss" aria-label="Dismiss — sign in later">✕</button>
        <span className="logo am-logo" style={vars({ "--logo": logoUrl(a.harness), "--brand": brandOf(a.harness), "--s": "34px" })} />
        <h3>Sign in to {h?.label || a.harness}</h3>
        <p>{a.note || `${h?.label || a.harness} needs to authenticate before this session can run.`}</p>
        <div className="am-acts">
          {a.methods.map((m) => <button key={m.id} className="btn" onClick={() => onPick(m.id)}>{m.name || `Sign in · ${m.id}`}</button>)}
          {a.hasLogin && <button className="btn ghost" onClick={() => invoke("browser_login", { harness: a.harness })}>Sign in in browser</button>}
          {!a.methods.length && !a.hasLogin && <p style={{ margin: 0 }}>{a.note || "See this engine's auth note in config."}</p>}
        </div>
      </div>
    </div>
  );
}
