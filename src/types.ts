// ============================================================
// CONSTRAINT-BASED ACADEMIC TIMETABLE GENERATOR
// Complete Type System — CSE Department
// ============================================================

export type Day = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
export type Period = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7';
export type CourseType = 'core' | 'elective' | 'lab';
export type RoomType = 'classroom' | 'lab';

export const DAYS: Day[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_PERIODS: Period[] = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
export const SATURDAY_PERIODS: Period[] = ['P1', 'P2', 'P3', 'P4'];
export const MORNING_PERIODS: Period[] = ['P1', 'P2'];

export const PERIOD_TIMES: Record<Period, string> = {
  P1: '8:00–9:00',
  P2: '9:00–10:00',
  P3: '10:30–11:30',
  P4: '11:30–12:30',
  P5: '2:00–3:00',
  P6: '3:00–4:00',
  P7: '4:00–5:00',
};

export const PERIOD_ORDER: Record<Period, number> = {
  P1: 0, P2: 1, P3: 2, P4: 3, P5: 4, P6: 5, P7: 6,
};

// Valid lab pairs (2 continuous periods)
export const LAB_PAIRS_WEEKDAY: [Period, Period][] = [
  ['P1', 'P2'],
  ['P3', 'P4'],
  ['P5', 'P6'],
  ['P6', 'P7'],
];

export const LAB_PAIRS_SATURDAY: [Period, Period][] = [
  ['P1', 'P2'],
  ['P3', 'P4'],
];

export const SUPPORTED_SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

// ─── Entities ──────────────────────────────────────────────

export interface Faculty {
  id: string;
  name: string;
  department: string;
  maxHoursPerWeek?: number;
}

export interface Section {
  id: string;
  name: string;
  semester: number;
  batches: string[];           // e.g. ['4A-D1', '4A-D2']
  strength?: number;
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  semester: number;
  type: CourseType;
  hoursPerWeek: number;        // for core: lecture count; for lab: slot count
  facultyIds: string[];        // pool of faculty for this subject
}

// ─── Elective System ───────────────────────────────────────

export interface ElectiveBatch {
  id: string;
  name: string;                // e.g. 'Green AI B1'
  facultyId: string;
  subjectName: string;
  hasLab?: boolean;
  labFacultyId?: string;
  labRoomId?: string;
}

export interface ElectiveGroup {
  id: string;
  name: string;
  semester: number;
  batches: ElectiveBatch[];
  classesPerWeek?: number;     // how many sessions per week (default 1), each on a different day
  isFrozen: boolean;           // true for 4th sem (math dept controls slot)
  frozenDay?: Day;
  frozenPeriod?: Period;
}

// ─── Lab Rotation System ───────────────────────────────────

export interface LabEntry {
  id: string;
  labName: string;             // e.g. 'ML Lab'
  facultyId: string;
  roomId: string;
}

export interface LabGroup {
  id: string;
  name: string;
  semester: number;
  sectionId: string;
  slotsPerWeek: number;        // 1 slot = 1 session = 2 continuous periods
  labs: LabEntry[];            // Labs in rotation pool
}

// LabRotationSet: resolves which batch does which lab per session
export interface LabRotationSet {
  groupId: string;
  batches: string[];
  labs: string[];              // lab names
  rotationMatrix: Record<string, Record<string, string>>; // batchName -> sessionIdx -> labName
}

// ─── Frozen Slots ──────────────────────────────────────────

export interface FrozenSlot {
  id: string;
  day: Day;
  period: Period;
  facultyId?: string;
  roomId?: string;
  sectionId?: string;
  subjectId?: string;
  semester?: number;
  description: string;
}

// ─── Timetable Output ─────────────────────────────────────

export interface TimetableSlot {
  id: string;
  day: Day;
  period: Period;
  subjectName: string;
  subjectCode?: string;
  subjectType: CourseType;
  facultyId: string;
  facultyName: string;
  sectionId: string;
  sectionName: string;
  semester: number;
  roomId?: string;
  roomName?: string;
  batchName?: string;
  isLabContinuation?: boolean;
  electiveGroupId?: string;
  labGroupId?: string;
  sessionIndex?: number;       // for lab rotation tracking
  score?: number;
}

// ─── Validation ───────────────────────────────────────────

export interface ClashDetail {
  type: 'faculty' | 'room' | 'section';
  day: Day;
  period: Period;
  entityName: string;
  subjects: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  clashDetails: ClashDetail[];
  stats: {
    totalSlots: number;
    totalUniqueClasses: number;
    facultyClashes: number;
    roomClashes: number;
    sectionClashes: number;
    softViolations: number;
    saturdayViolations: number;
    workloadBalance: { facultyName: string; hours: number }[];
    subjectCoverage: { subjectName: string; section: string; scheduled: number; required: number; ok: boolean }[];
    labRotationOk: boolean;
    electiveConcurrencyOk: boolean;
  };
}

// ─── Generation Job ────────────────────────────────────────

export type JobStatus = 'idle' | 'preprocessing' | 'freezing' | 'electives' | 'labs' | 'theory' | 'optimizing' | 'validating' | 'done' | 'failed';

export interface GenerationJob {
  id: string;
  status: JobStatus;
  phase: number;
  totalPhases: number;
  log: string[];
  createdAt: string;
  completedAt?: string;
  error?: string;
}

// ─── Scheduler Config ─────────────────────────────────────

export interface SchedulerConfig {
  maxMorningClassesPerFaculty: number;   // default 3
  workloadToleranceHours: number;        // default 1
  maxOptimizationPasses: number;         // default 500
  preferSpreadAcrossDays: boolean;
  penalizeBackToBack: boolean;
  penalizeSaturday: boolean;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxMorningClassesPerFaculty: 3,
  workloadToleranceHours: 1,
  maxOptimizationPasses: 500,
  preferSpreadAcrossDays: true,
  penalizeBackToBack: true,
  penalizeSaturday: true,
};

// ─── Semester Timetable System ────────────────────────────

export type TimetableStatus = 'DRAFT' | 'LOCKED' | 'INACTIVE';

export interface SemesterTimetable {
  id: string;
  semester: number;
  academicYear: string;
  status: TimetableStatus;
  version: number | null;
  parentTimetableId: string | null;
  slots: TimetableSlot[];
  validation: ValidationResult | null;
  generationLog: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastEditedAt: string | null;
  validatedAt: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
}

export interface SectionClassroom {
  id: string;
  sectionId: string;
  roomId: string;
  academicYear: string;
}

export interface CrossSemesterClash {
  type: 'faculty' | 'room';
  entityName: string;
  day: string;
  period: string;
  draftSubject: string;
  draftSection: string;
  lockedSubject: string;
  lockedSection: string;
  lockedSemester: number;
}

// ─── App State ─────────────────────────────────────────────

export interface AppState {
  faculty: Faculty[];
  sections: Section[];
  rooms: Room[];
  subjects: Subject[];
  electiveGroups: ElectiveGroup[];
  labGroups: LabGroup[];
  frozenSlots: FrozenSlot[];
  currentTimetable: TimetableSlot[] | null;
  currentValidation: ValidationResult | null;
  currentJob: GenerationJob | null;
  schedulerConfig: SchedulerConfig;
  // Generation jobs history
  jobHistory: GenerationJob[];
}
