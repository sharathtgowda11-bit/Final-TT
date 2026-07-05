-- ============================================================
-- Semester Timetable System — Database Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- ─── Timetables Table ─────────────────────────────────────
-- Stores semester-specific timetables with DRAFT/LOCKED/INACTIVE workflow

CREATE TABLE IF NOT EXISTS timetables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semester INTEGER NOT NULL,
  academic_year TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  version INTEGER,                                              -- NULL for DRAFT, assigned on lock
  parent_timetable_id UUID REFERENCES timetables(id),           -- lineage: which timetable was this based on
  slots JSONB NOT NULL DEFAULT '[]',
  validation JSONB,
  generation_log JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',                                  -- future-proof: { generator, notes, reason, ... }
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_edited_at TIMESTAMPTZ,
  validated_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  locked_by TEXT
);

-- Only ONE draft per semester + academic year
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_draft_per_sem_year
  ON timetables(semester, academic_year)
  WHERE status = 'DRAFT';

-- Only ONE locked per semester + academic year
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_locked_per_sem_year
  ON timetables(semester, academic_year)
  WHERE status = 'LOCKED';

-- Performance: fetch by status + year
CREATE INDEX IF NOT EXISTS idx_timetables_status_year
  ON timetables(academic_year, status);

-- Performance: fetch by semester + year
CREATE INDEX IF NOT EXISTS idx_timetables_sem_year
  ON timetables(semester, academic_year);


-- ─── Section Classrooms Table ─────────────────────────────
-- Fixed classroom assignment per section per academic year

CREATE TABLE IF NOT EXISTS section_classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID REFERENCES sections(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  UNIQUE(section_id, academic_year)
);


-- ─── RPC: Create Draft Timetable ──────────────────────────
-- Soft-deletes any existing draft (→ INACTIVE), records lineage

CREATE OR REPLACE FUNCTION create_draft_timetable(
  p_semester INTEGER,
  p_academic_year TEXT,
  p_slots JSONB,
  p_validation JSONB,
  p_generation_log JSONB
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_locked_id UUID;
BEGIN
  -- Soft-delete any existing DRAFT for this semester + year (→ INACTIVE)
  UPDATE timetables
  SET status = 'INACTIVE',
      updated_at = now()
  WHERE semester = p_semester
    AND academic_year = p_academic_year
    AND status = 'DRAFT';

  -- Find current LOCKED timetable (if any) for lineage tracking
  SELECT id INTO v_locked_id
  FROM timetables
  WHERE semester = p_semester
    AND academic_year = p_academic_year
    AND status = 'LOCKED';

  -- Insert new draft (version = NULL, assigned on lock)
  INSERT INTO timetables (
    semester, academic_year, status, version, parent_timetable_id,
    slots, validation, generation_log,
    metadata, validated_at
  )
  VALUES (
    p_semester, p_academic_year, 'DRAFT', NULL, v_locked_id,
    p_slots, p_validation, p_generation_log,
    jsonb_build_object('generator', 'semester'), now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;


-- ─── RPC: Lock Timetable ─────────────────────────────────
-- Atomic: existing LOCKED → INACTIVE, DRAFT → LOCKED with version
-- Uses FOR UPDATE to prevent race conditions on version numbering

CREATE OR REPLACE FUNCTION lock_timetable(p_id UUID)
RETURNS VOID AS $$
DECLARE
  v_semester INTEGER;
  v_academic_year TEXT;
  v_status TEXT;
  v_next_version INTEGER;
  v_latest_version INTEGER;
BEGIN
  -- Get the draft info
  SELECT semester, academic_year, status
  INTO v_semester, v_academic_year, v_status
  FROM timetables
  WHERE id = p_id;

  -- Guard: only DRAFT can be locked
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Timetable not found: %', p_id;
  END IF;

  IF v_status != 'DRAFT' THEN
    RAISE EXCEPTION 'Can only lock a DRAFT timetable (current status: %)', v_status;
  END IF;

  -- Race-safe version numbering with FOR UPDATE
  SELECT version
  INTO v_latest_version
  FROM timetables
  WHERE semester = v_semester
    AND academic_year = v_academic_year
    AND version IS NOT NULL
  ORDER BY version DESC
  LIMIT 1
  FOR UPDATE;

  v_next_version := COALESCE(v_latest_version, 0) + 1;

  -- Step 1: Existing LOCKED → INACTIVE
  UPDATE timetables
  SET status = 'INACTIVE',
      updated_at = now()
  WHERE semester = v_semester
    AND academic_year = v_academic_year
    AND status = 'LOCKED';

  -- Step 2: DRAFT → LOCKED with version
  UPDATE timetables
  SET status = 'LOCKED',
      version = v_next_version,
      locked_at = now(),
      updated_at = now()
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;


-- ─── RLS Policies ─────────────────────────────────────────

ALTER TABLE timetables ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'timetables'
    AND policyname = 'Allow all operations on timetables'
  ) THEN
    CREATE POLICY "Allow all operations on timetables"
      ON timetables FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE section_classrooms ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'section_classrooms'
    AND policyname = 'Allow all operations on section_classrooms'
  ) THEN
    CREATE POLICY "Allow all operations on section_classrooms"
      ON section_classrooms FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;
