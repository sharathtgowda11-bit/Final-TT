import { useState, useEffect } from 'react';
import {
  Edit, Lock, Save, Trash2, RefreshCw, CheckCircle2,
  XCircle, AlertTriangle, ArrowLeftRight, Info,
} from 'lucide-react';
import { cn } from '../utils/cn';
import type { AppState, TimetableSlot, SemesterTimetable } from '../types';
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

type EditMode = 'none' | 'edit' | 'swap-select-first' | 'swap-select-second';

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
  const [swapFirst, setSwapFirst] = useState<TimetableSlot | null>(null);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);

  const hook = useSemesterTimetable(academicYear);
  const draftHook = useDraftTimetable(draft, lockedSlots, state);

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

  const handleSlotClick = (slot: TimetableSlot) => {
    if (slot.isLabContinuation) return;

    if (editMode === 'swap-select-first') {
      setSwapFirst(slot);
      setEditMode('swap-select-second');
      return;
    }

    if (editMode === 'swap-select-second' && swapFirst) {
      draftHook.swapSlots(swapFirst.id, slot.id);
      setSwapFirst(null);
      setEditMode('none');
      return;
    }

    setSelectedSlot(slot);
    setEditingSlot({ ...slot });
    setEditMode('edit');
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

  const viewType = 'section';

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
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
            <Edit size={18} className="text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Draft Timetable</h2>
            <p className="text-xs text-slate-500">Edit, validate, and lock the semester draft</p>
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
                <span className="text-xs text-slate-400">{draftHook.slots.length} slots</span>
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
            <Card className={cn(
              'mb-4',
              draftHook.hasErrors ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200',
            )}>
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

          {/* Edit mode toolbar */}
          <Card className="mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Edit Mode:</span>
              <button
                onClick={() => { setEditMode('none'); setSwapFirst(null); }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all',
                  editMode === 'none' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                )}
              >
                View
              </button>
              <button
                onClick={() => { setEditMode('swap-select-first'); setSwapFirst(null); }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1.5',
                  editMode.startsWith('swap') ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                )}
              >
                <ArrowLeftRight size={12} /> Swap Slots
              </button>
              {editMode === 'swap-select-first' && (
                <span className="text-[11px] text-cyan-600 font-medium bg-cyan-50 px-2 py-1 rounded border border-cyan-200">
                  Click first slot to swap
                </span>
              )}
              {editMode === 'swap-select-second' && swapFirst && (
                <span className="text-[11px] text-cyan-600 font-medium bg-cyan-50 px-2 py-1 rounded border border-cyan-200">
                  "{swapFirst.subjectName}" selected — click second slot
                </span>
              )}
            </div>
          </Card>

          {/* Edit modal */}
          {editMode === 'edit' && editingSlot && (
            <Card className="mb-4 border-indigo-200 bg-indigo-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wide">
                  Edit: {selectedSlot?.subjectName} — {selectedSlot?.sectionName}
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
              <h3 className="text-sm font-black text-slate-800">Semester {targetSemester} Draft Timetable</h3>
              {editMode !== 'none' && (
                <Badge color="bg-cyan-50 border border-cyan-200 text-cyan-700">
                  {editMode === 'swap-select-first' ? 'Select first slot' : editMode === 'swap-select-second' ? 'Select second slot' : 'Click slot to edit'}
                </Badge>
              )}
            </div>
            <div className="p-4 bg-white overflow-hidden">
              <TimetableGrid
                slots={draftHook.slots}
                viewType={viewType}
                onSlotClick={editMode !== 'none' ? handleSlotClick : undefined}
              />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
