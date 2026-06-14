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

// Scanned inflections of a saved word. Rows saved before the forms column
// existed fall back to the single stored inflection (no form translation).
export function wordForms(w) {
  if (Array.isArray(w?.forms) && w.forms.length > 0) return w.forms;
  if (w?.word && w?.base && w.word.toLowerCase() !== w.base.toLowerCase()) {
    return [{ word: w.word, translation: null }];
  }
  return [];
}

export function sentenceOf(text, word) {
  return (text.match(/[^.!?\n]+[.!?]*/g) || [text]).find((s) => s.toLowerCase().includes(word.toLowerCase())) || text.slice(0, 120);
}
