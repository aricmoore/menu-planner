-- Migration: Create view v_delivery_stops_from_menus
-- Source of truth for delivery stops derived from approved menus
-- One row per (week_id, date, client_id) for clients with at least one approved menu row

-- Drop existing view if it exists
DROP VIEW IF EXISTS public.v_delivery_stops_from_menus;

-- Create the view
CREATE VIEW public.v_delivery_stops_from_menus AS
WITH approved_menu_stops AS (
  -- One row per (week_id, date, client_id) for approved menus
  -- Uses client_id FK — not the client_name text field — so name changes or
  -- whitespace differences can never cause a stop to disappear from the route.
  SELECT DISTINCT
    m.week_id,
    m.date,
    m.client_id,
    m.client_name
  FROM public.menus m
  WHERE m.approved = true
    AND m.week_id IS NOT NULL
    AND m.date IS NOT NULL
    AND m.client_id IS NOT NULL
),

-- Primary contact address per client (is_primary first, then most recent)
client_primary_contact AS (
  SELECT DISTINCT ON (c.id)
    c.id AS client_id,
    c.name AS client_name,
    c.display_name,
    c.zone,
    c.delivery_day,
    c.pickup,
    ct.address AS contact_address,
    ct.id AS contact_id
  FROM public.clients c
  LEFT JOIN public.contacts ct ON ct.client_id = c.id
  ORDER BY
    c.id,
    ct.is_primary DESC NULLS LAST,
    ct.created_at DESC NULLS LAST
),

-- Fallback: any contact with a non-empty address
client_any_contact AS (
  SELECT DISTINCT ON (c.id)
    c.id AS client_id,
    ct.address AS fallback_address
  FROM public.clients c
  LEFT JOIN public.contacts ct ON ct.client_id = c.id AND ct.address IS NOT NULL AND ct.address != ''
  ORDER BY c.id, ct.created_at DESC NULLS LAST
)

SELECT
  ams.week_id,
  ams.date,
  ams.client_id,
  ams.client_name,
  COALESCE(cpc.display_name, ams.client_name) AS display_name,
  cpc.zone,
  cpc.delivery_day,
  COALESCE(cpc.pickup, false) AS pickup,
  COALESCE(
    NULLIF(cpc.contact_address, ''),
    cac.fallback_address
  ) AS address,
  cpc.contact_id
FROM approved_menu_stops ams
LEFT JOIN client_primary_contact cpc ON cpc.client_id = ams.client_id
LEFT JOIN client_any_contact cac ON cac.client_id = ams.client_id
ORDER BY ams.date, cpc.zone NULLS LAST, COALESCE(cpc.display_name, ams.client_name);

-- Add comment for documentation
COMMENT ON VIEW public.v_delivery_stops_from_menus IS
'Delivery stops derived from approved menus. One row per (week_id, date, client_id).
Address sourced from contacts table (primary contact preferred).
This is the single source of truth for delivery visibility.';

-- Grant access (driver view uses anon key to read delivery stops from approved menus)
GRANT SELECT ON public.v_delivery_stops_from_menus TO authenticated;
GRANT SELECT ON public.v_delivery_stops_from_menus TO anon;
