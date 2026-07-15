import { useState } from 'react';
import { Calendar, Mail, Lock, Eye, EyeOff, XCircle, RefreshCw, LogIn } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setError('Invalid email or password.');
      setSubmitting(false);
    }
    // On success, the auth listener in useAuth() flips isAuthenticated and
    // App re-renders into the main app — nothing further to do here.
  };

  return (
    <div className="min-h-screen bg-[#1A192B] flex items-center justify-center font-sans px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4">
            <Calendar size={22} className="text-white" />
          </div>
          <h1 className="text-lg font-bold text-white tracking-wide">Timetable Pro</h1>
          <p className="text-xs text-indigo-200 mt-0.5">Academic Scheduler</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-7">
          <h2 className="text-base font-bold text-slate-800 mb-1">Sign in</h2>
          <p className="text-xs text-slate-500 mb-6">
            Bapuji Institute of Engineering &amp; Technology, Davangere-04 — CSE Department
          </p>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Email</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@college.edu"
                  autoComplete="username"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-9 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                <XCircle size={13} className="flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !email.trim() || !password}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-sm transition-all"
            >
              {submitting ? <RefreshCw size={14} className="animate-spin" /> : <LogIn size={14} />}
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-indigo-200/70 mt-5">
          Access is restricted to authorized department staff.
        </p>
      </div>
    </div>
  );
}
