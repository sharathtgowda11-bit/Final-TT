import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Zap, RefreshCw, CheckCircle2, XCircle, Activity,
  Lock, AlertTriangle, Calendar,
} from 'lucide-react';
import { cn } from '../utils/cn';
import type { AppState } from '../types';
import { useSemesterTimetable } from '../hooks/useSemesterTimetable';

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium', color)}>
      {children}
    </span>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white border border-slate-200/60 shadow-sm rounded-xl p-6', className)}>
      {children}
    </div>
  );
}

const STATUS_COLORS = {
  LOCKED: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  DRAFT: 'bg-amber-50 border-amber-200 text-amber-700',
  INACTIVE: 'bg-slate-50 border-slate-200 text-slate-500',
  'not-generated': 'bg-white border-slate-200 text-slate-400',
};

const STATUS_ICONS = {
  LOCKED: <Lock size={14} className="text-emerald-500" />,
  DRAFT: <RefreshCw size={14} className="text-amber-500" />,
  INACTIVE: <AlertTriangle size={14} className="text-slate-400" />,
  'not-generated': <Calendar size={14} className="text-slate-300" />,
};

const PHASE_LABELS = ['Preprocessing', 'Freeze Slots', 'Electives', 'Labs', 'Theory', 'Optimize', 'Validate'];

export function GenerateSemesterPanel({
  state,
  onNavigateToDraft,
}: {
  state: AppState;
  onNavigateToDraft?: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const defaultYear = `${currentYear}-${String(currentYear + 1).slice(2)}`;

  const [academicYear, setAcademicYear] = useState(defaultYear);
  const [targetSemester, setTargetSemester] = useState(7);
  const [generating, setGenerating] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [currentPhase, setCurrentPhase] = useState(-1);
  const [lastResult, setLastResult] = useState<{ valid: boolean; slots: number } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const hook = useSemesterTimetable(academicYear);

  useEffect(() => {
    if (academicYear) hook.refresh();
  }, [academicYear]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const semStatuses = hook.getSemesterStatuses();

  const checks = [
    { label: 'Faculty', ok: state.faculty.length > 0, val: state.faculty.length },
    { label: 'Sections', ok: state.sections.filter(s => s.semester === targetSemester).length > 0, val: state.sections.filter(s => s.semester === targetSemester).length },
    { label: 'Subjects', ok: state.subjects.filter(s => s.semester === targetSemester).length > 0, val: state.subjects.filter(s => s.semester === targetSemester).length },
    { label: 'Rooms', ok: state.rooms.some(r => r.type === 'classroom'), val: state.rooms.filter(r => r.type === 'classroom').length },
  ];
  const allReady = checks.every(c => c.ok) && !!academicYear;

  const handleGenerate = useCallback(async () => {
    if (!allReady) return;

    const existingLocked = hook.timetables.find(
      t => t.semester === targetSemester && t.status === 'LOCKED'
    );
    if (existingLocked) {
      const confirmed = window.confirm(
        `Semester ${targetSemester} already has a LOCKED timetable for ${academicYear}.\n\n` +
        `Your locked timetable is safe — generating will only create a new draft alongside it.\n\n` +
        `If you lock the new draft, the current locked timetable will become INACTIVE (your edits will be lost).\n\n` +
        `Continue and generate a new draft?`
      );
      if (!confirmed) return;
    }

    setGenerating(true);
    setLog([]);
    setCurrentPhase(0);
    setLastResult(null);

    const phases = [
      { label: 'Preprocessing — faculty-section mapping', delay: 100 },
      { label: 'Freeze college slots', delay: 200 },
      { label: 'Scheduling electives', delay: 200 },
      { label: 'Scheduling labs (rotation matrix)', delay: 300 },
      { label: 'Scheduling theory (MRV heuristic)', delay: 400 },
      { label: 'Running local search optimization', delay: 300 },
      { label: 'Validating constraints', delay: 200 },
    ];

    let delay = 0;
    phases.forEach((p, i) => {
      delay += p.delay;
      setTimeout(() => {
        setCurrentPhase(i);
        setLog(prev => [...prev, `▶ Phase ${i}: ${p.label}...`]);
      }, delay);
    });

    delay += 300;
    setTimeout(async () => {
      try {
        const { validation } = await hook.generate(
          targetSemester,
          state,
          state.schedulerConfig,
          (_phase, msg) => setLog(prev => [...prev, msg]),
        );

        setLog(prev => [
          ...prev,
          `✅ Generation complete`,
          validation.valid
            ? '🎉 VALID: All hard constraints satisfied!'
            : `⚠️ ${validation.errors.length} hard constraint violations`,
        ]);
        setLastResult({ valid: validation.valid, slots: validation.stats.totalSlots });
        setCurrentPhase(7);
      } catch (e: any) {
        setLog(prev => [...prev, `❌ Error: ${e.message}`]);
        setCurrentPhase(-1);
      } finally {
        setGenerating(false);
      }
    }, delay);
  }, [allReady, targetSemester, state, hook, academicYear]);

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
            <Zap size={18} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Generate Semester Timetable</h2>
            <p className="text-xs text-slate-500">Schedule a single semester while respecting locked semesters</p>
          </div>
        </div>
      </div>

      {/* Config */}
      <Card className="mb-5">
        <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider">Configuration</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Target Semester
            </label>
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
            <label className="block text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Academic Year
            </label>
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

      {/* Semester Status Overview */}
      {semStatuses.some(s => s.status !== 'not-generated') && (
        <Card className="mb-5">
          <h3 className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wider">Current Status — {academicYear}</h3>
          <div className="grid grid-cols-4 gap-2">
            {semStatuses.map(({ semester, status }) => (
              <div
                key={semester}
                className={cn(
                  'rounded-xl p-3 border text-center shadow-sm',
                  STATUS_COLORS[status],
                )}
              >
                <div className="flex items-center justify-center gap-1 mb-1">
                  {STATUS_ICONS[status]}
                  <span className="text-[11px] font-bold">Sem {semester}</span>
                </div>
                <Badge color={status === 'LOCKED' ? 'bg-emerald-100 text-emerald-700' : status === 'DRAFT' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}>
                  {status === 'not-generated' ? '—' : status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Pre-flight */}
      <Card className="mb-5">
        <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider">Pre-flight Checks — Semester {targetSemester}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {checks.map(c => (
            <div key={c.label} className={cn(
              'rounded-xl p-3 border text-center shadow-sm',
              c.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200',
            )}>
              <div className="flex items-center justify-center gap-1.5 mb-1.5">
                {c.ok ? <CheckCircle2 size={14} className="text-emerald-500" /> : <XCircle size={14} className="text-red-500" />}
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{c.label}</span>
              </div>
              <p className={cn('text-xl font-black mb-0.5', c.ok ? 'text-emerald-600' : 'text-red-600')}>{c.val}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Phase tracker */}
      {currentPhase >= 0 && (
        <Card className="mb-5 overflow-hidden">
          <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider">Scheduling Phases</h3>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {PHASE_LABELS.map((label, i) => (
              <div key={i} className="flex items-center gap-2 flex-shrink-0">
                <div className={cn(
                  'rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wide flex items-center gap-2 shadow-sm transition-all duration-300',
                  currentPhase > i
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    : currentPhase === i
                      ? 'bg-indigo-600 text-white border border-indigo-500 shadow-md scale-105'
                      : 'bg-white text-slate-400 border border-slate-200',
                )}>
                  {currentPhase > i && <CheckCircle2 size={12} />}
                  {currentPhase === i && <RefreshCw size={12} className="animate-spin text-indigo-200" />}
                  {label}
                </div>
                {i < PHASE_LABELS.length - 1 && (
                  <span className={cn('text-slate-200 font-bold', currentPhase > i && 'text-emerald-400')}>›</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Generate button */}
      <Card className="mb-5 bg-indigo-50 border-indigo-100 flex flex-col items-center text-center">
        <h3 className="text-lg font-black text-indigo-900 mb-2">Generate Semester {targetSemester}</h3>
        <p className="text-xs text-indigo-600/80 font-medium mb-3">
          Locked semesters are pre-seeded to prevent cross-semester clashes.
          Result is saved as DRAFT for editing before locking.
        </p>

        {/* Current status of selected semester */}
        {(() => {
          const st = semStatuses.find(s => s.semester === targetSemester)?.status ?? 'not-generated';
          if (st === 'LOCKED') return (
            <div className="mb-4 inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold px-3 py-1.5 rounded-lg">
              <Lock size={12} /> Semester {targetSemester} is LOCKED — your edits are saved. Generating will create a new draft.
            </div>
          );
          if (st === 'DRAFT') return (
            <div className="mb-4 inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold px-3 py-1.5 rounded-lg">
              <RefreshCw size={12} /> A draft already exists for Semester {targetSemester}. Generating will replace it.
            </div>
          );
          return null;
        })()}

        <div className="flex flex-wrap gap-4 items-center justify-center">
          <button
            onClick={handleGenerate}
            disabled={!allReady || generating}
            className={cn(
              'inline-flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm transition-all shadow-lg',
              'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {generating
              ? <><RefreshCw size={18} className="animate-spin" /> Generating...</>
              : <><Zap size={18} /> Generate Semester {targetSemester}</>
            }
          </button>
          {lastResult && onNavigateToDraft && (
            <button
              onClick={onNavigateToDraft}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg font-bold text-sm bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm transition-all"
            >
              View Draft Timetable
            </button>
          )}
        </div>
        {!allReady && (
          <p className="text-[11px] font-bold text-red-500 mt-4 flex items-center gap-1.5">
            <XCircle size={14} /> Fix pre-flight issues or enter academic year
          </p>
        )}
        {lastResult && (
          <div className={cn(
            'mt-5 px-5 py-3 rounded-xl border font-bold text-sm flex items-center gap-2',
            lastResult.valid ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700',
          )}>
            {lastResult.valid ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            {lastResult.valid
              ? `Draft saved — ${lastResult.slots} slots, all constraints satisfied`
              : `Draft saved with warnings — ${lastResult.slots} slots (review before locking)`
            }
          </div>
        )}
      </Card>

      {/* Log */}
      {log.length > 0 && (
        <Card className="bg-[#1A192B] border-slate-800 shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 mb-3 px-1">
            <Activity size={12} className="text-indigo-400" />
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Generation Log</h3>
          </div>
          <div
            ref={logRef}
            className="bg-black/40 rounded-xl p-5 font-mono text-[11px] space-y-1 max-h-72 overflow-y-auto border border-white/5 shadow-inner"
          >
            {log.map((line, i) => (
              <div key={i} className={cn(
                'leading-relaxed break-all',
                line.startsWith('✅') || line.startsWith('🎉') ? 'text-emerald-400 font-bold' :
                  line.startsWith('❌') ? 'text-red-400 font-bold' :
                    line.startsWith('⚠️') ? 'text-amber-400' :
                      line.startsWith('▶') ? 'text-indigo-300 font-bold mt-2' :
                        'text-slate-500',
              )}>
                {line}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
