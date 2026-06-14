-- Luku vocabulary schema
-- Run this in the Neon SQL editor once after enabling Neon Auth.
-- Neon Auth automatically populates neon_auth.users_sync.

CREATE TABLE IF NOT EXISTS words (
  id             SERIAL PRIMARY KEY,
  user_id        TEXT NOT NULL,            -- from Neon Auth (Stack Auth user ID)
  base           TEXT NOT NULL,            -- dictionary base form (the main memorization unit)
  translations   TEXT[] NOT NULL,          -- English translations of the base form, primary first
  pos            TEXT NOT NULL DEFAULT 'other', -- noun/verb/adjective/adverb/other
  forms          JSONB NOT NULL DEFAULT '[]', -- scanned inflections: [{"word": "...", "translation": "..."}]

  -- SRS fields (SM-2)
  ease_factor    FLOAT NOT NULL DEFAULT 2.5,
  interval_days  INT   NOT NULL DEFAULT 0,
  review_count   INT   NOT NULL DEFAULT 0,
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  added_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, base)
);

CREATE INDEX IF NOT EXISTS words_user_due ON words (user_id, next_review_at);

-- Migration for deployments created before the forms column existed.
-- Seeds forms from the previously saved inflection; its old translations
-- were contextual, so the first one doubles as the form translation.
-- Wrapped in an existence check so fresh installs (which never had a word
-- column) don't trip on the UPDATE referencing it.
ALTER TABLE words ADD COLUMN IF NOT EXISTS forms JSONB NOT NULL DEFAULT '[]';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'words' AND column_name = 'word'
  ) THEN
    UPDATE words
      SET forms = jsonb_build_array(jsonb_build_object('word', word, 'translation', translations[1]))
      WHERE forms = '[]'::jsonb AND lower(word) <> lower(base);
  END IF;
END $$;

-- The word column is now redundant: every inflection lives in forms.
ALTER TABLE words DROP COLUMN IF EXISTS word;
