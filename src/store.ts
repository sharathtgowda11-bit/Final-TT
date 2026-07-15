// ============================================================
// Data Store — Supabase-backed reactive state
// Production-ready with full type safety
// ============================================================
import { v4 as uuid } from 'uuid';
import { supabase } from './lib/supabase';
import type {
  AppState, Faculty, Section, Room, Subject,
  ElectiveGroup, LabGroup, CoFacultyPool, FrozenSlot,
  TimetableSlot, ValidationResult, GenerationJob, JobStatus,
  SchedulerConfig,
} from './types';
import { DEFAULT_SCHEDULER_CONFIG } from './types';

const defaultState: AppState = {
  faculty: [],
  sections: [],
  rooms: [],
  subjects: [],
  electiveGroups: [],
  labGroups: [],
  coFacultyPools: [],
  frozenSlots: [],
  currentTimetable: null,
  currentValidation: null,
  currentJob: null,
  schedulerConfig: DEFAULT_SCHEDULER_CONFIG,
  jobHistory: [],
};

let state: AppState = { ...defaultState };
let listeners: Array<() => void> = [];
let isInitialLoadDone = false;

// ─── Supabase Sync Helpers ─────────────────────────────────

export async function initializeStore() {
  if (isInitialLoadDone) return;

  try {
    const [
      { data: faculty },
      { data: sections },
      { data: rooms },
      { data: subjects },
      { data: electiveGroups },
      { data: labGroups },
      { data: coFacultyPools },
      { data: frozenSlots },
      { data: appStateRows }
    ] = await Promise.all([
      supabase.from('faculty').select('*'),
      supabase.from('sections').select('*'),
      supabase.from('rooms').select('*'),
      supabase.from('subjects').select('*'),
      supabase.from('elective_groups').select('*'),
      supabase.from('lab_groups').select('*'),
      supabase.from('co_faculty_pools').select('*'),
      supabase.from('frozen_slots').select('*'),
      supabase.from('app_state').select('*')
    ]);

    const appStateMap = new Map(appStateRows?.map(r => [r.key, r.value]) || []);

    state = {
      faculty: (faculty || []).map(f => ({
        id: f.id,
        name: f.name,
        department: f.department,
        maxHoursPerWeek: f.max_hours_per_week,
        hasDoctorate: f.has_doctorate
      })),
      sections: sections || [],
      rooms: rooms || [],
      subjects: (subjects || []).map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        semester: s.semester,
        type: s.type,
        hoursPerWeek: s.hours_per_week,
        facultyIds: s.faculty_ids
      })),
      electiveGroups: (electiveGroups || []).map(e => ({
        id: e.id,
        name: e.name,
        semester: e.semester,
        batches: e.batches,
        classesPerWeek: e.classes_per_week ?? 1,
        isFrozen: e.is_frozen,
        frozenDay: e.frozen_day,
        frozenPeriod: e.frozen_period
      })),
      labGroups: (labGroups || []).map(l => ({
        id: l.id,
        name: l.name,
        semester: l.semester,
        sectionId: l.section_id,
        slotsPerWeek: l.slots_per_week,
        labs: l.labs
      })),
      coFacultyPools: (coFacultyPools || []).map(c => ({
        id: c.id,
        subjectName: c.subject_name,
        facultyIds: c.faculty_ids
      })),
      frozenSlots: (frozenSlots || []).map(f => ({
        id: f.id,
        day: f.day,
        period: f.period,
        facultyId: f.faculty_id,
        roomId: f.room_id,
        sectionId: f.section_id,
        subjectId: f.subject_id,
        semester: f.semester,
        description: f.description
      })),
      currentTimetable: appStateMap.get('currentTimetable') || null,
      currentValidation: appStateMap.get('currentValidation') || null,
      currentJob: appStateMap.get('currentJob') || null,
      schedulerConfig: appStateMap.get('schedulerConfig') || DEFAULT_SCHEDULER_CONFIG,
      jobHistory: appStateMap.get('jobHistory') || [],
    };

    isInitialLoadDone = true;
    notifyListeners();
  } catch (error) {
    console.error('Failed to initialize store from Supabase:', error);
  }
}

function notifyListeners() {
  listeners.forEach(fn => fn());
}

async function saveToSupabase(table: string, data: any) {
  try {
    const { error } = await supabase.from(table).upsert(data);
    if (error) throw error;
  } catch (err) {
    console.error(`Error saving to ${table}:`, err);
  }
}

async function removeFromSupabase(table: string, id: string, idField = 'id') {
  try {
    const { error } = await supabase.from(table).delete().eq(idField, id);
    if (error) throw error;
  } catch (err) {
    console.error(`Error removing from ${table}:`, err);
  }
}

async function updateAppState(key: string, value: any) {
  try {
    await supabase.from('app_state').upsert({ key, value, updated_at: new Date().toISOString() });
  } catch (err) {
    console.error(`Error updating app_state ${key}:`, err);
  }
}

export function subscribe(fn: () => void) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter(l => l !== fn);
  };
}

export function getState(): AppState {
  return state;
}

// ─── Faculty ─────────────────────────────────────────────
export function addFaculty(name: string, department = 'CSE', maxHoursPerWeek = 20, hasDoctorate = false): Faculty {
  const f: Faculty = { id: uuid(), name, department, maxHoursPerWeek, hasDoctorate };
  state = { ...state, faculty: [...state.faculty, f] };
  saveToSupabase('faculty', {
    id: f.id,
    name: f.name,
    department: f.department,
    max_hours_per_week: f.maxHoursPerWeek,
    has_doctorate: f.hasDoctorate
  });
  notifyListeners();
  return f;
}

export function updateFaculty(id: string, updates: Partial<Omit<Faculty, 'id'>>) {
  const f = state.faculty.find(fac => fac.id === id);
  if (!f) return;
  const updated = { ...f, ...updates };
  state = { ...state, faculty: state.faculty.map(fac => fac.id === id ? updated : fac) };
  saveToSupabase('faculty', {
    id: updated.id,
    name: updated.name,
    department: updated.department,
    max_hours_per_week: updated.maxHoursPerWeek,
    has_doctorate: updated.hasDoctorate
  });
  notifyListeners();
}

export function removeFaculty(id: string) {
  state = { ...state, faculty: state.faculty.filter(f => f.id !== id) };
  removeFromSupabase('faculty', id);
  notifyListeners();
}

// ─── Sections ─────────────────────────────────────────────
export function addSection(name: string, semester: number, batches: string[], strength = 60): Section {
  const s: Section = { id: uuid(), name, semester, batches, strength };
  state = { ...state, sections: [...state.sections, s] };
  saveToSupabase('sections', s); // batches is JSONB, matches id/name/semester/strength
  notifyListeners();
  return s;
}

export function removeSection(id: string) {
  state = { ...state, sections: state.sections.filter(s => s.id !== id) };
  removeFromSupabase('sections', id);
  notifyListeners();
}

// ─── Rooms ───────────────────────────────────────────────
export function addRoom(name: string, type: 'classroom' | 'lab'): Room {
  const r: Room = { id: uuid(), name, type };
  state = { ...state, rooms: [...state.rooms, r] };
  saveToSupabase('rooms', r);
  notifyListeners();
  return r;
}

export function removeRoom(id: string) {
  state = { ...state, rooms: state.rooms.filter(r => r.id !== id) };
  removeFromSupabase('rooms', id);
  notifyListeners();
}

// ─── Subjects ─────────────────────────────────────────────
export function addSubject(data: Omit<Subject, 'id'>): Subject {
  const s: Subject = { id: uuid(), ...data };
  state = { ...state, subjects: [...state.subjects, s] };
  saveToSupabase('subjects', {
    id: s.id,
    name: s.name,
    code: s.code,
    semester: s.semester,
    type: s.type,
    hours_per_week: s.hoursPerWeek,
    faculty_ids: s.facultyIds
  });
  notifyListeners();
  return s;
}

export function updateSubject(id: string, updates: Partial<Omit<Subject, 'id'>>) {
  const s = state.subjects.find(subj => subj.id === id);
  if (!s) return;
  const updated = { ...s, ...updates };
  state = { ...state, subjects: state.subjects.map(subj => subj.id === id ? updated : subj) };
  saveToSupabase('subjects', {
    id: updated.id,
    name: updated.name,
    code: updated.code,
    semester: updated.semester,
    type: updated.type,
    hours_per_week: updated.hoursPerWeek,
    faculty_ids: updated.facultyIds
  });
  notifyListeners();
}

export function removeSubject(id: string) {
  state = { ...state, subjects: state.subjects.filter(s => s.id !== id) };
  removeFromSupabase('subjects', id);
  notifyListeners();
}

// ─── Elective Groups ──────────────────────────────────────
export function addElectiveGroup(data: Omit<ElectiveGroup, 'id'>): ElectiveGroup {
  const e: ElectiveGroup = { id: uuid(), ...data };
  state = { ...state, electiveGroups: [...state.electiveGroups, e] };
  saveToSupabase('elective_groups', {
    id: e.id,
    name: e.name,
    semester: e.semester,
    batches: e.batches,
    classes_per_week: e.classesPerWeek ?? 1,
    is_frozen: e.isFrozen,
    frozen_day: e.frozenDay,
    frozen_period: e.frozenPeriod
  });
  notifyListeners();
  return e;
}

export function updateElectiveGroup(id: string, updates: Partial<Omit<ElectiveGroup, 'id'>>) {
  const e = state.electiveGroups.find(eg => eg.id === id);
  if (!e) return;
  const updated = { ...e, ...updates };
  state = { ...state, electiveGroups: state.electiveGroups.map(eg => eg.id === id ? updated : eg) };
  saveToSupabase('elective_groups', {
    id: updated.id,
    name: updated.name,
    semester: updated.semester,
    batches: updated.batches,
    classes_per_week: updated.classesPerWeek ?? 1,
    is_frozen: updated.isFrozen,
    frozen_day: updated.frozenDay,
    frozen_period: updated.frozenPeriod
  });
  notifyListeners();
}

export function removeElectiveGroup(id: string) {
  state = { ...state, electiveGroups: state.electiveGroups.filter(e => e.id !== id) };
  removeFromSupabase('elective_groups', id);
  notifyListeners();
}

// ─── Lab Groups ───────────────────────────────────────────
export function addLabGroup(data: Omit<LabGroup, 'id'>): LabGroup {
  const l: LabGroup = { id: uuid(), ...data };
  state = { ...state, labGroups: [...state.labGroups, l] };
  saveToSupabase('lab_groups', {
    id: l.id,
    name: l.name,
    semester: l.semester,
    section_id: l.sectionId,
    slots_per_week: l.slotsPerWeek,
    labs: l.labs
  });
  notifyListeners();
  return l;
}

export function removeLabGroup(id: string) {
  state = { ...state, labGroups: state.labGroups.filter(l => l.id !== id) };
  removeFromSupabase('lab_groups', id);
  notifyListeners();
}

// ─── Co-Faculty Pools ─────────────────────────────────────
export function addCoFacultyPool(subjectName: string, facultyIds: string[]): CoFacultyPool {
  const p: CoFacultyPool = { id: uuid(), subjectName, facultyIds };
  state = { ...state, coFacultyPools: [...state.coFacultyPools, p] };
  saveToSupabase('co_faculty_pools', {
    id: p.id,
    subject_name: p.subjectName,
    faculty_ids: p.facultyIds
  });
  notifyListeners();
  return p;
}

export function updateCoFacultyPool(id: string, updates: Partial<Omit<CoFacultyPool, 'id'>>) {
  const p = state.coFacultyPools.find(cp => cp.id === id);
  if (!p) return;
  const updated = { ...p, ...updates };
  state = { ...state, coFacultyPools: state.coFacultyPools.map(cp => cp.id === id ? updated : cp) };
  saveToSupabase('co_faculty_pools', {
    id: updated.id,
    subject_name: updated.subjectName,
    faculty_ids: updated.facultyIds
  });
  notifyListeners();
}

export function removeCoFacultyPool(id: string) {
  state = { ...state, coFacultyPools: state.coFacultyPools.filter(p => p.id !== id) };
  removeFromSupabase('co_faculty_pools', id);
  notifyListeners();
}

// ─── Frozen Slots ─────────────────────────────────────────
export function addFrozenSlot(data: Omit<FrozenSlot, 'id'>): FrozenSlot {
  const f: FrozenSlot = { id: uuid(), ...data };
  state = { ...state, frozenSlots: [...state.frozenSlots, f] };
  saveToSupabase('frozen_slots', {
    id: f.id,
    day: f.day,
    period: f.period,
    faculty_id: f.facultyId,
    room_id: f.roomId,
    section_id: f.sectionId,
    subject_id: f.subjectId,
    semester: f.semester,
    description: f.description
  });
  notifyListeners();
  return f;
}

export function removeFrozenSlot(id: string) {
  state = { ...state, frozenSlots: state.frozenSlots.filter(f => f.id !== id) };
  removeFromSupabase('frozen_slots', id);
  notifyListeners();
}

// ─── Scheduler Config ─────────────────────────────────────
export function updateConfig(config: Partial<SchedulerConfig>) {
  const updated = { ...state.schedulerConfig, ...config };
  state = { ...state, schedulerConfig: updated };
  updateAppState('schedulerConfig', updated);
  notifyListeners();
}

// ─── Timetable ───────────────────────────────────────────
export function setTimetable(timetable: TimetableSlot[], validation: ValidationResult) {
  state = { ...state, currentTimetable: timetable, currentValidation: validation };
  updateAppState('currentTimetable', timetable);
  updateAppState('currentValidation', validation);
  notifyListeners();
}

export function clearTimetable() {
  state = { ...state, currentTimetable: null, currentValidation: null };
  updateAppState('currentTimetable', null);
  updateAppState('currentValidation', null);
  notifyListeners();
}

// ─── Generation Job ───────────────────────────────────────
export function startJob(): GenerationJob {
  const job: GenerationJob = {
    id: uuid(),
    status: 'preprocessing',
    phase: 0,
    totalPhases: 7,
    log: [],
    createdAt: new Date().toISOString(),
  };
  state = { ...state, currentJob: job };
  updateAppState('currentJob', job);
  notifyListeners();
  return job;
}

export function updateJob(updates: Partial<GenerationJob>) {
  if (!state.currentJob) return;
  const updated = { ...state.currentJob, ...updates };
  state = { ...state, currentJob: updated };
  // Only notify listeners for internal job updates to keep UI smooth
  notifyListeners();
}

export function appendJobLog(msg: string) {
  if (!state.currentJob) return;
  const updated = { ...state.currentJob, log: [...state.currentJob.log, msg] };
  state = { ...state, currentJob: updated };
  notifyListeners();
}

export function finishJob(status: JobStatus, error?: string) {
  if (!state.currentJob) return;
  const finished: GenerationJob = {
    ...state.currentJob,
    status,
    completedAt: new Date().toISOString(),
    error,
  };
  const updatedHistory = [finished, ...state.jobHistory.slice(0, 9)];
  state = {
    ...state,
    currentJob: finished,
    jobHistory: updatedHistory,
  };
  updateAppState('currentJob', finished);
  updateAppState('jobHistory', updatedHistory);
  notifyListeners();
}

// ─── Sample Data ──────────────────────────────────────────
export async function loadSampleData() {
  // Clearing data in Supabase is more involved, for now we just clear local and let it sync or the user clear DB manually
  state = { ...defaultState };
  // Note: For a real app, you'd want a bulk delete and then bulk insert here
  // To keep it simple, we'll just clear local state and suggest the user runs the SQL again
  notifyListeners();
}

export async function clearAllData() {
  state = { ...defaultState };
  // Clear tables in Supabase
  await Promise.all([
    supabase.from('faculty').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('sections').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('rooms').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('subjects').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('elective_groups').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('lab_groups').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('co_faculty_pools').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('frozen_slots').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('app_state').delete().neq('key', 'null'),
  ]);
  notifyListeners();
}
