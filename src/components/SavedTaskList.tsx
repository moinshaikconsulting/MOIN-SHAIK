import React from 'react';
import { Database, Trash2, Calendar, Clock, ArrowRight, AlertCircle } from 'lucide-react';
import { SavedTaskListItem } from '../types';

interface SavedTaskListProps {
  tasks: SavedTaskListItem[];
  onSelectTask: (taskId: number) => void;
  onDeleteTask: (taskId: number) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

export default function SavedTaskList({
  tasks,
  onSelectTask,
  onDeleteTask,
  isLoading,
  onRefresh
}: SavedTaskListProps) {
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDaysRemaining = (expireStr: string) => {
    const remaining = new Date(expireStr).getTime() - new Date().getTime();
    if (remaining <= 0) return 'Expired';
    const days = Math.ceil(remaining / (1000 * 60 * 60 * 24));
    return days === 1 ? '1 day remaining' : `${days} days remaining`;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mb-2"></div>
        <p className="text-sm font-medium">Fetching active database tasks...</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-6 shadow-xl text-white">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Database size={18} className="text-indigo-400" />
            Saved PostgreSQL Tables
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Table metadata and datasets are automatically dropped after 7 days
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="glass-button text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer"
        >
          Check & Refresh
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="border border-dashed border-white/10 bg-white/2 rounded-xl py-8 px-4 text-center">
          <AlertCircle size={32} className="text-slate-600 mx-auto mb-2.5" />
          <p className="text-sm font-semibold text-slate-350">No active tables saved</p>
          <p className="text-xs text-slate-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
            Upload files and choose the "Save & Proceed" flow to store datasets temporarily inside PostgreSQL.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
          {tasks.map((task) => {
            const isExpired = task.status === 'expired' || new Date(task.expiresAt) <= new Date();

            return (
              <div
                key={task.id}
                className={`group flex items-center justify-between p-4 rounded-xl border transition ${
                  isExpired
                    ? 'border-white/5 bg-slate-950/20 opacity-50'
                    : 'border-white/15 bg-white/3 hover:border-indigo-500/30 hover:bg-white/6'
                }`}
              >
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-bold text-sm text-slate-100 truncate block">
                      {task.taskName}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                        isExpired
                          ? 'bg-rose-950/40 text-rose-300 border border-rose-900/40'
                          : 'bg-indigo-950/40 text-indigo-300 border border-indigo-900/40'
                      }`}
                    >
                      {isExpired ? 'Expired' : 'Active'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 font-mono mb-2 truncate">
                    Table: {task.tableName}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                    <span className="flex items-center gap-1 bg-white/3 border border-white/5 px-2 py-0.5 rounded text-slate-300">
                      A: {task.fileAName}
                    </span>
                    <span className="flex items-center gap-1 bg-white/3 border border-white/5 px-2 py-0.5 rounded text-slate-300">
                      B: {task.fileBName}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-400 border-t border-white/5 pt-2">
                    <span className="flex items-center gap-1 text-slate-400">
                      <Calendar size={12} className="text-slate-500" />
                      {formatDate(task.createdAt)}
                    </span>
                    <span className="flex items-center gap-1 text-indigo-300 font-semibold">
                      <Clock size={12} className="text-indigo-400" />
                      {getDaysRemaining(task.expiresAt)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!isExpired && (
                    <button
                      onClick={() => onSelectTask(task.id)}
                      className="p-2 text-indigo-300 hover:text-white bg-indigo-950/40 hover:bg-indigo-600 border border-indigo-900/30 rounded-lg transition-all flex items-center justify-center cursor-pointer shadow-sm"
                      title="Load and reconcile"
                    >
                      <ArrowRight size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => onDeleteTask(task.id)}
                    className="p-2 text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-600 border border-rose-900/30 rounded-lg transition-all flex items-center justify-center cursor-pointer shadow-sm"
                    title="Drop database schema"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
