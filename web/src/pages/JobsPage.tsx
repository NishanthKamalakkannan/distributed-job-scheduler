import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePolling } from '../hooks/usePolling';
import { StatusBadge } from '../components/StatusBadge';
import * as api from '../lib/api';
import { Search, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { formatRelativeTime } from '../lib/utils';

const STATUS_FILTERS = ['', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD_LETTER', 'SCHEDULED', 'CANCELLED'];
const TYPE_FILTERS = ['', 'IMMEDIATE', 'DELAYED', 'SCHEDULED', 'RECURRING', 'BATCH'];

export default function JobsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const fetchJobs = useCallback(async () => {
    const activeProjectId = localStorage.getItem('activeProjectId');
    const params: any = { page, pageSize: 20 };
    if (activeProjectId) params.projectId = activeProjectId;
    if (statusFilter) params.status = statusFilter;
    if (typeFilter) params.type = typeFilter;
    const res = await api.getJobs(params);
    return res.data;
  }, [page, statusFilter, typeFilter]);

  const { data, loading, refresh } = usePolling(fetchJobs, 3000);

  const handleFilterChange = (setter: any) => (val: string) => {
    setter(val);
    setPage(1);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="w-6 h-6 border-2 border-textMuted/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const jobs = data?.data || [];
  const meta = data?.meta || { total: 0, page: 1, pageSize: 20, totalPages: 1 };
  const activeProjectName = localStorage.getItem('activeProjectName');

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Jobs</h1>
          <p className="text-textMuted mt-1">
            {activeProjectName 
              ? `Project: ${activeProjectName} · ${meta.total} job(s) found` 
              : `${meta.total} total jobs`}
          </p>
        </div>
        <button onClick={refresh} className="btn btn-secondary gap-2">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
          <select
            className="input pl-8 pr-4 w-44"
            value={statusFilter}
            onChange={e => handleFilterChange(setStatusFilter)(e.target.value)}
          >
            <option value="">All Statuses</option>
            {STATUS_FILTERS.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <select
          className="input w-40"
          value={typeFilter}
          onChange={e => handleFilterChange(setTypeFilter)(e.target.value)}
        >
          <option value="">All Types</option>
          {TYPE_FILTERS.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="px-6 py-4 text-left text-xs font-semibold text-textMuted uppercase tracking-wider">Job ID</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-textMuted uppercase tracking-wider">Queue</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-textMuted uppercase tracking-wider">Type</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-textMuted uppercase tracking-wider">Priority</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-textMuted uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-textMuted uppercase tracking-wider">Attempts</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-textMuted uppercase tracking-wider">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {jobs.map((j: any) => (
              <tr
                key={j.id}
                onClick={() => navigate(`/jobs/${j.id}`)}
                className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
              >
                <td className="px-6 py-4">
                  <p className="font-mono text-sm text-primary group-hover:underline">{j.id.slice(0, 16)}…</p>
                  {j.parentJobId && <p className="text-xs text-textMuted mt-0.5">Batch child</p>}
                </td>
                <td className="px-6 py-4 text-sm text-text font-medium">{j.queue?.name || 'default'}</td>
                <td className="px-6 py-4 text-sm text-textMuted">{j.type}</td>
                <td className="px-6 py-4 text-sm text-text font-mono">{j.priority}</td>
                <td className="px-6 py-4"><StatusBadge status={j.status} /></td>
                <td className="px-6 py-4 text-sm text-textMuted">{j.attemptCount}/{j.maxAttempts}</td>
                <td className="px-6 py-4 text-sm text-textMuted">{formatRelativeTime(j.createdAt)}</td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-16 text-center text-textMuted">
                  No jobs match the current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-textMuted">
            Page {meta.page} of {meta.totalPages} · {meta.total} results
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="btn btn-secondary px-3 py-2 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              disabled={page >= meta.totalPages}
              onClick={() => setPage(p => p + 1)}
              className="btn btn-secondary px-3 py-2 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
