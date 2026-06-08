// Visual skins for the bar. `"bright"` is the default light theme; the others
// map to `theme-<id>` CSS classes applied on the app root. The default-dark
// "Classic" lives under id `""` and "Saint-Ex" under id `"ghibli"` (legacy ids
// kept to honour existing user picks).
// Persisted to localStorage under `split.skin` (see App.tsx).
//
// Four special skins never show in the picker by default:
// - `noir` (hidden) — the B&W gangster cut, an easter egg: 5 quick clicks on
//   the chrome wordmark toggle it. Listed only while active so you can leave.
// - `titanic` (hidden) — an easter egg: the unframed little exhibit at the
//   bottom of the Cabinet gallery ("untitled — 1912") sinks the bar into it
//   and refloats it (see titanicEgg in App.tsx). Listed only while active.
// - `cosmos` (hidden) — an easter egg: the observatory only opens at
//   midnight. In the small hours (00:00–07:00), while the bar wears Minuit,
//   a tiny ✦ glints in the chrome next to the wordmark; clicking it is the
//   door (see cosmosEgg in App.tsx). Listed only while active.
// - `minuit` (night) — only exists after dark: it auto-applies between 21:00
//   and 07:00 local time and appears in the picker during that window only.
//   Never persisted as the day skin; picking another skin at night opts out
//   for that night (see the night logic in App.tsx).
export type Skin = "bright" | "parisian" | "" | "pastel" | "cyberpunk" | "tokyo" | "gatsby" | "titanic" | "ghibli" | "cosmos" | "noir" | "minuit";

export const DEFAULT_SKIN: Skin = "bright";

// `dark` pins the native window appearance (and the vibrancy glass behind the
// translucent surface) to the skin's polarity — see the setTheme effect in App.tsx.
export const SKINS: { id: Skin; label: string; hint: string; sw: [string, string, string]; dark: boolean; hidden?: boolean; night?: boolean }[] = [
  { id: "bright", label: "Bright", hint: "Daylight whites, indigo accent — the default SaaS look", sw: ["#f8faff", "#ffffff", "#0053fd"], dark: false },
  { id: "parisian", label: "Parisian", hint: "Eiffel dusk — plum to copper, gaslit gold, Italiana", sw: ["#1d1428", "#3a1e3a", "#d4a574"], dark: true },
  { id: "", label: "Classic", hint: "Anthracite night, warm copper accent", sw: ["#0a0b0e", "#1c1f28", "#d97757"], dark: true },
  { id: "pastel", label: "Baroque", hint: "Cream salon, ornate serif, dusty rose", sw: ["#ecd9c0", "#fbf2e2", "#d97a8c"], dark: false },
  { id: "gatsby", label: "Gatsby", hint: "Champagne gold on lacquered black — Cinzel Decorative caps", sw: ["#0a0a0a", "#1a1a1a", "#d4af37"], dark: true },
  { id: "titanic", label: "Titanic", hint: "North Atlantic navy, brass fittings, white linen — she found you", sw: ["#0a2540", "#0d2745", "#c89c4a"], dark: true, hidden: true },
  { id: "ghibli", label: "Saint-Ex", hint: "Watercolor sky — butter biplane under asteroid B-612", sw: ["#eaf0f5", "#d9e6ee", "#4a8fb3"], dark: false },
  { id: "cosmos", label: "Cosmos", hint: "Observatory night — amber Saturn on violet nebula. Open after dark", sw: ["#0b0e1d", "#12152b", "#8e7bff"], dark: true, hidden: true },
  { id: "cyberpunk", label: "Night City", hint: "Neon magenta + cyan on bluish black", sw: ["#07070d", "#13102a", "#ff3df2"], dark: true },
  { id: "tokyo", label: "Tokyo Night", hint: "Deep indigo, calm violet & teal accents", sw: ["#0e0f1d", "#1a1b2e", "#bb9af7"], dark: true },
  { id: "minuit", label: "Minuit", hint: "The night watch — no pure white, nightlight amber, the house cat", sw: ["#060509", "#141118", "#c9924e"], dark: true, night: true },
  { id: "noir", label: "Noir", hint: "B&W gangster cut — you found it, keep it quiet", sw: ["#0a0a0a", "#161616", "#f0f0f0"], dark: true, hidden: true },
];

export const isSkin = (v: string | null): v is Skin =>
  v === "bright" || v === "parisian" || v === "" || v === "pastel" || v === "cyberpunk" || v === "tokyo" || v === "gatsby" || v === "titanic" || v === "ghibli" || v === "cosmos" || v === "noir" || v === "minuit";

// Night window for the auto "Minuit" skin: 21:00 → 07:00 local time.
export const isNight = (d: Date = new Date()): boolean => {
  const h = d.getHours();
  return h >= 21 || h < 7;
};

// Stable id for "tonight" — the local date of the evening the night started
// (after midnight it still belongs to yesterday's evening). Used to scope the
// per-night opt-out so it naturally expires at the next sunset.
export const nightId = (d: Date = new Date()): string => {
  const day = new Date(d);
  if (d.getHours() < 7) day.setDate(day.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${p(day.getMonth() + 1)}-${p(day.getDate())}`;
};
