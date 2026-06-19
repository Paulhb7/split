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
  /** Optional embeddable preview of the actual artifact this use case
   * produces. When set on at least one use case of an expert, the cabinet
   * detail page switches from a stacked-cards layout to a tabs-and-panels
   * layout — each tab shows the prompt + the preview + a launch CTA. */
  preview?: UseCasePreview;
}

/** A real deck served from `apps/desktop/public/expert-examples/<slug>/…`
 * (iframe-rendered, sandboxed) OR a styled placeholder we display while
 * the real artifact hasn't been generated yet. Discriminated on `kind`
 * so we can grow the preview vocabulary later (image, video, dashboard…)
 * without breaking existing entries. */
export type UseCasePreview =
  | { kind: "deck"; path: string; slides: number; title: string }
  | { kind: "placeholder"; note?: string };

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
  // ---- GENIUS HERO — immersive scenes ----
  // Powered by higgsfield-generate: an establishing image (Soul Location /
  // GPT Image) → a textured 3D model (multi_image_to_3d, .glb) + a cinematic
  // fly-through (Seedance image-to-video) + ambient sound (Mirelo), shipped as
  // a Three.js viewer. DaVinci still does brand identities / UI mockups /
  // static graphics, but the scene is the headline.
  genius_davinci: {
    tagline: "Give him an image. Explore the scene it implies.",
    useCases: [
      {
        hook: "to prototype a game level",
        prompt: "Drop in: a screenshot of a level concept. → A textured 3D model (.glb, Unity/Unreal/Godot-ready) + a fly-through clip + ambient sound, in a Three.js viewer.",
        preview: { kind: "placeholder", note: "Real 3D scene coming — run @DaVinci on this brief to populate." },
      },
      {
        hook: "to revisit a memory",
        prompt: "Drop in: a childhood photo (your bedroom, grandma's kitchen, the camp). → An orbitable 3D model of the place + a slow fly-through, with ambient sound, in the browser.",
        preview: { kind: "placeholder", note: "Real 3D scene coming — run @DaVinci on this brief to populate." },
      },
      {
        hook: "to scout a location",
        prompt: "Drop in: a reference image of a place (Lyon 1930s street, Tokyo back alley, Mars dome). → A 3D scout model + a cinematic move-through + an ambient mix for the scene.",
        preview: { kind: "placeholder", note: "Real 3D scout coming — run @DaVinci on this brief to populate." },
      },
      {
        hook: "for an architecture client",
        prompt: "Drop in: an architectural render. → An orbitable 3D model + a fly-through video with ambient sound — share the Three.js URL with your client.",
        preview: { kind: "placeholder", note: "Real 3D demo coming — run @DaVinci on this brief to populate." },
      },
    ],
    deliverables: [
      "Textured 3D model (.glb) of the scene — orbits in your browser",
      "Cinematic fly-through video (.mp4) through the place",
      "Ambient sound loop (.mp3) matched to the scene",
      "Deployable Three.js viewer (public URL) — share without installing",
      "Model importable in Unity / Unreal / Godot / Blender",
    ],
  },

  // ---- SUPER HERO ----
  consultant: {
    tagline: "He turns a fuzzy question into a sourced deck, ready to share.",
    // 'for a deck' goes first because it's the only use case with a real
    // preview today — opening the fiche should land the user on the real
    // artifact, not on a placeholder. Reorder the others once they have
    // real decks too.
    useCases: [
      {
        hook: "for a deck",
        prompt: "10 slides on the state of agentic AI in mid-2026 — what's real, what's hype, where to bet. Numbers and sources visible on every slide.",
        preview: {
          kind: "deck",
          path: "/expert-examples/consultant/agentic-ai-2026.html",
          slides: 11,
          title: "IA agentique — Brief 2026",
        },
      },
      {
        hook: "for an analysis",
        prompt: "Analyse Carrefour's cloud strategy vs Auchan and Lidl over the last 18 months. What's working, what's stuck, the bets in flight.",
        preview: { kind: "placeholder", note: "Real deck coming — run @Consultant on this brief to populate." },
      },
      {
        hook: "for a benchmark",
        prompt: "Compare Notion, Coda, Airtable and Linear for running a product roadmap with a team of 8. Criteria × tools matrix with scores, verdict by usage profile, real prices.",
        preview: { kind: "placeholder", note: "Real benchmark coming — run @Consultant on this brief to populate." },
      },
      {
        hook: "before a meeting",
        prompt: "Call tomorrow with the CEO of a French Series-B fintech. One-pager (single slide) — company, last raise thesis, 3 sharp questions to ask.",
        preview: { kind: "placeholder", note: "Real one-pager coming — run @Consultant on this brief to populate." },
      },
    ],
    deliverables: [
      "HTML deck packed with figures, sourced — 1 slide for a one-pager, 7–10 for a full analysis",
      "Markdown memo when the audience reads (board pre-read, advisory letter) — editable in-app",
    ],
  },

  // ---- SUPER, the data desk ----
  data_analyst: {
    tagline: "Drop a CSV. Get the dashboard, the answers, and what's off.",
    useCases: [
      {
        hook: "explore the data",
        prompt: "Here's 12 months of my Shopify sales — build me an interactive dashboard: top SKUs, geography, cohorts, monthly trend.",
        preview: { kind: "placeholder", note: "Real dashboard coming — run @Data Analyst on this brief to populate." },
      },
      {
        hook: "clean check",
        prompt: "Check this CSV for issues: duplicates, missing values, inconsistent types, suspicious outliers. List everything worth fixing before analysis.",
        preview: { kind: "placeholder", note: "Real cleanliness report coming — run @Data Analyst on this brief to populate." },
      },
      {
        hook: "ask the data",
        prompt: "Sales-lead CSV — which segments convert best? Why did July leads drop? Answer each question with a number and a chart.",
        preview: { kind: "placeholder", note: "Real Q&A report coming — run @Data Analyst on this brief to populate." },
      },
      {
        hook: "what changed",
        prompt: "Compare our Q3 vs Q4 2025 sales — what shifted, in which segments / products / regions, by how much.",
        preview: { kind: "placeholder", note: "Real diff report coming — run @Data Analyst on this brief to populate." },
      },
    ],
    deliverables: [
      "Interactive HTML dashboard — sortable, filterable",
      "Markdown report — findings, methodology, caveats, next questions",
      "Cleaned CSV when the source needs fixing",
    ],
  },

  // ---- SUPER, ships small web things ----
  engineer: {
    tagline: "He ships small, sharp web things — landing pages, apps, games — to a real URL.",
    useCases: [
      {
        hook: "a landing page",
        prompt: "Build me a landing page for [my startup / project / idea] — hero, 3 sections, signup form, deployable URL.",
        preview: { kind: "placeholder", note: "Real landing coming — run @Engineer on this brief to populate." },
      },
      {
        hook: "a small app",
        prompt: "Build me a small habit tracker — daily checkboxes, streak count, weekly view. Mobile-friendly, no login, deployable.",
        preview: { kind: "placeholder", note: "Real app coming — run @Engineer on this brief to populate." },
      },
      {
        hook: "a small game",
        prompt: "Build me a small browser game: 2048-style but with [twist]. Playable in 30 seconds, mobile-friendly.",
        preview: { kind: "placeholder", note: "Real game coming — run @Engineer on this brief to populate." },
      },
    ],
    deliverables: [
      "Deployed web app — public *.surge.sh URL via web-deploy",
      "Single-folder source code, ready to copy or fork",
      "Mobile-friendly by default — touch + small screens tested",
    ],
  },

  designer: {
    tagline: "He turns 'I want an app like…' into a gorgeous clickable mockup — you react, he refines, then hands it to Engineer to build.",
    useCases: [
      {
        hook: "an app mockup",
        prompt: "Design me a mockup for [a habit tracker / a dashboard / a booking app] — the key screens, real navigation, a polished dark UI. Fake data is fine.",
        preview: { kind: "placeholder", note: "Real mockup coming — run @Designer on this brief to populate." },
      },
      {
        hook: "a website",
        prompt: "Design me a landing-page mockup for [my startup] — a hero with a WebGL touch, three sections, sharp and modern. Interactive, fake content.",
        preview: { kind: "placeholder", note: "Real mockup coming — run @Designer on this brief to populate." },
      },
      {
        hook: "a redesign",
        prompt: "Here's a screenshot of [an app/site I use]. Redesign the main screen — same function, far better look and feel.",
        preview: { kind: "placeholder", note: "Real mockup coming — run @Designer on this brief to populate." },
      },
    ],
    deliverables: [
      "Interactive HTML mockup — clickable screens, motion, WebGL flourishes (fake data)",
      "2–3 style directions to pick from when the brief is open",
      "A build spec ready to hand to Engineer — screens, components, stack",
    ],
  },

  // ---- SUPER, money desk ----
  financier: {
    tagline: "He reads markets, reads filings, reads your bank statement — and turns them into a deck you can act on.",
    useCases: [
      {
        hook: "analyse a stock",
        prompt: "Deep-dive on Nvidia — financials, moat, risks, valuation vs peers. Slide deck I can share with my investment club.",
        preview: { kind: "placeholder", note: "Real deck coming — run @Financier on this brief to populate." },
      },
      {
        hook: "the market right now",
        prompt: "State of the market this week — what moved, why, what to watch. Deck format, sources visible.",
        preview: { kind: "placeholder", note: "Real deck coming — run @Financier on this brief to populate." },
      },
      {
        hook: "analyse my money",
        prompt: "Here's 6 months of my bank statement (CSV). Spending patterns, where I can save, propose a realistic budget.",
        preview: { kind: "placeholder", note: "Real personal-finance dashboard coming — run @Financier on this brief to populate." },
      },
      {
        hook: "model my startup",
        prompt: "Here's my startup (SaaS B2B, €40k MRR, growth 8%/m). Project runway, ARR, burn over 18 months. Editable model.",
        preview: { kind: "placeholder", note: "Real financial model coming — run @Financier on this brief to populate." },
      },
    ],
    deliverables: [
      "HTML deck for sharing — packed with figures, sourced",
      "Markdown memo when the audience reads (investment thesis, advisory letter)",
      "Interactive dashboard for personal finance + startup models",
    ],
  },

  // ---- SUPER, the bar ----
  lawyer: {
    tagline: "He drafts the contracts you need to sign, reads the ones you shouldn't, answers the questions you'd otherwise google for an hour.",
    useCases: [
      {
        hook: "review what I received",
        prompt: "My client sent me this freelance agreement (PDF). Read it, flag the traps, suggest 5 lines I should push back on before signing.",
        preview: { kind: "placeholder", note: "Real review coming — run @Lawyer on this brief to populate." },
      },
      {
        hook: "draft a contract",
        prompt: "Draft an NDA between my agency and a new client (FR, mutual, 3 years). Standard exclusions, no penalty clause.",
        preview: { kind: "placeholder", note: "Real contract draft coming — run @Lawyer on this brief to populate." },
      },
      {
        hook: "quick legal answer",
        prompt: "Can I use a competitor's product screenshot in my landing page (France, B2B, no logo shown)? Short answer + the article that applies.",
        preview: { kind: "placeholder", note: "Real answer coming — run @Lawyer on this brief to populate." },
      },
      {
        hook: "state of the law",
        prompt: "Where does French and EU law currently stand on training AI models on scraped public web data? Recent jurisprudence, regulator stance, practical guidance.",
        preview: { kind: "placeholder", note: "Real legal landscape brief coming — run @Lawyer on this brief to populate." },
      },
    ],
    deliverables: [
      "Annotated review of an incoming document (markdown memo with traps + pushback list)",
      "Drafted contract (.docx via legal-templates, FR/US variants, ready for review)",
      "Legal landscape brief (HTML deck) with statutes, jurisprudence, regulator stance",
    ],
  },

  // ---- SUPER, the research partner ----
  scientist: {
    tagline: "She maps fields and bridges them — sharpens vague intuitions into hypotheses you can test.",
    useCases: [
      {
        hook: "state of the art",
        prompt: "Where does the field of catalysis for green hydrogen stand right now? Key papers, consensus, open debates, who's leading. Sourced deck.",
        preview: { kind: "placeholder", note: "Real field map coming — run @Scientist on this brief to populate." },
      },
      {
        hook: "idea bridge",
        prompt: "Build me an analogy bridge between active inference (neuroscience) and reinforcement learning (ML). What testable predictions does the bridge yield?",
        preview: { kind: "placeholder", note: "Real bridge memo coming — run @Scientist on this brief to populate." },
      },
      {
        hook: "co-brainstorm",
        prompt: "I have a vague intuition that ageing might involve a failure in proteostasis. Sharpen this into 3 falsifiable hypotheses with what evidence would discriminate them.",
        preview: { kind: "placeholder", note: "Real hypothesis-sharpening notes coming — run @Scientist on this brief to populate." },
      },
    ],
    deliverables: [
      "Field map deck (HTML) — key papers, consensus, debates, open questions, every claim sourced",
      "Idea bridge memo (markdown) — the analogy, its load-bearing structure, the predictions it yields",
      "Hypothesis sharpening notes (markdown) — vague intuition → 3 falsifiable forms with discriminating evidence",
    ],
  },

  // ---- GENIUS, frontier science ----
  genius_curie: {
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
    tagline: "He turns 'we need X by Y' into a plan with owners, dates, and a list of what's actually at risk.",
    useCases: [
      {
        hook: "build the roadmap",
        prompt: "4 people, launch our consumer app by September 15. Phases, milestones, dependencies, owners, critical path. Flag what we'd cut if we're 3 weeks late.",
        preview: { kind: "placeholder", note: "Real roadmap coming — run @Project Manager on this brief to populate." },
      },
      {
        hook: "status report",
        prompt: "Where we are on 4 work streams: engineering MVP at 60%, design done, sales pipeline behind, hiring stuck. Write the status report I send to my board this Friday.",
        preview: { kind: "placeholder", note: "Real status report coming — run @Project Manager on this brief to populate." },
      },
      {
        hook: "retro a sprint",
        prompt: "Sprint just ended. Velocity 22 points vs 30 planned, 2 critical bugs hit, but the customer demo landed great. Run a structured retro and give me 3 changes for next sprint.",
        preview: { kind: "placeholder", note: "Real retro coming — run @Project Manager on this brief to populate." },
      },
    ],
    deliverables: [
      "Roadmap deck (HTML) — phases, milestones, owners, critical path, what gets cut under pressure",
      "Status report (markdown memo) — what shipped, what slipped, what's at risk, what's the call",
      "Retro notes (markdown) — what worked, what didn't, three changes for the next cycle",
    ],
  },

  // ---- GENIUS, frontier engineering ----
  // Signature: not "writes firmware" — the whole buildable kit, in one shot.
  // Use cases lean on the maker register (idea → order it tonight) over
  // the academic-engineer one (let me simulate this for a week).
  genius_tesla: {
    tagline: "He turns a hardware idea into something you can actually order and build.",
    useCases: [
      {
        hook: "from a maker idea",
        prompt: "Bedside lamp that glows softly when my partner's flight lands. Wi-Fi (ESP32), USB-C, soft-touch 3D-printed shade, lives on FlightAware's API. Schematic + PCB + firmware + printable enclosure + parts list.",
        preview: { kind: "placeholder", note: "Real buildable kit coming — run @Tesla on this brief to populate." },
      },
      {
        hook: "from a household problem",
        prompt: "My dog escapes the garden. Build me a GPS-geofenced collar that buzzes when she nears the fence — board, firmware, weatherproof casing, BOM. Configurable from a phone over BLE.",
        preview: { kind: "placeholder", note: "Real buildable kit coming — run @Tesla on this brief to populate." },
      },
      {
        hook: "from a teardown",
        prompt: "Drop in: a teardown photo / product page of a $80 commercial gadget. → What's inside (probable BOM), what it actually costs to make, what's marked up, what I'd swap if I built a v2.",
        preview: { kind: "placeholder", note: "Real teardown analysis coming — run @Tesla on this brief to populate." },
      },
      {
        hook: "to protect an idea",
        prompt: "I've got an idea: a coffee scale that auto-tares per shot and logs extraction time. 1-page invention disclosure — prior-art search, claim sketch, manufacturability flags.",
        preview: { kind: "placeholder", note: "Real disclosure coming — run @Tesla on this brief to populate." },
      },
    ],
    deliverables: [
      "Schematic PDF + routed PCB (Gerbers ready for JLCPCB)",
      "Embedded firmware (buildable PlatformIO project)",
      "3D-printable enclosure (STL + parametric OpenSCAD source)",
      "Sourcing-aware BOM (Mouser / DigiKey part numbers, price, lead time)",
      "1-page report — design choices, simulated performance, fab risks, v2 list",
      "Patent-grade invention disclosure (PDF) when the idea needs protecting",
    ],
  },

  // ---- GENIUS, long-form fiction ----
  // Progressive workflow: world bible → voice pick → chapter by chapter.
  // The hooks mirror Paul's pitch ("plan, style, chapter par chapitre") —
  // each use case maps to a stage so the user sees the flow at a glance.
  genius_bronte: {
    tagline: "She writes the novel you've been carrying — chapter by chapter, with a world that holds.",
    useCases: [
      {
        hook: "before any prose — the world",
        prompt: "Premise: a Parisian lawyer in 1872 discovers her dead father's archive contains evidence that absolves a man hanged 20 years prior. Build the world bible — characters, places, the legal/historical layer — and outline 24 chapters.",
        preview: { kind: "placeholder", note: "Real world bible + outline coming — run @Brontë on this brief to populate." },
      },
      {
        hook: "pick the voice",
        prompt: "After the outline: draft the opening 800 words in three voices — terse contemporary, Victorian gothic, Borgesian metafiction. I'll pick the one we hold for the whole book.",
        preview: { kind: "placeholder", note: "Real voice samples coming — run @Brontë on this brief to populate." },
      },
      {
        hook: "write Chapter N",
        prompt: "Write Chapter 3 — Camille visits the convict's widow. 1872, Faubourg Saint-Antoine. Restrained lyrical, dialogue-heavy. ~4000 words. Hold the voice we picked.",
        preview: { kind: "placeholder", note: "Real chapter coming — run @Brontë on this brief to populate." },
      },
      {
        hook: "for a children's book",
        prompt: "32-page illustrated children's book for ages 6–8: a girl who lives with her grandfather in a Greek lighthouse and adopts a lost migrating bird. Pair each spread with an image brief @DaVinci can run.",
        preview: { kind: "placeholder", note: "Real children's book coming — run @Brontë on this brief to populate." },
      },
    ],
    deliverables: [
      "World bible folder (characters, places, timelines, rules) — exportable",
      "Chapter-by-chapter outline, revised as the boss redirects",
      "Voice-sample drafts so the boss picks the register before chapter 1",
      "Real prose chapters (~3-5k words each) — `.docx` per chapter, versioned",
      "Master `book.docx` regenerated as chapters land",
      "Private read-along site (deployed URL) for between-session reading",
    ],
  },

  // ---- GENIUS, the sky, live ----
  // Signature: each output is a deployed HTML page tied to live NASA/ESA
  // data (not a static deck). The artifact you can re-open tomorrow and
  // it tells you something new.
  genius_ride: {
    tagline: "She reads the sky live — and ships you a page that keeps updating with it.",
    useCases: [
      {
        hook: "for tonight",
        prompt: "Tonight's sky from Paris (or wherever I am). Planets, ISS passes, moon phase, deep-sky targets a 70mm scope handles. Ship a deployed page I can open on my phone outside.",
        preview: { kind: "placeholder", note: "Real interactive sky map coming — run @Ride on this brief to populate." },
      },
      {
        hook: "live from a mission",
        prompt: "What Perseverance did this past month on Mars — drives, samples cached, instruments fired, latest navcam / mastcam shots. Deployed brief with annotated photos, sources visible.",
        preview: { kind: "placeholder", note: "Real mission brief coming — run @Ride on this brief to populate." },
      },
      {
        hook: "to understand something",
        prompt: "10-slide deployed explainer on exoplanet detection — transit, radial velocity, direct imaging, microlensing. One real example each from the literature, sourced.",
        preview: { kind: "placeholder", note: "Real explainer deck coming — run @Ride on this brief to populate." },
      },
      {
        hook: "for a kid's project",
        prompt: "My 9-year-old wants a poster about Jupiter's moons. Pull the best photos from NASA / ESA archives, write a kid-friendly 1-page explainer for each Galilean moon.",
        preview: { kind: "placeholder", note: "Real Jupiter poster coming — run @Ride on this brief to populate." },
      },
    ],
    deliverables: [
      "Live interactive HTML page (deployed URL) — sky map, mission tracker, explainer",
      "Annotated mission briefs (JWST, Mars rovers, Hubble, ISS, …) with sources",
      "ISS / spacecraft pass timelines, location-aware",
      "Educational explainer decks (Sagan register, sourced)",
      "Astronomy event calendar (.ics) for the year, importable",
    ],
  },

  // ---- GENIUS, music ----
  // Cross-modal: inputs can be image, poem, video, or pure prompt.
  // The signature move is the translation — "what does this painting
  // sound like" — not "generate a song from a description".
  genius_wolfgang: {
    tagline: "He composes what plays in your head — but actually playable.",
    useCases: [
      {
        hook: "from a picture",
        prompt: "Drop in: a painting / photo / album cover. → Compose what it sounds like, ~90 seconds. Tell me which mood you read off the image.",
        preview: { kind: "placeholder", note: "Real composition coming — run @Wolfgang on this brief to populate." },
      },
      {
        hook: "from a poem",
        prompt: "Drop in: a poem. → Set it to music — sung or instrumental, your call. Explain why the form fits the words.",
        preview: { kind: "placeholder", note: "Real composition coming — run @Wolfgang on this brief to populate." },
      },
      {
        hook: "as a personal gift",
        prompt: "Compose a song for Sarah's 30th birthday. Smoky jazz piano, tender, mentions her dog Mochi and Lyon in winter. ~2 minutes.",
        preview: { kind: "placeholder", note: "Real composition coming — run @Wolfgang on this brief to populate." },
      },
      {
        hook: "for a brand",
        prompt: "Compose the audio logo of Lumen, a meditation app — 4 seconds, soft, breathy, ending on a clear bell.",
        preview: { kind: "placeholder", note: "Real audio logo coming — run @Wolfgang on this brief to populate." },
      },
    ],
    deliverables: [
      "Mastered MP3 + lossless WAV",
      "Stems (vocals / piano / strings / drums separated)",
      "Lyrics sheet (when sung)",
      "Cover art paired with @DaVinci",
    ],
  },

  // ---- GENIUS, podcasts & audiobooks ----
  // Two distinct medium-shaped jobs under one persona: scripted multi-voice
  // audio (podcast / interview) and long-form single-voice audio
  // (audiobook). The fiche surfaces both so users see the spread.
  genius_homer: {
    tagline: "He records the audio you wish someone would publish.",
    useCases: [
      {
        hook: "for a podcast episode",
        prompt: "Topic: the strange history of standard time zones (Sandford Fleming, 1879, the railway hearings). 20-minute podcast — narrated + two voiced quotes, intro / outro music bed.",
        preview: { kind: "placeholder", note: "Real episode coming — run @Homer on this brief to populate." },
      },
      {
        hook: "for an imagined interview",
        prompt: "A 30-minute conversation between Hannah Arendt and a 2026 AI ethicist. Scripted, two distinct voices, lightly scored.",
        preview: { kind: "placeholder", note: "Real interview coming — run @Homer on this brief to populate." },
      },
      {
        hook: "for an audiobook",
        prompt: "Drop in: my manuscript (.docx, 8 chapters). → Voice the whole book — one narrator, chapter-by-chapter MP3s, mastered, chaptered file ready for Audible.",
        preview: { kind: "placeholder", note: "Real audiobook coming — run @Homer on this brief to populate." },
      },
      {
        hook: "as a daily brief",
        prompt: "Daily 5-minute briefing on the AI agent space — 3 stories, sourced, voiced, deployable as an RSS feed.",
        preview: { kind: "placeholder", note: "Real daily brief coming — run @Homer on this brief to populate." },
      },
    ],
    deliverables: [
      "Mastered MP3 episode — intro music + segments + outro",
      "Per-chapter MP3 folder for audiobook projects, with a chaptered master file",
      "Transcript (`.md`) + show notes for each episode",
      "Distributable RSS feed for series",
      "Cover art paired with @DaVinci",
    ],
  },

  // ---- GENIUS, short film ----
  // Kept narrow on purpose: short, single-mood pieces (teaser / ad /
  // Ken-Burns / music video). Multi-shot coherence is the hard part —
  // the persona is honest about that.
  genius_kubrick: {
    tagline: "He makes the 30-second film the story deserves.",
    useCases: [
      {
        hook: "for a teaser",
        prompt: "30-second teaser for a noir short — rainy Tokyo back alley, 1985. Three shots, one line of voiceover, swelling synth score.",
        preview: { kind: "placeholder", note: "Real teaser coming — run @Kubrick on this brief to populate." },
      },
      {
        hook: "for a brand ad",
        prompt: "20-second ad for Lumen, a meditation app for parents. Calm, no narration, breath-paced cuts, soft piano outro. Vertical + horizontal versions.",
        preview: { kind: "placeholder", note: "Real ad coming — run @Kubrick on this brief to populate." },
      },
      {
        hook: "from a single photo",
        prompt: "Drop in: a single photo. → A 15-second Ken-Burns cinematic clip — slow push, ambient sound, one line of narration.",
        preview: { kind: "placeholder", note: "Real clip coming — run @Kubrick on this brief to populate." },
      },
      {
        hook: "for a music video",
        prompt: "Drop in: a 60-second track from @Wolfgang. → Cut a music video to it — 4 shots, single mood, ready for vertical + horizontal.",
        preview: { kind: "placeholder", note: "Real music video coming — run @Kubrick on this brief to populate." },
      },
    ],
    deliverables: [
      "MP4 cut (1080p, horizontal + vertical variants)",
      "Shot list / storyboard (`.md`) — locked before generation",
      "Voiceover stems (`.mp3`)",
      "Score paired with @Wolfgang",
      "Source asset folder for re-edits",
    ],
  },

  // ---- GENIUS, majordome ----
  // Drives both the user's Mac (cua-driver) and a controlled browser
  // (browser-use). Reversible by default — stops before any
  // pay/submit/send for explicit go. Cf. the app-rail viewer (planned)
  // for the in-app "watch him work" experience.
  genius_alfred: {
    tagline: "Your majordome. He drives your Mac and your browser with your logins, so you don't have to.",
    useCases: [
      {
        hook: "for the boring admin",
        prompt: "Open URSSAF, log in, fill the quarterly declaration with the numbers in the attached CSV, get to the final preview — then stop and let me confirm before submitting.",
        preview: { kind: "placeholder", note: "Real admin run coming — run @Alfred on this brief to populate." },
      },
      {
        hook: "for a booking",
        prompt: "Train from Paris to Lyon next Thursday after 6pm. First class if under €120, else second. Window seat. Hold before payment so I confirm.",
        preview: { kind: "placeholder", note: "Real booking run coming — run @Alfred on this brief to populate." },
      },
      {
        hook: "for a Mac chore",
        prompt: "Sort every PDF in Downloads from this year into folders by month inside Documents/2026/. Rename them <YYYY-MM-DD>-<original>. Leave a one-line summary at the top.",
        preview: { kind: "placeholder", note: "Real Mac chore coming — run @Alfred on this brief to populate." },
      },
      {
        hook: "for inbox triage",
        prompt: "Open Mail.app. Draft replies to the unread emails from this week that need a one-line answer. Leave them in Drafts — don't send.",
        preview: { kind: "placeholder", note: "Real inbox triage coming — run @Alfred on this brief to populate." },
      },
    ],
    deliverables: [
      "Action log — each step (click, type, confirm) with screenshots",
      "Final state — confirmation number, draft saved, URL of the last page",
      "App rail showing where he acted (Mail, Finder, Safari / Chromium, …)",
      "Reversible by default — stops before any pay / submit / send for explicit go",
    ],
  },

  // ---- COACH, nutrition ----
  // Coaches share a signature pattern: an evolving `me.md` companion file
  // that lives in the workspace, never deploys, persists across sessions.
  // The coach reads it at session start, updates it at end — it's the
  // memory that makes them feel like a real partner. Cooking is the
  // exception: cooking is ponctual, not progressive, so no companion.
  coach_diet: {
    tagline: "She turns your goals into a weekly grid you can shop, cook, and stick to.",
    useCases: [
      {
        hook: "weekly meal plan",
        prompt: "7-day plan: lose 0.5 kg/week, 1900 kcal, Mediterranean, no fish on Mondays, 30-min max prep. With shopping list.",
        preview: { kind: "placeholder", note: "Real meal-plan deck coming — run @Diet Coach on this brief to populate." },
      },
      {
        hook: "decode a label",
        prompt: "Read this Activia yogurt label and a Picard frozen lasagna. What's in them — calories, macros, red flags.",
        preview: { kind: "placeholder", note: "Real decode report coming — run @Diet Coach on this brief to populate." },
      },
      {
        hook: "swap on the fly",
        prompt: "Butternut squash, 3 onions, half a halloumi, 2h. Dinner for 2 — vegetarian, no oven.",
        preview: { kind: "placeholder", note: "Real recipe coming — run @Diet Coach on this brief to populate." },
      },
      {
        hook: "weekly check-in",
        prompt: "Followed your plan Mon-Wed, fell off Thu-Sun (restaurant + birthday). What do I adjust this week?",
        preview: { kind: "placeholder", note: "Real check-in coming — run @Diet Coach on this brief to populate." },
      },
    ],
    deliverables: [
      "`me.md` companion — evolving plan + history + check-ins, stays local, editable in Split",
      "Weekly meal-plan deck (HTML) — daily grid, shopping list, timed prep",
      "Nutrition decode (markdown) — what's in it, red flags, alternatives",
    ],
  },

  // ---- COACH, learning ----
  coach_learning: {
    tagline: "She turns 'I want to learn X' into a paced program with daily blocks and weekly checks.",
    useCases: [
      {
        hook: "map a syllabus",
        prompt: "Learn Rust deeply in 3 months, 1h/day. Week-by-week plan with daily blocks, resources, exit criteria.",
        preview: { kind: "placeholder", note: "Real syllabus coming — run @Learning Coach on this brief to populate." },
      },
      {
        hook: "flashcards",
        prompt: "50 spaced-repetition cards on macroeconomics 101 — definitions, formulas, common confusions.",
        preview: { kind: "placeholder", note: "Real flashcards coming — run @Learning Coach on this brief to populate." },
      },
      {
        hook: "explain it",
        prompt: "I'm stuck on Bayesian inference. 10-slide Feynman-style explanation — concrete, no jargon, real example.",
        preview: { kind: "placeholder", note: "Real explainer deck coming — run @Learning Coach on this brief to populate." },
      },
      {
        hook: "weekly recalibration",
        prompt: "Week 4 of GMAT prep, weak on quant data sufficiency. What do I focus on next?",
        preview: { kind: "placeholder", note: "Real check-in coming — run @Learning Coach on this brief to populate." },
      },
    ],
    deliverables: [
      "`me.md` companion — living syllabus + completed weeks + next checkpoints, stays local, editable in Split",
      "Explainer deck (HTML) per concept — Feynman-style, dense, concrete",
      "Flashcards (markdown) — definitions, formulas, common confusions",
    ],
  },

  // ---- COACH, sport ----
  coach_sport: {
    tagline: "He builds training blocks that progress you safely — and keeps you moving when life gets in the way.",
    useCases: [
      {
        hook: "training cycle",
        prompt: "4-week block to prep my first 10k, currently 30min 5k. 4 sessions/week, 2 lifting + 2 running.",
        preview: { kind: "placeholder", note: "Real cycle deck coming — run @Sport Coach on this brief to populate." },
      },
      {
        hook: "today's session",
        prompt: "Push day, 75 min, gym, building toward 100kg bench. Full session: warm-up, main, accessory, cool-down.",
        preview: { kind: "placeholder", note: "Real session card coming — run @Sport Coach on this brief to populate." },
      },
      {
        hook: "form check",
        prompt: "Squat: I keep collapsing forward at the bottom. Causes, cues, drills to fix it.",
        preview: { kind: "placeholder", note: "Real form note coming — run @Sport Coach on this brief to populate." },
      },
      {
        hook: "deload or push",
        prompt: "Hard 3 weeks, knee tweaky, sleep crap. Deload, full week off, or push through? Math on it.",
        preview: { kind: "placeholder", note: "Real verdict coming — run @Sport Coach on this brief to populate." },
      },
    ],
    deliverables: [
      "`me.md` companion — active block + logged sessions + injury history + sleep flags, stays local, editable in Split",
      "Session card (HTML deck) — printable, phone-friendly, timed warm-up to cool-down",
      "Form & recovery notes (markdown) — common errors, cues, drills, video refs",
    ],
  },

  // ---- COACH, cooking (no companion — cooking is ponctual) ----
  coach_cooking: {
    tagline: "He writes you recipes you'll actually cook — scales them, swaps what's missing, teaches the techniques behind them.",
    useCases: [
      {
        hook: "write a recipe",
        prompt: "Comfort food, low effort, vegetarian, 45 min, feeds 4. Cold autumn night vibe.",
        preview: { kind: "placeholder", note: "Real recipe coming — run @Cooking Coach on this brief to populate." },
      },
      {
        hook: "scale it",
        prompt: "My pesto pasta recipe for 4 — recompute for 10, salt and herbs aren't linear, feeding kids + adults.",
        preview: { kind: "placeholder", note: "Real scaled recipe coming — run @Cooking Coach on this brief to populate." },
      },
      {
        hook: "what's in the fridge",
        prompt: "Fridge: 2 zucchini, half a feta, 4 eggs, mint, half-finished chickpeas. Dinner for 3 in 30 min.",
        preview: { kind: "placeholder", note: "Real fridge-dinner coming — run @Cooking Coach on this brief to populate." },
      },
      {
        hook: "teach a technique",
        prompt: "Teach me proper béchamel — cue table (color/sound/viscosity), common mistakes, what to do if it splits.",
        preview: { kind: "placeholder", note: "Real technique card coming — run @Cooking Coach on this brief to populate." },
      },
    ],
    deliverables: [
      "Recipe (markdown) — timed steps, scaling table, ingredient cues",
      "Visual technique card (HTML deck) — single dense card with images and a cue table",
      "Pantry meal plan (markdown) — 3 dinners from what's already in your fridge",
    ],
  },

  // Other experts get "coming soon" until curated.
};
