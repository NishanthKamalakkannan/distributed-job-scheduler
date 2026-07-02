import { useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { useNavigate } from 'react-router-dom';
import * as api from '../lib/api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  Briefcase, CheckCircle, Cpu, Activity, Zap
} from 'lucide-react';
import { formatRelativeTime } from '../lib/utils';

const PIE_COLORS = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function DashboardPage() {
  const navigate = useNavigate();

  const fetchDashboard = useCallback(async () => {
    const activeProjectId = localStorage.getItem('activeProjectId') || undefined;
    const [jobsRes, workersRes, queuesRes] = await Promise.all([
      api.getJobs({ pageSize: 100, page: 1, projectId: activeProjectId }),
      api.getWorkers(),
      api.getQueues(activeProjectId),
    ]);
    return {
      jobs: jobsRes.data.data as any[],
      workers: workersRes.data.data as any[],
      queues: queuesRes.data.data as any[],
      total: jobsRes.data.meta?.total,
    };
  }, []);

  const { data, loading } = usePolling(fetchDashboard, 3000);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-textMuted">
          <span className="w-6 h-6 border-2 border-textMuted/30 border-t-primary rounded-full animate-spin" />
          Loading dashboard...
        </div>
      </div>
    );
  }

  const { jobs, workers, queues } = data;

  // Aggregate counts
  const statusCounts = jobs.reduce((acc: any, j: any) => {
    acc[j.status] = (acc[j.status] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  const totalCompleted = statusCounts['COMPLETED'] || 0;
  const totalRunning = statusCounts['RUNNING'] || 0;
  const onlineWorkers = workers.filter((w: any) => w.status === 'ONLINE').length;

  // Build throughput chart: bucket recent jobs by updatedAt for the last 60 seconds (5s buckets)
  const now = Date.now();
  const buckets: Record<number, number> = {};
  for (let i = 11; i >= 0; i--) {
    const bucketTime = Math.floor((now - i * 5000) / 5000) * 5000;
    buckets[bucketTime] = 0;
  }
  
  jobs
    .filter((j: any) => j.status === 'COMPLETED' && j.updatedAt)
    .forEach((j: any) => {
      const time = new Date(j.updatedAt).getTime();
      const bucketTime = Math.floor(time / 5000) * 5000;
      if (bucketTime in buckets) buckets[bucketTime]++;
    });

  const throughputData = Object.entries(buckets).map(([timeMs, count]) => {
    const d = new Date(parseInt(timeMs, 10));
    return {
      timeLabel: `:${String(d.getSeconds()).padStart(2, '0')}`,
      completed: count,
    };
  });

  const handleSimulate = async () => {
    try {
      await api.simulateTraffic();
      // It will auto-refresh in 3s
    } catch (err) {
      console.error(err);
    }
  };

  const activeProjectName = localStorage.getItem('activeProjectName');

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-textMuted mt-1">
            {activeProjectName 
              ? `Project: ${activeProjectName} · Auto-refreshes every 3s` 
              : 'System overview — auto-refreshes every 3s'}
          </p>
        </div>
        <button onClick={handleSimulate} className="btn bg-indigo-600 hover:bg-indigo-500 text-white gap-2 shadow-lg shadow-indigo-500/20">
          <Zap size={18} />
          Simulate Traffic
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Jobs" value={data.total} icon={<Briefcase size={22} />} />
        <StatCard title="Completed" value={totalCompleted} icon={<CheckCircle size={22} />} color="text-success" />
        <StatCard title="Running" value={totalRunning} icon={<Activity size={22} />} color="text-warning" />
        <StatCard title="Online Workers" value={onlineWorkers} icon={<Cpu size={22} />} color="text-primary" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Throughput area chart */}
        <div className="card xl:col-span-2">
          <h2 className="text-sm font-semibold text-textMuted uppercase tracking-wider mb-4">Jobs Completed (Last 60 Seconds)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={throughputData}>
              <defs>
                <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="timeLabel" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: '#172033', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc' }} />
              <Area type="monotone" dataKey="completed" stroke="#3b82f6" fill="url(#colorCompleted)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Status pie chart */}
        <div className="card">
          <h2 className="text-sm font-semibold text-textMuted uppercase tracking-wider mb-4">Job Status Breakdown</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#172033', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc' }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Queues + Recent Jobs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Queues health */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-textMuted uppercase tracking-wider">Queue Health</h2>
            <button onClick={() => navigate('/queues')} className="text-xs text-primary hover:underline">View all →</button>
          </div>
          <div className="space-y-3">
            {queues.slice(0, 5).map((q: any) => (
              <div key={q.id} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg hover:bg-slate-700 cursor-pointer transition-colors" onClick={() => navigate('/queues')}>
                <div>
                  <p className="text-sm font-medium text-white">{q.name}</p>
                  <p className="text-xs text-textMuted">Concurrency: {q.concurrencyLimit}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${q.isPaused ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                  {q.isPaused ? 'Paused' : 'Active'}
                </span>
              </div>
            ))}
            {queues.length === 0 && <p className="text-textMuted text-sm text-center py-4">No queues found</p>}
          </div>
        </div>

        {/* Recent jobs */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-textMuted uppercase tracking-wider">Recent Jobs</h2>
            <button onClick={() => navigate('/jobs')} className="text-xs text-primary hover:underline">View all →</button>
          </div>
          <div className="space-y-3">
            {jobs.slice(0, 5).map((j: any) => (
              <div key={j.id} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg hover:bg-slate-700 cursor-pointer transition-colors" onClick={() => navigate(`/jobs/${j.id}`)}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate font-mono">{j.id.slice(0, 12)}…</p>
                  <p className="text-xs text-textMuted">{j.type} · {formatRelativeTime(j.createdAt)}</p>
                </div>
                <StatusBadge status={j.status} />
              </div>
            ))}
            {jobs.length === 0 && <p className="text-textMuted text-sm text-center py-4">No jobs found</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
