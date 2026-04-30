# CLAUDE.md — Onboarding for Claude Code

## Project Overview

**Luku** is an AI-powered Finnish language learning app. Users photograph Finnish text, tap words for instant translations, and review vocabulary with flashcards.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19, plain JavaScript (no TypeScript)
- **Styling**: Inline CSS (no CSS framework)
- **AI**: Anthropic Claude API (claude-sonnet-4-6) via server-side proxy
- **No database** — all state lives in browser memory for the session

## Quick Start

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Available Commands

```bash
npm run dev    # Start dev server
npm run build  # Production build
npm start      # Start production server (run build first)
npm test       # Run test suite (Vitest)
```

## Project Structure

```
app/
├── page.jsx                    # Root orchestrator — composes hooks and stage components
├── layout.jsx                  # Root layout (metadata, lang="fi")
├── hooks/
│   ├── useApiKey.js            # Saved API key with localStorage sync
│   ├── useSession.js           # Per-scan translation session with localStorage sync
│   ├── useWords.js             # DB word list: fetch, save, update, remove/restore
│   ├── useReview.js            # Flashcard queue: grading, self-correction, reset
│   └── useImageProcessing.js  # File pick, crop UI, Tesseract OCR, AI rescan
├── components/
│   ├── ScanStage.jsx           # Stage 0 — image upload / crop UI
│   ├── ReadStage.jsx           # Stage 1 — tappable text + TranslationPopup
│   ├── ReviewStage.jsx         # Stage 2 — flashcard review
│   ├── TranslationPopup.jsx    # Absolutely-positioned word popup (inside ReadStage)
│   ├── WordList.jsx            # Full word-list overlay (all stages)
│   ├── ApiKeyScreen.jsx        # API key entry screen
│   ├── SignIn.jsx              # Auth screen
│   └── LukuLogo.jsx            # SVG logo
└── api/
    ├── claude/route.js         # Server proxy for Anthropic API
    ├── words/route.js          # CRUD for saved vocabulary
    └── reviews/route.js        # SRS grading endpoint
```

## Architecture

### Three-Stage Workflow

1. **Scan (stage 0)** — Upload or photograph a Finnish text image; optionally crop; OCR runs locally via Tesseract or via Claude Vision
2. **Read (stage 1)** — OCR-extracted text displayed as tappable tokens; tap any word to translate; add words to the review list
3. **Review (stage 2)** — SRS flashcard session for saved words

### State organisation

`page.jsx` is a thin orchestrator. All domain state lives in custom hooks:

| Hook | Owns |
|------|------|
| `useApiKey` | `savedKey` + localStorage persistence |
| `useSession` | Per-scan translation cache + localStorage persistence |
| `useWords` | `dbWords`, `loadingWords`, word CRUD |
| `useReview` | `queue`, `revIdx`, `showAnswer`, `grading`, SRS grading logic |
| `useImageProcessing` | `busy`, `step`, `err`, `preview`, `ocrProgress`, `ocrSource`, all crop state |

Cross-cutting actions that touch two hooks (`handleAddWord`, `handleDeleteWord`, `handleStartReview`, `handleScanAnother`, `onWord`) are composed in `page.jsx`.

### Key utility functions (`app/lib/`)

| Function | Purpose |
|----------|---------|
| `callClaude()` (`api.js`) | Generic wrapper for Claude API calls via `/api/claude` |
| `ocrImage()` (`api.js`) | Extracts text from image using Claude Vision |
| `translateWord()` (`api.js`) | Gets dictionary form, translations, and part of speech |
| `ocrLocal()` (`ocr.js`) | Tesseract.js OCR with progress callbacks |
| `fileToBase64()` (`image.js`) | Client-side image resize/compress (max 1024px, ≤400KB) |
| `getCroppedImg()` (`image.js`) | Crops a canvas region to base64 |
| `tokenize()` (`utils.js`) | Splits text into words, punctuation, spaces, and line breaks |
| `sentenceOf()` (`utils.js`) | Finds the sentence containing a given word for context |

### API Key Handling

- Users enter their Anthropic API key on first load
- Key is persisted to `localStorage` (not server-side)
- The server route (`route.js`) receives the key per-request and forwards it to Anthropic
- Optional: set `ANTHROPIC_API_KEY` env var for personal deployments

### Styling Conventions

- Dark theme with background `#0f1117`
- Primary color gradient: `#4a7c9e` → `#2d5a7a`
- Part-of-speech colors: verb=green, noun=warm, adjective=blue, adverb=purple
- All styles are inline objects (no CSS files or CSS-in-JS library)
- Two shared button style objects (`Bp` = primary, `Bg` = ghost) are imported from `app/lib/styles.js`

## Common Patterns

- No external state management (no Redux, Zustand, etc.)
- Claude API responses for translations are parsed as JSON with a regex fallback for markdown fences
- Optimistic UI updates for word add/delete with server-side rollback on failure
- `useReview` self-corrects the queue when a word is deleted externally (e.g. another tab)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | No | Optional server-side API key for personal deployments |

## Deployment

Designed for Vercel — connect the GitHub repo and deploy. No environment variables required for the default user-provides-key flow.
