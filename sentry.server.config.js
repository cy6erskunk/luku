// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { redactDeep } from "./lib/redact.js";
import { defaultTracesSampleRate, sampleRate } from "./lib/shared/sampleRate.js";

Sentry.init({
  dsn: "https://c44fe9380348efb91442e630909b58b3@o4505843752763392.ingest.us.sentry.io/4511608689000448",

  // Sampled rather than traced end to end in production, where a rate of 1
  // means every request carries a transaction. Override with
  // SENTRY_TRACES_SAMPLE_RATE (0–1) when investigating something.
  tracesSampleRate: sampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, defaultTracesSampleRate(process.env.NODE_ENV)),

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Sends request headers, cookies and user identity with every event, which
  // is what makes an error report actionable here. redactDeep below is what
  // keeps that tolerable: it strips the credentials that ride along.
  sendDefaultPii: true,

  // The Telegram Bot API carries its token in the URL path, so fetch spans and
  // transport errors would otherwise send the bot's master credential to Sentry.
  beforeSend: (event) => redactDeep(event),
  beforeSendTransaction: (event) => redactDeep(event),
});
