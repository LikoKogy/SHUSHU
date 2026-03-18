-- ─────────────────────────────────────────────────────────────────────────
-- GarmentCRM – Supabase Setup
-- Run this entire file in the Supabase SQL Editor once.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS crm_users (
  username text PRIMARY KEY,
  name     text NOT NULL,
  pass     text NOT NULL
);

ALTER TABLE crm_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON crm_users FOR ALL USING (true) WITH CHECK (true);


-- 2. PROFILES TABLE
CREATE TABLE IF NOT EXISTS crm_profiles (
  username  text PRIMARY KEY,
  email     text DEFAULT '',
  phone     text DEFAULT '',
  address   text DEFAULT '',
  info_note text DEFAULT ''
);

ALTER TABLE crm_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON crm_profiles FOR ALL USING (true) WITH CHECK (true);


-- 3. ORDERS TABLE  (each row stores the full order JSON)
CREATE TABLE IF NOT EXISTS crm_orders (
  id   integer PRIMARY KEY,
  data jsonb   NOT NULL
);

ALTER TABLE crm_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON crm_orders FOR ALL USING (true) WITH CHECK (true);


-- 4. STORAGE BUCKET FOR FILES
--    Run this in the Supabase dashboard → Storage → New Bucket
--    Name: crm-files, Public: OFF
--    Then add this policy in SQL Editor:

INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-files', 'crm-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public access on crm-files"
  ON storage.objects
  FOR ALL
  TO anon
  USING (bucket_id = 'crm-files')
  WITH CHECK (bucket_id = 'crm-files');
