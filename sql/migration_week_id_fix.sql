-- Migration: Fix week identity model and menu.week_id population
-- Safe to run multiple times (idempotent)

-- ============================================================
-- STEP 1: Ensure menus uniqueness constraint is consistent
-- ============================================================

-- Drop legacy constraint if it exists
ALTER TABLE menus
DROP CONSTRAINT IF EXISTS menus_client_name_date_meal_index_key;

-- Ensure correct constraint exists (client_id based is preferred)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'menus_client_id_date_meal_index_key'
  ) THEN
    ALTER TABLE menus
    ADD CONSTRAINT menus_client_id_date_meal_index_key
    UNIQUE (client_id, date, meal_index);
  END IF;
END $$;

-- Ensure meal_index default
ALTER TABLE menus
ALTER COLUMN meal_index SET DEFAULT 1;

-- ============================================================
-- STEP 2: Helper function (week_id from date)
-- ============================================================

CREATE OR REPLACE FUNCTION get_week_id(date_val DATE)
RETURNS TEXT AS $$
DECLARE
  year_val INT;
  week_num INT;
  thursday DATE;
  jan4 DATE;
BEGIN
  -- ISO week logic (Thursday-based year)
  thursday := date_val + (3 - EXTRACT(DOW FROM date_val + 1)::INT);
  year_val := EXTRACT(YEAR FROM thursday);

  jan4 := (year_val::TEXT || '-01-04')::DATE;

  week_num := 1 + (
    (
      thursday - jan4 +
      (EXTRACT(DOW FROM jan4 + 1)::INT - 1)
    ) / 7
  )::INT;

  RETURN year_val::TEXT || '-W' || LPAD(week_num::TEXT, 2, '0');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- STEP 3: Ensure weeks exist for all menu dates
-- ============================================================

INSERT INTO weeks (id, start_date, end_date, status)
SELECT DISTINCT
  get_week_id(date) AS id,
  (date - EXTRACT(DOW FROM date)::INT + 1)::DATE AS start_date,
  (date - EXTRACT(DOW FROM date)::INT + 7)::DATE AS end_date,
  'draft' AS status
FROM menus
WHERE date IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STEP 4: Backfill menus.week_id safely
-- ============================================================

UPDATE menus
SET week_id = get_week_id(date)
WHERE date IS NOT NULL
  AND (week_id IS NULL OR week_id <> get_week_id(date));

-- ============================================================
-- STEP 5: Trigger for auto week_id assignment
-- ============================================================

CREATE OR REPLACE FUNCTION set_menu_week_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.week_id IS NULL AND NEW.date IS NOT NULL THEN
    NEW.week_id := get_week_id(NEW.date);

    INSERT INTO weeks (id, start_date, end_date, status)
    VALUES (
      NEW.week_id,
      (NEW.date - EXTRACT(DOW FROM NEW.date)::INT + 1)::DATE,
      (NEW.date - EXTRACT(DOW FROM NEW.date)::INT + 7)::DATE,
      'draft'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_menu_week_id_trigger ON menus;

CREATE TRIGGER set_menu_week_id_trigger
BEFORE INSERT OR UPDATE ON menus
FOR EACH ROW
EXECUTE FUNCTION set_menu_week_id();

-- ============================================================
-- STEP 6: Verification (safe summary)
-- ============================================================

DO $$
DECLARE
  total INT;
  with_week INT;
BEGIN
  SELECT COUNT(*) INTO total FROM menus;
  SELECT COUNT(*) INTO with_week FROM menus WHERE week_id IS NOT NULL;

  RAISE NOTICE 'Menus: % total, % with week_id', total, with_week;
END $$;