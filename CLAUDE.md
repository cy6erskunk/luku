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
```

There is no test suite configured.

## Project Structure

```
app/
├── page.js              # Main SPA component (all UI logic)
├── layout.js            # Root layout (metadata, lang="fi")
└── api/claude/route.js  # Server proxy for Anthropic API
```

- `page.js` is a single `"use client"` component containing the entire app
- `route.js` is the only server-side code — it proxies requests to `https://api.anthropic.com/v1/messages`

## Architecture

### Three-Stage Workflow

1. **Scan (stage 0)** — Upload or photograph a Finnish text image
2. **Read (stage 1)** — OCR-extracted text displayed; tap any word for translation
3. **Review (stage 2)** — Flashcard session for words added during reading

### Key Functions in `app/page.js`

| Function | Purpose |
|----------|---------|
| `callClaude()` | Generic wrapper for Claude API calls via `/api/claude` |
| `ocrImage()` | Extracts text from image using Claude Vision |
| `translateWord()` | Gets dictionary form, translations, and part of speech |
| `fileToBase64()` | Client-side image resize/compress (max 1024px, ≤400KB) |
| `tokenize()` | Splits text into words, punctuation, spaces, and line breaks |
| `sentenceOf()` | Finds the sentence containing a given word for context |

### API Key Handling

- Users enter their Anthropic API key on first load
- Key is kept in React state only (memory) — never persisted or sent to any server except Anthropic
- The server route (`route.js`) receives the key per-request and forwards it to Anthropic
- Optional: set `ANTHROPIC_API_KEY` env var for personal deployments

### Styling Conventions

- Dark theme with background `#0f1117`
- Primary color gradient: `#4a7c9e` → `#2d5a7a`
- Part-of-speech colors: verb=green, noun=warm, adjective=blue, adverb=purple
- All styles are inline objects (no CSS files or CSS-in-JS library)

## Common Patterns

- State is managed with 18 `useState` hooks in the root component
- No external state management (no Redux, Zustand, etc.)
- No component decomposition — everything lives in `app/page.js`
- Claude API responses for translations are parsed as JSON with a regex fallback for markdown fences

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | No | Optional server-side API key for personal deployments |

## Deployment

Designed for Vercel — connect the GitHub repo and deploy. No environment variables required for the default user-provides-key flow.
