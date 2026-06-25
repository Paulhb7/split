import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SKINS, isSkin, DEFAULT_SKIN, isNight, nightId, type Skin } from "./skins";

const LS_SKIN = "split.skin"; // skin id ("" = Classic dark) — see skins.ts for the registry
const LS_NIGHT_OPTOUT = "split.skin.nightOptOut"; // nightId() of the evening the user opted out of auto-Minuit
const LS_PRENOIR = "split.skin.preNoir"; // skin to restore when the Noir easter egg is toggled off
const LS_PRETITANIC = "split.skin.preTitanic"; // skin to refloat when the Titanic easter egg is toggled off
const LS_PRECOSMOS = "split.skin.preCosmos"; // skin to come back down to when the Cosmos easter egg is toggled off

// The whole wardrobe in one hook: the day-skin pick (persisted), the
// auto-Minuit night rule, the native window-theme pin, and the three easter
// eggs — Noir (wordmark clicks), Titanic (cabinet iceberg) and Cosmos (the
// midnight star). App.tsx consumes the result; `shownSkin` is what the window
// actually wears right now.
export function useSkin(opts: {
  pushToast: (text: string, ttl?: number) => void;
}) {
  const { pushToast } = opts;

  const [skin, setSkinState] = useState<Skin>(() => {
    const raw = localStorage.getItem(LS_SKIN);
    const s = raw === null ? DEFAULT_SKIN : isSkin(raw) ? raw : DEFAULT_SKIN;
    return s === "minuit" ? DEFAULT_SKIN : s; // minuit is the night state, never the day skin
  });
  // Auto-"Minuit": between 21:00 and 07:00 local the bar dresses for the
  // night, unless the user picked another skin tonight (opt-out scoped to
  // nightId() so it expires at the next sunset). The minute tick keeps the
  // flip honest for windows that stay open across 21:00 / 07:00.
  const [night, setNight] = useState(isNight());
  // The observatory window (Cosmos egg): the ✦ only rises at midnight —
  // 00:00 to 07:00, the small hours — not the whole Minuit evening.
  const [smallHours, setSmallHours] = useState(new Date().getHours() < 7);
  useEffect(() => {
    const tick = () => {
      setNight(isNight());
      setSmallHours(new Date().getHours() < 7);
    };
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  const [nightOptOut, setNightOptOut] = useState(() => localStorage.getItem(LS_NIGHT_OPTOUT) === nightId());
  useEffect(() => {
    if (night) setNightOptOut(localStorage.getItem(LS_NIGHT_OPTOUT) === nightId());
  }, [night]);
  // What the window actually wears right now — the day skin, or Minuit after dark.
  const shownSkin: Skin = night && !nightOptOut ? "minuit" : skin;
  const withSkinTransition = (commit: () => void) => {
    // Cross-fade the whole window between skins (View Transitions API,
    // WebKit ≥ Safari 18). flushSync commits the new theme class inside the
    // transition's capture window; engines without the API swap instantly.
    const vt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
    if (vt) vt.call(document, () => flushSync(commit));
    else commit();
  };
  const pickSkin = (s: Skin) => {
    if (s === "minuit") {
      // Only offered at night, never persisted as the day skin — picking it
      // just re-arms the auto rule for tonight.
      localStorage.removeItem(LS_NIGHT_OPTOUT);
      withSkinTransition(() => setNightOptOut(false));
      return;
    }
    // Picking a skin after dark means "not tonight" — Minuit stands down for
    // the rest of this night only and returns tomorrow evening.
    if (isNight()) localStorage.setItem(LS_NIGHT_OPTOUT, nightId());
    localStorage.setItem(LS_SKIN, s);
    withSkinTransition(() => {
      if (isNight()) setNightOptOut(true);
      setSkinState(s);
    });
  };
  // Pin the native window appearance to the skin's polarity so the vibrancy
  // glass behind the translucent surface (lib.rs, Sidebar material) reads
  // bright under the light skins and deep under the dark ones.
  useEffect(() => {
    const dark = SKINS.find((x) => x.id === shownSkin)?.dark ?? true;
    getCurrentWindow().setTheme(dark ? "dark" : "light").catch(() => {});
  }, [shownSkin]);
  // Easter egg — 5 quick clicks on the chrome wordmark toggle the hidden
  // film-noir skin (and back to whatever was worn before). Not in the picker,
  // not in a tooltip: you find it, or you hear about it.
  const eggClicks = useRef<number[]>([]);
  const noirEgg = () => {
    const now = Date.now();
    eggClicks.current = [...eggClicks.current.filter((t) => now - t < 1800), now];
    if (eggClicks.current.length < 5) return;
    eggClicks.current = [];
    if (skin === "noir") {
      const back = localStorage.getItem(LS_PRENOIR);
      pickSkin(isSkin(back) && back !== "noir" && back !== "minuit" ? back : DEFAULT_SKIN);
    } else {
      localStorage.setItem(LS_PRENOIR, skin);
      pickSkin("noir");
      pushToast("🕶️ Mode Noir. Motus.");
    }
  };
  // Easter egg — the Cabinet gallery's last exhibit ("untitled — 1912", a
  // tiny unframed 🧊). Clicking it sinks the bar into the hidden Titanic
  // skin; clicking again refloats whatever was worn before.
  const titanicEgg = () => {
    if (skin === "titanic") {
      const back = localStorage.getItem(LS_PRETITANIC);
      pickSkin(isSkin(back) && back !== "titanic" && back !== "noir" && back !== "minuit" ? back : DEFAULT_SKIN);
    } else {
      localStorage.setItem(LS_PRETITANIC, skin);
      pickSkin("titanic");
      pushToast("🧊 Iceberg, right ahead.");
    }
  };
  // Easter egg — the observatory only opens at midnight: in the small hours
  // (00:00–07:00), while the bar wears Minuit, a tiny ✦ glints in the chrome
  // next to the wordmark (the .wm-star button in App.tsx). Clicking it flies
  // to the hidden Cosmos skin; the star stays lit inside so you can fly back.
  // Entering from Minuit stores
  // "minuit" as the way back — pickSkin("minuit") re-arms the night rule,
  // so leaving the observatory returns you to the night, not the day skin.
  const cosmosEgg = () => {
    if (skin === "cosmos") {
      const back = localStorage.getItem(LS_PRECOSMOS);
      pickSkin(isSkin(back) && back !== "cosmos" && back !== "noir" && back !== "titanic" ? back : DEFAULT_SKIN);
    } else {
      localStorage.setItem(LS_PRECOSMOS, shownSkin === "minuit" ? "minuit" : skin);
      pickSkin("cosmos");
      pushToast("🔭 Welcome to the observatory.");
    }
  };
  return { skin, shownSkin, night, smallHours, pickSkin, noirEgg, titanicEgg, cosmosEgg };
}
