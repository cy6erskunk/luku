-- Luku vocabulary schema
-- Run this in the Neon SQL editor once after enabling Neon Auth.
-- Neon Auth automatically populates neon_auth.users_sync.

CREATE TABLE IF NOT EXISTS words (
  id             SERIAL PRIMARY KEY,
  user_id        TEXT NOT NULL,            -- from Neon Auth (Stack Auth user ID)
  word           TEXT NOT NULL,            -- inflected form as seen in text
  base           TEXT NOT NULL,            -- dictionary base form
  translations   TEXT[] NOT NULL,          -- English translations, primary first
  pos            TEXT NOT NULL DEFAULT 'other', -- noun/verb/adjective/adverb/other

  -- SRS fields (SM-2)
  ease_factor    FLOAT NOT NULL DEFAULT 2.5,
  interval_days  INT   NOT NULL DEFAULT 0,
  review_count   INT   NOT NULL DEFAULT 0,
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  added_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, base)
);

CREATE INDEX IF NOT EXISTS words_user_due ON words (user_id, next_review_at);
