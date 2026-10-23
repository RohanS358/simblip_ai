# Limitations and future improvements

Written to be read, not to be defensive. These are the things we know are not finished.

## Limitations

| Area | Limitation | What happens today |
|---|---|---|
| **Model capability** | The 0.6B fine-tune cannot write complete transistor / op-amp circuits unprompted; optics and refraction scenes often fail lint. | Exact recipes cover the textbook multi-pin circuits (common-emitter, BJT differential pair, inverting / non-inverting op-amp); other topics fall back to concept diagrams, and the film says it is *not verified by the simulator*. |
| **Evaluation** | The 30-prompt novel set is saturated; quality scores are proxies; one machine, greedy, single run. | Documented in [`EVALUATION.md`](EVALUATION.md). No claim is made that Lite beats larger models in general, only on this task. |
| **Tool arguments** | The committed tool-choice run shows 73 % argument accuracy (the v4 data); the v5 fix is recorded but its result file was not kept. | Re-run `scripts/ai/eval` against the v5 eval set to regenerate it. |
| **Languages** | Lessons and narration are English. Kokoro has Hindi voices (not wired in); Nepali has no open model. | Nearest fallback is Hindi. |
| **Page tours** | PDFs, images, spreadsheets and web pages are read only as *attachments* (`teach.material`), not as the open page. | Board, document and slide-deck pages are read in full. |
| **Lesson latency** | A first film for a new topic takes ~25–50 s (planning + scenes); replays come from a per-user cache. | The "preparing" state narrates progress. |
| **Hardware** | Training and the 8B planner need a GPU (8 GB used). The on-device tier runs in the browser but is smaller. | `ai-server/models.json` lanes can point at any Ollama-compatible endpoint. |
| **Scope of this repo** | The simulator is vendored, not re-implemented; the full UI lives in the main SIMBLIP repo. | See [`SUBSTRATE.md`](../SUBSTRATE.md). |
| **Weights** | The 610 MB GGUF is not in git history. | The LoRA adapter *is* (`models/simblip-lite-lora/`); [`models/README.md`](../models/README.md) says how to rebuild or download the GGUF and gives its SHA-256. |

## Future improvements (in priority order)

1. **A harder evaluation set**: multi-part scenes and unusual components. Only then train a larger model; promote the 1.7B as a "Standard" tier if it wins there.
2. **Optics / waves recipes** in the training data, to close the weakest scene family.
3. **Model-written storyboard lane** for lessons that need free-form structure, with the same grammar constraint and lint gate.
4. **Multi-pin completion**: train on the exact recipes' structure so the model, not only the recipe table, can finish transistor circuits.
5. **Richer page tours** (more detail per item; PDFs, images and spreadsheets as the open page).
6. **`.webm` export** of lessons via tab capture.
7. **Hindi narration** (voices exist) and a Nepali pipeline if a model appears.
8. **Per-user FSRS parameter optimisation** (swap the hand-rolled scheduler for `ts-fsrs`) once there is review data.
9. **Embeddings for retrieval** only if BM25 recall is measured to be insufficient.
