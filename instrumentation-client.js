// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { defaultTracesSampleRate, sampleRate } from "./lib/shared/sampleRate.js";

Sentry.init({
  dsn: "https://c44fe9380348efb91442e630909b58b3@o4505843752763392.ingest.us.sentry.io/4511608689000448",

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Browser tracing is billed per transaction like the server's. The value is
  // inlined at build time, so NEXT_PUBLIC_ is required for it to reach here.
  tracesSampleRate: sampleRate(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, defaultTracesSampleRate(process.env.NODE_ENV)),

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // User identity and headers are collected by default. Bodies are not: the
  // browser has no redactor, and /api/claude's request body carries the
  // reader's own API key and the scanned image.
  // https://docs.sentry.io/platforms/javascript/configuration/options/#dataCollection
  dataCollection: { httpBodies: [] },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
