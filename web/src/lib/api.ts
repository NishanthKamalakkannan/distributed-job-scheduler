import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// ─── Auth ────────────────────────────────────────────────────────────────────
export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password });

export const register = (email: string, password: string, name: string) =>
  api.post('/auth/register', { email, password, name });

// ─── Projects ────────────────────────────────────────────────────────────────
export const getProjects = () => api.get('/projects');

export const createProject = (name: string, organizationId: string) =>
  api.post('/projects', { name, organizationId });

// ─── Queues ──────────────────────────────────────────────────────────────────
export const getQueues = (projectId?: string) =>
  api.get('/queues', { params: { projectId } });

export const createQueue = (data: any) => api.post('/queues', data);

export const updateQueue = (id: string, data: any) =>
  api.patch(`/queues/${id}`, data);

export const pauseQueue = (id: string) => api.post(`/queues/${id}/pause`);

export const resumeQueue = (id: string) => api.post(`/queues/${id}/resume`);

export const getQueueStats = (id: string) => api.get(`/queues/${id}/stats`);

// ─── Jobs ────────────────────────────────────────────────────────────────────
export const getJobs = (params?: Record<string, any>) =>
  api.get('/jobs', { params });

export const getJob = (id: string) => api.get(`/jobs/${id}`);

export const createJob = (data: any) => api.post('/jobs', data);

export const retryJob = (id: string) => api.post(`/jobs/${id}/retry`);

export const cancelJob = (id: string) => api.post(`/jobs/${id}/cancel`);

export const simulateTraffic = () => api.post('/jobs/simulate');

// ─── Workers ─────────────────────────────────────────────────────────────────
export const getWorkers = () => api.get('/workers');

export const getWorkerHeartbeats = (id: string) =>
  api.get(`/workers/${id}/heartbeats`);

// ─── Dead Letter ─────────────────────────────────────────────────────────────
export const getDeadLetterJobs = (params?: Record<string, any>) =>
  api.get('/dead-letter-jobs', { params });

export const retryDeadLetterJob = (id: string) =>
  api.post(`/dead-letter-jobs/${id}/retry`);
