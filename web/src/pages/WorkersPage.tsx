import { useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import * as api from '../lib/api';
import { WORKER_STATUS_COLORS, formatRelativeTime } from '../lib/utils';
import { Cpu, Activity } from 'lucide-react';

export default function WorkersPage() {
  const fetchWorkers = useCallback(async () => {
    const res = await api.getWorkers();
    return res.data.data as any[];
  }, []);

  const { data: workers, loading } = usePolling(fetchWorkers, 3000);

  if (loading || !workers) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="w-6 h-6 border-2 border-textMuted/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const online = workers.filter(w => w.status === 'ONLINE').length;
  const offline = workers.filter(w => w.status === 'OFFLINE').length;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Workers</h1>
        <p className="text-textMuted mt-1">
          <span className="text-emerald-400 font-medium">{online} online</span>
          {offline > 0 && <span className="text-slate-400"> · {offline} offline</span>}
        </p>
      </div>

      <div className="grid gap-4">
        {workers.map((w: any) => (
          <div key={w.id} className="card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${w.status === 'ONLINE' ? 'bg-emerald-500/20' : 'bg-slate-700'}`}>
                  <Cpu size={18} className={w.status === 'ONLINE' ? 'text-emerald-400' : 'text-textMuted'} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{w.hostname}</h3>
                  <p className="text-xs text-textMuted font-mono">{w.id.slice(0, 16)}…</p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${WORKER_STATUS_COLORS[w.status]}`}>
                {w.status}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-700">
              <div>
                <p className="text-xs text-textMuted">Concurrency</p>
                <p className="text-sm font-semibold text-white mt-0.5">{w.concurrency}</p>
              </div>
              <div>
                <p className="text-xs text-textMuted">Last Heartbeat</p>
                <p className="text-sm font-semibold text-white mt-0.5">{formatRelativeTime(w.lastSeenAt)}</p>
              </div>
              <div>
                <p className="text-xs text-textMuted">Started</p>
                <p className="text-sm font-semibold text-white mt-0.5">{formatRelativeTime(w.startedAt)}</p>
              </div>
            </div>

            {/* Pulse indicator for online workers */}
            {w.status === 'ONLINE' && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-700">
                <Activity size={14} className="text-emerald-400" />
                <span className="text-xs text-emerald-400 font-medium">Heartbeat active</span>
                <span className="relative flex h-2 w-2 ml-auto">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              </div>
            )}
          </div>
        ))}

        {workers.length === 0 && (
          <div className="card text-center py-16">
            <Cpu size={40} className="text-textMuted mx-auto mb-3" />
            <p className="text-textMuted">No workers registered yet. Start the worker process to see it here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
