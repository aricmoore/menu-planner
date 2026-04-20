-- Goldfinch Chef Menu Planner - Supabase Schema
-- Run this SQL in your Supabase SQL Editor (https://supabase.com/dashboard)
-- This schema is idempotent - safe to run multiple times

-- ============================================================
-- CORE TABLES
-- ============================================================

-- 1. clients (subscriptions)
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  persons INTEGER DEFAULT 2,
  portions INTEGER DEFAULT 4,
  address TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  meals_per_week INTEGER DEFAULT 3,
  frequency TEXT DEFAULT 'weekly',
  status TEXT DEFAULT 'active',
  paused_date DATE,
  honeybook_link TEXT,
  billing_notes TEXT,
  delivery_day TEXT,
  zone TEXT,
  pickup BOOLEAN DEFAULT false,
  chef_choice BOOLEAN DEFAULT true,
  dietary_restrictions TEXT,
  plan_price DECIMAL(10,2),
  service_fee DECIMAL(10,2),
  prepay_discount BOOLEAN DEFAULT false,
  new_client_fee_paid BOOLEAN DEFAULT false,
  pays_own_groceries BOOLEAN DEFAULT false,
  access_code TEXT,
  delivery_dates JSONB DEFAULT '[]',
  bill_due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. contacts (multiple per client)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  full_name TEXT,
  display_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. drivers
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  phone TEXT,
  zone TEXT,
  access_code TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- RECIPE & INGREDIENT TABLES
-- ============================================================

-- 4. recipes
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- protein, veg, starch, sauces, breakfast, soups
  instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, category)
);

-- 5. ingredients (master list)
CREATE TABLE IF NOT EXISTS ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  cost DECIMAL(10,2),
  unit TEXT,
  source TEXT,
  section TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. recipe_ingredients (join table)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  ingredient_name TEXT NOT NULL, -- denormalized for flexibility
  quantity DECIMAL(10,3),
  unit TEXT,
  cost DECIMAL(10,2),
  source TEXT,
  section TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- MENU & WEEK TABLES
-- ============================================================

-- 7. weeks
CREATE TABLE IF NOT EXISTS weeks (
  id TEXT PRIMARY KEY, -- format: 2026-W04
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'draft', -- draft, locked
  snapshot JSONB,
  kds_status JSONB DEFAULT '{}',
  ready_for_delivery JSONB DEFAULT '[]',
  delivery_log JSONB DEFAULT '[]',
  grocery_bills JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  locked_at TIMESTAMPTZ,
  unlocked_at TIMESTAMPTZ
);

-- 8. menus (menu items assigned to clients)
CREATE TABLE IF NOT EXISTS menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  week_id TEXT REFERENCES weeks(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  protein TEXT,
  veg TEXT,
  starch TEXT,
  extras JSONB DEFAULT '[]',
  portions INTEGER,
  meal_index INTEGER NOT NULL DEFAULT 1, -- supports multiple meals per client per date
  approved BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'unconfirmed', -- unconfirmed, confirmed, skipped
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, date, meal_index)  -- matches onConflict in application code
);

-- 9. client_dish_picks (for non-Chef Choice clients)
CREATE TABLE IF NOT EXISTS client_dish_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  week_id TEXT REFERENCES weeks(id) ON DELETE CASCADE,
  date DATE,
  category TEXT NOT NULL, -- protein, veg, starch, extras
  recipe_name TEXT NOT NULL,
  portions INTEGER DEFAULT 1,
  notes TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- WEEKLY TASKS
-- ============================================================

-- 10. weekly_tasks (task completion state per client per week)
CREATE TABLE IF NOT EXISTS weekly_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id TEXT REFERENCES weeks(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  task_type TEXT NOT NULL, -- plan_menu, approve_menu, shop, cook, deliver, etc.
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, skipped
  due_date DATE,
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(week_id, client_id, task_type)
);

-- ============================================================
-- SHOPPING LISTS
-- ============================================================

-- 11. shopping_lists (with day assignments)
CREATE TABLE IF NOT EXISTS shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id TEXT REFERENCES weeks(id) ON DELETE CASCADE,
  shop_day TEXT NOT NULL, -- Sunday, Tuesday, Thursday
  ingredient_name TEXT NOT NULL,
  quantity DECIMAL(10,3),
  unit TEXT,
  section TEXT,
  source TEXT,
  cost DECIMAL(10,2),
  recipes JSONB DEFAULT '[]', -- array of recipe names using this ingredient
  purchased BOOLEAN DEFAULT false,
  purchased_at TIMESTAMPTZ,
  actual_cost DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(week_id, shop_day, ingredient_name, unit)
);

-- ============================================================
-- DELIVERY MANAGEMENT
-- ============================================================

-- 12. delivery_runs (a driver's route for a day)
CREATE TABLE IF NOT EXISTS delivery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id TEXT REFERENCES weeks(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  driver_name TEXT,
  date DATE NOT NULL,
  zone TEXT,
  status TEXT DEFAULT 'planned', -- planned, in_progress, completed, cancelled
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_stops INTEGER DEFAULT 0,
  completed_stops INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 13. delivery_stops (individual stops within a run)
CREATE TABLE IF NOT EXISTS delivery_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES delivery_runs(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  address TEXT,
  zone TEXT,
  sort_order INTEGER DEFAULT 0, -- for drag reorder
  time_window_start TIME,
  time_window_end TIME,
  estimated_arrival TIMESTAMPTZ,
  status TEXT DEFAULT 'pending', -- pending, en_route, arrived, completed, failed, skipped
  -- Status timestamps
  departed_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Delivery details
  handoff_type TEXT, -- handed_off, porch_drop, etc.
  recipient_name TEXT,
  dishes JSONB DEFAULT '[]',
  portions INTEGER,
  cost DECIMAL(10,2),
  -- Problem tracking
  problem_type TEXT, -- not_home, wrong_address, refused, etc.
  problem_notes TEXT,
  problem_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 14. delivery_photos (porch drop photos)
CREATE TABLE IF NOT EXISTS delivery_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id UUID REFERENCES delivery_stops(id) ON DELETE CASCADE,
  run_id UUID REFERENCES delivery_runs(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT,
  date DATE NOT NULL,
  photo_url TEXT, -- Supabase Storage URL
  photo_path TEXT, -- Storage bucket path
  photo_data TEXT, -- Base64 fallback for legacy data
  thumbnail_url TEXT,
  taken_at TIMESTAMPTZ DEFAULT now(),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- BILLING
-- ============================================================

-- 15. billing_cycles (tracks cycle start date, due date, payment status)
CREATE TABLE IF NOT EXISTS billing_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT,
  cycle_number INTEGER,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  due_date DATE,
  -- Amounts
  plan_amount DECIMAL(10,2),
  service_fee DECIMAL(10,2),
  grocery_cost DECIMAL(10,2),
  adjustments DECIMAL(10,2) DEFAULT 0,
  total_due DECIMAL(10,2),
  -- Payment tracking
  paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  payment_reference TEXT,
  -- Status
  status TEXT DEFAULT 'pending', -- pending, invoiced, paid, overdue, cancelled
  invoiced_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, cycle_number)
);

-- ============================================================
-- CLIENT PORTAL
-- ============================================================

-- 16. client_portal_data
CREATE TABLE IF NOT EXISTS client_portal_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL UNIQUE,
  selected_dates JSONB DEFAULT '[]',
  ingredient_picks JSONB DEFAULT '{}',
  notes TEXT,
  last_visited TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- APP SETTINGS
-- ============================================================

-- 17. app_settings (key-value store for app configuration)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- LEGACY SUPPORT: deliveries table (for migration)
-- ============================================================

-- 18. deliveries (legacy - kept for backward compatibility)
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  week_id TEXT REFERENCES weeks(id),
  date DATE NOT NULL,
  dishes JSONB,
  portions INTEGER,
  cost DECIMAL(10,2),
  completed_at TIMESTAMPTZ,
  handoff_type TEXT,
  photo_data TEXT,
  driver TEXT,
  zone TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Core tables
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_delivery_day ON clients(delivery_day);
CREATE INDEX IF NOT EXISTS idx_clients_zone ON clients(zone);
CREATE INDEX IF NOT EXISTS idx_contacts_client_id ON contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_drivers_zone ON drivers(zone);

-- Recipes
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);

-- Menus
CREATE INDEX IF NOT EXISTS idx_menus_client_id ON menus(client_id);
CREATE INDEX IF NOT EXISTS idx_menus_week_id ON menus(week_id);
CREATE INDEX IF NOT EXISTS idx_menus_date ON menus(date);
CREATE INDEX IF NOT EXISTS idx_menus_status ON menus(status);
CREATE INDEX IF NOT EXISTS idx_client_dish_picks_client_id ON client_dish_picks(client_id);
CREATE INDEX IF NOT EXISTS idx_client_dish_picks_week_id ON client_dish_picks(week_id);

-- Weekly tasks
CREATE INDEX IF NOT EXISTS idx_weekly_tasks_week_id ON weekly_tasks(week_id);
CREATE INDEX IF NOT EXISTS idx_weekly_tasks_client_id ON weekly_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_weekly_tasks_status ON weekly_tasks(status);

-- Shopping
CREATE INDEX IF NOT EXISTS idx_shopping_lists_week_id ON shopping_lists(week_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_shop_day ON shopping_lists(shop_day);

-- Deliveries
CREATE INDEX IF NOT EXISTS idx_delivery_runs_week_id ON delivery_runs(week_id);
CREATE INDEX IF NOT EXISTS idx_delivery_runs_driver_id ON delivery_runs(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_runs_date ON delivery_runs(date);
CREATE INDEX IF NOT EXISTS idx_delivery_runs_status ON delivery_runs(status);
CREATE INDEX IF NOT EXISTS idx_delivery_stops_run_id ON delivery_stops(run_id);
CREATE INDEX IF NOT EXISTS idx_delivery_stops_client_id ON delivery_stops(client_id);
CREATE INDEX IF NOT EXISTS idx_delivery_stops_status ON delivery_stops(status);
CREATE INDEX IF NOT EXISTS idx_delivery_photos_stop_id ON delivery_photos(stop_id);
CREATE INDEX IF NOT EXISTS idx_delivery_photos_client_id ON delivery_photos(client_id);
CREATE INDEX IF NOT EXISTS idx_delivery_photos_date ON delivery_photos(date);
CREATE INDEX IF NOT EXISTS idx_deliveries_week_id ON deliveries(week_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_date ON deliveries(date);

-- Billing
CREATE INDEX IF NOT EXISTS idx_billing_cycles_client_id ON billing_cycles(client_id);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_status ON billing_cycles(status);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_due_date ON billing_cycles(due_date);

-- Portal
CREATE INDEX IF NOT EXISTS idx_client_portal_data_client_id ON client_portal_data(client_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Enable RLS on all tables - policies can be refined for multi-user support

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_dish_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES (permissive for now - single-user mode)
-- ============================================================
-- These can be refined later for multi-user support by scoping to client_id or driver_id

-- Drop existing policies first (for idempotency)
DO $$
BEGIN
  -- Clients
  DROP POLICY IF EXISTS "Allow all for anon" ON clients;
  DROP POLICY IF EXISTS "anon_clients_all" ON clients;
  -- Contacts
  DROP POLICY IF EXISTS "Allow all for anon" ON contacts;
  DROP POLICY IF EXISTS "anon_contacts_all" ON contacts;
  -- Drivers
  DROP POLICY IF EXISTS "Allow all for anon" ON drivers;
  DROP POLICY IF EXISTS "anon_drivers_all" ON drivers;
  -- Recipes
  DROP POLICY IF EXISTS "Allow all for anon" ON recipes;
  DROP POLICY IF EXISTS "anon_recipes_all" ON recipes;
  -- Ingredients
  DROP POLICY IF EXISTS "Allow all for anon" ON ingredients;
  DROP POLICY IF EXISTS "anon_ingredients_all" ON ingredients;
  -- Recipe ingredients
  DROP POLICY IF EXISTS "Allow all for anon" ON recipe_ingredients;
  DROP POLICY IF EXISTS "anon_recipe_ingredients_all" ON recipe_ingredients;
  -- Weeks
  DROP POLICY IF EXISTS "Allow all for anon" ON weeks;
  DROP POLICY IF EXISTS "anon_weeks_all" ON weeks;
  -- Menus
  DROP POLICY IF EXISTS "Allow all for anon" ON menus;
  DROP POLICY IF EXISTS "anon_menus_all" ON menus;
  -- Client dish picks
  DROP POLICY IF EXISTS "anon_client_dish_picks_all" ON client_dish_picks;
  -- Weekly tasks
  DROP POLICY IF EXISTS "anon_weekly_tasks_all" ON weekly_tasks;
  -- Shopping lists
  DROP POLICY IF EXISTS "anon_shopping_lists_all" ON shopping_lists;
  -- Delivery runs
  DROP POLICY IF EXISTS "anon_delivery_runs_all" ON delivery_runs;
  -- Delivery stops
  DROP POLICY IF EXISTS "anon_delivery_stops_all" ON delivery_stops;
  -- Delivery photos
  DROP POLICY IF EXISTS "anon_delivery_photos_all" ON delivery_photos;
  -- Billing cycles
  DROP POLICY IF EXISTS "Allow all for anon" ON billing_cycles;
  DROP POLICY IF EXISTS "anon_billing_cycles_all" ON billing_cycles;
  -- Client portal data
  DROP POLICY IF EXISTS "Allow all for anon" ON client_portal_data;
  DROP POLICY IF EXISTS "anon_client_portal_data_all" ON client_portal_data;
  -- App settings
  DROP POLICY IF EXISTS "Allow all for anon" ON app_settings;
  DROP POLICY IF EXISTS "anon_app_settings_all" ON app_settings;
  -- Deliveries (legacy)
  DROP POLICY IF EXISTS "Allow all for anon" ON deliveries;
  DROP POLICY IF EXISTS "anon_deliveries_all" ON deliveries;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Create new policies with consistent naming
CREATE POLICY "anon_clients_all" ON clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_contacts_all" ON contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_drivers_all" ON drivers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_recipes_all" ON recipes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_ingredients_all" ON ingredients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_recipe_ingredients_all" ON recipe_ingredients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_weeks_all" ON weeks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_menus_all" ON menus FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_client_dish_picks_all" ON client_dish_picks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_weekly_tasks_all" ON weekly_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_shopping_lists_all" ON shopping_lists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_delivery_runs_all" ON delivery_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_delivery_stops_all" ON delivery_stops FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_delivery_photos_all" ON delivery_photos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_billing_cycles_all" ON billing_cycles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_client_portal_data_all" ON client_portal_data FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_app_settings_all" ON app_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_deliveries_all" ON deliveries FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- TRIGGERS FOR updated_at
-- ============================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing triggers (for idempotency)
DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
DROP TRIGGER IF EXISTS update_drivers_updated_at ON drivers;
DROP TRIGGER IF EXISTS update_recipes_updated_at ON recipes;
DROP TRIGGER IF EXISTS update_ingredients_updated_at ON ingredients;
DROP TRIGGER IF EXISTS update_weeks_updated_at ON weeks;
DROP TRIGGER IF EXISTS update_menus_updated_at ON menus;
DROP TRIGGER IF EXISTS update_weekly_tasks_updated_at ON weekly_tasks;
DROP TRIGGER IF EXISTS update_shopping_lists_updated_at ON shopping_lists;
DROP TRIGGER IF EXISTS update_delivery_runs_updated_at ON delivery_runs;
DROP TRIGGER IF EXISTS update_delivery_stops_updated_at ON delivery_stops;
DROP TRIGGER IF EXISTS update_billing_cycles_updated_at ON billing_cycles;
DROP TRIGGER IF EXISTS update_client_portal_data_updated_at ON client_portal_data;
DROP TRIGGER IF EXISTS update_app_settings_updated_at ON app_settings;

-- Create triggers
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON drivers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON recipes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ingredients_updated_at BEFORE UPDATE ON ingredients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_weeks_updated_at BEFORE UPDATE ON weeks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_menus_updated_at BEFORE UPDATE ON menus FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_weekly_tasks_updated_at BEFORE UPDATE ON weekly_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shopping_lists_updated_at BEFORE UPDATE ON shopping_lists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_delivery_runs_updated_at BEFORE UPDATE ON delivery_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_delivery_stops_updated_at BEFORE UPDATE ON delivery_stops FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_billing_cycles_updated_at BEFORE UPDATE ON billing_cycles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_client_portal_data_updated_at BEFORE UPDATE ON client_portal_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_app_settings_updated_at BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- COMMENTS FOR FUTURE RLS REFINEMENT
-- ============================================================
-- When adding multi-user support, replace the anon_*_all policies with:
--
-- For client-scoped tables (contacts, menus, billing_cycles, etc.):
--   CREATE POLICY "client_scope" ON table_name
--     FOR ALL
--     USING (client_id = auth.uid() OR auth.role() = 'admin')
--     WITH CHECK (client_id = auth.uid() OR auth.role() = 'admin');
--
-- For driver-scoped tables (delivery_runs, delivery_stops):
--   CREATE POLICY "driver_scope" ON delivery_runs
--     FOR ALL
--     USING (driver_id = auth.uid() OR auth.role() = 'admin')
--     WITH CHECK (driver_id = auth.uid() OR auth.role() = 'admin');
