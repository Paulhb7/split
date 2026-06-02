// Curated content per expert for the cabinet sub-pages: use cases the user can
// click to launch, deliverables the agent produces, and one real example
// output that anchors the promise. Filled in expert-by-expert — slugs without
// an entry render a "coming soon" stub on their detail page.
//
// Editorial guideline: use cases are written as the SENTENCE THE USER WOULD
// TYPE TO THE AGENT, not abstract feature names. Concrete > generic.

export interface UseCase {
  /** Click target — the exact prompt fired at the agent, verbatim. */
  prompt: string;
  /** Short tagline above the prompt (e.g. "for a pitch deck"). */
  hook: string;
}

export interface ExpertExample {
  /** What the user gets back: file kind + a short label. */
  kind: "image" | "audio" | "video" | "site" | "doc" | "deck";
  /** Path under apps/desktop/public/expert-examples/<slug>/ — relative URL. */
  src: string;
  /** Short caption shown under the artifact. */
  caption: string;
}

export interface ExpertContent {
  /** One-line discipline statement shown right under the agent's name.
   * Style: poetic + concrete. "He composes what plays in your head." */
  tagline: string;
  /** 3–5 starter prompts the user can fire from the detail page. */
  useCases: UseCase[];
  /** Concrete artifacts produced — phrased as nouns the user can picture. */
  deliverables: string[];
  /** Optional curated example output (anchors the promise visually). */
  example?: ExpertExample;
}

// Keyed by expert slug. Adding a new expert here unlocks its detail page.
export const EXPERT_CONTENT: Record<string, ExpertContent> = {
  // ---- GENIUS HERO ----
  designer: {
    tagline: "He builds entire visual universes — places you can step into.",
    useCases: [
      {
        hook: "for a fantasy novel",
        prompt: "Build the visual universe of a fantasy novel set on a floating archipelago in perpetual sunset. Style: Studio Ghibli meets Wes Anderson. 20 reference frames.",
      },
      {
        hook: "for a new product",
        prompt: "Design the full brand universe of Lumen, a meditation app for parents. Logo, color system, type pairings, mascot, in-product mood, marketing scenes.",
      },
      {
        hook: "for a short film",
        prompt: "Concept art for a short film: Lyon in the 1930s, ambiance Wes Anderson. 30 reference frames covering locations, costumes, props, color script.",
      },
      {
        hook: "for an album",
        prompt: "Visual identity for an album titled 'Halcyon Rooms' — dream pop, melancholic, intimate. Cover, inserts, animated visualiser, single covers.",
      },
    ],
    deliverables: [
      "World bible PDF (locations, characters, props, color script)",
      "Reference frame set (20+ coherent images)",
      "Brand kit (logo, type, palette, usage rules)",
      "Deployed mood site (shareable URL)",
      "Editable Figma source for the brand kit",
    ],
    example: {
      kind: "image",
      src: "/expert-examples/designer/halcyon-rooms.jpg",
      caption: "Halcyon Rooms — album visual universe (12 cover frames + inserts)",
    },
  },

  // ---- SUPER HERO ----
  consultant: {
    tagline: "He turns a fuzzy question into a structured brief — in minutes.",
    useCases: [
      {
        hook: "for a market scan",
        prompt: "Brief me on the EV market outlook for 2026 — top drivers, key players, where the margin moves. Deck format.",
      },
      {
        hook: "before a meeting",
        prompt: "I have a 30-min meeting tomorrow with the CEO of a Series-B fintech. Brief me on their company, their last raise thesis, and 3 sharp questions to ask.",
      },
      {
        hook: "for a write-up",
        prompt: "Draft a 2-page memo on the state of agentic AI in mid-2026 — what's real, what's hype, what to bet on. Cite sources.",
      },
    ],
    deliverables: [
      "Structured Markdown brief with citations",
      "Slide deck (Keynote-ready) for sharing",
      "Word memo for circulation",
      "One-pager PDF for execs",
    ],
  },

  // ---- GENIUS, frontier science ----
  curie: {
    tagline: "She runs the experiments only specialists run — at your bench.",
    useCases: [
      {
        hook: "from a protein sequence",
        prompt: "Predict the 3D structure of this protein with AlphaFold and return a viewable PDB + per-residue confidence. Sequence: MKVLWAALLVTFLAGCQAKVEQAVETEPEPELRQQTEWQSGQRWELALGRFW...",
      },
      {
        hook: "for drug discovery",
        prompt: "Design 10 small-molecule candidates that bind to BRCA1 with high predicted affinity. Optimize for Lipinski compliance and synthesizability. Return SMILES, 3D conformers, predicted IC50.",
      },
      {
        hook: "molecular dynamics",
        prompt: "Run a 50 ns molecular dynamics simulation of the SARS-CoV-2 spike protein bound to ACE2 receptor. Report RMSD, RMSF, and hydrogen-bond timeline. Flag any unbinding events.",
      },
      {
        hook: "materials prediction",
        prompt: "Predict the band gap and conductivity of these 5 candidate perovskite compositions using DFT. Rank for photovoltaic potential.",
      },
    ],
    deliverables: [
      "PDB file (3D structure) + interactive NGL/Mol* viewer",
      "SMILES + 3D conformers for designed molecules",
      "MD trajectory + analysis report (RMSD, RMSF, contacts)",
      "1-page scientific report (LaTeX-rendered PDF)",
      "Confidence intervals + reproducibility commands",
    ],
    example: {
      kind: "image",
      src: "/expert-examples/curie/spike-ace2-fold.jpg",
      caption: "SARS-CoV-2 spike + ACE2 — AlphaFold prediction, pLDDT 87",
    },
  },

  // ---- SUPER, execution ----
  project_manager: {
    tagline: "He turns 'we need X by Y' into a real plan with owners, dates, and what's actually at risk.",
    useCases: [
      {
        hook: "for a launch",
        prompt: "We're 4 people, we want to launch our consumer app by September 15. Build the plan: phases, milestones, dependencies, owners, critical path. Flag what we'd cut if we're 3 weeks late.",
      },
      {
        hook: "for an investor update",
        prompt: "Here's where we are on 4 work streams: engineering MVP at 60%, design done, sales pipeline behind, hiring stuck. Write the status report I send to my board this Friday.",
      },
      {
        hook: "for a retro",
        prompt: "Sprint just ended. Velocity 22 points vs. 30 planned, 2 critical bugs hit, but the customer demo landed great. Run a structured retro and give me 3 changes for next sprint.",
      },
      {
        hook: "for risk planning",
        prompt: "We're 6 weeks from launch. Surface the top 8 risks with likelihood × impact, early-warning signals, and mitigation owners.",
      },
    ],
    deliverables: [
      "Plan document (.docx) — phases, milestones, owners, dates",
      "Gantt chart (interactive HTML, deployable URL)",
      "Status report (.docx + dashboard URL)",
      "Risk register (.csv with likelihood/impact/mitigation)",
      "Retro notes (Mural-style, exportable)",
      "RACI matrix when team > 6 people",
    ],
  },

  // ---- GENIUS, frontier engineering ----
  tesla: {
    tagline: "He sketches circuits and contraptions you couldn't dream up alone.",
    useCases: [
      {
        hook: "for a device idea",
        prompt: "Design a tiny battery-powered (3xAAA) device that wakes on detected motion, captures temperature + humidity, and ships the reading over BLE to a phone. Schematic, PCB, firmware, BOM.",
      },
      {
        hook: "for power electronics",
        prompt: "Design a 100W flyback converter, 48V in → 12V out, isolated, with overcurrent protection. SPICE-simulate efficiency over load, return waveforms and BOM.",
      },
      {
        hook: "for a mechanism",
        prompt: "Design a parametric 3D-printable phone stand that fits any phone 60–80mm wide, holds it at 65°, and folds flat for travel. Print files + tolerance review.",
      },
      {
        hook: "for a patent disclosure",
        prompt: "I have an idea for a coffee scale that auto-tares per shot and logs extraction time. Write a 1-page invention disclosure with prior-art search + claim sketch.",
      },
    ],
    deliverables: [
      "Schematic PDF + routed PCB (Gerbers ready for JLCPCB)",
      "Embedded firmware project (buildable PlatformIO repo)",
      "3D CAD files (STL + step-by-step OpenSCAD source)",
      "SPICE / FEMM simulation results with waveforms",
      "Sourcing-aware BOM (Mouser/DigiKey part numbers, price, lead time)",
      "1-page invention disclosure (PDF, with prior-art references)",
    ],
  },

  // ---- GENIUS, long-form fiction ----
  novelist: {
    tagline: "He writes the novel you've been carrying — chapter by chapter, with a world that holds.",
    useCases: [
      {
        hook: "for a novel idea",
        prompt: "I have a premise: a Parisian lawyer in 1872 discovers her dead father's archive contains evidence that absolves a man hanged 20 years prior. Build the world bible — characters, places, the legal/historical layer — and outline 24 chapters.",
      },
      {
        hook: "to write a chapter",
        prompt: "Write Chapter 3 of the novel — the one where Camille visits the convict's widow. Period: 1872, Paris, Faubourg Saint-Antoine. Tone: restrained lyrical, dialogue heavy. Around 4000 words.",
      },
      {
        hook: "for a short story",
        prompt: "Write a 6000-word short story in the spirit of late Maupassant — a country doctor in Normandie 1888, a patient who returns three times claiming to recover from a different illness each time. Real prose, real voice.",
      },
      {
        hook: "for a children's book",
        prompt: "Write a 32-page illustrated children's book for ages 6–8 about a girl who lives with her grandfather in a Greek lighthouse and adopts a lost migrating bird. Pair each spread with an image brief @DaVinci can run.",
      },
    ],
    deliverables: [
      "World bible (characters, places, timelines, rules) as folder + docx",
      "Chapter-by-chapter outline, revised as the boss redirects",
      "Real prose chapters (~3-5k words each) — `.docx` per chapter",
      "Master `book.docx` regenerated as chapters land",
      "Bibliography + research notes folder",
      "Private read-along site (deployed URL) for between-session reading",
    ],
  },

  // ---- GENIUS, music ----
  musician: {
    tagline: "He composes what plays in your head — but actually playable.",
    useCases: [
      {
        hook: "as a personal gift",
        prompt: "Compose a song for Sarah's 30th birthday. Smoky jazz piano, tender, mentions her dog Mochi and Lyon in winter. 2 minutes.",
      },
      {
        hook: "for a video",
        prompt: "Score a 90-second wedding teaser — emotional, cinematic, builds to a swell at the kiss. Warm strings + soft piano.",
      },
      {
        hook: "for a brand",
        prompt: "Compose the audio logo of Lumen, a meditation app — 4 seconds, soft, breathy, ending on a clear bell.",
      },
    ],
    deliverables: [
      "Mastered MP3 + lossless WAV",
      "Lyrics sheet (when sung)",
      "Stems (vocals / piano / strings / drums separated)",
      "Cover art (paired with @DaVinci)",
    ],
  },

  // Other experts get "coming soon" until curated.
};
