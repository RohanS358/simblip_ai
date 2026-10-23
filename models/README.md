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
