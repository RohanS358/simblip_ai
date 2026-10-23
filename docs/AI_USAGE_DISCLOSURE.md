# AI usage disclosure

Frogtoberfest asks for "a short written statement naming the exact file/function where AI output is consumed programmatically".
This is that statement. In every row below the model's output is **parsed, validated and acted on by code**; none of it is
only displayed.

## Where AI output is consumed

| # | Model output | Consumed by (file → function) | What the code does with it | What stops a bad output |
|---|---|---|---|---|
| 1 | **SimScript source** from the fine-tuned model | [`lib/ai/generate.ts`](../lib/ai/generate.ts) → `generateSimScript()` | Runs the text through `autofixSimScript()` then `lintSimScript()`; on errors, builds a repair prompt and calls the model again (max 2). The surviving script is executed by the SimScript interpreter and becomes simulator objects. | [`simscript-lint.ts`](../lib/ai/simscript-lint.ts) checks kinds, anchors, channels, params and multi-pin completeness against the runtime's own registries; [`simscript-fix.ts`](../lib/ai/simscript-fix.ts) only applies unambiguous fixes. |
| 2 | **Edit plan** (JSON op list) | [`lib/ai/edit.ts`](../lib/ai/edit.ts) → `generateEditPlan()`, then [`edit-ops.ts`](../lib/ai/edit-ops.ts) → `verifyPlan()`, then [`apply-ops.ts`](../lib/ai/apply-ops.ts) → `applyPlan()` | Mutates the document store (move, resize, change a parameter, add a component, add a behavior) as one undo step. | zod schema + every id/component/behavior checked against the live page; re-verified immediately before apply; all-or-nothing. |
| 3 | **Tool calls** (name + JSON arguments) | [`lib/ai/tutor/act.ts`](../lib/ai/tutor/act.ts) → `makeAct()` / `argsOf()`, then [`lib/tools/registry.ts`](../lib/tools/registry.ts) → `runTool()` | Executes real actions: build a scene, run/pause the simulation, measure a channel, open or create a page, add a note or formula, make a slide deck, schedule a flash card. | Unknown or look-alike names refused; arguments zod-validated; permission gate; read-only mode enforced at execution; `runTool` never throws; result summaries capped. See [`redteam.test.mjs`](../lib/tools/redteam.test.mjs). |
| 4 | **Lesson plan** (grammar-constrained JSON) | [`lib/lesson/director.ts`](../lib/lesson/director.ts) → `planTopic()`, `routePlan()`, `directLesson()` using [`plan.ts`](../lib/lesson/plan.ts) → `extractJson()`, `normalizePlan()`, `parsePlan()` | Becomes a storyboard of beats that the player performs: scenes drawn, formulas written, predictions asked. | Output repaired for shape drift and stray-quote JSON; `routePlan()` lets **code** override the model's choice of lab; `lintStoryboard()`; `unsure` is a valid answer; each number comes from the simulator. |
| 5 | **Per-scene SimScript** inside a lesson | `directLesson()` → same path as row 1 | Drawn on the lesson board and *run*; the real engine's output is measured. | Row-1 checks plus `floatingPins()` in [`lib/lesson/runner.ts`](../lib/lesson/runner.ts) (rejects scenes with unconnected pins). |
| 6 | **Experiment proposal** ("change R to 2×") | `directLesson()` → [`lib/lesson/apply.ts`](../lib/lesson/apply.ts) → `applyParam()` | Applied exactly like a user dragging a slider; before/after are measured by the simulator and **the correct answer is whatever the simulator showed**. | An experiment that moves nothing is dropped. |
| 7 | **Worked solution** to a brought question | [`lib/lesson/solve.ts`](../lib/lesson/solve.ts) → `planFromText()`, `verifySolution()` | Every worked line is recomputed by `checkArithmetic()`; a wrong line is corrected and the correction is spoken. | [`lib/ai/arithmetic.ts`](../lib/ai/arithmetic.ts) → `checkArithmetic()` (a calculator, not a model). |
| 8 | **Explanation** (Markdown + LaTeX) | [`lib/ai/explain.ts`](../lib/ai/explain.ts) → `explain()`, `cleanAnswer()`, `toAnswerBlocks()`, `blocksToSimScript()` | Split into blocks, arithmetic-checked, then converted into canvas objects (notes, formulas) with geometry-based placement. | `checkArithmetic()`; placement is computed ([`placement.ts`](../lib/ai/placement.ts)), not asked of the model. |
| 9 | **Lane choice** (which model, which alias) | [`ai-server/server.mjs`](../ai-server/server.mjs) (alias resolution in the `/api/chat` handler) and [`models.json`](../ai-server/models.json) | Rewrites the request to the right weights, options and the short system prompt. | Bearer auth, rate limit, bounded queue. |
| 10 | **Training data** (not model output, but model behaviour is produced from it) | [`scripts/ai/data/build-dataset.mjs`](../scripts/ai/data/build-dataset.mjs) → `makeEvaluator()` ([`scripts/ai/quality/evaluate.mjs`](../scripts/ai/quality/evaluate.mjs)) | Every candidate script is executed in the real simulator and scored by [`lib/ai/quality/score.ts`](../lib/ai/quality/score.ts); only passing rows enter the dataset. | Gate: `function ≥ 0.9`, `looks ≥ 0.8`, `teaches ≥ 0.7`, de-duplicated by script hash. |
| 11 | **Sketch → Scene IR** | [`lib/sketch/ir.ts`](../lib/sketch/ir.ts) → `compile.ts` | Compiled to SimScript by deterministic code, no model in the compile step. | A wrong IR yields a reported compile error, never a broken scene. |

## What is *not* AI

Stated plainly so the boundary is clear:

* **Lane routing** is regex ([`route-intent.ts`](../lib/ai/route-intent.ts), [`tutor/router.ts`](../lib/ai/tutor/router.ts)).
* **Spaced repetition** is FSRS-4.5, hand-written ([`lib/learning/fsrs.ts`](../lib/learning/fsrs.ts)); **retrieval** is BM25 ([`bm25.ts`](../lib/learning/bm25.ts)).
* **Circuit/physics numbers**, **arithmetic**, **placement** and **wire routing** are computed.
* **Authored lessons** (`content/courses/`, 125 lessons) were written offline and convert to films deterministically, with no model at runtime.
* **Narration audio** is Kokoro-82M, a text-to-speech model, whose output is played, not parsed.

## Models used

| Role | Model | How it was obtained |
|---|---|---|
| Writes SimScript | **SIMBLIP Lite**: Qwen3-0.6B, QLoRA fine-tuned on 9,173 recipe-generated, simulator-verified examples, merged, quantised to GGUF Q8_0 (640 MB) | Trained by us, see [`FINE_TUNING.md`](FINE_TUNING.md) |
| Plans lessons, explains, selects tools | Qwen3-8B (served by Ollama) | Off the shelf |
| Optional "Standard" on-device tier | Qwen3-1.7B (Q4_K_M, in-browser via wllama) | Off the shelf; our 1.7B fine-tune is recorded but not promoted |
| Narration voice | Kokoro-82M (ONNX, CPU) | Off the shelf |

## AI-assisted development

The code in this repository was written with AI coding assistance (Claude Code) under the author's direction. The architecture decisions,
the measurements and the evaluation are the author's and are recorded, with the evidence that drove them, in
[`docs/ai/decisions.md`](ai/decisions.md). The commit trailers state the assistance on each commit.
