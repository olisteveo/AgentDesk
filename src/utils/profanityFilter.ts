/**
 * Robust profanity filter for display names and avatar names.
 *
 * Five-pass strategy:
 *   Pass 1 — Normalise leet-speak + phonetic substitutions, preserve word
 *            boundaries, match with \b. Handles standard cases.
 *   Pass 2 — Strip ALL non-alpha, do substring match with 4+ char words only.
 *            Catches heavy obfuscation like f*cker, f.u.c.k, fuck@r.
 *   Pass 3 — Vowel expansion: replace non-alpha with each vowel and recheck.
 *            Catches f*ck, sh*t, c*nt, b*tch etc.
 *   Pass 4 — Repeated-char squashing: fuuuck→fuck, shhiiit→shit, biiiitch→bitch.
 *            Catches stretched words.
 *   Pass 5 — Phonetic normalisation: ph→f, ck→k, x→ks, etc. then recheck.
 *            Catches "phuck", "fvck", "pussay", "azzhole" etc.
 */

// ── Blocked words ────────────────────────────────────────────────
const BLOCKED_BASES = [
  // Common profanities (include compound forms & common misspellings)
  'fuck', 'fucker', 'fucking', 'fucked', 'fuckoff', 'fuckface', 'fuckwit',
  'fuk', 'fuking', 'fuked', 'fuc', 'fuq', 'fuqer', 'phuck', 'phuk',
  'fvck', 'fvk', 'fcuk', 'fcking', 'fck', 'fk', 'effing', 'sht', 'btch', 'dck',
  'shit', 'shitter', 'shitting', 'shite', 'shithead', 'shitface',
  'shyt', 'shet', 'shiit', 'shiz', 'sheeit',
  'asshole', 'arsehole', 'asswipe', 'azzhole',
  'bitch', 'bitches', 'biatch', 'beyotch', 'biotch',
  'bastard', 'bastad', 'basterd',
  'dammit', 'damnit',
  'dick', 'dik', 'dickhead', 'dickface', 'dikhead',
  'cock', 'cockhead', 'cocksucker', 'cocksuka',
  'pussy', 'pussay', 'pussie', 'pussi', 'pussies', 'pusy', 'pusay',
  'cunt', 'cunts', 'kunt', 'kunts',
  'wanker', 'wank', 'wanka', 'wankar', 'wankah', 'wanking',
  'twat', 'twats', 'tw4t',
  'bollocks', 'bollock', 'bollox', 'bollucks',
  'piss', 'pissed', 'pising', 'pisoff',
  'whore', 'hoar', 'whoar',
  'slut', 'slutty', 'sloot',
  'prick', 'prik', 'priq',
  'tosser', 'tossa', 'tossah',
  'bellend', 'belend',
  'minge', 'minger', 'minging',
  'nonce', 'nonse', 'noncey',
  'shagging', 'shag', 'shagged', 'shagger',
  'wazzock',

  // Slurs & hate speech (+ common evasions)
  'nigger', 'nigga', 'nigg3r', 'niga', 'n1gger', 'n1gga', 'negro',
  'faggot', 'fag', 'fagot', 'fagg', 'fagit',
  'retard', 'retarded', 'retart', 'reetar',
  'spastic', 'spaz', 'spazz', 'spaztic',
  'tranny', 'trannie',
  'chink', 'chinky',
  'kike', 'kyke',
  'wetback',
  'beaner',
  'gook',
  'coon', 'coons',
  'dyke', 'dike',
  'paki', 'pakki',
  'raghead',
  'towelhead',
  'honky', 'honkey',

  // Sexual
  'dildo', 'dildos', 'vibrator',
  'blowjob', 'blowjobs', 'blowj',
  'handjob', 'handjobs',
  'jizz', 'jism', 'cumshot', 'cumming', 'cummed',
  'porn', 'porno', 'pornography',
  'hentai',
  'milf',
  'penis', 'penises', 'peen', 'peenis',
  'vagina', 'vag', 'vajayjay', 'vajay',
  'boobs', 'boob', 'boobies', 'bewbs',
  'anal',
  'tits', 'titties', 'titty',
  'ballsack', 'nutsack', 'ballsak',
  'erection',
  'orgasm',
  'clitoris', 'clit',
];

// Words that contain blocked substrings but are legitimate
const WHITELIST = [
  'scunthorpe', 'raccoon', 'cocoon', 'cocktail', 'peacock',
  'hancock', 'hitchcock', 'babcock', 'woodcock', 'gamecock',
  'sussex', 'essex', 'middlesex',
  'analyst', 'analysis', 'analytical', 'therapist', 'therapy',
  'dickens', 'dickson', 'benedict', 'dickensian', 'dickerson',
  'addictive', 'addict', 'addiction', 'predict', 'prediction', 'verdict',
  'indicator', 'dictionary', 'dictate', 'contradict', 'jurisdiction',
  'prickly', 'prickle',
  'arsenal',
  'assassin', 'assassination', 'assassinate',
  'bassist', 'bassoon', 'bass',
  'classic', 'classification', 'classical',
  'compass', 'trespass', 'bypass', 'surpass', 'encompass',
  'assume', 'assumption', 'assemble', 'assembly', 'assert',
  'assign', 'assignment', 'assist', 'assistant', 'associate',
  'assess', 'assessment', 'asset', 'assets',
  'passage', 'passenger', 'passion', 'passive', 'passport',
  'brass', 'grass', 'mass', 'class', 'glass',
  'coon cheese',  // Australian cheese brand
  'button', 'cotton', 'kitten', 'mitten', 'bitten', 'rotten',
  'flagrant', 'fragment',
  'penisular', 'peninsula',
  'organism', 'organic', 'organize',
  'title', 'titled', 'entitled',
  'manslaughter',
  'grape', 'drape',
  'therapist',
  'shitake', 'shiitake',
  'count', 'counter', 'country', 'county', 'account', 'discount', 'recount',
  'exchange',
  'execute', 'execution',
  'sextant', 'sexton',
  'japeanese',
  'spangle', 'spanish',
  'wankle',  // Wankel engine
  'cumberland',
  'peniston', 'penistone',  // UK place name
  'shillings', 'tithing',
  'analytics',
  'canals',
  'analytic', 'analogue', 'analog',
  'cocking', 'cocked',  // verb forms / place name
  'pricking', 'pricked',  // verb forms
  'docking', 'docked',
  'knocking', 'knocked',
  'stocking', 'stockings',
  'rocking', 'rocked',
  'locking', 'locked',
  'mocking', 'mocked',
  'flocking', 'flocked',
  'clocking', 'clocked',
  'blocking', 'blocked',
  'shocking', 'shocked',
];

const whitelistSet = new Set(WHITELIST);

function isWhitelisted(text: string): boolean {
  const lower = text.toLowerCase().trim();
  for (const safe of whitelistSet) {
    if (lower.includes(safe)) return true;
  }
  return false;
}

// ── Enhanced leet-speak & symbol normalisation ───────────────────

/** Map leet-speak characters and common symbol substitutions to letters */
function leetToAlpha(text: string): string {
  return text
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/6/g, 'g')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/9/g, 'g')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/\+/g, 't')
    .replace(/!/g, 'i')
    .replace(/\|/g, 'i')
    .replace(/\(/g, 'c')
    .replace(/\{/g, 'c')
    .replace(/</g, 'c')
    .replace(/\}/g, '')
    .replace(/\)/g, '')
    .replace(/>/g, '')
    .replace(/¡/g, 'i')
    .replace(/£/g, 'e')
    .replace(/€/g, 'e')
    .replace(/µ/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ä/g, 'a')
    .replace(/à|á|â|ã/g, 'a')
    .replace(/è|é|ê|ë/g, 'e')
    .replace(/ì|í|î|ï/g, 'i')
    .replace(/ò|ó|ô|õ/g, 'o')
    .replace(/ù|ú|û/g, 'u')
    .replace(/ÿ|ý/g, 'y');
}

/** Squash repeated characters: fuuuck→fuck, shhiiit→shit */
function squashRepeats(text: string): string {
  return text.replace(/(.)\1{1,}/g, '$1');
}

/** Phonetic normalisation: ph→f, ck→k, double letters, etc. */
function phoneticNormalise(text: string): string {
  return text
    .replace(/ph/g, 'f')            // phuck → fuck
    .replace(/ck/g, 'k')            // fvck → fvk (after other transforms)
    .replace(/kk/g, 'k')            // fukk → fuk
    .replace(/ss/g, 's')            // asss → as
    .replace(/ff/g, 'f')
    .replace(/tt/g, 't')
    .replace(/ll/g, 'l')
    .replace(/cc/g, 'c')
    .replace(/pp/g, 'p')
    .replace(/nn/g, 'n')
    .replace(/mm/g, 'm')
    .replace(/rr/g, 'r')
    .replace(/zz/g, 'z')
    .replace(/wh/g, 'w')            // whore normalisation (already caught but defensive)
    .replace(/x/g, 'ks')            // sexi → seksi → catches more
    .replace(/q/g, 'k')             // fuq → fuk → fuck
    .replace(/z/g, 's')             // azzhole → asshole
    .replace(/v/g, 'u')             // fvck → fuck
    .replace(/y$/g, 'i')            // slutty already caught, but pussay → pussai
    .replace(/ay$/g, 'i')           // pussay → pussi
    .replace(/ey$/g, 'i')           // dickey
    .replace(/ah$/g, 'a')           // wankah → wanka
    .replace(/er$/g, 'a')           // wanker/fucker: won't break the base match
    .replace(/or$/g, 'a')
    .replace(/ar$/g, 'a');
}

// ── Pass 1: word-boundary matching ──────────────────────────────

function normalise(text: string): string {
  return leetToAlpha(text.toLowerCase())
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

const blockedPattern = new RegExp(
  `\\b(${BLOCKED_BASES.join('|')})\\b`,
  'i'
);

// ── Pass 2: stripped substring matching (4+ char words) ─────────

const LONG_BLOCKED = BLOCKED_BASES.filter(w => w.length >= 4);
const strippedPattern = new RegExp(
  LONG_BLOCKED.join('|'),
  'i'
);

function strip(text: string): string {
  return leetToAlpha(text.toLowerCase()).replace(/[^a-z]/g, '');
}

// ── Pass 3: vowel expansion for censored vowels (f*ck → fuck) ──

function checkVowelExpansion(text: string): boolean {
  const lower = leetToAlpha(text.toLowerCase());
  if (/[^a-z]/.test(lower)) {
    for (const v of ['a', 'e', 'i', 'o', 'u']) {
      const expanded = lower.replace(/[^a-z]+/g, v);
      if (blockedPattern.test(expanded)) return true;
      // Also check stripped+expanded against long pattern
      if (strippedPattern.test(expanded)) return true;
    }
  }
  return false;
}

// ── Pass 4: repeated-character squashing ────────────────────────

function checkSquashed(text: string): boolean {
  const squashed = squashRepeats(strip(text));
  // Check squashed form against both patterns
  if (blockedPattern.test(squashed)) return true;
  if (strippedPattern.test(squashed)) return true;
  return false;
}

// ── Pass 5: phonetic normalisation ──────────────────────────────

function checkPhonetic(text: string): boolean {
  const stripped = strip(text);
  const phonetic = phoneticNormalise(stripped);
  const squashed = squashRepeats(phonetic);
  // Check all combinations
  if (strippedPattern.test(phonetic)) return true;
  if (strippedPattern.test(squashed)) return true;
  if (blockedPattern.test(phonetic)) return true;
  if (blockedPattern.test(squashed)) return true;
  return false;
}

// ── Pass 6: vowel-swap after squashing ──────────────────────────
// Catches "faaaack" (squash→fack, swap a→u → fuck) and similar
// where someone replaces a vowel with a different repeated vowel.
function checkVowelSwap(text: string): boolean {
  const squashed = squashRepeats(strip(text));
  // Only try if short enough (performance guard)
  if (squashed.length > 30) return false;
  const vowels = ['a', 'e', 'i', 'o', 'u'];
  // For each vowel in the squashed text, try replacing with each other vowel
  for (const fromV of vowels) {
    if (!squashed.includes(fromV)) continue;
    for (const toV of vowels) {
      if (fromV === toV) continue;
      const swapped = squashed.replace(new RegExp(fromV, 'g'), toV);
      if (blockedPattern.test(swapped)) return true;
      if (strippedPattern.test(swapped)) return true;
    }
  }
  return false;
}

// ── Ambiguous symbol stripping ───────────────────────────────────
// Some symbols like $ and @ can be both leet-speak AND separators.
// e.g. f$ck — $ could be 's' (giving fsck) or a separator (giving f_ck).
// We try both interpretations by also stripping ambiguous symbols.
function stripAmbiguous(text: string): string {
  return text.replace(/[$@]/g, '');
}

// ── Main check ──────────────────────────────────────────────────

/** Run all passes on a single text variant */
function runAllPasses(text: string): boolean {
  // Pass 1: word-boundary match (catches "shit", "Mr Wanker", "b1tch")
  if (blockedPattern.test(normalise(text))) return true;

  // Pass 2: stripped substring (catches "fucker123", "fuck@r", "sh1thead")
  if (strippedPattern.test(strip(text))) return true;

  // Pass 3: vowel expansion (catches "f*cker", "f*ck", "c*nt")
  if (checkVowelExpansion(text)) return true;

  // Pass 4: repeated chars (catches "fuuuck", "shhiiit", "biiiitch")
  if (checkSquashed(text)) return true;

  // Pass 5: phonetic (catches "phuck", "fvck", "pussay", "azzhole", "w4nker")
  if (checkPhonetic(text)) return true;

  // Pass 6: vowel swap (catches "faaaack"→fack→fuck, "sheeet"→shet→shit)
  if (checkVowelSwap(text)) return true;

  return false;
}

/**
 * Returns true if the text contains profanity or offensive language.
 */
export function containsProfanity(text: string): boolean {
  // Allow known safe words that contain blocked substrings
  if (isWhitelisted(text)) return false;

  // Try with standard leet mapping
  if (runAllPasses(text)) return true;

  // Also try with ambiguous symbols ($, @) stripped rather than mapped
  // This catches "f$ck" (→ "fck" → vowel expansion → "fuck")
  const ambigStripped = stripAmbiguous(text);
  if (ambigStripped !== text && runAllPasses(ambigStripped)) return true;

  return false;
}

/**
 * Returns a user-friendly error message if name is invalid, or null if clean.
 */
export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 1) return 'Name cannot be empty';
  if (trimmed.length > 30) return 'Name must be 30 characters or fewer';
  if (containsProfanity(trimmed)) return 'Please choose an appropriate name';
  return null;
}
