import { useCallback, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import * as api from '../lib/api';
import { Folder, Plus, Check, RefreshCw } from 'lucide-react';

export default function ProjectsPage() {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    localStorage.getItem('activeProjectId')
  );

  const fetchProjects = useCallback(async () => {
    const res = await api.getProjects();
    return res.data.data as any[];
  }, []);

  const { data, loading, refresh } = usePolling(fetchProjects, 4000);
  const projects = data || [];

  const handleSelect = (project: any) => {
    if (activeProjectId === project.id) {
      localStorage.removeItem('activeProjectId');
      localStorage.removeItem('activeProjectName');
      setActiveProjectId(null);
    } else {
      localStorage.setItem('activeProjectId', project.id);
      localStorage.setItem('activeProjectName', project.name);
      setActiveProjectId(project.id);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projects[0]?.organizationId) return; // Fallback
    try {
      await api.createProject(name, projects[0].organizationId);
      setName('');
      setCreating(false);
      refresh();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading && projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="w-6 h-6 border-2 border-textMuted/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-textMuted mt-1">
            {activeProjectId 
              ? `Currently scoped to project: ${localStorage.getItem('activeProjectName')}` 
              : 'Showing all projects'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={refresh} className="btn btn-secondary gap-2">
            <RefreshCw size={15} /> Refresh
          </button>
          <button onClick={() => setCreating(true)} className="btn btn-primary gap-2">
            <Plus size={15} /> New Project
          </button>
        </div>
      </div>

      {creating && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md">
            <h2 className="text-lg font-bold text-white mb-5">Create New Project</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-sm text-textMuted mb-1.5 block">Project Name</label>
                <input 
                  className="input" 
                  required 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="e.g. Production Pipeline" 
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn btn-primary flex-1">Create</button>
                <button type="button" onClick={() => setCreating(false)} className="btn btn-secondary flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((p: any) => {
          const isActive = activeProjectId === p.id;
          return (
            <div 
              key={p.id} 
              className={`card relative overflow-hidden transition-all duration-200 border ${
                isActive ? 'border-primary shadow-lg shadow-primary/10' : 'border-slate-700 hover:border-slate-600'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="p-2 rounded-lg bg-slate-800 text-primary">
                  <Folder size={20} />
                </div>
                <button 
                  onClick={() => handleSelect(p)} 
                  className={`btn text-xs px-3 py-1.5 gap-1.5 ${
                    isActive ? 'btn-primary' : 'btn-secondary'
                  }`}
                >
                  {isActive && <Check size={12} />}
                  {isActive ? 'Active' : 'Select'}
                </button>
              </div>

              <div className="mt-4">
                <h3 className="text-lg font-semibold text-white truncate">{p.name}</h3>
                <p className="text-xs text-textMuted mt-1">Org: {p.organization?.name || 'Default'}</p>
              </div>

              <div className="flex gap-6 mt-6 pt-4 border-t border-slate-750 text-xs text-textMuted">
                <div>
                  <p>Queues</p>
                  <p className="text-sm font-semibold text-white mt-0.5">{p._count?.queues ?? 0}</p>
                </div>
                <div>
                  <p>Created</p>
                  <p className="text-sm font-semibold text-white mt-0.5">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
