import React, { useState } from 'react';
import { Database, AlertCircle, Key, UserPlus, LogIn, ChevronRight } from 'lucide-react';
import { User } from '../types';

interface AuthScreenProps {
  onLoginSuccess: (user: User) => void;
}

export default function AuthScreen({ onLoginSuccess }: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!username.trim() || !password) {
      setErrorMessage('Please fill in all the required fields.');
      return;
    }

    setIsLoading(true);
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      let data;
      try {
        const text = await response.text();
        const trimmed = text.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          data = JSON.parse(trimmed);
        } else {
          data = { error: text || `Server error (Status ${response.status})` };
        }
      } catch (e) {
        data = { error: 'Authentication service returned an unexpected response format.' };
      }

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed. Please verify credentials.');
      }

      if (isLogin) {
        localStorage.setItem('reconciliation_user', JSON.stringify(data.user));
        onLoginSuccess(data.user);
      } else {
        setSuccessMessage('Registration completed! You can now log in.');
        setIsLogin(true);
        setPassword('');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'System error. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#120d1a] px-4 py-12 relative overflow-hidden font-sans">
      {/* Decorative Blur Accents */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] translate-x-1/2 translate-y-1/2 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

      <div className="w-full max-w-md glass-window rounded-2xl p-8 relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-tr from-emerald-500 via-emerald-600 to-teal-600 rounded-xl flex items-center justify-center font-black text-white text-2xl shadow-lg ring-4 ring-emerald-950/40 mb-3">
            DR
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
            DataRecon Workspace
          </h2>
          <p className="text-sm text-slate-400 mt-2.5 text-center">
            {isLogin 
              ? 'Sign in to access your audit & data reconciliation workspace' 
              : 'Create a free workspace with up to 10 free trial runs'}
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-950/30 border border-red-900/40 text-red-300 rounded-xl text-sm flex gap-3 items-start backdrop-blur-md">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-450" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-950/30 border border-emerald-900/40 text-emerald-300 rounded-xl text-sm flex gap-3 items-start backdrop-blur-md">
            <div className="w-5 h-5 shrink-0 rounded-full bg-emerald-550/20 text-emerald-400 flex items-center justify-center text-xs font-bold font-mono">
              ✓
            </div>
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-xs font-semibold text-slate-300 tracking-wide uppercase mb-1.5 block">
              Username ID
            </label>
            <input
              type="text"
              required
              disabled={isLoading}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username ID"
              className="w-full glass-input text-white placeholder-slate-500 text-sm py-2.5 px-4 rounded-xl transition outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 tracking-wide uppercase mb-1.5 block">
              Password
            </label>
            <input
              type="password"
              required
              disabled={isLoading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full glass-input text-white placeholder-slate-500 text-sm py-2.5 px-4 rounded-xl transition outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full glass-button-primary py-3 rounded-xl flex items-center justify-center gap-2 mt-2 cursor-pointer text-sm font-bold tracking-wide"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isLogin ? (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign In Workspace</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Create Free Account</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 text-center">
          <button
            disabled={isLoading}
            onClick={() => {
              setIsLogin(!isLogin);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className="text-sm font-medium text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
          >
            {isLogin 
              ? "Don't have an account? Sign up free" 
              : 'Already registered? Sign in here'}
          </button>
        </div>

        <div className="mt-6 flex justify-center text-[10px] text-slate-500 gap-1.5 items-center font-mono uppercase tracking-wider">
          <Database className="w-3 h-3 text-emerald-500" />
          <span>Local Trial Cap: 10 works</span>
        </div>
      </div>
    </div>
  );
}
