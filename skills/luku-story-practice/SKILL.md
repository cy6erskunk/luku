---
name: "luku-story-practice"
description: "Two-step Finnish vocabulary practice from the user's Luku cards: a read-aloud story page built from the most overdue words, then English-to-Finnish translation sentences with corrections."
---

# Luku story practice

Use this when the user asks for "another dozen", "a story from my due words", or translation practice with their Luku vocabulary. Each round has two steps:

1. **Story**: a short Finnish story built from the ~12 most overdue cards, published as a listening page (template below).
2. **Translation**: when the user asks, 6 English sentences using those words. The user translates them into Finnish, and you correct them.

Reply in the language the user writes in (usually English, sometimes Finnish).

## Step 0: pick the words

- The Luku tools are `list_words`, `get_word` (by `base`) and `update_word`, from the Luku MCP server (a client may show them with a prefix, such as `mcp__luku__list_words`). `list_words` returns pages of up to 50 with a `total`, so page with `offset` until you have them all.
- "Most overdue" means the lowest `next_review_at` that is earlier than now. The user reviews cards in the app between rounds, so don't trust earlier lists. If you already know likely candidates, confirm them with parallel `get_word` calls. Otherwise list all pages and sort.
- Take the 12 oldest still-due cards. Skip a card only if it truly can't fit a story, and say so.
- If a card's example or translation is wrong, misleading or truncated, point it out and offer to fix it with `update_word`. Only `translations`, `pos`, `example` and `example_translation` can be changed; the base form can't be renamed. Past fixes: *seka* (only used as *sekaan/seassa* or in compounds), *yhtälailla* (standard spelling *yhtä lailla*), *vaaliva* (a participle that takes an object: *perinteitä vaaliva yhdistys*).

## Step 1: the story

- Write the story freely; the user asked not to be bound to the cards' example sentences. Aim for 5–6 short paragraphs of natural, everyday Finnish with a small plot and a light ending. Some dialogue (with a leading `– `) is good.
- Use each target word once, inflected however the sentence needs. Double-check government and cases (e.g. *totella* + partitive, *suhtautua* + illative, *vaikutus johonkin*), consonant gradation, and adjective order.
- Give it a short Finnish title (a noun phrase such as *Uiva lehmä*, *Sienikeitto*).
- Build the page: write the template below to a new file in the scratchpad named after the title, fill in `{{TITLE}}` (twice), `{{DATE}}` (d.m.yyyy), `W` and `P`, then publish it with the Artifact tool (`icon: "book"`, one-sentence `description`). If this client has no Artifact tool, hand the user the HTML file instead. Don't redesign the page; it has been refined with the user (the slow-speed switch and the voice picker were their requests).
  - `W`: `"base": "short English gloss"`, plus a grammar hint in parentheses when useful.
  - `P`: an array of paragraphs, each an array of sentences. Mark each target word as `[inflected form|base]`; the base must match a key in `W`.
- In the reply, give one sentence on the premise, the 12 words, and 2–4 grammar patterns worth noticing (cases, idioms, partitive with mass nouns, and so on). Don't repeat the story text. End by offering translation sentences.

## Step 2: translation practice

- Write 6 everyday English sentences that use words from the current story. Don't copy story sentences, and vary the forms (past, negative, plural, passive, conditional).
- Add 2–4 hints about the traps without giving the answers: the case a verb takes, an idiom, gradation.
- To correct, open with one line saying what went well. Then, for each sentence:
  - Bold the corrected Finnish, or bold the original with ✓ if it's right.
  - Explain each fix briefly: the case and why, gradation, a look-alike word mix-up (e.g. *lakkauttaa*/*lakkautua*, *kelpuuttaa*/*kelvata*, *pudota*/*kaatua*, *syttyä*/*syyllistyä*), or register.
  - Mention natural alternatives when the user's version is grammatical but unidiomatic.
- End with the round's 1–2 main takeaways.
- If the user challenges a correction and they're right (e.g. the perfect tense for a time period that isn't over), say so plainly. If one of your hints was misleading, admit it.
- If the user asks to drill one word (e.g. *kelpuuttaa*), give 6 sentences labelled with the target form, and finish the corrections with a strong-grade/weak-grade table.

## Progress chart (when asked)

List all cards and bucket `next_review_at` by the user's local calendar day (Europe/Helsinki). Roll everything already overdue into today as a separate stacked segment. Show a stacked bar chart of the next 14 days, and in the reply comment on the change since last time.

## Listening page template

Narration uses the browser's built-in speech (`speechSynthesis`). Its quality depends on the voices installed on the device. In Edge, the *Noora/Harri Online (Natural)* voices sound best; on a Mac, download Satu (Enhanced or Premium). The page lists the Finnish voices with natural-sounding ones first, and remembers the choice per page.

```html
<title>{{TITLE}}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Instrument+Sans:wght@400;600&display=swap">
<style>
/* Layout: a single newspaper column — masthead, the story as tappable sentences, a sticky player bar, then the word list. */
:root{
  --bg:#eef1f3; --paper:#ffffff; --ink:#1b2430; --muted:#5d6a78; --rule:#d5dbe1;
  --accent:#1f5f8b; --accent-ink:#ffffff; --mark:#fbe7a1; --now:#d9ebf7;
  --serif:"Newsreader", Georgia, "Times New Roman", serif;
  --sans:"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --bg:#11161c; --paper:#182029; --ink:#e6ebf0; --muted:#97a4b2; --rule:#2b3642;
  --accent:#6fb2e0; --accent-ink:#0d141b; --mark:#5a4a12; --now:#1e3a52; color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#11161c; --paper:#182029; --ink:#e6ebf0; --muted:#97a4b2; --rule:#2b3642;
  --accent:#6fb2e0; --accent-ink:#0d141b; --mark:#5a4a12; --now:#1e3a52; color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:var(--sans);
  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:20px 120px}
.wrap{max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
.mast{border-bottom:3px double var(--rule);padding-bottom:12px;display:flex;flex-direction:column;gap:4px}
.kicker{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
h1{font-family:var(--serif);font-weight:600;font-size:clamp(30px,8vw,44px);line-height:1.05;margin:0;text-wrap:balance}
.story{background:var(--paper);border:1px solid var(--rule);border-radius:4px;padding:20px;
  font-family:var(--serif);font-size:20px;line-height:1.65;display:flex;flex-direction:column;gap:14px}
.story p{margin:0}
.s{cursor:pointer;border-radius:3px;transition:background .2s}
.s:hover{background:color-mix(in srgb,var(--now) 60%,transparent)}
.s.now{background:var(--now)}
.story b{font-weight:600;background:var(--mark);padding:0 2px;border-radius:2px;cursor:pointer}
.hint{font-size:13px;color:var(--muted);margin:0}
.player{position:sticky;bottom:0;margin-inline:calc(-1 * max(16px,env(safe-area-inset-left,0px)));
  padding:12px max(16px,env(safe-area-inset-right,0px)) calc(12px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));
  background:var(--bg);border-top:1px solid var(--rule);display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center}
button{font:600 15px var(--sans);border-radius:999px;border:1px solid var(--rule);background:var(--paper);color:var(--ink);padding:10px 18px;cursor:pointer}
button.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);min-width:130px}
.toggle{display:inline-flex;align-items:center;gap:10px;padding:8px 16px 8px 10px}
.toggle .track{position:relative;width:38px;height:22px;border-radius:999px;background:var(--rule);transition:background .2s;flex:none}
.toggle .knob{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--paper);box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .2s}
.toggle[aria-checked="true"]{border-color:var(--accent);color:var(--accent)}
.toggle[aria-checked="true"] .track{background:var(--accent)}
.toggle[aria-checked="true"] .knob{transform:translateX(16px)}
button:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.voice{display:inline-flex;align-items:center;gap:8px;font:600 15px var(--sans);color:var(--muted);min-width:0}
.voice select{font:600 15px var(--sans);color:var(--ink);background:var(--paper);border:1px solid var(--rule);border-radius:999px;padding:9px 14px;max-width:min(240px,60vw);text-overflow:ellipsis}
.gloss{font-size:15px;min-height:22px;text-align:center;width:100%;color:var(--muted)}
.gloss strong{color:var(--ink)}
.warn{font-size:14px;color:var(--ink);background:var(--mark);padding:10px 12px;border-radius:4px}
h2{font-family:var(--serif);font-size:22px;margin:0}
dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:15px}
dt{font-family:var(--serif);font-weight:600;font-size:17px}
dd{margin:0;color:var(--muted);min-width:0}
@media (prefers-reduced-motion:reduce){.s,.toggle .track,.toggle .knob{transition:none}}
</style>

<div class="wrap">
  <header class="mast">
    <span class="kicker">Luku · 12 sanaa · {{DATE}}</span>
    <h1>{{TITLE}}</h1>
  </header>
  <p class="hint">Tap a sentence to hear it. Tap a highlighted word to hear it alone and see what it means.</p>
  <div class="warn" id="warn" hidden>This device has no Finnish voice installed, so the reading may sound wrong. On iPhone: Settings → Accessibility → Spoken Content → Voices → Finnish. On Android: Settings → Text-to-speech → install Finnish.</div>
  <article class="story" id="story"></article>

  <section style="display:flex;flex-direction:column;gap:10px">
    <h2>Sanat</h2>
    <dl id="words"></dl>
  </section>

  <div class="player">
    <button class="primary" id="play" type="button">▶ Kuuntele</button>
    <button id="slow" class="toggle" type="button" role="switch" aria-checked="false"><span class="track" aria-hidden="true"><span class="knob"></span></span>Hitaasti</button>
    <label class="voice" id="voiceWrap" hidden>Ääni <select id="voice"></select></label>
    <div class="gloss" id="gloss" aria-live="polite"></div>
  </div>
</div>

<script>
// Glosses: "base": "English gloss (optional grammar hint)". One entry per target word.
const W={
  "karjapaimen":"cowherd",
  "tunnistaa":"to recognize (tunnistaa joksikin = identify as)"
};
// Each paragraph is a list of sentences; [form|base] marks a target word (base must be a key in W).
const P=[
 ["Aaro oli kylän [karjapaimen|karjapaimen].","Hän [tunnisti|tunnistaa] jokaisen lehmän nimeltä."],
 ["– Dialogue lines start with a dash, which is not read aloud."]
];
const story=document.getElementById('story'), gloss=document.getElementById('gloss');
const sents=[];
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
P.forEach(par=>{
  const p=document.createElement('p');
  par.forEach((txt,i)=>{
    const span=document.createElement('span'); span.className='s'; span.tabIndex=0;
    span.innerHTML=esc(txt).replace(/\[([^|\]]+)\|([^\]]+)\]/g,(m,f,b)=>`<b data-base="${b}">${f}</b>`);
    span.dataset.say=txt.replace(/\[([^|\]]+)\|[^\]]+\]/g,'$1').replace(/^–\s*/,'');
    span.dataset.i=sents.length; sents.push(span);
    p.appendChild(span); if(i<par.length-1)p.appendChild(document.createTextNode(' '));
  });
  story.appendChild(p);
});
const dl=document.getElementById('words');
Object.entries(W).forEach(([k,v])=>{dl.insertAdjacentHTML('beforeend',`<dt>${k}</dt><dd>${v}</dd>`)});

const synth=window.speechSynthesis; let voice=null, slow=false, playing=false, idx=0;
const sel=document.getElementById('voice');
// Natural/online/neural voices first, then premium and enhanced ones, then the rest.
function score(v){const n=v.name;return (/natural|neural|online/i.test(n)?8:0)+(/premium/i.test(n)?4:0)+(/enhanced|parannettu/i.test(n)?2:0)+(v.localService?0:1);}
function label(v){return v.name.replace(/^Microsoft\s+/,'').replace(/\s*-\s*Finnish.*$/i,'').trim();}
function pickVoice(){
  if(!synth)return;
  const vs=synth.getVoices(); if(!vs.length)return;
  const fi=vs.filter(v=>/^fi(-|_|$)/i.test(v.lang)).sort((a,b)=>score(b)-score(a));
  document.getElementById('warn').hidden=fi.length>0;
  document.getElementById('voiceWrap').hidden=fi.length===0;
  let saved=null; try{saved=localStorage.getItem('luku-voice');}catch(e){}
  const want=(voice&&voice.voiceURI)||saved;
  sel.innerHTML='';
  fi.forEach(v=>{const o=document.createElement('option');o.value=v.voiceURI;o.textContent=label(v);sel.appendChild(o);});
  voice=fi.find(v=>v.voiceURI===want)||fi[0]||null;
  if(voice)sel.value=voice.voiceURI;
}
sel.onchange=()=>{
  const v=synth&&synth.getVoices().find(x=>x.voiceURI===sel.value); if(!v)return;
  voice=v; try{localStorage.setItem('luku-voice',v.voiceURI);}catch(e){}
  stop(); utter('Hei! Tämä on uusi ääni.',()=>{});
};
if(synth){pickVoice(); synth.onvoiceschanged=pickVoice;} else {const w=document.getElementById('warn');w.textContent='This browser cannot read text aloud. Try opening the page in Safari or Chrome.';w.hidden=false;}
function utter(text,onend){
  const u=new SpeechSynthesisUtterance(text); u.lang='fi-FI'; if(voice)u.voice=voice;
  u.rate=slow?0.7:0.95; u.onend=onend; u.onerror=onend; synth.speak(u);
}
function mark(i){sents.forEach(s=>s.classList.toggle('now',+s.dataset.i===i));}
const playBtn=document.getElementById('play');
function stop(){playing=false; synth&&synth.cancel(); mark(-1); playBtn.textContent='▶ Kuuntele';}
function run(i){
  if(!playing||i>=sents.length){stop();idx=0;return;}
  idx=i; mark(i); sents[i].scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
  utter(sents[i].dataset.say,()=>{ if(playing) run(i+1); });
}
playBtn.onclick=()=>{ if(!synth)return; if(playing){stop();return;} synth.cancel(); playing=true; playBtn.textContent='■ Pysäytä'; run(idx); };
document.getElementById('slow').onclick=e=>{slow=!slow;e.currentTarget.setAttribute('aria-checked',slow);};
story.addEventListener('click',e=>{
  if(!synth)return;
  const b=e.target.closest('b'), s=e.target.closest('.s');
  if(b){ stop(); gloss.innerHTML=`<strong>${b.dataset.base}</strong> — ${W[b.dataset.base]}`; utter(b.textContent,()=>{}); return; }
  if(s){ synth.cancel(); playing=true; playBtn.textContent='■ Pysäytä'; run(+s.dataset.i); }
});
story.addEventListener('keydown',e=>{ if(e.key==='Enter'&&e.target.classList.contains('s')) e.target.click(); });
</script>
```