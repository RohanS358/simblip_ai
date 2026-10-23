# Models

| File | What | Size | In git? |
|---|---|---:|---|
| [`simblip-lite-lora/`](simblip-lite-lora) | **LoRA adapter** for `Qwen/Qwen3-0.6B`, the output of the fine-tune ([`docs/FINE_TUNING.md`](../docs/FINE_TUNING.md)) | 81 MB | **yes** |
| `simblip-lite-Q8_0.gguf` | Adapter merged into the base, quantised to Q8_0. **The model that is served.** | 639,446,784 B | release asset (too large for git) |
| `simblip-lite-Q4_K_M.gguf` | Same, Q4_K_M. 10 points worse on the novel set; kept for the on-device tier | 396,704,512 B | release asset |

SHA-256:

```
e64371c9abdb08a35138c0eb14fb8ab82595f4665518d8593da3be04e7ad8e08  simblip-lite-Q8_0.gguf
dc57bfa73fc148ce7b59b8ecd8b2acb2696741114948e766ff197ba46a96c6c2  simblip-lite-Q4_K_M.gguf
```

## Get it running (two ways)

**A. Rebuild from the adapter in this repo** (needs the base model from Hugging Face, ~1.2 GB):

```bash
python3 -m venv .cache/ft-venv && .cache/ft-venv/bin/pip install -r scripts/ai/train/requirements.txt
.cache/ft-venv/bin/python scripts/ai/train/merge.py --base Qwen/Qwen3-0.6B --adapter models/simblip-lite-lora --out .cache/runs/lite/merged
# then convert + quantise with llama.cpp, see docs/FINE_TUNING.md §3
```

**B. Download the GGUF** from this repository's Releases, check the SHA-256 above, then:

```bash
ollama create simblip-lite-q8 -f ai-server/Modelfile.simblip-lite     # the .gguf must sit beside the Modelfile
ollama pull qwen3:8b                                                    # planner / explainer / tool lane
AI_SERVER_KEY=$(openssl rand -hex 32) npm run ai-server
```

Lane → model mapping lives in [`ai-server/models.json`](../ai-server/models.json).

## SketchNet (the sketch recognisers)

Small convolutional classifiers that run in the browser, trained by [`scripts/ai/sketch/train`](../scripts/ai/sketch/train) and exported by `npm run sketch:export`. They are tiny (about 465 KB each) and are committed with their metadata, under [`public/models/`](../public/models) (the path the host app serves them from).

| File | What | Notes |
|---|---|---|
| `sketchnet-v1.{onnx,bin,json}` | 21 wave-1 circuit classes + unknown, plus pose; 116,570 parameters | ONNX for tooling, `.bin` + `.json` for the in-browser loader (`lib/sketch/sketchnet.ts`) |
| `inkchars-v1.{onnx,bin,json}` | handwritten digits and unit letters for reading values beside a part | `lib/sketch/values.ts` |

Reports are in [`docs/ai/reports/`](../docs/ai/reports). **Read them with their caveat:** the held-out numbers (SketchNet v1: 98.1 % top-1 on 40,730 unseen *synthetic* writers, ECE 0.004) are on synthetic strokes only, and the decision log says so. A real-world number does not exist yet. The data is generated (`npm run sketch:synth`), not committed.
