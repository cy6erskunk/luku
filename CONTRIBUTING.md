# Contributing to Luku

## Getting Started

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm run dev` to start the development server at http://localhost:3000
4. You'll need an [Anthropic API key](https://console.anthropic.com) to use the app

## Development Notes

### Single-File Architecture

The entire app lives in `app/page.js` as a single React component. This is intentional for simplicity — the app is small enough that component splitting would add indirection without much benefit.

### Making Changes

- **UI changes**: Edit `app/page.js`. Styles are inline objects — look for the `Bp` (primary button), `Bg` (ghost button), and `D` (dark background) constants.
- **API behavior**: Edit `app/api/claude/route.js` for server-side changes, or the `callClaude`/`ocrImage`/`translateWord` functions in `page.js` for client-side logic.
- **Adding a new stage**: Add a new stage number, update the header nav stepper, and add a conditional render block (`{stage === N && (...)}`).

### API Key Security

- Never persist API keys to disk, localStorage, or cookies
- Never log API keys server-side
- The key must only travel: user input → React state → fetch body → server route → Anthropic API

### Code Style

- Plain JavaScript (no TypeScript)
- Inline styles (no CSS files)
- Functional React with hooks
- No semicolons are sometimes omitted in chained statements — match existing style
- Keep the single-file structure unless the component exceeds ~500 lines

### Before Submitting

```bash
npm run build   # Ensure production build succeeds
```

There are no tests yet. If you add a testing framework, update `package.json` scripts and `CLAUDE.md`.
