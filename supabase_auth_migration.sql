-- ============================================================
-- Require Authentication — tighten RLS from "allow anyone" to
-- "must be logged in" (still no per-user distinction; the app
-- uses one shared login for the whole department).
-- Run this in Supabase SQL Editor.
-- ============================================================

DO $$
DECLARE
  tbl TEXT;
  old_pol TEXT;
  new_pol TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'faculty', 'sections', 'rooms', 'subjects',
    'elective_groups', 'lab_groups', 'co_faculty_pools', 'frozen_slots', 'app_state',
    'timetables', 'section_classrooms'
  ] LOOP
    old_pol := 'Allow all operations on ' || tbl;
    new_pol := 'Allow authenticated operations on ' || tbl;

    IF EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = tbl AND policyname = old_pol
    ) THEN
      EXECUTE format('DROP POLICY %I ON %I', old_pol, tbl);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = tbl AND policyname = new_pol
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')',
        new_pol, tbl
      );
    END IF;
  END LOOP;
END $$;
