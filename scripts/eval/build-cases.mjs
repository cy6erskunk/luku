#!/usr/bin/env node
// Builds cases.json from source-text.txt.
//
// Contexts are derived with the app's own sentenceOf/tokenize, not written by
// hand, so each case carries exactly the sentence production would pass to
// translateWord — line-break hyphenation and all. Every case is verified to
// appear as a whole word token in its own context before it is emitted.
//
//   node scripts/eval/build-cases.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { sentenceOf, tokenize } from '../../app/lib/utils.js';

// base/pos are proposed labels awaiting a Finnish speaker's review.
// `uncertain` marks the ones where a careful reader could reasonably disagree.
const WORDS = [
  // verbs
  ['tarkoitti', 'tarkoittaa', 'verb', 'medium'],
  ['käytetty', 'käyttää', 'verb', 'hard', 'passive past participle — arguably its own adjective'],
  ['kokoonnuttu', 'kokoontua', 'verb', 'hard'],
  ['tarvinnut', 'tarvita', 'verb', 'hard'],
  ['tapahtunut', 'tapahtua', 'verb', 'medium'],
  ['tuhottu', 'tuhota', 'verb', 'hard', 'passive past participle'],
  ['tarjosi', 'tarjota', 'verb', 'hard'],
  ['miettineet', 'miettiä', 'verb', 'hard'],
  ['jääneet', 'jäädä', 'verb', 'hard'],
  ['kielsi', 'kieltää', 'verb', 'hard'],
  ['seurataan', 'seurata', 'verb', 'medium'],
  ['menestyy', 'menestyä', 'verb', 'easy'],
  ['päätyvät', 'päätyä', 'verb', 'easy'],
  ['ajettu', 'ajaa', 'verb', 'hard', 'passive past participle'],
  ['puhalsi', 'puhaltaa', 'verb', 'hard'],
  ['muokanneet', 'muokata', 'verb', 'hard'],
  ['joutuivat', 'joutua', 'verb', 'medium'],
  ['haki', 'hakea', 'verb', 'hard'],
  ['tekivät', 'tehdä', 'verb', 'hard'],
  ['lähtenyt', 'lähteä', 'verb', 'hard'],
  // nouns
  ['myrkkyä', 'myrkky', 'noun', 'medium'],
  ['suoneen', 'suoni', 'noun', 'hard'],
  ['toimintaan', 'toiminta', 'noun', 'medium'],
  ['järjestön', 'järjestö', 'noun', 'easy'],
  ['yhteydessä', 'yhteys', 'noun', 'hard'],
  ['porukan', 'porukka', 'noun', 'medium'],
  ['tilaisuuden', 'tilaisuus', 'noun', 'hard'],
  ['jäsenille', 'jäsen', 'noun', 'medium'],
  ['jengistä', 'jengi', 'noun', 'easy'],
  ['käänteitä', 'käänne', 'noun', 'hard'],
  ['tuulia', 'tuuli', 'noun', 'medium'],
  ['ekosysteemejä', 'ekosysteemi', 'noun', 'medium'],
  ['kanteen', 'kanne', 'noun', 'hard'],
  ['tähtäimeen', 'tähtäin', 'noun', 'hard'],
  ['hatut', 'hattu', 'noun', 'medium'],
  ['luvat', 'lupa', 'noun', 'hard'],
  ['rikoksilla', 'rikos', 'noun', 'hard'],
  ['takavarikoita', 'takavarikko', 'noun', 'hard'],
  // adjectives
  ['hämmentävältä', 'hämmentävä', 'adjective', 'hard', 'present participle — could be filed under hämmentää'],
  ['yksinkertainen', 'yksinkertainen', 'adjective', 'easy'],
  ['tehokas', 'tehokas', 'adjective', 'easy'],
  ['silkkaa', 'silkka', 'adjective', 'medium'],
  ['rikollista', 'rikollinen', 'adjective', 'medium'],
  ['näkyviä', 'näkyvä', 'adjective', 'medium', 'present participle — could be filed under näkyä'],
  ['joutilaita', 'joutilas', 'adjective', 'hard'],
  ['ahtaalle', 'ahdas', 'adjective', 'hard', 'idiomatic in "ajaa ahtaalle"; the case form is arguably lexicalised'],
  ['törkeää', 'törkeä', 'adjective', 'medium'],
  // adverbs
  ['eteenpäin', 'eteenpäin', 'adverb', 'easy'],
  ['varsinaisesti', 'varsinaisesti', 'adverb', 'easy', 'could be filed under the adjective varsinainen'],
  ['useammin', 'usein', 'adverb', 'hard', 'comparative — a dictionary may well list useammin itself'],
];

const raw = readFileSync(new URL('./source-text.txt', import.meta.url), 'utf8');
// Strip the provenance comments; the app would never see them.
const text = raw.split('\n').filter((l) => !l.startsWith('#')).join('\n');

const cases = [];
const problems = [];
for (const [word, base, pos, difficulty, note] of WORDS) {
  const context = sentenceOf(text, word).trim();
  // sentenceOf matches on substring, so verify the word is really a whole
  // token of the sentence it picked — otherwise the case would quietly carry
  // the wrong context and be scored anyway.
  const isWholeWord = tokenize(context).some(
    (t) => t.t === 'wd' && (t.w ?? t.v).toLowerCase() === word.toLowerCase()
  );
  if (!isWholeWord) { problems.push(`${word}: not a whole-word token of "${context}"`); continue; }
  cases.push({
    id: word, word, context,
    expected: { base, pos },
    tags: [pos, difficulty, ...(note ? ['review-me'] : [])],
    ...(note ? { meta: { label_note: note } } : {}),
  });
}

if (problems.length) {
  console.error('could not build these cases:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

writeFileSync(new URL('./cases.json', import.meta.url), JSON.stringify({
  _provenance: 'Words drawn from scripts/eval/source-text.txt (two photographed book pages, transcribed by hand — not OCR output, so the eval measures translation rather than OCR noise). Contexts derived with the app\'s own sentenceOf. Expected base forms and parts of speech are proposed labels pending review by a Finnish speaker.',
  cases,
}, null, 2) + '\n');

const by = (i) => cases.reduce((m, c) => ((m[c.tags[i]] = (m[c.tags[i]] || 0) + 1), m), {});
console.log(`${cases.length} cases`);
console.log('word class:', JSON.stringify(by(0)));
console.log('difficulty:', JSON.stringify(by(1)));
console.log('flagged for review:', cases.filter((c) => c.tags.includes('review-me')).map((c) => c.word).join(', '));
console.log('surface form == base form:', cases.filter((c) => c.word === c.expected.base).length);
