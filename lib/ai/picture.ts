// Requests for a PICTURE ("a photo of a gorilla", "diagram of a gorilla").
//
// A text model cannot produce a real photograph, and the ASCII art it used to
// answer with is not a picture — it is a wrong answer that looks like an
// effort. So these requests get an honest reply with real options, and the one
// thing a text model CAN do well: write compact vector code the student saves
// and opens anywhere.
//
// Pure functions, no model call for the reply. Technical subjects (circuits,
// free-body diagrams, graphs, data structures…) are NOT handled here: SIMBLIP
// can actually build those, so they keep going to the scene/explain lanes.

/** Things SIMBLIP can really draw or simulate. A request for one of these is
 *  never a "get me a photo" request. */
const BUILDABLE_RE = new RegExp(
  '\\b(?:' +
  [
    'circuit|resistor|capacitor|inductor|diode|transistor|bjt|mosfet|op-?amp|amplifier|rectifier|filter|oscillator',
    'gate|flip-?flop|counter|multiplexer|decoder|adder|latch|truth table|logic',
    'pendulum|spring|projectile|collision|pulley|incline|free[- ]?body|force|vector|phasor|waveform|wave|signal',
    'lens|mirror|ray|optic|field|motor|generator|transformer',
    'graph|plot|chart|table|flow ?chart|block diagram|state machine|automaton|network|topology|uml|erd',
    'tree|linked list|stack|queue|heap|array|sort|search|algorithm|pointer|memory|cpu|pipeline',
    'equation|formula|derivation|proof|simulat',
  ].join('|') +
  ')',
  'i'
)

/** The words that mean "a picture". */
const PW = '(?:pictures?|photos?|photographs?|images?|pics?|illustrations?|drawings?|sketch(?:es)?|portraits?|diagrams?|figures?)'

/** Ways to ask for a picture. `maxWords` bounds the subject: with an explicit
 *  picture word the subject can be a short phrase ("red panda eating bamboo"),
 *  but without one ("show me …") it must be a plain thing, or "show me the
 *  answer" would go looking for pictures of an answer. */
const PICTURE_RES: { re: RegExp; maxWords: number; explicit?: boolean }[] = [
  // "pictures of X", "a diagram of X", "photo for X"
  { re: new RegExp(String.raw`\b${PW}\b[^.?!]*?\b(?:of|for|showing|about)\b\s+(?:an?\s+|the\s+)?(.+?)\s*[.?!]*$`, 'i'), maxWords: 6, explicit: true },
  // "gorilla images", "send me a cat photo", "show gorilla pictures", "give me 4 images lion"
  {
    re: new RegExp(
      String.raw`^(?:please\s+)?(?:(?:show|give|send|get|find|fetch|display|bring)(?:\s+me)?\s+|i\s+(?:want|need|would like)\s+|can\s+(?:you|i)\s+(?:show|give|get|send)\s+(?:me\s+)?)?(?:some\s+|a\s+few\s+|\d+\s+|the\s+|an?\s+)?(.+?)\s+${PW}\s*(?:please|for me)?\s*[.?!]*$`,
      'i'
    ),
    maxWords: 3,
    explicit: true,
  },
  // "what does X look like", "what a gorilla looks like"
  { re: /\bwhat\s+(?:does|do|did)\s+(?:an?\s+|the\s+)?(.+?)\s+look(?:s)?\s+like\b/i, maxWords: 4 },
  { re: /\bwhat\s+(?:an?\s+|the\s+)?(.+?)\s+looks?\s+like\b/i, maxWords: 4 },
  // "draw X"
  { re: /\b(?:draw|paint|sketch)(?:\s+me)?\s+(?:an?\s+|the\s+)?(.+?)\s*[.?!]*$/i, maxWords: 4 },
  // "show me X", "I want to see X"
  { re: /\b(?:show(?:\s+me)?|i\s+(?:want|need|wanna)\s+to\s+see|let\s+me\s+see|can\s+i\s+see)\s+(?:an?\s+|the\s+)?(.+?)\s*[.?!]*$/i, maxWords: 3 },
]

/** A "subject" that is really a question or an abstract thing is not something
 *  with a photograph. */
const NOT_A_SUBJECT_RE =
  /^(?:in|on|at|as|by|with|of|for|to|and|or|please|any|how|why|what|when|where|which|who|whether|if|that|this|it|them|me|more|another|answer|solution|steps?|work|working|result|results|code|example|examples|derivation|proof|explanation|summary|notes?|formula|equation|list|table|difference|meaning|definition|everything|anything|something|all)\b/i

/** "in image", "as a picture", "the photo please": the answer to our own offer,
 *  with the subject taken from the previous request. */
const FOLLOWUP_RE = /^(?:please\s+)?(?:(?:in|as|with|by)\s+(?:an?\s+)?(?:image|picture|photo|pic|diagram)s?|(?:an?\s+|the\s+)?(?:image|picture|photo|pic|diagram)s?(?:\s+please)?|show (?:it|them)(?:\s+(?:in|as)\s+(?:an?\s+)?(?:image|picture|photo))?)\s*[.!?]*$/i
const DIAGRAM_WORD_RE = /\b(?:diagram|drawing|sketch|illustration|figure|vector)s?\b/i

const clean = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/\s+(?:please|pls|thanks|thank you|for me|now)$/i, '')
    .replace(/^(?:an?|the|my|some)\s+/i, '')
    .replace(/[“”"]/g, '')
    .trim()
    .slice(0, 60)

export type PictureAsk =
  | { kind: 'photo'; subject: string; want: 'photo' | 'diagram' }

/** `lastPrompt` is the previous user turn: "yes, give me the code" has no
 *  subject of its own, so it borrows the one the previous request named. */
export function classifyPicture(prompt: string, lastPrompt?: string): PictureAsk | null {
  const p = prompt.trim()
  if (!p || p.length > 300) return null

  const subjectOf = (text: string): string | null => {
    if (BUILDABLE_RE.test(text)) return null
    for (const { re, maxWords, explicit } of PICTURE_RES) {
      const m = re.exec(text)
      if (!m?.[1]) continue
      const s = clean(m[1])
      if (s.length < 2 || s.split(' ').length > maxWords) continue
      if (BUILDABLE_RE.test(s) || NOT_A_SUBJECT_RE.test(s)) continue
      return s
    }
    return null
  }

  if (FOLLOWUP_RE.test(p) && lastPrompt) {
    const subject = subjectOf(lastPrompt)
    if (subject) return { kind: 'photo', subject, want: DIAGRAM_WORD_RE.test(p) || DIAGRAM_WORD_RE.test(lastPrompt) ? 'diagram' : 'photo' }
  }

  const subject = subjectOf(p)
  return subject ? { kind: 'photo', subject, want: DIAGRAM_WORD_RE.test(p) ? 'diagram' : 'photo' } : null
}

/** The honest reply, used when no real pictures could be fetched: no ASCII
 *  art, three real ways forward. */
export function pictureReply(subject: string, searchFailed = false): string {
  return [
    searchFailed
      ? `I couldn’t reach the image search just now, and I can’t draw a real picture of ${subject} myself. I only write text, and ASCII art is not a picture, so I won’t pass it off as one.`
      : `I can’t produce a real picture or photo of ${subject}. I only write text, and ASCII art is not a picture, so I won’t pass it off as one.`,
    '',
    'Here is what works:',
    '',
    `1. **Use a real image.** Upload a photo or a PDF that contains ${subject} (Uploads in the sidebar, or the paperclip here) and I will work from it: label it, explain it, or quiz you on it.`,
    `2. **Create it yourself.** Draw ${subject} with the pen on a board, or find one on an image site such as Wikimedia Commons and upload it.`,
    `3. **Get code for a simple illustration.** Reply “SVG code for ${subject}” and I will write a compact, self-contained SVG you can save as a .svg file and open in any browser.`,
  ].join('\n')
}
