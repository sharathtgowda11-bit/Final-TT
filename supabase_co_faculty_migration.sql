-- ============================================================
-- Co-Faculty Support — faculty.has_doctorate + co_faculty_pools table
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add PhD flag to faculty
ALTER TABLE faculty ADD COLUMN IF NOT EXISTS has_doctorate BOOLEAN DEFAULT false;

-- Co-Faculty Pools: eligible co-faculty candidates per lab subject name
CREATE TABLE IF NOT EXISTS co_faculty_pools (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_name TEXT NOT NULL UNIQUE,
  faculty_ids  JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS and create permissive policy
ALTER TABLE co_faculty_pools ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'co_faculty_pools' AND policyname = 'Allow all operations on co_faculty_pools'
  ) THEN
    CREATE POLICY "Allow all operations on co_faculty_pools"
      ON co_faculty_pools FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;
