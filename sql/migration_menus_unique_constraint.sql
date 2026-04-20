-- Migration: Fix menus unique constraint to match application code
-- The application uses onConflict: 'client_id,date,meal_index' for upserts.
-- This migration replaces the client_name-based constraint with a client_id-based one.
-- Run this in your Supabase SQL Editor.

-- ============================================================
-- STEP 1: Drop old constraints
-- ============================================================

-- Drop the original (client_name, date) constraint from schema.sql
ALTER TABLE menus DROP CONSTRAINT IF EXISTS menus_client_name_date_key;

-- Drop the intermediate (client_name, date, meal_index) constraint from migration_week_id_fix.sql
ALTER TABLE menus DROP CONSTRAINT IF EXISTS menus_client_name_date_meal_index_key;

-- ============================================================
-- STEP 2: Add correct constraint matching application code
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'menus_client_id_date_meal_index_key'
  ) THEN
    ALTER TABLE menus
    ADD CONSTRAINT menus_client_id_date_meal_index_key
    UNIQUE (client_id, date, meal_index);
  END IF;
END $$;

-- ============================================================
-- STEP 3: Ensure meal_index column exists with default
-- ============================================================

ALTER TABLE menus ADD COLUMN IF NOT EXISTS meal_index INTEGER NOT NULL DEFAULT 1;
ALTER TABLE menus ALTER COLUMN meal_index SET DEFAULT 1;

-- ============================================================
-- STEP 4: Verify
-- ============================================================

DO $$
DECLARE
  has_constraint BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menus_client_id_date_meal_index_key'
  ) INTO has_constraint;

  IF has_constraint THEN
    RAISE NOTICE 'Migration complete: menus UNIQUE(client_id, date, meal_index) constraint is in place.';
  ELSE
    RAISE EXCEPTION 'Migration FAILED: constraint was not created.';
  END IF;
END $$;
