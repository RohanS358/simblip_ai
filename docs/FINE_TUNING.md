# Fine-tuning SIMBLIP Lite

**SIMBLIP Lite** is Qwen3-0.6B, QLoRA fine-tuned to write [SimScript](ai/decisions.md) (SIMBLIP's scene language) from a plain-English
request. It is the model behind the "simulate" lane and every scene the Lesson Director draws.

## Why fine-tune at all

SimScript is a niche language with a registry-defined vocabulary (components, anchors, channels). A general model has never seen it.
Measured on 30 novel prompts, **Qwen3-8B with the full ~1,000-token SimScript prompt: 43 % of outputs even lint, 0 % pass every check.**
Teaching the language *into the weights* changes the trade-off:

| | Qwen3-8B + full prompt | SIMBLIP Lite (0.6B, Q8_0) |
|---|---|---|
| Passes lint + simulates + looks right + teaches | **0 %** | **93 %** |
| System prompt | ~1,000 tokens | **one line** |
| Download | ~5 GB | **640 MB** |
| Speed (RTX 4060 Laptop, Q4_K_M build) | n/a | ~1.2 s per prompt |

On a CPU the wait is *reading the prompt*, so removing 1,000 tokens of it is most of the latency saved.

## Pipeline

```
recipes.mjs ──▶ run in the REAL simulator ──▶ score (function · looks · teaches) ──▶ gate ──▶ dedupe ──▶ train.jsonl
                                                                                                          │
sft.py (QLoRA) ◀──────────────────────────────────────────────────────────────────────────────────────────┘
   │
merge.py ──▶ HF model ──▶ convert_hf_to_gguf (f16) ──▶ llama-quantize (Q8_0 / Q4_K_M) ──▶ Ollama (Modelfile) ──▶ ai-server lane
   │
eval: generate ──▶ score-jsonl.mjs (same scorer as the gate) ──▶ results/
```

### 1. Data: recipes, not scraping

[`scripts/ai/data/recipes.mjs`](../scripts/ai/data/recipes.mjs) holds scene *recipes*: functions of a seeded random source returning `{ prompts, script }`.
The script is what a **good author** would write, not the minimum that runs: parts are named, the quantity that matters is plotted, a note says what to look at with the worked numbers, and
sliders are bound to the parts worth turning. Coordinates appear only where meaningful (bodies in a mechanics box); circuits take none, because the layout engine draws them,
so the model never does arithmetic about a board it cannot see.

[`build-dataset.mjs`](../scripts/ai/data/build-dataset.mjs) then **executes every candidate in the real simulator** and scores it with
[`lib/ai/quality/score.ts`](../lib/ai/quality/score.ts):

| Family | Meaning | Gate |
|---|---|---|
| `valid` | lints, runs, verifier finds nothing wrong | must be 1 |
| `function` | simulation is stable; outputs mean something | ≥ 0.9 |
| `looks` | geometry: overlaps, wires through parts, crossings, bends, alignment, spacing, fit | ≥ 0.8 |
| `teaches` | a plot of the right quantity, labelled parts, an explanation, a control | ≥ 0.7 |

Nothing enters the set unless it passes, and duplicates are capped (`--cap 4` per script hash), so **the model can only be taught things that work and look right**.
The v3 build report ([`data/dataset-build-report-v3.json`](../data/dataset-build-report-v3.json)) shows the gate at work: 6,409 of 7,000 candidates kept.

Three more row types share the set so one model serves every lane:

* **explain**: short Markdown+LaTeX answers from the tutor lane;
* **cards**: flash-card JSON, one object per line;
* **tool**: tool-calling rows from [`tools-dataset.mjs`](../scripts/ai/data/tools-dataset.mjs). Each row is validated against the **real registry schemas** (a row whose arguments do not parse is dropped), the offered tool list is what `routeAct()` would actually show the model, and eval rows are held out by phrase hash **before** any paraphrase expansion.

**v5 composition (committed in [`data/v5/`](../data/v5)):** 9,350 train rows = 6,173 script + 1,891 explain + 692 cards + 594 tool; 236 held-out eval rows (plus `eval-tools`, `eval-tutor`).
The shipped Lite weights were trained on **v4 (9,173 rows)**; v5 adds 177 rows and puts the question id in the tool prompts (see *Findings* below).

### 2. Training

[`scripts/ai/train/sft.py`](../scripts/ai/train/sft.py) — QLoRA, one script, no framework magic:

| | |
|---|---|
| Base | `Qwen/Qwen3-0.6B` (616.2 M params) |
| Quantisation while training | 4-bit NF4, double-quant, bf16 compute |
| LoRA | r = 32, α = 64, dropout 0.05, on `q k v o gate up down` |
| Trainable | **20,185,088 (3.28 %)** |
| Optimiser | paged AdamW 8-bit, lr 2e-4, cosine, 20 warm-up steps |
| Batch | 4 × 4 accumulation = 16 |
| Epochs / steps | 2 / 1,148 |
| Max length | 1,400 tokens (mean example 297, max 535) |
| Loss | **on the assistant tokens only** |
| Prompt | built **exactly as the runtime builds it** (chat template, thinking off), so what is trained is what is served |
| Hardware / time | RTX 4060 Laptop 8 GB · **60.2 min** |
| Loss | 1.697 → **0.023** ([`results/training/loss-qwen3-0.6b.csv`](../results/training/loss-qwen3-0.6b.csv)) |

The same script trained a **Qwen3-1.7B** variant (34.9 M trainable, 109.5 min, final loss 0.021) to test whether size mattered; see [`EVALUATION.md`](EVALUATION.md).

### 3. Merge, quantise, serve

```bash
python scripts/ai/train/merge.py --base Qwen/Qwen3-0.6B --adapter models/simblip-lite-lora --out .cache/runs/lite/merged
python llama.cpp/convert_hf_to_gguf.py .cache/runs/lite/merged --outtype f16 --outfile .cache/runs/lite/lite-f16.gguf
llama.cpp/build/bin/llama-quantize .cache/runs/lite/lite-f16.gguf .cache/runs/lite/simblip-lite-Q8_0.gguf Q8_0
ollama create simblip-lite-q8 -f ai-server/Modelfile.simblip-lite   # with simblip-lite-Q8_0.gguf beside it
```

Quantisation matters: Q8_0 is indistinguishable from bf16 on our set, while Q4_K_M loses about ten points (83 % vs 93 %), so **Q8_0 is what is served**.
`ai-server/models.json` then maps the lane name `simblip-script` onto `simblip-lite-q8` with a one-line system prompt, so swapping the model never touches app code.

### 4. Reproduce it

```bash
python3 -m venv .cache/ft-venv && .cache/ft-venv/bin/pip install -r scripts/ai/train/requirements.txt
npm ci
node scripts/ai/data/build-dataset.mjs --n 4000 --seed 1 --out .cache/data     # regenerates the corpus through the simulator gate
.cache/ft-venv/bin/python scripts/ai/train/sft.py --base Qwen/Qwen3-0.6B --data .cache/data --out .cache/runs/lite
```

To skip regeneration, decompress the committed set: `mkdir -p .cache/data5 && for f in train eval eval-tools eval-tutor; do gunzip -c data/v5/$f.jsonl.gz > .cache/data5/$f.jsonl; done`.

## Findings that changed the work

* **A random id is not learnable.** The first tool-choice eval scored 100 % schema-valid and 100 % correct tool but **73 % correct arguments**: every miss was `learn.hint`'s `questionId`, which the training data had made up at random. The fix (v5) puts the id *in the prompt*. A model can copy; it cannot guess.
* **A bigger model did not help on this task.** The 1.7B fine-tune matched the 0.6B (93 % / 92.6 vs 92.4), so the 0.6B stays and no 4B was trained, until a harder evaluation set exists.
* **Quantisation is not free.** Q4_K_M cost ~10 points; Q8_0 cost none.
* **Prompting could not substitute for training.** The full-prompt 8B baseline never produced a passing scene.
