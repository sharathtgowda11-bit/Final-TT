-- ============================================================
-- TIMETABLE GENERATOR — COMPLETE DATABASE SETUP
-- Project ID: pzzuwmchqgzgagvdufwx
-- Run this ONCE in Supabase SQL Editor (new project)
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. CORE DATA TABLES
-- Order matters: tables with no FK deps first
-- ─────────────────────────────────────────────────────────────

-- Faculty
CREATE TABLE IF NOT EXISTS faculty (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  department      TEXT NOT NULL DEFAULT 'CSE',
  max_hours_per_week INTEGER DEFAULT 20,
  has_doctorate   BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Sections (batches stored as JSONB array of strings)
CREATE TABLE IF NOT EXISTS sections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  semester        INTEGER NOT NULL,
  batches         JSONB NOT NULL DEFAULT '[]',
  strength        INTEGER DEFAULT 60,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('classroom', 'lab')),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Subjects (faculty_ids stored as JSONB array of UUIDs)
CREATE TABLE IF NOT EXISTS subjects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  code            TEXT NOT NULL,
  semester        INTEGER NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('core', 'elective', 'lab')),
  hours_per_week  INTEGER NOT NULL DEFAULT 4,
  faculty_ids     JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Elective Groups (batches stored as JSONB array of ElectiveBatch objects)
CREATE TABLE IF NOT EXISTS elective_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  semester        INTEGER NOT NULL,
  batches         JSONB NOT NULL DEFAULT '[]',
  classes_per_week INTEGER DEFAULT 1,
  is_frozen       BOOLEAN NOT NULL DEFAULT false,
  frozen_day      TEXT,
  frozen_period   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Lab Groups (labs stored as JSONB array of LabEntry objects)
CREATE TABLE IF NOT EXISTS lab_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  semester        INTEGER NOT NULL,
  section_id      UUID REFERENCES sections(id) ON DELETE CASCADE,
  slots_per_week  INTEGER NOT NULL DEFAULT 1,
  labs            JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Co-Faculty Pools (eligible co-faculty candidates per lab subject name)
CREATE TABLE IF NOT EXISTS co_faculty_pools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_name    TEXT NOT NULL UNIQUE,
  faculty_ids     JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Frozen Slots
CREATE TABLE IF NOT EXISTS frozen_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day             TEXT NOT NULL,
  period          TEXT NOT NULL,
  faculty_id      UUID REFERENCES faculty(id) ON DELETE SET NULL,
  room_id         UUID REFERENCES rooms(id) ON DELETE SET NULL,
  section_id      UUID REFERENCES sections(id) ON DELETE SET NULL,
  subject_id      UUID REFERENCES subjects(id) ON DELETE SET NULL,
  semester        INTEGER,
  description     TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- App State (key-value store for currentTimetable, currentValidation, etc.)
CREATE TABLE IF NOT EXISTS app_state (
  key             TEXT PRIMARY KEY,
  value           JSONB,
  updated_at      TIMESTAMPTZ DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────
-- 2. SEMESTER TIMETABLE TABLES
-- ─────────────────────────────────────────────────────────────

-- Timetables (DRAFT / LOCKED / INACTIVE workflow)
CREATE TABLE IF NOT EXISTS timetables (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semester             INTEGER NOT NULL,
  academic_year        TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'LOCKED', 'INACTIVE')),
  version              INTEGER,                                        -- NULL for DRAFT, assigned on lock
  parent_timetable_id  UUID REFERENCES timetables(id) ON DELETE SET NULL, -- lineage tracking
  slots                JSONB NOT NULL DEFAULT '[]',
  validation           JSONB,
  generation_log       JSONB DEFAULT '[]',
  metadata             JSONB DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  last_edited_at       TIMESTAMPTZ,
  validated_at         TIMESTAMPTZ,
  locked_at            TIMESTAMPTZ,
  locked_by            TEXT
);

-- Only ONE draft per semester + academic year
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_draft_per_sem_year
  ON timetables(semester, academic_year)
  WHERE status = 'DRAFT';

-- Only ONE locked per semester + academic year
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_locked_per_sem_year
  ON timetables(semester, academic_year)
  WHERE status = 'LOCKED';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_timetables_status_year
  ON timetables(academic_year, status);

CREATE INDEX IF NOT EXISTS idx_timetables_sem_year
  ON timetables(semester, academic_year);

-- Fixed classroom assignment per section per academic year
CREATE TABLE IF NOT EXISTS section_classrooms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id      UUID REFERENCES sections(id) ON DELETE CASCADE,
  room_id         UUID REFERENCES rooms(id) ON DELETE CASCADE,
  academic_year   TEXT NOT NULL,
  UNIQUE(section_id, academic_year)
);


-- ─────────────────────────────────────────────────────────────
-- 3. STORED PROCEDURES (RPCs)
-- ─────────────────────────────────────────────────────────────

-- RPC: Create Draft Timetable
-- Soft-deletes any existing DRAFT (→ INACTIVE), records lineage from current LOCKED
CREATE OR REPLACE FUNCTION create_draft_timetable(
  p_semester       INTEGER,
  p_academic_year  TEXT,
  p_slots          JSONB,
  p_validation     JSONB,
  p_generation_log JSONB
)
RETURNS UUID AS $$
DECLARE
  v_id        UUID;
  v_locked_id UUID;
BEGIN
  -- Soft-delete any existing DRAFT for this semester + year
  UPDATE timetables
  SET status     = 'INACTIVE',
      updated_at = now()
  WHERE semester      = p_semester
    AND academic_year = p_academic_year
    AND status        = 'DRAFT';

  -- Find current LOCKED timetable (if any) for lineage
  SELECT id INTO v_locked_id
  FROM timetables
  WHERE semester      = p_semester
    AND academic_year = p_academic_year
    AND status        = 'LOCKED';

  -- Insert new DRAFT (version = NULL until locked)
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


-- RPC: Lock Timetable
-- Atomic: existing LOCKED → INACTIVE, DRAFT → LOCKED with next version number
CREATE OR REPLACE FUNCTION lock_timetable(p_id UUID)
RETURNS VOID AS $$
DECLARE
  v_semester       INTEGER;
  v_academic_year  TEXT;
  v_status         TEXT;
  v_latest_version INTEGER;
  v_next_version   INTEGER;
BEGIN
  -- Get the timetable to lock
  SELECT semester, academic_year, status
  INTO v_semester, v_academic_year, v_status
  FROM timetables
  WHERE id = p_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Timetable not found: %', p_id;
  END IF;

  IF v_status != 'DRAFT' THEN
    RAISE EXCEPTION 'Can only lock a DRAFT timetable (current status: %)', v_status;
  END IF;

  -- Race-safe version numbering using FOR UPDATE
  SELECT version
  INTO v_latest_version
  FROM timetables
  WHERE semester      = v_semester
    AND academic_year = v_academic_year
    AND version IS NOT NULL
  ORDER BY version DESC
  LIMIT 1
  FOR UPDATE;

  v_next_version := COALESCE(v_latest_version, 0) + 1;

  -- Step 1: Demote existing LOCKED → INACTIVE
  UPDATE timetables
  SET status     = 'INACTIVE',
      updated_at = now()
  WHERE semester      = v_semester
    AND academic_year = v_academic_year
    AND status        = 'LOCKED';

  -- Step 2: Promote this DRAFT → LOCKED with version
  UPDATE timetables
  SET status     = 'LOCKED',
      version    = v_next_version,
      locked_at  = now(),
      updated_at = now()
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- Requires an authenticated Supabase Auth session (see
-- supabase_auth_migration.sql for the login setup this pairs with)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE faculty           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections          ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE elective_groups   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_faculty_pools  ENABLE ROW LEVEL SECURITY;
ALTER TABLE frozen_slots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_state         ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetables        ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_classrooms ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
  pol TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'faculty', 'sections', 'rooms', 'subjects',
    'elective_groups', 'lab_groups', 'co_faculty_pools', 'frozen_slots', 'app_state',
    'timetables', 'section_classrooms'
  ] LOOP
    pol := 'Allow authenticated operations on ' || tbl;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = tbl AND policyname = pol
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')',
        pol, tbl
      );
    END IF;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 5. VERIFY (optional — run SELECT to confirm tables exist)
-- ─────────────────────────────────────────────────────────────

-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;
