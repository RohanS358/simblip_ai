# How this repository was built

Each row is a feature branch merged into `main` with `--no-ff`, **in the order the work was done**. The commits inside a branch carry their **original author dates**;
each commit message names the SIMBLIP commit it was replayed from (`Replayed from SIMBLIP commit <sha>`), so every step is traceable to the main repository.
Only the AI-layer paths of each original commit are included; the rest of that commit belongs to the main SIMBLIP repo.

Branches dated *today* (`chore/…`, `docs/…`, `feature/teach-material-solve`) were created while extracting this repository. The last of them is the AI work that was still uncommitted in the main repo.

| # | Branch | What it added | First → last commit | Commits | SIMBLIP commits |
|---:|---|---|---|---:|---|
| 1 | `feature/stroke-recognizer` | Trainable on-device stroke/shape recognizer (the first learned model in SIMBLIP) | 2026-07-12 → 2026-07-12 | 8 | `5ec90fc`, `f344f2d`, `1d6593c`, `dcd5000`, `16beaa9`, `ac8f17c`, `f86512b`, `08a8d57` |
| 2 | `feature/simscript-corpus-local-model` | First local-model setup: Modelfile, SimScript few-shot corpus, lint | 2026-07-17 → 2026-08-03 | 3 | `7f7a95c`, `25426eb`, `8f74f6d` |
| 3 | `feature/simscript-verifier-pipeline` | One-pass SimScript generation verified before it reaches the canvas | 2026-08-18 → 2026-08-18 | 6 | `b4af050`, `ba79978`, `249c8cb`, `be0c341`, `d30afed`, `ba8f7b9` |
| 4 | `feature/lane-routing-and-physics` | Route prompts to the right lane; physics-aware generation | 2026-08-18 → 2026-08-18 | 4 | `00b8286`, `f7e87d3`, `e581df0`, `5fca000` |
| 5 | `feature/placement-and-slides` | Geometry-based placement and slide generation | 2026-08-19 → 2026-08-19 | 5 | `d6d5419`, `f0c69b8`, `ee65218`, `8bb3817`, `9951e47` |
| 6 | `feature/domain-lanes-dsa-econ` | DSA Lab and cash-flow lanes | 2026-08-19 → 2026-08-19 | 2 | `43d57d6`, `08f56d5` |
| 7 | `feature/conversation-memory-sessions` | Conversation memory, per-lane models, exact arithmetic, saved sessions | 2026-08-19 → 2026-08-19 | 4 | `b025f69`, `0693624`, `ea93df4`, `2fab9db` |
| 8 | `feature/page-aware-editing` | Page-aware assistant that edits the page directly | 2026-08-19 → 2026-08-19 | 5 | `c4d4106`, `a7a07e3`, `015a8cc`, `e472acf`, `5030207` |
| 9 | `feature/autofix-cache-and-diagrams` | SimScript autofix, response cache, diagram(), model endpoint | 2026-08-20 → 2026-10-01 | 6 | `f495df2`, `01d94db`, `b4f4b53`, `ed5a84e`, `4e684ca`, `8da1dc4` |
| 10 | `feature/tool-registry-and-on-device-engine` | Tool registry, on-device wllama engine, shared lane runner, MCP bridge | 2026-10-11 → 2026-10-11 | 2 | `084303a`, `9137e45` |
| 11 | `feature/quality-scorer` | Automatic scene-quality scorer and gallery | 2026-10-11 → 2026-10-11 | 1 | `22d072f` |
| 12 | `feature/fine-tuning-pipeline` | Dataset builder, recipes, SFT/eval scripts | 2026-10-14 → 2026-10-14 | 2 | `1ba1cc9`, `c076212` |
| 13 | `feature/sketch-scene-ir` | Scene IR, IR-to-SimScript compiler and gold IR set | 2026-10-18 → 2026-10-18 | 1 | `1b0ec58` |
| 14 | `feature/learning-engine` | FSRS scheduler, flash cards, BM25 retrieval, hint ladder | 2026-10-18 → 2026-10-18 | 1 | `b47f5af` |
| 15 | `feature/teacher-tools-permission-gate` | Teacher tools behind a registry-level permission gate; tool-calling data | 2026-10-18 → 2026-10-18 | 1 | `47f88c2` |
| 16 | `feature/ai-server` | Separate authed, queued, lane-aliased AI server; Lite fine-tune measured | 2026-10-18 → 2026-10-18 | 2 | `bed2773`, `f32f341` |
| 17 | `feature/redteam-hardening` | Red-team suite for the tool layer; lesson text fenced as data | 2026-10-18 → 2026-10-18 | 1 | `886d401` |
| 18 | `feature/lesson-player` | Course lessons as narrated interactive films | 2026-10-18 → 2026-10-18 | 2 | `5aa7272`, `ed68d4a` |
| 19 | `eval/1.7b-vs-0.6b` | Record 1.7B fine-tune result; keep the 0.6B Lite model | 2026-10-22 → 2026-10-22 | 1 | `2d2eecc` |
| 20 | `feature/lesson-director` | Lessons for any topic: plan, scenes, simulator-grounded numbers | 2026-10-22 → 2026-10-22 | 3 | `5fdca94`, `ae82bd2`, `18b1abb` |
| 21 | `feature/teacher-led-lessons` | Sections board, animated teacher, check-ins, study notes | 2026-10-22 → 2026-10-22 | 6 | `a457dd5`, `fb90328`, `e7fb920`, `ce5621f`, `176b98b`, `77ba3a5` |
| 22 | `feature/neural-narration` | Neural narration (Kokoro) via the AI server | 2026-10-22 → 2026-10-22 | 1 | `6901094` |
| 23 | `feature/mid-lesson-asks` | Mid-lesson questions drawn and taught live; exact circuit recipes | 2026-10-22 → 2026-10-22 | 2 | `7a786bf`, `34cc58d` |
| 24 | `feature/simulator-catalogue-lessons` | Lessons use the real simulator catalogue (Step Lab, DSA Lab) | 2026-10-22 → 2026-10-23 | 4 | `0fdb62e`, `d618980`, `78a070d`, `4ae7a0c` |
| 25 | `fix/voice-service-autostart` | Voice service starts with the dev server | 2026-10-23 → 2026-10-23 | 1 | `ab303f4` |
| 26 | `feature/per-system-variables` | Per-system variables and AI setVariable/removeVariable | 2026-10-23 → 2026-10-23 | 1 | `0bbf792` |
| 27 | `feature/page-tour` | Teach me whatever is in this page: page tour and attachment tests | 2026-10-23 → 2026-10-23 | 2 | `a1816da`, `c8b7da1` |
| 28 | `fix/multipin-circuits` | Multi-pin circuit fixes and test repairs | 2026-10-23 → 2026-10-23 | 2 | `20a8bb8`, `a4114ee` |
| 29 | `chore/simulator-substrate` | headless simulator the AI layer drives | 2026-10-23 → 2026-10-23 | 1 | — |
| 30 | `chore/tooling-and-ci` | runnable tests, typecheck and CI | 2026-10-23 → 2026-10-23 | 3 | — |
| 31 | `feature/teach-material-solve` | solve or teach material the student brings | 2026-10-23 → 2026-10-23 | 2 | — |
| 32 | `docs/training-data-and-results` | datasets, scored outputs, loss curves | 2026-10-23 → 2026-10-23 | 4 | — |
| 33 | `docs/architecture-and-ai-disclosure` | architecture, AI usage disclosure, substrate map | 2026-10-23 → 2026-10-23 | 3 | — |
| 34 | `docs/fine-tuning-evaluation-limitations` | model artefacts, training, evaluation, limits | 2026-10-23 → 2026-10-23 | 4 | — |
| 35 | `fix/commit-lora-adapter-weights` | Commit the LoRA adapter weights that an ignore rule had hidden | 2026-10-23 → 2026-10-23 | 1 | — |
| 36 | `docs/readme-evaluator-guide-history` | README, evaluator guide, HISTORY, verifier demo | 2026-10-23 → 2026-10-23 | 5 | — |
| 37 | `docs/history-final` | This table brought up to date | 2026-10-23 → 2026-10-23 | 1 | — |
| 38 | `docs/substrate-redaction-note` | Record the one redaction in the vendored simulator | 2026-10-23 → 2026-10-23 | 1 | — |


**38 branches.**

Every branch is still present on the remote (`git branch -r`), so you can check any stage out and read the code as it was at that point.

## Timeline in two phases

* **Foundation (July – September 2026).** The trainable stroke recognizer; the first local-model setup; the SimScript generate → verify → repair pipeline; lane routing; placement; conversation memory; page-aware editing; autofix and the generation cache.
* **The AI system (from 8 October 2026, the date of this repository's first commit).** The tool registry and the permission-gated agent; the on-device engine; the dataset builder with its simulator quality gate; the QLoRA fine-tune and its evaluation; the separate AI server; the red-team suite; the Lesson Player, Director, teacher, neural narration and page tour; simulator-grounded numbers; multi-pin circuit fixes; solving brought material.

The foundation is what the second phase stands on, and it is included because the project is easiest to judge whole. Dates are real commit dates, not adjusted.
