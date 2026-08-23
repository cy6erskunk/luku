export const SKIP_KEY = "__skip__";

export const hasApiKey = (key) => key && key !== SKIP_KEY;

// Hyphen-minus plus the unicode hyphen (U+2010) and non-breaking hyphen
// (U+2011); the tokenizer's punctuation class carries all three.
const HYPHEN = /^[-‐‑]$/;

// Finnish hyphenates by syllable at a line break ("sanakir-\njassa"), so the
// hyphen belongs to the typesetting, not the word — except when the break
// happens to fall on a compound's own hyphen. Those compounds are built from
// acronyms, numbers or proper nouns ("EU-maat", "1990-luvulla",
// "Helsinki-Vantaa"), which is what this sniffs for.
export function joinHyphenated(head, tail) {
  const keepHyphen =
    /\d$/.test(head) ||
    (head === head.toUpperCase() && head !== head.toLowerCase()) ||
    (!!tail[0] && tail[0] !== tail[0].toLowerCase());
  return keepHyphen ? `${head}-${tail}` : `${head}${tail}`;
}

// A word broken across two lines arrives as separate tokens, one per line.
// Give both halves the whole word (`w`) and its key, so tapping either one
// translates — and highlights — the word the reader actually sees.
function linkHyphenatedLineBreaks(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].t !== "wd") continue;
    let j = i + 1;
    if (tokens[j]?.t !== "pu" || !HYPHEN.test(tokens[j].v)) continue;
    j++;
    // Exactly one newline between the halves — a space may sit either side of
    // it, but a blank line is a paragraph break, not a wrap.
    let breaks = 0;
    while (tokens[j]?.t === "sp" || tokens[j]?.t === "br") {
      breaks += (tokens[j].v.match(/\n/g) || []).length;
      j++;
    }
    if (breaks !== 1 || tokens[j]?.t !== "wd") continue;
    const whole = joinHyphenated(tokens[i].v, tokens[j].v);
    const k = whole.toLowerCase();
    tokens[i] = { ...tokens[i], w: whole, k };
    tokens[j] = { ...tokens[j], w: whole, k };
    i = j;
  }
  return tokens;
}

export function tokenize(text) {
  const out = [], re = /(\s+|[.,!?;:"'“”‘’«»()[\]{}—–\-‐‑]+|[^\s.,!?;:"'“”‘’«»()[\]{}—–\-‐‑]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const v = m[0];
    // A whitespace run can mix spaces and newlines (a line ending in a space,
    // or an indented next line). Split it so every line break gets its own
    // token and the rendered text keeps the layout it was scanned with.
    if (/^\s+$/.test(v)) {
      for (const [ws] of v.matchAll(/\n+|[^\S\n]+/g)) out.push({ t: ws.includes("\n") ? "br" : "sp", v: ws });
    }
    else if (/^[.,!?;:"'“”‘’«»()[\]{}—–\-‐‑]+$/.test(v)) out.push({ t: "pu", v });
    else out.push({ t: "wd", v, k: v.toLowerCase() });
  }
  return linkHyphenatedLineBreaks(out);
}

// Rejoins words the typesetter split across lines, so a sentence reads as one
// line and contains the whole word rather than two fragments.
export function dehyphenate(text) {
  return String(text ?? "").replace(
    /([^\s.,!?;:"'“”‘’«»()[\]{}—–\-‐‑]+)[-‐‑][^\S\n]*\n[^\S\n]*([^\s.,!?;:"'“”‘’«»()[\]{}—–\-‐‑]+)/g,
    (_, head, tail) => joinHyphenated(head, tail)
  );
}

export function wordForms(w) {
  return Array.isArray(w?.forms) ? w.forms : [];
}

export function sentenceOf(text, word) {
  const t = dehyphenate(text);
  return (t.match(/[^.!?\n]+[.!?]*/g) || [t]).find((s) => s.toLowerCase().includes(word.toLowerCase())) || t.slice(0, 120);
}

// Returns the existing DB word that matches either the tapped form or the
// resolved base (case-insensitive), or null. Matches against a word's own
// base and any recorded inflection in its forms array.
export function findExistingWord(dbWords, { form, base } = {}) {
  const f = (form || "").toLowerCase();
  const b = (base || "").toLowerCase();
  if (!f && !b) return null;
  if (!Array.isArray(dbWords)) return null;
  for (const w of dbWords) {
    const wb = (w?.base || "").toLowerCase();
    if (b && wb && wb === b) return w;
    if (f && wb && wb === f) return w;
    if (f && Array.isArray(w?.forms)) {
      for (const fx of w.forms) {
        if ((fx?.word || "").toLowerCase() === f) return w;
      }
    }
  }
  return null;
}
