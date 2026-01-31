import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import { getProject } from '../api';
import { Chat } from './Chat';
import { VideoPreview } from './VideoPreview';
import { RenderButton } from './RenderButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ChevronLeft, Loader2, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <Card className="text-center max-w-md p-8">
          <div className="text-destructive mb-4">
            <AlertTriangle className="w-16 h-16 mx-auto" strokeWidth={1} />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Failed to load project</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => navigate('/projects')}>
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-muted/30">
      {/* Header */}
      <header className="flex items-center gap-4 px-4 py-3 border-b bg-background">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/projects')}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-foreground font-medium">{project?.name || 'Untitled Project'}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {isSessionActive ? (
              <Badge variant="secondary" className="text-xs font-normal">
                <Wifi className="w-3 h-3 mr-1" />
                Session active
              </Badge>
            ) : isLoading ? (
              <Badge variant="secondary" className="text-xs font-normal">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Starting session...
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                <WifiOff className="w-3 h-3 mr-1" />
                Connecting...
              </Badge>
            )}
          </div>
        </div>
        {projectId && isSessionActive && (
          <RenderButton projectId={projectId} subscribeToRenderEvents={subscribeToRenderEvents} />
        )}
        {!isConnected && (
          <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
            Connecting to server...
          </Badge>
        )}
      </header>

      {/* Main content */}
      <div className="flex-1 flex p-4 gap-4 min-h-0">
        {/* Chat Panel */}
        <Card className="w-[380px] h-full flex-shrink-0 overflow-hidden">
          <Chat messages={messages} isLoading={isLoading} onSendMessage={sendMessage} />
        </Card>

        {/* Video Preview */}
        <Card className="flex-1 min-w-0 overflow-hidden">
          <VideoPreview previewUrl={previewUrl} isLoading={isLoading && !previewUrl} />
        </Card>
      </div>
    </div>
  );
}
