import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePolling } from '../hooks/usePolling';
import { StatusBadge } from '../components/StatusBadge';
import * as api from '../lib/api';
import { ArrowLeft, RotateCcw, XCircle, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { formatRelativeTime, formatDuration } from '../lib/utils';

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [actionMsg, setActionMsg] = useState('');

  const fetchJob = useCallback(async () => {
    const res = await api.getJob(id!);
    return res.data.data;
  }, [id]);

  const { data: job, loading, refresh } = usePolling(fetchJob, 3000);

  const handleRetry = async () => {
    await api.retryJob(id!);
    setActionMsg('Job requeued for retry');
    refresh();
    setTimeout(() => setActionMsg(''), 3000);
  };

  const handleCancel = async () => {
    await api.cancelJob(id!);
    setActionMsg('Job cancelled');
    refresh();
    setTimeout(() => setActionMsg(''), 3000);
  };

  if (loading && !job) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="w-6 h-6 border-2 border-textMuted/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!job) return <div className="p-8 text-textMuted">Job not found.</div>;

  const canRetry = ['FAILED', 'DEAD_LETTER'].includes(job.status);
  const canCancel = !['COMPLETED', 'FAILED', 'DEAD_LETTER', 'CANCELLED'].includes(job.status);

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/jobs')} className="btn btn-secondary p-2 mt-0.5">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-white font-mono">{job.id}</h1>
            <StatusBadge status={job.status} />
          </div>
          <p className="text-textMuted text-sm mt-1">{job.type} job · Created {formatRelativeTime(job.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          {canRetry && (
            <button onClick={handleRetry} className="btn btn-primary gap-2">
              <RotateCcw size={14} /> Retry
            </button>
          )}
          {canCancel && (
            <button onClick={handleCancel} className="btn btn-danger gap-2">
              <XCircle size={14} /> Cancel
            </button>
          )}
        </div>
      </div>

      {actionMsg && (
        <div className="bg-success/10 border border-success/30 text-success text-sm px-4 py-3 rounded-lg">
          {actionMsg}
        </div>
      )}

      {/* Timeline */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card text-center">
          <Clock size={20} className="text-textMuted mx-auto mb-1" />
          <p className="text-xs text-textMuted">Created</p>
          <p className="text-sm font-semibold text-white mt-0.5">{new Date(job.createdAt).toLocaleString()}</p>
        </div>
        <div className="card text-center">
          <CheckCircle size={20} className="text-textMuted mx-auto mb-1" />
          <p className="text-xs text-textMuted">Started</p>
          <p className="text-sm font-semibold text-white mt-0.5">{job.startedAt ? new Date(job.startedAt).toLocaleString() : '—'}</p>
        </div>
        <div className="card text-center">
          <AlertCircle size={20} className="text-textMuted mx-auto mb-1" />
          <p className="text-xs text-textMuted">Completed</p>
          <p className="text-sm font-semibold text-white mt-0.5">{job.completedAt ? new Date(job.completedAt).toLocaleString() : '—'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payload */}
        <div className="card">
          <h2 className="text-sm font-semibold text-textMuted uppercase tracking-wider mb-3">Payload</h2>
          <pre className="text-xs text-slate-300 bg-slate-900 rounded-lg p-4 overflow-auto max-h-48 font-mono">
            {JSON.stringify(job.payload, null, 2)}
          </pre>
        </div>

        {/* Metadata */}
        <div className="card">
          <h2 className="text-sm font-semibold text-textMuted uppercase tracking-wider mb-3">Metadata</h2>
          <div className="space-y-2 text-sm">
            {[
              ['Queue ID', job.queueId],
              ['Attempts', `${job.attemptCount} / ${job.maxAttempts}`],
              ['Priority', job.priority],
              ['Idempotency Key', job.idempotencyKey || '—'],
              ['Depends On', job.dependsOnJobId ? job.dependsOnJobId.slice(0, 16) + '…' : '—'],
              ['Worker', job.claimedByWorkerId ? job.claimedByWorkerId.slice(0, 16) + '…' : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-textMuted">{k}</span>
                <span className="text-white font-mono text-xs">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Executions */}
      {job.executions?.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-textMuted uppercase tracking-wider mb-4">Execution History</h2>
          <div className="space-y-3">
            {job.executions.map((exec: any) => (
              <div key={exec.id} className="bg-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">Attempt #{exec.attemptNumber}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-textMuted">{formatDuration(exec.durationMs)}</span>
                    <StatusBadge status={exec.status} />
                  </div>
                </div>
                {exec.errorMessage && (
                  <p className="text-xs text-danger font-mono bg-danger/10 rounded p-2 mt-2">{exec.errorMessage}</p>
                )}
                {exec.result && (
                  <pre className="text-xs text-slate-300 bg-slate-900 rounded p-2 mt-2 font-mono overflow-auto max-h-24">
                    {JSON.stringify(exec.result, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs */}
      {job.logs?.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-textMuted uppercase tracking-wider mb-4">Logs</h2>
          <div className="bg-slate-900 rounded-lg p-4 space-y-1.5 max-h-64 overflow-y-auto font-mono">
            {job.logs.map((log: any) => (
              <div key={log.id} className="flex items-start gap-3 text-xs">
                <span className="text-textMuted flex-shrink-0">{new Date(log.createdAt).toLocaleTimeString()}</span>
                <span className={`flex-shrink-0 font-semibold ${
                  log.level === 'ERROR' ? 'text-danger' :
                  log.level === 'WARN' ? 'text-warning' :
                  'text-emerald-400'
                }`}>[{log.level}]</span>
                <span className="text-slate-300">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
