# Luku — AI Finnish Reader

Photograph a Finnish text, tap any word to get its translation and dictionary form, build a review list, and do a flashcard session.

## Deploy to Vercel (5 minutes)

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → import your repo
3. Click Deploy — no environment variables needed

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## How it works

- Users enter their Anthropic API key on first load (kept in memory only, never stored)
- The key is sent to `/api/claude` — a Next.js server route that forwards requests to Anthropic
- The API key is **never exposed in the browser bundle**
- OCR and word translation both go through this server route

## Personal use (skip the key screen)

If you want to hardcode your own key so you don't have to enter it each time, set an environment variable in Vercel:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Then update `app/api/claude/route.js` to fall back to it:

```js
const key = apiKey || process.env.ANTHROPIC_API_KEY;
```

And update `app/page.js` to skip the key screen when no input is needed (e.g. auto-set savedKey on load).
