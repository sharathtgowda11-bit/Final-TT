import { useState, useCallback } from 'react';
import type { AppState, SemesterTimetable, TimetableStatus, ValidationResult } from '../types';
import { generateSemesterTimetable, validateCrossSemesterClashes } from '../scheduler';
import {
  fetchTimetables,
  fetchLockedSlots,
  createDraftTimetable,
  lockTimetable,
  deactivateTimetable,
} from '../services/semesterTimetableService';
import { fetchSectionClassrooms } from '../services/sectionClassroomService';
import type { SchedulerConfig } from '../types';

export interface SemesterStatus {
  semester: number;
  status: TimetableStatus | 'not-generated';
  timetable: SemesterTimetable | null;
}

export function useSemesterTimetable(academicYear: string) {
  const [timetables, setTimetables] = useState<SemesterTimetable[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!academicYear) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTimetables(academicYear);
      setTimetables(data);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load timetables');
    } finally {
      setLoading(false);
    }
  }, [academicYear]);

  const generate = useCallback(async (
    targetSemester: number,
    appState: AppState,
    config?: SchedulerConfig,
    onProgress?: (phase: number, msg: string) => void,
  ): Promise<{ id: string; validation: ValidationResult }> => {
    setLoading(true);
    setError(null);
    try {
      const lockedSlots = await fetchLockedSlots(academicYear);

      const sectionClassrooms = await fetchSectionClassrooms(academicYear);
      const sectionClassroomMap = new Map(
        sectionClassrooms.map(sc => [sc.sectionId, sc.roomId]),
      );

      const { timetable, validation, log } = generateSemesterTimetable(
        appState,
        targetSemester,
        lockedSlots,
        sectionClassroomMap.size > 0 ? sectionClassroomMap : undefined,
        config ?? appState.schedulerConfig,
        onProgress,
      );

      const crossClashes = validateCrossSemesterClashes(timetable, lockedSlots);
      const finalValidation: ValidationResult = crossClashes.length > 0
        ? {
            ...validation,
            errors: [
              ...validation.errors,
              ...crossClashes.map(c =>
                `Cross-semester clash (${c.type}): ${c.entityName} at ${c.day} ${c.period} — draft: ${c.draftSubject} vs sem ${c.lockedSemester}: ${c.lockedSubject}`,
              ),
            ],
            valid: false,
          }
        : validation;

      const id = await createDraftTimetable(
        targetSemester,
        academicYear,
        timetable,
        finalValidation,
        log,
      );

      await refresh();
      return { id, validation: finalValidation };
    } catch (e: any) {
      setError(e.message ?? 'Generation failed');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [academicYear, refresh]);

  const lock = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await lockTimetable(id);
      await refresh();
    } catch (e: any) {
      setError(e.message ?? 'Lock failed');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const deactivate = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await deactivateTimetable(id);
      await refresh();
    } catch (e: any) {
      setError(e.message ?? 'Deactivate failed');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const getSemesterStatuses = useCallback((): SemesterStatus[] => {
    return [1, 2, 3, 4, 5, 6, 7, 8].map(semester => {
      const locked = timetables.find(t => t.semester === semester && t.status === 'LOCKED');
      const draft = timetables.find(t => t.semester === semester && t.status === 'DRAFT');
      const active = locked ?? draft ?? null;
      return {
        semester,
        status: active ? active.status : 'not-generated',
        timetable: active,
      };
    });
  }, [timetables]);

  return {
    timetables,
    loading,
    error,
    refresh,
    generate,
    lock,
    deactivate,
    getSemesterStatuses,
  };
}
