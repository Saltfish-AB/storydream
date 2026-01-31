// API client for StoryDream backend

import type { Project, ChatMessage, CreateProjectRequest, RenderJob, RenderJobRequest } from './types';

// Use relative URL - vite proxy handles /api in dev, nginx in production
const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Projects

export async function listProjects(): Promise<Project[]> {
  const data = await fetchApi<{ projects: Project[] }>('/projects');
  return data.projects;
}

export async function createProject(request: CreateProjectRequest): Promise<Project> {
  const data = await fetchApi<{ project: Project }>('/projects', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return data.project;
}

export async function getProject(projectId: string): Promise<{ project: Project; messages: ChatMessage[] }> {
  return fetchApi(`/projects/${projectId}`);
}

export async function updateProject(projectId: string, updates: Partial<Pick<Project, 'name' | 'description'>>): Promise<void> {
  await fetchApi(`/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  await fetchApi(`/projects/${projectId}`, {
    method: 'DELETE',
  });
}

// Messages

export async function getMessages(projectId: string): Promise<ChatMessage[]> {
  const data = await fetchApi<{ messages: ChatMessage[] }>(`/projects/${projectId}/messages`);
  return data.messages;
}

// Renders

export async function createRender(projectId: string, options?: RenderJobRequest): Promise<RenderJob> {
  return fetchApi(`/projects/${projectId}/render`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
}

export async function getProjectRenders(projectId: string): Promise<RenderJob[]> {
  const data = await fetchApi<{ renders: RenderJob[] }>(`/projects/${projectId}/renders`);
  return data.renders;
}

export async function getRender(renderId: string): Promise<RenderJob> {
  return fetchApi(`/renders/${renderId}`);
}

export async function cancelRender(renderId: string): Promise<void> {
  await fetchApi(`/renders/${renderId}`, {
    method: 'DELETE',
  });
}
