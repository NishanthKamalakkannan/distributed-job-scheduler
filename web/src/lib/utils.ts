import { clsx } from 'clsx';

export function cn(...classes: (string | undefined | null | false)[]) {
  return clsx(classes);
}

export const STATUS_COLORS: Record<string, string> = {
  QUEUED:      'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  SCHEDULED:   'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  CLAIMED:     'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
  RUNNING:     'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  COMPLETED:   'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  FAILED:      'bg-red-500/20 text-red-400 border border-red-500/30',
  RETRYING:    'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  DEAD_LETTER: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
  CANCELLED:   'bg-slate-500/20 text-slate-400 border border-slate-500/30',
};

export const WORKER_STATUS_COLORS: Record<string, string> = {
  ONLINE:   'bg-emerald-500/20 text-emerald-400',
  OFFLINE:  'bg-slate-500/20 text-slate-400',
  DRAINING: 'bg-amber-500/20 text-amber-400',
};

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function formatDuration(ms?: number | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
