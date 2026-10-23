// The conversational half of the assistant.
//
// The assistant used to be a coursework tutor with one lane per kind of
// request. A chat assistant, in the sense people mean by "like Claude", also
// holds an ordinary conversation: it answers any question in plain language,
// remembers the whole thread, asks when something is unclear and says when it
// does not know. This module is that behaviour, kept apart from the tutor so
// coursework answers (derivations, numericals, notebook-ready blocks) are
// exactly what they were.
//
// Which behaviour a request gets is decided by `looksLikeCoursework` — pure
// and testable, no model call — so a derivation never gets a chatty answer and
// "hi" never gets a "**Result:**".

import { TECH_RE } from './route-intent'

/** The persona. Written as behaviour, not as claims about identity: this is the
 *  SIMBLIP assistant, powered by whichever model is configured, and it must not
 *  pretend to be anything else. */
export const CHAT_SYSTEM_PROMPT = `You are the assistant inside SIMBLIP, an engineering notebook that simulates. You are a helpful, honest, thoughtful conversational assistant. You can talk about anything, and you also happen to live in a notebook where students build simulations, take quizzes and keep notes.

HOW YOU TALK
- Be natural and direct. Match the person: a casual question gets a short, friendly answer; a hard question gets a careful, complete one. Never pad.
- Answer first, then add only the context that helps. Do not open with "Sure!", "Certainly" or "Great question", and do not end by repeating what you said.
- Prefer plain prose. Use a list only when the content really is a list, and a table only when comparing several things across several attributes. Use headings only for long, structured answers.
- Put code in fenced blocks with the language named (for example \`\`\`python). Put short code or names inline in backticks.
- Write maths with single dollars for inline ($E = mc^2$). Put a standalone equation on its own line, as a single dollar expression.
- Reply in the language the person writes in.

HOW YOU THINK
- If a request is ambiguous in a way that changes the answer, ask ONE short clarifying question instead of guessing. If it is only slightly ambiguous, answer the most likely reading and say what you assumed.
- Be honest about what you do not know. Never invent facts, quotes, sources, numbers or links. If you are unsure, say so and say how to check.
- Use the whole conversation. Words like "it", "that" or "the second one" refer to what was said earlier; resolve them from the thread rather than asking again.
- Disagree politely when you have good reason to. Do not flatter.
- If asked for something harmful, dangerous or clearly unethical, decline briefly and kindly and offer a safer alternative if there is one. Do not lecture.

WHAT YOU CAN DO HERE (mention only when it helps)
- Build a live simulation on the canvas (mechanics, circuits, optics, waves, algorithms) when asked to simulate or build something.
- Explain coursework step by step, make flash cards, quiz the person, and find lesson passages.
- Show real, high-resolution pictures when asked for them, with credit.
- You cannot browse the web, run code, or see the person's screen. A photo they attach is read for its text only; you cannot see what it shows. Say so if it matters.`

/** Token budget for a conversational reply. Long enough for a real answer,
 *  short enough that a slow device is not held for minutes. */
export const CHAT_TOKENS = 1500

/** A conversational turn as the model receives it. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** What the panel sends as history: oldest first. */
export interface HistoryItem {
  prompt: string
  answer?: string
  script?: string
}

/** How much of the thread the model reads, in characters (~4 per token). 9,000
 *  is ~2,300 tokens: the whole of an ordinary conversation, and still inside
 *  the on-device model's 6k context beside the system prompt and the reply. */
export const CHAT_HISTORY_CHARS = 9000
/** One very long past message must not crowd out everything else. */
const PER_MESSAGE_CAP = 3000

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)

/** The conversation as real prior turns (user, assistant, user, …), newest
 *  last, trimmed from the OLD end to fit the budget. The most recent exchange
 *  is always kept whole — it is the one a follow-up refers to.
 *
 *  A turn that produced only a scene has no words to remember; its script is
 *  summarised in one line so "make it faster" still has something to refer to. */
export function chatHistory(history: readonly HistoryItem[] | undefined, budget = CHAT_HISTORY_CHARS): ChatTurn[] {
  if (!history?.length) return []
  const pairs: ChatTurn[][] = []
  for (const h of history) {
    const said = (h.answer ?? '').trim() || (h.script ? `(I built a simulation for that. Its script was:\n${clip(h.script.trim(), 600)})` : '')
    const pair: ChatTurn[] = [{ role: 'user', content: clip(h.prompt.trim(), PER_MESSAGE_CAP) }]
    if (said) pair.push({ role: 'assistant', content: clip(said, PER_MESSAGE_CAP) })
    else continue // a user message with no reply would break user/assistant alternation
    pairs.push(pair)
  }
  const kept: ChatTurn[][] = []
  let used = 0
  for (let i = pairs.length - 1; i >= 0; i--) {
    const size = pairs[i].reduce((n, m) => n + m.content.length, 0)
    if (kept.length > 0 && used + size > budget) break
    kept.unshift(pairs[i])
    used += size
  }
  return kept.flat()
}

// ── Which behaviour? ───────────────────────────────────────────────────────

/** Verbs that only ever mean "do the coursework". */
const COURSEWORK_VERB_RE =
  /\b(?:derive|derivation|prove|proof|show that|obtain the expression|starting from|calculate|compute|determine|evaluate|simplify|verify|numerical|find the|state and|differentiate between|distinguish between|define|discuss|solve|worked example|step by step|explain|describe|compare)\b/i

/** Subject-matter words that mean the tutor, whatever the verb. A physics
 *  definition ("what is the photoelectric effect") is coursework even though
 *  nothing in the sentence says so. */
const SUBJECT_RE =
  /\b(?:physics|chemistry|mathematics|maths|calculus|algebra|geometry|trigonometry|statistics|probability|thermodynamic|mechanics|kinematics|dynamics|electromagnet|electrostatic|magnetic|electric|electron|photon|quantum|relativity|entropy|enthalpy|momentum|inertia|torque|energy|voltage|current|resistance|impedance|capacitance|inductance|theorem|laws?|ohm|kirchhoff|newton|faraday|maxwell|coulomb|gauss|ampere|lenz|thevenin|norton|bernoulli|hooke|boyle|snell|kepler|planck|schr[oö]dinger|heisenberg|principle|effect|equation|formula|derivative|integral|matrix|vector|eigen|laplace|fourier|transform|semiconductor|logic|boolean|karnaugh|algorithm|complexity|data structure|compiler|operating system|database|network protocol|microprocessor|digital|analog|signal|control system|stress|strain|fluid|beam|truss|economics|cash ?flow)\b/i

/** A number next to a unit, or an equation: a numerical to be worked. */
const NUMERICAL_RE = /\d\s?(?:v|a|ma|ω|ohm|kω|hz|khz|mhz|f|µf|uf|h|mh|w|kw|j|n|kg|g|m|cm|mm|km|s|ms|°c|k|rad|%)\b|[=^]\s*\d|\d\s*[=^+\-*/]\s*\d/i

/** Does this prompt need the coursework tutor rather than a conversation?
 *  Attached files count: a student who attaches a question paper wants it
 *  worked, not discussed. */
export function looksLikeCoursework(prompt: string, hasAttachments = false): boolean {
  if (hasAttachments) return true
  const p = prompt.trim()
  return COURSEWORK_VERB_RE.test(p) || TECH_RE.test(p) || SUBJECT_RE.test(p) || NUMERICAL_RE.test(p)
}

// ── Output ─────────────────────────────────────────────────────────────────

/** Normalise a chat reply for display. Unlike the tutor's cleanAnswer this KEEPS
 *  code fences (a code block is the point) and keeps a friendly opening — only
 *  maths delimiters are unified to the single-dollar form the renderer reads. */
export function cleanChat(raw: string): string {
  const collapse = (expr: string) => expr.replace(/\s*\n\s*/g, ' ').trim()
  // Maths inside code fences must not be touched.
  const parts = raw.split(/(```[\s\S]*?(?:```|$))/g)
  return parts
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, e) => `\n$${collapse(e)}$\n`)
            .replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_, e) => `\n$${collapse(e)}$\n`)
            .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_, e) => `$${collapse(e)}$`)
    )
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
