import { useCallback, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { StatusBadge } from '../components/StatusBadge';
import * as api from '../lib/api';
import { Pause, Play, Plus, Settings, RefreshCw } from 'lucide-react';

export default function QueuesPage() {
  const [creatingQueue, setCreatingQueue] = useState(false);
  const [newQueue, setNewQueue] = useState({ name: '', projectId: '' });
  const [statsMap, setStatsMap] = useState<Record<string, any>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchQueues = useCallback(async () => {
    const activeProjectId = localStorage.getItem('activeProjectId') || undefined;
    const [queuesRes, projectsRes] = await Promise.all([
      api.getQueues(activeProjectId),
      api.getProjects(),
    ]);
    return { queues: queuesRes.data.data as any[], projects: projectsRes.data.data as any[] };
  }, []);

  const { data, loading, refresh } = usePolling(fetchQueues, 3000);

  const loadStats = async (queueId: string) => {
    const res = await api.getQueueStats(queueId);
    setStatsMap(prev => ({ ...prev, [queueId]: res.data.data }));
  };

  const handlePauseToggle = async (q: any) => {
    setActionLoading(q.id);
    try {
      if (q.isPaused) await api.resumeQueue(q.id);
      else await api.pauseQueue(q.id);
      refresh();
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createQueue(newQueue);
    setCreatingQueue(false);
    setNewQueue({ name: '', projectId: '' });
    refresh();
  };

  const handleOpenCreateModal = () => {
    const activeId = localStorage.getItem('activeProjectId') || '';
    setNewQueue({ name: '', projectId: activeId });
    setCreatingQueue(true);
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="w-6 h-6 border-2 border-textMuted/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const { queues, projects } = data;
  const activeProjectName = localStorage.getItem('activeProjectName');

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Queues</h1>
          <p className="text-textMuted mt-1">
            {activeProjectName 
              ? `Project: ${activeProjectName} · ${queues.length} queue(s) found` 
              : `${queues.length} queue${queues.length !== 1 ? 's' : ''} configured`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={refresh} className="btn btn-secondary gap-2">
            <RefreshCw size={15} /> Refresh
          </button>
          <button onClick={handleOpenCreateModal} className="btn btn-primary gap-2">
            <Plus size={15} /> New Queue
          </button>
        </div>
      </div>

      {/* Create Queue Modal */}
      {creatingQueue && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md">
            <h2 className="text-lg font-bold text-white mb-5">Create New Queue</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-sm text-textMuted mb-1.5 block">Queue Name</label>
                <input className="input" required value={newQueue.name} onChange={e => setNewQueue(p => ({ ...p, name: e.target.value }))} placeholder="e.g. email-notifications" />
              </div>
              <div>
                <label className="text-sm text-textMuted mb-1.5 block">Project</label>
                <select className="input" required value={newQueue.projectId} onChange={e => setNewQueue(p => ({ ...p, projectId: e.target.value }))}>
                  <option value="">Select project…</option>
                  {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn btn-primary flex-1">Create</button>
                <button type="button" onClick={() => setCreatingQueue(false)} className="btn btn-secondary flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Queues Grid */}
      <div className="grid gap-4">
        {queues.map((q: any) => (
          <div key={q.id} className="card hover:border-slate-600 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-lg font-semibold text-white">{q.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${q.isPaused ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                    {q.isPaused ? '⏸ Paused' : '▶ Active'}
                  </span>
                </div>
                <p className="text-xs text-textMuted font-mono">{q.id}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => loadStats(q.id)}
                  className="btn btn-secondary text-xs px-3 py-1.5 gap-1"
                >
                  <Settings size={13} /> Stats
                </button>
                <button
                  onClick={() => handlePauseToggle(q)}
                  disabled={actionLoading === q.id}
                  className={`btn text-xs px-3 py-1.5 gap-1 ${q.isPaused ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {q.isPaused ? <Play size={13} /> : <Pause size={13} />}
                  {q.isPaused ? 'Resume' : 'Pause'}
                </button>
              </div>
            </div>

            {/* Meta */}
            <div className="flex gap-6 mt-4 pt-4 border-t border-slate-700">
              <div>
                <p className="text-xs text-textMuted">Concurrency</p>
                <p className="text-sm font-semibold text-white mt-0.5">{q.concurrencyLimit}</p>
              </div>
              <div>
                <p className="text-xs text-textMuted">Priority</p>
                <p className="text-sm font-semibold text-white mt-0.5">{q.defaultPriority}</p>
              </div>
              <div>
                <p className="text-xs text-textMuted">Created</p>
                <p className="text-sm font-semibold text-white mt-0.5">{new Date(q.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Stats Panel */}
            {statsMap[q.id] && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <p className="text-xs text-textMuted uppercase tracking-wider mb-3">Job Status Counts</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(statsMap[q.id]).map(([status, count]: any) => (
                    <div key={status} className="flex items-center gap-2">
                      <StatusBadge status={status} />
                      <span className="text-xs font-bold text-white">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {queues.length === 0 && (
          <div className="card text-center py-16">
            <p className="text-textMuted mb-2">No queues yet. Create one to get started.</p>
            <p className="text-xs text-textMuted mb-4 max-w-sm mx-auto">
              If you just seeded the database, your session token may be stale. Try logging out and back in.
            </p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setCreatingQueue(true)} className="btn btn-primary gap-2">
                <Plus size={15} /> Create Queue
              </button>
              <button 
                type="button"
                onClick={() => {
                  localStorage.removeItem('token');
                  window.location.href = '/login';
                }} 
                className="btn btn-secondary text-xs"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
