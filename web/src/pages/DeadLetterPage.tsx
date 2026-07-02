import { useCallback, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { StatusBadge } from '../components/StatusBadge';
import * as api from '../lib/api';
import { SkullIcon, RotateCcw } from 'lucide-react';
import { formatRelativeTime } from '../lib/utils';

export default function DeadLetterPage() {
  const [retrying, setRetrying] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const fetchDLQ = useCallback(async () => {
    const res = await api.getDeadLetterJobs({ page: 1, pageSize: 50 });
    return res.data;
  }, []);

  const { data, loading, refresh } = usePolling(fetchDLQ, 5000);

  const handleRetry = async (id: string) => {
    setRetrying(id);
    try {
      await api.retryDeadLetterJob(id);
      setMsg('Job requeued for processing');
      refresh();
      setTimeout(() => setMsg(''), 3000);
    } finally {
      setRetrying(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="w-6 h-6 border-2 border-textMuted/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const items = data?.data || [];

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dead Letter Queue</h1>
        <p className="text-textMuted mt-1">{items.length} permanently failed job{items.length !== 1 ? 's' : ''}</p>
      </div>

      {msg && (
        <div className="bg-success/10 border border-success/30 text-success text-sm px-4 py-3 rounded-lg">
          ✓ {msg}
        </div>
      )}

      <div className="space-y-4">
        {items.map((dlq: any) => (
          <div key={dlq.id} className="card border-rose-500/20 hover:border-rose-500/40 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <SkullIcon size={16} className="text-rose-400 flex-shrink-0" />
                  <p className="font-mono text-sm text-white truncate">{dlq.jobId}</p>
                  <StatusBadge status="DEAD_LETTER" />
                </div>
                <p className="text-sm text-danger/80 bg-danger/5 border border-danger/10 rounded px-3 py-2 font-mono">
                  {dlq.reason}
                </p>
              </div>
              <button
                onClick={() => handleRetry(dlq.id)}
                disabled={retrying === dlq.id}
                className="btn btn-primary gap-2 flex-shrink-0"
              >
                {retrying === dlq.id ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <RotateCcw size={14} />
                )}
                Retry
              </button>
            </div>

            <div className="flex gap-6 mt-4 pt-4 border-t border-slate-700 text-xs text-textMuted">
              <span>Attempts: <span className="text-white font-semibold">{dlq.attemptCount}</span></span>
              <span>Failed: <span className="text-white font-semibold">{formatRelativeTime(dlq.failedAt)}</span></span>
              {dlq.reprocessedAt && (
                <span>Last retry: <span className="text-white font-semibold">{formatRelativeTime(dlq.reprocessedAt)}</span></span>
              )}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="card text-center py-16">
            <SkullIcon size={40} className="text-textMuted mx-auto mb-3" />
            <p className="text-textMuted">No dead letter jobs. Everything is running smoothly! 🎉</p>
          </div>
        )}
      </div>
    </div>
  );
}
