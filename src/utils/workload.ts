import type { TimetableSlot } from '../types';

// Actual scheduled hours per faculty from a set of timetable slots.
// Labs count double (2 continuous periods); lab-continuation rows are
// skipped so a 2-period lab isn't double-counted. Co-faculty commitments
// count toward the co-faculty's own load too.
export function computeActualFacultyLoad(slots: TimetableSlot[]): Map<string, number> {
  const load = new Map<string, number>();
  const add = (facultyId: string | undefined, hours: number) => {
    if (!facultyId) return;
    load.set(facultyId, (load.get(facultyId) || 0) + hours);
  };

  for (const s of slots) {
    if (s.isLabContinuation) continue;
    const hours = s.subjectType === 'lab' ? 2 : 1;
    add(s.facultyId, hours);
    add(s.coFacultyId, hours);
  }

  return load;
}
