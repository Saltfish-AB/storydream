import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import { getProject } from '../api';
import { Chat } from './Chat';
import { VideoPreview } from './VideoPreview';
import { RenderButton } from './RenderButton';
import type { Project, ChatMessage } from '../types';

export function ProjectWorkspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [loadingProject, setLoadingProject] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load project data
  useEffect(() => {
    if (!projectId) return;

    async function loadProject() {
      try {
        setLoadingProject(true);
        const data = await getProject(projectId!);
        setProject(data.project);
        setInitialMessages(data.messages);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project');
      } finally {
        setLoadingProject(false);
      }
    }

    loadProject();
  }, [projectId]);

  const { isConnected, isSessionActive, isLoading, previewUrl, messages, startSession, sendMessage, subscribeToRenderEvents } = useWebSocket({
    projectId,
    initialMessages,
  });

  // Auto-start session when project is loaded and connected
  useEffect(() => {
    if (!loadingProject && project && isConnected && !isSessionActive && !isLoading) {
      startSession();
    }
  }, [loadingProject, project, isConnected, isSessionActive, isLoading, startSession]);

  if (loadingProject) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-zinc-400">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-red-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl text-white mb-2">Failed to load project</h2>
          <p className="text-zinc-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/projects')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-4 px-4 py-2 border-b"
        style={{ borderColor: 'var(--glass-border)', background: 'var(--bg-secondary)' }}
      >
        <button
          onClick={() => navigate('/projects')}
          className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-white font-medium">{project?.name || 'Untitled Project'}</h1>
          <p className="text-xs text-zinc-500">
            {isSessionActive ? 'Session active' : isLoading ? 'Starting session...' : 'Connecting...'}
          </p>
        </div>
        {projectId && isSessionActive && (
          <RenderButton projectId={projectId} subscribeToRenderEvents={subscribeToRenderEvents} />
        )}
        {!isConnected && <span className="text-xs text-yellow-500">Connecting to server...</span>}
      </div>

      {/* Main content */}
      <div className="flex-1 flex p-3 gap-3 min-h-0">
        {/* Chat Panel */}
        <div
          className="w-[380px] h-full flex-shrink-0 rounded-2xl overflow-hidden"
          style={{
            border: '1px solid var(--glass-border)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          }}
        >
          <Chat messages={messages} isLoading={isLoading} onSendMessage={sendMessage} />
        </div>

        {/* Video Preview */}
        <div className="flex-1 min-w-0 rounded-2xl overflow-hidden">
          <VideoPreview previewUrl={previewUrl} isLoading={isLoading && !previewUrl} />
        </div>
      </div>
    </div>
  );
}
