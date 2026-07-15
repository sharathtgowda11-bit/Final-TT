import { useMemo, useState, useEffect } from 'react';
import { FileDown, Users, Info } from 'lucide-react';
import type { AppState, TimetableSlot } from '../types';
import { cn } from '../utils/cn';
import { useSemesterTimetable } from '../hooks/useSemesterTimetable';

interface WorkloadRow {
  slNo: number;
  facultyId: string;
  facultyName: string;
  semCodes: Record<number, string[]>;   // semester → subject codes / lab names
  semTheory: Record<number, number>;
  semPractical: Record<number, number>;
  totalTheory: number;
  totalPractical: number;
  totalHours: number;
}

// ── Actual mode: from generated timetable slots ───────────────
function buildActualRows(slots: TimetableSlot[]): { rows: WorkloadRow[]; semesters: number[] } {
  const map = new Map<string, {
    name: string;
    semCodes: Record<number, Set<string>>;
    semTheory: Record<number, number>;
    semPractical: Record<number, number>;
  }>();

  const credit = (facultyId: string, facultyName: string, slot: TimetableSlot) => {
    if (!map.has(facultyId)) {
      map.set(facultyId, { name: facultyName, semCodes: {}, semTheory: {}, semPractical: {} });
    }
    const e = map.get(facultyId)!;
    const sem = slot.semester;

    if (!e.semCodes[sem]) e.semCodes[sem] = new Set();
    const code = slot.subjectCode?.trim() || slot.subjectName;
    e.semCodes[sem].add(code);

    if (slot.subjectType === 'lab') {
      e.semPractical[sem] = (e.semPractical[sem] || 0) + 2;
    } else {
      e.semTheory[sem] = (e.semTheory[sem] || 0) + 1;
    }
  };

  for (const slot of slots) {
    if (slot.isLabContinuation) continue;
    credit(slot.facultyId, slot.facultyName, slot);
    if (slot.coFacultyId) credit(slot.coFacultyId, slot.coFacultyName || slot.coFacultyId, slot);
  }

  return finalise(map);
}

// ── Expected mode: from configured subjects / labs / electives ─
function buildExpectedRows(state: AppState): { rows: WorkloadRow[]; semesters: number[] } {
  const facultyNames = new Map(state.faculty.map(f => [f.id, f.name]));
  const map = new Map<string, {
    name: string;
    semCodes: Record<number, Set<string>>;
    semTheory: Record<number, number>;
    semPractical: Record<number, number>;
  }>();

  function ensure(fid: string) {
    if (!map.has(fid)) {
      map.set(fid, { name: facultyNames.get(fid) || fid, semCodes: {}, semTheory: {}, semPractical: {} });
    }
    return map.get(fid)!;
  }

  function addCode(e: ReturnType<typeof ensure>, sem: number, code: string) {
    if (!e.semCodes[sem]) e.semCodes[sem] = new Set();
    e.semCodes[sem].add(code);
  }

  // Core theory subjects
  for (const subj of state.subjects) {
    if (subj.type !== 'core' || subj.facultyIds.length === 0) continue;
    const semSections = state.sections.filter(s => s.semester === subj.semester);
    semSections.forEach((_, i) => {
      const fid = subj.facultyIds[i % subj.facultyIds.length];
      const e = ensure(fid);
      addCode(e, subj.semester, subj.code);
      e.semTheory[subj.semester] = (e.semTheory[subj.semester] || 0) + subj.hoursPerWeek;
    });
  }

  // Lab groups
  for (const lg of state.labGroups) {
    for (const labEntry of lg.labs) {
      if (!labEntry.facultyId) continue;
      const e = ensure(labEntry.facultyId);
      addCode(e, lg.semester, labEntry.labName);
      e.semPractical[lg.semester] = (e.semPractical[lg.semester] || 0) + lg.slotsPerWeek * 2;
    }
  }

  // Elective groups
  for (const eg of state.electiveGroups) {
    const cpw = eg.classesPerWeek ?? 1;
    for (const batch of eg.batches) {
      if (batch.facultyId) {
        const e = ensure(batch.facultyId);
        addCode(e, eg.semester, batch.subjectName || eg.name);
        e.semTheory[eg.semester] = (e.semTheory[eg.semester] || 0) + cpw;
      }
      if (batch.hasLab) {
        const labFid = batch.labFacultyId || batch.facultyId;
        if (labFid) {
          const e = ensure(labFid);
          addCode(e, eg.semester, (batch.subjectName || eg.name) + ' Lab');
          e.semPractical[eg.semester] = (e.semPractical[eg.semester] || 0) + cpw * 2;
        }
      }
    }
  }

  return finalise(map);
}

function finalise(map: Map<string, {
  name: string;
  semCodes: Record<number, Set<string>>;
  semTheory: Record<number, number>;
  semPractical: Record<number, number>;
}>): { rows: WorkloadRow[]; semesters: number[] } {
  const semSet = new Set<number>();
  for (const e of map.values()) {
    Object.keys(e.semCodes).forEach(k => semSet.add(Number(k)));
  }
  const semesters = [...semSet].sort((a, b) => b - a);

  const rows: WorkloadRow[] = [...map.entries()]
    .map(([id, data]) => {
      const semCodes: Record<number, string[]> = {};
      for (const [k, v] of Object.entries(data.semCodes)) semCodes[Number(k)] = [...v];
      const totalTheory = Object.values(data.semTheory).reduce((a, b) => a + b, 0);
      const totalPractical = Object.values(data.semPractical).reduce((a, b) => a + b, 0);
      return {
        slNo: 0,
        facultyId: id,
        facultyName: data.name,
        semCodes,
        semTheory: data.semTheory,
        semPractical: data.semPractical,
        totalTheory,
        totalPractical,
        totalHours: totalTheory + totalPractical,
      };
    })
    .sort((a, b) => a.facultyName.localeCompare(b.facultyName))
    .map((r, i) => ({ ...r, slNo: i + 1 }));

  return { rows, semesters };
}

function semLabel(s: number): string {
  if (s === 1) return '1st Sem';
  if (s === 2) return '2nd Sem';
  if (s === 3) return '3rd Sem';
  return `${s}th Sem`;
}

function exportToDoc(rows: WorkloadRow[], semesters: number[], mode: 'expected' | 'actual') {
  const TH  = `background:#1e3a8a;color:#ffffff;padding:7pt 9pt;text-align:center;font-family:Arial,sans-serif;font-size:10pt;border:1pt solid #1e3a8a;font-weight:bold;`;
  const TD  = `padding:6pt 8pt;text-align:center;font-family:Arial,sans-serif;font-size:9pt;border:1pt solid #b0b8c8;vertical-align:top;`;
  const TDL = `padding:6pt 8pt;text-align:left;font-family:Arial,sans-serif;font-size:9.5pt;border:1pt solid #b0b8c8;font-weight:bold;vertical-align:middle;`;
  const TDF = `padding:6pt 8pt;text-align:center;font-family:Arial,sans-serif;font-size:10pt;border:1pt solid #b0b8c8;font-weight:bold;`;

  const header = [
    `<th style="${TH}width:30pt;">Sl.No</th>`,
    `<th style="${TH}width:160pt;text-align:left;">Faculty Name</th>`,
    ...semesters.map(s => `<th style="${TH}width:80pt;">${semLabel(s)}</th>`),
    `<th style="${TH}width:60pt;">Theory<br>Hours</th>`,
    `<th style="${TH}width:60pt;">Practical<br>Hours</th>`,
    `<th style="${TH}width:55pt;">Total<br>Hours</th>`,
  ].join('');

  const body = rows.map((r, i) => {
    const bg = i % 2 === 0 ? '#f4f6fb' : '#ffffff';
    return `<tr>
      <td style="${TD}background:${bg};">${r.slNo}</td>
      <td style="${TDL}background:${bg};">${r.facultyName}</td>
      ${semesters.map(s => {
        const codes = r.semCodes[s] || [];
        return `<td style="${TD}background:${bg};">${codes.length ? codes.map(c => `<span style="display:block;margin:1pt 0;">${c}</span>`).join('') : '<span style="color:#aaa;">—</span>'}</td>`;
      }).join('')}
      <td style="${TDF}background:${bg};color:#1e3a8a;">${r.totalTheory}</td>
      <td style="${TDF}background:${bg};color:#9d174d;">${r.totalPractical}</td>
      <td style="${TDF}background:${bg};color:#065f46;">${r.totalHours}</td>
    </tr>`;
  }).join('');

  const totT = rows.reduce((a, r) => a + r.totalTheory, 0);
  const totP = rows.reduce((a, r) => a + r.totalPractical, 0);
  const totH = rows.reduce((a, r) => a + r.totalHours, 0);
  const foot = `<tr style="background:#e8ecf4;">
    <td colspan="${2 + semesters.length}" style="${TDF}background:#1e3a8a;color:#fff;text-align:right;">Department Total</td>
    <td style="${TDF}color:#1e3a8a;">${totT}</td>
    <td style="${TDF}color:#9d174d;">${totP}</td>
    <td style="${TDF}color:#065f46;">${totH}</td>
  </tr>`;

  const title    = mode === 'expected' ? 'Faculty Workload Summary (Expected)' : 'Faculty Workload Summary (Actual)';
  const subtitle = mode === 'expected'
    ? 'Based on configured subjects, lab groups and electives — before timetable generation'
    : 'Based on generated timetable slots';
  const dateStr  = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
  xmlns:w='urn:schemas-microsoft-com:office:word'
  xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'>
<style>
  @page { size: A4 landscape; margin: 1.5cm; }
  body  { font-family: Arial, sans-serif; font-size: 10pt; margin: 0; }
  h2    { font-size: 15pt; color: #1e3a8a; margin: 0 0 4pt 0; }
  h3    { font-size: 10pt; color: #374151; font-weight: normal; margin: 0 0 14pt 0; }
  table { border-collapse: collapse; width: 100%; }
</style>
</head>
<body>
  <h2>Bapuji Institute of Engineering &amp; Technology, Davangere-04</h2>
  <h3>Department of Computer Science &amp; Engineering &nbsp;|&nbsp; ${title}<br>
  ${subtitle}<br>
  Generated on ${dateStr}</h3>
  <table>
    <thead><tr>${header}</tr></thead>
    <tbody>${body}</tbody>
    <tfoot>${foot}</tfoot>
  </table>
</body>
</html>`;

  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `FacultyWorkload_${mode}_${new Date().toISOString().slice(0, 10)}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function FacultyWorkloadTable({ state }: { state: AppState }) {
  const currentYear = new Date().getFullYear();
  const [academicYear, setAcademicYear] = useState(`${currentYear}-${String(currentYear + 1).slice(2)}`);
  const hook = useSemesterTimetable(academicYear);

  useEffect(() => {
    if (academicYear) hook.refresh();
  }, [academicYear]);

  const lockedSlots = useMemo(
    () => hook.timetables.filter(t => t.status === 'LOCKED').flatMap(t => t.slots),
    [hook.timetables],
  );

  const hasGenerated = lockedSlots.length > 0;

  const { rows, semesters, mode } = useMemo(() => {
    if (hasGenerated) {
      return { ...buildActualRows(lockedSlots), mode: 'actual' as const };
    }
    return { ...buildExpectedRows(state), mode: 'expected' as const };
  }, [lockedSlots, state.subjects, state.labGroups, state.electiveGroups, state.sections, hasGenerated]);

  const totalTheory = rows.reduce((a, r) => a + r.totalTheory, 0);
  const totalPractical = rows.reduce((a, r) => a + r.totalPractical, 0);
  const totalHours = rows.reduce((a, r) => a + r.totalHours, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
            <Users size={18} className="text-indigo-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">Faculty Workload</h2>
              <span className={cn(
                'text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide',
                mode === 'actual'
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-100 text-amber-700 border border-amber-200',
              )}>
                {mode === 'actual' ? 'Actual' : 'Expected'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {mode === 'actual'
                ? 'Based on locked semester timetables'
                : 'Based on configured subjects, labs and electives — before any semester is locked'}
            </p>
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Academic Year</label>
            <input
              type="text"
              value={academicYear}
              onChange={e => setAcademicYear(e.target.value)}
              placeholder="2026-27"
              className="w-28 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors shadow-sm"
            />
          </div>
          <button
            onClick={() => exportToDoc(rows, semesters, mode)}
            disabled={rows.length === 0}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-sm',
              rows.length > 0
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed',
            )}
          >
            <FileDown size={16} /> Export to DOC
          </button>
        </div>
      </div>

      {mode === 'expected' && (
        <div className="flex items-start gap-2.5 mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-700 font-medium">
          <Info size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
          <span>
            Showing <strong>expected</strong> workload from your data entry.
            Lock a semester timetable to see <strong>actual</strong> scheduled hours.
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-4">
            <Users size={24} className="text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-slate-500">No data to display</p>
          <p className="text-xs text-slate-400 mt-1">Add subjects and assign faculty to see expected workload here.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#1e3a8a]">
                  <th className="py-3 px-4 text-left text-[11px] font-bold text-white whitespace-nowrap">Sl.No</th>
                  <th className="py-3 px-4 text-left text-[11px] font-bold text-white whitespace-nowrap">Faculty Name</th>
                  {semesters.map(s => (
                    <th key={s} className="py-3 px-4 text-center text-[11px] font-bold text-white whitespace-nowrap">
                      {semLabel(s)}
                    </th>
                  ))}
                  <th className="py-3 px-4 text-center text-[11px] font-bold text-indigo-200 whitespace-nowrap">Theory Hours</th>
                  <th className="py-3 px-4 text-center text-[11px] font-bold text-pink-200 whitespace-nowrap">Practical Hours</th>
                  <th className="py-3 px-4 text-center text-[11px] font-bold text-emerald-200 whitespace-nowrap">Total Hours</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.facultyId}
                    className={cn(
                      'border-b border-slate-100 transition-colors',
                      i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/60 hover:bg-slate-100/60',
                    )}
                  >
                    <td className="py-3 px-4 text-slate-400 font-medium align-middle">{r.slNo}</td>
                    <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap align-middle">{r.facultyName}</td>

                    {semesters.map(s => {
                      const codes = r.semCodes[s] || [];
                      return (
                        <td key={s} className="py-3 px-4 text-center align-top">
                          {codes.length > 0 ? (
                            <div className="flex flex-col items-center gap-1">
                              {codes.map(code => (
                                <span
                                  key={code}
                                  className="inline-block px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-[10px] whitespace-nowrap"
                                >
                                  {code}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-200">—</span>
                          )}
                        </td>
                      );
                    })}

                    <td className="py-3 px-4 text-center align-middle">
                      <span className="inline-block px-3 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold text-[11px]">
                        {r.totalTheory}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center align-middle">
                      <span className="inline-block px-3 py-1 rounded-lg bg-pink-50 border border-pink-100 text-pink-700 font-bold text-[11px]">
                        {r.totalPractical}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center align-middle">
                      <span className="inline-block px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 font-bold text-[11px]">
                        {r.totalHours}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-200">
                  <td colSpan={2 + semesters.length} className="py-3 px-4 text-right text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                    Department Total
                  </td>
                  <td className="py-3 px-4 text-center font-bold text-indigo-700">{totalTheory}</td>
                  <td className="py-3 px-4 text-center font-bold text-pink-700">{totalPractical}</td>
                  <td className="py-3 px-4 text-center font-bold text-emerald-700">{totalHours}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-6 text-[11px] text-slate-500">
            <span><strong className="text-slate-700">{rows.length}</strong> faculty members</span>
            <span><strong className="text-indigo-600">{totalTheory}</strong> theory hrs/week</span>
            <span><strong className="text-pink-600">{totalPractical}</strong> practical hrs/week</span>
            <span><strong className="text-emerald-600">{totalHours}</strong> total hrs/week</span>
          </div>
        </div>
      )}
    </div>
  );
}
