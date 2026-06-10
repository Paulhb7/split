import { H, logoUrl, type Harness } from "../shared/harnesses";
import { useExperts } from "../shared/util";
import { Logo, vars } from "../shared/ui";

// The home composer: engine picker + expert picker + prompt input. The `@`-
// mention and `/`-slash menus render above the input; the parent owns their
// open/filter state and feeds the filtered expert list via `expertEntries`.
export function Composer(props: {
  experts: ReturnType<typeof useExperts>;
  expertSlug: string; expertLabel: string; active: string;
  engines: Harness[]; onAddAgent: () => void;
  menu: "engine" | "expert" | "slash" | "project" | null; setMenu: (m: "engine" | "expert" | "slash" | "project" | null) => void;
  setActive: (s: string) => void;
  value: string; onChange: (v: string, cursor: number | null) => void; onKey: (e: React.KeyboardEvent) => void; onRun: () => void;
  chips: React.ReactNode; inputRef: React.RefObject<HTMLInputElement | null>;
  expertEntries: [string, { label: string; kind: string; blurb: string }][];
  onPickExpert: (slug: string) => void;
  // Vault projects for the `#` picker (already filtered by the typed query).
  projects: string[];
  onPickProject: (slug: string) => void;
}) {
  const { menu, setMenu, active, setActive, engines, onAddAgent, expertSlug, experts, expertLabel, value, onChange, onKey, onRun, chips, inputRef, expertEntries, onPickExpert, projects, onPickProject } = props;
  return (
    <div className="composer">
      {menu === "engine" && (
        <div className="menu">
          {engines.map((h) => (
            <button key={h.id} className={"mi" + (h.id === active ? " sel" : "")} onClick={() => { setActive(h.id); setMenu(null); inputRef.current?.focus(); }}>
              <span className="logo" style={vars({ "--logo": logoUrl(h.id), "--brand": h.brand, "--s": "16px" })} />
              <span className="mn">{h.label}</span>
              <span className="mk">{h.reserve ? "reserve" : h.lane}</span>
              <span className="mb">{h.blurb}</span>
            </button>
          ))}
          <button className="mi mi-add" onClick={() => { setMenu(null); onAddAgent(); }}>
            <span className="mi-plus">＋</span>
            <span className="mn">Add agent…</span>
            <span className="mk">manage</span>
          </button>
        </div>
      )}
      {menu === "expert" && (
        <div className="menu">
          {expertEntries.length === 0 ? (
            <div className="mi mi-empty">No expert matches that name. Type a different prefix or press Esc.</div>
          ) : (() => {
            // Split into super / genius buckets so the dropdown mirrors the
            // onboarding cabinet's mental model (jobs you know vs. genius
            // outputs only Split unlocks). Empty buckets are skipped, so when
            // the user types `@cur` and only super matches survive, the genius
            // header doesn't render an orphan label.
            const supers = expertEntries.filter(([slug]) => (experts[slug]?.category ?? "super") === "super");
            const genii = expertEntries.filter(([slug]) => experts[slug]?.category === "genius");
            const coaches = expertEntries.filter(([slug]) => experts[slug]?.category === "coach");
            const renderRow = ([slug, x]: typeof expertEntries[number]) => {
              const figure = (x as { figure?: string; role?: string }).figure
                ?? (x as { role?: string }).role
                ?? slug.replace(/_/g, " ");
              return (
                <button key={slug} className={"mi" + (slug === expertSlug ? " sel" : "")} onClick={() => onPickExpert(slug)}>
                  <span />
                  <span className="mn">@{x.label} <span className="mn-role">{figure}</span></span>
                  <span className="mk">{x.kind}</span>
                  <span className="mb">{x.blurb}</span>
                </button>
              );
            };
            return (
              <>
                {supers.length > 0 && (
                  <>
                    <div className="mi-section">super agents</div>
                    {supers.map(renderRow)}
                  </>
                )}
                {genii.length > 0 && (
                  <>
                    <div className="mi-section genius">genius agents</div>
                    {genii.map(renderRow)}
                  </>
                )}
                {coaches.length > 0 && (
                  <>
                    <div className="mi-section coach">coaches</div>
                    {coaches.map(renderRow)}
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}
      {menu === "project" && (
        <div className="menu">
          {projects.length === 0 ? (
            <div className="mi mi-empty">No vault project matches. Agents create projects as work accumulates — or add one yourself from the Vault (🗃️).</div>
          ) : (
            <>
              <div className="mi-section">vault projects</div>
              {projects.map((p) => (
                <button key={p} className="mi" onClick={() => onPickProject(p)}>
                  <span />
                  <span className="mn">#{p}</span>
                  <span className="mk">project</span>
                  <span className="mb">this session writes to projects/{p}/</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
      <button className="pick" onClick={() => setMenu(menu === "engine" ? null : "engine")} title="Engine">
        <Logo id={active} size={15} themed />
        {H[active]?.label || active}
      </button>
      <button className="pick" onClick={() => setMenu(menu === "expert" ? null : "expert")} title={`@${expertLabel} — ${experts[expertSlug]?.role ?? "Expert"}`}>
        @{expertLabel} <span className="k pick-role">{experts[expertSlug]?.role ?? ""}</span> <span className="k">▾</span>
      </button>
      {chips}
      <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value, e.target.selectionStart)} onKeyDown={onKey}
        placeholder={`Brief @${experts[expertSlug]?.label || "your expert"} on ${H[active]?.label || active}…`} />
      <button className="run" onClick={onRun} title="Run">▶</button>
    </div>
  );
}
