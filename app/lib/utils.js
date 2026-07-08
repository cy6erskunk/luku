export const SKIP_KEY = "__skip__";

export const hasApiKey = (key) => key && key !== SKIP_KEY;

export function tokenize(text) {
  const out = [], re = /(\n+|\s+|[.,!?;:"'“”‘’«»()[\]{}—–\-]+|[^\s.,!?;:"'“”‘’«»()[\]{}—–\-]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const v = m[0];
    if (/^\n+$/.test(v)) out.push({ t: "br", v });
    else if (/^\s+$/.test(v)) out.push({ t: "sp", v });
    else if (/^[.,!?;:"'“”‘’«»()[\]{}—–\-]+$/.test(v)) out.push({ t: "pu", v });
    else out.push({ t: "wd", v, k: v.toLowerCase() });
  }
  return out;
}

export function wordForms(w) {
  return Array.isArray(w?.forms) ? w.forms : [];
}

export function sentenceOf(text, word) {
  return (text.match(/[^.!?\n]+[.!?]*/g) || [text]).find((s) => s.toLowerCase().includes(word.toLowerCase())) || text.slice(0, 120);
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
