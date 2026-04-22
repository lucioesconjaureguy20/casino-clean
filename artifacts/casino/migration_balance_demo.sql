-- Mander Originals – Streamer Balance Migration
-- Run this in your Supabase SQL editor

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS balance_demo float8 NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_streamer  boolean NOT NULL DEFAULT false;

-- Optional index for admin queries
CREATE INDEX IF NOT EXISTS profiles_is_streamer_idx ON profiles (is_streamer)
  WHERE is_streamer = true;
