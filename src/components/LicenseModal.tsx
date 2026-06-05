import React, { useState, useEffect } from 'react';
import { Key, RotateCcw, ShieldCheck, AlertCircle, Calendar, Users, HelpCircle, ClipboardCheck, Sparkles } from 'lucide-react';
import { User, LicenseKey } from '../types';

interface LicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onUserUpdate: (updatedUser: User) => void;
}

export default function LicenseModal({ isOpen, onClose, currentUser, onUserUpdate }: LicenseModalProps) {
  const [activationKey, setActivationKey] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationSuccess, setActivationSuccess] = useState<string | null>(null);

  // Admin Section state
  const [adminKeys, setAdminKeys] = useState<LicenseKey[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchAdminKeys();
    }
  }, [isOpen]);

  const fetchAdminKeys = async () => {
    try {
      const response = await fetch('/api/admin/keys');
      if (response.ok) {
        let data;
        try {
          const text = await response.text();
          const trimmed = text.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            data = JSON.parse(trimmed);
          }
        } catch (e) {
          console.warn('Failed to parse admin keys JSON response:', e);
        }
        if (Array.isArray(data)) {
          setAdminKeys(data);
        }
      }
    } catch (err) {
      console.error('Failed to load admin keys:', err);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationKey.trim()) return;

    setActivationError(null);
    setActivationSuccess(null);
    setIsActivating(true);

    try {
      const response = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': currentUser.username,
        },
        body: JSON.stringify({ licenseKey: activationKey.trim() }),
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
        data = { error: 'Licensing service returned an unexpected response format.' };
      }

      if (!response.ok) {
        throw new Error(data.error || 'Activation failed. Please check the registration key.');
      }

      setActivationSuccess(data.message);
      onUserUpdate(data.user);
      setActivationKey('');
      fetchAdminKeys();
    } catch (err: any) {
      setActivationError(err.message);
    } finally {
      setIsActivating(false);
    }
  };

  const handleGenerateKey = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/admin/keys/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ daysCount: 365 }),
      });

      if (response.ok) {
        fetchAdminKeys();
      }
    } catch (err) {
      console.error('Error generating key:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (keyVal: string) => {
    navigator.clipboard.writeText(keyVal);
    setCopiedKey(keyVal);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!isOpen) return null;

  const isExpired = currentUser.licenseExpiresAt 
    ? new Date(currentUser.licenseExpiresAt) < new Date() 
    : true;

  const trialProgressPercentage = Math.min((currentUser.worksCount / 10) * 105, 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-base leading-none">
              Account Registration & Licensing
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors cursor-pointer text-sm font-semibold uppercase tracking-wider"
          >
            Close
          </button>
        </div>

        {/* Content Panel (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Trial / License Current Status Card */}
          <div className="p-5 bg-slate-50 border border-slate-200/60 rounded-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                  Current Workspace Level
                </h4>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold font-sans text-slate-900">
                    {currentUser.username}
                  </span>
                  {!isExpired ? (
                    <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      Yearly Licensed (Active)
                    </span>
                  ) : (
                    <span className="text-xs bg-blue-100 text-blue-800 font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      Free Trial Mode
                    </span>
                  )}
                </div>
              </div>

              {!isExpired && currentUser.licenseExpiresAt && (
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg">
                  <Calendar className="w-4 h-4 text-emerald-500" />
                  <span>Expires: <b>{new Date(currentUser.licenseExpiresAt).toLocaleDateString()}</b></span>
                </div>
              )}
            </div>

            {/* Works Progress Bar */}
            <div className="mt-5 pt-4 border-t border-slate-200/60">
              <div className="flex justify-between items-center text-xs text-slate-500 font-semibold mb-2">
                <span>Free Trial Runs Complete</span>
                <span>{currentUser.worksCount} / 10 runs</span>
              </div>
              <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${currentUser.worksCount >= 10 ? 'bg-red-500' : 'bg-blue-600'}`}
                  style={{ width: `${trialProgressPercentage}%` }}
                />
              </div>
              {currentUser.worksCount >= 10 && isExpired && (
                <p className="text-[11px] text-red-500 font-medium mt-1.5 flex gap-1 items-center">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Trial usage has expired. Please enter an activation key to restore operations.
                </p>
              )}
            </div>
          </div>

          {/* Activation Key Entry Form */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-900 mb-2 flex gap-2 items-center">
              <Key className="w-4 h-4 text-blue-600" />
              Activate Yearly Registration
            </h4>
            <p className="text-xs text-slate-500 mb-4">
              Enter the register key shared by the administrator to authorize this application for 1 full year.
            </p>

            {activationError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex gap-2 items-center">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{activationError}</span>
              </div>
            )}

            {activationSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs flex gap-2 items-center">
                <div className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-[8px]">✓</div>
                <span>{activationSuccess}</span>
              </div>
            )}

            <form onSubmit={handleActivate} className="flex gap-3">
              <input
                type="text"
                required
                disabled={isActivating}
                value={activationKey}
                onChange={(e) => setActivationKey(e.target.value)}
                placeholder="RECON-XXXX-XXXX-XXXX"
                className="flex-1 bg-white border border-slate-300 focus:border-blue-600 px-4 py-2 text-sm rounded-lg outline-none uppercase font-mono tracking-wider placeholder-slate-400"
              />
              <button
                type="submit"
                disabled={isActivating || !activationKey.trim()}
                className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
              >
                {isActivating ? 'Verifying...' : 'Activate'}
              </button>
            </form>
          </div>

          {/* Admin Control Dashboard Console - Highlighted for User testing */}
          <div className="border border-indigo-100 bg-indigo-50/30 rounded-xl p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-1 text-[9px] bg-indigo-150 text-indigo-800 font-bold uppercase rounded-bl font-mono tracking-widest border-l border-b border-indigo-200">
              Admin Suite
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-2 flex gap-2 items-center">
              <Users className="w-4 h-4 text-indigo-600" />
              Register Key Generator & Perm Storage
            </h4>
            <p className="text-xs text-slate-500 mb-4">
              Since you are the app administrator, you can generate and permanently register yearly keys directly. Click below to add a key to PostgreSQL.
            </p>

            <button
              onClick={handleGenerateKey}
              disabled={isGenerating}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition shadow-sm mb-4 flex items-center gap-1.5 cursor-pointer"
            >
              {isGenerating ? (
                'Saving to storage...'
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate New Key (365 Days)</span>
                </>
              )}
            </button>

            {/* Keys Table */}
            <div className="border border-slate-200 rounded-lg bg-white overflow-hidden max-h-48 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold font-mono">
                    <th className="px-3 py-2">Generated Key (Postgres)</th>
                    <th className="px-3 py-2">Expire Date</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 h-full overflow-y-auto">
                  {adminKeys.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-400 italic">
                        No permanent keys registered in DB. Click generate to create one.
                      </td>
                    </tr>
                  ) : (
                    adminKeys.map((k) => (
                      <tr key={k.id} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2 font-mono font-bold text-slate-900 select-all">
                          {k.keyValue}
                        </td>
                        <td className="px-3 py-2 text-slate-500 font-mono">
                          {new Date(k.expiresAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2">
                          {k.isUsed ? (
                            <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider" title={`Used by ${k.usedBy}`}>
                              Consumed
                            </span>
                          ) : (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                              Unused
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => handleCopy(k.keyValue)}
                            className="text-blue-600 hover:text-blue-800 font-bold font-mono text-[11px] tracking-wide cursor-pointer flex items-center gap-1 ml-auto"
                          >
                            {copiedKey === k.keyValue ? (
                              <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              '[Copy Key]'
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
