// Shared types for StoryDream backend

export interface ImageAttachment {
  type: 'image';
  data: string;      // base64 encoded (without data URI prefix)
  mediaType: string; // 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  name?: string;     // original filename for display
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;

  // Git state reference
  gitRepoPath: string;
  currentCommitSha: string;

  // Agent session persistence
  agentSessionId?: string;

  // Metadata
  thumbnailUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  lastOpenedAt: Date;

  // Video settings
  videoSettings?: VideoSettings;
}

export interface VideoSettings {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: ImageAttachment[];
  actions?: AgentAction[];
  createdAt: Date;
}

export interface AgentAction {
  type: 'file_edit' | 'file_create' | 'file_delete' | 'command_run';
  filePath?: string;
  summary: string;
  commitSha?: string;
}

export interface Session {
  id: string;
  projectId: string;
  containerId: string;
  containerName: string;
  previewPort: number;
  agentPort: number;
  createdAt: Date;
}

// API request/response types
export interface CreateProjectRequest {
  name: string;
  description?: string;
  userId?: string; // Optional for now, will be from auth later
}

export interface CreateProjectResponse {
  project: Project;
}

export interface GetProjectResponse {
  project: Project;
  messages: ChatMessage[];
}
