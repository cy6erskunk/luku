export const SKIP_KEY = "__skip__";

export const hasApiKey = (key) => key && key !== SKIP_KEY;

export function tokenize(text) {
  const out = [], re = /(\n+|\s+|[.,!?;:"""''«»—–\-]+|[^\s.,!?;:"""''«»—–\-]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const v = m[0];
    if (/^\n+$/.test(v)) out.push({ t: "br", v });
    else if (/^\s+$/.test(v)) out.push({ t: "sp", v });
    else if (/^[.,!?;:"""''«»—–\-]+$/.test(v)) out.push({ t: "pu", v });
    else out.push({ t: "wd", v, k: v.toLowerCase() });
  }
  return out;
}

export function sentenceOf(text, word) {
  return (text.match(/[^.!?\n]+[.!?]*/g) || [text]).find((s) => s.toLowerCase().includes(word.toLowerCase())) || text.slice(0, 120);
}
