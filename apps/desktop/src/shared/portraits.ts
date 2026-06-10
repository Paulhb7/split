// Portrait mapping for the Cabinet gallery — slug → image URL.
//
// Genius wing: canonical public-domain Wikimedia Commons portraits, resolved
// via the Wikipedia REST API's `originalimage.source` (the article's lead
// image). Stable URLs that survive page edits.
//
// Super agents + coaches: still Unsplash stock placeholders. These are roles,
// not historical figures — they need a coherent generated avatar set (style
// gravure XIXè, watercolor, etc.) that DaVinci can produce in a dedicated
// pass.
//
// Fictional characters (Indiana, Alfred): no PD source — also placeholder
// until generated.

const PORTRAITS: Record<string, string> = {
  // ---- Genius wing — Wikimedia Commons (public domain) ----
  genius_davinci:   "https://upload.wikimedia.org/wikipedia/commons/c/cb/Francesco_Melzi_-_Portrait_of_Leonardo.png",
  genius_wolfgang:  "https://upload.wikimedia.org/wikipedia/commons/a/ad/The_Mozart_Family_-_Wolfgang_Amadeus_Mozart_headshot.jpg",
  genius_curie:     "https://upload.wikimedia.org/wikipedia/commons/c/c8/Marie_Curie_c._1920s.jpg",
  genius_tesla:     "https://upload.wikimedia.org/wikipedia/commons/7/79/Tesla_circa_1890.jpeg",
  genius_bronte:    "https://upload.wikimedia.org/wikipedia/commons/f/fc/Emily_Bront%C3%AB_by_Patrick_Branwell_Bront%C3%AB_restored.jpg",
  genius_homer:     "https://upload.wikimedia.org/wikipedia/commons/f/f1/Homer_At_the_British_Museum_2024_%283x4_cropped%29.jpg",
  genius_kubrick:   "https://upload.wikimedia.org/wikipedia/commons/5/59/Stanley_Kubrick_in_Dr._Strangelove_Trailer_%284%29_Cropped.jpg",
  genius_socrates:  "https://upload.wikimedia.org/wikipedia/commons/a/a4/Socrates_Louvre.jpg",
  genius_ride:      "https://upload.wikimedia.org/wikipedia/commons/0/0c/Sally_Ride_%281984%29.jpg",
  // Fictional — placeholders until generated avatars ship
  genius_indiana:   "https://images.unsplash.com/photo-1521119989659-a83eee488004?w=500&q=80",
  genius_alfred:    "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=500&q=80",

  // ---- Super wing (working hands — stylized portraits TBD) ----
  toscanini:        "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=500&q=80",
  consultant:       "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=500&q=80",
  scientist:        "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=500&q=80",
  financier:        "https://images.unsplash.com/photo-1556157382-97eda2d62296?w=500&q=80",
  lawyer:           "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=500&q=80",
  data_analyst:     "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&q=80",
  engineer:         "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=500&q=80",
  project_manager:  "https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=500&q=80",
  sales:            "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500&q=80",

  // ---- Coach wing ----
  coach_diet:       "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&q=80",
  coach_learning:   "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&q=80",
  coach_sport:      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80",
  coach_cooking:    "https://images.unsplash.com/photo-1607631568010-a87245c0daf8?w=400&q=80",
};

/** Fallback portrait when a slug has no registered image (custom experts
 * created via @Socrates, future experts before their portrait ships). The
 * gallery component reads the same Unsplash CDN so the failover is silent. */
const PORTRAIT_FALLBACK =
  "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=600&q=80";

export const getPortrait = (slug: string): string =>
  PORTRAITS[slug] ?? PORTRAIT_FALLBACK;
