// Visual skins for the bar. `""` is the default dark theme; the others map to
// `theme-<id>` CSS classes applied on the app root. Persisted to localStorage
// under `split.skin` (see App.tsx).
export type Skin = "" | "pastel" | "cyberpunk" | "tokyo";

export const SKINS: { id: Skin; label: string; hint: string; sw: [string, string, string] }[] = [
  { id: "", label: "Classic", hint: "Anthracite night, warm copper accent", sw: ["#0a0b0e", "#1c1f28", "#d97757"] },
  { id: "pastel", label: "Wes Anderson", hint: "Cream salon, serif display, dusty rose", sw: ["#ecd9c0", "#fbf2e2", "#c95a7a"] },
  { id: "cyberpunk", label: "Night City", hint: "Neon magenta + cyan on bluish black", sw: ["#07070d", "#13102a", "#ff3df2"] },
  { id: "tokyo", label: "Tokyo Night", hint: "Deep indigo, calm violet & teal accents", sw: ["#0e0f1d", "#1a1b2e", "#bb9af7"] },
];

export const isSkin = (v: string | null): v is Skin =>
  v === "" || v === "pastel" || v === "cyberpunk" || v === "tokyo";
