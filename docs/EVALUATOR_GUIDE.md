# Evaluator guide: 10 minutes, nothing to trust

Every step below is a command with its expected output, so you can check each claim in the README yourself. **No GPU, no API key, no account** is needed for steps 1–6.

```bash
git clone https://github.com/RohanS358/simblip_ai.git && cd simblip_ai && npm ci
```

## 1. It runs: the test suite (≈ 30 s)

```bash
npm test
```
Expected: `550 tests, 549 pass, 0 fail, 1 skipped` (the skipped one asserts on the host app's React panel, which is not in this repo), then `7 tests, 7 pass` for the AI server.
`npm run typecheck` is clean. CI runs the same ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)).

## 2. The numbers are real

```bash
npm run results
```
Expected, recomputed from the committed score files in [`results/`](../results):

```
results/novel-prompts/qwen3-8b-base-full-prompt.scored.json         30     13 (43%)       0 (0%) 31.1
results/novel-prompts/simblip-lite-q4.scored.json                   30     25 (83%)     25 (83%) 78.9
results/novel-prompts/simblip-lite-q8.scored.json                   30     29 (97%)     28 (93%) 92.4
results/novel-prompts/qwen3-1.7b-finetune-bf16.scored.json          30     29 (97%)     28 (93%) 92.6
results/novel-prompts/simblip-lite-q8-via-ai-server.scored.json     30     28 (93%)     27 (90%) 88.8
results/heldout/simblip-lite-q8-heldout80.scored.json               80     79 (99%)     79 (99%) 93.9
tool calling (30 held-out prompts): schema-valid 100%, correct tool 100%, correct arguments 73%
```
The prompts are in [`results/novel-prompts/prompts.jsonl`](../results/novel-prompts/prompts.jsonl) (hand-written, never in training). The scorer that produced the files executes each script in the simulator: [`lib/ai/quality/score.ts`](../lib/ai/quality/score.ts).

## 3. The AI's output is verified by code, not trusted

```bash
npm run show:verifier
```
Feeds the pipeline a deliberately wrong "model output" with the mistakes small models really make. Expected (abridged):

```
── 2. linter on the raw output: 4 error(s)
  • unknown kind "cap" — not a SimScript component
  • unknown kind "flux-capacitor" — not a SimScript component
  • connect(r1.b, cap) — "cap" is missing an anchor; write cap.a
  • graph.plot(r1.voltage) — "resistor" has no channel "voltage"; use one of: V, I, P

── 3. after the deterministic autofix (2 mechanical fix(es), zero model rounds)
  (the model's cap becomes capacitor, and r1.voltage becomes r1.V)

── 4. linter on the repaired script: 2 error(s) left, shown to the model as repair instructions
  • unknown kind "flux-capacitor" — not a SimScript component
  • connect(r1.b, cap) — "cap" is missing an anchor; write cap.a (valid: a, b, positive, negative)
```
Note what the autofix **refuses** to do: it does not pick a terminal for `connect(r1.b, cap)`, because that would invent wiring. Only fixes with exactly one legal answer are applied
([`lib/ai/simscript-fix.ts`](../lib/ai/simscript-fix.ts) explains why a wrong autofix is worse than an error).

## 4. The tool layer resists hostile input

```bash
node --experimental-strip-types --import ./scripts/test/register.mjs --test --test-force-exit lib/tools/redteam.test.mjs
```
Expected: 7 passing tests, including *permanent deletion is not a tool at all*, *injected lesson text is returned as fenced data and triggers no effect*,
*a student account cannot run any gated teacher tool, whatever the arguments*, *read-only agent mode refuses every write and run tool*, and *hostile arguments never throw*.

## 5. Lessons take their numbers from the simulator

```bash
node --experimental-strip-types --import ./scripts/test/register.mjs --test --test-force-exit lib/lesson/director.test.mjs lib/lesson/teach-tool.test.mjs
```
Look for these, each a design claim made executable:

* `the prediction answer comes from the simulator: doubling R halves the current`
* `an experiment whose change moves nothing is not taught as "no effect"`
* `a topic the model does not recognise becomes a question, not an invented lesson`
* `a topic that NAMES an engine is routed to its steppers in code — the planner model is not trusted to remember`
* `a topic that only shares a filler word with a lesson is NOT played as that lesson ('kendalls theorem' ≠ central limit theorem)`

The model and the simulator are *injected* in these tests, so the ordering and the grounding are tested without either.

## 6. The server is a real gateway

```bash
node --test ai-server/server.test.mjs
```
Expected: 7 passing, covering auth (`rejects missing and wrong keys, allows healthz`), lane aliasing (`alias maps to the real model…`), the bounded queue, the rate limit,
and the fine-tuned lane swapping a ~1,000-token prompt for a one-line one.

## 7. Follow the data end to end

[`docs/PIPELINE.md`](PIPELINE.md) traces a photographed question, a PDF and a live measurement from input to output, naming every file, agent and tool on the way.

## 8. Read the code where the model's output is used

Open [`docs/AI_USAGE_DISCLOSURE.md`](AI_USAGE_DISCLOSURE.md). Each of its 11 rows names a file and function; the five worth reading first:

| Function | File | Why it matters |
|---|---|---|
| `generateSimScript()` | [`lib/ai/generate.ts`](../lib/ai/generate.ts) | the generate → autofix → lint → repair loop |
| `runTool()` | [`lib/tools/registry.ts`](../lib/tools/registry.ts) | validate → gate → execute → never throw (≈ 25 lines) |
| `routePlan()` / `directLesson()` | [`lib/lesson/director.ts`](../lib/lesson/director.ts) | code overrides the model; numbers come from the simulator |
| `verifySolution()` | [`lib/lesson/solve.ts`](../lib/lesson/solve.ts) | every worked line recomputed |
| `verifyPlan()` → `applyPlan()` | [`lib/ai/edit-ops.ts`](../lib/ai/edit-ops.ts), [`apply-ops.ts`](../lib/ai/apply-ops.ts) | all-or-nothing edits, one undo |

## 9. The model, and how it was made

* Training data, gzipped: [`data/v5/`](../data/v5) (9,350 rows). The gate that filters it: [`scripts/ai/data/build-dataset.mjs`](../scripts/ai/data/build-dataset.mjs); its effect: [`data/dataset-build-report-v3.json`](../data/dataset-build-report-v3.json) (6,409 of 7,000 kept).
* Training script and exact environment: [`scripts/ai/train/sft.py`](../scripts/ai/train/sft.py), [`requirements.txt`](../scripts/ai/train/requirements.txt). Loss curve: [`results/training/loss-qwen3-0.6b.csv`](../results/training/loss-qwen3-0.6b.csv) (1.70 → 0.023).
* The adapter itself: [`models/simblip-lite-lora/`](../models/simblip-lite-lora) (81 MB, committed). The merged GGUFs and their SHA-256: [`models/README.md`](../models/README.md).
* A model-size experiment that **did not** pay off, recorded rather than hidden: [`docs/ai/decisions.md`](ai/decisions.md), 2026-10-22.

## 10. The history

[`docs/HISTORY.md`](HISTORY.md) lists every feature branch in build order. `git log --first-parent --oneline` shows the same as a one-line-per-feature story; any branch can be checked out to see the code at that stage.

## What to look at if you only have two minutes

1. Run `npm run results` and `npm run show:verifier`.
2. Read the first table of [`AI_USAGE_DISCLOSURE.md`](AI_USAGE_DISCLOSURE.md).
3. Skim [`docs/LIMITATIONS.md`](LIMITATIONS.md), which shows what we know is unfinished.
