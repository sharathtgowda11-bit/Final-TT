import { useState, useEffect, useMemo } from 'react';
import {
  Edit, Lock, Save, Trash2, RefreshCw, CheckCircle2,
  XCircle, AlertTriangle, Info, Layers, GripVertical,
} from 'lucide-react';
import { cn } from '../utils/cn';
import type { AppState, TimetableSlot, SemesterTimetable } from '../types';
import type { Day, Period } from '../types';
import { TimetableGrid } from './TimetableGrid';
import { useSemesterTimetable } from '../hooks/useSemesterTimetable';
import { useDraftTimetable } from '../hooks/useDraftTimetable';
import { fetchLockedSlots, fetchDraftTimetable } from '../services/semesterTimetableService';

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white border border-slate-200/60 shadow-sm rounded-xl p-6', className)}>
      {children}
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium', color)}>
      {children}
    </span>
  );
}

type EditMode = 'none' | 'edit';

export function DraftTimetablePanel({ state }: { state: AppState }) {
  const currentYear = new Date().getFullYear();
  const defaultYear = `${currentYear}-${String(currentYear + 1).slice(2)}`;

  const [academicYear, setAcademicYear] = useState(defaultYear);
  const [targetSemester, setTargetSemester] = useState(7);
  const [draft, setDraft] = useState<SemesterTimetable | null>(null);
  const [lockedSlots, setLockedSlots] = useState<TimetableSlot[]>([]);
  const [loadingDraft, setLoadingDraft] = useState(false);

  const [editMode, setEditMode] = useState<EditMode>('none');
  const [selectedSlot, setSelectedSlot] = useState<TimetableSlot | null>(null);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);

  // ── Section switching ──────────────────────────────────────
  const [activeSectionId, setActiveSectionId] = useState<string | 'all'>('all');

  const hook = useSemesterTimetable(academicYear);
  const draftHook = useDraftTimetable(draft, lockedSlots, state);

  // Derive sorted unique sections from the current draft slots
  const sections = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of draftHook.slots) map.set(s.sectionId, s.sectionName);
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [draftHook.slots]);

  // Auto-select first section when draft first loads
  useEffect(() => {
    if (sections.length > 0 && activeSectionId === 'all') {
      setActiveSectionId(sections[0].id);
    }
  }, [sections]);

  // Reset section when semester/year changes
  useEffect(() => {
    setActiveSectionId('all');
  }, [targetSemester, academicYear]);

  // Slots visible in the current grid
  const visibleSlots = useMemo(
    () => activeSectionId === 'all'
      ? draftHook.slots
      : draftHook.slots.filter(s => s.sectionId === activeSectionId),
    [draftHook.slots, activeSectionId],
  );

  // Stats for the info strip (single-section view)
  const sectionStats = useMemo(() => {
    if (activeSectionId === 'all') return null;
    const nonCont = visibleSlots.filter(s => !s.isLabContinuation);
    return {
      total: nonCont.length,
      theory: nonCont.filter(s => s.subjectType === 'core' || s.subjectType === 'elective').length,
      lab: nonCont.filter(s => s.subjectType === 'lab').length,
    };
  }, [visibleSlots, activeSectionId]);

  const isAllView = activeSectionId === 'all';

  // Load draft + locked slots
  useEffect(() => {
    if (!academicYear) return;
    setLoadingDraft(true);
    Promise.all([
      fetchDraftTimetable(targetSemester, academicYear),
      fetchLockedSlots(academicYear),
    ]).then(([d, locked]) => {
      setDraft(d);
      setLockedSlots(locked.filter(s => s.semester !== targetSemester));
    }).catch(console.error).finally(() => setLoadingDraft(false));
  }, [targetSemester, academicYear]);

  // Reset edit state when switching sections
  const handleSectionChange = (id: string | 'all') => {
    setActiveSectionId(id);
    setEditMode('none');
    setSelectedSlot(null);
    setEditingSlot(null);
  };

  // ── Slot click → open edit modal ────────────────────────────
  const handleSlotClick = (slot: TimetableSlot) => {
    if (slot.isLabContinuation) return;
    setSelectedSlot(slot);
    setEditingSlot({ ...slot });
    setEditMode('edit');
  };

  // ── Drag-and-drop → swap or move ────────────────────────────
  const handleSlotDrop = (draggedSlotId: string, targetDay: Day, targetPeriod: Period) => {
    const targetSlot = visibleSlots.find(
      s => s.day === targetDay && s.period === targetPeriod && !s.isLabContinuation,
    );
    if (targetSlot && targetSlot.id !== draggedSlotId) {
      draftHook.swapSlots(draggedSlotId, targetSlot.id);
    } else if (!targetSlot) {
      draftHook.editSlot(draggedSlotId, { day: targetDay, period: targetPeriod });
    }
  };

  const handleSaveEdit = () => {
    if (!editingSlot || !selectedSlot) return;
    const changes: Partial<TimetableSlot> = {};
    if (editingSlot.facultyId !== selectedSlot.facultyId) {
      changes.facultyId = editingSlot.facultyId;
      const fac = state.faculty.find(f => f.id === editingSlot.facultyId);
      changes.facultyName = fac?.name ?? editingSlot.facultyName;
    }
    if (editingSlot.roomId !== selectedSlot.roomId) {
      changes.roomId = editingSlot.roomId;
      const room = state.rooms.find(r => r.id === editingSlot.roomId);
      changes.roomName = room?.name ?? editingSlot.roomName;
    }
    draftHook.editSlot(selectedSlot.id, changes);
    setEditMode('none');
    setSelectedSlot(null);
    setEditingSlot(null);
  };

  const handleDelete = () => {
    if (!selectedSlot) return;
    if (window.confirm(`Delete "${selectedSlot.subjectName}" for ${selectedSlot.sectionName}?`)) {
      draftHook.deleteSlot(selectedSlot.id);
      setEditMode('none');
      setSelectedSlot(null);
    }
  };

  const handleLock = async () => {
    if (!draft || draftHook.hasErrors) return;
    if (!window.confirm(`Lock this timetable? This assigns a version number and replaces any currently LOCKED timetable for Semester ${targetSemester}.`)) return;
    await draftHook.save();
    await hook.lock(draft.id);
    const updated = await fetchDraftTimetable(targetSemester, academicYear);
    setDraft(updated);
  };

  if (loadingDraft) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw size={24} className="animate-spin text-indigo-400" />
        <span className="ml-3 text-sm text-slate-500">Loading draft...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
            <Edit size={18} className="text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Draft Timetable</h2>
            <p className="text-xs text-slate-500">Edit section by section, validate, and lock</p>
          </div>
        </div>
      </div>

      {/* Selectors */}
      <Card className="mb-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Semester</label>
            <select
              value={targetSemester}
              onChange={e => setTargetSemester(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors shadow-sm"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                <option key={s} value={s}>Semester {s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Academic Year</label>
            <input
              type="text"
              value={academicYear}
              onChange={e => setAcademicYear(e.target.value)}
              placeholder="2026-27"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors shadow-sm"
            />
          </div>
        </div>
      </Card>

      {!draft ? (
        <Card>
          <div className="text-center py-12">
            <Info size={36} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No draft for Semester {targetSemester} ({academicYear})</p>
            <p className="text-xs text-slate-400 mt-1">Generate one from the "Generate Semester" tab</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Status bar */}
          <Card className="mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge color="bg-amber-50 border border-amber-200 text-amber-700">DRAFT</Badge>
                <span className="text-xs text-slate-500">Semester {targetSemester} · {academicYear}</span>
                <span className="text-xs text-slate-400">Created {new Date(draft.createdAt).toLocaleDateString()}</span>
                {draft.lastEditedAt && (
                  <span className="text-xs text-slate-400">Edited {new Date(draft.lastEditedAt).toLocaleDateString()}</span>
                )}
                <span className="text-xs text-slate-400">{draftHook.slots.length} total slots · {sections.length} sections</span>
              </div>
              <div className="flex gap-2">
                {draftHook.isDirty && (
                  <button
                    onClick={draftHook.save}
                    disabled={draftHook.saving}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all"
                  >
                    {draftHook.saving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                    Save Edits
                  </button>
                )}
                <button
                  onClick={handleLock}
                  disabled={draftHook.hasErrors || hook.loading}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-all',
                    draftHook.hasErrors
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20',
                  )}
                  title={draftHook.hasErrors ? 'Fix all errors before locking' : 'Lock this timetable'}
                >
                  <Lock size={12} /> Lock Timetable
                </button>
              </div>
            </div>
          </Card>

          {/* Validation status */}
          {(draftHook.validation || draftHook.crossSemesterClashes.length > 0) && (
            <Card className={cn('mb-4', draftHook.hasErrors ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200')}>
              <div className="flex items-center gap-2 mb-2">
                {draftHook.hasErrors
                  ? <XCircle size={16} className="text-red-500" />
                  : <CheckCircle2 size={16} className="text-emerald-500" />
                }
                <span className={cn('text-xs font-bold', draftHook.hasErrors ? 'text-red-700' : 'text-emerald-700')}>
                  {draftHook.hasErrors
                    ? `${(draftHook.validation?.errors.length ?? 0) + draftHook.crossSemesterClashes.length} error(s) — resolve before locking`
                    : 'All constraints satisfied — ready to lock'
                  }
                </span>
              </div>
              {draftHook.validation && draftHook.validation.errors.length > 0 && (
                <div className="space-y-1 mt-2">
                  {draftHook.validation.errors.slice(0, 3).map((e, i) => (
                    <div key={i} className="text-[11px] text-red-700 flex items-start gap-1.5 bg-red-100 rounded px-2 py-1">
                      <XCircle size={11} className="mt-0.5 flex-shrink-0" /> {e}
                    </div>
                  ))}
                  {draftHook.validation.errors.length > 3 && (
                    <p className="text-[10px] text-red-500">+{draftHook.validation.errors.length - 3} more errors</p>
                  )}
                </div>
              )}
              {draftHook.crossSemesterClashes.length > 0 && (
                <div className="mt-2 space-y-1">
                  {draftHook.crossSemesterClashes.map((c, i) => (
                    <div key={i} className="text-[11px] text-red-700 flex items-start gap-1.5 bg-red-100 rounded px-2 py-1">
                      <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
                      Cross-sem clash ({c.type}): {c.entityName} at {c.day} {c.period}
                    </div>
                  ))}
                </div>
              )}
              {draftHook.validation && draftHook.validation.warnings.length > 0 && !draftHook.hasErrors && (
                <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1.5">
                  <AlertTriangle size={11} /> {draftHook.validation.warnings.length} soft warning(s)
                </p>
              )}
            </Card>
          )}

          {/* ── Section tab bar ───────────────────────────────── */}
          {sections.length > 0 && (
            <div className="mb-4 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 pt-3 pb-0 flex items-center gap-2 border-b border-slate-100">
                <Layers size={13} className="text-slate-400 mb-3" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Section</span>
              </div>
              <div className="flex items-center gap-1.5 px-4 py-3 flex-wrap">
                <button
                  onClick={() => handleSectionChange('all')}
                  className={cn(
                    'px-3.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all',
                    isAllView
                      ? 'bg-slate-700 text-white border-slate-600 shadow-sm'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:border-slate-300',
                  )}
                >
                  All ({sections.length})
                </button>
                {sections.map(sec => (
                  <button
                    key={sec.id}
                    onClick={() => handleSectionChange(sec.id)}
                    className={cn(
                      'px-3.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all',
                      activeSectionId === sec.id
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700',
                    )}
                  >
                    {sec.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Info strip + interaction hints ────────────────── */}
          <Card className="mb-4">
            {sectionStats && (
              <div className="flex items-center gap-4 mb-3 pb-3 border-b border-slate-100 text-[11px] text-slate-500 font-medium">
                <span className="font-bold text-slate-700">
                  {sections.find(s => s.id === activeSectionId)?.name}
                </span>
                <span><strong className="text-slate-700">{sectionStats.total}</strong> slots</span>
                <span><strong className="text-indigo-600">{sectionStats.theory}</strong> theory</span>
                <span><strong className="text-pink-600">{sectionStats.lab}</strong> lab sessions</span>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              {isAllView ? (
                <span className="text-[11px] text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded border border-amber-200 flex items-center gap-1">
                  <Info size={11} /> Select a section tab to edit
                </span>
              ) : (
                <>
                  <span className="text-[11px] text-indigo-600 font-medium bg-indigo-50 px-2.5 py-1 rounded border border-indigo-200 flex items-center gap-1.5">
                    <Edit size={11} /> Click a slot to edit faculty / room
                  </span>
                  <span className="text-[11px] text-violet-600 font-medium bg-violet-50 px-2.5 py-1 rounded border border-violet-200 flex items-center gap-1.5">
                    <GripVertical size={11} /> Drag a slot to swap or move it
                  </span>
                </>
              )}
            </div>
          </Card>

          {/* Edit modal */}
          {editMode === 'edit' && editingSlot && (
            <Card className="mb-4 border-indigo-200 bg-indigo-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wide">
                  Edit: {selectedSlot?.subjectName} — {selectedSlot?.sectionName} · {selectedSlot?.day} {selectedSlot?.period}
                </h3>
                <button onClick={() => { setEditMode('none'); setSelectedSlot(null); }} className="text-slate-400 hover:text-slate-600">
                  <XCircle size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Faculty</label>
                  <select
                    value={editingSlot.facultyId}
                    onChange={e => setEditingSlot(s => s ? { ...s, facultyId: e.target.value } : s)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {state.faculty.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Room</label>
                  <select
                    value={editingSlot.roomId ?? ''}
                    onChange={e => setEditingSlot(s => s ? { ...s, roomId: e.target.value || undefined } : s)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">No room</option>
                    {state.rooms.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveEdit} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                  <Save size={12} /> Apply Change
                </button>
                <button onClick={handleDelete} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-all">
                  <Trash2 size={12} /> Delete Slot
                </button>
                <button onClick={() => { setEditMode('none'); setSelectedSlot(null); }} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-white text-slate-600 border border-slate-200 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </Card>
          )}

          {/* Grid */}
          <Card className="overflow-hidden p-0 shadow-md border-slate-200">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800">
                {isAllView
                  ? `Semester ${targetSemester} — All Sections`
                  : `Section ${sections.find(s => s.id === activeSectionId)?.name} — Semester ${targetSemester}`
                }
              </h3>
              {isAllView && (
                <Badge color="bg-slate-100 text-slate-500 border border-slate-200">
                  Read-only overview
                </Badge>
              )}
            </div>
            <div className="p-4 bg-white overflow-hidden">
              <TimetableGrid
                slots={visibleSlots}
                viewType="section"
                onSlotClick={!isAllView ? handleSlotClick : undefined}
                onSlotDrop={!isAllView ? handleSlotDrop : undefined}
              />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
