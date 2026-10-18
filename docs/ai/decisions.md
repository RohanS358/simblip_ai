# AI decision log (append, never rewrite)

Format: date · decision · evidence · what would change it.

## 2026-10-16 — Sketch Phase S0: IR, compiler, gold set

- **Scene IR** lives in `lib/sketch/ir.ts` (zod), exactly as Appendix A.
- **Compiler** (`lib/sketch/compile.ts`) handles `circuit` and `digital`. Other
  domains return an `unsupported-domain` error until Phase S4 — never a guess.
- **No x/y in auto mode.** The sketch only has to be topologically right; the
  schematic layout draws it. `layout: 'keep'` places by bbox + pose instead.
- **Pins are validated against `ANCHOR_INDEX`** (the same table the SimScript
  linter reads), not a second copy. Pins that are not JS identifiers (`in+`,
  `ctrl-`, `secondary+` …) are emitted as the alias the runtime resolves.
- **Every emitted script is run through `lintSimScript`.** A lint failure is
  reported as a compiler bug (`code: 'lint'`), never blamed on the IR.
- **Doubts the compiler adds:** battery with no readable voltage (defaults to
  9 V — the one default we allow); any value that cannot be parsed
  (`unreadable-value`); node confidence < 0.6 (`low-confidence`); edge
  confidence < 0.6 (`ambiguous-junction`).
- **Values:** `values` keys must be parameters the part actually has
  (`PARAMS` in compile.ts, from `simscript-component-reference.md`). A bare label
  beside a part fills its main parameter only if its unit (if any) agrees.
- **Gold set:** 44 IR files in `scripts/ai/sketch/gold/`, generated from compact
  netlists by `build-gold.mjs` (re-run it after editing; commit the JSON).
  Each carries numeric `expect`ations that the *real* circuit engine must meet.
- **Exit test:** `node --experimental-strip-types --test lib/sketch/compile.test.mjs`
  (also in `npm run test:ai`). Asserts compile < 20 ms, lint clean, one scene
  part per node, one wire per edge, finite readings, and expectations.
- **No feature flag in S0:** nothing user-visible changed. Flags start in S2
  (SketchNet in the pen+hold path).
- **Open:** pin ↔ pose mapping for `layout: 'keep'` is not derived from
  `terminalsOf()` yet — rotation is passed through. Revisit with Phase S3's ghost UI.

## 2026-10-17 — Sketch Phase S1: synthetic-first data, real data kept separate

- **Priority change (Rohan):** the collection session is not a blocker. Build and
  evaluate on synthetic data first; `/train` stays the way to collect real
  sketches later.
- **Audience:** engineering students; ANSI zigzag resistor and ANSI/US curved
  gates; devices mouse/touchpad > finger > pen. Writer mix in the generator is
  40 % mouse, 30 % touchpad, 25 % finger, 5 % pen.
- **Wave-1 classes (21 + unknown):** battery resistor capacitor inductor switch
  bulb led diode gnd ac-source voltmeter ammeter and/or/xor/nand/nor/not-gate
  bjt mosfet opamp. `lib/sketch/classes.ts`; every id is checked against
  `KNOWN_KINDS` in the tests. Resistor, capacitor, inductor, bulb, ac-source and
  the meters are 180°-symmetric, so their pose labels fold (0/90 only).
- **Glyphs are hand-authored stroke skeletons** (`lib/sketch/glyphs.ts`), not
  extracted from `part-art.tsx`: that file returns JSX, and a rendered symbol is
  not how a hand draws (pen lifts between lead and body). Deviation from the
  plan's §5.1 wording; the plan's intent (class shapes → strokes, with variants)
  is kept.
- **One record format for every source** (`lib/sketch/dataset.ts`): `source` is
  `synthetic | synthetic-negative | real | public`. Training reads any mix;
  **every metric is reported per source** (`groupOf` in
  `scripts/ai/sketch/dataset.mjs`). A synthetic number is never pooled with, or
  quoted as, a real one. Real shards are just another directory of
  `*.jsonl.gz` — no pipeline change.
- **Splits are by writer** even for synthetic data (70/15/15 of simulated
  writers), and `iterDir` checks each shard against `MANIFEST.json`.
- **Data lives in `data/sketch/` (git-ignored).** Regenerate with
  `npm run sketch:synth -- --seed 1 --writers 500 --reps 18` (207,000 samples,
  ~100 MB, ~70 s). Look at it with `npm run sketch:preview`.
- **Collection data must NOT go into `simblip_sketch_templates`.** That table
  feeds every user's live matcher and stores the contributor's full name. The
  guided `/train` mode will write to a separate table with an anonymous writer
  code and a consent version; nothing is uploaded without explicit consent
  (`docs/ai/sketch-consent.md`, draft).
- **Baseline (SYNTHETIC only):** the existing feature + CART recogniser scores
  55.3 % top-1 / 73.9 % top-3 on 31,050 samples from 75 unseen synthetic writers
  (trained on ≤100 samples/class). Weakest: gates with bubbles/curves, meters,
  ac-source, bjt. This is a baseline for SketchNet on the synthetic world only;
  the **real-world baseline does not exist yet** and the report says so.
  The $P template matcher is not included (it lives behind the cloud store);
  add it when real data exists.
- **Open:** the generator's realism is unverified against real strokes. Look at
  the contact sheet; weight real data heavily as soon as any exists.

## 2026-10-18 — Sketch Phase S2: SketchNet v1

- **Model:** 116,570 parameters — four Conv-BN-ReLU-Pool blocks on a 2×32×32 image
  (whole drawing + lead-stripped body), a 64-unit GRU on 64 resampled stroke
  points (x, y, penUp, turn), a 128-unit class head (21 classes + `unknown`) and a
  4-way pose head. Label smoothing 0.05, pose loss 0.5, AdamW + one-cycle, 30
  epochs (~2.5 min on the RTX 4060). Class temperature fitted on the VALIDATION
  split and folded into the class head, so `softmax(logits)` is calibrated.
- **Preprocessing exists once, in TypeScript** (`lib/sketch/preprocess.ts`). The
  exporter runs it over the shards and Python only reads the resulting tensors —
  no Python port of `normalizeStrokes`/`stripLeads` to drift. Images are stored
  and used in whole 1/255 steps so browser and training agree exactly.
- **No ONNX Runtime in the browser** (deviation from plan §6.4). The network is
  small enough for a ~150-line hand-written forward pass, which avoids a ~10 MB
  WASM binary and a worker. The `.onnx` is still exported and checked against
  PyTorch (max logit difference 1.1e-5); the TypeScript pass is checked against
  the same PyTorch logits (golden vectors, max difference 3.5e-6 in Chrome).
- **No int8 quantisation:** the whole model is 465 KB as float32 (plan budget:
  ≤ 1.5 MB int8), and ORT-web's dynamic quantisation does not cover Conv/GRU. Ship
  float32.
- **Where things are:** `public/models/sketchnet-v1.{json,bin,onnx}`, golden
  vectors in `lib/sketch/golden/`, report in `docs/ai/reports/sketchnet-v1.json`.
  Checkpoints stay on D: (`D:\simblip-ml\runs`).
- **Evidence (SYNTHETIC ONLY):** on 31,050 samples from 75 synthetic writers the
  model never saw: top-1 98.82 %, top-3 99.95 %, ECE 0.0024 (0.0446 before
  calibration), pose 99.45 %, `unknown` precision 97.9 % / recall 97.6 %. The
  existing CART baseline scores 55.3 % on the same data. Weakest: battery
  (92.7 %) vs capacitor (95.0 %), `unknown` vs switch/resistor/inductor. A fresh
  seed (777) gives 99.3 %. **These say how well the model learned the generator's
  world. They are not a real-world accuracy, and no real-world accuracy exists.**
  The manifest records `evidence.real = null`.
- **Latency:** ~8–9 ms per symbol warm (preprocess 0.3 ms + forward), measured in
  Node and in Chrome on the dev laptop. The plan's 5 ms per-symbol target is
  MISSED by ~1.7×; the user-facing budget (< 150 ms after pen-up) is met by more
  than 10×, and recognition runs once per pen-hold, not per frame. Convolution
  is ~75 % of the time. If a mid-range device proves too slow: narrower channels
  (retrain) or a WASM-SIMD kernel.
- **Integration:** pen setting "Neural symbol recogniser (experimental)", OFF by
  default. On, a held symbol is named by SketchNet when it is not `unknown`, its
  confidence is ≥ 0.9 and the class maps to a component; otherwise the older
  template matcher decides exactly as before. Pose becomes the component's
  rotation. Off = behaviour unchanged. Not yet verified by drawing in the app.
- **Open:** the 55.3 % → 98.8 % jump is partly a sign the synthetic world is
  easy for a CNN. Real data is the test that matters; until then the setting
  stays off by default.

- 2026-10-18 · Learning engine (Phase 3) is model-free: FSRS-4.5 hand-rolled in `lib/learning/fsrs.ts` (no `ts-fsrs` dependency), hint ladder / mastery / card lint are deterministic code; the model only words content. · 10 tests in `lib/learning/learning.test.mjs` (intervals grow, Easy>Good>Hard, R=0.9 at one stability). · Swap to `ts-fsrs` if the parameters need per-user optimisation.
- 2026-10-18 · Retrieval is BM25 over lesson sections (`lib/learning/bm25.ts`), no embedding model; only the 3 best lessons by title are downloaded per query (`lib/tools/course-corpus.ts`). · 0 MB model RAM, honours course grants because it reads `/api/courses`. · Add embeddings only if BM25 recall measures insufficient.
- 2026-10-18 · Learner state lives in its own persisted store `simblip-learner`, never in the chat store, and never leaves the device unless page-sync is on. · Plan D9 (minors' data). · A teacher view needs an explicit class-consent flow first (Phase 6).
- 2026-10-18 · Cards are records, not a new `PageKind`. · Plan §6.5: PageKind already has 8 kinds, each touching routing/export/sync. · Revisit if printable deck pages become a core flow.
- 2026-10-18 · Mode is an explicit Learn/Answer toggle (`RecallStrip`), never inferred. · Plan §6.3.
- 2026-10-18 · Script lane serves the FINE-TUNED model, not a larger base. · Novel-prompt eval (30 prompts, no few-shots): fine-tuned Qwen3-0.6B Q8_0 93% pass-all vs base qwen3:8b + full prompt 0% (43% valid); Q4_K_M lost ~10 points (83%). Tool choice on held-out set: 100% schema-valid, 100% correct tool (args misses were an unguessable random questionId in my data — fixed by putting the id in the prompt next time). · A 1.7B fine-tune is training (`.cache/runs/std`); promote it if it beats 93% on the same set.
- 2026-10-18 · AI runs as a separate server (`ai-server/`, Ollama-compatible, bearer auth, queue 1, lane aliases). Lane alias `system` replaces the app's long prompt + few-shots for fine-tuned models. · Verified end to end through the server: 90% on the novel set (sampling noise vs 93%). · Dedicated server later = point OLLAMA_HOST at it.
- 2026-10-18 · "Teach me X" plays the course's own lesson as a narrated, interactive film (Lesson Player, `lib/lesson/`), converted deterministically from authored CourseDocs — no model, so it cannot invent physics. All 122 authored lessons convert and lint. Predict-then-reveal is the core loop; a wrong prediction becomes a flash card linked to the lesson page. · Verified in real Chrome: "teach me ohms law" → circuit drawn → prediction card → choose → card created → demo runs (13.6 mA = 9 V / 660 Ω). · Topics with no authored lesson fall through to the ordinary lanes; a model-written storyboard lane (grammar-constrained, linted) is the next step, and `.webm` export via tab capture is deferred.
- 2026-10-18 · teach.lesson ends a running product tour first. · Found in E2E: the tour's scratch notebook was the active parent, so the lesson page was created inside it and deleted by the tour's cleanup.
- 2026-10-22 · Keep the 0.6B fine-tune (Q8_0, 640 MB) as the script lane; do NOT train a 4B. · The 1.7B fine-tune (bf16, same data) scored 93% pass-all / mean 92.6 on the 30 novel prompts vs 93% / 92.4 for the 0.6B Q8 — no measurable gain; tool choice 100% valid / 100% correct tool / 100% args on the v5 held-out set. The 30-prompt set is saturated, so a bigger model cannot show a win on it. · Build a harder novel set (multi-part scenes, unusual components) before spending GPU hours on a larger model; if the 1.7B wins there, promote it as the "Standard" tier.
- 2026-10-22 · Lessons for ANY topic: the Director (`lib/lesson/director.ts`) plans with the big model (grammar-constrained JSON), has the fine-tuned model draw each scene, and takes every number and every prediction answer from the REAL simulator — the model only chooses what to show. Experiments apply changes the way a slider thumb does (`apply.ts`); steady values are quoted as numbers, moving ones only as "rose/fell by X%"; an experiment whose change moves nothing is dropped, never taught as "no effect". · Verified on real models: projectile motion (mass doesn't change the fall; faster launch raises peak speed), pendulum (mass barely changes peak speed). Weak spot: refraction/optics scenes fail lint with the 0.6B fine-tune (honest fallback: text-only steps). First film ≈ 25–50 s; replays from the per-user cache. · Add optics/waves recipes to the training data before relying on those topics.
- 2026-10-22 · Connector cleanliness: diagram links are rigid scene parts when placed (bends restored and scaled with the scene), skip/back edges leave through a free face when a sibling blocks the lane, skip edges enter their own port. · Test `lib/scene/diagram-routing.test.mjs` checks every flowchart in the course library, translated and scaled: axis-aligned, attached, no crossing of unrelated boxes.
- 2026-10-22 · The lesson player belongs to the board, not the window: anchored to the canvas rect above the tool dock; the camera frames each scene into the visible board. Formulas write on (pen + wipe) and captions type in step with the voice.
- 2026-10-22 · Wrong-lesson guard: an authored lesson is used only if it covers the topic's DISTINCTIVE words (`covers()` in bm25.ts; "theorem"/"law"/"method"… are filler). Found when "teach me kendalls theorem" played the central-limit-theorem lesson. The planner may answer `unsure` (a question) instead of inventing a lesson; a film with no simulatable scene is still delivered but opens by saying it is NOT checked by the simulator. · Tests: learning.test.mjs (covers), teach-tool.test.mjs (kendall), director.test.mjs (unsure, text-only disclaimer).
- 2026-10-22 · Narration uses a NEURAL VOICE from the AI server (Kokoro-82M ONNX, CPU, 54 voices; women's voices curated, default af_heart) because Linux browsers ship no speech voices. Caption typing is driven by the audio clock (exact sync, unlike boundary events many voices never fire); next lines are prefetched; fallback chain neural → browser voice → timed captions. · Measured 4× real time on CPU; real Chrome played 18 clips, 14 to completion (rest interrupted). · Hindi/Nepali: Kokoro has Hindi voices (hf_alpha, hf_beta) — not wired into the picker; Nepali has no model, so Hindi is the nearest.
- 2026-10-22 · The lesson planner now knows what the simulator really has. `lib/lesson/catalog.ts` builds the capability list from the registries (70 Step Lab engines, with aliases so "depth first search" finds the engine that says "dfs") and ROUTES in code: a topic that names an engine gets that stepper (up to two, e.g. DFS → graph stepper + maze stepper; the stepper is driven frame by frame and narrated with the ENGINE's own commentary); other computing topics get ONE short C++ program for the DSA Lab (interpreter-validated with one repair round; key steps chosen from the real trace, the model words them, plain facts if it cannot); computing lessons get no physics scenes. · Found when "teach me DFS" produced physics scenes: the 8B planner ignored a prompt instruction to use the lab, so the decision was moved into code. Generic words ("search", "tree") never pick an engine on their own ("binary search" ≠ the maze stepper). · Verified on real models: DFS, bubble sort (sorting stepper), binary search and recursion (DSA Lab program); real Chrome showed the DFS stepper advancing under narration.
- 2026-10-23 · Lesson board overlap fixed at the root: a section's heading is now RECORDED (`Section.heading`), never inferred as "the first object" — the scene's own frame can come first in the object list, which put the key points on top of the picture (seen on the docker and gravity lessons). Test: `stage.test.mjs` "key points never land on its picture".
- 2026-10-23 · "Teach me whatever is in this page" is a PAGE TOUR, not a topic (`teach.page`, `lib/lesson/page-read.ts`, `page-lesson.ts`, `tour-stage.ts`): the open board/document/slide deck is read in reading order (notes, formulas, tables, graphs, labs, document text; parts that sit together become ONE figure), then each piece is framed, glows, and is explained — the model may only phrase what the content says; without a model she reads the content itself. Nothing is added to the page. Routed in code (`TOUR_RE`), because a prompt that falls through to the topic path produced a lesson on the words "whatever is in this page". · Verified in real Chrome on the Welcome page (4 things, camera + glow, 11 voice clips). · v1 limits: PDFs, images, spreadsheets and web pages are not read yet; richer explanations (more detail per item) are the next iteration.
- 2026-10-23 · Multi-pin parts (transistors, op-amps) were broken at three levels, found from a "differential amplifier" lesson whose transistors had loose pins and whose readings were nanoamps: (1) the wire router could leave a pin, U-turn, and run back through the part's own body over its other pin — `simplify()` collapsed the retrace into a straight line and the engine read the pin-on-wire as a junction, SHORTING the pins (an op-amp amplifier's feedback resistor). Candidates are now judged as drawn (after collapsing), and when nothing is clean the route that crosses least body wins (`bodyCrossing`). (2) the two-terminal pin vocabulary (`a`, `b`, `out`, `negative`) silently wired the wrong pin of a 3+ pin part; it is now refused by lint and ignored at runtime for multi-pin parts, and a transistor/op-amp/gate with only some pins wired is a lint error naming the missing pins (the repair loop's vocabulary). (3) lesson readings asked a voltmeter for its CURRENT (V/10 MΩ ≈ nA); instruments are now asked for what they measure. Also: circuit auto-layout crashed on scripts that positioned some parts and not others. · Recipes for the standard multi-pin circuits (common-emitter, BJT differential pair, inverting and non-inverting op-amp) are exact and tested by running them: −5.0 V, +5.5 V, 2.4 mA/6.7 V, ±2.6 V. `floatingPins()` rejects any lesson scene with unconnected pins. Weak spot: the 0.6B fine-tune still cannot write complete transistor circuits unprompted; recipes cover the textbook ones, other multi-pin topics fall back to concept diagrams.
