import { useState, useEffect } from 'react';
import {
  Shield, Lock, RefreshCw, ChevronDown, Eye, AlertTriangle,
} from 'lucide-react';
import { cn } from '../utils/cn';
import type { SemesterTimetable } from '../types';
import { useSemesterTimetable } from '../hooks/useSemesterTimetable';
import { TimetableGrid } from './TimetableGrid';

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

const STATUS_BADGE: Record<string, string> = {
  LOCKED: 'bg-emerald-50 border border-emerald-200 text-emerald-700',
  DRAFT: 'bg-amber-50 border border-amber-200 text-amber-700',
  INACTIVE: 'bg-slate-100 border border-slate-200 text-slate-500',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  LOCKED: <Lock size={12} className="text-emerald-500" />,
  DRAFT: <RefreshCw size={12} className="text-amber-500" />,
  INACTIVE: <AlertTriangle size={12} className="text-slate-400" />,
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

export function SemesterStatusPanel() {
  const currentYear = new Date().getFullYear();
  const defaultYear = `${currentYear}-${String(currentYear + 1).slice(2)}`;

  const [academicYear, setAcademicYear] = useState(defaultYear);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewing, setViewing] = useState<SemesterTimetable | null>(null);

  const hook = useSemesterTimetable(academicYear);

  useEffect(() => {
    if (academicYear) hook.refresh();
  }, [academicYear]);

  const semStatuses = hook.getSemesterStatuses();

  // History: all timetables (includes INACTIVE)
  const history = hook.timetables.slice().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const handleDeactivate = async (t: SemesterTimetable) => {
    if (!window.confirm(`Make Semester ${t.semester} (v${t.version}) INACTIVE? It will no longer affect future generation.`)) return;
    await hook.deactivate(t.id);
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
            <Shield size={18} className="text-slate-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Semester Status</h2>
            <p className="text-xs text-slate-500">Current status and version history for all semesters</p>
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

      {/* Viewing a timetable slot grid */}
      {viewing && (
        <Card className="mb-5 border-indigo-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Badge color={STATUS_BADGE[viewing.status]}>
                {STATUS_ICON[viewing.status]} {viewing.status}
              </Badge>
              <span className="text-sm font-bold text-slate-700">Semester {viewing.semester}</span>
              {viewing.version && <Badge color="bg-indigo-50 text-indigo-600 border border-indigo-100">v{viewing.version}</Badge>}
              <span className="text-xs text-slate-400">{academicYear}</span>
            </div>
            <button
              onClick={() => setViewing(null)}
              className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
          <TimetableGrid slots={viewing.slots} viewType="section" />
        </Card>
      )}

      {/* Current status table */}
      <Card className="mb-5">
        <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider">Current Status — {academicYear}</h3>
        {hook.loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-slate-400">
            <RefreshCw size={16} className="animate-spin" /> Loading...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-600">
              <thead>
                <tr className="border-b border-slate-200">
                  {['Semester', 'Status', 'Version', 'Slots', 'Locked At', 'Validated', 'Actions'].map(h => (
                    <th key={h} className="text-left py-3 px-4 font-semibold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {semStatuses.map(({ semester, status, timetable: t }) => (
                  <tr key={semester} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-800">Semester {semester}</td>
                    <td className="py-3 px-4">
                      {status === 'not-generated' ? (
                        <Badge color="bg-slate-50 border border-slate-200 text-slate-400">—</Badge>
                      ) : (
                        <Badge color={STATUS_BADGE[status]}>
                          <span className="flex items-center gap-1">{STATUS_ICON[status]} {status}</span>
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {t?.version ? `v${t.version}` : '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {t ? t.slots.length : '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {fmt(t?.lockedAt ?? null)}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {fmt(t?.validatedAt ?? null)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        {t && (
                          <button
                            onClick={() => setViewing(viewing?.id === t.id ? null : t)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-white border border-slate-200 hover:bg-slate-50 text-slate-600"
                          >
                            <Eye size={10} /> View
                          </button>
                        )}
                        {t?.status === 'LOCKED' && (
                          <button
                            onClick={() => handleDeactivate(t)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-red-50 border border-red-200 hover:bg-red-100 text-red-600"
                          >
                            Make Inactive
                          </button>
                        )}
                        {!t && (
                          <span className="text-[10px] text-slate-400 italic">Not generated</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Version history */}
      <Card>
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest w-full text-left"
        >
          Version History ({history.length} entries)
          <ChevronDown size={14} className={cn('ml-auto transition-transform', historyOpen && 'rotate-180')} />
        </button>

        {historyOpen && (
          <div className="mt-4 pt-4 border-t border-slate-100 overflow-x-auto">
            {history.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No timetable history yet</p>
            ) : (
              <table className="w-full text-xs text-slate-600">
                <thead>
                  <tr className="border-b border-slate-200">
                    {['Semester', 'Version', 'Status', 'Slots', 'Created', 'Locked At', 'Based On', 'Actions'].map(h => (
                      <th key={h} className="text-left py-2.5 px-3 font-semibold text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(t => {
                    const parent = history.find(x => x.id === t.parentTimetableId);
                    return (
                      <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-medium">Sem {t.semester}</td>
                        <td className="py-2.5 px-3">
                          {t.version ? `v${t.version}` : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge color={STATUS_BADGE[t.status]}>
                            <span className="flex items-center gap-1">{STATUS_ICON[t.status]} {t.status}</span>
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{t.slots.length}</td>
                        <td className="py-2.5 px-3 text-slate-500">{fmt(t.createdAt)}</td>
                        <td className="py-2.5 px-3 text-slate-500">{fmt(t.lockedAt)}</td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {parent ? `v${parent.version ?? '?'}` : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => setViewing(viewing?.id === t.id ? null : t)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-white border border-slate-200 hover:bg-slate-50 text-slate-600"
                          >
                            <Eye size={10} /> View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
