# Chat, pictures and the photo reader

Added 2026-10-24 on top of `main`, as eight stacked branches (listed below). This note says what each piece
does, where it lives, how to verify it, and what the host application has to provide, because everything
here is the *logic* layer: this repository has no React UI.

## What changed, in the order it was built

| Branch | What it adds | Lives in | Tests |
|---|---|---|---|
| `feature/tool-call-grammar` | JSON Schema to GBNF, so a small model's tool call is valid by construction | `lib/ai/engine/grammar.ts` | `grammar.test.mjs` (a GBNF matcher checks the language) |
| `fix/stop-button-actually-stops` | a user Stop is a stop, not an "AI pipeline error"; the on-device model is shut down if a clean cancel is not honoured in 300 ms | `run.ts`, `transport.ts`, `engine/local.ts` | `run.test.mjs`, `engine-local.test.mjs` |
| `feature/picture-requests` | recognise "a picture of X"; honest reply instead of ASCII art; SVG on request behind an allowlist sanitiser | `lib/ai/picture.ts` | `picture.test.mjs` |
| `fix/empty-model-answer` | an empty model answer is reported, never shown as a blank reply | `run.ts` | `run.test.mjs` |
| `feature/real-picture-search` | Wikimedia Commons search: exactly four high-resolution pictures, with author and licence | `lib/ai/image-search.ts`, `app/api/images/route.ts` | `image-search.test.mjs` |
| `feature/offline-photo-reader` | the photo reader's worker, core and language data are served from our own origin; one reused worker; downscaling; previews | `lib/ai/ocr.ts`, `scripts/copy-tesseract.mjs`, `lib/ai/attachments.ts` | `ocr.test.mjs`, `attachments.test.mjs` |
| `feature/conversational-chat-lane` | ordinary conversation is answered by a chat assistant with whole-thread memory; coursework still goes to the tutor | `lib/ai/chat.ts`, `lib/ai/route-intent.ts`, `run.ts` | `chat.test.mjs`, `conversation-routing.test.mjs` |
| `feature/chat-markdown-parser` | a safe markdown parser (text in, typed tree out) for chat replies | `lib/ai/chat-markdown.ts` | `chat-markdown.test.mjs` |

The suite went from 699 tests (697 pass, 2 skipped) on `main` to 782 (780 pass, 2 skipped); typecheck is clean at
every commit and the full `npm run test:ai` was run at every branch tip.

## Design rules that run through all of it

- **Code decides, the model words.** Whether a request is a picture request, whether it is coursework, which
  pictures qualify, whether an SVG is safe - all pure functions, all tested without a model.
- **Pictures only when asked.** A search is made only after `classifyPicture` says the user asked for one;
  "show me the answer", "show a python loop example" and "how are images stored" never trigger one.
- **Nothing a model writes can become markup.** Replies are parsed to a tree with no HTML node type; SVG goes
  through an allowlist and is displayed through an `<img>` data URI; picture URLs must be https on Wikimedia's own
  hosts.
- **Fail in plain words.** A photo that cannot be read, a search that is down, an empty model answer and a
  stopped request each say what happened and what to do next. None surfaces an exception.

## What the host application must provide

- **Serve the photo reader's files.** Run `npm run assets:tesseract` (copies five files from `node_modules` into
  `public/vendor/tesseract/`, which is git-ignored) and serve `/vendor/tesseract/`. Outside a browser `readPhoto`
  falls back to tesseract.js's own defaults.
- **Content-Security-Policy.** `img-src` must allow `https:` and `data:`. If the host fetches picture bytes to place
  them on a page, `connect-src` needs `https://upload.wikimedia.org` and `https://thumb.wikimedia.org`.
- **Pictures.** Pass `images` to `runAi` (the browser transport already does, through `/api/images`; the hosted route
  calls `searchCommons` directly). Render `AiResponse.images` with its `credit` and `href` - the licence is the point of
  using Commons, so do not show a picture without it.
- **Stop.** Pass an `AbortSignal` as `deps.signal` (`streamAi` does). A cancelled request ends by throwing, not with a
  `done` event: show "Stopped.".
- **Replies.** Render `parseMarkdown()` output with escaped text nodes. Links need `rel="noopener noreferrer nofollow"`.

## Limits, stated plainly

- **Pictures depend on Wikimedia Commons.** Unusual subjects may have fewer than four high-resolution files; the
  reply then says "I could only find N" rather than padding. The route limits each IP to 20 searches a minute.
- **A photo is read for its words only.** The assistant cannot see what a photo shows, and says so.
- **Chat versus coursework is a heuristic.** `looksLikeCoursework` uses verbs, subject vocabulary, named laws and
  numbers with units. A borderline question can land in the other lane; both lanes answer it, in a different style.
- **Quality of chat answers is the configured model's.** This work gives it a persona, memory and formatting; it does
  not make a 0.6B model as capable as a large one.
- **Not exercised end to end here:** the UI that renders pictures, previews and markdown is in the SIMBLIP app, not in
  this repository. The OCR test that runs real Tesseract in Node needs network access for the language data and skips
  when offline.
