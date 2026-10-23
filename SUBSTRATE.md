# Simulator substrate


The AI layer is not a standalone program: its tools drive a simulator. To make this repository **run and test headlessly** (no browser, no Next.js app),
the files the AI code imports from the main SIMBLIP repository are vendored here as one commit (`chore/simulator-substrate`).

**Rule of thumb:** `lib/ai`, `lib/lesson`, `lib/tools`, `lib/learning`, `lib/teacher`, `lib/tts`, `lib/frame`, `lib/sketch`, `ai-server`, `scripts/ai`, `scripts/mcp`, `Modelfile`, `app/api/ai`
are the AI system. Everything listed below is the host simulator they run against.

The list was computed from the import graph (every module reachable from the AI code, minus the AI code itself), so nothing here is speculative and nothing needed is missing:
if a file were absent the 709-test suite would not load.

| Directory | Files | What it is |
|---|---:|---|
| `lib/auth` | 3 | accounts, roles and permissions (the source of truth for the tool permission gate) |
| `lib/behaviors` | 1 | behavior registry the linter reads |
| `lib/calendar` | 2 | date and event helpers |
| `lib/circuit` | 4 | circuit solver (BDF2), floating-pin check, pin-to-pin wiring |
| `lib/data` | 3 | assignments and local database types |
| `lib/dsa` | 3 | DSA Lab C++ interpreter |
| `lib/econ` | 1 | cash-flow engine (economics lane) |
| `lib/formula` | 4 | formula engine, LaTeX, system-scoped variables |
| `lib/keymap.ts` | 1 | misc support |
| `lib/legal.ts` | 1 | misc support |
| `lib/physics` | 4 | physics world, event log and flow |
| `lib/render` | 1 | connector path geometry |
| `lib/scene` | 21 | scene model, SimScript interpreter, component factory, auto-layout, wire routing |
| `lib/server` | 1 | Redis client |
| `lib/steplab` | 18 | Step Lab: ~70 algorithm steppers used by lessons |
| `lib/storage` | 4 | file storage manager (OPFS) and manifest |
| `lib/store` | 19 | document / workspace state (zustand) |
| `lib/sync` | 2 | page-sync helpers |
| `lib/text` | 5 | KaTeX and ProseMirror rich-text rendering |
| `lib/walkthrough` | 4 | product-tour engine (page tours reuse it) |
| `public` | 1 | misc support |
| `scripts` | 3 | misc support |
| `tsconfig.json` | 1 | misc support |
| `types` | 1 | misc support |

Plus `content/courses/` (125 authored lessons and 22 course manifests, as JSON, read by the lesson tests and the Lesson Player), `public/100_Questions_All_Subjects.md` (routing test corpus), `scripts/test/` (the ESM alias loader / bundler the tests use), `tsconfig.json`, and `types/poly-decomp.d.ts`.

## The one deliberate change

`lib/auth/bootstrap.ts` seeds a local-mode operator account in the main repository. Its email and password are **redacted** here
(`operator@example.invalid` / `redacted-local-demo-password`) so no credential is published. Nothing in the AI layer or the tests reads them.
Every other vendored file is byte-for-byte the main repository's, except that `lib/scene/simscript.ts` and `lib/physics/world.ts` were re-vendored with Sketch S4 (SIMBLIP `fdb6f36`, `ed92ac0`) and two files were added later (see the last table).

## Changing it

These are read-only snapshots. Fix bugs in the main SIMBLIP repository and re-vendor; do not diverge here.

## Added when the sketch pipeline needed it

| File | Why | Source |
|---|---|---|
| `lib/optics/engine.ts` | ray tracer; the optics compiler (`lib/sketch/compile-optics.ts`) and its tests trace rays through the compiled scene | SIMBLIP `fdb6f36` |
| `lib/server/auth.ts` | bearer-token claims (`bearerClaims`) read by the `/api/ai` request guard (`lib/server/ai-guard.ts`) | SIMBLIP `f47b612` |
