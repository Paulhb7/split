// Visual skins for the bar. `"bright"` is the default light theme; the others
// map to `theme-<id>` CSS classes applied on the app root. The default-dark
// "Classic" lives under id `""` (legacy id kept to honour existing user picks).
// Persisted to localStorage under `split.skin` (see App.tsx).
export type Skin = "bright" | "" | "pastel" | "cyberpunk" | "tokyo" | "gatsby" | "titanic" | "ghibli";

export const DEFAULT_SKIN: Skin = "bright";

export const SKINS: { id: Skin; label: string; hint: string; sw: [string, string, string] }[] = [
  { id: "bright", label: "Bright", hint: "Daylight whites, indigo accent — the default SaaS look", sw: ["#f8faff", "#ffffff", "#0053fd"] },
  { id: "", label: "Classic", hint: "Anthracite night, warm copper accent", sw: ["#0a0b0e", "#1c1f28", "#d97757"] },
  { id: "pastel", label: "Baroque", hint: "Cream salon, ornate serif, dusty rose", sw: ["#ecd9c0", "#fbf2e2", "#d97a8c"] },
  { id: "gatsby", label: "Gatsby", hint: "Champagne gold over emerald velvet — twenties opulence", sw: ["#0a1f1a", "#122d24", "#d4af37"] },
  { id: "titanic", label: "Titanic", hint: "North Atlantic navy, brass fittings, white linen", sw: ["#0a2540", "#0d2745", "#c89c4a"] },
  { id: "ghibli", label: "Ghibli", hint: "Sage pasture, dew sky, cream paper", sw: ["#f5f1e2", "#e8e4d4", "#6ba2c5"] },
  { id: "cyberpunk", label: "Night City", hint: "Neon magenta + cyan on bluish black", sw: ["#07070d", "#13102a", "#ff3df2"] },
  { id: "tokyo", label: "Tokyo Night", hint: "Deep indigo, calm violet & teal accents", sw: ["#0e0f1d", "#1a1b2e", "#bb9af7"] },
];

export const isSkin = (v: string | null): v is Skin =>
  v === "bright" || v === "" || v === "pastel" || v === "cyberpunk" || v === "tokyo" || v === "gatsby" || v === "titanic" || v === "ghibli";
