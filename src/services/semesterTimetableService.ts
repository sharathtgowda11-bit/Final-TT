import { supabase } from '../lib/supabase';
import type { SemesterTimetable, TimetableSlot, ValidationResult } from '../types';

function rowToSemesterTimetable(row: any): SemesterTimetable {
  return {
    id: row.id,
    semester: row.semester,
    academicYear: row.academic_year,
    status: row.status,
    version: row.version ?? null,
    parentTimetableId: row.parent_timetable_id ?? null,
    slots: row.slots ?? [],
    validation: row.validation ?? null,
    generationLog: row.generation_log ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastEditedAt: row.last_edited_at ?? null,
    validatedAt: row.validated_at ?? null,
    lockedAt: row.locked_at ?? null,
    lockedBy: row.locked_by ?? null,
  };
}

export async function fetchTimetables(academicYear: string): Promise<SemesterTimetable[]> {
  const { data, error } = await supabase
    .from('timetables')
    .select('*')
    .eq('academic_year', academicYear)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToSemesterTimetable);
}

export async function fetchLockedTimetables(academicYear: string): Promise<SemesterTimetable[]> {
  const { data, error } = await supabase
    .from('timetables')
    .select('*')
    .eq('academic_year', academicYear)
    .eq('status', 'LOCKED');
  if (error) throw error;
  return (data ?? []).map(rowToSemesterTimetable);
}

export async function fetchLockedSlots(academicYear: string): Promise<TimetableSlot[]> {
  const locked = await fetchLockedTimetables(academicYear);
  return locked.flatMap(t => t.slots);
}

export async function fetchDraftTimetable(
  semester: number,
  academicYear: string,
): Promise<SemesterTimetable | null> {
  const { data, error } = await supabase
    .from('timetables')
    .select('*')
    .eq('semester', semester)
    .eq('academic_year', academicYear)
    .eq('status', 'DRAFT')
    .maybeSingle();
  if (error) throw error;
  return data ? rowToSemesterTimetable(data) : null;
}

export async function createDraftTimetable(
  semester: number,
  academicYear: string,
  slots: TimetableSlot[],
  validation: ValidationResult,
  generationLog: string[],
): Promise<string> {
  const { data, error } = await supabase.rpc('create_draft_timetable', {
    p_semester: semester,
    p_academic_year: academicYear,
    p_slots: slots,
    p_validation: validation,
    p_generation_log: generationLog,
  });
  if (error) throw error;
  return data as string;
}

export async function updateDraftSlots(
  id: string,
  slots: TimetableSlot[],
  validation: ValidationResult,
): Promise<void> {
  const { error } = await supabase
    .from('timetables')
    .update({
      slots,
      validation,
      updated_at: new Date().toISOString(),
      last_edited_at: new Date().toISOString(),
      validated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'DRAFT');
  if (error) throw error;
}

export async function lockTimetable(id: string): Promise<void> {
  const { error } = await supabase.rpc('lock_timetable', { p_id: id });
  if (error) throw error;
}

export async function deactivateTimetable(id: string): Promise<void> {
  const { error } = await supabase
    .from('timetables')
    .update({ status: 'INACTIVE', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
