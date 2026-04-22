-- KDS Dish Status Table
-- Tracks completion status for each dish total per week
-- Run this in Supabase SQL editor

-- Create the table
CREATE TABLE IF NOT EXISTS kds_dish_status (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  week_id text NOT NULL,
  recipe_name text NOT NULL,
  recipe_type text,
  done boolean DEFAULT false,
  done_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create unique constraint on (week_id, recipe_name)
CREATE UNIQUE INDEX IF NOT EXISTS kds_dish_status_week_recipe_idx
  ON kds_dish_status (week_id, recipe_name);

-- Create index for efficient week lookups
CREATE INDEX IF NOT EXISTS kds_dish_status_week_id_idx
  ON kds_dish_status (week_id);

-- Enable RLS
ALTER TABLE kds_dish_status ENABLE ROW LEVEL SECURITY;

-- Drop old policies (idempotent)
DROP POLICY IF EXISTS "Allow all operations on kds_dish_status" ON kds_dish_status;
DROP POLICY IF EXISTS "auth_kds_dish_status_all" ON kds_dish_status;

-- Authenticated only: KDS is an admin-only feature
CREATE POLICY "auth_kds_dish_status_all" ON kds_dish_status
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_kds_dish_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kds_dish_status_updated_at ON kds_dish_status;
CREATE TRIGGER kds_dish_status_updated_at
  BEFORE UPDATE ON kds_dish_status
  FOR EACH ROW
  EXECUTE FUNCTION update_kds_dish_status_updated_at();
