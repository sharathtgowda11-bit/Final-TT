import { useState, useEffect } from 'react';
import { Layers, RefreshCw, Lock } from 'lucide-react';
import { cn } from '../utils/cn';
import { TimetableGrid } from './TimetableGrid';
import type { TimetableView } from './TimetableGrid';
import { useSemesterTimetable } from '../hooks/useSemesterTimetable';

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white border border-slate-200/60 shadow-sm rounded-xl p-6', className)}>
      {children}
    </div>
  );
}

export function CombinedLockedView() {
  const currentYear = new Date().getFullYear();
  const defaultYear = `${currentYear}-${String(currentYear + 1).slice(2)}`;

  const [academicYear, setAcademicYear] = useState(defaultYear);
  const [viewType, setViewType] = useState<TimetableView>('section');

  const hook = useSemesterTimetable(academicYear);

  useEffect(() => {
    if (academicYear) hook.refresh();
  }, [academicYear]);

  const locked = hook.timetables.filter(t => t.status === 'LOCKED');
  const allLockedSlots = locked.flatMap(t => t.slots);

  const lockedSemesters = locked.map(t => t.semester).sort((a, b) => a - b);

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
            <Layers size={18} className="text-indigo-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">All Semesters — Combined View</h2>
            <p className="text-xs text-slate-500">All LOCKED timetables overlaid in one grid</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={academicYear}
            onChange={e => setAcademicYear(e.target.value)}
            placeholder="2026-27"
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-28"
          />
          <button
            onClick={() => hook.refresh()}
            disabled={hook.loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
          >
            <RefreshCw size={12} className={hook.loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Locked semesters summary */}
      {lockedSemesters.length > 0 && (
        <Card className="mb-5">
          <h3 className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wider">Locked Semesters Included</h3>
          <div className="flex flex-wrap gap-2">
            {lockedSemesters.map(sem => (
              <div key={sem} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                <Lock size={11} /> Semester {sem}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">{allLockedSlots.length} total slots across {lockedSemesters.length} semester(s)</p>
        </Card>
      )}

      {allLockedSlots.length === 0 ? (
        <Card>
          <div className="text-center py-16">
            <Layers size={36} className="text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No locked timetables for {academicYear}</p>
            <p className="text-xs text-slate-400 mt-1">Generate and lock semester timetables to see them here</p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0 shadow-md border-slate-200">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-800">Combined Grid — {academicYear}</h3>
            {/* View type toggle */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 border border-slate-200/60">
              {(['section', 'faculty', 'room'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setViewType(v)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all',
                    viewType === v
                      ? 'bg-white text-indigo-600 shadow border border-slate-200/50'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50',
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 bg-white overflow-hidden">
            <TimetableGrid slots={allLockedSlots} viewType={viewType} />
          </div>
        </Card>
      )}
    </div>
  );
}
