-- ============================================================
-- Frozen Slots Table — Ensure all columns exist
-- Run this in Supabase SQL Editor
-- ============================================================

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS frozen_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day TEXT NOT NULL,
  period TEXT NOT NULL,
  faculty_id UUID REFERENCES faculty(id) ON DELETE SET NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  semester INTEGER,
  description TEXT DEFAULT ''
);

-- Add any missing columns if table already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'frozen_slots' AND column_name = 'room_id'
  ) THEN
    ALTER TABLE frozen_slots ADD COLUMN room_id UUID REFERENCES rooms(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'frozen_slots' AND column_name = 'subject_id'
  ) THEN
    ALTER TABLE frozen_slots ADD COLUMN subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'frozen_slots' AND column_name = 'semester'
  ) THEN
    ALTER TABLE frozen_slots ADD COLUMN semester INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'frozen_slots' AND column_name = 'section_id'
  ) THEN
    ALTER TABLE frozen_slots ADD COLUMN section_id UUID REFERENCES sections(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enable RLS and create permissive policy
ALTER TABLE frozen_slots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'frozen_slots' AND policyname = 'Allow all operations on frozen_slots'
  ) THEN
    CREATE POLICY "Allow all operations on frozen_slots"
      ON frozen_slots FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;
