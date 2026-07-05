import { useState, useCallback, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import type { TimetableSlot, ValidationResult, SemesterTimetable, AppState, CrossSemesterClash } from '../types';
import { validateTimetable, validateCrossSemesterClashes } from '../scheduler';
import { updateDraftSlots } from '../services/semesterTimetableService';

function runValidation(
  slots: TimetableSlot[],
  lockedSlots: TimetableSlot[],
  appState: AppState,
): { validation: ValidationResult; crossClashes: CrossSemesterClash[] } {
  const validation = validateTimetable(slots, appState);
  const crossClashes = validateCrossSemesterClashes(slots, lockedSlots);
  return { validation, crossClashes };
}

export function useDraftTimetable(
  draft: SemesterTimetable | null,
  lockedSlots: TimetableSlot[],
  appState: AppState,
) {
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [crossSemesterClashes, setCrossSemesterClashes] = useState<CrossSemesterClash[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync slots from draft when it changes
  useEffect(() => {
    if (draft) {
      setSlots(draft.slots);
      setValidation(draft.validation);
      setCrossSemesterClashes([]);
      setIsDirty(false);
    } else {
      setSlots([]);
      setValidation(null);
      setCrossSemesterClashes([]);
      setIsDirty(false);
    }
  }, [draft]);

  const applyAndValidate = useCallback((newSlots: TimetableSlot[]) => {
    setSlots(newSlots);
    setIsDirty(true);
    const { validation: v, crossClashes } = runValidation(newSlots, lockedSlots, appState);
    setValidation(v);
    setCrossSemesterClashes(crossClashes);
  }, [lockedSlots, appState]);

  const editSlot = useCallback((slotId: string, changes: Partial<TimetableSlot>) => {
    setSlots(prev => {
      const updated = prev.map(s => s.id === slotId ? { ...s, ...changes } : s);
      const { validation: v, crossClashes } = runValidation(updated, lockedSlots, appState);
      setValidation(v);
      setCrossSemesterClashes(crossClashes);
      setIsDirty(true);
      return updated;
    });
  }, [lockedSlots, appState]);

  const swapSlots = useCallback((slotId1: string, slotId2: string) => {
    setSlots(prev => {
      const s1 = prev.find(s => s.id === slotId1);
      const s2 = prev.find(s => s.id === slotId2);
      if (!s1 || !s2) return prev;

      const updated = prev.map(s => {
        if (s.id === slotId1) return { ...s1, day: s2.day, period: s2.period, roomId: s2.roomId, roomName: s2.roomName };
        if (s.id === slotId2) return { ...s2, day: s1.day, period: s1.period, roomId: s1.roomId, roomName: s1.roomName };
        return s;
      });

      const { validation: v, crossClashes } = runValidation(updated, lockedSlots, appState);
      setValidation(v);
      setCrossSemesterClashes(crossClashes);
      setIsDirty(true);
      return updated;
    });
  }, [lockedSlots, appState]);

  const deleteSlot = useCallback((slotId: string) => {
    setSlots(prev => {
      const updated = prev.filter(s => s.id !== slotId);
      const { validation: v, crossClashes } = runValidation(updated, lockedSlots, appState);
      setValidation(v);
      setCrossSemesterClashes(crossClashes);
      setIsDirty(true);
      return updated;
    });
  }, [lockedSlots, appState]);

  const addSlot = useCallback((slotData: Omit<TimetableSlot, 'id'>) => {
    const newSlot: TimetableSlot = { id: uuid(), ...slotData };
    setSlots(prev => {
      const updated = [...prev, newSlot];
      const { validation: v, crossClashes } = runValidation(updated, lockedSlots, appState);
      setValidation(v);
      setCrossSemesterClashes(crossClashes);
      setIsDirty(true);
      return updated;
    });
  }, [lockedSlots, appState]);

  const save = useCallback(async (): Promise<void> => {
    if (!draft || !validation) return;
    setSaving(true);
    try {
      await updateDraftSlots(draft.id, slots, validation);
      setIsDirty(false);
    } finally {
      setSaving(false);
    }
  }, [draft, slots, validation]);

  const hasErrors = (validation?.errors.length ?? 0) > 0 || crossSemesterClashes.length > 0;

  return {
    slots,
    validation,
    crossSemesterClashes,
    hasErrors,
    isDirty,
    saving,
    editSlot,
    swapSlots,
    deleteSlot,
    addSlot,
    save,
    applyAndValidate,
  };
}
