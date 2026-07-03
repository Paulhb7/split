// Portrait mapping for the Cabinet gallery — slug → image.
//
// The whole roster is now one visual world: "house majordome" cartoon avatars
// (Pixar-style, dark cabinet background, warm rim-light), generated 2026-07-03
// via Higgsfield nano_banana_2 and vendored under src/assets/avatars/.
//   • Supers + coach — the house livery (powdered wig + navy tailcoat, per-agent
//     EXPERT_HUE waistcoat).
//   • Geniuses — same render + cabinet world, but each keeps their OWN iconic
//     look (DaVinci's robe, Curie's lab, Socrates' toga, Alfred's butler
//     tailcoat…), so the tier reads distinct while staying in-world. Replaces
//     the earlier Wikimedia/Unsplash placeholders.
//
// Unknown slugs (custom experts before their avatar ships) fall back to a
// generic Unsplash portrait.

// — supers + coach —
import consultantAvatar from "../assets/avatars/consultant.jpg";
import scientistAvatar from "../assets/avatars/scientist.jpg";
import financierAvatar from "../assets/avatars/financier.jpg";
import lawyerAvatar from "../assets/avatars/lawyer.jpg";
import dataAnalystAvatar from "../assets/avatars/data_analyst.jpg";
import engineerAvatar from "../assets/avatars/engineer.jpg";
import designerAvatar from "../assets/avatars/designer.jpg";
import influencerAvatar from "../assets/avatars/influencer.jpg";
import projectManagerAvatar from "../assets/avatars/project_manager.jpg";
import salesAvatar from "../assets/avatars/sales.jpg";
import coachAvatar from "../assets/avatars/coach.jpg";
// — geniuses —
import davinciAvatar from "../assets/avatars/genius_davinci.jpg";
import curieAvatar from "../assets/avatars/genius_curie.jpg";
import teslaAvatar from "../assets/avatars/genius_tesla.jpg";
import socratesAvatar from "../assets/avatars/genius_socrates.jpg";
import wolfgangAvatar from "../assets/avatars/genius_wolfgang.jpg";
import alfredAvatar from "../assets/avatars/genius_alfred.jpg";
import karlAvatar from "../assets/avatars/genius_karl.jpg";
import gaudiAvatar from "../assets/avatars/genius_gaudi.jpg";
import homerAvatar from "../assets/avatars/genius_homer.jpg";
import hitchcockAvatar from "../assets/avatars/genius_hitchcock.jpg";
import rideAvatar from "../assets/avatars/genius_ride.jpg";
import indianaAvatar from "../assets/avatars/genius_indiana.jpg";
import maradonaAvatar from "../assets/avatars/genius_maradona.jpg";
import marcopoloAvatar from "../assets/avatars/genius_marcopolo.jpg";
import vatelAvatar from "../assets/avatars/genius_vatel.jpg";
import machiavelliAvatar from "../assets/avatars/genius_machiavelli.jpg";
import moriartyAvatar from "../assets/avatars/genius_moriarty.jpg";
import faustAvatar from "../assets/avatars/genius_faust.jpg";
import hannibalAvatar from "../assets/avatars/genius_hannibal.jpg";
import lokiAvatar from "../assets/avatars/genius_loki.jpg";

const PORTRAITS: Record<string, string> = {
  // ---- Genius wing — iconic-look cartoon avatars ----
  genius_davinci:     davinciAvatar,
  genius_curie:       curieAvatar,
  genius_tesla:       teslaAvatar,
  genius_socrates:    socratesAvatar,
  genius_wolfgang:    wolfgangAvatar,
  genius_alfred:      alfredAvatar,
  genius_karl:        karlAvatar,
  genius_gaudi:       gaudiAvatar,
  genius_homer:       homerAvatar,
  genius_hitchcock:   hitchcockAvatar,
  genius_ride:        rideAvatar,
  genius_indiana:     indianaAvatar,
  genius_maradona:    maradonaAvatar,
  genius_marcopolo:   marcopoloAvatar,
  genius_vatel:       vatelAvatar,
  genius_machiavelli: machiavelliAvatar,
  genius_moriarty:    moriartyAvatar,
  genius_faust:       faustAvatar,
  genius_hannibal:    hannibalAvatar,
  genius_loki:        lokiAvatar,

  // ---- Super wing — house-majordome avatars (per-agent EXPERT_HUE waistcoat) ----
  consultant:       consultantAvatar,
  scientist:        scientistAvatar,
  financier:        financierAvatar,
  lawyer:           lawyerAvatar,
  data_analyst:     dataAnalystAvatar,
  engineer:         engineerAvatar,
  designer:         designerAvatar,
  influencer:       influencerAvatar,
  project_manager:  projectManagerAvatar,
  sales:            salesAvatar,

  // ---- Coach (the four coaches merged into one super, 2026-07) ----
  coach:            coachAvatar,
};

/** Fallback portrait when a slug has no registered avatar (custom experts
 * created via @Socrates, future experts before their avatar ships). */
const PORTRAIT_FALLBACK =
  "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=600&q=80";

export const getPortrait = (slug: string): string =>
  PORTRAITS[slug] ?? PORTRAIT_FALLBACK;
