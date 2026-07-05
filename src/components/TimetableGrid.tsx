import { DAYS, WEEKDAY_PERIODS, SATURDAY_PERIODS, PERIOD_TIMES } from '../types';
import type { Day, Period, TimetableSlot } from '../types';
import { cn } from '../utils/cn';

export type TimetableView = 'section' | 'faculty' | 'room';

const SLOT_COLORS: Record<string, string> = {
  core: 'bg-indigo-50/80 border-indigo-200/60 text-indigo-700 shadow-sm',
  elective: 'bg-purple-50/80 border-purple-200/60 text-purple-700 shadow-sm',
  lab: 'bg-pink-50/80 border-pink-200/60 text-pink-700 shadow-sm',
  'lab-cont': 'bg-pink-50/40 border-pink-200/40 text-pink-600/70 shadow-sm',
};

export function TimetableGrid({
  slots,
  viewType,
  onSlotClick,
}: {
  slots: TimetableSlot[];
  viewType: TimetableView;
  onSlotClick?: (slot: TimetableSlot) => void;
}) {
  const getSlots = (day: Day, period: Period): TimetableSlot[] =>
    slots.filter(s => s.day === day && s.period === period);

  return (
    <div className="overflow-x-auto -mx-4 px-4 pb-4">
      <table className="w-full border-collapse text-[10px] min-w-[700px] border-2 border-slate-800 rounded-lg overflow-hidden shadow-sm">
        <thead>
          <tr>
            <th className="border-2 border-slate-800 bg-slate-100 p-2.5 text-slate-600 font-bold uppercase tracking-wider w-16 text-[10px]">Day</th>
            {WEEKDAY_PERIODS.map(p => (
              <th key={p} className="border-2 border-slate-800 bg-slate-50/80 p-2.5 min-w-[120px]">
                <div className="font-bold text-slate-700">{p}</div>
                <div className="text-[9px] text-slate-500 font-medium">{PERIOD_TIMES[p]}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white">
          {DAYS.map((day, rowIndex) => {
            const dayPeriods = day === 'Saturday' ? SATURDAY_PERIODS : WEEKDAY_PERIODS;
            return (
              <tr key={day} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                <td className="border-2 border-slate-800 p-2 text-slate-700 font-bold text-center text-[10px] align-middle bg-slate-50">
                  <div className="uppercase tracking-widest">{day.slice(0, 3)}</div>
                  {day === 'Saturday' && (
                    <div className="text-[8px] tracking-wider text-amber-600 mt-1 uppercase font-bold bg-amber-50 rounded px-1 max-w-max mx-auto shadow-sm">½ day</div>
                  )}
                </td>
                {WEEKDAY_PERIODS.map(period => {
                  const isAvailable = dayPeriods.includes(period);
                  if (!isAvailable) {
                    return (
                      <td key={period} className="border-2 border-slate-800 bg-slate-100/50 p-1 text-center font-bold align-middle">
                        <div className="text-slate-300 text-[10px] select-none">—</div>
                      </td>
                    );
                  }

                  const cellSlots = getSlots(day, period);
                  return (
                    <td key={period} className="border-2 border-slate-800 p-1.5 align-top min-h-[70px]">
                      {cellSlots.length === 0 ? (
                        <div className="min-h-[50px] flex items-center justify-center text-slate-200 select-none font-bold">—</div>
                      ) : (
                        <div className="space-y-1">
                          {cellSlots.map(s => (
                            <div
                              key={s.id}
                              onClick={() => onSlotClick?.(s)}
                              className={cn(
                                'rounded-md border p-1.5 leading-tight transition-shadow',
                                s.isLabContinuation ? SLOT_COLORS['lab-cont'] : SLOT_COLORS[s.subjectType] || SLOT_COLORS.core,
                                onSlotClick && !s.isLabContinuation && 'cursor-pointer hover:shadow-md hover:ring-1 hover:ring-indigo-400/50',
                              )}
                              title={`${s.subjectName} | ${s.facultyName} | ${s.sectionName}${s.batchName ? ` [${s.batchName}]` : ''}`}
                            >
                              <div className="font-bold truncate text-[10px] leading-snug tracking-tight">{s.subjectName}</div>
                              {viewType !== 'faculty' && <div className="font-medium opacity-80 truncate text-[9px] mt-0.5">{s.facultyName}</div>}
                              {viewType !== 'section' && <div className="font-medium opacity-80 truncate text-[9px] mt-0.5">{s.sectionName}</div>}
                              {s.batchName && <div className="font-bold opacity-70 text-[8px] bg-white/40 inline-block px-1 rounded mt-0.5">[{s.batchName}]</div>}
                              {s.roomName && viewType !== 'room' && <div className="font-medium opacity-80 text-[8px] mt-0.5 flex items-center gap-0.5"><span className="opacity-50 text-[10px]">📍</span>{s.roomName}</div>}
                              {s.isLabContinuation && <div className="font-bold opacity-60 text-[8px] italic mt-0.5 uppercase tracking-wide">↳ cont.</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
