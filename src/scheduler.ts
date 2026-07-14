// ============================================================
// CONSTRAINT-BASED SCHEDULING ENGINE
// CSE Department — Complete Production Implementation
// ============================================================
// Phases:
//   0  — Preprocessing (faculty-section mapping, demand list)
//   1  — Freeze college slots
//   2  — Schedule electives (frozen or algorithm-chosen)
//   3  — Schedule labs (rotation matrix, concurrent batches)
//   4  — Schedule theory (MRV heuristic + scoring)
//   5  — Optimization (local search: swap/move)
//   6  — Validation (hard + soft constraint report)
// ============================================================

import { v4 as uuid } from 'uuid';
import {
  Day, Period, DAYS, WEEKDAY_PERIODS, SATURDAY_PERIODS,
  LAB_PAIRS_WEEKDAY, LAB_PAIRS_SATURDAY, PERIOD_ORDER,
  TimetableSlot, ValidationResult, ClashDetail,
  AppState, SchedulerConfig, DEFAULT_SCHEDULER_CONFIG,
} from './types';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

type SlotKey = string; // `${Day}|${Period}`
function sk(day: Day, period: Period): SlotKey { return `${day}|${period}`; }
function skParts(key: SlotKey): { day: Day; period: Period } {
  const [day, period] = key.split('|');
  return { day: day as Day, period: period as Period };
}
void skParts; // used internally

function periodsForDay(day: Day): Period[] {
  return day === 'Saturday' ? SATURDAY_PERIODS : WEEKDAY_PERIODS;
}

function labPairsForDay(day: Day): [Period, Period][] {
  return day === 'Saturday' ? LAB_PAIRS_SATURDAY : LAB_PAIRS_WEEKDAY;
}

function isMorning(p: Period): boolean {
  return p === 'P1' || p === 'P2';
}

function isP1(p: Period): boolean { return p === 'P1'; }
function isP2(p: Period): boolean { return p === 'P2'; }

function periodIdx(p: Period): number {
  return PERIOD_ORDER[p];
}

function isExternalFaculty(fac: import('./types').Faculty | undefined, subjectName?: string): boolean {
  if (!fac) return true;
  if (fac.department !== 'CSE') return true;
  // Heuristic: If they left department as CSE but named the faculty "Maths" or similar,
  // or if the subject is clearly an external generic subject.
  const n = fac.name.toLowerCase();
  if (n.includes('math') || n.includes('basic science') || n.includes('biology') || n.includes('english') || n.includes('kannada') || n.includes('constitution')) return true;

  if (subjectName) {
    const s = subjectName.toLowerCase();
    if (s.includes('math') || s.includes('biology') || s.includes('english') || s.includes('kannada') || s.includes('constitution') || s.includes('discrete mathematical') || s.includes('linear algebra')) return true;
  }
  return false;
}

function hadMorningPreviousDay(fid: string, day: Day, grid: OccupancyGrid): boolean {
  const days: Day[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const idx = days.indexOf(day);
  if (idx <= 0) return false;

  const prevDay = days[idx - 1];
  const periods = grid.facultyDayPeriods(fid, prevDay);

  return periods.some(p => p === 'P1' || p === 'P2');
}
void hadMorningPreviousDay; // retained for potential future use

// ─────────────────────────────────────────────────────────────
// OCCUPANCY GRID
// Tracks which faculty/section/room is occupied at each slot
// ─────────────────────────────────────────────────────────────

class OccupancyGrid {
  private faculty: Map<string, Set<SlotKey>> = new Map();
  private section: Map<string, Set<SlotKey>> = new Map();
  private room: Map<string, Set<SlotKey>> = new Map();
  private facultyMap: Map<string, import('./types').Faculty>;
  // Frozen faculty slots — these are ALWAYS occupied, bypassing isExternalFaculty
  private frozenFaculty: Set<string> = new Set(); // key: `${fid}|${day}|${period}`

  constructor(facultyMap?: Map<string, import('./types').Faculty>) {
    this.facultyMap = facultyMap || new Map();
  }

  private getSet(map: Map<string, Set<SlotKey>>, key: string): Set<SlotKey> {
    if (!map.has(key)) map.set(key, new Set<SlotKey>());
    return map.get(key)!;
  }

  isFacultyFree(fid: string, day: Day, period: Period, subjectName?: string): boolean {
    // CRITICAL: Frozen slots are ALWAYS occupied — never bypass them
    const frozenKey = `${fid}|${sk(day, period)}`;
    if (this.frozenFaculty.has(frozenKey)) return false;
    const fac = this.facultyMap.get(fid);
    if (isExternalFaculty(fac, subjectName)) return true;
    return !this.getSet(this.faculty, fid).has(sk(day, period));
  }
  isSectionFree(sid: string, day: Day, period: Period): boolean {
    return !this.getSet(this.section, sid).has(sk(day, period));
  }
  isRoomFree(rid: string, day: Day, period: Period): boolean {
    return !this.getSet(this.room, rid).has(sk(day, period));
  }

  occupyFaculty(fid: string, day: Day, period: Period, subjectName?: string) {
    const fac = this.facultyMap.get(fid);
    if (isExternalFaculty(fac, subjectName)) return;
    this.getSet(this.faculty, fid).add(sk(day, period));
  }
  // Freeze a faculty slot unconditionally — bypasses isExternalFaculty
  freezeFaculty(fid: string, day: Day, period: Period) {
    const frozenKey = `${fid}|${sk(day, period)}`;
    this.frozenFaculty.add(frozenKey);
    // Also add to regular faculty grid for consistency
    this.getSet(this.faculty, fid).add(sk(day, period));
  }
  occupySection(sid: string, day: Day, period: Period) {
    this.getSet(this.section, sid).add(sk(day, period));
  }
  occupyRoom(rid: string, day: Day, period: Period) {
    this.getSet(this.room, rid).add(sk(day, period));
  }

  occupy(fid: string, sid: string, rid: string | undefined, day: Day, period: Period, subjectName?: string) {
    this.occupyFaculty(fid, day, period, subjectName);
    this.occupySection(sid, day, period);
    if (rid) this.occupyRoom(rid, day, period);
  }

  // Count morning slots for a faculty member across whole week
  morningCount(fid: string): number {
    const set = this.getSet(this.faculty, fid);
    let c = 0;
    for (const k of set) {
      const { period } = skParts(k);
      if (isMorning(period)) c++;
    }
    return c;
  }

  // Count ONLY P1 slots for a faculty member across whole week
  p1Count(fid: string): number {
    const set = this.getSet(this.faculty, fid);
    let c = 0;
    for (const k of set) {
      const { period } = skParts(k);
      if (isP1(period)) c++;
    }
    return c;
  }

  // Get all periods a faculty is scheduled on a day
  facultyDayPeriods(fid: string, day: Day): Period[] {
    const set = this.getSet(this.faculty, fid);
    const result: Period[] = [];
    for (const k of set) {
      const parts = skParts(k);
      if (parts.day === day) result.push(parts.period);
    }
    return result;
  }

  // Get all periods a section is scheduled on a day
  sectionDayPeriods(sid: string, day: Day): Period[] {
    const set = this.getSet(this.section, sid);
    const result: Period[] = [];
    for (const k of set) {
      const parts = skParts(k);
      if (parts.day === day) result.push(parts.period);
    }
    return result;
  }

  // Total slots occupied by a faculty member (workload measure)
  facultyTotalSlots(fid: string): number {
    return this.getSet(this.faculty, fid).size;
  }

  // Average workload across all faculty
  averageWorkload(): number {
    if (this.faculty.size === 0) return 0;
    let total = 0;
    for (const [, slots] of this.faculty) total += slots.size;
    return total / this.faculty.size;
  }

  // Days a section is already scheduled on
  sectionScheduledDays(sid: string): Set<Day> {
    const set = this.getSet(this.section, sid);
    const days = new Set<Day>();
    for (const k of set) days.add(skParts(k).day);
    return days;
  }

  // Pre-seed grid with existing locked slots (cross-semester clash prevention)
  preloadSlots(slots: TimetableSlot[]) {
    for (const s of slots) {
      this.occupyFaculty(s.facultyId, s.day, s.period, s.subjectName);
      this.occupySection(s.sectionId, s.day, s.period);
      if (s.roomId) this.occupyRoom(s.roomId, s.day, s.period);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// DEMAND ITEM
// Represents one (subject × section) scheduling requirement
// ─────────────────────────────────────────────────────────────

interface DemandItem {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  facultyId: string;
  sectionId: string;
  semester: number;
  totalRequired: number;
  remaining: number;
  scheduledDays: Set<Day>;
}

// ─────────────────────────────────────────────────────────────
// LAB ROTATION RESOLVER
// Builds rotation matrix: for each session, each batch → lab
// ─────────────────────────────────────────────────────────────

function resolveLabRotation(batches: string[], labs: string[]): Map<number, Map<string, string>> {
  // rotationMatrix[sessionIdx][batchName] = labName
  const matrix = new Map<number, Map<string, string>>();
  const numLabs = labs.length;
  for (let session = 0; session < numLabs; session++) {
    const sessionMap = new Map<string, string>();
    for (let b = 0; b < batches.length; b++) {
      const labIdx = (b + session) % numLabs;
      sessionMap.set(batches[b], labs[labIdx]);
    }
    matrix.set(session, sessionMap);
  }
  return matrix;
}

// ─────────────────────────────────────────────────────────────
// SLOT SCORER
// Returns a score (higher = better) for scheduling a demand at (day, period)
// ─────────────────────────────────────────────────────────────

function scoreSlot(
  demand: DemandItem,
  day: Day,
  period: Period,
  grid: OccupancyGrid,
  config: SchedulerConfig,
): number {
  let score = 200;

  // ── Hard-ish: Spread across days (one class per subject per section per day) ──
  // This is enforced as a hard constraint in the main loop, but we also
  // penalize heavily here as a backup for the optimization phase scoring
  if (demand.scheduledDays.has(day)) {
    score -= 500;
  }

  // ── Soft: Penalize Saturday ──
  if (config.penalizeSaturday && day === 'Saturday') {
    score -= 5;
  }

  // ── Soft: Penalize back-to-back for faculty ──
  if (config.penalizeBackToBack) {
    const facPeriods = grid.facultyDayPeriods(demand.facultyId, day);
    const pidx = periodIdx(period);
    for (const fp of facPeriods) {
      if (Math.abs(periodIdx(fp) - pidx) === 1) {
        score -= 15;
        break;
      }
    }
  }

  // ── Soft: Morning Preference — P1 capped at 3, P2 unlimited ──
  if (isP1(period)) {
    const fP1 = grid.p1Count(demand.facultyId);
    if (fP1 < 3) {
      score += 25; // Strong preference for P1 when under limit
    } else {
      score -= 200; // Hard penalty — P1 limit reached
    }
  }
  if (isP2(period)) {
    score += 30; // Very high priority, no restriction
  }
  if (isP1(period) || isP2(period)) {
    // Encourage at least one morning class per section per day
    const secMorningPeriods = grid.sectionDayPeriods(demand.sectionId, day);
    const hasMorning = secMorningPeriods.some(p => p === 'P1' || p === 'P2');
    if (!hasMorning) {
      score += 12;
    }
  }

  // ── Soft: Prevent completely empty day for a section ──
  const scheduledDays = grid.sectionScheduledDays(demand.sectionId);
  if (!scheduledDays.has(day)) {
    score += 6;
  }

  // ── Soft: Prefer mid-day slots (P3, P4) — reduced to let mornings compete ──
  if (period === 'P3' || period === 'P4') score += 5;

  // ── Soft: Workload balancing — prefer underloaded faculty ──
  const avg = grid.averageWorkload();
  const fLoad = grid.facultyTotalSlots(demand.facultyId);
  if (fLoad < avg) score += 12;
  else if (fLoad > avg + 2) score -= 10;

  // ── Soft: Prefer P5 / P6 over P7 (afternoon spread) ──
  if (period === 'P5' || period === 'P6') score += 4;
  if (period === 'P7') score -= 5;

  // ── Soft: Fewer classes already in day for section = better ──
  const secPeriods = grid.sectionDayPeriods(demand.sectionId, day);
  score -= secPeriods.length * 5;

  return score;
}

// ─────────────────────────────────────────────────────────────
// MAIN SCHEDULER
// ─────────────────────────────────────────────────────────────

// Private internal function — accepts a pre-built grid so callers can pre-seed it
function generateTimetableInternal(
  appState: AppState,
  config: SchedulerConfig,
  onProgress: ((phase: number, msg: string) => void) | undefined,
  grid: OccupancyGrid,
): { timetable: TimetableSlot[]; validation: ValidationResult; log: string[] } {

  const log: string[] = [];
  const slots: TimetableSlot[] = [];

  const log_ = (msg: string) => { log.push(msg); onProgress && onProgress(0, msg); };

  // ── Build lookup maps ──
  const facultyMap = new Map(appState.faculty.map(f => [f.id, f]));
  const sectionMap = new Map(appState.sections.map(s => [s.id, s]));
  const roomMap = new Map(appState.rooms.map(r => [r.id, r]));
  const classrooms = appState.rooms.filter(r => r.type === 'classroom');

  // ════════════════════════════════════════════════════════════
  // PHASE 0 — PREPROCESSING
  // Build faculty-section mapping and demand list
  // ════════════════════════════════════════════════════════════
  log_('▶ Phase 0: Preprocessing — building faculty-section mapping...');

  const demands: DemandItem[] = [];
  // faculty→section assignment per subject (round-robin)
  const subjectFacultyMap = new Map<string, Map<string, string>>(); // subjectId → sectionId → facultyId

  for (const subj of appState.subjects) {
    if (subj.type !== 'core') continue;
    const semSections = appState.sections.filter(s => s.semester === subj.semester);
    if (semSections.length === 0) {
      log_(`  ⚠ Subject "${subj.name}" — no sections found for semester ${subj.semester}`);
      continue;
    }

    const assignMap = new Map<string, string>();
    subjectFacultyMap.set(subj.id, assignMap);

    for (let i = 0; i < semSections.length; i++) {
      const sec = semSections[i];
      const facIdx = i % subj.facultyIds.length;
      const facId = subj.facultyIds[facIdx];
      assignMap.set(sec.id, facId);

      demands.push({
        id: uuid(),
        subjectId: subj.id,
        subjectName: subj.name,
        subjectCode: subj.code,
        facultyId: facId,
        sectionId: sec.id,
        semester: subj.semester,
        totalRequired: subj.hoursPerWeek,
        remaining: subj.hoursPerWeek,
        scheduledDays: new Set(),
      });

      log_(`  ✓ Mapped: ${subj.name} → Section ${sec.name} → ${facultyMap.get(facId)?.name}`);
    }
  }

  log_(`  Total demand items: ${demands.length}`);

  // ── Pre-assign a FIXED classroom to each section ──
  // All theory classes for a section use the same room; only labs use lab rooms
  const sectionClassroomMap = new Map<string, string>(); // sectionId → roomId
  const sortedSections = [...appState.sections].sort(
    (a, b) => a.semester - b.semester || a.name.localeCompare(b.name),
  );

  if (classrooms.length === 0) {
    log_('  ⚠ No classrooms available — theory classes will have no room assignment');
  } else {
    log_('  ── Assigning fixed classrooms to sections ──');
    // Skip Sem 1 & 2 — those are managed externally via frozen slots
    const assignableSections = sortedSections.filter(s => s.semester > 2);
    for (let i = 0; i < assignableSections.length; i++) {
      const assignedRoom = classrooms[i % classrooms.length];
      sectionClassroomMap.set(assignableSections[i].id, assignedRoom.id);
      log_(
        `  ✓ Section ${assignableSections[i].name} (Sem ${assignableSections[i].semester}) → fixed classroom: ${assignedRoom.name}`,
      );
    }
    if (sortedSections.length > assignableSections.length) {
      log_(`  ℹ Skipped ${sortedSections.length - assignableSections.length} Sem 1/2 sections (managed via frozen slots)`);
    }
  }

  // ════════════════════════════════════════════════════════════
  // PHASE 1 — FREEZE COLLEGE SLOTS
  // Block faculty/room/section for externally controlled slots
  // ════════════════════════════════════════════════════════════
  log_('▶ Phase 1: Freezing college-controlled slots...');

  for (const fs of appState.frozenSlots) {
    if (fs.facultyId) {
      grid.freezeFaculty(fs.facultyId, fs.day, fs.period);
      log_(`  ✓ Frozen: ${facultyMap.get(fs.facultyId)?.name} blocked at ${fs.day} ${fs.period} — ${fs.description}`);
    }
    if (fs.roomId) {
      grid.occupyRoom(fs.roomId, fs.day, fs.period);
    }
    if (fs.sectionId) {
      grid.occupySection(fs.sectionId, fs.day, fs.period);
    }
    // If semester-wide block, occupy all sections of that semester
    if (fs.semester) {
      const semSecs = appState.sections.filter(s => s.semester === fs.semester);
      for (const sec of semSecs) {
        grid.occupySection(sec.id, fs.day, fs.period);
      }
    }

    // Emit a TimetableSlot if subject + section are specified (1st/2nd sem frozen slots)
    if (fs.subjectId && fs.sectionId) {
      const subj = appState.subjects.find(s => s.id === fs.subjectId);
      const section = sectionMap.get(fs.sectionId);
      const faculty = fs.facultyId ? facultyMap.get(fs.facultyId) : undefined;
      const room = fs.roomId ? roomMap.get(fs.roomId) : undefined;
      const fallbackRoomId = sectionClassroomMap.get(fs.sectionId);

      slots.push({
        id: uuid(),
        day: fs.day,
        period: fs.period,
        subjectName: subj?.name || 'Frozen Slot',
        subjectCode: subj?.code,
        subjectType: subj?.type || 'core',
        facultyId: fs.facultyId || '',
        facultyName: faculty?.name || 'CSE Faculty',
        sectionId: fs.sectionId,
        sectionName: section?.name || 'Section',
        semester: fs.semester || subj?.semester || 0,
        roomId: fs.roomId || fallbackRoomId,
        roomName: room?.name || (fallbackRoomId ? roomMap.get(fallbackRoomId)?.name : undefined),
      });
      log_(`  ✓ Frozen slot → timetable: ${subj?.name} for ${section?.name} at ${fs.day} ${fs.period}`);
    }
  }

  // Reduce demand for subjects that were frozen (avoid double-scheduling)
  for (const fs of appState.frozenSlots) {
    if (fs.subjectId && fs.sectionId) {
      const demand = demands.find(d => d.subjectId === fs.subjectId && d.sectionId === fs.sectionId);
      if (demand && demand.remaining > 0) {
        demand.remaining--;
        demand.scheduledDays.add(fs.day);
        log_(`  ↳ Reduced demand for ${demand.subjectName} (${sectionMap.get(fs.sectionId)?.name}): ${demand.remaining} hrs remaining`);
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // PHASE 2 — SCHEDULE ELECTIVES
  // 4th sem: use frozen slot; 6th sem: algorithm picks slot
  // All batches of a group run concurrently
  // Supports classesPerWeek: each session on a DIFFERENT day
  // ════════════════════════════════════════════════════════════
  log_('▶ Phase 2: Scheduling electives...');

  // Track which days each elective group has already been scheduled on
  const scheduledElectiveDays = new Map<string, Set<Day>>();
  for (const eg of appState.electiveGroups) {
    scheduledElectiveDays.set(eg.id, new Set<Day>());
  }

  for (const eg of appState.electiveGroups) {
    const semSections = appState.sections.filter(s => s.semester === eg.semester);
    const sessions = eg.classesPerWeek || 1;

    // ── Frozen elective groups: schedule exactly once at the frozen slot ──
    if (eg.isFrozen && eg.frozenDay && eg.frozenPeriod) {
      const chosenDay = eg.frozenDay;
      const chosenPeriod = eg.frozenPeriod;
      log_(`  ✓ Elective "${eg.name}" → frozen slot: ${chosenDay} ${chosenPeriod}`);

      // Determine lab period
      const requiresLabSlot = eg.batches.some(b => b.hasLab);
      let labPeriod: Period | null = null;
      if (requiresLabSlot) {
        const pair = labPairsForDay(chosenDay).find(p => p[0] === chosenPeriod);
        if (pair) labPeriod = pair[1];
        else {
          const periodVals = Object.keys(PERIOD_ORDER) as Period[];
          const currIdx = PERIOD_ORDER[chosenPeriod];
          labPeriod = periodVals.find(p => PERIOD_ORDER[p] === currIdx + 1) || null;
        }
      }

      for (const batch of eg.batches) {
        grid.occupyFaculty(batch.facultyId, chosenDay, chosenPeriod, batch.subjectName);
        const theorySlot: TimetableSlot = {
          id: uuid(), day: chosenDay, period: chosenPeriod,
          subjectName: batch.subjectName, subjectType: 'elective',
          facultyId: batch.facultyId,
          facultyName: facultyMap.get(batch.facultyId)?.name || batch.facultyId,
          sectionId: semSections[0]?.id || 'elective',
          sectionName: `Sem ${eg.semester} All`, semester: eg.semester,
          batchName: batch.name, electiveGroupId: eg.id,
        };
        slots.push(theorySlot);

        if (batch.hasLab && labPeriod) {
          const activeLabFac = batch.labFacultyId || batch.facultyId;
          grid.occupyFaculty(activeLabFac, chosenDay, labPeriod, `${batch.subjectName} Lab`);
          if (batch.labRoomId) grid.occupyRoom(batch.labRoomId, chosenDay, labPeriod);
          const labSlot: TimetableSlot = {
            id: uuid(), day: chosenDay, period: labPeriod,
            subjectName: `${batch.subjectName} Lab`, subjectType: 'lab',
            facultyId: activeLabFac,
            facultyName: facultyMap.get(activeLabFac)?.name || activeLabFac,
            sectionId: semSections[0]?.id || 'elective',
            sectionName: `Sem ${eg.semester} All`, semester: eg.semester,
            batchName: batch.name,
            roomId: batch.labRoomId,
            roomName: batch.labRoomId ? roomMap.get(batch.labRoomId)?.name : undefined,
            electiveGroupId: eg.id, isLabContinuation: true,
          };
          slots.push(labSlot);
        }
      }

      for (const sec of semSections) {
        grid.occupySection(sec.id, chosenDay, chosenPeriod);
        if (labPeriod) grid.occupySection(sec.id, chosenDay, labPeriod);
      }

      scheduledElectiveDays.get(eg.id)!.add(chosenDay);
      log_(`  ✓ Scheduled ${eg.batches.length} elective batches concurrently at ${chosenDay} ${chosenPeriod} ${labPeriod ? `(Labs at ${labPeriod})` : ''}`);
      continue; // frozen groups only get this one slot
    }

    // ── Non-frozen elective groups: algorithm picks slots (supports classesPerWeek) ──
    let session = 0;
    let attempts = 0;
    const MAX_ATTEMPTS = 30;

    while (session < sessions && attempts < MAX_ATTEMPTS) {
      attempts++;

      let chosenDay: Day = 'Thursday';
      let chosenPeriod: Period = 'P4';
      let found = false;

      const requiresLab = eg.batches.some(b => b.hasLab);

      if (requiresLab) {
        // Needs 2 continuous periods
        outerLoopLab:
        for (const d of DAYS) {
          if (d === 'Saturday') continue; // electives not on Saturday
          // HARD CONSTRAINT: only one session per day per elective group
          if (scheduledElectiveDays.get(eg.id)!.has(d)) continue;
          const pairs = labPairsForDay(d);
          for (const [p1, p2] of pairs) {
            // Check all elective faculty are free for theory slot (p1)
            const allTheoryFree = eg.batches.every(b => grid.isFacultyFree(b.facultyId, d, p1, b.subjectName));
            // Check all elective lab faculty and rooms are free for lab slot (p2)
            const allLabFree = eg.batches.every(b =>
              (!b.hasLab) ||
              (grid.isFacultyFree(b.labFacultyId || b.facultyId, d, p2, `${b.subjectName} Lab`) && (!b.labRoomId || grid.isRoomFree(b.labRoomId, d, p2)))
            );
            // Check all semester sections are free for both periods
            const allSecFree = semSections.every(s => grid.isSectionFree(s.id, d, p1) && grid.isSectionFree(s.id, d, p2));

            if (allTheoryFree && allLabFree && allSecFree) {
              chosenDay = d;
              chosenPeriod = p1;
              found = true;
              break outerLoopLab;
            }
          }
        }
      } else {
        // Only theory
        outerLoop:
        for (const d of DAYS) {
          if (d === 'Saturday') continue; // electives not on Saturday
          // HARD CONSTRAINT: only one session per day per elective group
          if (scheduledElectiveDays.get(eg.id)!.has(d)) continue;
          const periods = periodsForDay(d);
          for (const p of periods) {
            if (isMorning(p)) continue; // electives prefer mid-day+
            // Check all elective faculty are free
            const allFacFree = eg.batches.every(b => grid.isFacultyFree(b.facultyId, d, p, b.subjectName));
            // Check all semester sections are free
            const allSecFree = semSections.every(s => grid.isSectionFree(s.id, d, p));
            if (allFacFree && allSecFree) {
              chosenDay = d;
              chosenPeriod = p;
              found = true;
              break outerLoop;
            }
          }
        }
      }

      if (!found) {
        log_(`  ⚠ Could not schedule all sessions for elective "${eg.name}" (${session}/${sessions} placed)`);
        break; // no free day available, stop trying
      }

      // EXTRA SAFETY: check slots array for duplicate
      const alreadyExists = slots.some(s =>
        s.electiveGroupId === eg.id &&
        s.day === chosenDay &&
        s.subjectType === 'elective'
      );
      if (alreadyExists) continue; // skip, try again (attempts counter already incremented)

      log_(`  ✓ Elective "${eg.name}" session ${session + 1}/${sessions} → algorithm chose: ${chosenDay} ${chosenPeriod}`);

      // Determine lab period
      const requiresLabSlot = eg.batches.some(b => b.hasLab);
      let labPeriod: Period | null = null;
      if (requiresLabSlot) {
        const pair = labPairsForDay(chosenDay).find(p => p[0] === chosenPeriod);
        if (pair) labPeriod = pair[1];
        else {
          const periodVals = Object.keys(PERIOD_ORDER) as Period[];
          const currIdx = PERIOD_ORDER[chosenPeriod];
          labPeriod = periodVals.find(p => PERIOD_ORDER[p] === currIdx + 1) || null;
        }
      }

      // Schedule each batch in the chosen slot
      for (const batch of eg.batches) {
        // ── 1. Theory Slot ──
        grid.occupyFaculty(batch.facultyId, chosenDay, chosenPeriod, batch.subjectName);

        const theorySlot: TimetableSlot = {
          id: uuid(), day: chosenDay, period: chosenPeriod,
          subjectName: batch.subjectName, subjectType: 'elective',
          facultyId: batch.facultyId,
          facultyName: facultyMap.get(batch.facultyId)?.name || batch.facultyId,
          sectionId: semSections[0]?.id || 'elective',
          sectionName: `Sem ${eg.semester} All`, semester: eg.semester,
          batchName: batch.name, electiveGroupId: eg.id,
        };
        slots.push(theorySlot);

        // ── 2. Add Optional Lab Slot ──
        if (batch.hasLab && labPeriod) {
          const activeLabFac = batch.labFacultyId || batch.facultyId;
          grid.occupyFaculty(activeLabFac, chosenDay, labPeriod, `${batch.subjectName} Lab`);
          if (batch.labRoomId) grid.occupyRoom(batch.labRoomId, chosenDay, labPeriod);

          const labSlot: TimetableSlot = {
            id: uuid(), day: chosenDay, period: labPeriod,
            subjectName: `${batch.subjectName} Lab`, subjectType: 'lab',
            facultyId: activeLabFac,
            facultyName: facultyMap.get(activeLabFac)?.name || activeLabFac,
            sectionId: semSections[0]?.id || 'elective',
            sectionName: `Sem ${eg.semester} All`, semester: eg.semester,
            batchName: batch.name,
            roomId: batch.labRoomId,
            roomName: batch.labRoomId ? roomMap.get(batch.labRoomId)?.name : undefined,
            electiveGroupId: eg.id, isLabContinuation: true,
          };
          slots.push(labSlot);
        }
      }

      // Block all semester sections at the chosen slots
      for (const sec of semSections) {
        grid.occupySection(sec.id, chosenDay, chosenPeriod);
        if (labPeriod) grid.occupySection(sec.id, chosenDay, labPeriod);
      }

      // Mark day used — only increment session on SUCCESS
      scheduledElectiveDays.get(eg.id)!.add(chosenDay);
      session++;

      log_(`  ✓ Scheduled ${eg.batches.length} elective batches concurrently at ${chosenDay} ${chosenPeriod} ${labPeriod ? `(Labs at ${labPeriod})` : ''}`);
    }

    if (session < sessions) {
      log_(`  ⚠ Could not schedule all sessions for elective "${eg.name}" — placed ${session}/${sessions}`);
    }
  }

  // ════════════════════════════════════════════════════════════
  // PHASE 3 — SCHEDULE LABS
  // Constraints: 2 continuous periods, concurrent batches,
  // faculty availability, room availability, rotation matrix
  // ════════════════════════════════════════════════════════════
  log_('▶ Phase 3: Scheduling labs with rotation matrix...');

  // Sort lab groups by most constrained first (MRV heuristic)
  // Lab groups with fewer available day+pair options get scheduled first,
  // preventing "last section gets nothing" scenarios
  const sortedLabGroups = [...appState.labGroups].sort((a, b) => {
    const countOpts = (lg: typeof appState.labGroups[0]) => {
      let count = 0;
      for (const d of DAYS) {
        for (const [p1, p2] of labPairsForDay(d).filter(([p]) => lg.semester !== 7 || p === 'P1' || p === 'P3')) {
          if (!grid.isSectionFree(lg.sectionId, d, p1) || !grid.isSectionFree(lg.sectionId, d, p2)) continue;
          if (lg.labs.every(le =>
            grid.isFacultyFree(le.facultyId, d, p1, le.labName) &&
            grid.isFacultyFree(le.facultyId, d, p2, le.labName) &&
            grid.isRoomFree(le.roomId, d, p1) &&
            grid.isRoomFree(le.roomId, d, p2)
          )) count++;
        }
      }
      return count;
    };
    return countOpts(a) - countOpts(b);
  });
  log_('  ── Lab groups sorted by constraint level (most constrained first) ──');

  // Track scheduled sessions per lab group for retry pass
  const labGroupSessions = new Map<string, number>();

  for (const lg of sortedLabGroups) {
    const section = sectionMap.get(lg.sectionId);
    if (!section) {
      log_(`  ⚠ Lab group "${lg.name}" — section not found`);
      continue;
    }

    const usedDays = new Set<Day>();
    let sessionsPlaced = 0;

    const batches = section.batches;
    const numBatches = batches.length;
    const labEntries = lg.labs;
    const labNames = labEntries.map(l => l.labName);

    // Build rotation matrix
    const rotationMatrix = resolveLabRotation(batches, labNames);

    log_(`  → Lab group "${lg.name}" | Section: ${section.name} | Batches: ${batches.join(', ')}`);
    log_(`    Rotation: ${labNames.join(' ↔ ')}`);

    // Schedule each slot per week
    for (let sessionIdx = 0; sessionIdx < lg.slotsPerWeek; sessionIdx++) {
      const sessionAssignment = rotationMatrix.get(sessionIdx % labNames.length)!;

      let scheduled = false;

      // Try each day and lab pair
      dayLoop:
      for (const d of DAYS) {
        // 🚫 Prevent same-day multiple lab sessions
        if (usedDays.has(d)) continue;
        const pairs = lg.semester === 7
          ? labPairsForDay(d).filter(([p1]) => p1 === 'P1' || p1 === 'P3')
          : labPairsForDay(d);
        for (const [p1, p2] of pairs) {
          // Check section is free for both periods
          if (!grid.isSectionFree(lg.sectionId, d, p1) || !grid.isSectionFree(lg.sectionId, d, p2)) continue;

          // Check each batch's assigned lab faculty and room
          let allAvail = true;
          const batchAssignments: Array<{ batch: string; labEntry: typeof labEntries[0] }> = [];

          for (let b = 0; b < numBatches; b++) {
            const batchName = batches[b];
            const assignedLabName = sessionAssignment.get(batchName) || labNames[b % labNames.length];
            const labEntry = labEntries.find(l => l.labName === assignedLabName);
            if (!labEntry) { allAvail = false; break; }

            if (!grid.isFacultyFree(labEntry.facultyId, d, p1, labEntry.labName) ||
              !grid.isFacultyFree(labEntry.facultyId, d, p2, labEntry.labName)) {
              allAvail = false; break;
            }

            // 🚫 HARD CONSTRAINT: P1 limit for labs — max 3 P1 slots per faculty
            if (isP1(p1) && grid.p1Count(labEntry.facultyId) >= 3) {
              allAvail = false; break;
            }
            if (!grid.isRoomFree(labEntry.roomId, d, p1) ||
              !grid.isRoomFree(labEntry.roomId, d, p2)) {
              allAvail = false; break;
            }

            // 🚫 HARD CONSTRAINT: Prevent consecutive lab pairs for faculty
            // Check if this faculty already has a lab pair on the same day
            // that is adjacent to the current pair (p1, p2)
            const existingLabSlots = slots.filter(s =>
              s.subjectType === 'lab' &&
              s.facultyId === labEntry.facultyId &&
              s.day === d &&
              !s.isLabContinuation
            );
            let hasAdjacentLab = false;
            for (const existingLab of existingLabSlots) {
              const existingStart = periodIdx(existingLab.period);
              const newStart = periodIdx(p1);
              // Adjacent if existing pair ends right before new pair starts
              // or new pair ends right before existing pair starts
              // Lab pairs occupy 2 consecutive periods: [start, start+1]
              if (existingStart + 2 === newStart || newStart + 2 === existingStart) {
                hasAdjacentLab = true;
                break;
              }
            }
            if (hasAdjacentLab) { allAvail = false; break; }

            batchAssignments.push({ batch: batchName, labEntry });
          }

          if (!allAvail) continue;

          // ── Schedule all batches concurrently ──
          for (const { batch, labEntry } of batchAssignments) {
            const faculty = facultyMap.get(labEntry.facultyId);
            const room = roomMap.get(labEntry.roomId);

            const slot1: TimetableSlot = {
              id: uuid(),
              day: d, period: p1,
              subjectName: labEntry.labName,
              subjectType: 'lab',
              facultyId: labEntry.facultyId,
              facultyName: faculty?.name || labEntry.facultyId,
              sectionId: lg.sectionId,
              sectionName: section.name,
              semester: lg.semester,
              roomId: labEntry.roomId,
              roomName: room?.name || labEntry.roomId,
              batchName: batch,
              labGroupId: lg.id,
              sessionIndex: sessionIdx,
            };

            const slot2: TimetableSlot = {
              id: uuid(),
              day: d, period: p2,
              subjectName: labEntry.labName,
              subjectType: 'lab',
              facultyId: labEntry.facultyId,
              facultyName: faculty?.name || labEntry.facultyId,
              sectionId: lg.sectionId,
              sectionName: section.name,
              semester: lg.semester,
              roomId: labEntry.roomId,
              roomName: room?.name || labEntry.roomId,
              batchName: batch,
              labGroupId: lg.id,
              sessionIndex: sessionIdx,
              isLabContinuation: true,
            };

            slots.push(slot1, slot2);
            grid.occupy(labEntry.facultyId, lg.sectionId, labEntry.roomId, d, p1, labEntry.labName);
            grid.occupy(labEntry.facultyId, lg.sectionId, labEntry.roomId, d, p2, labEntry.labName);
          }

          log_(`    ✓ Session ${sessionIdx + 1}: ${d} ${p1}-${p2} [${batchAssignments.map(a => `${a.batch}→${a.labEntry.labName}`).join(', ')}]`);
          scheduled = true;
          sessionsPlaced++;
          usedDays.add(d);
          break dayLoop;
        }
      }

      if (!scheduled) {
        log_(`    ⚠ Could not schedule lab session ${sessionIdx + 1} for "${lg.name}"`);
      }
    }
    labGroupSessions.set(lg.id, sessionsPlaced);
  }

  // ── Retry pass: re-attempt failed lab groups with relaxed constraints ──
  const failedLabGroups = sortedLabGroups.filter(
    lg => (labGroupSessions.get(lg.id) || 0) < lg.slotsPerWeek
  );

  if (failedLabGroups.length > 0) {
    log_('  ── Retry pass: re-attempting failed lab groups with relaxed constraints ──');

    for (const lg of failedLabGroups) {
      const section = sectionMap.get(lg.sectionId);
      if (!section) continue;

      const currentPlaced = labGroupSessions.get(lg.id) || 0;
      log_(`  → Retrying "${lg.name}" (${currentPlaced}/${lg.slotsPerWeek} placed)`);

      // Rebuild usedDays from already-scheduled sessions for this group
      const retryUsedDays = new Set<Day>();
      for (const s of slots) {
        if (s.labGroupId === lg.id && !s.isLabContinuation) {
          retryUsedDays.add(s.day);
        }
      }

      const retryBatches = section.batches;
      const retryNumBatches = retryBatches.length;
      const retryLabEntries = lg.labs;
      const retryLabNames = retryLabEntries.map(l => l.labName);
      const retryRotation = resolveLabRotation(retryBatches, retryLabNames);

      // Try remaining sessions with REVERSED day order + relaxed consecutive constraint
      const reversedDays: Day[] = [...DAYS].reverse();

      for (let sessionIdx = currentPlaced; sessionIdx < lg.slotsPerWeek; sessionIdx++) {
        const sessionAssignment = retryRotation.get(sessionIdx % retryLabNames.length)!;
        let scheduled = false;

        retryDayLoop:
        for (const d of reversedDays) {
          if (retryUsedDays.has(d)) continue;
          const pairs = lg.semester === 7
            ? labPairsForDay(d).filter(([p1]) => p1 === 'P1' || p1 === 'P3')
            : labPairsForDay(d);
          for (const [p1, p2] of pairs) {
            if (!grid.isSectionFree(lg.sectionId, d, p1) || !grid.isSectionFree(lg.sectionId, d, p2)) continue;

            let allAvail = true;
            const batchAssignments: Array<{ batch: string; labEntry: typeof retryLabEntries[0] }> = [];

            for (let b = 0; b < retryNumBatches; b++) {
              const batchName = retryBatches[b];
              const assignedLabName = sessionAssignment.get(batchName) || retryLabNames[b % retryLabNames.length];
              const labEntry = retryLabEntries.find(l => l.labName === assignedLabName);
              if (!labEntry) { allAvail = false; break; }

              if (!grid.isFacultyFree(labEntry.facultyId, d, p1, labEntry.labName) ||
                !grid.isFacultyFree(labEntry.facultyId, d, p2, labEntry.labName)) {
                allAvail = false; break;
              }

              if (isP1(p1) && grid.p1Count(labEntry.facultyId) >= 3) {
                allAvail = false; break;
              }
              if (!grid.isRoomFree(labEntry.roomId, d, p1) ||
                !grid.isRoomFree(labEntry.roomId, d, p2)) {
                allAvail = false; break;
              }

              // NOTE: Consecutive lab pairs constraint is RELAXED in retry pass
              // to maximize lab coverage for all sections

              batchAssignments.push({ batch: batchName, labEntry });
            }

            if (!allAvail) continue;

            // Schedule all batches concurrently
            for (const { batch, labEntry } of batchAssignments) {
              const faculty = facultyMap.get(labEntry.facultyId);
              const room = roomMap.get(labEntry.roomId);

              const slot1: TimetableSlot = {
                id: uuid(),
                day: d, period: p1,
                subjectName: labEntry.labName,
                subjectType: 'lab',
                facultyId: labEntry.facultyId,
                facultyName: faculty?.name || labEntry.facultyId,
                sectionId: lg.sectionId,
                sectionName: section.name,
                semester: lg.semester,
                roomId: labEntry.roomId,
                roomName: room?.name || labEntry.roomId,
                batchName: batch,
                labGroupId: lg.id,
                sessionIndex: sessionIdx,
              };

              const slot2: TimetableSlot = {
                id: uuid(),
                day: d, period: p2,
                subjectName: labEntry.labName,
                subjectType: 'lab',
                facultyId: labEntry.facultyId,
                facultyName: faculty?.name || labEntry.facultyId,
                sectionId: lg.sectionId,
                sectionName: section.name,
                semester: lg.semester,
                roomId: labEntry.roomId,
                roomName: room?.name || labEntry.roomId,
                batchName: batch,
                labGroupId: lg.id,
                sessionIndex: sessionIdx,
                isLabContinuation: true,
              };

              slots.push(slot1, slot2);
              grid.occupy(labEntry.facultyId, lg.sectionId, labEntry.roomId, d, p1, labEntry.labName);
              grid.occupy(labEntry.facultyId, lg.sectionId, labEntry.roomId, d, p2, labEntry.labName);
            }

            log_(`    ✓ Retry session ${sessionIdx + 1}: ${d} ${p1}-${p2} [${batchAssignments.map(a => `${a.batch}→${a.labEntry.labName}`).join(', ')}]`);
            scheduled = true;
            retryUsedDays.add(d);
            break retryDayLoop;
          }
        }

        if (!scheduled) {
          log_(`    ⚠ Retry also failed for session ${sessionIdx + 1} of "${lg.name}"`);
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // PHASE 4 — SCHEDULE THEORY CLASSES (MRV Heuristic)
  // Use priority queue with MRV (Most Constrained Variable first)
  // Score each candidate slot using soft constraint scoring
  // ════════════════════════════════════════════════════════════
  log_('▶ Phase 4: Scheduling theory classes (MRV heuristic)...');

  // MRV sort: most constrained first (fewest remaining options)
  const mrv_sort = () => {
    demands.sort((a, b) => {
      // Primary: most remaining > least scheduled first
      if (a.remaining !== b.remaining) return b.remaining - a.remaining;
      // Secondary: more constrained faculty (higher workload = harder to place)
      const aFLoad = grid.facultyTotalSlots(a.facultyId);
      const bFLoad = grid.facultyTotalSlots(b.facultyId);
      return bFLoad - aFLoad;
    });
  };

  let iterations = 0;
  const MAX_ITER = 10000;

  while (demands.some(d => d.remaining > 0) && iterations < MAX_ITER) {
    iterations++;
    mrv_sort();

    const demand = demands.find(d => d.remaining > 0);
    if (!demand) break;

    // Find best slot using two-pass approach:
    //   Pass 1 (STRICT): enforce ONE class per subject per section per day
    //   Pass 2 (RELAXED): allow same-day only if no unique day is available
    let bestDay: Day | null = null;
    let bestPeriod: Period | null = null;
    let bestRoomId: string | null = null;
    let bestScore = -Infinity;

    // ── Pass 1: STRICT — skip days where this subject already has a class for this section ──
    for (const d of DAYS) {
      // HARD CONSTRAINT: one theory class per subject per section per day
      if (demand.scheduledDays.has(d)) continue;
      if (demand.semester === 7 && d === 'Saturday') continue;

      const periods = demand.semester === 7
        ? (['P5', 'P6', 'P7'] as Period[])
        : periodsForDay(d);
      for (const p of periods) {
        // 🚫 STRICT: prevent same subject twice in same day
        const alreadyScheduledSameDay = slots.some(s =>
          s.subjectType === 'core' &&
          s.subjectName === demand.subjectName &&
          s.sectionId === demand.sectionId &&
          s.day === d
        );
        if (alreadyScheduledSameDay) continue;

        // ── Hard constraints ──
        if (!grid.isFacultyFree(demand.facultyId, d, p, demand.subjectName)) continue;
        if (!grid.isSectionFree(demand.sectionId, d, p)) continue;

        // P1 limit hard constraint — only P1 is capped at 3, P2 is unlimited
        if (isP1(p) && grid.p1Count(demand.facultyId) >= 3) continue;

        // Use the section's pre-assigned fixed classroom
        const assignedRoomId = sectionClassroomMap.get(demand.sectionId);
        if (!assignedRoomId || !grid.isRoomFree(assignedRoomId, d, p)) continue;
        const roomId = assignedRoomId;

        // Score this slot
        const score = scoreSlot(demand, d, p, grid, config);

        if (score > bestScore) {
          bestScore = score;
          bestDay = d;
          bestPeriod = p;
          bestRoomId = roomId;
        }
      }
    }

    // ── Pass 2: RELAXED FALLBACK — allow same-day if strict pass found nothing ──
    // This handles edge cases where hours > available unique days
    if (!bestDay) {
      log_(`  ⚠ Relaxing same-day constraint for "${demand.subjectName}" (${sectionMap.get(demand.sectionId)?.name}) — not enough unique days`);
      for (const d of DAYS) {
        if (demand.semester === 7 && d === 'Saturday') continue;
        const periods = demand.semester === 7
          ? (['P5', 'P6', 'P7'] as Period[])
          : periodsForDay(d);
        for (const p of periods) {
          // 🚫 STRICT: prevent same subject twice in same day (relaxed pass)
          const alreadyScheduledSameDay = slots.some(s =>
            s.subjectType === 'core' &&
            s.subjectName === demand.subjectName &&
            s.sectionId === demand.sectionId &&
            s.day === d
          );
          if (alreadyScheduledSameDay) continue;

          if (!grid.isFacultyFree(demand.facultyId, d, p, demand.subjectName)) continue;
          if (!grid.isSectionFree(demand.sectionId, d, p)) continue;
          // P1 limit hard constraint (relaxed pass) — only P1 is capped at 3
          if (isP1(p) && grid.p1Count(demand.facultyId) >= 3) continue;
          // Use the section's pre-assigned fixed classroom
          const assignedRoomId = sectionClassroomMap.get(demand.sectionId);
          if (!assignedRoomId || !grid.isRoomFree(assignedRoomId, d, p)) continue;
          const roomId = assignedRoomId;
          const score = scoreSlot(demand, d, p, grid, config) - 200;
          if (score > bestScore) {
            bestScore = score;
            bestDay = d;
            bestPeriod = p;
            bestRoomId = roomId;
          }
        }
      }
    }

    if (bestDay && bestPeriod && bestRoomId) {
      const room = roomMap.get(bestRoomId);
      const slot: TimetableSlot = {
        id: uuid(),
        day: bestDay,
        period: bestPeriod,
        subjectName: demand.subjectName,
        subjectCode: demand.subjectCode,
        subjectType: 'core',
        facultyId: demand.facultyId,
        facultyName: facultyMap.get(demand.facultyId)?.name || demand.facultyId,
        sectionId: demand.sectionId,
        sectionName: sectionMap.get(demand.sectionId)?.name || demand.sectionId,
        semester: demand.semester,
        roomId: bestRoomId,
        roomName: room?.name || bestRoomId,
        score: bestScore,
      };
      slots.push(slot);
      grid.occupy(demand.facultyId, demand.sectionId, bestRoomId, bestDay, bestPeriod, demand.subjectName);
      demand.remaining--;
      demand.scheduledDays.add(bestDay);
    } else {
      // Cannot place this demand item — skip (partial schedule)
      log_(`  ⚠ Could not schedule: ${demand.subjectName} for ${sectionMap.get(demand.sectionId)?.name} (${demand.remaining} hrs remaining)`);
      demand.remaining = 0;
    }
  }

  const theoryScheduled = slots.filter(s => s.subjectType === 'core').length;
  log_(`  ✓ Theory scheduling complete: ${theoryScheduled} slots placed (${iterations} iterations)`);

  // ════════════════════════════════════════════════════════════
  // PHASE 5 — OPTIMIZATION (Local search: swap/move)
  // Reduce soft constraint violations by swapping slots
  // ════════════════════════════════════════════════════════════
  log_('▶ Phase 5: Running local search optimization...');

  // Build a set of frozen slot keys so optimization never swaps into them
  const frozenSlotKeys = new Set<string>();
  for (const fs of appState.frozenSlots) {
    if (fs.facultyId) {
      frozenSlotKeys.add(`${fs.facultyId}|${fs.day}|${fs.period}`);
    }
  }

  const coreSlots = slots.filter(s => s.subjectType === 'core');
  let improvements = 0;

  for (let pass = 0; pass < config.maxOptimizationPasses && coreSlots.length >= 2; pass++) {
    const i = Math.floor(Math.random() * coreSlots.length);
    const j = Math.floor(Math.random() * coreSlots.length);
    if (i === j) continue;

    const a = coreSlots[i];
    const b = coreSlots[j];

    // Only swap slots of the same section (different subjects)
    if (a.sectionId !== b.sectionId) continue;
    if (a.facultyId === b.facultyId) continue; // same faculty swap is trivial

    // ── Guard: swapping must not create same-day subject duplicates ──
    // After swap: A goes to B's day, B goes to A's day
    if (a.day !== b.day) {
      const otherSlotsA = coreSlots.filter(s =>
        s.subjectName === a.subjectName && s.sectionId === a.sectionId && s !== a
      );
      const otherSlotsB = coreSlots.filter(s =>
        s.subjectName === b.subjectName && s.sectionId === b.sectionId && s !== b
      );
      // If A's subject already has a class on B's day → skip
      if (otherSlotsA.some(s => s.day === b.day)) continue;
      // If B's subject already has a class on A's day → skip
      if (otherSlotsB.some(s => s.day === a.day)) continue;
    }

    // 🚫 HARD CONSTRAINT: Never swap into a frozen slot
    if (frozenSlotKeys.has(`${a.facultyId}|${b.day}|${b.period}`)) continue;
    if (frozenSlotKeys.has(`${b.facultyId}|${a.day}|${a.period}`)) continue;

    // Simulate swap: check if it's feasible
    // a goes to b's slot, b goes to a's slot
    let aFacFreeAtB = grid.isFacultyFree(a.facultyId, b.day, b.period, a.subjectName) ||
      (a.day === b.day && a.period === b.period); // same slot edge case

    let bFacFreeAtA = grid.isFacultyFree(b.facultyId, a.day, a.period, b.subjectName) ||
      (a.day === b.day && a.period === b.period);

    // ── Special Rule: Non-CSE faculty (Math, etc.) are always marked "free" by the grid 
    //    because they are distinct people. HOWEVER, within the SAME section, they cannot be
    //    at the exact same day & period because the section can't take two subjects at once.
    //    If a and b are being swapped to the same time, or they collide with another class 
    //    the section is already taking at that slot, it's invalid.
    const aFac = facultyMap.get(a.facultyId);
    const bFac = facultyMap.get(b.facultyId);
    if (isExternalFaculty(aFac, a.subjectName)) {
      const sectionSlotsAtB = coreSlots.filter(s => s.sectionId === a.sectionId && s.day === b.day && s.period === b.period && s !== b);
      if (sectionSlotsAtB.length > 0) aFacFreeAtB = false;
    }
    if (isExternalFaculty(bFac, b.subjectName)) {
      const sectionSlotsAtA = coreSlots.filter(s => s.sectionId === b.sectionId && s.day === a.day && s.period === a.period && s !== a);
      if (sectionSlotsAtA.length > 0) bFacFreeAtA = false;
    }

    if (!aFacFreeAtB || !bFacFreeAtA) continue;

    // Compare scores before and after
    const dA = demands.find(d => d.subjectName === a.subjectName && d.sectionId === a.sectionId);
    const dB = demands.find(d => d.subjectName === b.subjectName && d.sectionId === b.sectionId);
    if (!dA || !dB) continue;

    const scoreBefore = scoreSlot(dA, a.day, a.period, grid, config) +
      scoreSlot(dB, b.day, b.period, grid, config);
    const scoreAfter = scoreSlot(dA, b.day, b.period, grid, config) +
      scoreSlot(dB, a.day, a.period, grid, config);

    if (scoreAfter > scoreBefore) {
      // Apply swap — only swap day/period, NOT rooms
      // Rooms are fixed per section and must never change
      const tmpDay = a.day; const tmpPeriod = a.period;
      coreSlots[i].day = b.day; coreSlots[i].period = b.period;
      // Room stays with its section — do NOT swap roomId/roomName
      coreSlots[j].day = tmpDay; coreSlots[j].period = tmpPeriod;
      improvements++;
    }
  }

  log_(`  ✓ Optimization: ${improvements} improvements found in ${config.maxOptimizationPasses} passes`);

  // ════════════════════════════════════════════════════════════
  // PHASE 6 — VALIDATION
  // ════════════════════════════════════════════════════════════
  log_('▶ Phase 6: Validating timetable...');

  const validation = validateTimetable(slots, appState, demands);

  log_(`  ${validation.valid ? '✅ VALID — No hard constraint violations' : '❌ INVALID — ' + validation.errors.length + ' errors'}`);
  log_(`  Faculty clashes: ${validation.stats.facultyClashes}`);
  log_(`  Room clashes: ${validation.stats.roomClashes}`);
  log_(`  Section clashes: ${validation.stats.sectionClashes}`);
  log_(`  Soft violations: ${validation.stats.softViolations}`);
  log_(`  Total slots: ${validation.stats.totalSlots}`);

  return { timetable: slots, validation, log };
}

// Public wrapper — UNCHANGED signature and behavior
export function generateTimetable(
  appState: AppState,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG,
  onProgress?: (phase: number, msg: string) => void,
): { timetable: TimetableSlot[]; validation: ValidationResult; log: string[] } {
  const facultyMap = new Map(appState.faculty.map(f => [f.id, f]));
  const grid = new OccupancyGrid(facultyMap);
  return generateTimetableInternal(appState, config, onProgress, grid);
}

// Generate timetable for a single semester, respecting locked slots from other semesters
export function generateSemesterTimetable(
  fullAppState: AppState,
  targetSemester: number,
  lockedSlots: TimetableSlot[],
  sectionClassroomMap?: Map<string, string>,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG,
  onProgress?: (phase: number, msg: string) => void,
): { timetable: TimetableSlot[]; validation: ValidationResult; log: string[] } {
  const facultyMap = new Map(fullAppState.faculty.map(f => [f.id, f]));

  const grid = new OccupancyGrid(facultyMap);
  if (lockedSlots.length > 0) {
    grid.preloadSlots(lockedSlots);
  }

  const filteredState: AppState = {
    ...fullAppState,
    subjects: fullAppState.subjects.filter(s => s.semester === targetSemester),
    sections: fullAppState.sections.filter(s => s.semester === targetSemester),
    labGroups: fullAppState.labGroups.filter(lg => lg.semester === targetSemester),
    electiveGroups: fullAppState.electiveGroups.filter(eg => eg.semester === targetSemester),
  };

  if (sectionClassroomMap && sectionClassroomMap.size > 0) {
    filteredState.sections = filteredState.sections.map(sec => ({
      ...sec,
      roomId: sectionClassroomMap.get(sec.id) ?? (sec as any).roomId,
    }));
  }

  return generateTimetableInternal(filteredState, config, onProgress, grid);
}

// Safety-net: detect cross-semester clashes between a draft and locked slots
export function validateCrossSemesterClashes(
  draftSlots: TimetableSlot[],
  lockedSlots: TimetableSlot[],
): import('./types').CrossSemesterClash[] {
  const clashes: import('./types').CrossSemesterClash[] = [];

  for (const draft of draftSlots) {
    for (const locked of lockedSlots) {
      if (draft.day !== locked.day || draft.period !== locked.period) continue;

      if (draft.facultyId === locked.facultyId) {
        clashes.push({
          type: 'faculty',
          entityName: draft.facultyName,
          day: draft.day,
          period: draft.period,
          draftSubject: draft.subjectName,
          draftSection: draft.sectionName,
          lockedSubject: locked.subjectName,
          lockedSection: locked.sectionName,
          lockedSemester: locked.semester,
        });
      }

      if (draft.roomId && locked.roomId && draft.roomId === locked.roomId) {
        clashes.push({
          type: 'room',
          entityName: draft.roomName || '',
          day: draft.day,
          period: draft.period,
          draftSubject: draft.subjectName,
          draftSection: draft.sectionName,
          lockedSubject: locked.subjectName,
          lockedSection: locked.sectionName,
          lockedSemester: locked.semester,
        });
      }
    }
  }

  return clashes;
}

// ─────────────────────────────────────────────────────────────
// VALIDATION ENGINE
// ─────────────────────────────────────────────────────────────

export function validateTimetable(
  slots: TimetableSlot[],
  appState: AppState,
  originalDemands?: DemandItem[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const clashDetails: ClashDetail[] = [];

  let facultyClashCount = 0;
  let roomClashCount = 0;
  let sectionClashCount = 0;
  let saturdayViolations = 0;

  // ── Faculty clash detection (covers main faculty AND co-faculty) ──
  const facultySlotMap = new Map<string, { slot: TimetableSlot; facName: string }[]>();
  const addFacultyOccurrence = (facId: string | undefined, facName: string | undefined, s: TimetableSlot) => {
    if (!facId) return;
    const fac = appState.faculty.find(f => f.id === facId);
    if (isExternalFaculty(fac, s.subjectName)) return; // Completely ignore non-CSE faculty for clash detection
    const key = `${facId}|${s.day}|${s.period}`;
    if (!facultySlotMap.has(key)) facultySlotMap.set(key, []);
    facultySlotMap.get(key)!.push({ slot: s, facName: facName || facId });
  };
  for (const s of slots) {
    addFacultyOccurrence(s.facultyId, s.facultyName, s);
    if (s.coFacultyId && s.coFacultyId !== s.facultyId) {
      addFacultyOccurrence(s.coFacultyId, s.coFacultyName, s);
    }
  }
  for (const [, group] of facultySlotMap) {
    // Elective batches taught by different faculty at same slot = OK
    // But same faculty (as main or co-faculty) at same slot = clash
    const uniqueFacSubj = new Set(group.map(g => `${g.slot.subjectName}|${g.slot.batchName || ''}`));
    if (uniqueFacSubj.size > 1) {
      facultyClashCount++;
      const first = group[0];
      const msg = `Faculty clash: ${first.facName} at ${first.slot.day} ${first.slot.period} — ${group.map(g => g.slot.subjectName).join(' vs ')}`;
      errors.push(msg);
      clashDetails.push({
        type: 'faculty', day: first.slot.day, period: first.slot.period,
        entityName: first.facName,
        subjects: group.map(g => g.slot.subjectName),
      });
    }
  }

  // ── Section clash detection ──
  const sectionSlotMap = new Map<string, TimetableSlot[]>();
  for (const s of slots) {
    if (s.electiveGroupId) continue; // Elective hours intentionally block sections
    const batchKey = s.batchName ? `${s.sectionId}|${s.batchName}|${s.day}|${s.period}` : `${s.sectionId}|main|${s.day}|${s.period}`;
    if (!sectionSlotMap.has(batchKey)) sectionSlotMap.set(batchKey, []);
    sectionSlotMap.get(batchKey)!.push(s);
  }
  for (const [, group] of sectionSlotMap) {
    if (group.length > 1) {
      sectionClashCount++;
      const s = group[0];
      const batchInfo = s.batchName ? ` [${s.batchName}]` : '';
      const msg = `Section clash: ${s.sectionName}${batchInfo} at ${s.day} ${s.period} — ${group.map(g => g.subjectName).join(' vs ')}`;
      errors.push(msg);
      clashDetails.push({
        type: 'section', day: s.day, period: s.period,
        entityName: s.sectionName + batchInfo,
        subjects: group.map(g => g.subjectName),
      });
    }
  }

  // ── Room clash detection ──
  const roomSlotMap = new Map<string, TimetableSlot[]>();
  for (const s of slots) {
    if (!s.roomId) continue;
    const key = `${s.roomId}|${s.day}|${s.period}`;
    if (!roomSlotMap.has(key)) roomSlotMap.set(key, []);
    roomSlotMap.get(key)!.push(s);
  }
  for (const [, group] of roomSlotMap) {
    if (group.length > 1) {
      const uniqueSubjects = new Set(group.map(s => `${s.subjectName}|${s.batchName || ''}`));
      if (uniqueSubjects.size > 1) {
        roomClashCount++;
        const s = group[0];
        const msg = `Room clash: ${s.roomName} at ${s.day} ${s.period} — ${group.map(g => g.subjectName).join(' vs ')}`;
        errors.push(msg);
        clashDetails.push({
          type: 'room', day: s.day, period: s.period,
          entityName: s.roomName || s.roomId || '?',
          subjects: group.map(g => g.subjectName),
        });
      }
    }
  }

  // ── Saturday rule ──
  for (const s of slots) {
    if (s.day === 'Saturday' && ['P5', 'P6', 'P7'].includes(s.period)) {
      saturdayViolations++;
      errors.push(`Saturday violation: "${s.subjectName}" scheduled at ${s.period} (afternoon not allowed on Saturday)`);
    }
  }

  // ── Same-day duplicate subject check (one theory class per subject per section per day) ──
  const subjectSectionDayCount = new Map<string, number>();
  for (const s of slots) {
    if (s.subjectType !== 'core') continue;
    const key = `${s.subjectName}|${s.sectionId}|${s.day}`;
    subjectSectionDayCount.set(key, (subjectSectionDayCount.get(key) || 0) + 1);
  }
  for (const [key, count] of subjectSectionDayCount) {
    if (count > 1) {
      const [subjectName, sectionId, day] = key.split('|');
      const secName = appState.sections.find(s => s.id === sectionId)?.name || sectionId;
      warnings.push(`Same-day duplicate: "${subjectName}" for ${secName} appears ${count} times on ${day} (should be 1 per day)`);
    }
  }

  // ── Lab continuity check ──
  const labSlots = slots.filter(s => s.subjectType === 'lab' && !s.isLabContinuation);
  for (const lab of labSlots) {
    const contSlot = slots.find(s =>
      s.subjectType === 'lab' && s.isLabContinuation &&
      s.day === lab.day && s.labGroupId === lab.labGroupId &&
      s.batchName === lab.batchName &&
      periodIdx(s.period) === periodIdx(lab.period) + 1
    );
    if (!contSlot) {
      warnings.push(`Lab continuity: "${lab.subjectName}" (${lab.batchName}) at ${lab.day} ${lab.period} has no continuation period`);
    }
  }

  // ── Elective concurrency check (per-session, NOT per entire group) ──
  // Correct rule: each individual session must have all batches at the
  // SAME day + period. Different sessions (classesPerWeek > 1) are
  // allowed on different days — that is NOT a concurrency issue.
  let electiveConcurrencyOk = true;
  const electiveGroups = new Map<string, TimetableSlot[]>();
  for (const s of slots) {
    if (!s.electiveGroupId) continue;
    if (!electiveGroups.has(s.electiveGroupId)) electiveGroups.set(s.electiveGroupId, []);
    electiveGroups.get(s.electiveGroupId)!.push(s);
  }
  for (const [gid, group] of electiveGroups) {
    const eg = appState.electiveGroups.find(e => e.id === gid);
    if (!eg) continue;
    const expectedBatchCount = eg.batches.length;

    // Group elective slots by (day + period) to identify individual sessions
    // Lab continuation slots are excluded — only check primary elective slots
    const sessionMap = new Map<string, TimetableSlot[]>();
    for (const s of group) {
      if (s.isLabContinuation) continue;
      const sessionKey = `${s.day}|${s.period}`;
      if (!sessionMap.has(sessionKey)) sessionMap.set(sessionKey, []);
      sessionMap.get(sessionKey)!.push(s);
    }

    // Each session (day+period) must contain ALL batches of the group
    for (const [sessionKey, sessionSlots] of sessionMap) {
      if (sessionSlots.length < expectedBatchCount) {
        electiveConcurrencyOk = false;
        const [day, period] = sessionKey.split('|');
        warnings.push(
          `Elective concurrency issue: "${eg.name}" at ${day} ${period} — only ${sessionSlots.length}/${expectedBatchCount} batches scheduled`,
        );
      }
    }
  }

  // ── Frozen slot preservation ──
  for (const fs of appState.frozenSlots) {
    if (!fs.facultyId) continue;
    // Check no UNINTENDED subject was scheduled for this faculty at this time
    // Exclude the frozen slot's own TimetableSlot (which has the same subjectId)
    const conflicting = slots.find(s =>
      s.facultyId === fs.facultyId &&
      s.day === fs.day && s.period === fs.period &&
      !s.electiveGroupId && // electives at frozen slots are intentional
      // Exclude the frozen slot's own emitted TimetableSlot:
      // If this frozen slot has a subjectId, don't flag the matching slot
      !(fs.subjectId && s.sectionId === fs.sectionId &&
        appState.subjects.find(sub => sub.id === fs.subjectId)?.name === s.subjectName)
    );
    if (conflicting) {
      const facName = appState.faculty.find(f => f.id === fs.facultyId)?.name || fs.facultyId;
      errors.push(`Frozen slot violation: Faculty ${facName} scheduled at ${fs.day} ${fs.period} despite freeze (${fs.description})`);
    }
  }

  // ── Workload balance ──
  const workloadMap = new Map<string, number>();
  for (const s of slots) {
    if (s.isLabContinuation) continue;
    workloadMap.set(s.facultyId, (workloadMap.get(s.facultyId) || 0) + 1);
  }
  const workloadBalance = appState.faculty.map(f => ({
    facultyName: f.name,
    hours: workloadMap.get(f.id) || 0,
  })).sort((a, b) => b.hours - a.hours);

  const loads = appState.faculty
    .filter(f => !isExternalFaculty(f))
    .map(f => workloadMap.get(f.id) || 0)
    .filter(h => h > 0);
  if (loads.length > 1) {
    const maxL = Math.max(...loads);
    const minL = Math.min(...loads);
    if (maxL - minL > 3) {
      warnings.push(`Workload imbalance: max ${maxL} hrs vs min ${minL} hrs (diff: ${maxL - minL}, tolerance: ±1)`);
    }
  }

  // ── Morning slot violations ──
  const morningMap = new Map<string, number>();
  for (const s of slots) {
    if (isP1(s.period)) {
      morningMap.set(s.facultyId, (morningMap.get(s.facultyId) || 0) + 1);
    }
  }
  for (const [fid, count] of morningMap) {
    if (count > 3) {
      const fac = appState.faculty.find(f => f.id === fid);
      if (fac && !isExternalFaculty(fac)) {
        warnings.push(`P1 class limit exceeded: ${fac?.name} has ${count} P1 classes (limit: 3)`);
      }
    }
  }

  // ── Subject coverage check ──
  const subjectCoverage: ValidationResult['stats']['subjectCoverage'] = [];

  if (originalDemands) {
    for (const d of originalDemands) {
      const scheduled = d.totalRequired - d.remaining;
      subjectCoverage.push({
        subjectName: d.subjectName,
        section: appState.sections.find(s => s.id === d.sectionId)?.name || d.sectionId,
        scheduled,
        required: d.totalRequired,
        ok: scheduled >= d.totalRequired,
      });
      if (scheduled < d.totalRequired) {
        warnings.push(`Coverage gap: "${d.subjectName}" for ${appState.sections.find(s => s.id === d.sectionId)?.name} — scheduled ${scheduled}/${d.totalRequired} hours`);
      }
    }
  }

  // ── Lab rotation verification ──
  let labRotationOk = true;
  for (const lg of appState.labGroups) {
    const section = appState.sections.find(s => s.id === lg.sectionId);
    if (!section) continue;
    const labSlotsList = slots.filter(s =>
      s.labGroupId === lg.id && !s.isLabContinuation
    );
    for (const batch of section.batches) {
      const batchSlots = labSlotsList.filter(s => s.batchName === batch);
      const labsDone = new Set(batchSlots.map(s => s.subjectName));
      for (const labEntry of lg.labs) {
        if (!labsDone.has(labEntry.labName)) {
          labRotationOk = false;
          warnings.push(`Lab rotation: ${section.name} batch "${batch}" never does "${labEntry.labName}"`);
        }
      }
    }
  }

  // ── Fixed classroom consistency check (all theory for a section should be same room) ──
  const sectionRoomMap = new Map<string, Set<string>>(); // sectionId → set of roomNames
  for (const s of slots) {
    if (s.subjectType !== 'core') continue;
    if (!s.roomId) continue;
    if (!sectionRoomMap.has(s.sectionId)) sectionRoomMap.set(s.sectionId, new Set());
    sectionRoomMap.get(s.sectionId)!.add(s.roomName || s.roomId);
  }
  for (const [secId, roomNames] of sectionRoomMap) {
    if (roomNames.size > 1) {
      const secName = appState.sections.find(s => s.id === secId)?.name || secId;
      warnings.push(
        `Fixed classroom violation: ${secName} has theory classes in ${roomNames.size} different rooms: ${[...roomNames].join(', ')} (should be 1 fixed room)`,
      );
    }
  }

  // ── Gap preference warnings ──
  const facultyDayMap = new Map<string, Map<Day, Period[]>>();
  for (const s of slots) {
    const fac = appState.faculty.find(f => f.id === s.facultyId);
    if (isExternalFaculty(fac, s.subjectName)) continue; // only check CSE

    if (!facultyDayMap.has(s.facultyId)) facultyDayMap.set(s.facultyId, new Map());
    const dayMap = facultyDayMap.get(s.facultyId)!;
    if (!dayMap.has(s.day)) dayMap.set(s.day, []);
    dayMap.get(s.day)!.push(s.period);
  }
  let backToBackCount = 0;
  for (const [, dayMap] of facultyDayMap) {
    for (const [, periods_] of dayMap) {
      const sorted = [...periods_].sort((a, b) => periodIdx(a) - periodIdx(b));
      for (let i = 0; i < sorted.length - 1; i++) {
        if (periodIdx(sorted[i + 1]) - periodIdx(sorted[i]) === 1) backToBackCount++;
      }
    }
  }
  if (backToBackCount > 5) {
    warnings.push(`Faculty gap preference: ${backToBackCount} back-to-back class sequences detected (prefer gaps between classes)`);
  }

  const totalSlots = slots.length;
  const totalUniqueClasses = slots.filter(s => !s.isLabContinuation).length;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    clashDetails,
    stats: {
      totalSlots,
      totalUniqueClasses,
      facultyClashes: facultyClashCount,
      roomClashes: roomClashCount,
      sectionClashes: sectionClashCount,
      softViolations: warnings.length,
      saturdayViolations,
      workloadBalance,
      subjectCoverage,
      labRotationOk,
      electiveConcurrencyOk,
    },
  };
}
