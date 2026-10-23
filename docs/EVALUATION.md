# Evaluation

Every number in this repository comes from a file you can open, and `npm run results` recomputes the headline table from those files.

## 1. How a scene is judged

Generated SimScript is not judged by a human reading it, or by another model. It is **executed in the real simulator** and scored by
[`lib/ai/quality/score.ts`](../lib/ai/quality/score.ts), the same scorer that gates the training data, so training and evaluation can not drift apart.

**pass-all** = `valid = 1` (lints, runs, verifier clean) **and** `function ≥ 0.9` (stable, meaningful outputs) **and** `looks ≥ 0.8`
(no overlaps, wires through parts, crossings, bad bends; aligned, spaced, fitting) **and** `teaches ≥ 0.7` (right quantity plotted, labelled, explained, with a control).

## 2. Results

### 2.1 Novel prompts: the honest test

30 hand-written prompts ([`results/novel-prompts/prompts.jsonl`](../results/novel-prompts/prompts.jsonl)) that are **not** recipe phrasings and were never in training
("two light bulbs side by side on a battery, what happens when one burns out?"). Greedy decoding, thinking off. Run on an RTX 4060 Laptop (8 GB).

| Model | valid | pass-all | mean score |
|---|---:|---:|---:|
| Qwen3-8B base + full SimScript prompt | 13 / 30 (43 %) | **0 / 30 (0 %)** | 31.1 |
| SIMBLIP Lite **Q4_K_M** (0.6B fine-tune, 397 MB) | 25 / 30 (83 %) | 25 / 30 (83 %) | 78.9 |
| SIMBLIP Lite **Q8_0** (0.6B fine-tune, 640 MB), *served* | 29 / 30 (97 %) | **28 / 30 (93 %)** | 92.4 |
| Qwen3-1.7B fine-tune, bf16 | 29 / 30 (97 %) | 28 / 30 (93 %) | 92.6 |
| Lite Q8_0 **through `ai-server`** (queue + lane alias, end to end) | 28 / 30 (93 %) | 27 / 30 (90 %) | 88.8 |

Reproduce the table: `npm run results`. Score files: [`results/novel-prompts/`](../results/novel-prompts).

How to read it: fine-tuning moves the 0.6B model from **unusable to 93 %**; the 8B model with the whole language in its prompt never passes the full check.
A 1.7B fine-tune on identical data gains nothing measurable, which is why the project did not spend GPU hours on a larger model.
The end-to-end 90 % vs 93 % gap is sampling noise (one prompt); it is reported rather than hidden.

### 2.2 Held-out recipe prompts (in-distribution)

80 held-out prompts from the dataset's own eval split, never trained on: **79 / 80 pass-all (99 %), mean 93.9**
([`results/heldout/simblip-lite-q8-heldout80.scored.json`](../results/heldout/simblip-lite-q8-heldout80.scored.json)).
These share phrasing style with training, so they show the model learned the recipes; the novel set above is the one that shows it generalises.

### 2.3 Tool calling

30 held-out tool prompts ([`results/heldout/tool-choice-v4.json`](../results/heldout/tool-choice-v4.json)): **100 % schema-valid, 100 % correct tool, 73 % correct arguments**, at ~78 tokens/s.
Every argument miss was the same thing: a `questionId` the training data had invented at random, which a model cannot guess. The fix (put the id in the prompt, data v5) is recorded in
[`docs/ai/decisions.md`](ai/decisions.md) as 100 % arguments; the committed JSON is the earlier run, kept so the failure stays inspectable.

### 2.4 Simulator-grounded lessons

The lesson pipeline's claims are checked by tests rather than a score: wrong-lesson guard (`teach-tool.test.mjs`, "kendall" must not play the central-limit lesson),
`unsure` and text-only labelling (`director.test.mjs`), no key points over the picture (`stage.test.mjs`), every authored lesson converts and lints (`lesson.test.mjs`),
and exact multi-pin circuit recipes verified by *running* them (`multipin-recipes.test.mjs`: −5.0 V common-emitter gain stage, ±2.6 V op-amp amplifiers, 2.4 mA / 6.7 V differential pair).

## 3. Test suite

```bash
npm ci
npm test            # 550 AI tests (549 pass, 1 skipped by design) + 7 ai-server tests, ~30 s, no GPU, no network except first-run OCR data
npm run typecheck   # tsc --noEmit, clean
```

Both run in CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)). What they cover:

| Area | Examples of what is pinned |
|---|---|
| `lib/ai` | linter and autofix rules; routing for simulate / explain / edit / slides / DSA / economics; the "compute arithmetic, don't predict it" checker; placement geometry; conversation history framing; attachments (**real** DOCX, PDF, scanned PDF, image OCR); on-device engine; transport |
| `lib/tools` | tool schemas and effects; **red-team suite**: no permanent-delete tool, injected lesson text is fenced data, students can't run gated teacher tools, read-only mode refuses writes *at execution*, hostile arguments never throw, look-alike tool names are refused |
| `lib/lesson` | storyboard schema and lint; Director ordering and grounding with injected model and simulator; player; stage layout; recipes; page tour; teach-material / solve |
| `lib/learning` | FSRS intervals (Easy > Good > Hard; R = 0.9 at one stability), BM25 `covers()`, hint ladder |
| `lib/sketch`, `lib/teacher`, `lib/tts`, `lib/frame` | IR → SimScript compile and run; teacher rig; speakable text and caption clock; frame loop |
| `scripts/mcp` | MCP bridge: origin refusal, tool round-trips, mid-call disconnect, tool-list changes |
| `ai-server` | auth, queue, rate limit, lane aliasing, cancel-on-disconnect |

One assertion is skipped here by design: `history.test.mjs` greps the host app's React panel, which is not part of this repository.

## 4. Caveats

* The novel set has **30 prompts** and is now saturated (two models tie at 93 %). It can show "fine-tuning works"; it cannot rank bigger models. A harder, multi-part set is the next step before any larger training run.
* Decoding is greedy, single run; the 30-prompt granularity is 3.3 points.
* `looks` and `teaches` are **our own proxies** for quality, chosen to be computable, not a user study.
* Measurements are on one machine (RTX 4060 Laptop, 8 GB).
* Optics/refraction scenes remain a weak spot for the 0.6B model (the lesson pipeline falls back to text-only steps and says so).
