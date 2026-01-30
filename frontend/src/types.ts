// Shared types for StoryDream frontend

export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;
  gitRepoPath: string;
  currentCommitSha: string;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface ChatMessage {
  id?: string;
  projectId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

// Render types
export interface RenderJob {
  renderId: string;
  projectId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  outputUrl?: string;
  error?: string;
  progress?: number;
}

export interface RenderJobRequest {
  compositionId?: string;
  format?: 'mp4' | 'webm';
}
