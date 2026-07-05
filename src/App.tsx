// ============================================================
// CONSTRAINT-BASED ACADEMIC TIMETABLE GENERATOR
// Complete Admin Dashboard — CSE Department
// ============================================================
import { useState, useSyncExternalStore, useCallback, useRef, useEffect } from 'react';
import {
  DAYS, WEEKDAY_PERIODS, SATURDAY_PERIODS, PERIOD_TIMES,
  DEFAULT_SCHEDULER_CONFIG,
  type Day, type Period,
  type ElectiveBatch, type LabEntry, type AppState,
  type SchedulerConfig, type ElectiveGroup, type CourseType,
} from './types';
import {
  getState, subscribe,
  addFaculty, removeFaculty,
  addSection, removeSection,
  addRoom, removeRoom,
  addSubject, removeSubject,
  addElectiveGroup, removeElectiveGroup, updateElectiveGroup,
  addLabGroup, removeLabGroup,
  addFrozenSlot, removeFrozenSlot,
  setTimetable, loadSampleData, clearAllData,
  updateConfig, startJob, appendJobLog, finishJob, updateJob,
} from './store';
import { generateTimetable } from './scheduler';
import { exportToPDF, exportToExcel } from './export';
import { TimetableGrid } from './components/TimetableGrid';
import type { TimetableView } from './components/TimetableGrid';
import { GenerateSemesterPanel } from './components/GenerateSemesterPanel';
import { DraftTimetablePanel } from './components/DraftTimetablePanel';
import { SemesterStatusPanel } from './components/SemesterStatusPanel';
import { CombinedLockedView } from './components/CombinedLockedView';

import { v4 as uuid } from 'uuid';
import {
  GraduationCap, Users, Building2, BookOpen, FlaskConical,
  Calendar, Lock, BarChart3, ChevronRight, Plus,
  Trash2, AlertTriangle, CheckCircle2, XCircle,
  Play, StopCircle, RefreshCw, GitBranch,
  ChevronDown, Save, Upload, Edit, PlusCircle,
  FileDown, FileSpreadsheet, Zap, Eye, Database, Settings, RotateCcw,
  TrendingUp, Clock, Shield, Layers, Info, Star, Activity,
} from 'lucide-react';
import { cn } from './utils/cn';

// ─── Reactive Store Hook ──────────────────────────────────
function useStore(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

// ─── Tab System ───────────────────────────────────────────
type TabKey =
  | 'dashboard' | 'faculty' | 'sections' | 'rooms'
  | 'subjects' | 'electives' | 'labs' | 'frozen'
  | 'config' | 'generate' | 'timetable' | 'validation'
  | 'generate-semester' | 'draft' | 'semester-status' | 'combined-view';

const TABS: { key: TabKey; label: string; icon: React.ReactNode; group?: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={16} />, group: 'Overview' },
  { key: 'faculty', label: 'Faculty', icon: <Users size={16} />, group: 'Data Entry' },
  { key: 'sections', label: 'Sections', icon: <GraduationCap size={16} />, group: 'Data Entry' },
  { key: 'rooms', label: 'Rooms', icon: <Building2 size={16} />, group: 'Data Entry' },
  { key: 'subjects', label: 'Subjects', icon: <BookOpen size={16} />, group: 'Data Entry' },
  { key: 'electives', label: 'Electives', icon: <GitBranch size={16} />, group: 'Data Entry' },
  { key: 'labs', label: 'Labs', icon: <FlaskConical size={16} />, group: 'Data Entry' },
  { key: 'frozen', label: 'Frozen Slots', icon: <Lock size={16} />, group: 'Data Entry' },
  { key: 'config', label: 'Scheduler Config', icon: <Settings size={16} />, group: 'Engine' },
  { key: 'generate', label: 'Generate', icon: <Zap size={16} />, group: 'Engine' },
  { key: 'generate-semester', label: 'Generate Semester', icon: <Layers size={16} />, group: 'Semester' },
  { key: 'draft', label: 'Draft Timetable', icon: <Edit size={16} />, group: 'Semester' },
  { key: 'semester-status', label: 'Semester Status', icon: <Shield size={16} />, group: 'Semester' },
  { key: 'combined-view', label: 'All Semesters', icon: <Star size={16} />, group: 'Semester' },
  { key: 'timetable', label: 'View Timetable', icon: <Calendar size={16} />, group: 'Output' },
  { key: 'validation', label: 'Validation', icon: <Shield size={16} />, group: 'Output' },
];

// ─── Main App ─────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const state = useStore();

  useEffect(() => {
    import('./store').then(m => m.initializeStore()).then(() => setIsInitialized(true));
  }, []);

  const groups = ['Overview', 'Data Entry', 'Engine', 'Semester', 'Output'];

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-white text-slate-800 flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-lg font-bold text-slate-700">Connecting...</h2>
          <p className="text-xs text-slate-500 mt-2">Loading your schedule data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-800 flex font-sans">
      {/* ── Sidebar ── */}
      <aside className={cn(
        'bg-[#1A192B] border-r border-[#131221] flex flex-col transition-all duration-300 flex-shrink-0 z-20 shadow-xl',
        sidebarOpen ? 'w-64' : 'w-16',
      )}>
        {/* Logo Area */}
        <div className="p-5 border-b border-white/5 flex items-center gap-3 min-h-[72px]">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
            <Calendar size={16} className="text-white" />
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden whitespace-nowrap">
              <h1 className="text-sm font-bold text-white tracking-wide">Timetable Pro</h1>
              <p className="text-[10px] text-indigo-200 mt-0.5">Academic Scheduler</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 scrollbar-thin">
          {groups.map((group, groupIndex) => {
            const groupTabs = TABS.filter(t => t.group === group);
            return (
              <div key={group} className={cn(groupIndex > 0 && "mt-4")}>
                {sidebarOpen && (
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-5 pb-2">{group}</p>
                )}
                {groupTabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    title={!sidebarOpen ? tab.label : undefined}
                    className={cn(
                      'w-full flex items-center gap-3 px-5 py-2.5 text-[13px] font-medium transition-all group',
                      sidebarOpen ? 'mx-0' : 'justify-center px-0',
                      activeTab === tab.key
                        ? 'bg-indigo-500/10 text-indigo-400 border-r-2 border-indigo-500'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                    )}
                  >
                    <span className={cn('flex-shrink-0 transition-colors', activeTab === tab.key ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300')}>{tab.icon}</span>
                    {sidebarOpen && <span className="truncate">{tab.label}</span>}
                    {sidebarOpen && activeTab === tab.key && (
                      <ChevronRight size={14} className="ml-auto text-indigo-400" />
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        {/* Status Bar */}
        {sidebarOpen && (
          <div className="px-5 py-4 border-t border-white/5">
            <div className="flex items-center gap-2.5">
              <div className={cn(
                'w-2 h-2 rounded-full shadow-sm',
                state.currentTimetable ? 'bg-emerald-400 shadow-emerald-400/50 animate-pulse' : 'bg-slate-600',
              )} />
              <span className="text-[11px] font-medium text-slate-400">
                {state.currentTimetable ? `${state.currentTimetable.length} slots generated` : 'No timetable yet'}
              </span>
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-3 border-t border-white/5 text-slate-500 hover:text-slate-300 hover:bg-white/5 flex items-center justify-center transition-colors"
        >
          <ChevronRight size={16} className={cn('transition-transform duration-300', sidebarOpen && 'rotate-180')} />
        </button>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="max-w-7xl mx-auto p-5">
          {activeTab === 'dashboard' && <DashboardPanel state={state} setActiveTab={setActiveTab} />}
          {activeTab === 'faculty' && <FacultyPanel state={state} />}
          {activeTab === 'sections' && <SectionsPanel state={state} />}
          {activeTab === 'rooms' && <RoomsPanel state={state} />}
          {activeTab === 'subjects' && <SubjectsPanel state={state} />}
          {activeTab === 'electives' && <ElectivesPanel state={state} />}
          {activeTab === 'labs' && <LabsPanel state={state} />}
          {activeTab === 'frozen' && <FrozenPanel state={state} />}
          {activeTab === 'config' && <ConfigPanel state={state} />}
          {activeTab === 'generate' && <GeneratePanel state={state} setActiveTab={setActiveTab} />}
          {activeTab === 'generate-semester' && <GenerateSemesterPanel state={state} onNavigateToDraft={() => setActiveTab('draft')} />}
          {activeTab === 'draft' && <DraftTimetablePanel state={state} />}
          {activeTab === 'semester-status' && <SemesterStatusPanel />}
          {activeTab === 'combined-view' && <CombinedLockedView />}
          {activeTab === 'timetable' && <TimetablePanel state={state} />}
          {activeTab === 'validation' && <ValidationPanel state={state} />}
        </div>
      </main>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white border border-slate-200/60 shadow-sm rounded-xl p-6', className)}>
      {children}
    </div>
  );
}

function PageHeader({
  title, subtitle, icon, actions, badge,
}: {
  title: string; subtitle?: string; icon: React.ReactNode;
  actions?: React.ReactNode; badge?: { text: string; color: string };
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
            {badge && (
              <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', badge.color)}>
                {badge.text}
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions}
    </div>
  );
}

function StatCard({
  label, value, icon, color, subtitle,
}: {
  label: string; value: string | number; icon: React.ReactNode; color: string; subtitle?: string;
}) {
  return (
    <Card className="flex items-center gap-4">
      <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-opacity-10', color)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold text-slate-800 leading-none">{value}</p>
        <p className="text-[11px] font-medium text-slate-500 mt-1">{label}</p>
        {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </Card>
  );
}

function Btn({
  children, onClick, variant = 'primary', size = 'md',
  disabled, className, type = 'button',
}: {
  children: React.ReactNode; onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg'; disabled?: boolean; className?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed select-none',
        size === 'sm' && 'px-2.5 py-1.5 text-[11px]',
        size === 'md' && 'px-3.5 py-2 text-xs',
        size === 'lg' && 'px-5 py-2.5 text-sm',
        variant === 'primary' && 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20',
        variant === 'secondary' && 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm',
        variant === 'danger' && 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100',
        variant === 'ghost' && 'hover:bg-slate-100 text-slate-500 hover:text-slate-700',
        variant === 'success' && 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20',
        variant === 'success' && 'bg-green-600 hover:bg-green-500 text-white shadow-sm shadow-green-500/20',
        className,
      )}
    >
      {children}
    </button>
  );
}

function Input({
  label, value, onChange, placeholder, type = 'text', required, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors shadow-sm",
          disabled && "opacity-60 bg-slate-100 cursor-not-allowed"
        )}
      />
    </div>
  );
}

function Select({
  label, value, onChange, options, required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors shadow-sm"
      >
        <option value="">Select...</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-4">
        <Info size={24} className="text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-500">{message}</p>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────
function DashboardPanel({ state, setActiveTab }: { state: AppState; setActiveTab: (t: TabKey) => void }) {
  const v = state.currentValidation;

  const semesterBreakdown = [1, 2, 3, 4, 5, 6, 7, 8].map(sem => ({
    sem,
    sections: state.sections.filter(s => s.semester === sem).length,
    subjects: state.subjects.filter(s => s.semester === sem).length,
  })).filter(s => s.sections > 0 || s.subjects > 0);

  return (
    <div>
      <PageHeader
        title="Admin Dashboard"
        subtitle="Constraint-Based Academic Timetable Generator — CSE Department"
        icon={<BarChart3 size={18} className="text-blue-400" />}
        actions={
          <div className="flex gap-2">
            <Btn variant="secondary" onClick={() => {
              if (window.confirm('Load sample data? This will reset all current data.')) loadSampleData();
            }}>
              <Database size={12} /> Load Sample Data
            </Btn>
            <Btn variant="danger" onClick={() => {
              if (window.confirm('Clear ALL data? This cannot be undone.')) clearAllData();
            }}>
              <Trash2 size={12} /> Clear All
            </Btn>
          </div>
        }
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Faculty" value={state.faculty.length} icon={<Users size={20} className="text-indigo-600" />} color="bg-indigo-50" subtitle="Teaching staff" />
        <StatCard label="Sections" value={state.sections.length} icon={<GraduationCap size={20} className="text-emerald-600" />} color="bg-emerald-50" subtitle="Class sections" />
        <StatCard label="Rooms" value={state.rooms.length} icon={<Building2 size={20} className="text-violet-600" />} color="bg-violet-50" subtitle={`${state.rooms.filter(r => r.type === 'lab').length} labs`} />
        <StatCard label="Subjects" value={state.subjects.length} icon={<BookOpen size={20} className="text-orange-600" />} color="bg-orange-50" subtitle="Core subjects" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Elective Groups" value={state.electiveGroups.length} icon={<GitBranch size={20} className="text-cyan-600" />} color="bg-cyan-50" />
        <StatCard label="Lab Groups" value={state.labGroups.length} icon={<FlaskConical size={20} className="text-pink-600" />} color="bg-pink-50" />
        <StatCard label="Frozen Slots" value={state.frozenSlots.length} icon={<Lock size={20} className="text-amber-600" />} color="bg-amber-50" />
        <StatCard label="Generated Slots" value={state.currentTimetable?.length || 0} icon={<Calendar size={20} className="text-blue-600" />} color="bg-blue-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        {/* Semester Breakdown */}
        <Card>
          <h3 className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-2"><Layers size={14} /> Semester Breakdown</h3>
          {semesterBreakdown.length === 0 ? (
            <p className="text-xs text-gray-600">No data yet</p>
          ) : (
            <div className="space-y-2">
              {semesterBreakdown.map(s => (
                <div key={s.sem} className="flex items-center gap-2">
                  <Badge color="bg-blue-500/10 text-blue-400">Sem {s.sem}</Badge>
                  <span className="text-xs text-gray-400">{s.sections} sections</span>
                  <span className="text-gray-700">·</span>
                  <span className="text-xs text-gray-400">{s.subjects} subjects</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-xs font-semibold text-slate-500 mb-4 flex items-center gap-2 uppercase tracking-wider"><Activity size={14} /> Scheduling Phases</h3>
          <ol className="space-y-2">
            {[
              'Preprocessing — Faculty-section mapping',
              'Freeze College Slots',
              'Schedule Electives (concurrent)',
              'Schedule Labs (rotation matrix)',
              'Schedule Theory (MRV heuristic)',
              'Local Search Optimization',
              'Constraint Validation',
            ].map((phase, i) => (
              <li key={i} className="flex items-center gap-2.5 text-[11px] font-medium text-slate-600">
                <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-500 flex-shrink-0 font-bold">
                  {i}
                </span>
                {phase}
              </li>
            ))}
          </ol>
        </Card>

        {/* Constraints */}
        <Card>
          <h3 className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-2"><Shield size={14} /> Constraints</h3>
          <div className="mb-3">
            <p className="text-[10px] font-semibold text-red-400 mb-1.5">HARD (must satisfy)</p>
            <ul className="space-y-1">
              {['No faculty clashes', 'No section clashes', 'No room clashes',
                'Lab = 2 consecutive periods', 'Elective concurrency',
                'Saturday half-day rule', 'Frozen slots preserved'].map(c => (
                  <li key={c} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    <XCircle size={10} className="text-red-400/60 flex-shrink-0" />{c}
                  </li>
                ))}
            </ul>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-yellow-400 mb-1.5">SOFT (minimize violations)</p>
            <ul className="space-y-1">
              {['Max 3 morning classes/faculty', 'Gap between classes', 'Workload balance ±1hr',
                'Spread subjects across days'].map(c => (
                  <li key={c} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    <AlertTriangle size={10} className="text-yellow-400/60 flex-shrink-0" />{c}
                  </li>
                ))}
            </ul>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="mb-5 bg-indigo-600 border-indigo-500 text-white">
        <h3 className="text-xs font-semibold text-indigo-200 mb-3 uppercase tracking-wider">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Btn variant="secondary" onClick={() => setActiveTab('faculty')} className="justify-center border-transparent"><Users size={14} /> Faculty</Btn>
          <Btn variant="secondary" onClick={() => setActiveTab('sections')} className="justify-center border-transparent"><GraduationCap size={14} /> Sections</Btn>
          <Btn variant="secondary" onClick={() => setActiveTab('subjects')} className="justify-center border-transparent"><BookOpen size={14} /> Subjects</Btn>
          <Btn variant="success" onClick={() => setActiveTab('generate')} className="justify-center shadow-lg"><Zap size={14} /> Generate</Btn>
        </div>
      </Card>

      {/* Validation Summary */}
      {v && (
        <Card>
          <h3 className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-2">
            <Star size={14} /> Last Generation Result
          </h3>
          <div className="flex items-center gap-2 mb-4">
            {v.valid
              ? <><CheckCircle2 size={18} className="text-green-400" /><span className="text-sm font-semibold text-green-400">Timetable is VALID — All hard constraints satisfied</span></>
              : <><XCircle size={18} className="text-red-400" /><span className="text-sm font-semibold text-red-400">{v.errors.length} Error(s) — Hard constraints violated</span></>
            }
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[
              { label: 'Total Slots', val: v.stats.totalSlots, color: 'text-white' },
              { label: 'Faculty Clashes', val: v.stats.facultyClashes, color: v.stats.facultyClashes > 0 ? 'text-red-400' : 'text-green-400' },
              { label: 'Room Clashes', val: v.stats.roomClashes, color: v.stats.roomClashes > 0 ? 'text-red-400' : 'text-green-400' },
              { label: 'Section Clashes', val: v.stats.sectionClashes, color: v.stats.sectionClashes > 0 ? 'text-red-400' : 'text-green-400' },
              { label: 'Soft Violations', val: v.stats.softViolations, color: v.stats.softViolations > 0 ? 'text-yellow-400' : 'text-green-400' },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
                <p className={cn('text-xl font-bold', s.color)}>{s.val}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Faculty Panel ────────────────────────────────────────
function FacultyPanel({ state }: { state: AppState }) {
  const [name, setName] = useState('');
  const [dept, setDept] = useState('CSE');
  const [maxHrs, setMaxHrs] = useState('20');

  const handleAdd = () => {
    if (!name.trim()) return;
    addFaculty(name.trim(), dept || 'CSE', parseInt(maxHrs) || 20);
    setName('');
  };

  // Compute workload from current timetable
  const workload = new Map<string, number>();
  if (state.currentTimetable) {
    for (const s of state.currentTimetable) {
      if (!s.isLabContinuation) {
        workload.set(s.facultyId, (workload.get(s.facultyId) || 0) + 1);
      }
    }
  }

  return (
    <div>
      <PageHeader
        title="Faculty Management"
        subtitle="Add and manage teaching staff with department assignments"
        icon={<Users size={18} className="text-blue-400" />}
        badge={{ text: `${state.faculty.length} members`, color: 'bg-blue-500/10 text-blue-400' }}
      />

      <Card className="mb-4">
        <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider">Add Faculty Member</h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Input label="Full Name" value={name} onChange={setName} placeholder="Dr. John Smith" required />
          <Input label="Department" value={dept} onChange={setDept} placeholder="CSE" />
          <Input label="Max Hours/Week" value={maxHrs} onChange={setMaxHrs} type="number" placeholder="20" />
        </div>
        <Btn onClick={handleAdd} disabled={!name.trim()}><Plus size={12} /> Add Faculty</Btn>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-slate-600">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 font-semibold">#</th>
                <th className="text-left py-3 px-4 font-semibold">Name</th>
                <th className="text-left py-3 px-4 font-semibold">Department</th>
                <th className="text-left py-3 px-4 font-semibold">Max Hrs</th>
                <th className="text-left py-3 px-4 font-semibold">Scheduled</th>
                <th className="text-right py-3 px-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.faculty.map((f, i) => {
                const hrs = workload.get(f.id) || 0;
                const pct = f.maxHoursPerWeek ? Math.min(100, Math.round((hrs / f.maxHoursPerWeek) * 100)) : 0;
                return (
                  <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 text-slate-400">{i + 1}</td>
                    <td className="py-3 px-4 font-bold text-slate-800">{f.name}</td>
                    <td className="py-3 px-4">
                      <Badge color={f.department === 'CSE' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}>
                        {f.department}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-medium">{f.maxHoursPerWeek || '—'}</td>
                    <td className="py-3 px-4">
                      {state.currentTimetable ? (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full', pct > 80 ? 'bg-orange-500' : 'bg-blue-500')}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-slate-600 font-medium">{hrs} <span className="text-[10px] text-slate-400">hrs</span></span>
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Btn variant="ghost" size="sm" onClick={() => removeFaculty(f.id)}><Trash2 size={11} /></Btn>
                    </td>
                  </tr>
                );
              })}
              {state.faculty.length === 0 && (
                <tr><td colSpan={6}><EmptyState message="No faculty added yet" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Sections Panel ───────────────────────────────────────
function SectionsPanel({ state }: { state: AppState }) {
  const [name, setName] = useState('');
  const [semester, setSemester] = useState('4');
  const [batchStr, setBatchStr] = useState('');
  const [strength, setStrength] = useState('60');

  const handleAdd = () => {
    if (!name.trim()) return;
    const batches = batchStr.split(',').map(b => b.trim()).filter(Boolean);
    const finalBatches = batches.length > 0
      ? batches
      : [`${name.trim()}-D1`, `${name.trim()}-D2`];
    addSection(name.trim(), parseInt(semester), finalBatches, parseInt(strength) || 60);
    setName(''); setBatchStr('');
  };

  const bySemester = [1, 2, 3, 4, 5, 6, 7, 8].map(sem => ({
    sem,
    sections: state.sections.filter(s => s.semester === sem),
  })).filter(g => g.sections.length > 0);

  return (
    <div>
      <PageHeader
        title="Sections"
        subtitle="Class sections with batch subdivisions for lab scheduling"
        icon={<GraduationCap size={18} className="text-emerald-400" />}
        badge={{ text: `${state.sections.length} sections`, color: 'bg-emerald-500/10 text-emerald-400' }}
      />

      <Card className="mb-4">
        <h3 className="text-xs font-semibold text-slate-500 mb-4 flex items-center gap-2 uppercase tracking-wider">Add Section</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <Input label="Section Name" value={name} onChange={setName} placeholder="4A" required />
          <Select label="Semester" value={semester} onChange={setSemester}
            options={[1, 2, 3, 4, 5, 6, 7, 8].map(s => ({ value: String(s), label: `Semester ${s}` }))} />
          <Input label="Batches (comma-sep)" value={batchStr} onChange={setBatchStr} placeholder="4A-D1, 4A-D2" />
          <Input label="Strength" value={strength} onChange={setStrength} type="number" placeholder="60" />
        </div>
        <div className="flex items-center gap-2 mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
          <Info size={14} className="text-slate-400" />
          <span className="text-[11px] text-slate-500 font-medium">If batches are empty, auto-generates D1, D2. Sections are divided into batches for concurrent lab scheduling.</span>
        </div>
        <Btn onClick={handleAdd} disabled={!name.trim()}><Plus size={14} /> Add Section</Btn>
      </Card>

      {bySemester.map(({ sem, sections }) => (
        <Card key={sem} className="mb-4">
          <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider">Semester {sem}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sections.map(s => (
              <div key={s.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm hover:border-slate-300 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-extrabold text-slate-800">{s.name}</p>
                    <p className="text-[11px] font-medium text-slate-500 mt-0.5">{s.strength || 60} <span className="text-[10px] text-slate-400">students</span></p>
                  </div>
                  <Btn variant="ghost" size="sm" onClick={() => removeSection(s.id)}><Trash2 size={12} /></Btn>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {s.batches.map(b => (
                    <Badge key={b} color="bg-emerald-50 text-emerald-600 border border-emerald-100">{b}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {state.sections.length === 0 && <Card><EmptyState message="No sections added yet" /></Card>}
    </div>
  );
}

// ─── Rooms Panel ──────────────────────────────────────────
function RoomsPanel({ state }: { state: AppState }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'classroom' | 'lab'>('classroom');


  const classrooms = state.rooms.filter(r => r.type === 'classroom');
  const labs = state.rooms.filter(r => r.type === 'lab');

  return (
    <div>
      <PageHeader
        title="Rooms & Labs"
        subtitle="Classrooms and laboratory rooms for scheduling"
        icon={<Building2 size={18} className="text-violet-400" />}
        badge={{ text: `${state.rooms.length} rooms`, color: 'bg-violet-500/10 text-violet-400' }}
      />

      <Card className="mb-5">
        <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider">Add Room</h3>
        <div className="flex gap-4 items-end">
          <div className="flex-1"><Input label="Room Name" value={name} onChange={setName} placeholder="CR-101" required /></div>
          <div className="w-36">
            <Select label="Type" value={type} onChange={v => setType(v as 'classroom' | 'lab')}
              options={[{ value: 'classroom', label: 'Classroom' }, { value: 'lab', label: 'Lab Room' }]} />
          </div>
          <Btn onClick={() => { if (name.trim()) { addRoom(name.trim(), type); setName(''); } }} className="mb-[1px]">
            <Plus size={14} /> Add
          </Btn>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-xs font-semibold text-slate-500 mb-4 flex items-center gap-2 uppercase tracking-wider">
            <Building2 size={14} className="text-indigo-400" /> Classrooms ({classrooms.length})
          </h3>
          <div className="space-y-2.5">
            {classrooms.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm hover:border-slate-300 transition-colors">
                <div>
                  <span className="text-sm font-bold text-slate-700">{r.name}</span>
                </div>
                <Btn variant="ghost" size="sm" onClick={() => removeRoom(r.id)}><Trash2 size={12} /></Btn>
              </div>
            ))}
            {classrooms.length === 0 && <EmptyState message="No classrooms added" />}
          </div>
        </Card>

        <Card>
          <h3 className="text-xs font-semibold text-slate-500 mb-4 flex items-center gap-2 uppercase tracking-wider">
            <FlaskConical size={14} className="text-pink-400" /> Lab Rooms ({labs.length})
          </h3>
          <div className="space-y-2.5">
            {labs.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-pink-50 border border-pink-100 rounded-xl px-4 py-3 shadow-sm hover:border-pink-200 transition-colors">
                <div>
                  <span className="text-sm font-bold text-slate-800">{r.name}</span>
                </div>
                <Btn variant="ghost" size="sm" onClick={() => removeRoom(r.id)}><Trash2 size={12} /></Btn>
              </div>
            ))}
            {labs.length === 0 && <EmptyState message="No lab rooms added" />}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Subjects Panel ───────────────────────────────────────
function SubjectsPanel({ state }: { state: AppState }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [semester, setSemester] = useState('4');
  const [hours, setHours] = useState('4');
  const [type, setType] = useState<CourseType>('core');
  const [selectedFaculty, setSelectedFaculty] = useState<string[]>([]);

  const handleTypeChange = (newType: string) => {
    const t = newType as CourseType;
    setType(t);
    if (t === 'lab') setHours('2');
    else setHours('4');
  };

  const toggleFaculty = (fid: string) => {
    setSelectedFaculty(prev =>
      prev.includes(fid) ? prev.filter(f => f !== fid) : [...prev, fid],
    );
  };

  const handleAdd = () => {
    if (!name.trim() || !code.trim() || selectedFaculty.length === 0) return;
    addSubject({
      name: name.trim(), code: code.trim(),
      semester: parseInt(semester), type,
      hoursPerWeek: type === 'lab' ? 2 : (parseInt(hours) || 4),
      facultyIds: selectedFaculty,
    });
    setName(''); setCode(''); setSelectedFaculty([]); setType('core'); setHours('4');
  };

  // Compute faculty→section mapping preview
  const semSections = state.sections.filter(s => s.semester === parseInt(semester));
  const preview = semSections.map((sec, i) => {
    if (selectedFaculty.length === 0) return null;
    const facId = selectedFaculty[i % selectedFaculty.length];
    const fac = state.faculty.find(f => f.id === facId);
    return { section: sec.name, faculty: fac?.name || '?' };
  }).filter(Boolean);

  return (
    <div>
      <PageHeader
        title="Subjects"
        subtitle="Core and lab subjects for all sections — system auto-assigns faculty"
        icon={<BookOpen size={18} className="text-orange-400" />}
        badge={{ text: `${state.subjects.length} subjects`, color: 'bg-orange-500/10 text-orange-400' }}
      />

      <Card className="mb-5">
        <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider">Add Subject</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
          <Input label="Subject Name" value={name} onChange={setName} placeholder="Machine Learning" required />
          <Input label="Code" value={code} onChange={setCode} placeholder="CS401" required />
          <Select label="Semester" value={semester} onChange={setSemester}
            options={[1, 2, 3, 4, 5, 6, 7, 8].map(s => ({ value: String(s), label: `Semester ${s}` }))} />
          <Select label="Type" value={type} onChange={handleTypeChange}
            options={[{ value: 'core', label: 'Theory / Core' }, { value: 'lab', label: 'Laboratory' }]} />
          <Input label="Hours/Week" value={hours} onChange={v => { if (type !== 'lab') setHours(v); }} type="number" disabled={type === 'lab'} />
        </div>
        {type === 'lab' && (
          <div className="mb-4 p-3 bg-pink-50 border border-pink-100 rounded-lg flex items-center gap-2">
            <Info size={14} className="text-pink-500 flex-shrink-0" />
            <p className="text-[11px] font-medium text-pink-600">
              Lab subjects are locked to 2 hours/week (1 session = 2 continuous periods).
            </p>
          </div>
        )}

        <label className="block text-[11px] font-semibold text-slate-600 mb-2 uppercase tracking-wide">
          Faculty Pool <span className="text-[10px] text-slate-400 lowercase font-normal ml-1">(click to select — auto-assigned to sections)</span>
        </label>
        <div className="flex flex-wrap gap-2 mb-4">
          {state.faculty.map(f => (
            <button key={f.id} onClick={() => toggleFaculty(f.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-all shadow-sm',
                selectedFaculty.includes(f.id)
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-1 ring-indigo-500/30'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800',
              )}>
              {f.name}
            </button>
          ))}
          {state.faculty.length === 0 && <span className="text-xs text-slate-400 font-medium">Add faculty first</span>}
        </div>

        {/* Faculty-section mapping preview */}
        {preview.length > 0 && (
          <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-xl shadow-inner">
            <p className="text-[11px] font-bold text-slate-500 mb-2.5 uppercase tracking-wider">Auto-assignment Preview</p>
            <div className="flex flex-wrap gap-2.5">
              {preview.map((p, i) => (
                <div key={i} className="text-[11px] font-medium bg-white border border-slate-200 rounded-md shadow-sm px-2.5 py-1.5 flex items-center gap-1.5">
                  <span className="text-slate-500">{p!.section}</span>
                  <ChevronRight size={10} className="text-slate-300" />
                  <span className="text-indigo-600 font-bold">{p!.faculty}</span>
                </div>
              ))}
            </div>
            {selectedFaculty.length < semSections.length && (
              <p className="text-[11px] font-medium text-amber-600 mt-3 flex items-center gap-1.5">
                <AlertTriangle size={12} />
                Faculty count ({selectedFaculty.length}) is less than sections ({semSections.length}) — faculty will wrap (ensure no clashes).
              </p>
            )}
          </div>
        )}

        <Btn onClick={handleAdd} disabled={!name.trim() || !code.trim() || selectedFaculty.length === 0}>
          <Plus size={14} /> Add Subject
        </Btn>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-slate-600">
            <thead>
              <tr className="border-b border-slate-200">
                {['Name', 'Code', 'Sem', 'Type', 'Hrs/Wk', 'Faculty Pool', 'Actions'].map(h => (
                  <th key={h} className="text-left py-3 px-4 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.subjects.map(s => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-800">{s.name}</td>
                  <td className="py-3 px-4"><Badge color="bg-slate-100 text-slate-600 border border-slate-200">{s.code}</Badge></td>
                  <td className="py-3 px-4"><Badge color="bg-indigo-50 text-indigo-600 border border-indigo-100">Sem {s.semester}</Badge></td>
                  <td className="py-3 px-4">
                    <Badge color={s.type === 'lab' ? 'bg-pink-50 text-pink-600 border border-pink-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}>
                      {s.type === 'lab' ? 'Laboratory' : 'Core Theory'}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-500">{s.hoursPerWeek} <span className="text-[10px] text-slate-400">hrs</span></td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1.5">
                      {s.facultyIds.map(fid => (
                        <Badge key={fid} color="bg-white text-slate-600 border border-slate-200 shadow-sm">
                          {state.faculty.find(f => f.id === fid)?.name || '?'}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Btn variant="ghost" size="sm" onClick={() => removeSubject(s.id)}><Trash2 size={12} /></Btn>
                  </td>
                </tr>
              ))}
              {state.subjects.length === 0 && (
                <tr><td colSpan={7}><EmptyState message="No subjects added yet" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Electives Panel ──────────────────────────────────────
function ElectivesPanel({ state }: { state: AppState }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [semester, setSemester] = useState('4');
  const [classesPerWeek, setClassesPerWeek] = useState('1');
  const [isFrozen, setIsFrozen] = useState(false);
  const [frozenDay, setFrozenDay] = useState<Day>('Wednesday');
  const [frozenPeriod, setFrozenPeriod] = useState<Period>('P3');
  const [batches, setBatches] = useState<ElectiveBatch[]>([
    { id: uuid(), name: '', facultyId: '', subjectName: '', hasLab: false, labFacultyId: '', labRoomId: '' },
  ]);

  const addBatch = () => setBatches(prev => [...prev, { id: uuid(), name: '', facultyId: '', subjectName: '', hasLab: false, labFacultyId: '', labRoomId: '' }]);
  const removeBatch = (id: string) => setBatches(prev => prev.filter(b => b.id !== id));
  const updateBatch = (id: string, field: keyof ElectiveBatch, val: string) => {
    setBatches(prev => prev.map(b => b.id === id ? { ...b, [field]: val } : b));
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setSemester('4');
    setClassesPerWeek('1');
    setIsFrozen(false);
    setFrozenDay('Wednesday');
    setFrozenPeriod('P3');
    setBatches([{ id: uuid(), name: '', facultyId: '', subjectName: '', hasLab: false, labFacultyId: '', labRoomId: '' }]);
  };

  const handleEdit = (eg: ElectiveGroup) => {
    setEditingId(eg.id);
    setName(eg.name);
    setSemester(String(eg.semester));
    setClassesPerWeek(String(eg.classesPerWeek ?? 1));
    setIsFrozen(eg.isFrozen);
    if (eg.frozenDay) setFrozenDay(eg.frozenDay);
    if (eg.frozenPeriod) setFrozenPeriod(eg.frozenPeriod);
    setBatches(eg.batches.length > 0 ? eg.batches.map(b => ({ ...b })) : [{ id: uuid(), name: '', facultyId: '', subjectName: '', hasLab: false, labFacultyId: '', labRoomId: '' }]);
  };

  const handleAdd = () => {
    if (!name.trim() || batches.every(b => !b.name.trim())) return;
    const validBatches = batches.filter(b => b.name.trim());

    if (editingId) {
      updateElectiveGroup(editingId, {
        name: name.trim(),
        semester: parseInt(semester),
        classesPerWeek: parseInt(classesPerWeek) || 1,
        isFrozen,
        frozenDay: isFrozen ? frozenDay : undefined,
        frozenPeriod: isFrozen ? frozenPeriod : undefined,
        batches: validBatches,
      });
    } else {
      addElectiveGroup({
        name: name.trim(),
        semester: parseInt(semester),
        classesPerWeek: parseInt(classesPerWeek) || 1,
        isFrozen,
        frozenDay: isFrozen ? frozenDay : undefined,
        frozenPeriod: isFrozen ? frozenPeriod : undefined,
        batches: validBatches,
      });
    }
    resetForm();
  };

  return (
    <div>
      <PageHeader
        title="Elective Groups"
        subtitle="Configure elective courses — all batches run concurrently in the same slot"
        icon={<GitBranch size={18} className="text-cyan-400" />}
        badge={{ text: `${state.electiveGroups.length} groups`, color: 'bg-cyan-500/10 text-cyan-400' }}
      />

      <Card className="mb-5">
        <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider">
          {editingId ? 'Edit Elective Group' : 'Add Elective Group'}
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Input label="Group Name" value={name} onChange={setName} placeholder="4th Sem Elective Slot" required />
          <Select label="Semester" value={semester} onChange={setSemester}
            options={[1, 2, 3, 4, 5, 6, 7, 8].map(s => ({ value: String(s), label: `Semester ${s}` }))} />
          <Input label="Classes/Week" value={classesPerWeek} onChange={setClassesPerWeek} type="number" placeholder="1" />
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox" checked={isFrozen}
                onChange={e => setIsFrozen(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer"
              />
              <span className="text-xs font-medium text-slate-600 select-none">Frozen Slot (Math dept controlled)</span>
            </label>
          </div>
        </div>

        {isFrozen && (
          <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-amber-50 border border-amber-200/60 rounded-xl shadow-inner">
            <div className="flex items-center gap-2 col-span-2 mb-1">
              <Lock size={14} className="text-amber-500" />
              <span className="text-[11px] text-amber-600 font-bold">4th Semester: Math department controls this slot. CSE elective must run at the same time.</span>
            </div>
            <Select label="Frozen Day" value={frozenDay} onChange={v => setFrozenDay(v as Day)}
              options={DAYS.map(d => ({ value: d, label: d }))} />
            <Select label="Frozen Period" value={frozenPeriod} onChange={v => setFrozenPeriod(v as Period)}
              options={WEEKDAY_PERIODS.map(p => ({ value: p, label: `${p} (${PERIOD_TIMES[p]})` }))} />
          </div>
        )}

        {!isFrozen && (
          <div className="mb-4 p-3 bg-cyan-50 border border-cyan-100 rounded-xl flex items-center gap-2">
            <Info size={14} className="text-cyan-600 flex-shrink-0" />
            <p className="text-[11px] font-medium text-cyan-700">
              6th Semester mode: The algorithm will automatically find the best concurrent slot for all elective batches.
            </p>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-[11px] font-semibold text-slate-600 mb-2.5 uppercase tracking-wide">Elective Batches</label>
          <div className="space-y-3">
            {batches.map((b, idx) => (
              <div key={b.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl shadow-sm">
                <div className="grid grid-cols-3 gap-2 items-center mb-2">
                  <input
                    value={b.name}
                    onChange={e => updateBatch(b.id, 'name', e.target.value)}
                    placeholder={`Batch ${idx + 1} name`}
                    className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors shadow-sm"
                  />
                  <select
                    value={b.facultyId}
                    onChange={e => updateBatch(b.id, 'facultyId', e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-colors shadow-sm"
                  >
                    <option value="">Theory Faculty...</option>
                    {state.faculty.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <div className="flex gap-2 items-center">
                    <input
                      value={b.subjectName}
                      onChange={e => updateBatch(b.id, 'subjectName', e.target.value)}
                      placeholder="Subject name"
                      className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors shadow-sm"
                    />
                    {batches.length > 1 && (
                      <Btn variant="ghost" size="sm" onClick={() => removeBatch(b.id)}><Trash2 size={11} /></Btn>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-3 pl-1 border-t border-slate-200 pt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox" checked={!!b.hasLab}
                      onChange={e => updateBatch(b.id, 'hasLab', String(e.target.checked))}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-colors"
                    />
                    <span className="text-[11px] font-semibold text-slate-600 select-none">Has Lab Session?</span>
                  </label>

                  {b.hasLab && (
                    <>
                      <select
                        value={b.labFacultyId || ''}
                        onChange={e => updateBatch(b.id, 'labFacultyId', e.target.value)}
                        className="bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-[11px] text-slate-700 flex-1 shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                      >
                        <option value="">Lab Faculty (Optional, defaults to Theory)...</option>
                        {state.faculty.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                      <select
                        value={b.labRoomId || ''}
                        onChange={e => updateBatch(b.id, 'labRoomId', e.target.value)}
                        className="bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-[11px] text-slate-700 flex-1 shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                      >
                        <option value="">Lab Room...</option>
                        {state.rooms.filter(r => r.type === 'lab').map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Btn variant="secondary" size="sm" onClick={addBatch} className="mt-3">
            <Plus size={12} /> Add Batch
          </Btn>
        </div>

        <div className="flex gap-2">
          <Btn onClick={handleAdd} disabled={!name.trim() || batches.every(b => !b.name.trim())}>
            {editingId ? <><Edit size={12} /> Update Elective Group</> : <><Plus size={12} /> Save Elective Group</>}
          </Btn>
          {editingId && (
            <Btn variant="secondary" onClick={resetForm}>
              Cancel
            </Btn>
          )}
        </div>
      </Card>

      <div className="space-y-3">
        {state.electiveGroups.map(eg => (
          <Card key={eg.id} className="hover:border-slate-300 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2.5 mb-1.5">
                  <h3 className="text-sm font-bold text-slate-800">{eg.name}</h3>
                  <Badge color="bg-indigo-50 text-indigo-600 border border-indigo-100">Sem {eg.semester}</Badge>
                  {eg.isFrozen
                    ? <Badge color="bg-amber-50 text-amber-600 border border-amber-200"><Lock size={10} className="mr-1.5 inline mb-[2px]" />Frozen: {eg.frozenDay} {eg.frozenPeriod}</Badge>
                    : <Badge color="bg-cyan-50 text-cyan-600 border border-cyan-100">Auto-slot</Badge>
                  }
                </div>
                <p className="text-[11px] font-medium text-slate-500">{eg.batches.length} concurrent batches · {eg.classesPerWeek ?? 1}×/week</p>
              </div>
              <div className="flex gap-1">
                <Btn variant="ghost" size="sm" onClick={() => handleEdit(eg)}><Edit size={11} className="text-blue-400" /></Btn>
                <Btn variant="ghost" size="sm" onClick={() => removeElectiveGroup(eg.id)}><Trash2 size={11} /></Btn>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {eg.batches.map(b => (
                <div key={b.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 shadow-sm">
                  <p className="text-[11px] font-bold text-slate-700 mb-1">{b.name}</p>
                  <p className="text-[10px] font-medium text-indigo-500 truncate">{b.subjectName}</p>
                  <p className="text-[10px] text-slate-500 truncate mt-0.5">{state.faculty.find(f => f.id === b.facultyId)?.name || '?'}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
        {state.electiveGroups.length === 0 && <Card><EmptyState message="No elective groups configured" /></Card>}
      </div>
    </div>
  );
}

// ─── Labs Panel ───────────────────────────────────────────
function LabsPanel({ state }: { state: AppState }) {
  const [name, setName] = useState('');
  const [semester, setSemester] = useState('4');
  const [sectionId, setSectionId] = useState('');
  const [slotsPerWeek, setSlotsPerWeek] = useState('1');
  const [labs, setLabs] = useState<{ id: string; batchName: string; labName: string; facultyId: string }[]>([]);

  const labRooms = state.rooms.filter(r => r.type === 'lab');
  const updateLab = (id: string, field: 'labName' | 'facultyId', val: string) => {
    setLabs(prev => prev.map(l => l.id === id ? { ...l, [field]: val } : l));
  };

  const handleSectionChange = (sid: string) => {
    setSectionId(sid);
    const sec = state.sections.find(s => s.id === sid);
    if (sec && sec.batches.length > 0) {
      setLabs(sec.batches.map(b => ({
        id: uuid(),
        batchName: b,
        labName: '',
        facultyId: '',
      })));
    } else {
      setLabs([]);
    }
  };

  const handleAdd = () => {
    if (!name.trim() || !sectionId) return;
    const validLabs = labs.filter(l => l.labName.trim());
    if (validLabs.length === 0) return;

    // Auto-assign rooms sequentially
    const mappedLabs: LabEntry[] = validLabs.map((l, idx) => {
      const assignedRoom = labRooms[idx % labRooms.length];
      return {
        id: l.id,
        labName: l.labName,
        facultyId: l.facultyId,
        roomId: assignedRoom ? assignedRoom.id : '',
      };
    });

    addLabGroup({
      name: name.trim(), semester: parseInt(semester), sectionId,
      slotsPerWeek: parseInt(slotsPerWeek) || 1, labs: mappedLabs,
    });
    setName('');
    // Re-initialize based on same section to make it easy to add more if needed
    handleSectionChange(sectionId);
  };

  const selectedSection = state.sections.find(s => s.id === sectionId);

  return (
    <div>
      <PageHeader
        title="Lab Groups"
        subtitle="Configure lab sessions with rotation matrix — 1 slot = 2 consecutive periods"
        icon={<FlaskConical size={18} className="text-pink-400" />}
        badge={{ text: `${state.labGroups.length} groups`, color: 'bg-pink-500/10 text-pink-400' }}
      />

      <Card className="mb-5">
        <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider">Add Lab Group</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <Input label="Group Name" value={name} onChange={setName} placeholder="4A Lab Group" required />
          <Select label="Semester" value={semester} onChange={v => {
            setSemester(v);
            handleSectionChange('');
          }}
            options={[1, 2, 3, 4, 5, 6, 7, 8].map(s => ({ value: String(s), label: `Semester ${s}` }))} />
          <Select label="Section" value={sectionId} onChange={handleSectionChange} required
            options={state.sections.filter(s => String(s.semester) === semester).map(s => ({ value: s.id, label: `${s.name} (Sem ${s.semester})` }))} />
          <Input label="Slots/Week" value={slotsPerWeek} onChange={setSlotsPerWeek} type="number" />
        </div>

        {selectedSection && (
          <div className="mb-4 p-3 bg-pink-50 border border-pink-100 rounded-xl flex items-start gap-2">
            <Info size={14} className="text-pink-500 mt-0.5" />
            <p className="text-[11px] font-medium text-pink-700 leading-relaxed">
              Section batches: <strong>{selectedSection.batches.join(', ')}</strong><br />
              Labs will rotate between batches using the rotation matrix. Each batch does each lab exactly once per rotation.
            </p>
          </div>
        )}

        {/* Faculty Assignment Map for selected section */}
        {sectionId && (() => {
          const sem = parseInt(semester);
          const semSections = state.sections.filter(s => s.semester === sem).sort((a, b) => a.name.localeCompare(b.name));
          const sectionIdx = semSections.findIndex(s => s.id === sectionId);
          const semSubjects = state.subjects.filter(s => s.semester === sem && s.type === 'core');
          const selectedSec = semSections[sectionIdx];

          if (semSubjects.length === 0 || sectionIdx === -1) return null;

          const mappings = semSubjects.map(subj => {
            const facIdx = sectionIdx % subj.facultyIds.length;
            const facId = subj.facultyIds[facIdx];
            const fac = state.faculty.find(f => f.id === facId);
            return { subjectName: subj.name, subjectCode: subj.code, facultyName: fac?.name || '—' };
          });

          return (
            <div className="mb-4 p-4 bg-indigo-50 border border-indigo-100/60 rounded-xl shadow-inner">
              <div className="flex items-center gap-2 mb-3">
                <Users size={14} className="text-indigo-500" />
                <span className="text-xs font-bold text-indigo-700">
                  Faculty Assignment Map — {selectedSec?.name} (Sem {sem})
                </span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {mappings.map((m, i) => (
                  <div key={i} className="text-[11px] bg-white border border-slate-200 shadow-sm rounded-md px-3 py-2 flex items-center gap-1.5 focus-within:ring-1">
                    <span className="text-slate-700 font-bold">{m.subjectName}</span>
                    <ChevronRight size={10} className="text-slate-300 mx-0.5" />
                    <span className="text-indigo-600 font-bold">{m.facultyName}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-indigo-500/80 mt-2.5 font-medium flex items-center gap-1">
                <Info size={10} /> Use this as a reference when assigning lab faculty below.
              </p>
            </div>
          );
        })()}

        <label className="block text-[11px] font-semibold text-slate-600 mb-2 uppercase tracking-wide">Automated Lab Mapping</label>
        <div className="space-y-3 mb-4">
          {labs.map((l, idx) => {
            const assignedRoom = labRooms[idx % labRooms.length];
            return (
              <div key={l.id} className="grid grid-cols-[80px_1fr_1fr_120px] gap-3 items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="text-center font-bold text-pink-600 text-[11px] bg-pink-100/50 border border-pink-200 py-1.5 rounded-md shadow-sm">
                  Batch {l.batchName}
                </div>
                <input
                  value={l.labName}
                  onChange={e => updateLab(l.id, 'labName', e.target.value)}
                  placeholder="Subject (e.g. ADA Lab)"
                  className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors shadow-sm"
                />
                <select
                  value={l.facultyId}
                  onChange={e => updateLab(l.id, 'facultyId', e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-colors shadow-sm"
                >
                  <option value="">Faculty...</option>
                  {state.faculty.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <div className="text-[10px] text-slate-500 flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg shadow-sm">
                  <Lock size={12} className="text-slate-400" /> Auto Room:
                  <span className="text-slate-700 font-bold ml-auto truncate">
                    {assignedRoom?.name || 'Pending...'}
                  </span>
                </div>
              </div>
            );
          })}
          {sectionId && labs.length === 0 && (
            <p className="text-[11px] font-medium text-amber-700 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-500" />
              The selected section has no batches defined. Go to Sections and add batches first.
            </p>
          )}
          {!sectionId && (
            <p className="text-[11px] font-medium text-slate-500 mt-3 bg-slate-50 p-3 rounded-lg border border-slate-100 text-center">
              Select a section above to auto-generate batch mappings.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Btn onClick={handleAdd} disabled={!name.trim() || !sectionId || labs.length === 0 || labs.some(l => !l.labName.trim())}>
            <Plus size={12} /> Save Lab Group
          </Btn>
        </div>
      </Card>

      <div className="space-y-3">
        {state.labGroups.map(lg => {
          const sec = state.sections.find(s => s.id === lg.sectionId);
          const labNames = lg.labs.map(l => l.labName);
          const batches = sec?.batches || [];

          return (
            <Card key={lg.id} className="hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <h3 className="text-sm font-bold text-slate-800">{lg.name}</h3>
                    <Badge color="bg-indigo-50 text-indigo-600 border border-indigo-100">Sem {lg.semester}</Badge>
                    <Badge color="bg-emerald-50 text-emerald-600 border border-emerald-100">{sec?.name || '?'}</Badge>
                    <Badge color="bg-slate-100 text-slate-600 border border-slate-200">{lg.slotsPerWeek} slot/wk</Badge>
                  </div>
                  <p className="text-[11px] font-medium text-slate-500">Batches: {batches.join(', ')}</p>
                </div>
                <Btn variant="ghost" size="sm" onClick={() => removeLabGroup(lg.id)}><Trash2 size={11} /></Btn>
              </div>

              {/* Rotation matrix preview */}
              {batches.length > 0 && labNames.length > 0 && (
                <div className="mb-4 bg-slate-50 rounded-xl border border-slate-200 p-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Rotation Matrix Preview</p>
                  <div className="grid gap-1.5" style={{ gridTemplateColumns: `auto repeat(${batches.length}, 1fr)` }}>
                    <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wide">Session</div>
                    {batches.map(b => (
                      <div key={b} className="text-[11px] text-slate-600 px-2 py-1 text-center font-bold bg-white rounded-md shadow-sm border border-slate-100">{b}</div>
                    ))}
                    {labNames.map((_, sessionIdx) => (
                      <>
                        <div key={`s${sessionIdx}`} className="text-[11px] text-slate-500 px-2 py-1 font-bold text-center mt-0.5">{sessionIdx + 1}</div>
                        {batches.map((batch, bIdx) => {
                          const labIdx = (bIdx + sessionIdx) % labNames.length;
                          return (
                            <div key={`${sessionIdx}-${batch}`}
                              className="text-[11px] font-medium bg-pink-50 text-pink-600 border border-pink-100 shadow-sm rounded-md px-2 py-1 text-center mt-0.5">
                              {labNames[labIdx]}
                            </div>
                          );
                        })}
                      </>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2.5">
                {lg.labs.map(l => (
                  <div key={l.id} className="flex items-center gap-2 bg-white border border-slate-200 shadow-sm rounded-lg px-3 py-2">
                    <FlaskConical size={12} className="text-pink-500" />
                    <span className="text-[11px] font-bold text-slate-800">{l.labName}</span>
                    <span className="text-[10px] text-slate-300">|</span>
                    <span className="text-[11px] font-medium text-slate-500">{state.faculty.find(f => f.id === l.facultyId)?.name || '?'}</span>
                    <span className="text-[10px] text-slate-300">|</span>
                    <span className="text-[11px] font-medium text-slate-500">{state.rooms.find(r => r.id === l.roomId)?.name || '?'}</span>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
        {state.labGroups.length === 0 && <Card><EmptyState message="No lab groups configured" /></Card>}
      </div>
    </div>
  );
}

// ─── Frozen Slots Panel ───────────────────────────────────
function FrozenPanel({ state }: { state: AppState }) {
  const [day, setDay] = useState<Day>('Wednesday');
  const [period, setPeriod] = useState<Period>('P3');
  const [facultyId, setFacultyId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [semester, setSemester] = useState('1');
  const [desc, setDesc] = useState('');

  // Bulk mode state for Theory
  const [theoryBulk, setTheoryBulk] = useState(false);
  const [theoryBulkPeriods, setTheoryBulkPeriods] = useState<Record<Day, string>>({
    Monday: '', Tuesday: '', Wednesday: '', Thursday: '', Friday: '', Saturday: '',
  });

  // Bulk mode state for Lab
  const [labBulk, setLabBulk] = useState(false);
  const [labBulkSlots, setLabBulkSlots] = useState<Record<Day, string>>({
    Monday: '', Tuesday: '', Wednesday: '', Thursday: '', Friday: '', Saturday: '',
  });
  const [labRoomId, setLabRoomId] = useState('');

  const availableSections = state.sections.filter(s => String(s.semester) === semester);
  const availableSubjects = state.subjects.filter(s => String(s.semester) === semester);
  const availableFaculty = state.faculty;

  // New state for adding Dedicated 1st/2nd Sem Subjects directly from this panel
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjCode, setNewSubjCode] = useState('');
  const [newSubjSem, setNewSubjSem] = useState('1');
  const [newSubjType, setNewSubjType] = useState<CourseType>('core');

  const theoryPeriodOptions = [
    { value: '', label: 'None (Skip)' },
    ...WEEKDAY_PERIODS.map(p => ({ value: p, label: `${p} — ${PERIOD_TIMES[p]}` })),
  ];

  const saturdayTheoryPeriodOptions = [
    { value: '', label: 'None (Skip)' },
    ...SATURDAY_PERIODS.map(p => ({ value: p, label: `${p} — ${PERIOD_TIMES[p]}` })),
  ];

  const labSlotOptions = [
    { value: '', label: 'None (Skip)' },
    { value: 'P1', label: 'Morning Slot (P1-P2 : 8:00 - 10:00)' },
    { value: 'P3', label: 'Mid Slot (P3-P4 : 10:30 - 12:30)' },
    { value: 'P5', label: 'Afternoon Slot (P5-P6 : 2:00 - 4:00)' },
  ];

  const saturdayLabSlotOptions = [
    { value: '', label: 'None (Skip)' },
    { value: 'P1', label: 'Morning Slot (P1-P2 : 8:00 - 10:00)' },
    { value: 'P3', label: 'Mid Slot (P3-P4 : 10:30 - 12:30)' },
  ];

  const handleBulkTheoryAdd = () => {
    if (!sectionId || !subjectId) {
      alert("Please select a section and a subject to freeze.");
      return;
    }
    const sectionRef = state.sections.find(s => s.id === sectionId);
    const subjRef = state.subjects.find(s => s.id === subjectId);

    let addedCount = 0;
    for (const d of DAYS) {
      const p = theoryBulkPeriods[d];
      if (!p) continue; // Skip days set to "None"
      addFrozenSlot({
        day: d,
        period: p as Period,
        facultyId: facultyId || undefined,
        sectionId: sectionId || undefined,
        subjectId: subjectId || undefined,
        semester: semester ? parseInt(semester) : undefined,
        description: desc || `Frozen: ${subjRef?.name || 'Unknown'} for ${sectionRef?.name || 'Section'} (${d})`,
      });
      addedCount++;
    }

    if (addedCount === 0) {
      alert("Please select a period for at least one day.");
      return;
    }

    setDesc(''); setFacultyId(''); setSubjectId(''); setSectionId('');
    setTheoryBulkPeriods({ Monday: '', Tuesday: '', Wednesday: '', Thursday: '', Friday: '', Saturday: '' });
  };

  const handleBulkLabAdd = () => {
    if (!sectionId || !subjectId || !labRoomId) {
      alert("Please select a section, lab subject, and room.");
      return;
    }
    const subjRef = state.subjects.find(s => s.id === subjectId);

    let addedCount = 0;
    for (const d of DAYS) {
      const p1Str = labBulkSlots[d];
      if (!p1Str) continue;
      const p1 = p1Str as Period;
      const p2 = (p1 === 'P1' ? 'P2' : (p1 === 'P3' ? 'P4' : 'P6')) as Period;

      const baseData = {
        day: d,
        facultyId: facultyId || undefined,
        roomId: labRoomId,
        sectionId: sectionId || undefined,
        subjectId: subjectId || undefined,
        semester: semester ? parseInt(semester) : undefined,
      };

      addFrozenSlot({ ...baseData, period: p1, description: `Frozen Lab: ${subjRef?.name || 'Unknown'} [Part 1] (${d})` });
      addFrozenSlot({ ...baseData, period: p2, description: `Frozen Lab: ${subjRef?.name || 'Unknown'} [Part 2] (${d})` });
      addedCount++;
    }

    if (addedCount === 0) {
      alert("Please select a lab slot for at least one day.");
      return;
    }

    setLabRoomId(''); setFacultyId(''); setSubjectId(''); setSectionId('');
    setLabBulkSlots({ Monday: '', Tuesday: '', Wednesday: '', Thursday: '', Friday: '', Saturday: '' });
  };

  return (
    <div>
      <PageHeader
        title="1st/2nd Sem Frozen Slots"
        subtitle="Dedicated slot freezing for 1st and 2nd Semester subjects handled by CSE Dept"
        icon={<Lock size={18} className="text-amber-500" />}
        badge={{ text: `${state.frozenSlots.length} frozen`, color: 'bg-amber-50 text-amber-600 border border-amber-100' }}
      />

      {/* ─── Add Subject UI ─── */}
      <Card className="mb-5 bg-indigo-50 border-indigo-100/60 shadow-sm">
        <h3 className="text-xs font-bold text-indigo-700 mb-3 flex items-center gap-2 uppercase tracking-wider">
          <BookOpen size={14} className="text-indigo-500" /> Add 1st/2nd Sem Subject
        </h3>
        <p className="text-[11px] font-medium text-indigo-600 mb-4 leading-relaxed">
          Create subjects here to easily select them when freezing slots below.
          Use this so you don't have to enter the subject name repeatedly for each section.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
          <Input label="Subject Name" value={newSubjName} onChange={setNewSubjName} placeholder="Basic Electronics" required />
          <Input label="Subject Code (opt)" value={newSubjCode} onChange={setNewSubjCode} placeholder="BE101" />
          <Select label="Semester" value={newSubjSem} onChange={setNewSubjSem}
            options={[1, 2].map(s => ({ value: String(s), label: `Semester ${s}` }))} />
          <Select label="Type" value={newSubjType} onChange={v => setNewSubjType(v as CourseType)}
            options={[{ value: 'core', label: 'Theory / Core' }, { value: 'lab', label: 'Laboratory' }]} />
          <div className="flex items-end">
            <Btn onClick={() => {
              if (!newSubjName.trim()) return;
              addSubject({
                name: newSubjName.trim(),
                code: newSubjCode.trim() || `SEM${newSubjSem}-${newSubjName.substring(0, 3).toUpperCase()}`,
                semester: parseInt(newSubjSem),
                type: newSubjType,
                hoursPerWeek: newSubjType === 'lab' ? 2 : 4,
                facultyIds: []
              });
              setNewSubjName(''); setNewSubjCode('');
              setSemester(newSubjSem);
            }} disabled={!newSubjName.trim()} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-md border-transparent">
              <Plus size={14} /> Add {newSubjType === 'lab' ? 'Lab' : 'Subject'}
            </Btn>
          </div>
        </div>
      </Card>


      {/* ─── Add Frozen Theory Slot ─── */}
      <Card className="mb-5">
        <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider">Add Frozen Theory Slot (Sem 1 & 2 Only)</h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <Select label="Semester" value={semester} onChange={v => {
            setSemester(v);
            setSectionId('');
          }} options={[1, 2].map(s => ({ value: String(s), label: `Semester ${s}` }))} />
          <Select label="Section" value={sectionId} onChange={setSectionId}
            options={availableSections.map(s => ({ value: s.id, label: s.name }))} />
          <Select label="Subject (Theory)" value={subjectId} onChange={setSubjectId}
            options={availableSubjects.filter(s => s.type !== 'lab').map(s => ({ value: s.id, label: s.name }))} />
          <Select label="Faculty (CSE)" value={facultyId} onChange={setFacultyId}
            options={availableFaculty.map(f => ({ value: f.id, label: f.name }))} />
        </div>

        {/* Bulk Mode Toggle */}
        <label className="flex items-center gap-2.5 mb-4 cursor-pointer select-none bg-slate-50 border border-slate-200 p-2.5 rounded-lg w-max shadow-sm">
          <input
            type="checkbox"
            checked={theoryBulk}
            onChange={e => setTheoryBulk(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-colors cursor-pointer"
          />
          <span className="text-[11px] text-slate-700 font-bold uppercase tracking-wide">Bulk Mode <span className="text-[10px] text-slate-500 lowercase font-normal ml-1">(different slots for all days)</span></span>
        </label>

        {theoryBulk ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              {DAYS.map(d => (
                <Select
                  key={d}
                  label={`${d} Period`}
                  value={theoryBulkPeriods[d]}
                  onChange={v => setTheoryBulkPeriods(prev => ({ ...prev, [d]: v }))}
                  options={d === 'Saturday' ? saturdayTheoryPeriodOptions : theoryPeriodOptions}
                />
              ))}
            </div>
            <div className="mb-4">
              <Input label="Description (optional)" value={desc} onChange={setDesc} placeholder="Math Lecture..." />
            </div>
            <Btn onClick={handleBulkTheoryAdd} disabled={!sectionId || !subjectId}>
              <Lock size={14} /> Bulk Add Theory Slots
            </Btn>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <Select label="Day" value={day} onChange={v => setDay(v as Day)}
                options={DAYS.map(d => ({ value: d, label: d }))} />
              <Select label="Period" value={period} onChange={v => setPeriod(v as Period)}
                options={WEEKDAY_PERIODS.map(p => ({ value: p, label: `${p} — ${PERIOD_TIMES[p]}` }))} />
              <Input label="Description (optional)" value={desc} onChange={setDesc} placeholder="Math Lecture..." />
            </div>
            <Btn onClick={() => {
              if (!sectionId || !subjectId) {
                alert("Please select a section and a subject to freeze.");
                return;
              }
              const sectionRef = state.sections.find(s => s.id === sectionId);
              const subjRef = state.subjects.find(s => s.id === subjectId);

              addFrozenSlot({
                day, period,
                facultyId: facultyId || undefined,
                sectionId: sectionId || undefined,
                subjectId: subjectId || undefined,
                semester: semester ? parseInt(semester) : undefined,
                description: desc || `Frozen: ${subjRef ? subjRef.name : 'Unknown'} for ${sectionRef ? sectionRef.name : 'Section'}`,
              });
              setDesc(''); setFacultyId(''); setSubjectId(''); setSectionId('');
            }} disabled={!sectionId || !subjectId}>
              <Lock size={14} /> Add Frozen Theory Slot
            </Btn>
          </>
        )}
      </Card>

      {/* ─── Add Frozen Lab Slot ─── */}
      <Card className="mb-5 bg-pink-50 border-pink-100 shadow-sm">
        <h3 className="text-xs font-bold text-pink-600 mb-3 flex items-center gap-2 uppercase tracking-wider">
          <Lock size={14} /> Add Frozen Lab Slot (Sem 1 & 2 Only)
        </h3>
        <p className="text-[11px] font-medium text-pink-700 mb-4">
          Labs require 2 continuous periods. Select from the 3 available slots: Morning, Mid, or Afternoon.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <Select label="Semester" value={semester} onChange={v => {
            setSemester(v);
            setSectionId('');
          }} options={[1, 2].map(s => ({ value: String(s), label: `Semester ${s}` }))} />
          <Select label="Section" value={sectionId} onChange={setSectionId}
            options={availableSections.map(s => ({ value: s.id, label: s.name }))} />
          <Select label="Subject (Lab)" value={subjectId} onChange={setSubjectId}
            options={availableSubjects.filter(s => s.type === 'lab').map(s => ({ value: s.id, label: s.name }))} />
          <Select label="Faculty (CSE)" value={facultyId} onChange={setFacultyId}
            options={availableFaculty.map(f => ({ value: f.id, label: f.name }))} />
        </div>

        {/* Bulk Mode Toggle */}
        <label className="flex items-center gap-2.5 mb-4 cursor-pointer select-none bg-white border border-slate-200 p-2.5 rounded-lg w-max shadow-sm">
          <input
            type="checkbox"
            checked={labBulk}
            onChange={e => setLabBulk(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-pink-600 focus:ring-pink-500 transition-colors cursor-pointer"
          />
          <span className="text-[11px] text-slate-700 font-bold uppercase tracking-wide">Bulk Mode <span className="text-[10px] text-slate-500 lowercase font-normal ml-1">(different lab slots for all days)</span></span>
        </label>

        {labBulk ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              {DAYS.map(d => (
                <Select
                  key={d}
                  label={`${d} Lab Slot`}
                  value={labBulkSlots[d]}
                  onChange={v => setLabBulkSlots(prev => ({ ...prev, [d]: v }))}
                  options={d === 'Saturday' ? saturdayLabSlotOptions : labSlotOptions}
                />
              ))}
            </div>
            <div className="mb-4">
              <Select label="Lab Room" value={labRoomId} onChange={setLabRoomId}
                options={state.rooms.filter(r => r.type === 'lab').map(r => ({ value: r.id, label: r.name }))} />
            </div>
            <Btn onClick={handleBulkLabAdd} className="bg-pink-600 hover:bg-pink-700 text-white shadow-md border-transparent" disabled={!sectionId || !subjectId || !labRoomId}>
              <Lock size={14} /> Bulk Add Lab Blocks
            </Btn>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <Select label="Day" value={day} onChange={v => setDay(v as Day)}
                options={DAYS.map(d => ({ value: d, label: d }))} />
              <Select label="Lab Slot Time" value={period} onChange={v => setPeriod(v as Period)}
                options={[
                  { value: 'P1', label: 'Morning Slot (P1-P2 : 8:00 - 10:00)' },
                  { value: 'P3', label: 'Mid Slot (P3-P4 : 10:30 - 12:30)' },
                  { value: 'P5', label: 'Afternoon Slot (P5-P6 : 2:00 - 4:00)' },
                ]} />
              <Select label="Lab Room" value={desc} onChange={setDesc}
                options={state.rooms.filter(r => r.type === 'lab').map(r => ({ value: r.id, label: r.name }))} />
            </div>
            <Btn onClick={() => {
              if (!sectionId || !subjectId || !desc) {
                alert("Please select a section, lab subject, and room.");
                return;
              }
              const sectionRef = state.sections.find(s => s.id === sectionId);
              const subjRef = state.subjects.find(s => s.id === subjectId);
              const roomRef = state.rooms.find(r => r.id === desc);

              const p1 = period;
              const p2 = (p1 === 'P1' ? 'P2' : (p1 === 'P3' ? 'P4' : 'P6')) as Period;

              const baseData = {
                day,
                facultyId: facultyId || undefined,
                roomId: desc,
                sectionId: sectionId || undefined,
                subjectId: subjectId || undefined,
                semester: semester ? parseInt(semester) : undefined,
              };

              addFrozenSlot({ ...baseData, period: p1, description: `Frozen Lab: ${subjRef?.name || 'Unknown'} [Part 1]` });
              addFrozenSlot({ ...baseData, period: p2, description: `Frozen Lab: ${subjRef?.name || 'Unknown'} [Part 2]` });

              setDesc(''); setFacultyId(''); setSubjectId(''); setSectionId('');
            }} className="bg-pink-600 hover:bg-pink-700 text-white shadow-md border-transparent" disabled={!sectionId || !subjectId || !desc}>
              <Lock size={14} /> Add 2-Period Lab Block
            </Btn>
          </>
        )}
      </Card>

      <Card>
        {state.frozenSlots.length === 0 ? (
          <EmptyState message="No frozen slots defined" />
        ) : (
          <div className="space-y-3">
            {state.frozenSlots.map(fs => (
              <div key={fs.id} className="flex items-start justify-between bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-slate-300 transition-colors">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge color="bg-amber-50 text-amber-600 border border-amber-200">{fs.day}</Badge>
                    <Badge color="bg-amber-50 text-amber-600 border border-amber-200">{fs.period}</Badge>
                    {fs.semester && <Badge color="bg-slate-100 text-slate-600 border border-slate-200">Sem {fs.semester}</Badge>}
                    {fs.sectionId && (
                      <Badge color="bg-emerald-50 text-emerald-600 border border-emerald-100">
                        {state.sections.find(s => s.id === fs.sectionId)?.name || 'Section ?'}
                      </Badge>
                    )}
                    {fs.subjectId && (
                      <Badge color="bg-indigo-50 text-indigo-600 border border-indigo-100">
                        {state.subjects.find(s => s.id === fs.subjectId)?.name || 'Subject ?'}
                      </Badge>
                    )}
                    {fs.facultyId && (
                      <Badge color="bg-cyan-50 text-cyan-600 border border-cyan-100">
                        {state.faculty.find(f => f.id === fs.facultyId)?.name || 'Faculty ?'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] font-medium text-slate-500">{fs.description}</p>
                </div>
                <Btn variant="ghost" size="sm" onClick={() => removeFrozenSlot(fs.id)}><Trash2 size={12} /></Btn>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Config Panel ─────────────────────────────────────────
function ConfigPanel({ state }: { state: AppState }) {
  const cfg = state.schedulerConfig;

  const update = (key: keyof SchedulerConfig, val: string | boolean) => {
    const parsed = typeof val === 'boolean' ? val : (isNaN(Number(val)) ? val : Number(val));
    updateConfig({ [key]: parsed } as Partial<SchedulerConfig>);
  };

  return (
    <div>
      <PageHeader
        title="Scheduler Configuration"
        subtitle="Fine-tune the constraint-based scheduling engine parameters"
        icon={<Settings size={18} className="text-gray-400" />}
        actions={
          <Btn variant="secondary" onClick={() => updateConfig(DEFAULT_SCHEDULER_CONFIG)}>
            <RotateCcw size={12} /> Reset Defaults
          </Btn>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card className="hover:border-slate-300 transition-colors">
          <h3 className="text-xs font-semibold text-slate-500 mb-5 flex items-center gap-2 uppercase tracking-wider"><Shield size={14} className="text-indigo-400" /> Hard Constraint Parameters</h3>
          <div className="space-y-5">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Max Morning Classes Per Faculty Per Week</label>
              <input
                type="number" min={1} max={6}
                value={cfg.maxMorningClassesPerFaculty}
                onChange={e => update('maxMorningClassesPerFaculty', e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors shadow-sm"
              />
              <p className="text-[10px] text-slate-500 mt-1.5 font-medium">Periods P1 and P2 are considered morning slots. Default: 3</p>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Workload Balance Tolerance <span className="text-[10px] text-slate-400 lowercase font-normal ml-1">(hours)</span></label>
              <input
                type="number" min={0} max={5}
                value={cfg.workloadToleranceHours}
                onChange={e => update('workloadToleranceHours', e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors shadow-sm"
              />
              <p className="text-[10px] text-slate-500 mt-1.5 font-medium">Max allowed difference in faculty hours. Default: 1 (±1 hour)</p>
            </div>
          </div>
        </Card>

        <Card className="hover:border-slate-300 transition-colors">
          <h3 className="text-xs font-semibold text-slate-500 mb-5 flex items-center gap-2 uppercase tracking-wider"><TrendingUp size={14} className="text-emerald-500" /> Soft Constraint Preferences</h3>
          <div className="space-y-4">
            {[
              { key: 'preferSpreadAcrossDays' as const, label: 'Prefer subject spread across days', desc: 'Avoids scheduling same subject multiple times per day' },
              { key: 'penalizeBackToBack' as const, label: 'Penalize back-to-back classes', desc: 'Prefer gap between consecutive faculty periods' },
              { key: 'penalizeSaturday' as const, label: 'Penalize Saturday scheduling', desc: 'Use Saturday slots as last resort' },
            ].map(({ key, label, desc }) => (
              <label key={key} className="flex items-start gap-3.5 cursor-pointer bg-slate-50/50 p-3 rounded-xl border border-transparent hover:border-slate-200 transition-colors">
                <input
                  type="checkbox"
                  checked={cfg[key] as boolean}
                  onChange={e => update(key, e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 mt-1 shadow-sm transition-colors cursor-pointer"
                />
                <div>
                  <p className="text-xs font-bold text-slate-700">{label}</p>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </Card>

        <Card className="hover:border-slate-300 transition-colors">
          <h3 className="text-xs font-semibold text-slate-500 mb-5 flex items-center gap-2 uppercase tracking-wider"><Activity size={14} className="text-pink-500" /> Optimization Engine</h3>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Max Optimization Passes <span className="text-[10px] text-slate-400 lowercase font-normal ml-1">(Local Search)</span></label>
            <input
              type="number" min={0} max={2000}
              value={cfg.maxOptimizationPasses}
              onChange={e => update('maxOptimizationPasses', e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors shadow-sm"
            />
            <p className="text-[10px] text-slate-500 mt-1.5 font-medium leading-relaxed">Number of swap/move attempts in Phase 5.<br />Higher = better quality, slower. Default: 500</p>
          </div>
        </Card>

        <Card className="hover:border-slate-300 transition-colors">
          <h3 className="text-xs font-semibold text-slate-500 mb-5 flex items-center gap-2 uppercase tracking-wider"><Clock size={14} className="text-blue-500" /> Time Structure</h3>
          <div className="space-y-3">
            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider bg-slate-50 px-2 py-1 rounded inline-block">Weekday Periods</p>
            <div className="space-y-2.5">
              {WEEKDAY_PERIODS.map(p => (
                <div key={p} className="flex items-center gap-3 bg-white border border-slate-100 rounded-lg px-3 py-2 shadow-sm">
                  <Badge color={['P1', 'P2'].includes(p) ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}>{p}</Badge>
                  <span className="text-[11px] font-medium text-slate-500">{PERIOD_TIMES[p]}</span>
                  {['P1', 'P2'].includes(p) && <Badge color="bg-amber-50 text-amber-500 border border-amber-100 shadow-sm ml-auto">Morning</Badge>}
                </div>
              ))}
            </div>
            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mt-4 bg-slate-50 px-2 py-1 rounded inline-block">Saturday (Half Day)</p>
            <div className="space-y-2.5">
              {SATURDAY_PERIODS.map(p => (
                <div key={p} className="flex items-center gap-3 bg-white border border-slate-100 rounded-lg px-3 py-2 shadow-sm">
                  <Badge color="bg-slate-100 text-slate-600 border border-slate-200">{p}</Badge>
                  <span className="text-[11px] font-medium text-slate-500">{PERIOD_TIMES[p]}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Generate Panel ───────────────────────────────────────
function GeneratePanel({ state, setActiveTab }: { state: AppState; setActiveTab: (t: TabKey) => void }) {
  const [generating, setGenerating] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const job = state.currentJob;

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job?.log]);

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    startJob();

    const phases = [
      { name: 'preprocessing', label: 'Preprocessing — faculty-section mapping', delay: 100 },
      { name: 'freezing', label: 'Freezing college slots', delay: 200 },
      { name: 'electives', label: 'Scheduling electives', delay: 200 },
      { name: 'labs', label: 'Scheduling labs (rotation matrix)', delay: 300 },
      { name: 'theory', label: 'Scheduling theory classes (MRV heuristic)', delay: 400 },
      { name: 'optimizing', label: 'Running local search optimization', delay: 300 },
      { name: 'validating', label: 'Validating constraints', delay: 200 },
    ];

    let cumulativeDelay = 0;
    phases.forEach((phase, idx) => {
      cumulativeDelay += phase.delay;
      setTimeout(() => {
        updateJob({ status: phase.name as any, phase: idx });
        appendJobLog(`▶ Phase ${idx}: ${phase.label}...`);
      }, cumulativeDelay);
    });

    cumulativeDelay += 300;
    setTimeout(() => {
      try {
        const { timetable, validation, log } = generateTimetable(
          state,
          state.schedulerConfig,
        );
        setTimetable(timetable, validation);

        // Append engine log
        for (const line of log) appendJobLog(line);

        appendJobLog(`✅ Generation complete — ${timetable.length} slots`);
        appendJobLog(validation.valid
          ? '🎉 VALID: All hard constraints satisfied!'
          : `⚠️ ${validation.errors.length} hard constraint violations detected`,
        );

        finishJob('done');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        appendJobLog(`❌ Error: ${msg}`);
        finishJob('failed', msg);
      }
      setGenerating(false);
    }, cumulativeDelay);
  }, [state]);

  const checks = [
    { label: 'Faculty', ok: state.faculty.length > 0, val: state.faculty.length, need: '≥1' },
    { label: 'Sections', ok: state.sections.length > 0, val: state.sections.length, need: '≥1' },
    { label: 'Rooms', ok: state.rooms.length > 0, val: state.rooms.length, need: '≥1' },
    { label: 'Subjects', ok: state.subjects.length > 0, val: state.subjects.length, need: '≥1' },
    { label: 'Classrooms', ok: state.rooms.some(r => r.type === 'classroom'), val: state.rooms.filter(r => r.type === 'classroom').length, need: '≥1' },
  ];
  const allReady = checks.every(c => c.ok);

  const phaseLabels = ['Preprocessing', 'Freeze Slots', 'Electives', 'Labs', 'Theory', 'Optimize', 'Validate'];

  return (
    <div>
      <PageHeader
        title="Generate Timetable"
        subtitle="Run the 7-phase constraint-based scheduling engine"
        icon={<Zap size={18} className="text-indigo-600" />}
      />

      {/* Pre-flight */}
      <Card className="mb-5">
        <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider">Pre-flight Checks</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {checks.map(c => (
            <div key={c.label} className={cn(
              'rounded-xl p-3 border text-center shadow-sm transition-colors',
              c.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200',
            )}>
              <div className="flex items-center justify-center gap-1.5 mb-1.5">
                {c.ok
                  ? <CheckCircle2 size={14} className="text-emerald-500" />
                  : <XCircle size={14} className="text-red-500" />
                }
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{c.label}</span>
              </div>
              <p className={cn('text-xl font-black mb-0.5', c.ok ? 'text-emerald-600' : 'text-red-600')}>{c.val}</p>
              <p className="text-[10px] font-medium text-slate-500">Need {c.need}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Phase tracker */}
      {job && (
        <Card className="mb-5 overflow-hidden">
          <h3 className="text-xs font-semibold text-slate-500 mb-4 uppercase tracking-wider">Scheduling Phases</h3>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {phaseLabels.map((label, i) => (
              <div key={i} className="flex items-center gap-2 flex-shrink-0">
                <div className={cn(
                  'rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wide flex items-center gap-2 shadow-sm transition-all duration-300',
                  job.phase > i
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    : job.phase === i
                      ? 'bg-indigo-600 text-white border border-indigo-500 shadow-md transform scale-105'
                      : 'bg-white text-slate-400 border border-slate-200',
                )}>
                  {job.phase > i && <CheckCircle2 size={12} />}
                  {job.phase === i && <RefreshCw size={12} className="animate-spin text-indigo-200" />}
                  {job.phase < i && <span className="text-slate-300">{i}</span>}
                  <span>{label}</span>
                </div>
                {i < phaseLabels.length - 1 && (
                  <ChevronRight size={14} className={cn(
                    'flex-shrink-0 mx-1 transition-colors',
                    job.phase > i ? 'text-emerald-400' : 'text-slate-200',
                  )} />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Generate Button */}
      <Card className="mb-5 bg-indigo-50 border-indigo-100 p-6 flex flex-col items-center justify-center text-center">
        <h3 className="text-lg font-black text-indigo-900 mb-2">Ready to Schedule?</h3>
        <p className="text-xs text-indigo-600/80 font-medium mb-6">Ensure all data is correct before generation. This action overwrites any existing timetable mapping.</p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Btn
            size="lg"
            onClick={handleGenerate}
            disabled={!allReady || generating}
            className="min-w-[220px] justify-center shadow-lg bg-indigo-600 hover:bg-indigo-700 border-transparent text-sm py-3"
          >
            {generating
              ? <><RefreshCw size={18} className="animate-spin" /> Generating...</>
              : <><Zap size={18} /> Generate Timetable</>
            }
          </Btn>
          {state.currentTimetable && (
            <>
              <Btn variant="secondary" size="lg" onClick={() => setActiveTab('timetable')} className="shadow-sm py-3 bg-white hover:bg-slate-50 border-slate-200">
                <Eye size={16} className="text-indigo-600" /> View Timetable
              </Btn>
              <Btn variant="secondary" size="lg" onClick={() => setActiveTab('validation')} className="shadow-sm py-3 bg-white hover:bg-slate-50 border-slate-200">
                <Shield size={16} className="text-emerald-600" /> View Validation
              </Btn>
            </>
          )}
        </div>
        {!allReady && (
          <span className="text-[11px] font-bold text-red-500 mt-4 flex items-center justify-center gap-1.5 bg-red-50 px-3 py-1.5 rounded-full border border-red-100">
            <XCircle size={14} /> Fix pre-flight issues first
          </span>
        )}
      </Card>

      {/* Generation Log */}
      {job && job.log.length > 0 && (
        <Card className="bg-[#1A192B] border-slate-800 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
              <Activity size={12} className="text-indigo-400" /> Generation Log
            </h3>
            <Badge color={
              job.status === 'done'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : job.status === 'failed'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-bold tracking-wide'
            }>
              {job.status === 'running' ? '● RUNNING' : job.status.toUpperCase()}
            </Badge>
          </div>
          <div
            ref={logRef}
            className="bg-black/40 rounded-xl p-5 font-mono text-[11px] space-y-1 max-h-96 overflow-y-auto border border-white/5 shadow-inner scrollbar-thin"
          >
            {job.log.map((line, i) => (
              <div key={i} className={cn(
                'leading-relaxed break-all',
                line.startsWith('✅') || line.startsWith('🎉') ? 'text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 -mx-2 rounded' :
                  line.startsWith('❌') ? 'text-red-400 font-bold bg-red-500/10 px-2 py-1 -mx-2 rounded' :
                    line.startsWith('⚠️') ? 'text-amber-400 font-medium' :
                      line.startsWith('▶') ? 'text-indigo-300 font-bold mt-3 mb-1 block uppercase tracking-wide border-b border-indigo-500/20 pb-1' :
                        line.includes('✓') ? 'text-slate-400 ml-4 border-l border-slate-700 pl-2' :
                          'text-slate-500 ml-4',
              )}>
                <span className="text-slate-700/50 mr-3 select-none text-[9px] font-normal tracking-wider">{String(i + 1).padStart(3, '0')}</span>
                {line}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Timetable Panel ──────────────────────────────────────

function TimetablePanel({ state }: { state: AppState }) {
  const [viewType, setViewType] = useState<TimetableView>('section');
  const [selectedId, setSelectedId] = useState('');
  const [semFilter, setSemFilter] = useState('');
  const [expandFacMapping, setExpandFacMapping] = useState(false);

  const tt = state.currentTimetable;

  if (!tt || tt.length === 0) {
    return (
      <div>
        <PageHeader title="View Timetable" subtitle="Generate a timetable to view it" icon={<Calendar size={18} className="text-indigo-400" />} />
        <Card>
          <div className="text-center py-16">
            <Calendar size={40} className="text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-2">No timetable generated yet</p>
            <p className="text-xs text-gray-600">Go to the Generate tab and run the scheduler</p>
          </div>
        </Card>
      </div>
    );
  }

  // Build entity options
  const sectionMap = new Map(state.sections.map(s => [s.id, s.name]));

  const uniqueSections = [...new Map(
    tt.filter(s => !s.electiveGroupId).map(s => [s.sectionId, { value: s.sectionId, label: `${s.sectionName} (Sem ${s.semester})` }])
  ).values()];

  const uniqueFaculty = [...new Map(
    tt.map(s => [s.facultyId, { value: s.facultyId, label: s.facultyName }])
  ).values()];

  const uniqueRooms = [...new Map(
    tt.filter(s => s.roomId).map(s => [s.roomId!, { value: s.roomId!, label: s.roomName! }])
  ).values()];

  const options = viewType === 'section' ? uniqueSections : viewType === 'faculty' ? uniqueFaculty : uniqueRooms;
  const effectiveId = selectedId || (options[0]?.value || '');

  // Filter timetable
  let filtered = tt;
  if (effectiveId) {
    if (viewType === 'section') filtered = tt.filter(s => s.sectionId === effectiveId || (s.electiveGroupId && s.semester === (state.sections.find(sec => sec.id === effectiveId)?.semester)));
    else if (viewType === 'faculty') filtered = tt.filter(s => s.facultyId === effectiveId);
    else filtered = tt.filter(s => s.roomId === effectiveId);
  }

  // Apply semester filter
  if (semFilter) {
    filtered = filtered.filter(s => s.semester === parseInt(semFilter));
  }

  void sectionMap;

  const title = options.find(o => o.value === effectiveId)?.label || '';


  return (
    <div>
      <PageHeader
        title="Timetable Viewer"
        subtitle="Section / Faculty / Room grid views"
        icon={<Calendar size={18} className="text-indigo-500" />}
        badge={{ text: `${tt.length} total slots`, color: 'bg-indigo-50 text-indigo-600 border border-indigo-100' }}
      />

      {/* Controls */}
      <Card className="mb-5 bg-white border border-slate-200 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          {/* View type toggle */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wide">View Mode</label>
            <div className="flex gap-1.5 bg-slate-100/80 rounded-xl p-1.5 border border-slate-200/60 shadow-inner">
              {(['section', 'faculty', 'room'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => { setViewType(v); setSelectedId(''); }}
                  className={cn(
                    'px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ease-in-out',
                    viewType === v
                      ? 'bg-white text-indigo-600 shadow border border-slate-200/50 scale-[1.02]'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50',
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-[200px]">
            <Select
              label={`Select ${viewType}`}
              value={effectiveId}
              onChange={setSelectedId}
              options={options}
            />
          </div>

          <div className="w-40">
            <Select
              label="Semester Filter"
              value={semFilter}
              onChange={setSemFilter}
              options={[{ value: '', label: 'All Semesters' }, ...[1, 2, 3, 4, 5, 6, 7, 8].map(s => ({ value: String(s), label: `Sem ${s}` }))]}
            />
          </div>

        </div>
      </Card>

      {/* Faculty-section mapping info */}
      {viewType === 'section' && state.subjects.length > 0 && (
        <Card className="mb-5 overflow-hidden">
          <button
            onClick={() => setExpandFacMapping(!expandFacMapping)}
            className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest w-full text-left"
          >
            <GitBranch size={14} className="text-indigo-400" /> Faculty Assignment Map
            <ChevronDown size={14} className={cn('ml-auto transition-transform', expandFacMapping && 'rotate-180')} />
          </button>
          {expandFacMapping && (
            <div className="mt-4 space-y-3 pt-2 border-t border-slate-100">
              {state.subjects.map(subj => {
                const semSections = state.sections.filter(s => s.semester === subj.semester);
                return (
                  <div key={subj.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100 shadow-sm">
                    <p className="text-[11px] font-bold text-slate-700 mb-2">{subj.name} ({subj.code}) <span className="text-slate-400 font-normal mx-1">|</span> Sem {subj.semester}</p>
                    <div className="flex flex-wrap gap-2">
                      {semSections.map((sec, i) => {
                        const facId = subj.facultyIds[i % subj.facultyIds.length];
                        const fac = state.faculty.find(f => f.id === facId);
                        return (
                          <div key={sec.id} className="text-[10px] bg-white border border-slate-200 shadow-sm rounded-lg px-2.5 py-1.5 flex items-center shadow-sm">
                            <span className="font-bold text-slate-600">{sec.name}</span>
                            <span className="text-slate-300 mx-2">→</span>
                            <span className="font-medium text-indigo-600">{fac?.name || '?'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Timetable Grid */}
      <Card className="overflow-hidden p-0 shadow-md border-slate-200">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-800">{title}</h3>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const sec = state.sections.find(s => s.id === effectiveId);
                const sem = sec?.semester || (semFilter ? parseInt(semFilter) : 0);
                const subs = state.subjects.filter(s => s.semester === sem).map(s => {
                  const fac = state.faculty.find(f => s.facultyIds.includes(f.id));
                  return { name: s.name, code: s.code, facultyName: fac?.name || '' };
                });
                exportToPDF({
                  sectionName: sec?.name || title,
                  semester: sem,
                  slots: filtered,
                  subjects: subs,
                });
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-wide rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:border-red-300 transition-all shadow-sm"
              title="Export as PDF"
            >
              <FileDown size={14} /> PDF
            </button>
            <button
              onClick={() => {
                const sec = state.sections.find(s => s.id === effectiveId);
                const sem = sec?.semester || (semFilter ? parseInt(semFilter) : 0);
                const subs = state.subjects.filter(s => s.semester === sem).map(s => {
                  const fac = state.faculty.find(f => s.facultyIds.includes(f.id));
                  return { name: s.name, code: s.code, facultyName: fac?.name || '' };
                });
                exportToExcel({
                  sectionName: sec?.name || title,
                  semester: sem,
                  slots: filtered,
                  subjects: subs,
                });
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-wide rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 transition-all shadow-sm"
              title="Export as Excel"
            >
              <FileSpreadsheet size={14} /> Excel
            </button>
          </div>
        </div>
        <div className="p-4 bg-white overflow-hidden">
          <TimetableGrid slots={filtered} viewType={viewType} />
        </div>
      </Card>

      {/* Summary stats */}
      {filtered.length > 0 && (
        <Card className="mt-5 bg-white border-slate-200">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Slots', val: filtered.filter(s => !s.isLabContinuation).length },
              { label: 'Theory', val: filtered.filter(s => s.subjectType === 'core' && !s.isLabContinuation).length },
              { label: 'Labs', val: filtered.filter(s => s.subjectType === 'lab' && !s.isLabContinuation).length },
              { label: 'Electives', val: filtered.filter(s => s.subjectType === 'elective').length },
            ].map(stat => (
              <div key={stat.label} className="bg-slate-50 border border-slate-100 shadow-sm rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-slate-800 mb-1">{stat.val}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{stat.label}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Validation Panel ─────────────────────────────────────
function ValidationPanel({ state }: { state: AppState }) {
  const v = state.currentValidation;
  const [activeSection, setActiveSection] = useState<'errors' | 'warnings' | 'workload' | 'coverage' | 'clashes'>('errors');

  if (!v) {
    return (
      <div>
        <PageHeader title="Validation Report" subtitle="Run the scheduler first" icon={<Shield size={18} className="text-green-400" />} />
        <Card>
          <div className="text-center py-16">
            <Shield size={40} className="text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No validation report available</p>
            <p className="text-xs text-gray-600 mt-1">Generate a timetable to see validation results</p>
          </div>
        </Card>
      </div>
    );
  }

  const tabs = [
    { key: 'errors' as const, label: `Errors (${v.errors.length})`, color: v.errors.length > 0 ? 'text-red-400' : 'text-green-400' },
    { key: 'warnings' as const, label: `Warnings (${v.warnings.length})`, color: v.warnings.length > 0 ? 'text-yellow-400' : 'text-green-400' },
    { key: 'clashes' as const, label: `Clashes (${v.clashDetails.length})`, color: v.clashDetails.length > 0 ? 'text-red-400' : 'text-green-400' },
    { key: 'workload' as const, label: 'Workload', color: 'text-gray-400' },
    { key: 'coverage' as const, label: 'Subject Coverage', color: 'text-gray-400' },
  ];

  return (
    <div>
      <PageHeader
        title="Validation Report"
        subtitle="Comprehensive constraint verification results"
        icon={<Shield size={18} className="text-green-400" />}
        badge={v.valid
          ? { text: 'VALID', color: 'bg-green-500/10 text-green-400' }
          : { text: 'INVALID', color: 'bg-red-500/10 text-red-400' }
        }
      />

      {/* Overall status */}
      <Card className="mb-5 bg-white border-slate-200">
        <div className="flex items-center gap-4 mb-5 border-b border-slate-100 pb-4">
          {v.valid
            ? <><CheckCircle2 size={28} className="text-emerald-500" /><div><p className="font-black text-emerald-600 text-lg">All Hard Constraints Satisfied</p><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Timetable is ready for deployment</p></div></>
            : <><XCircle size={28} className="text-red-500" /><div><p className="font-black text-red-600 text-lg">{v.errors.length} Hard Constraint Violations</p><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Timetable requires fixing before use</p></div></>
          }
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total Slots', val: v.stats.totalSlots, col: 'text-slate-800' },
            { label: 'Faculty Clashes', val: v.stats.facultyClashes, col: v.stats.facultyClashes > 0 ? 'text-red-600' : 'text-emerald-600' },
            { label: 'Room Clashes', val: v.stats.roomClashes, col: v.stats.roomClashes > 0 ? 'text-red-600' : 'text-emerald-600' },
            { label: 'Section Clashes', val: v.stats.sectionClashes, col: v.stats.sectionClashes > 0 ? 'text-red-600' : 'text-emerald-600' },
            { label: 'Soft Violations', val: v.stats.softViolations, col: v.stats.softViolations > 0 ? 'text-amber-600' : 'text-emerald-600' },
          ].map(s => (
            <div key={s.label} className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center shadow-sm">
              <p className={cn('text-3xl font-black mb-1', s.col)}>{s.val}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Quick checks */}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Elective Concurrency', ok: v.stats.electiveConcurrencyOk },
            { label: 'Lab Rotation', ok: v.stats.labRotationOk },
            { label: 'Saturday Rules', ok: v.stats.saturdayViolations === 0 },
            { label: 'Faculty Balance', ok: v.stats.softViolations < 3 },
          ].map(c => (
            <div key={c.label} className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2.5 border text-[11px] font-bold uppercase tracking-wide shadow-sm',
              c.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-red-50 border-red-100 text-red-600',
            )}>
              {c.ok ? <CheckCircle2 size={14} className="flex-shrink-0" /> : <XCircle size={14} className="flex-shrink-0" />}
              {c.label}
            </div>
          ))}
        </div>
      </Card>

      {/* Tabbed details */}
      <Card className="bg-white border-slate-200">
        <div className="flex gap-2 border-b border-slate-200 mb-5 overflow-x-auto scrollbar-thin pb-px">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className={cn(
                'px-4 py-3 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border-b-2 transition-all',
                activeSection === tab.key
                  ? `border-indigo-500 text-indigo-700 bg-indigo-50/50`
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Errors */}
        {activeSection === 'errors' && (
          <div>
            {v.errors.length === 0 ? (
              <div className="text-center py-10 bg-emerald-50/50 rounded-xl border border-emerald-100 border-dashed">
                <CheckCircle2 size={36} className="text-emerald-500 mx-auto mb-3" />
                <p className="text-sm text-emerald-700 font-bold uppercase tracking-widest">No errors found</p>
                <p className="text-xs text-emerald-600/70 font-medium mt-1">All hard constraints are satisfied</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                {v.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3 shadow-sm hover:border-red-300 transition-colors">
                    <XCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs font-medium text-red-800 leading-relaxed">{e}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Warnings */}
        {activeSection === 'warnings' && (
          <div>
            {v.warnings.length === 0 ? (
              <div className="text-center py-10 bg-emerald-50/50 rounded-xl border border-emerald-100 border-dashed">
                <CheckCircle2 size={36} className="text-emerald-500 mx-auto mb-3" />
                <p className="text-sm text-emerald-700 font-bold uppercase tracking-widest">No warnings</p>
                <p className="text-xs text-emerald-600/70 font-medium mt-1">All soft constraints are satisfied</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                {v.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3 shadow-sm hover:border-amber-300 transition-colors">
                    <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs font-medium text-amber-800 leading-relaxed">{w}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Clash details */}
        {activeSection === 'clashes' && (
          <div>
            {v.clashDetails.length === 0 ? (
              <div className="text-center py-10 bg-emerald-50/50 rounded-xl border border-emerald-100 border-dashed">
                <CheckCircle2 size={36} className="text-emerald-500 mx-auto mb-3" />
                <p className="text-sm text-emerald-700 font-bold uppercase tracking-widest">No clashes detected</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                {v.clashDetails.map((c, i) => (
                  <div key={i} className="bg-white border border-red-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge color={
                        c.type === 'faculty' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                          c.type === 'room' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                            'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }>{c.type} clash</Badge>
                      <Badge color="bg-amber-50 text-amber-700 border border-amber-200">{c.day} {c.period}</Badge>
                      <span className="text-[11px] font-bold text-slate-700 ml-1">{c.entityName}</span>
                    </div>
                    <p className="text-xs font-medium text-red-600 bg-red-50 p-2 rounded border border-red-100">{c.subjects.join(' vs ')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Workload */}
        {activeSection === 'workload' && (
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-4">Faculty teaching hours this week <span className="lowercase font-normal text-[10px] ml-1">(excluding lab continuation periods)</span></p>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-3 scrollbar-thin">
              {v.stats.workloadBalance.map((w, i) => {
                const max = Math.max(...v.stats.workloadBalance.map(x => x.hours), 1);
                const pct = Math.round((w.hours / max) * 100);
                return (
                  <div key={i} className="flex items-center gap-4">
                    <span className="text-xs font-bold text-slate-700 w-48 truncate">{w.facultyName}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden shadow-inner border border-slate-200">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', pct > 80 ? 'bg-amber-500' : pct > 60 ? 'bg-indigo-500' : 'bg-emerald-500')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-slate-500 w-16 text-right bg-slate-50 px-2 py-1 rounded border border-slate-200">{w.hours} hrs</span>
                  </div>
                );
              })}
              {v.stats.workloadBalance.length === 0 && <EmptyState message="No workload data" />}
            </div>
          </div>
        )}

        {/* Subject coverage */}
        {activeSection === 'coverage' && (
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-4">Scheduled hours vs required hours per subject per section</p>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
              {v.stats.subjectCoverage.map((c, i) => (
                <div key={i} className={cn(
                  'flex items-center justify-between rounded-xl px-4 py-3 border shadow-sm transition-colors hover:shadow-md',
                  c.ok ? 'bg-emerald-50/50 border-emerald-100 hover:border-emerald-200' : 'bg-red-50 border-red-200 hover:border-red-300',
                )}>
                  <div className="flex items-center gap-3">
                    {c.ok ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-red-500" />}
                    <span className="font-bold text-slate-700">{c.subjectName}</span>
                    <Badge color="bg-slate-100 text-slate-600 border border-slate-200 shadow-sm">{c.section}</Badge>
                  </div>
                  <span className={cn('font-black text-sm px-3 py-1 rounded bg-white border border-slate-200 shadow-sm', c.ok ? 'text-emerald-600' : 'text-red-600')}>
                    {c.scheduled}/{c.required} <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">hrs</span>
                  </span>
                </div>
              ))}
              {v.stats.subjectCoverage.length === 0 && <EmptyState message="No coverage data" />}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
