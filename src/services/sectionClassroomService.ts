import { supabase } from '../lib/supabase';
import { v4 as uuid } from 'uuid';
import type { SectionClassroom } from '../types';

function rowToSectionClassroom(row: any): SectionClassroom {
  return {
    id: row.id,
    sectionId: row.section_id,
    roomId: row.room_id,
    academicYear: row.academic_year,
  };
}

export async function fetchSectionClassrooms(academicYear: string): Promise<SectionClassroom[]> {
  const { data, error } = await supabase
    .from('section_classrooms')
    .select('*')
    .eq('academic_year', academicYear);
  if (error) throw error;
  return (data ?? []).map(rowToSectionClassroom);
}

export async function saveSectionClassroom(
  sectionId: string,
  roomId: string,
  academicYear: string,
): Promise<SectionClassroom> {
  const id = uuid();
  const { data, error } = await supabase
    .from('section_classrooms')
    .upsert(
      { id, section_id: sectionId, room_id: roomId, academic_year: academicYear },
      { onConflict: 'section_id,academic_year' },
    )
    .select()
    .single();
  if (error) throw error;
  return rowToSectionClassroom(data);
}

export async function saveBulkSectionClassrooms(
  mappings: { sectionId: string; roomId: string }[],
  academicYear: string,
): Promise<void> {
  const rows = mappings.map(m => ({
    id: uuid(),
    section_id: m.sectionId,
    room_id: m.roomId,
    academic_year: academicYear,
  }));
  const { error } = await supabase
    .from('section_classrooms')
    .upsert(rows, { onConflict: 'section_id,academic_year' });
  if (error) throw error;
}
